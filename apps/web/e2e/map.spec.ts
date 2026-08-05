import { test, expect, type Page } from '@playwright/test';

import { fakeTile } from './fixtures';

/**
 * Smoke tests for the map surface.
 *
 * These exist because the map silently failed to render for two releases.
 * MapLibre adds a `maplibregl-map` class at runtime whose stylesheet sets
 * `position: relative`; it ties on specificity with Tailwind's `.absolute` and
 * wins on bundle order, which collapsed the container to zero height. Tiles kept
 * downloading the whole time, so every signal available without a browser —
 * types, lint, unit tests, network activity — looked healthy.
 *
 * Nothing short of measuring real layout catches that, hence Playwright.
 */

/**
 * Serve tiles locally. CI has no route to Esri, and depending on a third party
 * would make this test fail for reasons that have nothing to do with the app.
 */
async function stubTiles(page: Page): Promise<() => number> {
  const tile = fakeTile();
  let count = 0;
  await page.route('**://server.arcgisonline.com/**', async (route) => {
    count++;
    await route.fulfill({ status: 200, contentType: 'image/png', body: tile });
  });
  return () => count;
}

test('map canvas fills the viewport', async ({ page }) => {
  await stubTiles(page);
  await page.goto('/');
  await page.getByRole('button', { name: /Skip/ }).click();

  const canvas = page.locator('canvas.maplibregl-canvas');
  await expect(canvas).toBeVisible();

  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();

  // The regression: a collapsed container leaves the canvas at its intrinsic
  // 300px default while everything else looks fine. Assert against the actual
  // viewport rather than a magic number.
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height).toBeGreaterThan(viewport!.height * 0.9);
  expect(box!.width).toBeGreaterThan(viewport!.width * 0.9);
});

test('map requests tiles and reports no errors', async ({ page }) => {
  const tileCount = await stubTiles(page);

  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(String(e)));
  page.on('response', (r) => {
    if (r.status() >= 400) problems.push(`${r.status()} ${r.url()}`);
  });

  await page.goto('/');
  await page.getByRole('button', { name: /Skip/ }).click();
  await expect
    .poll(tileCount, { message: 'expected the basemap to request tiles' })
    .toBeGreaterThan(0);

  expect(problems).toEqual([]);
});

test('chrome floats over the map without displacing it', async ({ page }) => {
  await stubTiles(page);
  await page.goto('/');
  await page.getByRole('button', { name: /Skip/ }).click();

  const canvas = page.locator('canvas.maplibregl-canvas');
  const before = await canvas.boundingBox();

  // Opening a panel must not resize the canvas — losing your place mid
  // measurement is the difference between a tool and a toy.
  await page.keyboard.press('?');
  await expect(page.getByRole('dialog')).toBeVisible();
  const after = await canvas.boundingBox();

  expect(after).toEqual(before);
});
