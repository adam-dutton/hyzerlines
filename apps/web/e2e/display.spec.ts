import { test, expect, type Page } from '@playwright/test';
import { TARGET_CIRCLES } from '@hyzerlines/core';

import {
  course,
  openEditor,
  openLayers,
  place,
  setSwitch,
  switchControl,
  waitForSave,
} from './fixtures';

/**
 * The switches that decide what the map draws.
 *
 * Whether a flag reaches the GeoJSON is unit-testable and is tested in core.
 * What only a browser can answer is whether the thing actually stops being
 * drawn — the same question that hid a layer behind an expression MapLibre
 * rejected, twice, in ways nothing else could see.
 */

/**
 * How many distinct features of a layer are currently on screen.
 *
 * Distinct because `queryRenderedFeatures` returns one copy per rendered tile,
 * so a fairway straddling a seam comes back twice and a raw length is a count of
 * tiles as much as of features.
 */
const drawn = (page: Page, layer: string): Promise<number> =>
  page.evaluate((l) => {
    const hits = window.hyzerlinesMap!.queryRenderedFeatures({ layers: [l] });
    /*
     * Painted, not merely present.
     *
     * A corridor switched off stays on the map at zero opacity so the ground a
     * hole's shot runs over still selects that hole — hiding the drawing must
     * not take the click target away with it. `queryRenderedFeatures` finds it
     * either way, which is the whole point, so a test about what the map *shows*
     * has to skip the ones it is only holding.
     */
    const shown = hits.filter((f) => f.properties?.['hidden'] !== true);
    return new Set(shown.map((f) => String(f.properties?.['id'] ?? f.id))).size;
  }, layer);

/**
 * The same count, retried.
 *
 * A switch dispatches an op, React re-renders, the source takes new data and
 * the map repaints — none of it synchronous with the click, so a single read is
 * a race against the frame.
 */
const expectDrawn = (page: Page, layer: string) => expect.poll(() => drawn(page, layer));

async function courseWithAHole(page: Page): Promise<void> {
  await openEditor(page, { zoom: 16 });
  await place(page, 'Tee pad', 420, 480);
  await place(page, 'Target', 820, 260);
  await page.getByRole('button', { name: 'Add hole' }).click();
  // Back out of the hole, then into the drawer the aids now live in.
  await page.keyboard.press('Escape');
  await openLayers(page);
}

test.describe('drawing aids', () => {
  test('the course switches turn fairways off, in halves and altogether', async ({ page }) => {
    await courseWithAHole(page);

    await expectDrawn(page, 'derived-corridor').toBeGreaterThan(0);
    await expectDrawn(page, 'derived-centreline').toBeGreaterThan(0);

    // One half at a time: the corridor is how much room the shot has, the line
    // is where it goes, and they are worth seeing separately.
    await setSwitch(page, 'Corridors', false);
    await expectDrawn(page, 'derived-corridor').toBe(0);
    await expectDrawn(page, 'derived-centreline').toBeGreaterThan(0);

    /*
     * The master overrules its parts rather than sitting beside them. With
     * fairways off, both halves go and neither child is reachable — otherwise
     * "off" would be a state you could half-escape from.
     */
    await setSwitch(page, 'Corridors', true);
    await setSwitch(page, 'Fairways', false);
    await expectDrawn(page, 'derived-corridor').toBe(0);
    await expectDrawn(page, 'derived-centreline').toBe(0);
    await expect(switchControl(page, 'Lines')).toBeDisabled();
    await expect(switchControl(page, 'Corridors')).toBeDisabled();

    // And back, with the children remembering where they were.
    await setSwitch(page, 'Fairways', true);
    await expectDrawn(page, 'derived-corridor').toBeGreaterThan(0);
  });

  /*
   * Counted across the three ring layers rather than one.
   *
   * Each circle is its own layer now, because each can carry its own dash and
   * `line-dasharray` takes no data-driven expression — see `derivedLayers`. The
   * question the test asks is unchanged: how many rings are on the map.
   */
  const drawnCircles = async (page: Page): Promise<number> => {
    const counts = await Promise.all(
      TARGET_CIRCLES.map((circle) => drawn(page, `derived-circle-${circle.id}`)),
    );
    return counts.reduce((sum, n) => sum + n, 0);
  };

  test('each putting circle has its own switch', async ({ page }) => {
    await courseWithAHole(page);

    await expect.poll(() => drawnCircles(page)).toBe(3);

    await setSwitch(page, 'Circle 2', false);
    await expect.poll(() => drawnCircles(page)).toBe(2);

    await setSwitch(page, 'Putting circles', false);
    await expect.poll(() => drawnCircles(page)).toBe(0);
  });

  /*
   * Per hole, and it has to take the handles with it: an aid you cannot see
   * must not be one you can reshape by accident.
   */
  test('a hole can hide its own fairway, handles and all', async ({ page }) => {
    await courseWithAHole(page);

    await page
      .getByRole('button', { name: /Hole 1/ })
      .first()
      .click();
    await expect(switchControl(page, 'Show fairway')).toBeChecked();
    // `edit-vertex`, not `edit-midpoint`: a fairway has no midpoint handles —
    // the middle one landed on the hole's number. See `vertexHandles`.
    await expectDrawn(page, 'edit-vertex').toBeGreaterThan(0);

    await setSwitch(page, 'Show fairway', false);
    await expectDrawn(page, 'derived-corridor').toBe(0);
    await expectDrawn(page, 'derived-centreline').toBe(0);
    await expectDrawn(page, 'edit-vertex').toBe(0);

    // The hole is still a hole: its number stays on the map, at the midpoint of
    // a shot the map is no longer drawing.
    await expectDrawn(page, 'hole-label-disc').toBe(1);
  });

  test('the switches survive a reload', async ({ page }) => {
    await courseWithAHole(page);
    await setSwitch(page, 'Putting circles', false);

    await waitForSave(page);
    await page.reload();
    await page.locator('[data-hydrated="true"]').waitFor({ state: 'attached' });
    await page.waitForTimeout(500);

    // Read off the map, not off the panel: what survived a reload is the
    // document's business, and the section it is set from starts closed again.
    await expect.poll(() => drawnCircles(page)).toBe(0);
  });
});

/**
 * A tee pad and the glyph that stands in for it, and never both.
 *
 * Below the zoom where the real rectangle is bigger than its own marker, the
 * rectangle is a smudge — three pixels inside a thirty-pixel glyph, asking the
 * reader to believe the small one is the measurement. So one or the other.
 */
test.describe('the tee pad and its marker', () => {
  const visible = (page: Page, layer: string): Promise<boolean> =>
    page.evaluate(
      (id) => (window.hyzerlinesMap?.queryRenderedFeatures({ layers: [id] }) ?? []).length > 0,
      layer,
    );

  test('swaps at the zoom the pad outgrows the glyph', async ({ page }) => {
    await openEditor(page, { zoom: 17 });
    await place(page, 'Tee pad', 560, 500);
    await place(page, 'Target', 700, 220);
    await page.getByRole('button', { name: 'Add hole' }).click();
    await page.keyboard.press('Escape');

    // Zoomed out to a whole hole: the marker, and no rectangle.
    await expect.poll(() => visible(page, 'derived-marker-tee')).toBe(true);
    expect(await visible(page, 'derived-footprint-tee')).toBe(false);

    /*
     * A 3 m pad reaches 36 px somewhere above zoom 20 — see PAD_LEGIBLE_ZOOM,
     * which is arithmetic rather than a chosen number. 21 is comfortably past
     * it and 18 comfortably short, so this asserts the swap without pinning the
     * formula's exact answer.
     *
     * Centred on the pad each time, because zooming in four levels off-centre
     * would put it a long way off screen and prove nothing about either layer.
     */
    const at = async (zoom: number) => {
      const doc = await course(page);
      const tee = doc.features.find((f) => f.kind === 'tee')!;
      await page.evaluate(
        ([centre, z]) =>
          window.hyzerlinesMap!.jumpTo({
            center: centre as [number, number],
            zoom: z as number,
          }),
        [tee.geometry.coordinates as [number, number], zoom] as const,
      );
    };

    await at(21);
    await expect.poll(() => visible(page, 'derived-footprint-tee')).toBe(true);
    expect(await visible(page, 'derived-marker-tee')).toBe(false);

    await at(18);
    await expect.poll(() => visible(page, 'derived-marker-tee')).toBe(true);
    expect(await visible(page, 'derived-footprint-tee')).toBe(false);
  });
});
