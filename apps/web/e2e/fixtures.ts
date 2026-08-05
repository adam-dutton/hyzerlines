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
  }[];
  holes: { id: string; teeIds: string[]; targetIds: string[] }[];
  pairs: { teeId: string; targetId: string; fairwayId: string | null }[];
}

declare global {
  interface Window {
    hyzerlinesMap?: MapLibreMap;
    hyzerlinesStore?: {
      getSnapshot: () => { course: TestCourse };
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

/**
 * A 256×256 checkerboard PNG, encoded by hand.
 *
 * Tiles are stubbed in-process rather than fetched: the tests must not depend
 * on Esri being up, and a green-grey check is enough for a screenshot to be
 * readable when one fails. Hand-rolled because pulling in an image library for
 * four rectangles of flat colour is not worth the dependency.
 */
export function fakeTile(): Buffer {
  const W = 256;
  const H = 256;
  const raw = Buffer.alloc((W * 3 + 1) * H);
  let o = 0;
  for (let y = 0; y < H; y++) {
    raw[o++] = 0; // filter byte: none
    for (let x = 0; x < W; x++) {
      const on = ((x >> 5) + (y >> 5)) % 2 === 0;
      raw[o++] = on ? 0x2f : 0x25;
      raw[o++] = on ? 0x5a : 0x46;
      raw[o++] = on ? 0x33 : 0x2a;
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
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
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

/** Click a point on the map canvas, in canvas-relative pixels. */
export const clickMap = (page: Page, x: number, y: number) =>
  page.locator('canvas.maplibregl-canvas').click({ position: { x, y } });

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
