import { test, expect, type Page } from '@playwright/test';
import { deflateSync } from 'node:zlib';

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
    await place(page, 'Basket', 800, 300);

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
    await place(page, 'Basket', 800, 300);
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
    await place(page, 'Basket', 800, 300);
    await page.getByRole('button', { name: 'Add hole' }).click();

    await expect(page.getByRole('button', { name: /notes?$/ })).toBeHidden();
  });

  test('holes survive a reload', async ({ page }) => {
    await openEditor(page);
    await place(page, 'Tee pad', 400, 500);
    await place(page, 'Basket', 800, 300);
    await page.getByRole('button', { name: 'Add hole' }).click();
    await expect(page.getByText('Hole 1').first()).toBeVisible();

    await page.waitForTimeout(1400);
    await page.reload();
    await page.locator('[data-hydrated="true"]').waitFor({ state: 'attached' });

    await expect(page.getByText('Hole 1').first()).toBeVisible();
  });

  /**
   * Par comes from the PDGA table for the course's skill level, so the same
   * hole is a different par depending on who it is built for. This is the only
   * place that wiring is visible end to end — core proves the table, but only
   * the browser proves the picker reaches it and the change survives a reload.
   */
  test('changing the skill level re-pars the course, and persists', async ({ page }) => {
    await openEditor(page);
    // ~570 ft at zoom 16: par 4 for White (431-765), par 3 for Gold (186-585).
    await place(page, 'Tee pad', 300, 500);
    await place(page, 'Basket', 700, 200);
    await page.getByRole('button', { name: 'Add hole' }).click();

    // Adding a hole selects it, and the right panel shows the course only when
    // nothing is selected. Escape steps back out to it.
    await page.keyboard.press('Escape');

    const par = page.getByRole('combobox', { name: /Par for Hole 1/ });
    const level = page.getByRole('combobox', { name: /Skill level/ });

    await expect(level).toHaveValue('white');
    const asWhite = await par.inputValue();

    await level.selectOption('gold');
    await expect(par).not.toHaveValue(asWhite);
    const asGold = await par.inputValue();
    expect(Number(asGold)).toBeLessThan(Number(asWhite));

    await page.waitForTimeout(1400);
    await page.reload();
    await page.locator('[data-hydrated="true"]').waitFor({ state: 'attached' });

    await expect(page.getByRole('combobox', { name: /Skill level/ })).toHaveValue('gold');
    await expect(page.getByRole('combobox', { name: /Par for Hole 1/ })).toHaveValue(asGold);
  });

  /**
   * A PDGA check must say which document it came from. A designer quoting a
   * figure to a parks department needs to know it is a published standard and
   * which revision, not this app's opinion.
   */
  test('a PDGA finding cites its source document', async ({ page }) => {
    await openEditor(page);
    await place(page, 'Tee pad', 400, 500);
    await place(page, 'Basket', 410, 495);
    await page.getByRole('button', { name: 'Add hole' }).click();

    await page.getByRole('button', { name: /notes?$/ }).click();

    const item = page.getByRole('listitem').filter({ hasText: /under the 100 ft minimum/ });
    await expect(item).toBeVisible();
    await expect(item.getByRole('link', { name: /Course Design Elements/ })).toBeVisible();
  });

  test('adding a hole is undoable', async ({ page }) => {
    await openEditor(page);
    await place(page, 'Tee pad', 400, 500);
    await place(page, 'Basket', 800, 300);
    await page.getByRole('button', { name: 'Add hole' }).click();
    await expect(page.getByText('Hole 1').first()).toBeVisible();

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByText(/Draw a tee and a basket/)).toBeVisible();
  });
});
