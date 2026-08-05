import { test, expect, type Page } from '@playwright/test';

import { clickMap, course, openEditor, place, project } from './fixtures';

/**
 * Derived geometry, vertex editing, hole assignment and the pair picker.
 *
 * The maths is unit-tested in @hyzerlines/core against real metres. What only a
 * browser can answer is whether any of it reaches the screen: whether a tee pad
 * makes it into a MapLibre source, whether a mousedown on a five-pixel circle
 * grabs the vertex under it rather than panning the map, and whether the panel's
 * dropdowns change which shot is being measured.
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

/** The stored fairway's coordinates. Empty while the line is still derived. */
async function storedFairway(page: Page): Promise<[number, number][]> {
  const { features } = await course(page);
  const line = features.find((f) => f.kind === 'fairway');
  return (line?.geometry.coordinates ?? []) as [number, number][];
}

/** Where the hole's shot runs, whether or not the document stores it. */
async function shotEnds(page: Page): Promise<[[number, number], [number, number]]> {
  return page.evaluate(() => {
    const c = window.hyzerlinesStore!.getSnapshot().course;
    const hole = c.holes[0]!;
    const at = (id: string) =>
      c.features.find((f) => f.id === id)!.geometry.coordinates as [number, number];
    return [at(hole.teeIds[0]!), at(hole.targetIds[0]!)];
  });
}

/**
 * A tee, a basket and a hole joining them — which is all it takes for a fairway
 * to exist. The hole is left selected, so its fairway carries the handles.
 */
async function setupHole(page: Page): Promise<void> {
  await place(page, 'Tee pad', 400, 560);
  await place(page, 'Target', 860, 260);
  await page.getByRole('button', { name: 'Add hole' }).click();
  await expect(page.getByText('Hole 1').first()).toBeVisible();
}

/**
 * Wait until a vertex handle is actually hit-testable at a point.
 *
 * The document updating and the handle moving are two different things: the
 * geometry lands synchronously, but MapLibre re-tiles the handle source a frame
 * or two later. Pressing at a projected coordinate before then lands on empty
 * canvas, which is a deselect rather than a grab — and it only shows up when the
 * machine is loaded, so it reads as an unrelated flake.
 */
async function waitForHandle(
  page: Page,
  x: number,
  y: number,
  layer: 'edit-vertex' | 'edit-midpoint' = 'edit-vertex',
): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(
        ([point, id]) =>
          (window.hyzerlinesMap?.queryRenderedFeatures(point as [number, number], {
            layers: [id as string],
          }).length ?? 0) > 0,
        [[x, y], layer] as const,
      ),
    )
    .toBe(true);
}

/** Grab a handle and pull it somewhere, once it is really there to grab. */
async function dragHandle(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  layer: 'edit-vertex' | 'edit-midpoint' = 'edit-midpoint',
): Promise<void> {
  await waitForHandle(page, from.x, from.y, layer);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up();
}

/** The midpoint of the hole's shot, in screen pixels. */
async function shotMidpoint(page: Page): Promise<{ x: number; y: number }> {
  const [tee, target] = await shotEnds(page);
  const a = await project(page, tee);
  const b = await project(page, target);
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/*
 * Bend the hole's fairway, which is what turns it into a stored feature.
 *
 * The default line is three equal segments, not one — see
 * `defaultFairwayLine` in pairView.ts — so its own geometric midpoint is a
 * midpoint HANDLE between the two interior thirds-points, not a straight
 * tee-to-target line's only handle. Bending it inserts one point there,
 * between those two: five points out, not three.
 */
async function bendFairway(page: Page): Promise<void> {
  const mid = await shotMidpoint(page);
  await dragHandle(page, mid, { x: mid.x - 140, y: mid.y + 110 });
  await expect.poll(async () => (await storedFairway(page)).length).toBe(5);
}

/** Press and release at a point, without moving. */
async function clickAt(page: Page, x: number, y: number): Promise<void> {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.up();
}

test.describe('derived geometry', () => {
  test('a tee gets a pad once something says which way it faces', async ({ page }) => {
    await openEditor(page, { zoom: 16 });

    /*
     * A lone tee has no bearing and no target, so there is nothing to derive —
     * a rectangle drawn at an invented angle would look deliberate.
     */
    await place(page, 'Tee pad', 400, 560);
    expect(await derivedOnMap(page)).toEqual([]);

    // Give it a hole with a target, and the pad appears facing the throw.
    await place(page, 'Target', 860, 260);
    await page.getByRole('button', { name: 'Add hole' }).click();

    await expect.poll(() => derivedOnMap(page)).toContain('footprint:Polygon');
  });

  /*
   * The change this PR is really about: nobody draws a fairway. A tee and a
   * target imply the line between them, so the corridor is there as soon as the
   * hole is, with no feature in the document behind it.
   */
  test('a hole gets a fairway and corridor without anyone drawing one', async ({ page }) => {
    await openEditor(page, { zoom: 16 });
    await setupHole(page);

    await expect
      .poll(() => derivedOnMap(page))
      .toEqual(
        expect.arrayContaining([
          'centreline:LineString',
          'corridor:Polygon',
          'footprint:Polygon',
        ]),
      );

    // And the document is still carrying nothing for it.
    expect(await storedFairway(page)).toHaveLength(0);
    expect((await course(page)).pairs).toHaveLength(0);
  });
});

test.describe('shaping a fairway', () => {
  test('dragging its midpoint is what makes it real', async ({ page }) => {
    await openEditor(page, { zoom: 16 });
    await setupHole(page);

    await bendFairway(page);

    // A feature appeared, with the bend in it…
    // …and a pair record pointing at it, which is what makes it this shot's
    // fairway rather than a loose line that happens to be nearby.
    const { pairs, features } = await course(page);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]!.fairwayId).toBe(features.find((f) => f.kind === 'fairway')!.id);
  });

  test('the whole gesture is one undo step, feature and pair together', async ({ page }) => {
    await openEditor(page, { zoom: 16 });
    await setupHole(page);

    await bendFairway(page);

    /*
     * One ⌘Z takes back the bend, the feature it created and the pair that
     * points at it. Dispatching those separately would leave a pair referencing
     * a feature that no longer exists — a dangling reference the designer never
     * made, produced by their own undo.
     */
    await page.getByRole('button', { name: 'Undo' }).click();
    const after = await course(page);
    expect(after.features.some((f) => f.kind === 'fairway')).toBe(false);
    expect(after.pairs).toHaveLength(0);
  });

  test('bending again reshapes rather than making a second fairway', async ({ page }) => {
    await openEditor(page, { zoom: 16 });
    await setupHole(page);

    await bendFairway(page);

    // Grab the vertex where it now sits and move it somewhere else. Index 2:
    // 0 and 4 are the fixed tee and target, 1 and 3 the default thirds, 2 the
    // point the bend just inserted between them.
    const bent = await storedFairway(page);
    const corner = await project(page, bent[2]!);
    await dragHandle(page, corner, { x: corner.x + 70, y: corner.y - 60 }, 'edit-vertex');

    const after = await course(page);
    expect(after.features.filter((f) => f.kind === 'fairway')).toHaveLength(1);
    expect(after.pairs).toHaveLength(1);
    expect((await storedFairway(page))[2]).not.toEqual(bent[2]);
  });

  test('alt-clicking removes a vertex, and the ends cannot be removed at all', async ({
    page,
  }) => {
    await openEditor(page, { zoom: 16 });
    await setupHole(page);
    await bendFairway(page);

    // Index 2 is the point the bend just inserted — see `bendFairway`.
    const bent = await storedFairway(page);
    const corner = await project(page, bent[2]!);
    await waitForHandle(page, corner.x, corner.y);

    await page.keyboard.down('Alt');
    await clickAt(page, corner.x, corner.y);
    await page.keyboard.up('Alt');

    // Back to the four points the line started with — the tee, target and
    // the two default thirds — minus the one just removed.
    await expect.poll(async () => (await storedFairway(page)).length).toBe(4);

    /*
     * The tee and the target carry no handle at all — so there is nothing to
     * Alt-click and no way to drop the line below the two points it needs.
     *
     * That is not a guard bolted on afterwards: a fairway runs from its tee to
     * its target by definition, and a handle sitting on top of every tee and
     * basket on the course swallowed the clicks meant for them. Checked
     * against the tee and target themselves rather than every remaining
     * stored point — the two default thirds points are ordinary, removable
     * vertices, not fixed ends.
     */
    for (const end of await shotEnds(page)) {
      const at = await project(page, end);
      expect(
        await page.evaluate(
          (p) =>
            window.hyzerlinesMap?.queryRenderedFeatures(p as [number, number], {
              layers: ['edit-vertex'],
            }).length ?? 0,
          [at.x, at.y],
        ),
      ).toBe(0);
    }
  });

  test('clicking a handle never changes the selection', async ({ page }) => {
    await openEditor(page, { zoom: 16 });
    await setupHole(page);

    const [tee, target] = await shotEnds(page);
    const a = await project(page, tee);
    const b = await project(page, target);

    /*
     * Five pixels off the centreline, perpendicular — still inside the handle,
     * already outside the line's hit area.
     *
     * That gap is the whole bug: without the guard, `queryRenderedFeatures`
     * misses the line, returns nothing, and the click is read as "clicked empty
     * ground". The hole deselects, every handle disappears, and the vertex you
     * were reaching for is gone from under the cursor.
     */
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const nx = (-(b.y - a.y) / length) * 5;
    const ny = ((b.x - a.x) / length) * 5;

    await clickAt(page, (a.x + b.x) / 2 + nx, (a.y + b.y) / 2 + ny);

    // The hole panel is still the hole panel.
    await expect(page.getByRole('textbox', { name: 'Hole name' })).toBeVisible();
  });
});

test.describe('assigning features to holes', () => {
  /*
   * Before this, `addHole` guessed once when a hole was created and nothing
   * could change its mind: a second pin was stranded outside every hole,
   * reported forever as unassigned, with no control anywhere to fix it.
   */
  test('a hole can claim a loose basket, and give it back', async ({ page }) => {
    await openEditor(page, { zoom: 16 });
    await setupHole(page);

    /*
     * Deselected first, so the basket lands loose.
     *
     * `setupHole` leaves its hole selected, and anything drawn while a hole is
     * selected now joins it — which is the point of that behaviour and exactly
     * what this test needs to opt out of. There has to be an unassigned basket
     * for a hole to claim one.
     */
    await page.keyboard.press('Escape');
    await place(page, 'Target', 950, 500);

    // The loose basket shows up as a finding, and as something to claim.
    await page.getByRole('button', { name: 'Hole 1' }).first().click();
    const claim = page.getByRole('combobox', { name: 'Add a basket' });
    await expect(claim).toBeVisible();

    const value = await claim.locator('option').nth(1).getAttribute('value');
    await claim.selectOption(value);

    await expect.poll(async () => (await course(page)).holes[0]!.targetIds.length).toBe(2);
    // Claiming it makes the hole a two-pin hole, so the shot picker appears.
    await expect(page.getByRole('combobox', { name: /Target for this hole/ })).toBeVisible();

    /*
     * And the reverse, from the feature's own panel. Both directions matter:
     * naming a basket you just placed is feature-first, filling out hole 5 is
     * hole-first, and forcing either through the other is friction.
     *
     * Selected by clicking the basket on the map rather than through the hole
     * panel's reveal link — that link shares its accessible name with the tee's,
     * and picking the wrong one silently unassigns the tee instead, which is a
     * test that fails for a reason unrelated to what it is checking.
     */
    await clickMap(page, 950, 500);
    await expect(page.getByRole('textbox', { name: 'Feature name' })).toBeVisible();

    const holePicker = page.getByRole('combobox', { name: 'Hole this belongs to' });
    await expect(holePicker).toHaveValue((await course(page)).holes[0]!.id);
    await holePicker.selectOption('');

    await expect.poll(async () => (await course(page)).holes[0]!.targetIds.length).toBe(1);
    // The tee is untouched: unassigning one end must not disturb the other.
    expect((await course(page)).holes[0]!.teeIds).toHaveLength(1);
  });

  test('one move is one undo step, not two half-moves', async ({ page }) => {
    await openEditor(page, { zoom: 16 });
    await setupHole(page);
    // Loose, so the hole has something to claim — see the test above.
    await page.keyboard.press('Escape');
    await place(page, 'Target', 950, 500);

    await page.getByRole('button', { name: 'Hole 1' }).first().click();
    const claim = page.getByRole('combobox', { name: 'Add a basket' });
    await claim.selectOption(await claim.locator('option').nth(1).getAttribute('value'));
    await expect.poll(async () => (await course(page)).holes[0]!.targetIds.length).toBe(2);

    await page.getByRole('button', { name: 'Undo' }).click();
    expect((await course(page)).holes[0]!.targetIds).toHaveLength(1);
  });
});

test.describe('the pair picker', () => {
  test('choosing a different pin re-measures the hole and moves the fairway', async ({
    page,
  }) => {
    await openEditor(page, { zoom: 16 });
    await setupHole(page);
    // Loose, so the hole has something to claim — see the test above.
    await page.keyboard.press('Escape');
    await place(page, 'Target', 950, 500);

    await page.getByRole('button', { name: 'Hole 1' }).first().click();
    const claim = page.getByRole('combobox', { name: 'Add a basket' });
    await claim.selectOption(await claim.locator('option').nth(1).getAttribute('value'));

    const picker = page.getByRole('combobox', { name: /Target for this hole/ });
    await expect(picker).toBeVisible();

    const readLength = () =>
      page
        .getByText(/Effective length/)
        .innerText()
        .then((text) => Number(text.replace(/[^\d]/g, '')));

    const first = await readLength();
    const options = await picker.locator('option').all();
    await picker.selectOption(await options[1]!.getAttribute('value'));

    // The length changes — that is the entire point of measuring a pair rather
    // than a hole — and so does where the fairway runs.
    await expect.poll(readLength).not.toBe(first);

    /*
     * The corridor now runs to the pin the panel is showing.
     *
     * Asserted on the centreline's `pair` property rather than its coordinates:
     * MapLibre clips geometry at tile boundaries, so the last coordinate of a
     * rendered line is wherever the tile ended. Properties survive clipping.
     */
    const chosen = (await course(page)).holes[0]!.targetIds[1]!;
    await expect
      .poll(() =>
        page.evaluate(() => {
          const rendered = window.hyzerlinesMap?.querySourceFeatures('derived-geometry') ?? [];
          // Deduplicated: MapLibre returns one copy per rendered tile.
          return [
            ...new Set(
              rendered
                .filter((f) => f.properties?.['derived'] === 'centreline')
                .map((f) => String(f.properties?.['pair'])),
            ),
          ];
        }),
      )
      .toEqual([expect.stringContaining(chosen)]);
  });
});
