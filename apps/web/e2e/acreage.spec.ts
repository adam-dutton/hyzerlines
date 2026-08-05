import { test, expect, type Page } from '@playwright/test';

import { clickMap, course, openEditor, place, rail } from './fixtures';

/**
 * Boundaries and acreage, through the real UI.
 *
 * The area maths and the chart lookup are unit-tested in @hyzerlines/core
 * against independently known values. What only a browser can answer is whether
 * drawing a boundary reaches the document, whether the panel finds the number,
 * and whether the comparison stays withheld until it has what it needs.
 */

/** Draw a rectangular property boundary, leaving it selected. */
async function drawBoundary(page: Page): Promise<void> {
  await rail(page).getByRole('button', { name: 'Property boundary', exact: true }).click();
  await clickMap(page, 330, 560);
  await clickMap(page, 900, 560);
  await clickMap(page, 900, 200);
  await clickMap(page, 330, 200);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('textbox', { name: 'Feature name' })).toBeVisible();
}

test.describe('acreage', () => {
  test('a drawn boundary reports its area, in acres', async ({ page }) => {
    await openEditor(page, { zoom: 15 });
    await drawBoundary(page);

    expect((await course(page)).features.filter((f) => f.kind === 'boundary')).toHaveLength(1);

    /*
     * Acres, not square metres. Every land registry, parks department and the
     * PDGA's own chart quotes acreage, and a site measured in anything else has
     * to be converted before it can be compared with any of them.
     */
    await expect(page.getByText(/[\d.,]+ acres/).first()).toBeVisible();
  });

  test('the chart comparison waits for a foliage density', async ({ page }) => {
    await openEditor(page, { zoom: 15 });

    // A blue tee, so the course has a skill level to index the chart by.
    await place(page, 'Tee pad', 420, 520);
    await place(page, 'Target', 760, 380);
    await page.getByRole('button', { name: 'Add hole' }).click();
    await page.evaluate(() => {
      const store = window.hyzerlinesStore!;
      const tee = store.getSnapshot().course.features.find((f) => f.kind === 'tee')!;
      store.dispatch({ type: 'setProp', id: tee.id, key: 'color', value: 'blue' });
    });

    await drawBoundary(page);
    const foliage = page.getByRole('combobox', { name: 'Foliage' });
    await expect(foliage).toBeVisible();

    /*
     * Nothing to compare against yet. The chart is indexed by foliage density
     * and publishes three columns with none marked typical, so an unset density
     * has to leave the area measured and the guidance withheld rather than
     * quietly picking a column.
     */
    await page.keyboard.press('Escape');
    await expect(page.getByText(/Set the boundary’s foliage density/)).toBeVisible();
    await expect(page.getByText(/The PDGA chart gives/)).toBeHidden();

    // Set it, and the guidance appears.
    await page.evaluate(() => {
      const store = window.hyzerlinesStore!;
      const boundary = store.getSnapshot().course.features.find((f) => f.kind === 'boundary')!;
      store.dispatch({ type: 'setProp', id: boundary.id, key: 'foliage', value: 'average' });
    });

    await expect(page.getByText(/The PDGA chart gives \d+–\d+ acres/)).toBeVisible();
  });
});
