import { test, expect, type Page } from '@playwright/test';
import { deflateSync } from 'node:zlib';

/**
 * Navigation tools, through the real browser.
 *
 * None of this is testable any other way. Cursors are computed style on an
 * element MapLibre also writes to; whether a drag pans depends on which
 * MapLibre handlers are enabled; and the zoom marquee is a pointer gesture that
 * ends in a camera animation. Every one of these failed silently at some point
 * during the build — the Select tool shipped showing a `grab` cursor because
 * MapLibre's stylesheet targets the canvas *container*, and clearing our own
 * inline style fell back to its hand rather than to an arrow.
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

interface MapHandle {
  jumpTo: (options: unknown) => void;
  getZoom: () => number;
  getCenter: () => { toArray: () => [number, number] };
  unproject: (point: [number, number]) => { lng: number; lat: number };
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
  await page.waitForTimeout(300);
}

const rail = (page: Page) => page.getByRole('toolbar', { name: 'Tools' });

/**
 * The cursor as the browser resolves it, on the element MapLibre styles.
 *
 * Reading our own inline style would pass even when MapLibre's stylesheet is
 * winning, which is exactly the bug this guards.
 */
const cursor = (page: Page) =>
  page.evaluate(
    () => getComputedStyle(document.querySelector('.maplibregl-canvas-container')!).cursor,
  );

const zoom = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { hyzerlinesMap: MapHandle }).hyzerlinesMap.getZoom(),
  );

const center = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { hyzerlinesMap: MapHandle }).hyzerlinesMap.getCenter().toArray(),
  );

const reset = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { hyzerlinesMap: MapHandle }).hyzerlinesMap.jumpTo({
      center: [-93.1, 44.9],
      zoom: 16,
    }),
  );

async function dragCanvas(page: Page, from: [number, number], to: [number, number]) {
  const box = await page.locator('canvas.maplibregl-canvas').boundingBox();
  if (!box) throw new Error('no canvas');
  await page.mouse.move(box.x + from[0], box.y + from[1]);
  await page.mouse.down();
  await page.mouse.move(box.x + to[0], box.y + to[1], { steps: 8 });
  await page.mouse.up();
}

test.describe('navigation tools', () => {
  test('each tool sets its own cursor, and holds restore the previous one', async ({
    page,
  }) => {
    await openEditor(page);

    // An arrow, not MapLibre's hand: Select does not pan.
    expect(await cursor(page)).toBe('default');

    await rail(page).getByRole('button', { name: 'Move', exact: true }).click();
    expect(await cursor(page)).toBe('grab');

    await rail(page).getByRole('button', { name: 'Select', exact: true }).click();
    expect(await cursor(page)).toBe('default');

    await page.keyboard.down(' ');
    expect(await cursor(page)).toBe('grab');
    await page.keyboard.up(' ');
    expect(await cursor(page)).toBe('default');

    await page.keyboard.down('z');
    expect(await cursor(page)).toBe('zoom-in');
    // Alt inverts the gesture, and the cursor says so before you commit to it.
    await page.keyboard.down('Alt');
    expect(await cursor(page)).toBe('zoom-out');
    await page.keyboard.up('Alt');
    await page.keyboard.up('z');
    expect(await cursor(page)).toBe('default');
  });

  test('a drag with the Select tool does not move the camera', async ({ page }) => {
    await openEditor(page);
    await reset(page);
    const before = await center(page);

    await dragCanvas(page, [600, 400], [480, 300]);
    await page.waitForTimeout(300);

    expect(await center(page)).toEqual(before);
  });

  test('the Move tool drags the camera', async ({ page }) => {
    await openEditor(page);
    await reset(page);
    const before = await center(page);

    await rail(page).getByRole('button', { name: 'Move', exact: true }).click();
    await dragCanvas(page, [600, 400], [480, 300]);
    await page.waitForTimeout(300);

    expect(await center(page)).not.toEqual(before);
  });

  /** The gesture that makes the Move tool optional rather than a detour. */
  test('holding Space drags the camera from any tool', async ({ page }) => {
    await openEditor(page);
    await reset(page);
    const before = await center(page);

    await page.keyboard.down(' ');
    await dragCanvas(page, [600, 400], [480, 300]);
    await page.keyboard.up(' ');
    await page.waitForTimeout(300);

    expect(await center(page)).not.toEqual(before);
  });

  test('dragging a region with Z held zooms to it, and Alt reverses it', async ({ page }) => {
    await openEditor(page);
    await reset(page);
    const start = await zoom(page);

    await page.keyboard.down('z');
    await dragCanvas(page, [500, 350], [700, 480]);
    await page.keyboard.up('z');
    await page.waitForTimeout(500);

    const zoomedIn = await zoom(page);
    expect(zoomedIn).toBeGreaterThan(start);

    // Same region, Alt held: the inverse, not a different behaviour that
    // happens to also reduce zoom.
    await page.keyboard.down('z');
    await page.keyboard.down('Alt');
    await dragCanvas(page, [500, 350], [700, 480]);
    await page.keyboard.up('Alt');
    await page.keyboard.up('z');
    await page.waitForTimeout(500);

    expect(await zoom(page)).toBeCloseTo(start, 1);
  });

  /**
   * The ground under the cursor is the thing you are aiming at.
   *
   * MapLibre anchors wheel zoom to the pointer by default; this app had
   * overridden it to `{ around: 'center' }`, which meant zooming in on a tee
   * near the edge of the screen walked it off the screen. The failure is
   * subtle enough to read as "the map drifts" rather than as a setting.
   */
  test('scroll zoom keeps the point under the cursor in place', async ({ page }) => {
    await openEditor(page);
    await reset(page);

    const box = await page.locator('canvas.maplibregl-canvas').boundingBox();
    if (!box) throw new Error('no canvas');

    /*
     * Well off centre, which is the only place the difference shows — but
     * clear of the docked panels, or the wheel lands on a panel and the map
     * never sees it. The right panel begins around 0.79 of the width.
     */
    const point: [number, number] = [
      Math.round(box.width * 0.66),
      Math.round(box.height * 0.7),
    ];

    const at = () =>
      page.evaluate(
        (p) => (window as unknown as { hyzerlinesMap: MapHandle }).hyzerlinesMap.unproject(p),
        point,
      );

    const before = await at();

    await page.mouse.move(box.x + point[0], box.y + point[1]);
    await page.mouse.wheel(0, -400);
    await expect.poll(() => zoom(page)).toBeGreaterThan(16.2);
    await page.waitForTimeout(400);

    const after = await at();

    // Within a metre or so at this latitude and zoom. Anchored to centre, the
    // same gesture moves this point by hundreds of metres.
    expect(after.lng).toBeCloseTo(before.lng, 4);
    expect(after.lat).toBeCloseTo(before.lat, 4);
  });

  test('the marquee is visible while the region is being dragged', async ({ page }) => {
    await openEditor(page);
    await reset(page);

    const box = await page.locator('canvas.maplibregl-canvas').boundingBox();
    if (!box) throw new Error('no canvas');

    await page.keyboard.down('z');
    await page.mouse.move(box.x + 500, box.y + 350);
    await page.mouse.down();
    await page.mouse.move(box.x + 700, box.y + 480, { steps: 6 });

    const marquee = page.locator('.border-border-accent.bg-accent-soft');
    await expect(marquee).toBeVisible();

    await page.mouse.up();
    await page.keyboard.up('z');
    // Gone once the gesture ends — a stuck marquee would sit over the map.
    await expect(marquee).toBeHidden();
  });

  /**
   * A keyup that lands on another window would otherwise strand the map in pan
   * mode, with a hand cursor and no way back except pressing and releasing
   * Space again over the canvas.
   */
  test('losing the window mid-hold releases the tool', async ({ page }) => {
    await openEditor(page);

    await page.keyboard.down(' ');
    expect(await cursor(page)).toBe('grab');

    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    expect(await cursor(page)).toBe('default');
  });

  test('Space types a space rather than switching tools while a field has focus', async ({
    page,
  }) => {
    await openEditor(page);

    const name = page.getByRole('textbox', { name: 'Course name' });
    await name.fill('Kaposia');
    await name.press(' ');
    await name.pressSequentially('Park');

    await expect(name).toHaveValue('Kaposia Park');
    expect(await cursor(page)).toBe('default');
  });
});
