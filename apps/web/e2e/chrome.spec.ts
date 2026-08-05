import { test, expect, type Page } from '@playwright/test';

import { clickMap, openEditor, place, rail } from './fixtures';

/**
 * Where the chrome is, and what is reachable from it.
 *
 * Layout is the one thing a browser is the only witness to. A panel that has
 * quietly grown until it covers the button below it, or two columns that
 * overlap the camera controls in the corner, are invisible to types, to lint
 * and to every unit test — and they were both real, found by taking a
 * screenshot rather than by running the suite.
 */

const box = async (page: Page, name: string) => {
  // By role, not by label: the tool rail is a `toolbar` and the panels are
  // `region`s, and `getByLabel` picks up form controls with the same name.
  const locator =
    name === 'Tools'
      ? page.getByRole('toolbar', { name })
      : page.getByRole('region', { name, exact: true });
  const rect = await locator.boundingBox();
  if (!rect) throw new Error(`${name} has no box`);
  return rect;
};

test.describe('chrome layout', () => {
  /*
   * The two columns share a width and a top edge, which is what makes them
   * read as a frame around the map rather than as unrelated cards. Asserted
   * rather than eyeballed because both are set in separate files.
   */
  test('the course and properties columns are the same width and level', async ({ page }) => {
    await openEditor(page, { zoom: 16 });
    await place(page, 'Tee pad', 480, 460);
    await place(page, 'Target', 800, 260);
    await page.getByRole('button', { name: 'Add hole' }).click();

    const course = await box(page, 'Course');
    const properties = await box(page, 'Properties');

    expect(properties.width).toBe(course.width);
    expect(properties.y).toBe(course.y);
    // One at each edge, with the map between them.
    expect(course.x).toBeLessThan(properties.x);
  });

  /**
   * Every panel and control has to keep off every other one.
   *
   * Two of these overlapped during this change: the course panel grew tall
   * enough to push the hole list under the findings card, putting Add hole
   * out of reach, and the properties column ran down into the camera controls
   * in the same corner. Both presented as a click that silently did nothing.
   */
  test('no two pieces of chrome overlap', async ({ page }) => {
    await openEditor(page, { zoom: 16 });
    await place(page, 'Tee pad', 480, 460);
    await place(page, 'Target', 800, 260);
    await page.getByRole('button', { name: 'Add hole' }).click();

    const names = ['Course', 'Holes and layouts', 'Properties', 'Tools'];
    const boxes = await Promise.all(names.map((name) => box(page, name)));

    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!;
        const b = boxes[j]!;
        const overlaps =
          a.x < b.x + b.width &&
          b.x < a.x + a.width &&
          a.y < b.y + b.height &&
          b.y < a.y + a.height;
        expect(overlaps, `${names[i]} overlaps ${names[j]}`).toBe(false);
      }
    }
  });

  /*
   * Undo and redo moved out of the top bar and into the rail. Scoped to the
   * toolbar so this fails if they end up somewhere else and merely happen to
   * still exist.
   */
  test('undo and redo live in the tool rail', async ({ page }) => {
    await openEditor(page, { zoom: 16 });

    const undo = rail(page).getByRole('button', { name: 'Undo' });
    await expect(undo).toBeDisabled();

    await place(page, 'Tee pad', 480, 460);
    await expect(undo).toBeEnabled();

    await undo.click();
    await expect(undo).toBeDisabled();
  });

  /*
   * The AGPL's section 13 obligation, and the providers' attribution terms.
   * Both are conditions on shipping this at all, so both get a test rather
   * than a comment asking people to remember.
   */
  test('attribution and the source link are on screen', async ({ page }) => {
    await openEditor(page, { zoom: 16 });

    await expect(page.getByText(/Esri/)).toBeVisible();
    const source = page.getByRole('link', { name: 'Source' });
    await expect(source).toBeVisible();
    await expect(source).toHaveAttribute('href', /github\.com/);
  });

  test('the course menu carries what the top bar used to', async ({ page }) => {
    await openEditor(page, { zoom: 16 });
    await page.getByRole('button', { name: 'Menu' }).click();

    for (const name of [
      /Open a course file/,
      /Save to a file/,
      /theme/,
      /Keyboard shortcuts/,
      /Source code/,
    ]) {
      await expect(page.getByRole('menuitem', { name })).toBeVisible();
    }
  });
});

test.describe('holes and layouts', () => {
  test('the tab badge counts holes, and layouts says it is coming', async ({ page }) => {
    await openEditor(page, { zoom: 16 });

    const holesTab = page.getByRole('tab', { name: /Holes/ });
    await expect(holesTab).toHaveAttribute('aria-selected', 'true');

    await page.getByRole('button', { name: 'Add hole' }).click();
    await expect(holesTab).toContainText('1');

    await page.getByRole('tab', { name: 'Layouts' }).click();
    await expect(page.getByText(/order a course is played in/)).toBeVisible();
    // The hole list is gone, not merely scrolled past.
    await expect(page.getByRole('button', { name: 'Add hole' })).toBeHidden();
  });

  /*
   * A hole could only ever be built by drawing both ends first and letting
   * `Add hole` guess which loose pair you meant. That left the empty hole this
   * panel can create with no way to be filled, and it is backwards for anyone
   * who already knows what hole 4 is.
   */
  test('a tee drawn while a hole is selected joins that hole', async ({ page }) => {
    await openEditor(page, { zoom: 16 });

    await page.getByRole('button', { name: 'Add hole' }).click();
    await expect(page.getByRole('textbox', { name: 'Hole name' })).toBeVisible();

    /*
     * Tool, click, tool, click — not the `place` helper, which presses Escape
     * afterwards to shake off the selection a placement normally leaves. Here
     * there is no such selection to shake off (the hole keeps it, which is the
     * behaviour under test) and Escape would deselect the hole instead, so the
     * helper would be testing a gesture nobody makes.
     */
    const draw = async (tool: string, x: number, y: number) => {
      await rail(page).getByRole('button', { name: tool, exact: true }).click();
      await clickMap(page, x, y);
    };

    await draw('Tee pad', 480, 460);
    await draw('Target', 800, 260);

    const hole = await page.evaluate(
      () => window.hyzerlinesStore!.getSnapshot().course.holes[0]!,
    );
    expect(hole.teeIds).toHaveLength(1);
    expect(hole.targetIds).toHaveLength(1);

    // And the panel is still describing the hole, not the basket just placed.
    await expect(page.getByRole('textbox', { name: 'Hole name' })).toBeVisible();
  });

  /*
   * The other half of that: nothing is claimed when nothing is selected, or
   * every stray practice basket would be adopted by whichever hole was last
   * looked at.
   */
  test('a tee drawn with nothing selected stays loose', async ({ page }) => {
    await openEditor(page, { zoom: 16 });

    await page.getByRole('button', { name: 'Add hole' }).click();
    await page.keyboard.press('Escape');
    await place(page, 'Tee pad', 480, 460);

    const hole = await page.evaluate(
      () => window.hyzerlinesStore!.getSnapshot().course.holes[0]!,
    );
    expect(hole.teeIds).toHaveLength(0);
  });
});
