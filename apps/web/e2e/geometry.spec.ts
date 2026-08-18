import { test, expect, type Page } from '@playwright/test';

import {
  clickFeature,
  clickMap as clickCanvas,
  course,
  holeChip,
  openEditor,
  place,
  project,
  setAid,
  setSwitch,
  settleCamera,
} from './fixtures';

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

/** Corridors the map is actually painting, as opposed to holding for clicks. */
const drawnCorridors = (page: Page): Promise<string[]> =>
  page.evaluate(() => {
    const rendered = window.hyzerlinesMap?.querySourceFeatures('derived-geometry') ?? [];
    const ids = new Set<string>();
    for (const f of rendered) {
      if (f.properties?.['derived'] !== 'corridor') continue;
      if (f.properties?.['hidden'] === true) continue;
      ids.add(String(f.properties?.['id']));
    }
    return [...ids];
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
  // The hole's own panel, which is what "Add hole" opens. Its name field is the
  // one thing on it that is always there, whatever the hole is called.
  await expect(page.getByRole('textbox', { name: 'Hole name' })).toBeVisible();
}

/**
 * The one control that says which shot a hole is measured as.
 *
 * It replaced a radio per tee and a radio per basket. Two controls meant
 * setting an end at a time, and between the two clicks the panel described a
 * shot nobody had asked for — so the value here is the pair, keyed by both ids.
 */
const shotPicker = (page: Page) =>
  page.getByRole('combobox', { name: 'Which shot this hole is measured as' });

const chooseShot = async (page: Page, teeId: string, targetId: string): Promise<void> => {
  await shotPicker(page).selectOption(`${teeId}::${targetId}`);
};

/**
 * Draw a feature straight into the open hole, through the `+` on its Features
 * heading. The tool is armed with the hole still selected, which is what makes
 * the next click on the map land inside it.
 */
async function addToHole(page: Page, kind: string): Promise<void> {
  await page.getByRole('button', { name: 'Add to this hole' }).click();
  await page.getByRole('menuitem', { name: kind, exact: true }).click();
}

/**
 * Open hole 1 and give it a second basket, so it has two shots to choose
 * between. Drawn straight into the hole rather than placed loose and claimed —
 * fewer steps, and it is how anybody adding an alternate pin would do it.
 */
async function twoPinHole(page: Page): Promise<[string, string]> {
  await page.getByRole('button', { name: 'Hole 1' }).first().click();
  await addToHole(page, 'Target');
  await clickCanvas(page, 950, 500);
  await expect.poll(async () => (await course(page)).holes[0]!.targetIds.length).toBe(2);
  const [pinA, pinB] = (await course(page)).holes[0]!.targetIds;
  return [pinA!, pinB!];
}

/**
 * Put a loose feature into a hole, or take it out, from the feature's own panel.
 *
 * Which is where the relationship is edited now, in both directions. The hole
 * panel used to carry a claim dropdown and a remove cross of its own; they said
 * the same thing as this select, one level up, and only for tees and baskets.
 */
async function setBelongsTo(page: Page, hole: string): Promise<void> {
  await page
    .getByRole('combobox', { name: 'Hole this belongs to' })
    .selectOption({ label: hole });
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

/** A fraction of the way along the hole's shot, in screen pixels. */
async function shotAt(page: Page, t: number): Promise<{ x: number; y: number }> {
  const [tee, target] = await shotEnds(page);
  const a = await project(page, tee);
  const b = await project(page, target);
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/*
 * Bend the hole's fairway, which is what turns it into a stored feature.
 *
 * By its thirds-point, which is a real vertex — the default line is three equal
 * segments, so index 1 sits a third of the way along and moving it bends the
 * line without inserting anything. Four points in, four points out.
 *
 * It used to grab the midpoint handle between those two thirds-points, which
 * inserted a fifth. Fairways have no midpoint handles now: the middle one
 * landed exactly on the hole's number, since `holeLabelPosition` puts the label
 * at the middle of the shot. The thirds-points exist precisely so there is
 * still somewhere obvious to grab, which is what this uses.
 */
async function bendFairway(page: Page): Promise<void> {
  const third = await shotAt(page, 1 / 3);
  await dragHandle(page, third, { x: third.x - 140, y: third.y + 110 }, 'edit-vertex');
  await expect.poll(async () => (await storedFairway(page)).length).toBe(4);
}

/** A point a fraction of the way along the hole's shot, in screen pixels. */
async function shotPoint(page: Page, t: number): Promise<{ x: number; y: number }> {
  const [from, to] = await shotEnds(page);
  return page.evaluate(
    ([a, b, at]) => {
      const map = window.hyzerlinesMap!;
      const start = map.project(a as [number, number]);
      const end = map.project(b as [number, number]);
      const f = at as number;
      return { x: start.x + (end.x - start.x) * f, y: start.y + (end.y - start.y) * f };
    },
    [from, to, t] as const,
  );
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
  test('dragging a handle is what makes it real', async ({ page }) => {
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

    // Grab the vertex where it now sits and move it somewhere else. Index 1:
    // 0 and 3 are the fixed tee and target, 1 and 2 the default thirds, and 1
    // is the one `bendFairway` just moved.
    const bent = await storedFairway(page);
    const corner = await project(page, bent[1]!);
    await dragHandle(page, corner, { x: corner.x + 70, y: corner.y - 60 }, 'edit-vertex');

    const after = await course(page);
    expect(after.features.filter((f) => f.kind === 'fairway')).toHaveLength(1);
    expect(after.pairs).toHaveLength(1);
    expect((await storedFairway(page))[1]).not.toEqual(bent[1]);
  });

  test('alt-clicking removes a vertex, and the ends cannot be removed at all', async ({
    page,
  }) => {
    await openEditor(page, { zoom: 16 });
    await setupHole(page);
    await bendFairway(page);

    // Index 2 is the far thirds-point, which the bend left where it was.
    const bent = await storedFairway(page);
    const corner = await project(page, bent[2]!);
    await waitForHandle(page, corner.x, corner.y);

    await page.keyboard.down('Alt');
    await clickAt(page, corner.x, corner.y);
    await page.keyboard.up('Alt');

    // Three left: the tee, the target, and the thirds-point the bend moved.
    await expect.poll(async () => (await storedFairway(page)).length).toBe(3);

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
    const looseId = (await course(page)).features.at(-1)!.id;

    /*
     * Claimed from the basket's own panel, which is where the relationship is
     * edited in both directions now. Selected by clicking it on the map, so the
     * click lands on the basket this test placed and not on one of the hole's.
     */
    await clickFeature(page, looseId);
    await expect(page.getByRole('textbox', { name: 'Feature name' })).toBeVisible();
    await setBelongsTo(page, 'Hole 1');

    await expect.poll(async () => (await course(page)).holes[0]!.targetIds.length).toBe(2);

    // Claiming it makes the hole a two-pin hole, and the hole panel lists both.
    await holeChip(page, 1).click();
    await expect(page.getByRole('button', { name: /^Select .*Target/ })).toHaveCount(2);
    // Two baskets and one tee is two shots, so the picker appears.
    await expect(shotPicker(page)).toBeVisible();

    /*
     * And back out again. Both directions matter: naming a basket you just
     * placed is feature-first, filling out hole 5 is hole-first, and forcing
     * either through the other is friction.
     */
    await clickFeature(page, looseId);
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

    const loose = (await course(page)).features.at(-1)!.id;
    await clickFeature(page, loose);
    await expect(page.getByRole('textbox', { name: 'Feature name' })).toBeVisible();
    await setBelongsTo(page, 'Hole 1');
    await expect.poll(async () => (await course(page)).holes[0]!.targetIds.length).toBe(2);

    await page.getByRole('button', { name: 'Undo' }).click();
    expect((await course(page)).holes[0]!.targetIds).toHaveLength(1);
  });
});

/**
 * Building a hole from the hole, rather than from the map and hoping.
 *
 * Adding a tee used to mean one of two things: draw it while a hole happened to
 * be selected — true, and discoverable by nobody — or draw it loose and claim it
 * from a dropdown that only appeared once a loose one existed. Removing one from
 * a hole was possible only from the *feature* panel, which is the other end of
 * the same relationship.
 */
test.describe('building a hole from its panel', () => {
  test('the Features + arms the tool, and the next click joins this hole', async ({ page }) => {
    await openEditor(page, { zoom: 16 });
    await setupHole(page);

    await addToHole(page, 'Tee pad');
    await clickCanvas(page, 520, 520);

    await expect.poll(async () => (await course(page)).holes[0]!.teeIds.length).toBe(2);
    // Both fields of the membership, not just the hole's array.
    const added = (await course(page)).holes[0]!.teeIds[1]!;
    expect((await course(page)).features.find((f) => f.id === added)?.holeId).toBe(
      (await course(page)).holes[0]!.id,
    );

    // And the same for a basket, so the hole is built without leaving it.
    await addToHole(page, 'Target');
    await clickCanvas(page, 900, 480);
    await expect.poll(async () => (await course(page)).holes[0]!.targetIds.length).toBe(2);
  });

  /*
   * Removal takes a tee out of the hole and leaves it on the ground. The
   * feature is still somewhere a designer put it deliberately; deleting it is a
   * different action and it lives on the feature itself.
   */
  test('removing a tee from the hole leaves the tee on the map', async ({ page }) => {
    await openEditor(page, { zoom: 16 });
    await setupHole(page);
    await addToHole(page, 'Tee pad');
    await clickCanvas(page, 520, 520);
    await expect.poll(async () => (await course(page)).holes[0]!.teeIds.length).toBe(2);

    const spare = (await course(page)).holes[0]!.teeIds[1]!;
    // From the tee's own panel — the row's chevron is what says it goes there.
    await clickFeature(page, spare);
    await expect(page.getByRole('textbox', { name: 'Feature name' })).toBeVisible();
    await setBelongsTo(page, 'Not assigned');

    await expect
      .poll(async () => (await course(page)).holes[0]!.teeIds)
      .toEqual([(await course(page)).holes[0]!.teeIds[0]]);

    const after = await course(page);
    const feature = after.features.find((f) => f.id === spare);
    expect(feature).toBeDefined();
    expect(feature?.holeId).toBeNull();

    // One undo puts it back, both fields together — it is one batch.
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect.poll(async () => (await course(page)).holes[0]!.teeIds.length).toBe(2);
  });
});

test.describe('the pair picker', () => {
  test('choosing a different pin re-measures the hole and moves the fairway', async ({
    page,
  }) => {
    await openEditor(page, { zoom: 16 });
    await setupHole(page);
    const [tee] = (await course(page)).holes[0]!.teeIds;
    const pins = await twoPinHole(page);

    const readLength = () =>
      page
        .getByText(/Effective length/)
        .innerText()
        .then((text) => Number(text.replace(/[^\d]/g, '')));

    const first = await readLength();
    await chooseShot(page, tee!, pins[1]);

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

  /*
   * The pick is per hole and lasts the session.
   *
   * It used to be a single value cleared on every hole change, so choosing the
   * long pin on hole 1 and then looking at hole 2 silently put hole 1 back on
   * its short pin — the map redrew and nothing said why. Comparing two holes'
   * long pins, which is most of the reason to have alternate pins at all, could
   * not be done in the app that stores them.
   *
   * Browser-only: the choice is React state, and what is being asserted is that
   * deselecting does not throw it away.
   */
  test('the chosen pin survives deselecting the hole', async ({ page }) => {
    await openEditor(page, { zoom: 16 });
    await setupHole(page);
    const [tee] = (await course(page)).holes[0]!.teeIds;
    const [, pinB] = await twoPinHole(page);
    await chooseShot(page, tee!, pinB);

    // Let go of the hole entirely.
    await page.keyboard.press('Escape');
    await expect(shotPicker(page)).toHaveCount(0);

    // The corridor still runs to the pin that was picked, rather than snapping
    // back to the first target the moment nothing was selected.
    await expect
      .poll(() =>
        page.evaluate(() => {
          const rendered = window.hyzerlinesMap?.querySourceFeatures('derived-geometry') ?? [];
          return [
            ...new Set(
              rendered
                .filter((f) => f.properties?.['derived'] === 'centreline')
                .map((f) => String(f.properties?.['pair'])),
            ),
          ];
        }),
      )
      .toEqual([expect.stringContaining(pinB)]);

    // And coming back to the hole reopens on it.
    await page.getByRole('button', { name: 'Hole 1' }).first().click();
    await expect(shotPicker(page)).toHaveValue(`${tee!}::${pinB}`);
  });

  /*
   * The shots the hole is not being drawn as still have to be on the map.
   *
   * A second pin used to be a basket with no line leaving it, which reads as
   * something the designer forgot rather than as an option they created. The
   * cross rule is unit-tested in core; what a browser has to answer is whether
   * the lines survive the trip through the source and the layer filter, and
   * whether turning fairway lines off takes them with it.
   */
  test('the shots not in play draw as faint lines', async ({ page }) => {
    await openEditor(page, { zoom: 16 });
    await setupHole(page);
    const [tee] = (await course(page)).holes[0]!.teeIds;
    const [pinA, pinB] = await twoPinHole(page);

    const drawn = (kind: string) =>
      page.evaluate((derived) => {
        const rendered = window.hyzerlinesMap?.querySourceFeatures('derived-geometry') ?? [];
        return [
          ...new Set(
            rendered
              .filter((f) => f.properties?.['derived'] === derived)
              .map((f) => String(f.properties?.['pair'])),
          ),
        ];
      }, kind);

    // One corridor, for the shot in play; one faint line, for the one that is
    // not. Not two corridors down the same strip of land.
    await expect.poll(() => drawn('centreline')).toEqual([expect.stringContaining(pinA)]);
    await expect.poll(() => drawn('alternative')).toEqual([expect.stringContaining(pinB)]);

    // Picking the other pin swaps which is which.
    await chooseShot(page, tee!, pinB);
    await expect.poll(() => drawn('centreline')).toEqual([expect.stringContaining(pinB)]);
    await expect.poll(() => drawn('alternative')).toEqual([expect.stringContaining(pinA)]);

    // And they are fairway lines: turning those off takes the alternatives too,
    // rather than leaving a thinner copy of an aid that was switched off.
    await page.keyboard.press('Escape');
    await setAid(page, 'Lines', false);
    await expect.poll(() => drawn('alternative')).toEqual([]);
    await expect.poll(() => drawn('centreline')).toEqual([]);
  });
});

/**
 * A hidden fairway is still where the hole is.
 *
 * Turning corridors off is about what the map shows — a designer reading the
 * canopy under hole 7 does not want a translucent band over it. It was silently
 * also about what the map answers.
 */
test.describe('a hole you cannot see the fairway of', () => {
  test('still selects from the ground its shot runs over', async ({ page }) => {
    await openEditor(page, { zoom: 16 });
    await place(page, 'Tee pad', 480, 500);
    await place(page, 'Target', 800, 260);
    await page.getByRole('button', { name: 'Add hole' }).click();

    /*
     * Two thirds of the way down the shot: clear of the pad, the basket and the
     * hole number, and out where the corridor has tapered wide enough to hit.
     *
     * Projected rather than guessed at. A corridor starts as narrow as the pad
     * — two metres, which is about one pixel at this zoom — so "beside the
     * centreline" is not a place that exists near the tee, and a hard-coded
     * point a few pixels off the line lands on nothing at all.
     */
    // After the camera has arrived: adding a hole selects it, which flies the
    // map to it, and a point projected mid-flight is not where the click lands.
    await settleCamera(page);
    const onCorridor = await shotPoint(page, 0.65);

    /*
     * Corridor shapes on the map, hidden ones included.
     *
     * `drawnCorridors` deliberately drops the hidden ones — that is what it is
     * for below — but a click needs the *shape* to exist, and a hidden corridor
     * is still the thing being clicked: it keeps its geometry so the ground a
     * shot runs over stays selectable. Counting both is what makes this a valid
     * wait on either side of the switch.
     */
    const corridorsOnMap = () =>
      page.evaluate(
        () =>
          (window.hyzerlinesMap?.querySourceFeatures('derived-geometry') ?? []).filter(
            (f) => f.properties?.['derived'] === 'corridor',
          ).length,
      );

    const holePanel = page.getByRole('textbox', { name: 'Hole name' });
    const selectFromTheCorridor = async () => {
      await page.keyboard.press('Escape');
      await expect(holePanel).toBeHidden();
      /*
       * And only once the corridor is actually painted. A settled camera is not
       * the same as a drawn frame: the derived source is pushed to the map
       * asynchronously, and under a full suite's load the click was landing in
       * the gap between the two and hitting nothing at all. Passing alone and
       * failing in the suite is the signature of exactly that.
       */
      await expect.poll(corridorsOnMap).toBeGreaterThan(0);
      await clickAt(page, onCorridor.x, onCorridor.y);
    };

    await selectFromTheCorridor();
    await expect(holePanel).toBeVisible();

    // Hide it, from the panel the click just opened. The routed line is kept
    // and so, now, is the target.
    await setSwitch(page, 'Show fairway', false);
    await expect.poll(() => drawnCorridors(page)).toEqual([]);

    await selectFromTheCorridor();
    await expect(holePanel).toBeVisible();
  });
});
