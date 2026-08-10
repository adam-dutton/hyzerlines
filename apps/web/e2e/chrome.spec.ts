import { test, expect, type Page } from '@playwright/test';

import { openEditor, place, rail } from './fixtures';

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

    // The left panel is named for the focus it is showing, which is Play by
    // default. That is the point of the rename: the panel says what it is.
    const names = ['Course', 'Play', 'Properties', 'Tools'];
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
   * The rail is centred on the top edge, between the two columns, with the
   * focus switcher stacked above it.
   *
   * "Centred" is the kind of claim that survives a refactor in the comment and
   * not in the CSS — it is one utility class, and the class that breaks it
   * (`left-4`, say) looks just as deliberate.
   */
  test('the focus switcher and the tool rail are centred, and stacked', async ({ page }) => {
    await openEditor(page, { zoom: 16 });

    const tools = await box(page, 'Tools');
    const focus = (await page.getByRole('radiogroup', { name: 'Focus' }).boundingBox())!;
    const viewport = page.viewportSize()!;

    expect(focus.y).toBeLessThan(40);
    // Stacked, not overlapping: the switcher clears the rail entirely.
    expect(focus.y + focus.height).toBeLessThanOrEqual(tools.y);

    for (const rect of [tools, focus]) {
      expect(Math.abs(rect.x + rect.width / 2 - viewport.width / 2)).toBeLessThan(2);
    }
  });

  /*
   * The recenter button stacks under the rail rather than choosing a `top` that
   * happens to clear it. It used to pick 80px, which cleared a one-panel rail;
   * the rail grew a second panel and landed on the button, leaving it visible
   * and unclickable. This asserts the clearance rather than the number.
   */
  test('the recenter button clears the rail it sits under', async ({ page }) => {
    await openEditor(page, { zoom: 16 });
    await place(page, 'Tee pad', 480, 460);
    await page.evaluate(() => window.hyzerlinesMap!.setZoom(9));

    const recenter = page.getByRole('button', { name: 'Recenter on course' });
    await expect(recenter).toBeVisible();

    const tools = await box(page, 'Tools');
    const rect = (await recenter.boundingBox())!;
    expect(rect.y).toBeGreaterThanOrEqual(tools.y + tools.height);
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

test.describe('finding the course again', () => {
  /*
   * Losing the course is easy — two scroll-wheel flicks and it is a speck in
   * the middle of a county — and the recovery was a keyboard shortcut, which is
   * not where anybody looks when the screen has gone blank green.
   *
   * Only a browser can answer this: it is a question about projected pixels
   * against the viewport, and the button's whole value is that it is absent the
   * rest of the time.
   */
  test('a lost course offers a way back, and only then', async ({ page }) => {
    await openEditor(page, { zoom: 16 });
    await place(page, 'Tee pad', 480, 460);
    await place(page, 'Target', 800, 260);

    const recenter = page.getByRole('button', { name: 'Recenter on course' });
    await expect(recenter).toBeHidden();

    // Far enough out that the course is a few pixels across.
    await page.evaluate(() => window.hyzerlinesMap!.setZoom(9));
    await expect(recenter).toBeVisible();

    await recenter.click();
    await expect(recenter).toBeHidden();
  });

  /*
   * The hole list doubles as navigation: on an eighteen-hole course it is how
   * you get from hole 3 to hole 12, and clicking a row that only highlighted
   * something off-screen made it a list of names rather than a way around.
   */
  test('selecting a hole in the list flies to it', async ({ page }) => {
    await openEditor(page, { zoom: 16 });

    await place(page, 'Tee pad', 420, 520);
    await place(page, 'Target', 560, 420);
    await page.getByRole('button', { name: 'Add hole' }).click();
    await page.keyboard.press('Escape');

    // Well away from the first, so framing it has somewhere to go.
    await place(page, 'Tee pad', 900, 200);
    await place(page, 'Target', 1000, 140);
    await page.getByRole('button', { name: 'Add hole' }).click();
    await page.keyboard.press('Escape');

    const center = () => page.evaluate(() => window.hyzerlinesMap!.getCenter().toArray());
    const before = await center();

    await page
      .getByRole('button', { name: /Hole 1/ })
      .first()
      .click();
    await page.waitForTimeout(700);

    expect(await center()).not.toEqual(before);
  });
});

/*
 * The Holes and Layouts tabs are gone; the focus does that job now, and does
 * more of it — the same switch changes the palette and what wins a click, which
 * a tab could never do. What that strip asserted lives in `focus.spec.ts`: the
 * panel swaps, and a focus with nothing behind it says so.
 */
