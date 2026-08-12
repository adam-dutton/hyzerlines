import { test, expect, type Page } from '@playwright/test';
import { bearing } from '@hyzerlines/core';

import { clickMap, course, openEditor, place } from './fixtures';

/**
 * Mandatories: which side you must pass, and the wall that says so.
 *
 * The whole feature is a claim about direction, and direction is the thing that
 * is easy to get backwards and impossible to see in a unit test of the app. So
 * these assert on the compass bearing the drawn line actually runs, taken off
 * the map's own source, against the bearing of the hole it belongs to.
 */

/** The mandatory line as it reached the map, or null when none was drawn. */
const mandoLineOnMap = (page: Page): Promise<[[number, number], [number, number]] | null> =>
  page.evaluate(() => {
    const rendered = window.hyzerlinesMap?.querySourceFeatures('derived-geometry') ?? [];
    for (const f of rendered) {
      if (f.properties?.['derived'] !== 'mandoLine') continue;
      if (f.geometry.type !== 'LineString') continue;
      /*
       * Tiling clips geometry at seams, so a line straddling one comes back cut
       * short. Only the *direction* is asserted on, and clipping a straight line
       * cannot change that — see the note in `fixtures`.
       */
      const [from, to] = f.geometry.coordinates;
      if (from && to) return [from, to] as [[number, number], [number, number]];
    }
    return null;
  });

/** Which marker glyphs the map is drawing, by layer. */
const mandoGlyphs = (page: Page): Promise<string[]> =>
  page.evaluate(() =>
    ['derived-marker-mando-left', 'derived-marker-mando-right'].filter(
      (id) => (window.hyzerlinesMap?.queryRenderedFeatures({ layers: [id] }) ?? []).length > 0,
    ),
  );

/**
 * A drop zone, which lives in the tee tool's flyout rather than the rail.
 *
 * `place` can only reach tools with a slot of their own, and a drop zone shares
 * the tee's — see `FLYOUTS` in the tool bar. It is the same two clicks a
 * designer makes.
 */
async function placeDropzone(page: Page, x: number, y: number) {
  await page.getByRole('button', { name: 'More teeing tools' }).click();
  await page.getByRole('menuitem', { name: 'Drop zone' }).click();
  await clickMap(page, x, y);
  await page.keyboard.press('Escape');
}

/** The bearing of the hole's shot, from the document rather than the screen. */
async function shotBearing(page: Page): Promise<number> {
  const doc = await course(page);
  const tee = doc.features.find((f) => f.kind === 'tee')!;
  const target = doc.features.find((f) => f.kind === 'target')!;
  return bearing(
    tee.geometry.coordinates as [number, number],
    target.geometry.coordinates as [number, number],
  );
}

/** How far apart two bearings are, the short way round. */
const apart = (a: number, b: number): number => {
  const delta = Math.abs(((a - b) % 360) + 360) % 360;
  return delta > 180 ? 360 - delta : delta;
};

/**
 * A hole with a mandatory partway up it, selected and ready to be ruled.
 *
 * The mandatory is placed with the hole still selected, which is what scopes it
 * to that hole — and the scope is what gives it a direction of play at all.
 */
async function holeWithMando(page: Page) {
  await openEditor(page, { zoom: 17 });
  await place(page, 'Tee pad', 560, 540);
  await place(page, 'Target', 700, 200);
  await page.getByRole('button', { name: 'Add hole' }).click();

  await place(page, 'Mandatory', 610, 320);
  await selectMando(page);
}

/**
 * Select the mandatory itself, which takes two clicks.
 *
 * The first enters the hole it belongs to — a mandatory is scoped to a hole and
 * clicking anything of a hole's selects the hole, which is the grouping idiom
 * every vector editor uses. The second drills in.
 */
async function selectMando(page: Page) {
  await clickMap(page, 610, 320);
  await clickMap(page, 610, 320);
  await expect(page.getByRole('combobox', { name: 'Rule' })).toBeVisible();
}

test.describe('mandatories', () => {
  test('a mandatory drawn on a hole belongs to it', async ({ page }) => {
    await holeWithMando(page);

    const doc = await course(page);
    const mando = doc.features.find((f) => f.kind === 'mando')!;
    expect(mando.holeId).not.toBeNull();

    /*
     * The scope is the whole reason this matters: without a hole there is no
     * shot, without a shot there is no direction of play, and without that
     * "pass left" means nothing and nothing can be drawn.
     */
    expect(await mandoLineOnMap(page)).toBeNull();
    await page.getByRole('combobox', { name: 'Rule' }).selectOption('left');
    await expect.poll(async () => (await mandoLineOnMap(page)) !== null).toBe(true);
  });

  test('the line runs on the opposite side from the one the disc must pass', async ({
    page,
  }) => {
    await holeWithMando(page);
    const shot = await shotBearing(page);

    // Pass left, and the wall is 90° clockwise of the shot: the player's right.
    await page.getByRole('combobox', { name: 'Rule' }).selectOption('left');
    await expect
      .poll(async () => {
        const line = await mandoLineOnMap(page);
        return line && apart(bearing(line[0], line[1]), shot + 90) < 1;
      })
      .toBe(true);

    await page.getByRole('combobox', { name: 'Rule' }).selectOption('right');
    await expect
      .poll(async () => {
        const line = await mandoLineOnMap(page);
        return line && apart(bearing(line[0], line[1]), shot - 90) < 1;
      })
      .toBe(true);
  });

  test('the glyph points the way the rule says, and over gets neither', async ({ page }) => {
    await holeWithMando(page);

    await page.getByRole('combobox', { name: 'Rule' }).selectOption('left');
    await expect.poll(() => mandoGlyphs(page)).toEqual(['derived-marker-mando-left']);

    await page.getByRole('combobox', { name: 'Rule' }).selectOption('right');
    await expect.poll(() => mandoGlyphs(page)).toEqual(['derived-marker-mando-right']);

    /*
     * Over is a real ruling with no line in plan: the plane it describes is
     * horizontal. Drawing one would be a wall across the gap the shot goes
     * through, which is the opposite of what it means.
     */
    await page.getByRole('combobox', { name: 'Rule' }).selectOption('over');
    await expect.poll(() => mandoGlyphs(page)).toEqual([]);
    expect(await mandoLineOnMap(page)).toBeNull();
  });

  test('the line is as long as the designer says', async ({ page }) => {
    await holeWithMando(page);
    await page.getByRole('combobox', { name: 'Rule' }).selectOption('left');
    await expect.poll(async () => (await mandoLineOnMap(page)) !== null).toBe(true);

    const reach = (line: [[number, number], [number, number]]) =>
      page.evaluate(
        ([a, b]) => {
          const map = window.hyzerlinesMap!;
          const from = map.project(a);
          const to = map.project(b);
          return Math.hypot(to.x - from.x, to.y - from.y);
        },
        [line[0], line[1]] as const,
      );

    const before = await reach((await mandoLineOnMap(page))!);

    // In feet, because that is the unit the editor opens in.
    await page.getByRole('spinbutton', { name: 'Line length' }).fill('200');

    // 200 ft is a little over 60 m, against a default of 20 m.
    await expect
      .poll(async () => (await reach((await mandoLineOnMap(page))!)) > before * 2.5)
      .toBe(true);
  });

  /**
   * A mandatory scoped to a hole is one of that hole's things.
   *
   * It was not, to anything that asked core: `holeOfFeature` resolved only
   * membership — a hole's own tee and target arrays — so a mandatory or a drop
   * zone carrying `holeId` came back in no hole at all. The feature list, which
   * had its own answer, filed it under hole 1 while the map selected it
   * directly and the panel offered "Whole course" as the way back up. Two parts
   * of the interface disagreeing about the same shape.
   */
  test('a mandatory belongs to its hole everywhere, not just in the list', async ({ page }) => {
    await holeWithMando(page);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');

    // One click enters the hole, exactly as clicking its tee or its basket does.
    await clickMap(page, 610, 320);
    await expect(page.getByRole('textbox', { name: 'Hole name' })).toBeVisible();

    // And the way back up from the mandatory is the hole, not the course.
    await clickMap(page, 610, 320);
    await expect(page.getByRole('button', { name: 'Back to Hole 1' })).toBeVisible();
  });

  test('the glyph turns with the ground, not with the screen', async ({ page }) => {
    await holeWithMando(page);

    /*
     * `icon-rotate` takes a compass bearing, so it has to be measured against
     * the map. Left on its default the icon rotates in screen space, and
     * selecting a hole — which turns the map to face its shot — pointed every
     * mandatory and every pad somewhere the ground did not.
     */
    const alignment = await page.evaluate(() =>
      ['derived-marker-mando-left', 'derived-marker-tee', 'derived-marker-dropzone'].map((id) =>
        window.hyzerlinesMap?.getLayoutProperty(id, 'icon-rotation-alignment'),
      ),
    );
    expect(alignment).toEqual(['map', 'map', 'map']);
  });

  test('a drop zone can be assigned to a mandatory', async ({ page }) => {
    await holeWithMando(page);

    // Nothing to point at yet, and the panel says so rather than offering an
    // empty picker.
    await expect(page.getByText('None drawn yet')).toBeVisible();

    await placeDropzone(page, 520, 440);
    await selectMando(page);

    const picker = page.getByRole('combobox', { name: 'Drop zone' });
    await expect(picker).toBeVisible();
    await picker.selectOption({ index: 1 });

    const doc = await course(page);
    const mando = doc.features.find((f) => f.kind === 'mando')!;
    const dropzone = doc.features.find((f) => f.kind === 'dropzone')!;
    expect(mando.props['dropzoneId']).toBe(dropzone.id);
  });
});
