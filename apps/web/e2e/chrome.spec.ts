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

/**
 * A piece of chrome, by role.
 *
 * By role and not by label: the tool bar is a `toolbar`, the top bar is a
 * `banner`, the panels are `region`s, and `getByLabel` would pick up the form
 * controls that share their names — "Course" is both the top bar's label and,
 * until it moved, a text field's.
 */
const box = async (page: Page, name: string) => {
  const locator =
    name === 'Tools'
      ? page.getByRole('toolbar', { name })
      : name === 'Course'
        ? page.getByRole('banner', { name, exact: true })
        : page.getByRole('region', { name, exact: true });
  const rect = await locator.boundingBox();
  if (!rect) throw new Error(`${name} has no box`);
  return rect;
};

/** The top bar, as a scope. Undo, redo, Import and Export all live in it. */
const topBar = (page: Page) => page.getByRole('banner', { name: 'Course' });

test.describe('chrome layout', () => {
  /*
   * The two columns share a width and a top edge, which is what makes them
   * read as a frame around the map rather than as unrelated cards. Asserted
   * rather than eyeballed because both are set in separate files.
   */
  test('the two columns are the same width and level', async ({ page }) => {
    await openEditor(page, { zoom: 16 });
    await place(page, 'Tee pad', 480, 460);
    await place(page, 'Target', 800, 260);
    await page.getByRole('button', { name: 'Add hole' }).click();

    // The left panel is named for the focus it shows, which is Play by default.
    const left = await box(page, 'Play');
    const properties = await box(page, 'Properties');

    expect(properties.width).toBe(left.width);
    expect(properties.y).toBe(left.y);
    // One at each edge, with the map between them.
    expect(left.x).toBeLessThan(properties.x);
  });

  /*
   * The properties column is permanent now, and that is a deliberate reversal.
   *
   * It used to unmount when nothing was selected, so the column arrived and left
   * as you clicked around and moved the layout under you. With the course as its
   * third mode there is always something for it to describe, so it always has a
   * reason to be there. The cost is real and accepted: about 40% of a 1280px
   * viewport is chrome, and clicks that used to reach map at x > 1000 now land on
   * a panel — which is why the coordinates in these specs stay inside the channel
   * between the columns.
   */
  test('the properties column stays when nothing is selected', async ({ page }) => {
    await openEditor(page, { zoom: 16 });

    const properties = page.getByRole('region', { name: 'Properties', exact: true });
    await expect(properties).toBeVisible();
    // Describing the course, because that is what is left when nothing is picked.
    await expect(properties.getByRole('heading', { name: 'Course' })).toBeVisible();

    await place(page, 'Tee pad', 480, 460);
    await place(page, 'Target', 800, 260);
    await page.getByRole('button', { name: 'Add hole' }).click();
    await expect(properties).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(properties).toBeVisible();
    await expect(properties.getByRole('heading', { name: 'Course' })).toBeVisible();
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

    /*
     * The top bar is the `Course` banner now rather than a card in the left
     * column, and the left panel is named for the focus it is showing — which is
     * the point of that rename: the panel says what it is.
     */
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
   * Both centred on the viewport, at opposite edges.
   *
   * The focus switcher sits in the top bar's middle grid column, and the tool bar
   * is centred in the channel between the two panel columns — which is the same
   * centre, because the columns are the same width. "Centred" is the kind of
   * claim that survives a refactor in the comment and not in the CSS: it is one
   * declaration, and the one that breaks it looks just as deliberate.
   *
   * The switcher's centring matters more than it looks. It is `auto` between two
   * `1fr` tracks precisely so that typing in the course name cannot move it, and
   * that is what this catches — a flexed row would drift.
   */
  test('the focus switcher and the tool bar are centred, at opposite edges', async ({
    page,
  }) => {
    await openEditor(page, { zoom: 16 });

    const tools = await box(page, 'Tools');
    const focus = (await page.getByRole('radiogroup', { name: 'Focus' }).boundingBox())!;
    const viewport = page.viewportSize()!;

    // The switcher is up in the bar; the palette is down on the bottom edge.
    expect(focus.y).toBeLessThan(60);
    expect(tools.y).toBeGreaterThan(viewport.height / 2);

    for (const rect of [tools, focus]) {
      expect(Math.abs(rect.x + rect.width / 2 - viewport.width / 2)).toBeLessThan(2);
    }

    // And a long name does not shove it sideways.
    await page
      .getByRole('textbox', { name: 'Course name' })
      .fill('A course with a deliberately very long name indeed');
    const after = (await page.getByRole('radiogroup', { name: 'Focus' }).boundingBox())!;
    expect(Math.abs(after.x - focus.x)).toBeLessThan(2);
  });

  /*
   * The recenter prompt shares the camera cluster's line rather than choosing a
   * position that happens to clear something. It used to pick a `top` that
   * cleared a one-panel rail; the rail grew a second panel and landed on the
   * button, leaving it visible and unclickable. It is inside `MapControls` now,
   * so this asserts the clearance rather than the number.
   */
  test('the recenter prompt clears the tool bar and the panels', async ({ page }) => {
    await openEditor(page, { zoom: 16 });
    await place(page, 'Tee pad', 480, 460);
    await page.evaluate(() => window.hyzerlinesMap!.setZoom(9));

    const recenter = page.getByRole('button', { name: 'Recenter on course' });
    await expect(recenter).toBeVisible();

    const tools = await box(page, 'Tools');
    const properties = await box(page, 'Properties');
    const rect = (await recenter.boundingBox())!;

    // Below the palette, and clear of the column beside it.
    expect(rect.y).toBeGreaterThanOrEqual(tools.y + tools.height);
    expect(rect.x + rect.width).toBeLessThanOrEqual(properties.x);
  });

  /*
   * Undo and redo are back in the document chrome, and the palette is better for
   * it: the bar has to fit between two panel columns now, and two of its slots
   * were history. Scoped to the top bar so this fails if they end up somewhere
   * else and merely happen to still exist — and asserted absent from the palette
   * for the same reason.
   */
  test('undo and redo live in the top bar, not the palette', async ({ page }) => {
    await openEditor(page, { zoom: 16 });

    const undo = topBar(page).getByRole('button', { name: 'Undo' });
    await expect(undo).toBeDisabled();
    await expect(rail(page).getByRole('button', { name: 'Undo' })).toHaveCount(0);

    await place(page, 'Tee pad', 480, 460);
    await expect(undo).toBeEnabled();

    await undo.click();
    await expect(undo).toBeDisabled();
  });

  /*
   * Import and Export are words rather than glyphs, and they are buttons rather
   * than menu items. Opening and saving a file are the two things a designer
   * reaches for by name; hunting a hamburger for them was the cost of keeping the
   * bar tidy, and the bar has room.
   */
  test('import and export are named buttons in the top bar', async ({ page }) => {
    await openEditor(page, { zoom: 16 });

    for (const name of ['Import', 'Export']) {
      await expect(topBar(page).getByRole('button', { name, exact: true })).toBeVisible();
    }
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

  /*
   * What is left in the menu is what has nowhere better to be — that is its whole
   * membership rule, and it keeps shrinking. Open and save left most recently, for
   * the named buttons beside it, so this asserts they are *gone* from here as well
   * as what remains: two routes to one action is how they drift apart.
   */
  test('the course menu holds what has nowhere better to be', async ({ page }) => {
    await openEditor(page, { zoom: 16 });
    await page.getByRole('button', { name: 'Menu' }).click();

    for (const name of [/theme/, /Keyboard shortcuts/, /Source code/]) {
      await expect(page.getByRole('menuitem', { name })).toBeVisible();
    }
    for (const name of [/Open a course file/, /Save to a file/]) {
      await expect(page.getByRole('menuitem', { name })).toHaveCount(0);
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
   * The holes grid doubles as navigation: on an eighteen-hole course it is how
   * you get from hole 3 to hole 12, and a chip that only highlighted something
   * off-screen would make it a grid of numbers rather than a way around.
   */
  test('selecting a hole in the grid flies to it', async ({ page }) => {
    await openEditor(page, { zoom: 16 });

    await place(page, 'Tee pad', 420, 520);
    await place(page, 'Target', 560, 420);
    await page.getByRole('button', { name: 'Add hole' }).click();
    await page.keyboard.press('Escape');

    /*
     * Well away from the first, so framing it has somewhere to go — and inside
     * the channel between the columns, which is what the map is now. This used to
     * reach for x = 1000, which was free only because the properties column
     * unmounted when nothing was selected.
     */
    await place(page, 'Tee pad', 900, 180);
    await place(page, 'Target', 960, 120);
    await page.getByRole('button', { name: 'Add hole' }).click();
    await page.keyboard.press('Escape');

    const center = () => page.evaluate(() => window.hyzerlinesMap!.getCenter().toArray());
    const before = await center();

    // The chip is named for the hole, not for the numeral drawn inside it.
    await page.getByRole('button', { name: 'Hole 1', exact: true }).click();
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
