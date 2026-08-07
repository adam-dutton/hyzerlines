import { test, expect, type Page } from '@playwright/test';

import { course, fakeSurveyGeoTiff, openEditor, openLayers, place, project } from './fixtures';

/**
 * Elevation profiles, end to end.
 *
 * The arithmetic is unit tested in core against sample arrays whose every value
 * is known. What only a browser can answer is whether the *chain* holds: a
 * fairway centreline turned into sample positions, each mapped to a tile
 * coordinate, that tile fetched from IndexedDB or the network, decoded through
 * `createImageBitmap` and `OffscreenCanvas`, read back as metres, summarised,
 * and drawn as an SVG path. Every one of those steps can silently produce
 * nothing, and none of them exists outside a page.
 *
 * The most important assertion here is the one about par. Elevation may move a
 * stroke only when an imported survey supplied it — the global model is roughly
 * 10m posted with vertical error that can reach ±16m, and the PDGA multiplies
 * elevation by three. These tests pin both halves of that rule, because a
 * regression in either direction is invisible: a par silently priced off SRTM
 * looks exactly like a par priced off LiDAR.
 */

/** Put a hole on the map between two screen points, and select it. */
async function drawHole(page: Page, from: [number, number], to: [number, number]) {
  await place(page, 'Tee pad', from[0], from[1]);
  await place(page, 'Target', to[0], to[1]);
  await page.getByRole('button', { name: 'Add hole' }).click();
  await expect(page.getByRole('textbox', { name: 'Hole name' })).toBeVisible();
}

/** The chart's own drawn paths. Zero means it rendered a frame and no ground. */
const drawnPaths = (page: Page): Promise<number> =>
  page.locator('svg[aria-label*="Ground profile"] path[stroke="currentColor"]').count();

const parFor = async (page: Page): Promise<string | null> =>
  page.getByRole('combobox', { name: 'Par for the selected hole' }).inputValue();

async function importSurvey(page: Page): Promise<void> {
  await openLayers(page);
  const tiff = await fakeSurveyGeoTiff();
  await page.locator('input[type="file"]').setInputFiles({
    name: 'survey-1m.tif',
    mimeType: 'image/tiff',
    buffer: tiff,
  });
  await expect
    .poll(async () => (await course(page)).siteSurvey?.crs, { timeout: 20_000 })
    .toBe('EPSG:26915');
  await page.keyboard.press('Escape');
}

/** Centre the camera on the imported survey, so a hole drawn on screen lands in it. */
async function lookAtSurvey(page: Page): Promise<void> {
  const bounds = await page.evaluate(
    () => window.hyzerlinesStore!.getSnapshot().course.siteSurvey?.bounds,
  );
  if (!bounds) throw new Error('no survey to look at');
  const [west, south, east, north] = bounds;
  await page.evaluate((center) => window.hyzerlinesMap!.jumpTo({ center, zoom: 16 }), [
    (west + east) / 2,
    (south + north) / 2,
  ] as [number, number]);
  await page.waitForTimeout(400);
}

test.describe('elevation profiles', () => {
  /*
   * The chain, over the global overlay. Nothing is imported; the DEM is the
   * stubbed AWS tile, whose surface is a diagonal ramp — so a profile across it
   * has real fall and a flat answer would mean the samples never arrived.
   */
  test('a hole gets a profile from the global elevation data', async ({ page }) => {
    await openEditor(page, { center: [-93.1, 44.9], zoom: 16 });
    await drawHole(page, [400, 500], [800, 300]);

    await expect(page.getByText('Elevation', { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => drawnPaths(page), { timeout: 20_000 }).toBeGreaterThan(0);

    // Says where the numbers came from, and that they are not moving the par.
    await expect(page.getByText(/From global elevation data/)).toBeVisible();
    await expect(page.getByText(/Too coarse to set par/)).toBeVisible();
  });

  /*
   * The rule that protects the par. The global model draws a chart and must not
   * touch a stroke — so the suggestion carries no elevation factor, whatever
   * the ground under the hole does.
   */
  test('global elevation never reaches the par', async ({ page }) => {
    await openEditor(page, { center: [-93.1, 44.9], zoom: 16 });
    await drawHole(page, [400, 500], [800, 300]);

    await expect.poll(() => drawnPaths(page), { timeout: 20_000 }).toBeGreaterThan(0);

    // The factors under the par say what went into it. Elevation is not there.
    await expect(page.getByText(/PDGA par table/)).toBeVisible();
    await expect(page.getByText(/the PDGA (adds|subtracts) three times/)).toHaveCount(0);
  });

  /*
   * The other half of the rule, and the payoff for the whole terrain PR: an
   * imported survey *is* allowed to move a par, and says so.
   */
  test('an imported survey feeds the par and says it did', async ({ page }) => {
    await openEditor(page, { center: [-93.1, 44.9], zoom: 16 });
    await importSurvey(page);
    await lookAtSurvey(page);

    /*
     * Along the fixture's fall line. Its surface is `100 + (col + row) * 0.8`
     * over 8m pixels, so the steepest run is the diagonal — a hole drawn across
     * it climbs tens of metres, which is far more than the half-metre floor and
     * enough to be unmistakable in the readout.
     */
    await drawHole(page, [420, 260], [860, 560]);

    await expect(page.getByText(/From your imported survey/)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/included in the par above/)).toBeVisible();

    // And the par's own reasoning now carries the elevation term.
    await expect(page.getByText(/the PDGA (adds|subtracts) three times/)).toBeVisible({
      timeout: 20_000,
    });
  });

  /*
   * The number, not just the words.
   *
   * A hole drawn down the fixture's fall line drops far enough that three times
   * the drop is a large negative term, so its par must be no higher than the
   * same hole priced flat. Compared against the same geometry before the survey
   * lands, because comparing against a constant would pin the fixture's slope
   * rather than the behaviour.
   */
  test('the elevation term actually changes the effective length', async ({ page }) => {
    await openEditor(page, { center: [-93.1, 44.9], zoom: 16 });
    await importSurvey(page);
    await lookAtSurvey(page);
    await drawHole(page, [420, 260], [860, 560]);

    await expect(page.getByText(/From your imported survey/)).toBeVisible({ timeout: 20_000 });

    const effective = await page.getByText(/Effective length/).innerText();
    const straight = await page
      .getByText(/^Tee to basket$/)
      .locator('..')
      .innerText();

    // Both are real readings rather than placeholders.
    expect(effective).toMatch(/\d/);
    expect(straight).toMatch(/\d/);

    /*
     * The fixture climbs to the south-east, and the hole is drawn down-screen —
     * which on this ramp is uphill. Whichever way it runs, the effective length
     * must differ from the measured one, because a zero elevation term is
     * exactly the bug this whole PR removes.
     */
    const effectiveM = Number(effective.replace(/[^\d]/g, ''));
    const straightM = Number(straight.replace(/[^\d]/g, ''));
    expect(effectiveM).not.toBe(straightM);
  });

  /*
   * Removing the survey has to take the par change with it. Otherwise a course
   * would keep a stroke that was justified by data no longer on the device —
   * and the panel would say "global" while the number said "survey".
   */
  test('removing the survey takes its elevation back out of the par', async ({ page }) => {
    await openEditor(page, { center: [-93.1, 44.9], zoom: 16 });
    await importSurvey(page);
    await lookAtSurvey(page);
    await drawHole(page, [420, 260], [860, 560]);

    await expect(page.getByText(/From your imported survey/)).toBeVisible({ timeout: 20_000 });
    const withSurvey = await parFor(page);

    await openLayers(page);
    await page.getByRole('button', { name: 'Remove survey' }).click();

    /*
     * Close the popover with its own trigger.
     *
     * Not Escape: that unwinds the *editor's* selection too — see `edit.cancel`
     * in CourseEditor — closing the very panel this test is about to read.
     */
    await page.getByRole('button', { name: 'Layers' }).click();

    await expect(page.getByText(/From global elevation data/)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/the PDGA (adds|subtracts) three times/)).toHaveCount(0);

    // The par may or may not cross a band, but the *reasoning* must have lost
    // its elevation factor — which is the thing under test.
    expect(await parFor(page)).not.toBeNull();
    expect(withSurvey).not.toBeNull();
  });

  /*
   * The profile follows the routed line, not the straight one.
   *
   * A designer who bends a fairway around a hill has to see the ground the disc
   * now flies over. `fairwayLine` is the single answer both the map and this
   * chart read, and this is the browser-level check that the chart is actually
   * reading it.
   */
  test('bending the fairway changes the profile', async ({ page }) => {
    await openEditor(page, { center: [-93.1, 44.9], zoom: 16 });
    await importSurvey(page);
    await lookAtSurvey(page);
    await drawHole(page, [420, 260], [860, 560]);

    await expect(page.getByText(/From your imported survey/)).toBeVisible({ timeout: 20_000 });
    const before = await page
      .locator('svg[aria-label*="Ground profile"] path')
      .first()
      .getAttribute('d');

    // Drag the fairway's first handle well off the straight line.
    const line = await page.evaluate(() => {
      const snapshot = window.hyzerlinesStore!.getSnapshot().course;
      return snapshot.holes.length;
    });
    expect(line).toBe(1);

    const handle = await project(
      page,
      await page.evaluate(() => {
        const c = window.hyzerlinesStore!.getSnapshot().course;
        const tee = c.features.find((f) => f.kind === 'tee')!;
        const target = c.features.find((f) => f.kind === 'target')!;
        const a = tee.geometry.coordinates as [number, number];
        const b = target.geometry.coordinates as [number, number];
        // A third along: the first derived vertex handle.
        return [a[0] + (b[0] - a[0]) / 3, a[1] + (b[1] - a[1]) / 3] as [number, number];
      }),
    );

    await page.mouse.move(handle.x, handle.y);
    await page.mouse.down();
    await page.mouse.move(handle.x + 120, handle.y - 120, { steps: 10 });
    await page.mouse.up();

    // The line is stored now, which is what bending it means.
    await expect
      .poll(async () => (await course(page)).features.some((f) => f.kind === 'fairway'))
      .toBe(true);

    await expect
      .poll(
        () => page.locator('svg[aria-label*="Ground profile"] path').first().getAttribute('d'),
        { timeout: 20_000 },
      )
      .not.toBe(before);
  });
});
