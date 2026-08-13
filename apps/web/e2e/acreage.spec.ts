import { test, expect, type Page } from '@playwright/test';

import {
  armTool,
  clickMap,
  course,
  dragCanvas,
  openEditor,
  openSection,
  place,
  rail,
} from './fixtures';

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
  /*
   * Out of whatever is selected first.
   *
   * A boundary is the course's, not a hole's — and anything drawn while a hole
   * is selected joins that hole. It also means the rail is showing one column
   * rather than two, which is what keeps these clicks on the map.
   */
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await armTool(page, 'Property boundary');
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
     *
     * Read off the boundary's own panel, which is what drawing one opens. The
     * list beside it is shrunk to make room for that panel, so the same figure
     * in the list row is clipped — asking for it there would be asking the
     * narrow column a question the wide one is already answering.
     */
    await expect(
      page
        .getByRole('region', { name: 'Properties' })
        .getByText(/[\d.,]+ acres/)
        .first(),
    ).toBeVisible();
  });

  /*
   * With no boundary the site row used to vanish, which was right about not
   * printing "0 acres" and wrong about everything else: acreage is one of the
   * two headline numbers in Analysis, and a row that is not there leaves no
   * trace of what is missing or how to get it.
   */
  test('with no boundary, Analysis offers to draw one', async ({ page }) => {
    await openEditor(page, { zoom: 15 });
    await openSection(page, 'Analysis');

    await page.getByRole('button', { name: 'Draw a property boundary' }).click();

    // The action arms the tool, so the next click on the map starts drawing.
    await expect(
      rail(page).getByRole('button', { name: 'Property boundary', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
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
    await openSection(page, 'Analysis');
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

  /*
   * A boundary has no fill, so `features-polygon-fill` is not what answers for
   * it. That layer is the click target for every other area, which makes this
   * the one kind that could quietly become unselectable — invisible to types,
   * to lint and to every unit test.
   */
  test('a boundary is still selectable without a fill to click', async ({ page }) => {
    await openEditor(page, { zoom: 15 });
    await drawBoundary(page);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('textbox', { name: 'Feature name' })).toBeHidden();

    // On the edge, which is all there is to hit.
    await clickMap(page, 615, 560);
    await expect(page.getByRole('textbox', { name: 'Feature name' })).toBeVisible();
    await expect(
      page
        .getByRole('region', { name: 'Properties' })
        .getByText(/[\d.,]+ acres/)
        .first(),
    ).toBeVisible();
  });

  /*
   * An area is usually the biggest thing on the screen, so if its fill were a
   * drag target the map would stop panning: you reach for the one gesture used
   * constantly and take the boundary with you instead. Only a browser can
   * answer this — it is a question about hit-testing and which handler claims
   * the pointer.
   */
  test('dragging across an area pans the map and leaves the area where it was', async ({
    page,
  }) => {
    await openEditor(page, { zoom: 15 });
    await drawBoundary(page);
    await page.keyboard.press('Escape');

    const ringOf = async () =>
      (await course(page)).features.find((f) => f.kind === 'boundary')!.geometry.coordinates;
    const before = await ringOf();
    const center = () => page.evaluate(() => window.hyzerlinesMap!.getCenter().toArray());
    const centerBefore = await center();

    // Well inside the boundary, so the press lands on its fill.
    await dragCanvas(page, [500, 400], [640, 300]);
    await page.waitForTimeout(300);

    expect(await ringOf()).toEqual(before);
    expect(await center()).not.toEqual(centerBefore);
  });
});
