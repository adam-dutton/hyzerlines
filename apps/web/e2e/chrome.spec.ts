import { test, expect, type Page } from '@playwright/test';
import { bearing } from '@hyzerlines/core';

import { course, openCourseTab, openEditor, place, rail } from './fixtures';

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

/**
 * Where a placed tee or basket actually landed, in longitude and latitude.
 *
 * Read back from the document rather than derived from the click coordinates:
 * the framing tests care about the ground, and the camera they are testing has
 * moved by the time they ask.
 */
const end = async (page: Page, kind: 'tee' | 'target'): Promise<[number, number]> => {
  const doc = await course(page);
  const feature = doc.features.find((candidate) => candidate.kind === kind);
  if (!feature) throw new Error(`no ${kind} in the document`);
  return feature.geometry.coordinates as [number, number];
};

/** The top bar, as a scope. Undo, redo, Import and Export all live in it. */
const topBar = (page: Page) => page.getByRole('banner', { name: 'Course' });

test.describe('chrome layout', () => {
  /*
   * The rail's two levels are adjacent and share a top edge.
   *
   * That adjacency is the whole design: the list gives up its width to the
   * detail beside it, so the thing you clicked and the thing that answered are
   * touching. Two floating columns at opposite edges of the screen was the
   * arrangement this replaced, and a gap opening up between the levels would be
   * that arrangement coming back a few pixels at a time.
   */
  test('the rail opens a second level flush against the first', async ({ page }) => {
    await openEditor(page, { zoom: 16 });
    await place(page, 'Tee pad', 480, 460);
    await place(page, 'Target', 800, 260);
    await page.getByRole('button', { name: 'Add hole' }).click();

    // The list is named for the focus it shows, which is Play by default.
    const list = await box(page, 'Play');
    const detail = await box(page, 'Properties');

    expect(list.x).toBe(0);
    expect(detail.x).toBe(list.x + list.width);
    expect(detail.y).toBe(list.y);
    expect(detail.height).toBe(list.height);
  });

  /*
   * Nothing selected is a real state, and the rail says so rather than keeping
   * a column open to describe it.
   *
   * The properties column used to be permanent, with the course as its third
   * mode — which meant about 40% of a 1280px viewport was chrome whether or not
   * you were looking at anything. The course is a *list* now, in the rail's own
   * Course tab, so an empty selection costs one column instead of two.
   */
  test('the detail column closes when nothing is selected', async ({ page }) => {
    await openEditor(page, { zoom: 16 });

    const detail = page.getByRole('region', { name: 'Properties', exact: true });
    expect((await detail.boundingBox())!.width).toBe(0);

    await place(page, 'Tee pad', 480, 460);
    await place(page, 'Target', 800, 260);
    await page.getByRole('button', { name: 'Add hole' }).click();
    await expect(page.getByRole('textbox', { name: 'Hole name' })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect.poll(async () => (await detail.boundingBox())!.width).toBe(0);

    // And the course is still reachable — in the list, not in a column of its own.
    await openCourseTab(page);
    await expect(page.getByRole('button', { name: 'Analysis', exact: true })).toBeVisible();
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
    const names = ['Course', 'Play', 'Tools'];
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
    const list = await box(page, 'Play');
    const focus = (await page.getByRole('radiogroup', { name: 'Focus' }).boundingBox())!;
    const viewport = page.viewportSize()!;

    // The switcher is up in the bar; the palette is down on the bottom edge.
    expect(focus.y).toBeLessThan(60);
    expect(tools.y).toBeGreaterThan(viewport.height / 2);

    /*
     * The switcher centres on the viewport and the palette centres on the map.
     *
     * Deliberately two different centres. The switcher belongs to the frame, so
     * it holds still whatever the rail is doing — that is what the top bar's
     * fixed middle grid track is for. The palette belongs to the map, and a
     * palette centred on the viewport while a 236px rail covers the left of it
     * is a palette sitting off-centre in the only space it is used over.
     */
    expect(Math.abs(focus.x + focus.width / 2 - viewport.width / 2)).toBeLessThan(2);

    const channel = (list.x + list.width + viewport.width) / 2;
    expect(Math.abs(tools.x + tools.width / 2 - channel)).toBeLessThan(2);

    // And a long name does not shove the switcher sideways.
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

    const list = await box(page, 'Play');
    const rect = (await recenter.boundingBox())!;
    const viewport = page.viewportSize()!;

    // In the camera cluster at the top right: clear of the rail on one side and
    // inside the viewport on the other.
    expect(rect.x).toBeGreaterThan(list.x + list.width);
    expect(rect.x + rect.width).toBeLessThanOrEqual(viewport.width);
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

    // The credit line itself, not the layers drawer's name for the same
    // basemap: the drawer is in the DOM whether or not it is open.
    await expect(page.getByText(/Imagery © Esri/)).toBeVisible();
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

  /*
   * The map turns to face the shot.
   *
   * A designer asking whether a gap is throwable is picturing the view from the
   * pad, and a north-up map asks them to do that rotation in their head on every
   * hole. Turning the map to the tee-to-basket bearing does it for them: the
   * shot runs away up the screen the way it runs away from the player.
   *
   * Framing the whole course must not do this — there is no one direction a
   * course faces — which is why the bearing is per-hole and optional.
   */
  test('selecting a hole turns the map to face the shot', async ({ page }) => {
    await openEditor(page, { zoom: 16 });

    // Up and to the right on screen: a shot running north-east on the ground, so
    // a north-up map has a real turn to make rather than a rounding error.
    await place(page, 'Tee pad', 520, 560);
    await place(page, 'Target', 800, 300);
    await page.getByRole('button', { name: 'Add hole' }).click();
    await page.keyboard.press('Escape');

    const heading = () => page.evaluate(() => window.hyzerlinesMap!.getBearing());
    expect(await heading()).toBe(0);

    const shot = bearing(await end(page, 'tee'), await end(page, 'target'));

    await page.getByRole('button', { name: 'Hole 1', exact: true }).click();
    await page.waitForTimeout(700);

    // `getBearing` reports −180..180 and a course bearing is 0..360.
    expect(Math.abs(((((await heading()) % 360) + 360) % 360) - shot)).toBeLessThan(1);
  });

  /**
   * And it frames the hole into the map you can actually see.
   *
   * The panels float over the canvas rather than displacing it, so fitting to
   * the raw viewport tucks the ends of the shot underneath them — which is
   * exactly what happened while the padding still described a layout two
   * rewrites ago. Measured against the chrome's real boxes rather than against
   * the constants, because the constants being wrong is the failure.
   */
  test('a selected hole is framed clear of the chrome', async ({ page }) => {
    await openEditor(page, { zoom: 16 });

    await place(page, 'Tee pad', 520, 560);
    await place(page, 'Target', 800, 300);
    await page.getByRole('button', { name: 'Add hole' }).click();
    await page.keyboard.press('Escape');

    const ends = [await end(page, 'tee'), await end(page, 'target')];

    await page.getByRole('button', { name: 'Hole 1', exact: true }).click();
    await page.waitForTimeout(700);

    const left = await box(page, 'Play');
    const detail = await box(page, 'Properties');
    const top = await box(page, 'Course');
    const tools = await box(page, 'Tools');
    const viewport = page.viewportSize()!;

    const screen = await page.evaluate((points: [number, number][]) => {
      const map = window.hyzerlinesMap!;
      return points.map((point) => {
        const at = map.project(point);
        return { x: at.x, y: at.y };
      });
    }, ends);

    for (const point of screen) {
      // Clear of the whole rail — the list plus whatever level it has opened.
      expect(point.x).toBeGreaterThan(left.x + left.width + detail.width);
      expect(point.x).toBeLessThan(viewport.width);
      expect(point.y).toBeGreaterThan(top.y + top.height);
      expect(point.y).toBeLessThan(tools.y);
    }
  });
});

/*
 * The Holes and Layouts tabs are gone; the focus does that job now, and does
 * more of it — the same switch changes the palette and what wins a click, which
 * a tab could never do. What that strip asserted lives in `focus.spec.ts`: the
 * panel swaps, and a focus with nothing behind it says so.
 */
