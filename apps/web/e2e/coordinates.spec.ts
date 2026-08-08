import { test, expect, type Page } from '@playwright/test';

import { clickMap, course, openEditor, place } from './fixtures';

/**
 * Typing a feature's position in.
 *
 * The map answers "about here" and cannot answer "exactly here" — a basket
 * surveyed with a handheld, a tee off a permit drawing. The parsing is unit
 * tested exhaustively in core; what only a browser can answer is whether the
 * field is wired to the document, whether a commit actually moves the feature,
 * and whether the two numbers reach the axes they are labelled with.
 *
 * That last one is the whole risk. The document is `[lng, lat]` and the panel
 * is latitude first, so a transposition anywhere in the wiring puts a course in
 * the wrong hemisphere while every individual part looks correct.
 */

const latitude = (page: Page) => page.getByRole('textbox', { name: 'Latitude' });
const longitude = (page: Page) => page.getByRole('textbox', { name: 'Longitude' });

/** The one placed feature's stored position, straight out of the document. */
async function stored(page: Page): Promise<[number, number]> {
  const { features } = await course(page);
  const geometry = features[0]!.geometry as { coordinates: [number, number] };
  return geometry.coordinates;
}

/** Place a basket at the middle of the screen and select it. */
async function placeAndSelect(page: Page): Promise<void> {
  await place(page, 'Target', 640, 360);
  await clickMap(page, 640, 360);
  await expect(latitude(page)).toBeVisible();
}

test.describe('feature coordinates', () => {
  test('shows where the feature actually is', async ({ page }) => {
    await openEditor(page, { center: [-93.123457, 44.901234], zoom: 17 });
    await placeAndSelect(page);

    const [lng, lat] = await stored(page);
    // Latitude in the latitude box, longitude in the longitude box — and the
    // document's own numbers, not the camera's.
    await expect(latitude(page)).toHaveValue(lat.toFixed(6));
    await expect(longitude(page)).toHaveValue(lng.toFixed(6));
  });

  test('typing a latitude moves the feature and leaves the longitude alone', async ({
    page,
  }) => {
    await openEditor(page, { center: [-93.123457, 44.901234], zoom: 17 });
    await placeAndSelect(page);
    const [beforeLng] = await stored(page);

    await latitude(page).fill('44.950000');
    await latitude(page).press('Enter');

    await expect.poll(async () => (await stored(page))[1]).toBeCloseTo(44.95, 6);
    expect((await stored(page))[0]).toBeCloseTo(beforeLng, 9);
  });

  test('typing a longitude moves the feature east or west', async ({ page }) => {
    await openEditor(page, { center: [-93.123457, 44.901234], zoom: 17 });
    await placeAndSelect(page);

    await longitude(page).fill('-93.200000');
    await longitude(page).press('Enter');

    await expect.poll(async () => (await stored(page))[0]).toBeCloseTo(-93.2, 6);
  });

  /*
   * The paste. "Copy coordinates" in Google Maps gives both numbers as one
   * string, and the obvious thing to do is drop it in the first box. Taking the
   * first number and discarding the second would move the feature a hundred
   * kilometres with nothing on screen to say so.
   */
  test('a pasted pair fills both fields from either box', async ({ page }) => {
    await openEditor(page, { center: [-93.123457, 44.901234], zoom: 17 });
    await placeAndSelect(page);

    await latitude(page).fill('44.800000, -93.300000');
    await latitude(page).press('Enter');

    await expect.poll(async () => (await stored(page))[1]).toBeCloseTo(44.8, 6);
    expect((await stored(page))[0]).toBeCloseTo(-93.3, 6);

    // And the same string in the longitude box, which is just as likely.
    await longitude(page).fill('44.700000, -93.400000');
    await longitude(page).press('Enter');

    await expect.poll(async () => (await stored(page))[0]).toBeCloseTo(-93.4, 6);
    expect((await stored(page))[1]).toBeCloseTo(44.7, 6);
  });

  test('accepts degrees, minutes and seconds off a permit', async ({ page }) => {
    await openEditor(page, { center: [-93.123457, 44.901234], zoom: 17 });
    await placeAndSelect(page);

    await latitude(page).fill(`44° 54' 4.4" N`);
    await latitude(page).press('Enter');

    await expect.poll(async () => (await stored(page))[1]).toBeCloseTo(44.901222, 5);
  });

  /*
   * Nothing sensible to move to, so nothing moves. Reverting rather than
   * clamping: a feature that jumped to 90° because somebody fat-fingered an
   * extra digit is worse than one that stayed put.
   */
  test('leaves the feature alone when the text is not a coordinate', async ({ page }) => {
    await openEditor(page, { center: [-93.123457, 44.901234], zoom: 17 });
    await placeAndSelect(page);
    const before = await stored(page);

    for (const bad of ['somewhere', '91.5', '']) {
      await latitude(page).fill(bad);
      await latitude(page).press('Enter');
      expect(await stored(page), bad).toEqual(before);
    }

    // And the field goes back to showing where the feature really is.
    await expect(latitude(page)).toHaveValue(before[1].toFixed(6));
  });

  /*
   * A longitude typed into the latitude box is a mistake, not an instruction.
   * Silently accepting -93 as a latitude is impossible anyway, but the refusal
   * has to be visible: the field snaps back rather than sitting there holding
   * a number the document does not have.
   */
  test('refuses a longitude typed into the latitude box', async ({ page }) => {
    await openEditor(page, { center: [-93.123457, 44.901234], zoom: 17 });
    await placeAndSelect(page);
    const before = await stored(page);

    await latitude(page).fill('-93.123457');
    await latitude(page).press('Enter');

    expect(await stored(page)).toEqual(before);
    await expect(latitude(page)).toHaveValue(before[1].toFixed(6));
  });

  test('the move is undoable, like dragging the feature', async ({ page }) => {
    await openEditor(page, { center: [-93.123457, 44.901234], zoom: 17 });
    await placeAndSelect(page);
    const before = await stored(page);

    await latitude(page).fill('44.950000');
    await latitude(page).press('Enter');
    await expect.poll(async () => (await stored(page))[1]).toBeCloseTo(44.95, 6);

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect.poll(async () => (await stored(page))[1]).toBeCloseTo(before[1], 9);
  });

  /* An area is placed by its middle, and setting it translates the whole shape. */
  test('an area reports its center and moves whole', async ({ page }) => {
    await openEditor(page, { center: [-93.123457, 44.901234], zoom: 16 });

    await page
      .getByRole('toolbar', { name: 'Tools' })
      .getByRole('button', { name: 'Out of bounds' })
      .click();
    for (const [x, y] of [
      [500, 300],
      [700, 300],
      [700, 420],
      [500, 420],
    ]) {
      await clickMap(page, x!, y!);
    }
    await page.keyboard.press('Enter');
    await expect(page.getByText('Center', { exact: true })).toBeVisible();

    const ring = async () =>
      ((await course(page)).features[0]!.geometry as { coordinates: [number, number][] })
        .coordinates;
    const before = await ring();

    await latitude(page).fill('44.950000');
    await latitude(page).press('Enter');

    await expect.poll(async () => (await ring())[0]![1]).not.toBeCloseTo(before[0]![1], 6);

    const after = await ring();
    // Translated, not reshaped: every vertex moved by the same amount.
    const shift = after[0]![1] - before[0]![1];
    for (let i = 0; i < before.length; i++) {
      expect(after[i]![1] - before[i]![1]).toBeCloseTo(shift, 9);
      expect(after[i]![0]).toBeCloseTo(before[i]![0], 9);
    }
  });
});
