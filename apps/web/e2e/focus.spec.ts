import { test, expect, type Page } from '@playwright/test';

import { armTool, clickMap, course, openEditor, place, rail, waitForSave } from './fixtures';

/**
 * Focus: what the editor is set up for right now.
 *
 * The taxonomy is unit-tested in @hyzerlines/core — which kind belongs to which
 * focus, and that `byFocus` reorders without dropping anything. What only a
 * browser can answer is whether the three things a focus is allowed to change
 * actually change, and whether the one thing it must never do stays undone.
 */

const focusChip = (page: Page, name: string) => page.getByRole('radio', { name, exact: true });

const setFocus = async (page: Page, name: string) => {
  await focusChip(page, name).click();
  await expect(focusChip(page, name)).toHaveAttribute('aria-checked', 'true');
};

test.describe('focus', () => {
  test('changes which tools the rail offers', async ({ page }) => {
    await openEditor(page, { zoom: 16 });

    // Play draws the shot; it does not draw the land.
    await expect(
      rail(page).getByRole('button', { name: 'Tee pad', exact: true }),
    ).toBeVisible();
    await expect(rail(page).getByRole('button', { name: 'Path', exact: true })).toHaveCount(0);

    await setFocus(page, 'Land');
    await expect(rail(page).getByRole('button', { name: 'Path', exact: true })).toBeVisible();
    await expect(
      rail(page).getByRole('button', { name: 'Property boundary', exact: true }),
    ).toBeVisible();
    await expect(rail(page).getByRole('button', { name: 'Tee pad', exact: true })).toHaveCount(
      0,
    );

    // Navigation is not a focus's business and stays in every one of them.
    await expect(rail(page).getByRole('button', { name: 'Select' })).toBeVisible();
  });

  /*
   * The rule the whole design rests on, asserted rather than trusted.
   *
   * A focus reorders and re-arms. It must never take a feature off the map or
   * make one unselectable — the moment it does, it stops being a focus and
   * becomes a mode you have to escape from to do ordinary work.
   */
  test('never hides a feature, and never makes one unreachable', async ({ page }) => {
    await openEditor(page, { zoom: 16 });
    await place(page, 'Tee pad', 480, 500);
    await place(page, 'Target', 900, 320);
    await page.getByRole('button', { name: 'Add hole' }).click();
    await page.keyboard.press('Escape');

    const drawn = () =>
      page.evaluate(
        () => (window.hyzerlinesMap?.querySourceFeatures('course-features') ?? []).length,
      );
    const inPlay = await drawn();
    expect(inPlay).toBeGreaterThan(0);

    await setFocus(page, 'Land');
    // Same features on the map. Land does not draw tees; it still shows them.
    await expect.poll(drawn).toBe(inPlay);

    /* And the tee is still selectable from a focus that cannot draw one.
       Twice, because the first click on anything in a hole selects the hole —
       the ordinary grouping idiom, unchanged by focus. */
    await clickMap(page, 480, 500);
    await clickMap(page, 480, 500);
    await expect(page.getByRole('textbox', { name: 'Feature name' })).toHaveAttribute(
      'placeholder',
      'Tee pad',
    );
  });

  test('changes which panel the left column shows', async ({ page }) => {
    await openEditor(page, { zoom: 16 });
    await place(page, 'Tee pad', 480, 500);
    await place(page, 'Target', 900, 320);
    await page.getByRole('button', { name: 'Add hole' }).click();
    await page.keyboard.press('Escape');

    await expect(page.getByRole('button', { name: 'Add hole' })).toBeVisible();

    await setFocus(page, 'Land');
    // The holes panel is gone, and the land inventory is in its place.
    await expect(page.getByRole('button', { name: 'Add hole' })).toHaveCount(0);
    await expect(page.getByText(/Nothing traced yet/)).toBeVisible();
  });

  /*
   * A focus with no milestone behind it still renders and says so. Hiding it
   * would leave the structure invisible exactly when somebody is learning it —
   * the reasoning inherited from the empty Layouts tab this replaces.
   */
  test('says so when a focus has nothing behind it yet', async ({ page }) => {
    await openEditor(page, { zoom: 16 });

    await setFocus(page, 'Routing');
    await expect(page.getByText(/Coming in a later release/)).toBeVisible();
    // No palette either: a focus that draws nothing must not offer a divider
    // against a gap where its tools would have been.
    await expect(rail(page).getByRole('button', { name: 'Tee pad', exact: true })).toHaveCount(
      0,
    );
    await expect(rail(page).getByRole('button', { name: 'Path', exact: true })).toHaveCount(0);
  });

  /*
   * Switching with a tool armed would leave the next click drawing something
   * the palette has stopped admitting to.
   */
  test('disarms the tool it was carrying', async ({ page }) => {
    await openEditor(page, { zoom: 16 });
    await armTool(page, 'Tee pad');
    await expect(
      rail(page).getByRole('button', { name: 'Tee pad', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');

    await setFocus(page, 'Land');
    await setFocus(page, 'Play');
    await expect(rail(page).getByRole('button', { name: 'Select' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // And a click on the map draws nothing, because nothing is armed.
    const before = (await course(page)).features.length;
    await clickMap(page, 600, 400);
    expect((await course(page)).features).toHaveLength(before);
  });

  /*
   * A preference, not document state. Somebody who spent the afternoon tracing
   * the tree line opens the tab again to keep tracing the tree line.
   */
  test('survives a reload', async ({ page }) => {
    await openEditor(page, { zoom: 16 });
    await place(page, 'Tee pad', 480, 500);
    await setFocus(page, 'Land');
    await waitForSave(page);

    await page.reload();
    await page.locator('[data-hydrated="true"]').waitFor({ state: 'attached' });

    await expect(focusChip(page, 'Land')).toHaveAttribute('aria-checked', 'true');
    await expect(rail(page).getByRole('button', { name: 'Path', exact: true })).toBeVisible();
  });
});

/**
 * Where two features overlap, the focus decides which one answers.
 *
 * Ordering, not filtering: the loser is still under the cursor and still
 * reachable — from the other focus, or through the panel. This is the only one
 * of the three effects invisible until two shapes are stacked, which is why it
 * needs a browser and a deliberate overlap.
 */
test('the focused feature wins a click where two overlap', async ({ page }) => {
  await openEditor(page, { zoom: 15 });

  /*
   * An OB area (Play) with a path (Land) running through it.
   *
   * Deliberately not two areas. A property boundary is drawn with no fill —
   * only its outline is clickable — so two stacked areas would never actually
   * put two candidates under one point, and the test would pass by accident.
   */
  await armTool(page, 'Out of bounds');
  await clickMap(page, 450, 300);
  await clickMap(page, 850, 300);
  await clickMap(page, 850, 560);
  await clickMap(page, 450, 560);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');

  await armTool(page, 'Path');
  await clickMap(page, 500, 430);
  await clickMap(page, 800, 430);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');

  /* Unnamed features show their kind as the name field's placeholder, which is
     the only on-screen statement of what is selected when nothing is named. */
  const selectedKind = () =>
    page.getByRole('textbox', { name: 'Feature name' }).getAttribute('placeholder');

  // The midpoint of the path, which is also inside the OB area.
  await setFocus(page, 'Play');
  await clickMap(page, 650, 430);
  await expect.poll(selectedKind).toBe('Out of bounds');

  await page.keyboard.press('Escape');
  await setFocus(page, 'Land');
  await clickMap(page, 650, 430);
  await expect.poll(selectedKind).toBe('Path');

  // Both are still in the document. The focus chose between them; it removed
  // neither.
  const kinds = (await course(page)).features.map((f) => f.kind).sort();
  expect(kinds).toEqual(['ob', 'path']);
});
