import { expect, type Page } from '@playwright/test';
import { deflateSync } from 'node:zlib';
import type { Map as MapLibreMap } from 'maplibre-gl';

/**
 * A course, as much of it as the browser tests need to see.
 *
 * Structurally typed rather than importing `Course`: these files run in Node
 * and the shape has to survive `page.evaluate`'s serialisation anyway, so
 * declaring the fields actually read keeps a test failure pointing at the test.
 */
export interface TestCourse {
  features: {
    id: string;
    kind: string;
    geometry: { type: string; coordinates: unknown };
    /** Loosely typed here for the same reason it is in the document. */
    props: Record<string, string | number | boolean | undefined>;
  }[];
  holes: { id: string; teeIds: string[]; targetIds: string[] }[];
  pairs: { teeId: string; targetId: string; fairwayId: string | null }[];
  overlays: { hillshade: boolean; contours: boolean };
}

declare global {
  interface Window {
    hyzerlinesMap?: MapLibreMap;
    hyzerlinesStore?: {
      getSnapshot: () => { course: TestCourse; dirty: boolean };
      dispatch: (op: unknown) => void;
    };
  }
}

/**
 * The document itself, not what the map happens to have tiled.
 *
 * `querySourceFeatures` is the wrong tool for asking what the document
 * contains: it returns one copy of a feature per rendered tile and clips
 * geometry at tile boundaries, so a three-point fairway straddling a seam comes
 * back as two points. Use it only to prove something reached the map at all.
 */
export const course = (page: Page): Promise<TestCourse> =>
  page.evaluate(() => window.hyzerlinesStore!.getSnapshot().course);

/**
 * Shared setup for the browser tests.
 *
 * Every spec needs the same three things: a basemap that does not touch the
 * network, an editor past its first-run screen, and a way to click the canvas.
 * They were copied into each file, which meant five near-identical PNG encoders
 * and five `openEditor`s that had already begun to drift.
 */

const TILE = 256;

/**
 * A 256×256 truecolour PNG, encoded by hand.
 *
 * Hand-rolled because pulling in an image library to draw a checkerboard and a
 * gradient is not worth the dependency, and because both stubs below have to
 * produce exact bytes — a DEM tile's pixels *are* its elevations, so anything
 * that re-encodes or colour-manages them would quietly change the terrain.
 */
function encodePng(pixel: (x: number, y: number) => [number, number, number]): Buffer {
  const raw = Buffer.alloc((TILE * 3 + 1) * TILE);
  let o = 0;
  for (let y = 0; y < TILE; y++) {
    raw[o++] = 0; // filter byte: none
    for (let x = 0; x < TILE; x++) {
      const [r, g, b] = pixel(x, y);
      raw[o++] = r;
      raw[o++] = g;
      raw[o++] = b;
    }
  }
  const table = [...Array<number>(256)].map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer): number => {
    let c = 0xffffffff;
    for (const b of buf) c = table[(c ^ b) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer): Buffer => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(TILE, 0);
  ihdr.writeUInt32BE(TILE, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * A checkerboard, standing in for aerial imagery.
 *
 * Tiles are stubbed in-process rather than fetched: the tests must not depend
 * on Esri being up, and a green-grey check is enough for a screenshot to be
 * readable when one fails.
 */
export function fakeTile(): Buffer {
  return encodePng((x, y) =>
    ((x >> 5) + (y >> 5)) % 2 === 0 ? [0x2f, 0x5a, 0x33] : [0x25, 0x46, 0x2a],
  );
}

/**
 * A terrarium elevation tile: a hillside falling across the diagonal.
 *
 * Terrarium packs metres into RGB as `(R * 256 + G + B / 256) - 32768`, so a
 * ramp in `R * 256 + G` is a ramp in elevation. This one runs 0m to about 510m
 * corner to corner, which is enough relief that every contour interval in
 * `terrain.ts` produces lines at every zoom the tests use.
 *
 * A flat tile would be the wrong stub. It would satisfy "the layer is visible"
 * and prove nothing about whether the isoline generator ever ran, which is the
 * only interesting question — contours are computed in the browser rather than
 * fetched.
 */
export function fakeDemTile(): Buffer {
  return encodePng((x, y) => {
    const elevation = x + y;
    const packed = elevation + 32768;
    return [Math.floor(packed / 256), packed % 256, 0];
  });
}

export interface OpenOptions {
  /**
   * Where to put the camera before the test starts.
   *
   * Worth setting for anything that measures: at the default zoom a few hundred
   * canvas pixels span a continent, and a "hole" comes out four hundred
   * kilometres long.
   */
  center?: [number, number];
  zoom?: number;
}

export async function openEditor(page: Page, options: OpenOptions = {}): Promise<void> {
  const tile = fakeTile();
  await page.route('**://server.arcgisonline.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: tile }),
  );
  // Elevation too, for the same reason: no test should fail because AWS was
  // slow. Stubbed for every test rather than only the terrain ones, since the
  // overlays are off by default and nothing requests these until they are on.
  const dem = fakeDemTile();
  await page.route('**://s3.amazonaws.com/elevation-tiles-prod/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: dem }),
  );
  await page.goto('/');
  await page.locator('[data-hydrated="true"]').waitFor({ state: 'attached' });

  const skip = page.getByRole('button', { name: /Skip/ });
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await expect(skip).toBeHidden();

  if (options.center || options.zoom !== undefined) {
    const view = { center: options.center ?? [-93.1, 44.9], zoom: options.zoom ?? 16 };
    await page.evaluate((v) => window.hyzerlinesMap?.jumpTo(v), view);
  }
  await page.waitForTimeout(300);
}

/**
 * Open one of the course panel's collapsible sections.
 *
 * The panel folds now, and its sections start closed — everything they hold is
 * unmounted until opened, deliberately, so a folded switch is not still in the
 * tab order. Tests that reach for those controls have to open the section the
 * way a person would.
 *
 * Idempotent: calling it on an already-open section leaves it open, so a test
 * does not have to track which of its own steps opened what. Note that the
 * course panel's sections are a group — opening one closes the last — so a
 * test cannot have two of them open at once.
 */
export async function openSection(page: Page, title: string): Promise<void> {
  const header = page.getByRole('button', { name: title, exact: true });
  if ((await header.getAttribute('aria-expanded')) !== 'true') await header.click();
  await expect(header).toHaveAttribute('aria-expanded', 'true');
}

/**
 * Open the layers panel, which holds the basemap choice and the overlays.
 *
 * A popover rather than a menu now — you keep it open while flipping several
 * things and watching the map — so unlike the old menu it does not close when
 * you pick a basemap, and a test does not have to reopen it to read state back.
 *
 * Idempotent, so a test can call it without tracking what its own earlier steps
 * left open.
 */
export async function openLayers(page: Page): Promise<void> {
  const trigger = page.getByRole('button', { name: 'Layers' });
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click();
  await expect(page.getByRole('radiogroup', { name: 'Basemap' })).toBeVisible();
}

/** Choose a basemap by name, opening the layers panel if it is closed. */
export async function chooseBasemap(page: Page, name: string): Promise<void> {
  await openLayers(page);
  await page.getByRole('radio', { name: new RegExp(name) }).click();
}

/** Whether a map layer is currently drawn. Overlays install hidden. */
export const layerVisible = (page: Page, id: string): Promise<boolean> =>
  page.evaluate(
    (layerId) =>
      window.hyzerlinesMap!.getLayer(layerId) !== undefined &&
      window.hyzerlinesMap!.getLayoutProperty(layerId, 'visibility') !== 'none',
    id,
  );

/**
 * A labelled switch, and setting one.
 *
 * Every instant-effect toggle in the panels is a `Switch` now rather than a
 * checkbox: none of them wait for a Save, and a checkbox is the control that
 * promises one. It renders as `role="switch"`, so `getByRole('checkbox')` no
 * longer matches, and Playwright's `check`/`uncheck` refuse anything that is
 * not an input. `setSwitch` does what those did — click only when the state is
 * wrong — and asserts the result, so a test reads as the state it wanted
 * rather than as the gesture it made.
 */
export const switchControl = (page: Page, name: string) =>
  page.getByRole('switch', { name, exact: true });

export async function setSwitch(page: Page, name: string, on: boolean): Promise<void> {
  const control = switchControl(page, name);
  if ((await control.getAttribute('aria-checked')) !== String(on)) await control.click();
  await expect(control).toHaveAttribute('aria-checked', String(on));
}

/**
 * The tool rail, as a scope.
 *
 * Tool buttons are named for what they draw ("Target"), and so are controls
 * elsewhere that refer to the same things ("Select Target" in the hole
 * properties). Playwright matches accessible names as substrings by default, so
 * an unscoped `getByRole('button', { name: 'Target' })` starts resolving to two
 * elements the moment a hole is selected. Scoping means these tests fail for
 * real reasons rather than for naming collisions.
 */
export const rail = (page: Page) => page.getByRole('toolbar', { name: 'Tools' });

/**
 * Click a feature where it currently is.
 *
 * Fixed canvas coordinates only hold while the camera has not moved, and the
 * camera moves on its own now: selecting a hole in the list frames it. A test
 * that places a basket at (950, 500) and clicks there twenty lines later is
 * clicking wherever that pixel has since ended up.
 *
 * Projecting the feature's own position asks the map where the thing is at the
 * moment of the click, which is what a person does with their eyes.
 */
export async function clickFeature(page: Page, id: string): Promise<void> {
  const point = await page.evaluate((featureId) => {
    const feature = window
      .hyzerlinesStore!.getSnapshot()
      .course.features.find((f) => f.id === featureId);
    if (!feature) throw new Error(`no feature ${featureId}`);

    // Points carry a position; lines and rings carry a list of them, and the
    // first vertex is as good a place to click as any.
    const raw = feature.geometry.coordinates as number[] | number[][];
    const position = (typeof raw[0] === 'number' ? raw : raw[0]) as [number, number];
    const { x, y } = window.hyzerlinesMap!.project(position);
    return { x, y };
  }, id);

  await clickMap(page, point.x, point.y);
}

/** Click a point on the map canvas, in canvas-relative pixels. */
export const clickMap = (page: Page, x: number, y: number) =>
  page.locator('canvas.maplibregl-canvas').click({ position: { x, y } });

/**
 * Press, move and release across the canvas, in canvas-relative pixels.
 *
 * Stepped rather than a single jump: MapLibre and our own drag handlers both
 * decide a gesture has begun from movement between events, and one instant hop
 * can be swallowed as a click.
 */
export async function dragCanvas(
  page: Page,
  from: [number, number],
  to: [number, number],
): Promise<void> {
  const box = await page.locator('canvas.maplibregl-canvas').boundingBox();
  if (!box) throw new Error('no canvas');
  await page.mouse.move(box.x + from[0], box.y + from[1]);
  await page.mouse.down();
  await page.mouse.move(box.x + to[0], box.y + to[1], { steps: 8 });
  await page.mouse.up();
}

/** Draw a point feature with the named tool, then clear the auto-selection. */
export async function place(page: Page, tool: string, x: number, y: number): Promise<void> {
  await rail(page).getByRole('button', { name: tool, exact: true }).click();
  await clickMap(page, x, y);
  await page.keyboard.press('Escape');
}

/** Where a map coordinate currently sits on screen, in canvas pixels. */
export async function project(
  page: Page,
  position: [number, number],
): Promise<{ x: number; y: number }> {
  return page.evaluate((p) => {
    const point = window.hyzerlinesMap!.project(p);
    return { x: Math.round(point.x), y: Math.round(point.y) };
  }, position);
}

/**
 * Wait until the autosave has actually landed.
 *
 * Replaces sleeping for longer than the debounce and hoping. The debounce is
 * 800 ms, the sleeps were 1400, and on a loaded machine that margin is not
 * enough — which showed up as a reload test failing for reasons unrelated to
 * what it was checking.
 *
 * The store is the only witness: a successful save is deliberately silent in
 * the interface, because a permanent "Saved" badge is a badge people stop
 * reading. `dirty` going false is the write completing.
 */
export async function waitForSave(page: Page): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => window.hyzerlinesStore?.getSnapshot().dirty !== false))
    .toBe(false);
}
