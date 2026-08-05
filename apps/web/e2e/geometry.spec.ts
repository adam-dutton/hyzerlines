import { test, expect, type Page } from '@playwright/test';

import { clickMap, course, openEditor, place, project, rail } from './fixtures';

/**
 * Derived geometry, vertex editing, and the pair picker.
 *
 * The maths is unit-tested in @hyzerlines/core against real metres. What only a
 * browser can answer is whether any of it reaches the screen: whether a tee pad
 * makes it into a MapLibre source, whether a mousedown on a five-pixel circle
 * actually grabs the vertex under it rather than panning the map, and whether
 * the panel's dropdowns change which shot is being measured.
 *
 * Every one of those is wiring, and wiring only fails here.
 */

/**
 * What the derived source actually put on the map, deduplicated.
 *
 * MapLibre returns one copy of a feature per rendered tile, so a corridor
 * spanning four tiles comes back four times. Collapsing on the feature's own id
 * asks the question the test means — "did this reach a MapLibre source" —
 * rather than "how is the viewport tiled right now".
 */
const derivedOnMap = (page: Page): Promise<string[]> =>
  page.evaluate(() => {
    const rendered = window.hyzerlinesMap?.querySourceFeatures('derived-geometry') ?? [];
    const seen = new Map<string, string>();
    for (const f of rendered) {
      seen.set(
        `${String(f.properties?.['id'])}:${String(f.properties?.['derived'])}`,
        `${String(f.properties?.['derived'])}:${f.geometry.type}`,
      );
    }
    return [...seen.values()].sort();
  });

/** The coordinates of the one line feature in the document. */
async function lineCoordinates(page: Page): Promise<[number, number][]> {
  const { features } = await course(page);
  const line = features.find((f) => f.geometry.type === 'line');
  return (line?.geometry.coordinates ?? []) as [number, number][];
}

/** Draw a two-point fairway and leave it selected. */
async function drawFairway(page: Page): Promise<void> {
  await rail(page).getByRole('button', { name: 'Fairway', exact: true }).click();
  await clickMap(page, 400, 500);
  await clickMap(page, 800, 300);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('textbox', { name: 'Feature name' })).toBeVisible();
}

test.describe('derived geometry', () => {
  test('a tee gets a pad once something says which way it faces', async ({ page }) => {
    await openEditor(page, { zoom: 16 });

    /*
     * A lone tee has no bearing and no target, so there is nothing to derive —
     * a rectangle drawn at an invented angle would look deliberate.
     */
    await place(page, 'Tee pad', 400, 500);
    expect(await derivedOnMap(page)).toEqual([]);

    // Give it a hole with a target, and the pad appears facing the throw.
    await place(page, 'Target', 800, 300);
    await page.getByRole('button', { name: 'Add hole' }).click();

    await expect.poll(() => derivedOnMap(page)).toEqual(['footprint:Polygon']);
  });

  test('a drawn fairway gets a corridor that follows its shape', async ({ page }) => {
    await openEditor(page, { zoom: 16 });
    await drawFairway(page);

    // A polygon, not a copy of the line it came from.
    await expect.poll(() => derivedOnMap(page)).toEqual(['corridor:Polygon']);
  });
});

test.describe('vertex editing', () => {
  test('dragging a vertex reshapes the line', async ({ page }) => {
    await openEditor(page, { zoom: 16 });
    await drawFairway(page);

    const before = await lineCoordinates(page);
    expect(before).toHaveLength(2);

    // Grab the end vertex where it actually sits on screen and pull it away.
    const handle = await project(page, before[1]!);
    await page.mouse.move(handle.x, handle.y);
    await page.mouse.down();
    await page.mouse.move(handle.x - 150, handle.y + 120, { steps: 8 });
    await page.mouse.up();

    const after = await lineCoordinates(page);
    expect(after).toHaveLength(2);
    // The vertex moved; the one at the other end did not.
    expect(after[1]).not.toEqual(before[1]);
    expect(after[0]).toEqual(before[0]);

    /*
     * And the map did not pan while it happened. Without preventDefault on the
     * handle's mousedown, MapLibre drags the ground instead, which looks almost
     * identical on screen and moves nothing in the document.
     */
    const stationary = await project(page, before[0]!);
    const start = await project(page, after[0]!);
    expect(Math.abs(stationary.x - start.x)).toBeLessThan(2);
  });

  test('a whole drag is one undo step', async ({ page }) => {
    await openEditor(page, { zoom: 16 });
    await drawFairway(page);

    const before = await lineCoordinates(page);
    const handle = await project(page, before[1]!);
    await page.mouse.move(handle.x, handle.y);
    await page.mouse.down();
    await page.mouse.move(handle.x - 120, handle.y, { steps: 12 });
    await page.mouse.up();

    // Twelve intermediate positions, one entry: `canCoalesce` folds a
    // continuous edit together, or ⌘Z would rewind it a frame at a time.
    await page.getByRole('button', { name: 'Undo' }).click();
    expect(await lineCoordinates(page)).toEqual(before);
  });

  test('clicking between two vertices inserts one there', async ({ page }) => {
    await openEditor(page, { zoom: 16 });
    await drawFairway(page);

    const before = await lineCoordinates(page);
    const a = await project(page, before[0]!);
    const b = await project(page, before[1]!);

    // The midpoint handle sits halfway along, and a click drops a vertex on it.
    await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2);
    await page.mouse.down();
    await page.mouse.up();

    await expect.poll(async () => (await lineCoordinates(page)).length).toBe(3);
  });

  test('clicking a handle never changes the selection', async ({ page }) => {
    await openEditor(page, { zoom: 16 });
    await drawFairway(page);

    const [start, end] = await lineCoordinates(page);
    const a = await project(page, start!);
    const b = await project(page, end!);

    /*
     * Five pixels off the centreline, perpendicular — still inside the handle,
     * already outside the line's four-pixel hit area.
     *
     * That gap is the whole bug: without the guard, `queryRenderedFeatures`
     * misses the line, returns nothing, and the click is read as "clicked empty
     * ground". The feature deselects, every handle disappears, and the vertex
     * you were reaching for is gone from under the cursor.
     */
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const nx = (-(b.y - a.y) / length) * 5;
    const ny = ((b.x - a.x) / length) * 5;

    await page.mouse.move(b.x + nx, b.y + ny);
    await page.mouse.down();
    await page.mouse.up();

    await expect(page.getByRole('textbox', { name: 'Feature name' })).toBeVisible();
    expect(await lineCoordinates(page)).toHaveLength(2);
  });

  test('alt-clicking removes a vertex, but never the last two', async ({ page }) => {
    await openEditor(page, { zoom: 16 });

    await rail(page).getByRole('button', { name: 'Fairway', exact: true }).click();
    await clickMap(page, 400, 500);
    await clickMap(page, 600, 400);
    await clickMap(page, 800, 300);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('textbox', { name: 'Feature name' })).toBeVisible();

    const before = await lineCoordinates(page);
    expect(before).toHaveLength(3);

    const middle = await project(page, before[1]!);
    await page.keyboard.down('Alt');
    await page.mouse.move(middle.x, middle.y);
    await page.mouse.down();
    await page.mouse.up();

    await expect.poll(async () => (await lineCoordinates(page)).length).toBe(2);

    /*
     * The feature must survive. A line needs two points, so the next removal is
     * refused rather than dropping the shape below what the schema accepts —
     * and the handles have to still be there to click, which is what would
     * break if a handle click were also reaching the selection handler.
     */
    const remaining = await lineCoordinates(page);
    const end = await project(page, remaining[0]!);
    await page.mouse.move(end.x, end.y);
    await page.mouse.down();
    await page.mouse.up();
    await page.keyboard.up('Alt');

    expect(await lineCoordinates(page)).toHaveLength(2);
    await expect(page.getByRole('textbox', { name: 'Feature name' })).toBeVisible();
  });
});

test.describe('the pair picker', () => {
  test('choosing a different pin re-measures the hole', async ({ page }) => {
    await openEditor(page, { zoom: 16 });

    await place(page, 'Tee pad', 300, 550);
    await place(page, 'Target', 600, 400);
    await place(page, 'Target', 1000, 150);

    await page.getByRole('button', { name: 'Add hole' }).click();

    // One tee, one pin so far: nothing to choose between, so no dropdown.
    await expect(page.getByRole('combobox', { name: /Tee for this hole/ })).toBeHidden();

    /*
     * Claim the far pin as a second target on the same hole. Done through the
     * document because assigning features to holes has no interface yet — that
     * is PR 8's work, and this test is about the picker, not about how a
     * target gets attached.
     */
    await page.evaluate(() => {
      const store = window.hyzerlinesStore!;
      const current = store.getSnapshot().course;
      store.dispatch({
        type: 'updateHole',
        id: current.holes[0]!.id,
        changes: {
          targetIds: current.features.filter((f) => f.kind === 'target').map((f) => f.id),
        },
      });
    });

    const picker = page.getByRole('combobox', { name: /Target for this hole/ });
    await expect(picker).toBeVisible();

    const shown = () => page.getByRole('combobox', { name: 'Par for the selected hole' });
    const readLength = () =>
      page
        .getByText(/Effective length/)
        .innerText()
        .then((text) => Number(text.replace(/[^\d]/g, '')));

    const first = await readLength();
    await expect(shown()).toBeVisible();

    // Switch to the other pin. The length must change — that is the entire
    // point of measuring a pair rather than a hole.
    const options = await picker.locator('option').all();
    await picker.selectOption(await options[1]!.getAttribute('value'));

    await expect.poll(readLength).not.toBe(first);
  });
});
