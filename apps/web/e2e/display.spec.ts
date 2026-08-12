import { test, expect, type Page } from '@playwright/test';

import {
  openEditor,
  openSection,
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
    return new Set(hits.map((f) => String(f.properties?.['id'] ?? f.id))).size;
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
  // Back to the course panel, then into the section the switches fold into.
  await page.keyboard.press('Escape');
  await openSection(page, 'Settings');
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

  test('each putting circle has its own switch', async ({ page }) => {
    await courseWithAHole(page);

    await expectDrawn(page, 'derived-circle').toBe(3);

    await setSwitch(page, 'Circle 2', false);
    await expectDrawn(page, 'derived-circle').toBe(2);

    await setSwitch(page, 'Putting circles', false);
    await expectDrawn(page, 'derived-circle').toBe(0);
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
    await expectDrawn(page, 'derived-circle').toBe(0);
  });
});
