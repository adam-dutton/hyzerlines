import { test, expect, type Page } from '@playwright/test';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { deflateSync } from 'node:zlib';

/**
 * Drawing, selection and the inspector, through the real UI.
 *
 * The geometry and op logic is unit-tested in @hyzerlines/core. What only a
 * browser can answer is whether clicks on a WebGL canvas turn into features,
 * whether those features are actually rendered, and whether selection reaches
 * the inspector — all wiring, and wiring only fails here.
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
}

/** Click a point on the map canvas, in canvas-relative pixels. */
async function clickMap(page: Page, x: number, y: number): Promise<void> {
  await page.locator('canvas.maplibregl-canvas').click({ position: { x, y } });
}

test.describe('drawing', () => {
  test('places a point feature and opens the inspector on it', async ({ page }) => {
    await openEditor(page);

    await page.getByRole('button', { name: 'Basket' }).click();
    await clickMap(page, 500, 400);

    // Selecting what was just drawn is the behaviour under test: the next thing
    // you want is almost always to name it.
    const inspector = page.getByText('Basket', { exact: true }).first();
    await expect(inspector).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Feature name' })).toBeVisible();
  });

  test('returns to the select tool after placing a point', async ({ page }) => {
    await openEditor(page);

    const tee = page.getByRole('button', { name: 'Tee pad' });
    await tee.click();
    await expect(tee).toHaveAttribute('aria-pressed', 'true');

    await clickMap(page, 480, 380);
    // Staying in the tool would scatter tees on every subsequent click.
    await expect(tee).not.toHaveAttribute('aria-pressed', 'true');
  });

  test('draws a multi-point line and finishes on Enter', async ({ page }) => {
    await openEditor(page);

    await page.getByRole('button', { name: 'Fairway line' }).click();
    await clickMap(page, 400, 300);
    await clickMap(page, 500, 350);
    await clickMap(page, 600, 320);

    // The hint is the only thing telling you how to finish.
    await expect(page.getByText(/3 points/)).toBeVisible();

    await page.keyboard.press('Enter');
    await expect(page.getByText(/points ·/)).toBeHidden();

    // A fairway's length is the number a designer actually wants.
    await expect(page.getByText('Length')).toBeVisible();
  });

  test('abandons an in-progress shape on Escape without creating anything', async ({
    page,
  }) => {
    await openEditor(page);

    await page.getByRole('button', { name: 'Out of bounds' }).click();
    await clickMap(page, 400, 300);
    await clickMap(page, 500, 350);
    await expect(page.getByText(/2 points/)).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByText(/points ·/)).toBeHidden();
    // Nothing was committed, so there is nothing to undo.
    await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
  });

  test('a drawn feature is undoable and survives a reload', async ({ page }) => {
    await openEditor(page);

    await page.getByRole('button', { name: 'Basket' }).click();
    await clickMap(page, 520, 380);

    const undo = page.getByRole('button', { name: 'Undo' });
    await expect(undo).toBeEnabled();

    await undo.click();
    await expect(page.getByRole('textbox', { name: 'Feature name' })).toBeHidden();

    // Redo, let it autosave, and confirm it comes back after a reload.
    await page.getByRole('button', { name: 'Redo' }).click();
    await page.waitForTimeout(1400);
    await page.reload();
    await page.locator('[data-hydrated="true"]').waitFor({ state: 'attached' });

    await clickMap(page, 520, 380);
    await expect(page.getByRole('textbox', { name: 'Feature name' })).toBeVisible();
  });

  test('inspector edits are undoable', async ({ page }) => {
    await openEditor(page);

    await page.getByRole('button', { name: 'Basket' }).click();
    await clickMap(page, 500, 400);

    const name = page.getByRole('textbox', { name: 'Feature name' });
    await name.fill('Hole 7 pin');
    await expect(page.getByText('Hole 7 pin')).toBeVisible();

    // Focus the canvas first: undo inside a text field is the browser's own.
    await clickMap(page, 200, 200);
    await page.keyboard.press('ControlOrMeta+z');
    // The whole typing run should revert in one step, not one character.
    await expect(page.getByText('Hole 7 pin')).toBeHidden();
  });

  test('keyboard selects tools', async ({ page }) => {
    await openEditor(page);

    await page.keyboard.press('b');
    await expect(page.getByRole('button', { name: 'Basket' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await page.keyboard.press('v');
    await expect(page.getByRole('button', { name: 'Select' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  /**
   * Regression: MapLibre silently ignores setFeatureState when a GeoJSON
   * source has non-numeric feature ids, and ours are UUIDs. Selection styling
   * simply never appeared, and every test here passed anyway because they all
   * asserted on the inspector rather than on the map.
   */
  test('a selected feature is actually flagged selected on the map', async ({ page }) => {
    await openEditor(page);

    await page.getByRole('button', { name: 'Basket' }).click();
    await clickMap(page, 500, 400);
    await expect(page.getByRole('textbox', { name: 'Feature name' })).toBeVisible();

    await expect
      .poll(() =>
        page.evaluate(() => {
          const map = (window as unknown as { hyzerlinesMap?: MapLibreMap }).hyzerlinesMap;
          if (!map) return 'no map';
          const states = map.querySourceFeatures('course-features');
          return states.some(
            (f) =>
              f.id !== undefined &&
              map.getFeatureState({
                source: 'course-features',
                id: f.id,
              }).selected === true,
          );
        }),
      )
      .toBe(true);
  });

  test('deleting removes the feature and closes the inspector', async ({ page }) => {
    await openEditor(page);

    await page.getByRole('button', { name: 'Basket' }).click();
    await clickMap(page, 500, 400);
    await expect(page.getByRole('textbox', { name: 'Feature name' })).toBeVisible();

    await page.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByRole('textbox', { name: 'Feature name' })).toBeHidden();
  });
});
