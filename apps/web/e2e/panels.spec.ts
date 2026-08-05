import { test, expect, type Page } from '@playwright/test';

import { clickMap, openEditor, openSection, place, rail, waitForSave } from './fixtures';

/**
 * The insides of the inspectors.
 *
 * Most of what these check is arrangement, which sounds like it should not
 * need a test — until a field moves out of one panel and the control that used
 * to set it is a checkbox somewhere else that now disagrees with it. The two
 * worth the most here are the ones where a rearrangement changed behaviour:
 * "Not part of a hole" replacing the `standalone` checkbox, and "align to
 * fairway" being the absence of a stored bearing rather than a flag beside it.
 */

/** A hole with both ends, left selected. */
async function holeWithEnds(page: Page): Promise<void> {
  await openEditor(page, { zoom: 16 });
  await page.getByRole('button', { name: 'Add hole' }).click();
  for (const [tool, x, y] of [
    ['Tee pad', 430, 500],
    ['Target', 860, 240],
  ] as const) {
    await rail(page).getByRole('button', { name: tool, exact: true }).click();
    await clickMap(page, x, y);
  }
}

const selectTee = (page: Page) => page.getByRole('button', { name: /Select Tee pad/ }).click();

test.describe('the course panel', () => {
  test('name, location and description are all editable in the header', async ({ page }) => {
    await openEditor(page, { zoom: 16 });

    await page.getByRole('textbox', { name: 'Course name' }).fill('Gleneagle North');
    await page.getByRole('textbox', { name: 'Course location' }).fill('Colorado Springs, CO');
    await page
      .getByRole('textbox', { name: 'Course description' })
      .fill('Nine holes through the neighborhood greenway.');

    await waitForSave(page);
    await page.reload();
    await page.locator('[data-hydrated="true"]').waitFor({ state: 'attached' });

    await expect(page.getByRole('textbox', { name: 'Course name' })).toHaveValue(
      'Gleneagle North',
    );
    await expect(page.getByRole('textbox', { name: 'Course location' })).toHaveValue(
      'Colorado Springs, CO',
    );
    await expect(page.getByRole('textbox', { name: 'Course description' })).toHaveValue(
      'Nine holes through the neighborhood greenway.',
    );
  });

  /*
   * The reason the sections fold at all: unbounded, this panel filled its
   * column and pushed the hole list out of reach. Closed by default is what
   * keeps that from coming back one section at a time.
   */
  test('sections start closed and unmount what they hold', async ({ page }) => {
    await openEditor(page, { zoom: 16 });

    const fairways = page.getByRole('checkbox', { name: 'Fairways', exact: true });
    await expect(fairways).toBeHidden();

    await openSection(page, 'Settings');
    await expect(fairways).toBeVisible();
  });

  test('the totals moved to the header, next to the name', async ({ page }) => {
    await openEditor(page, { zoom: 16 });
    await expect(page.getByText('No holes yet')).toBeVisible();

    await place(page, 'Tee pad', 430, 500);
    await place(page, 'Target', 860, 240);
    await page.getByRole('button', { name: 'Add hole' }).click();

    await expect(page.getByText(/1 hole · Par \d+ · [\d,]+ ft/)).toBeVisible();
  });

  /*
   * Units are a fact about the reader, not about the course — two people
   * should be able to open one file and each see it in what they think in — so
   * they sit with the display preferences rather than in the document.
   */
  test('units switch the whole interface from Settings', async ({ page }) => {
    await openEditor(page, { zoom: 16 });
    await place(page, 'Tee pad', 430, 500);
    await place(page, 'Target', 860, 240);
    await page.getByRole('button', { name: 'Add hole' }).click();
    await page.keyboard.press('Escape');

    await expect(page.getByText(/ft/).first()).toBeVisible();

    await openSection(page, 'Settings');
    await page.getByRole('checkbox', { name: 'Feet and acres' }).uncheck();

    await expect(page.getByText(/1 hole · Par \d+ · [\d,]+ m/)).toBeVisible();
  });
});

test.describe('the feature panel', () => {
  /*
   * Selecting a tee inside a hole used to be a one-way door: the panel swapped
   * and the hole it came from vanished, with nothing to click to get back.
   */
  test('a feature says which hole it belongs to, and gets you back there', async ({ page }) => {
    await holeWithEnds(page);
    await selectTee(page);

    const crumb = page.getByRole('button', { name: 'Hole 1', exact: true });
    await expect(crumb).toBeVisible();

    await crumb.click();
    await expect(page.getByRole('textbox', { name: 'Hole name' })).toBeVisible();
  });

  test('the name is the heading, not a row beneath it', async ({ page }) => {
    await holeWithEnds(page);
    await selectTee(page);

    const name = page.getByRole('textbox', { name: 'Feature name' });
    await expect(name).toHaveAttribute('placeholder', 'Tee pad');

    await name.fill('Back pad');
    await expect(name).toHaveValue('Back pad');
    // Named, the kind is the only thing the subtitle still has to say.
    await expect(page.getByLabel('Properties').getByText('Tee pad')).toBeVisible();
  });

  /*
   * "Not assigned" and "not part of a hole" are different claims, and the
   * second used to be a checkbox that could contradict the picker beside it.
   * `standalone` is what stops rules.ts reporting a practice basket forever,
   * so the picker has to actually write it.
   */
  test('"Not part of a hole" is a choice in the picker, and sets standalone', async ({
    page,
  }) => {
    await holeWithEnds(page);
    await selectTee(page);

    const belongsTo = page.getByRole('combobox', { name: 'Hole this belongs to' });
    await expect(belongsTo).toBeVisible();

    await belongsTo.selectOption('standalone');

    const tee = async () =>
      page.evaluate(() =>
        window.hyzerlinesStore!.getSnapshot().course.features.find((f) => f.kind === 'tee')!,
      );
    await expect.poll(async () => (await tee()).props['standalone']).toBe(true);
    // And it left the hole, rather than being both at once.
    await expect
      .poll(
        async () =>
          await page.evaluate(
            () => window.hyzerlinesStore!.getSnapshot().course.holes[0]!.teeIds.length,
          ),
      )
      .toBe(0);

    // Back to a hole clears the flag, so the two can never disagree.
    await belongsTo.selectOption({ label: 'Hole 1' });
    await expect.poll(async () => (await tee()).props['standalone']).toBeUndefined();
  });

  /*
   * "Align to fairway" is the absence of a stored bearing, not a flag beside
   * one — `footprintOf` already prefers a stored bearing and falls back to the
   * fairway's. Unticking has to hand over the angle it was already facing, or
   * the field opens blank and the pad jumps to north.
   */
  test('unticking align-to-fairway keeps the angle it was facing', async ({ page }) => {
    await holeWithEnds(page);
    await selectTee(page);

    const facing = page.getByRole('spinbutton', { name: 'Facing' });
    const align = page.getByRole('checkbox', { name: 'Align to fairway' });

    await expect(align).toBeChecked();
    await expect(facing).toBeDisabled();
    const derived = await facing.inputValue();
    expect(Number(derived)).toBeGreaterThan(0);

    await align.uncheck();
    await expect(facing).toBeEnabled();
    await expect(facing).toHaveValue(derived);

    // And re-ticking gives the bearing back to the fairway.
    await align.check();
    await expect(facing).toBeDisabled();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            window.hyzerlinesStore!.getSnapshot().course.features.find((f) => f.kind === 'tee')!
              .props['bearing'],
        ),
      )
      .toBeUndefined();
  });

  test('pad dimensions sit side by side, with their unit inside the field', async ({
    page,
  }) => {
    await holeWithEnds(page);
    await selectTee(page);

    const width = page.getByRole('spinbutton', { name: 'Pad width' });
    const length = page.getByRole('spinbutton', { name: 'Pad length' });

    await width.fill('12');
    await length.fill('10');

    // Stored in metres however they were typed — the document never holds feet.
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            window.hyzerlinesStore!.getSnapshot().course.features.find((f) => f.kind === 'tee')!
              .props['width'],
        ),
      )
      .toBeCloseTo(3.6576, 3);

    // Both boxes are on one row.
    const w = await width.boundingBox();
    const l = await length.boundingBox();
    expect(w!.y).toBe(l!.y);
    expect(w!.x).toBeLessThan(l!.x);
  });
});
