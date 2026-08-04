import { test, expect, type Page } from '@playwright/test';
import { deflateSync } from 'node:zlib';
import type { Map as MapLibreMap } from 'maplibre-gl';

declare global {
  interface Window {
    hyzerlinesMap?: MapLibreMap;
  }
}

/**
 * Holes, par and design checks, through the real UI.
 *
 * The measurement and par logic is unit-tested exhaustively in
 * @hyzerlines/core. What only a browser can answer is whether the panel is
 * wired to it: whether adding a hole claims the right features, whether a par
 * override survives, and whether findings appear and can be silenced.
 */

function fakeTile(): Buffer {
  const W = 256;
  const H = 256;
  const raw = Buffer.alloc((W * 3 + 1) * H);
  let o = 0;
  for (let y = 0; y < H; y++) {
    raw[o++] = 0;
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
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

async function openEditor(page: Page): Promise<void> {
  const tile = fakeTile();
  await page.route('**://server.arcgisonline.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: tile }),
  );
  await page.goto('/');
  await page.locator('[data-hydrated="true"]').waitFor({ state: 'attached' });
  const skip = page.getByRole('button', { name: /Skip/ });
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await expect(skip).toBeHidden();

  // Zoom in so map pixels span a plausible course rather than a continent.
  await page.evaluate(() => {
    const map = (window as unknown as { hyzerlinesMap?: { jumpTo: (o: unknown) => void } })
      .hyzerlinesMap;
    map?.jumpTo({ center: [-93.1, 44.9], zoom: 16 });
  });
  await page.waitForTimeout(300);
}

const clickMap = (page: Page, x: number, y: number) =>
  page.locator('canvas.maplibregl-canvas').click({ position: { x, y } });

/** Scoped, because the hole properties panel also names features. */
const rail = (page: Page) => page.getByRole('toolbar', { name: 'Tools' });

async function place(page: Page, tool: string, x: number, y: number): Promise<void> {
  await rail(page).getByRole('button', { name: tool, exact: true }).click();
  await clickMap(page, x, y);
  // Placing auto-selects; clear it so the next assertion isn't confused.
  await page.keyboard.press('Escape');
}

test.describe('holes', () => {
  test('shows an empty state until a hole exists', async ({ page }) => {
    await openEditor(page);
    await expect(page.getByText(/Draw a tee and a basket/)).toBeVisible();
  });

  test('adding a hole claims the drawn tee and basket, and measures between them', async ({
    page,
  }) => {
    await openEditor(page);
    await place(page, 'Tee pad', 400, 500);
    await place(page, 'Target', 800, 300);

    await page.getByRole('button', { name: 'Add hole' }).click();

    await expect(page.getByText('Hole 1').first()).toBeVisible();
    // A measured distance, not a placeholder — proves it found both ends.
    await expect(
      page
        .getByRole('list')
        .getByText(/\d+ ft/)
        .first(),
    ).toBeVisible();
    await expect(page.getByText(/· Par \d/)).toBeVisible();
  });

  test('par can be overridden, and the override persists across a reload', async ({ page }) => {
    await openEditor(page);
    await place(page, 'Tee pad', 400, 500);
    await place(page, 'Target', 800, 300);
    await page.getByRole('button', { name: 'Add hole' }).click();

    const par = page.getByRole('combobox', { name: /Par for Hole 1/ });
    await par.selectOption('5');
    await expect(par).toHaveValue('5');

    await page.waitForTimeout(1400);
    await page.reload();
    await page.locator('[data-hydrated="true"]').waitFor({ state: 'attached' });

    await expect(page.getByRole('combobox', { name: /Par for Hole 1/ })).toHaveValue('5');
  });

  test('reports a hole with nothing assigned, and can silence the check', async ({ page }) => {
    await openEditor(page);

    // No features drawn, so the new hole has neither tee nor basket.
    await page.getByRole('button', { name: 'Add hole' }).click();

    const notes = page.getByRole('button', { name: /notes?$/ });
    await expect(notes).toBeVisible();
    await notes.click();

    await expect(page.getByText(/has no tee assigned/)).toBeVisible();

    // Advisory, never prescriptive: every check must be silenceable.
    await page
      .getByRole('listitem')
      .filter({ hasText: /has no tee assigned/ })
      .getByRole('button', { name: 'Ignore this check' })
      .click();

    await expect(page.getByText(/has no tee assigned/)).toBeHidden();
  });

  test('flags a tee that belongs to no hole', async ({ page }) => {
    await openEditor(page);
    await place(page, 'Tee pad', 400, 500);

    const notes = page.getByRole('button', { name: /notes?$/ });
    await expect(notes).toBeVisible();
    await notes.click();
    await expect(page.getByText(/not assigned to a hole/)).toBeVisible();
  });

  test('a clean hole produces no findings', async ({ page }) => {
    await openEditor(page);
    await place(page, 'Tee pad', 400, 500);
    await place(page, 'Target', 800, 300);
    await page.getByRole('button', { name: 'Add hole' }).click();

    await expect(page.getByRole('button', { name: /notes?$/ })).toBeHidden();
  });

  test('holes survive a reload', async ({ page }) => {
    await openEditor(page);
    await place(page, 'Tee pad', 400, 500);
    await place(page, 'Target', 800, 300);
    await page.getByRole('button', { name: 'Add hole' }).click();
    await expect(page.getByText('Hole 1').first()).toBeVisible();

    await page.waitForTimeout(1400);
    await page.reload();
    await page.locator('[data-hydrated="true"]').waitFor({ state: 'attached' });

    await expect(page.getByText('Hole 1').first()).toBeVisible();
  });

  /**
   * Par comes from the PDGA table for the TEE'S skill level, and a tee's colour
   * is that level — [ELEMENTS] p3. The course no longer carries one of its own,
   * so this is the wiring that replaced it: set the colour, the par re-bands.
   */
  test('the tee colour sets the skill level, and re-pars the hole', async ({ page }) => {
    await openEditor(page);
    // ~570 ft at zoom 16: par 4 for White (431-765), par 3 for Gold (186-585).
    await place(page, 'Tee pad', 300, 500);
    await place(page, 'Target', 700, 200);
    await page.getByRole('button', { name: 'Add hole' }).click();

    const par = page.getByRole('combobox', { name: /Par for Hole 1/ });
    const asDefault = await par.inputValue();

    // Select the tee to reach its properties, then colour it Gold.
    await page.getByRole('button', { name: 'Select Tee pad' }).click();
    const colour = page.getByRole('combobox', { name: 'Colour' });
    await colour.selectOption('gold');
    await expect(colour).toHaveValue('gold');

    await expect(par).not.toHaveValue(asDefault);
    const asGold = await par.inputValue();
    expect(Number(asGold)).toBeLessThan(Number(asDefault));

    await page.waitForTimeout(1400);
    await page.reload();
    await page.locator('[data-hydrated="true"]').waitFor({ state: 'attached' });

    await expect(page.getByRole('combobox', { name: /Par for Hole 1/ })).toHaveValue(asGold);
    // And the course panel reports the level it derived, rather than storing one.
    await page.keyboard.press('Escape');
    await expect(page.getByText('Gold', { exact: true }).first()).toBeVisible();
  });

  /**
   * A PDGA check must say which document it came from. A designer quoting a
   * figure to a parks department needs to know it is a published standard and
   * which revision, not this app's opinion.
   */
  test('a PDGA finding cites its source document', async ({ page }) => {
    await openEditor(page);
    await place(page, 'Tee pad', 400, 500);
    await place(page, 'Target', 410, 495);
    await page.getByRole('button', { name: 'Add hole' }).click();

    await page.getByRole('button', { name: /notes?$/ }).click();

    const item = page.getByRole('listitem').filter({ hasText: /under the 100 ft minimum/ });
    await expect(item).toBeVisible();
    await expect(item.getByRole('link', { name: /Course Design Elements/ })).toBeVisible();
  });

  /**
   * A course you cannot see is a course you cannot work on.
   *
   * The map opens on the geographic centre of the US, and restoring an autosave
   * used not to move it at all — so a reload showed a scorecard full of holes
   * over an empty continent. The camera now goes to the work.
   */
  test('a restored course is framed on screen, not left at the default view', async ({
    page,
  }) => {
    await openEditor(page);
    await place(page, 'Tee pad', 400, 500);
    await place(page, 'Target', 800, 300);
    await page.getByRole('button', { name: 'Add hole' }).click();

    const before = await page.evaluate(() => ({
      center: window.hyzerlinesMap!.getCenter().toArray(),
      zoom: window.hyzerlinesMap!.getZoom(),
    }));

    await page.waitForTimeout(1400);
    await page.reload();
    await page.locator('[data-hydrated="true"]').waitFor({ state: 'attached' });
    await expect(page.getByText('Hole 1').first()).toBeVisible();

    await expect
      .poll(() => page.evaluate(() => window.hyzerlinesMap!.getZoom()))
      .toBeGreaterThan(12);

    const after = await page.evaluate(() => ({
      center: window.hyzerlinesMap!.getCenter().toArray(),
      zoom: window.hyzerlinesMap!.getZoom(),
    }));

    // Near where the work is, at a working zoom — not the continent.
    expect(after.center[0]).toBeCloseTo(before.center[0]!, 1);
    expect(after.center[1]).toBeCloseTo(before.center[1]!, 1);
    expect(after.zoom).toBeGreaterThan(12);

    // Both features are inside the viewport, which is the actual promise.
    const visible = await page.evaluate(() => {
      const map = window.hyzerlinesMap!;
      const canvas = map.getCanvas();
      return map
        .querySourceFeatures('course-features')
        .filter((f) => f.geometry.type === 'Point')
        .map((f) => map.project((f.geometry as GeoJSON.Point).coordinates as [number, number]))
        .every(
          (p) =>
            p.x >= 0 && p.y >= 0 && p.x <= canvas.clientWidth && p.y <= canvas.clientHeight,
        );
    });
    expect(visible).toBe(true);
  });

  test('Zoom to fit frames the whole course', async ({ page }) => {
    await openEditor(page);
    await place(page, 'Tee pad', 400, 500);
    await place(page, 'Target', 800, 300);

    // Wander off, then ask to come back.
    await page.evaluate(() => window.hyzerlinesMap!.jumpTo({ center: [-80, 40], zoom: 6 }));
    await page.waitForTimeout(200);

    await page.locator('canvas.maplibregl-canvas').click({ position: { x: 600, y: 550 } });
    await page.keyboard.press('Shift+1');

    await expect
      .poll(() => page.evaluate(() => window.hyzerlinesMap!.getZoom()))
      .toBeGreaterThan(12);
    await expect
      .poll(() => page.evaluate(() => window.hyzerlinesMap!.getCenter().lng))
      .toBeLessThan(-90);
  });

  test('adding a hole is undoable', async ({ page }) => {
    await openEditor(page);
    await place(page, 'Tee pad', 400, 500);
    await place(page, 'Target', 800, 300);
    await page.getByRole('button', { name: 'Add hole' }).click();
    await expect(page.getByText('Hole 1').first()).toBeVisible();

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByText(/Draw a tee and a basket/)).toBeVisible();
  });
});
