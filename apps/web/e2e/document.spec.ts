import { test, expect, type Page } from '@playwright/test';

import { chooseBasemap, openLayers, waitForSave } from './fixtures';

/**
 * Document persistence and history, exercised through the real UI.
 *
 * The unit tests in @hyzerlines/core cover the store's logic exhaustively. What
 * they cannot cover is whether the app is actually *wired* to it: that edits
 * reach IndexedDB, that a reload restores them, and that the keyboard reaches
 * undo. Every one of those is a wiring question, and wiring only fails in a
 * browser.
 */

/**
 * Wait for the autosave restore to finish.
 *
 * Without this, a test can inspect the app during the window where it hasn't
 * yet learned whether prior work exists — and get whichever answer it happened
 * to catch.
 */
async function waitForHydration(page: Page): Promise<void> {
  await page.locator('[data-hydrated="true"]').waitFor({ state: 'attached' });
}

async function skipSearch(page: Page): Promise<void> {
  await waitForHydration(page);
  const skip = page.getByRole('button', { name: /Skip/ });
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await expect(skip).toBeHidden();
}

async function openApp(page: Page): Promise<void> {
  await page.goto('/');
  await skipSearch(page);
}

const nameField = (page: Page) => page.getByRole('textbox', { name: 'Course name' });

test.describe('document', () => {
  // A fresh origin per test: IndexedDB is shared across a context, so without
  // this each test would inherit whatever the previous one autosaved.
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test('course name survives a reload', async ({ page }) => {
    await openApp(page);

    await nameField(page).fill('Kaposia Park');
    // Longer than the 800ms autosave debounce, so the write has landed.
    await expect(page).toHaveTitle(/Kaposia Park/);
    await waitForSave(page);

    await page.reload();
    await expect(nameField(page)).toHaveValue('Kaposia Park');
  });

  test('undo reverts a typing run in one step, and redo restores it', async ({ page }) => {
    await openApp(page);
    const field = nameField(page);

    await field.fill('Kaposia');
    await expect(field).toHaveValue('Kaposia');

    // Focus the document rather than the input: undo inside a focused text field
    // is the browser's own, not ours.
    await page.locator('canvas.maplibregl-canvas').click({ position: { x: 400, y: 400 } });
    await page.keyboard.press('ControlOrMeta+z');
    await expect(field).toHaveValue('Untitled course');

    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect(field).toHaveValue('Kaposia');
  });

  test('undo button reflects whether there is anything to undo', async ({ page }) => {
    await openApp(page);
    const undo = page.getByRole('button', { name: 'Undo' });
    await expect(undo).toBeDisabled();

    await nameField(page).fill('Something');
    await expect(undo).toBeEnabled();

    await undo.click();
    await expect(undo).toBeDisabled();
  });

  /**
   * Panning must never enter the undo stack. If it did, ⌘Z after ten minutes of
   * scrolling would rewind the camera instead of the work — exactly when a
   * designer reaches for undo and is least prepared to be surprised.
   */
  test('panning the map does not become an undoable edit', async ({ page }) => {
    await openApp(page);
    const undo = page.getByRole('button', { name: 'Undo' });
    await expect(undo).toBeDisabled();

    const canvas = page.locator('canvas.maplibregl-canvas');
    await canvas.hover({ position: { x: 600, y: 400 } });
    await page.mouse.down();
    await page.mouse.move(400, 300, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(700);

    await expect(undo, 'a pan is not an edit').toBeDisabled();
  });

  test('the basemap choice is part of the document and survives a reload', async ({ page }) => {
    await openApp(page);

    await chooseBasemap(page, 'Street');
    await waitForSave(page);
    await page.reload();
    await waitForHydration(page);

    // Reopened to read it back: the panel only reports its state while open.
    await openLayers(page);
    await expect(page.getByRole('radio', { name: /Street/ })).toBeChecked();
  });

  /**
   * Courses saved before the basemap ids named a role rather than a provider.
   *
   * `basemapId` outlives the registry that wrote it, and an id nothing
   * recognises falls back to the default — so without the mapping forward, every
   * course drawn on the topographic map would quietly reopen on satellite. A
   * silent reset of somebody's choice is worse than an error, because nothing
   * tells them it happened.
   */
  test('a course saved with the old provider-named basemap id still opens on its map', async ({
    page,
  }) => {
    await openApp(page);

    await page.evaluate(() =>
      window.hyzerlinesStore!.dispatch({ type: 'setBasemap', basemapId: 'esri-topo' }),
    );

    await openLayers(page);
    await expect(page.getByRole('radio', { name: /Topographic/ })).toBeChecked();
  });

  test('the first-run search does not reappear over restored work', async ({ page }) => {
    await page.goto('/');
    await waitForHydration(page);
    // It should be there on a genuinely fresh start.
    await expect(
      page.getByRole('heading', { name: /Design a disc golf course/ }),
    ).toBeVisible();
    await skipSearch(page);

    await nameField(page).fill('In progress');
    await waitForSave(page);
    await page.reload();

    // Restoring work and then asking "find your land" would be nonsense.
    await expect(nameField(page)).toHaveValue('In progress');
    await expect(page.getByRole('heading', { name: /Design a disc golf course/ })).toBeHidden();
  });
});
