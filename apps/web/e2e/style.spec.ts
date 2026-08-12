import { test, expect, type Page } from '@playwright/test';

import { openEditor, place, waitForSave } from './fixtures';

/**
 * Restyling the map.
 *
 * The stylesheet is in the document, so the questions worth asking are whether
 * a control reaches the map, whether it reaches the *file*, and whether giving
 * a value back really gives it back rather than freezing today's default into
 * the course.
 */

/**
 * A paint property as MapLibre currently holds it.
 *
 * Null when the layer is not there yet, rather than throwing: after a reload
 * these run before the style has parsed, and `getPaintProperty` on a missing
 * layer is an exception rather than an absence. Every assertion polls, so a
 * null is simply "not yet".
 */
const paint = (page: Page, layer: string, property: string): Promise<unknown> =>
  page.evaluate(
    ([id, prop]) => {
      const map = window.hyzerlinesMap;
      if (!map?.getLayer(id as string)) return null;
      return map.getPaintProperty(id as string, prop as string);
    },
    [layer, property] as const,
  );

async function styleFocus(page: Page) {
  await openEditor(page, { zoom: 17 });
  await place(page, 'Tee pad', 520, 520);
  await place(page, 'Target', 720, 240);
  await page.getByRole('button', { name: 'Add hole' }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('radio', { name: 'Style', exact: true }).click();
}

test.describe('map style', () => {
  test('a width reaches the map, the document, and comes back', async ({ page }) => {
    await styleFocus(page);
    await page.getByRole('button', { name: 'Fairway' }).click();

    await expect.poll(() => paint(page, 'derived-centreline', 'line-width')).toBe(2.5);

    await page.getByRole('slider', { name: 'Width' }).fill('9');
    await expect.poll(() => paint(page, 'derived-centreline', 'line-width')).toBe(9);

    /*
     * And it is in the file, not in this browser. The look of a course travels
     * with it — see style.ts — so a reload has to bring it back.
     */
    // Autosave is debounced, so the reload has to wait for the write rather
    // than race it.
    await waitForSave(page);
    await page.reload();
    await expect.poll(() => paint(page, 'derived-centreline', 'line-width')).toBe(9);

    /*
     * Reset is a deletion, not a second guess at the default. Writing today's
     * value into the document would freeze it there and opt the course out of
     * every future improvement — so the check is that the *override* is gone,
     * read off the document rather than off the map.
     */
    await page.getByRole('radio', { name: 'Style', exact: true }).click();
    await page.getByRole('button', { name: 'Fairway' }).click();
    await page.getByRole('button', { name: 'Reset to default' }).first().click();

    await expect.poll(() => paint(page, 'derived-centreline', 'line-width')).toBe(2.5);
    const stored = await page.evaluate(
      () =>
        window.hyzerlinesStore!.getSnapshot().course as unknown as {
          style: { features: Record<string, unknown> };
        },
    );
    expect(stored.style.features['fairway']).toBeUndefined();
  });

  test('a dash is a layer property, not an expression', async ({ page }) => {
    await styleFocus(page);
    await page.getByRole('button', { name: 'Out of bounds' }).click();

    // Solid by default: MapLibre wants the property absent rather than [1, 0].
    await expect
      .poll(() => paint(page, 'features-ob-stroke', 'line-dasharray'))
      .toBeUndefined();

    await page.getByRole('combobox', { name: 'Dash' }).selectOption('dotted');
    await expect
      .poll(() => paint(page, 'features-ob-stroke', 'line-dasharray'))
      .toEqual([1, 2]);

    /*
     * And it reached out-of-bounds *only*. Every kind gets its own layer
     * precisely so a dash can differ between them — `line-dasharray` takes no
     * data-driven expression, so one shared layer could not.
     */
    expect(await paint(page, 'features-hazard-stroke', 'line-dasharray')).toBeUndefined();
  });

  test('the hole number takes its own colour and size', async ({ page }) => {
    await styleFocus(page);
    await page.getByRole('button', { name: 'Hole numbers' }).click();

    await expect.poll(() => paint(page, 'hole-label', 'text-color')).toBe('#ffffff');

    await page.getByRole('slider', { name: 'Size' }).fill('30');
    await expect
      .poll(() =>
        page.evaluate(() => window.hyzerlinesMap?.getLayoutProperty('hole-label', 'text-size')),
      )
      .toBe(30);
    // The disc grows with it, so a bigger numeral does not outgrow the shape
    // that exists to make it readable.
    await expect
      .poll(() => paint(page, 'hole-label-disc', 'circle-radius'))
      .toBeGreaterThan(20);
  });

  test('the style focus draws nothing and hides nothing', async ({ page }) => {
    await styleFocus(page);

    /*
     * The rule every focus obeys, asserted here because this is the focus most
     * likely to break it: it claims no kinds at all. The palette offers only
     * Select, and every feature on the map is still there to be clicked.
     */
    const tools = page.getByRole('toolbar', { name: 'Tools' }).getByRole('button');
    await expect(tools).toHaveCount(1);
    await expect(tools.first()).toHaveAccessibleName('Select');

    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window.hyzerlinesMap?.queryRenderedFeatures({ layers: ['features-target'] }) ?? [])
              .length,
        ),
      )
      .toBeGreaterThan(0);
  });
});
