import { expect, type Page } from '@playwright/test';
import { FOCUSES, FOCUS_DEFINITIONS, KIND_DEFINITIONS } from '@hyzerlines/core';
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
    /** Scope: the hole this belongs to, or null for course-level. */
    holeId: string | null;
    geometry: { type: string; coordinates: unknown };
    /** Loosely typed here for the same reason it is in the document. */
    props: Record<string, string | number | boolean | undefined>;
  }[];
  holes: { id: string; teeIds: string[]; targetIds: string[] }[];
  pairs: {
    teeId: string;
    targetId: string;
    fairwayId: string | null;
    parOverride: number | null;
  }[];
  overlays: {
    hillshade: boolean;
    contours: boolean;
    hillshadeOpacity: number;
    hillshadeSoftness: number;
    contourOpacity: number;
    contourSmoothing: number;
  };
  siteSurvey: {
    // A survey is a set of files: a course can be larger than one published
    // LiDAR tile, and county downloads arrive as a grid of them.
    sources: {
      name: string;
      crs: string;
      crsName: string;
      resolutionMeters: number;
      bounds: [number, number, number, number];
      verticalUnit: string;
      verticalUnitDeclared: boolean;
    }[];
    resolutionMeters: number;
    bounds: [number, number, number, number];
  } | null;
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

export interface SurveyTiffOptions {
  /** The projection to declare. Defaults to NAD83 / UTM zone 15N. */
  epsg?: number;
  /** Top-left corner in that projection's own linear unit. */
  origin?: [number, number];
  /** Ground sample distance, in that projection's own linear unit. */
  pixelSize?: number;
  /** Elevation at the top-left corner, in whatever unit the band is in. */
  baseElevation?: number;
  /**
   * `VerticalUnitsGeoKey`, when the file declares one.
   *
   * 9001 metre, 9002 international foot, 9003 US survey foot. Left undeclared
   * by default, which is the common and difficult case: most published DEMs
   * omit it entirely.
   */
  verticalUnits?: number;
}

/**
 * A small projected GeoTIFF with real relief, standing in for a LiDAR survey.
 *
 * Written with `geotiff`'s own writer rather than hand-rolled, because the
 * thing under test is whether the importer reads a *real* file — projection
 * recovered from GeoKeys, elevation off the band, bounds reprojected — and a
 * fixture we encoded ourselves to match our own reader would prove none of it.
 *
 * Defaults to NAD83 / UTM zone 15N (EPSG:26915), which covers Minnesota, where
 * the rest of the browser tests put their courses. The surface is a diagonal
 * ramp so a sample's value says where it came from, the same trick
 * `fakeDemTile` uses.
 *
 * Parameterised because the projection is the interesting variable: a survey in
 * State Plane feet exercises a completely different path through the EPSG table
 * than one in UTM metres.
 *
 * Returned as bytes for `setInputFiles`, which is how a file reaches the page
 * without a real file dialog.
 */
export async function fakeSurveyGeoTiff({
  epsg = 26915,
  origin = [480_000, 4_975_000],
  pixelSize = 8,
  baseElevation = 100,
  verticalUnits,
}: SurveyTiffOptions = {}): Promise<Buffer> {
  const { writeArrayBuffer } = await import('geotiff');

  const size = 128;
  const values = new Float32Array(size * size);
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      // Enough fall across the tile to produce contours at every interval
      // terrain.ts defines.
      values[row * size + col] = baseElevation + (col + row) * 0.8;
    }
  }

  const buffer = writeArrayBuffer(values, {
    width: size,
    height: size,
    ModelPixelScale: [pixelSize, pixelSize, 0],
    // Ties raster (0,0) — the top-left corner — to its projected position.
    ModelTiepoint: [0, 0, 0, origin[0], origin[1], 0],
    GTModelTypeGeoKey: 1,
    GTRasterTypeGeoKey: 1,
    ProjectedCSTypeGeoKey: epsg,
    ...(verticalUnits === undefined ? {} : { VerticalUnitsGeoKey: verticalUnits }),
  });

  return Buffer.from(buffer);
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
  /*
   * The reverse geocoder, answered rather than left to the network.
   *
   * `useAutoLocation` fills the location field in from whatever is drawn first,
   * and it is the one request in the app that fires without anyone asking. Left
   * unstubbed it made the suite depend on photon.komoot.io being reachable —
   * which is why two undo tests passed locally and failed in CI for weeks: the
   * sandbox could not reach it, so the op never landed, so the bug it caused
   * never showed. Stubbed to *succeed*, because that is the case that breaks
   * things.
   */
  await page.route('**://photon.komoot.io/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        features: [{ properties: { name: 'Test Park', city: 'Testville', state: 'MN' } }],
      }),
    }),
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
 * Open one of the course's collapsible sections — Analysis, Settings, Notes.
 *
 * The sections start closed and unmount what they hold, deliberately, so a
 * folded switch is not still in the tab order. Tests that reach for those
 * controls have to open the section the way a person would.
 *
 * ## It clears the selection first
 *
 * The course's properties are the right panel's third mode: it describes a
 * selected feature, else a selected hole, else the course. So these sections
 * exist only when nothing is selected, and almost every caller has just drawn
 * something — which selects it. Escaping first is what a person would do, and
 * doing it here keeps a dozen tests about switches from each becoming a test
 * about selection.
 *
 * Escape unwinds one level of intent at a time — shape, then tool, then feature,
 * then hole — so it may take a few presses to get back to the course. Three is
 * enough from any state this helper is called in, and the loop stops as soon as
 * the section appears rather than pressing a fixed number of times.
 *
 * Idempotent: calling it on an already-open section leaves it open. The sections
 * are a group, so a test cannot have two open at once.
 */
export async function openSection(page: Page, title: string): Promise<void> {
  const header = page.getByRole('button', { name: title, exact: true });

  for (let attempt = 0; attempt < 3 && (await header.count()) === 0; attempt++) {
    await page.keyboard.press('Escape');
  }
  // The course's own sections live in the rail's Course tab now, so getting to
  // one means getting out of whatever is open and switching lists.
  if ((await header.count()) === 0) await openCourseTab(page);
  await expect(header).toBeVisible();

  if ((await header.getAttribute('aria-expanded')) !== 'true') await header.click();
  await expect(header).toHaveAttribute('aria-expanded', 'true');
}

/**
 * The rail's Course tab, which holds the course's own properties.
 *
 * Escape first, because the tabs are only drawn while the rail is showing its
 * list — drilled into a hole, the header is that hole's name.
 */
export async function openCourseTab(page: Page): Promise<void> {
  const tab = page.getByRole('button', { name: 'Course', exact: true });
  for (let attempt = 0; attempt < 3 && (await tab.count()) === 0; attempt++) {
    await page.keyboard.press('Escape');
  }
  await tab.click();
}

/**
 * Open the layers drawer, which holds the basemap choice and the overlays.
 *
 * A popover rather than a menu now — you keep it open while flipping several
 * things and watching the map — so unlike the old menu it does not close when
 * you pick a basemap, and a test does not have to reopen it to read state back.
 *
 * Idempotent, so a test can call it without tracking what its own earlier steps
 * left open.
 */
export async function openLayers(page: Page): Promise<void> {
  const trigger = page.getByRole('button', { name: 'Layers', exact: true });
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click();
  await expect(page.getByRole('radiogroup', { name: 'Basemap' })).toBeVisible();
}

/**
 * Set one of the course's drawing aids, which live in the layers drawer.
 *
 * They were switches inside the course's Settings, grouped with units and
 * elevation smoothing because all three are preferences. What they actually
 * have in common with the terrain overlays is that they decide what is on the
 * map, which is the question you are asking when you reach for one.
 */
export async function setAid(page: Page, name: string, on: boolean): Promise<void> {
  await openLayers(page);
  await setSwitch(page, name, on);
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
 * A hole's chip in the holes grid.
 *
 * The word "Hole" is gone from the panel on purpose — a chip carries a big
 * numeral, a par and a distance and nothing else — so `getByText('Hole 1')` no
 * longer finds anything and the accessible name is the only handle. Which is the
 * better handle regardless: it is what a screen reader reads, and asserting it is
 * what stops the chip quietly becoming an unlabelled button showing a "1".
 *
 * Exact, because "Hole 1" is a prefix of "Hole 10" through "Hole 18".
 */
export const holeChip = (page: Page, number: number) =>
  page.getByRole('button', { name: `Hole ${number}`, exact: true });

/**
 * Look at a feature, then click it.
 *
 * Fixed canvas coordinates only hold while the camera has not moved, and the
 * camera moves on its own: selecting a hole frames it. A test that places a
 * basket at (950, 500) and clicks there twenty lines later is clicking wherever
 * that pixel has since ended up. So the position is projected at the moment of
 * the click.
 *
 * ## And the camera is centred on it first
 *
 * Projecting is not enough on its own, because a projected point can land under
 * a panel — and the two inspector columns are permanent and full-height now, so
 * roughly 40% of the viewport is chrome that swallows the click. That failed as a
 * thirty-second timeout with a `<p>` from the properties panel named as the thing
 * intercepting, which is a long way from "the basket was behind the inspector".
 *
 * Centring is also what a person does: you cannot click what you cannot see, so
 * you pan to it. Tests that care where the camera is should not be using this
 * helper to move the selection.
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

    // Jump rather than ease: a test should not wait out an animation to click
    // something, and there is nothing to orient here — no human is watching.
    window.hyzerlinesMap!.jumpTo({ center: position });
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

/**
 * Which focus offers each tool, derived rather than restated.
 *
 * Built from the same tables the rail reads, so moving a kind between focuses
 * cannot leave the tests arming a tool that is no longer on screen. A hard-coded
 * copy here would drift silently and fail as "button not found", which reads as
 * a broken rail rather than a moved tool.
 */
const FOCUS_OF_TOOL = new Map<string, string>(
  FOCUSES.flatMap((focus) =>
    FOCUS_DEFINITIONS[focus].kinds.map(
      (kind) => [KIND_DEFINITIONS[kind].label, FOCUS_DEFINITIONS[focus].label] as const,
    ),
  ),
);

/**
 * Arm a drawing tool, switching focus first if it lives in another one.
 *
 * The switch is real behaviour, not a shortcut around it: a tool the current
 * focus does not offer genuinely is not on the rail. It lives here so that
 * twenty tests about drawing do not each become a test about focus — the focus
 * mechanism has its own tests, which assert the switching directly.
 */
export async function armTool(page: Page, tool: string): Promise<void> {
  const focus = FOCUS_OF_TOOL.get(tool);
  if (focus) {
    const control = page.getByRole('radio', { name: focus, exact: true });
    if ((await control.getAttribute('aria-checked')) !== 'true') await control.click();
  }
  await rail(page).getByRole('button', { name: tool, exact: true }).click();
}

/** Draw a point feature with the named tool, then clear the auto-selection. */
export async function place(page: Page, tool: string, x: number, y: number): Promise<void> {
  await armTool(page, tool);
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
