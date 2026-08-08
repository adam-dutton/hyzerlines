import { test, expect, type Page } from '@playwright/test';

import {
  course,
  fakeSurveyGeoTiff,
  layerVisible,
  openEditor,
  openLayers,
  place,
  setSwitch,
  waitForSave,
} from './fixtures';

/**
 * Importing a site survey, end to end.
 *
 * The arithmetic underneath — tile bounds, resampling, terrarium encoding — is
 * unit tested in core against grids whose every value is known. What only a
 * browser can answer is whether the chain holds together: a real GeoTIFF read
 * with `geotiff`, its projection recovered from GeoKeys, reprojected with
 * proj4, resampled, encoded as PNG through `OffscreenCanvas`, written to
 * IndexedDB, served back through a MapLibre protocol, and turned into contours
 * by a worker. Every one of those is a place where the whole thing silently
 * produces nothing, and none of them exists outside a page.
 */

const SURVEY_HILLSHADE = 'survey-hillshade';
const SURVEY_CONTOUR_LINE = 'survey-contour-line';
const GLOBAL_HILLSHADE = 'terrain-hillshade';

/** Hand the page a file without a file dialog. */
async function importSurvey(page: Page): Promise<void> {
  await openLayers(page);
  const tiff = await fakeSurveyGeoTiff();
  await page.locator('input[type="file"]').setInputFiles({
    name: 'survey-1m.tif',
    mimeType: 'image/tiff',
    buffer: tiff,
  });
}

/**
 * Point the camera at the survey that was just imported.
 *
 * Read off the document rather than hard-coded, because the fixture's position
 * is a UTM easting and northing and the camera wants degrees — converting by
 * hand in the test would be reimplementing the very reprojection under test,
 * and getting it wrong would look like the importer had misplaced the terrain.
 *
 * It also matters that this is explicit: MapLibre only requests tiles for what
 * is on screen, so a survey a kilometre off the edge generates nothing and the
 * assertion below would fail for a reason that has nothing to do with contours.
 */
async function lookAtSurvey(page: Page): Promise<void> {
  const bounds = await page.evaluate(
    () => window.hyzerlinesStore!.getSnapshot().course.siteSurvey?.bounds,
  );
  if (!bounds) throw new Error('no survey to look at');
  const [west, south, east, north] = bounds;
  await page.evaluate((center) => window.hyzerlinesMap!.jumpTo({ center, zoom: 14 }), [
    (west + east) / 2,
    (south + north) / 2,
  ] as [number, number]);
  await page.waitForTimeout(400);
}

/** Distinct contour lines the survey put on the map. */
const surveyContours = (page: Page): Promise<number> =>
  page.evaluate(() => {
    const rendered =
      window.hyzerlinesMap?.querySourceFeatures('survey-contours', {
        sourceLayer: 'contours',
      }) ?? [];
    return new Set(rendered.map((f) => String(f.properties?.['ele']))).size;
  });

test.describe('site survey', () => {
  /*
   * The one that proves the whole chain. A GeoTIFF in UTM goes in; contours
   * generated from it in this tab come out.
   */
  test('a UTM GeoTIFF becomes contours on the map', async ({ page }) => {
    await openEditor(page, { center: [-93.1, 44.9], zoom: 14 });
    await importSurvey(page);

    // The document records it, with the projection it arrived in.
    await expect
      .poll(async () => (await course(page)).siteSurvey?.crs, {
        timeout: 20_000,
      })
      .toBe('EPSG:26915');

    await lookAtSurvey(page);
    await openLayers(page);
    await setSwitch(page, 'Contours', true);

    await expect.poll(() => layerVisible(page, SURVEY_CONTOUR_LINE)).toBe(true);
    await expect.poll(() => surveyContours(page), { timeout: 20_000 }).toBeGreaterThan(0);
  });

  /*
   * Two hillshades of the same hill at different resolutions, stacked, is
   * exactly what a designer should never see — and it is what happens if the
   * global overlay is not told to stand down.
   */
  test('the global terrain stands down for an imported survey', async ({ page }) => {
    await openEditor(page, { center: [-93.1, 44.9], zoom: 14 });
    await openLayers(page);
    await setSwitch(page, 'Hillshade', true);
    await expect.poll(() => layerVisible(page, GLOBAL_HILLSHADE)).toBe(true);

    await importSurvey(page);

    await expect
      .poll(() => layerVisible(page, SURVEY_HILLSHADE), {
        timeout: 20_000,
      })
      .toBe(true);
    await expect.poll(() => layerVisible(page, GLOBAL_HILLSHADE)).toBe(false);
  });

  /*
   * The resolution shown is the one the tiles were built at, never the file's
   * headline number — a large file is read from a coarser overview to fit in
   * memory, and claiming its native resolution would overstate the tiles.
   */
  test('the panel reports what was imported', async ({ page }) => {
    await openEditor(page, { center: [-93.1, 44.9], zoom: 14 });
    await importSurvey(page);

    await openLayers(page);
    await expect(page.getByText('survey-1m.tif')).toBeVisible({ timeout: 20_000 });
    // The projection's published name rather than its code: `EPSG:26915` says
    // only that something was read, where the name is a fact the designer can
    // check against the file they exported.
    await expect(page.getByText('NAD83 / UTM zone 15N')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Remove survey' })).toBeVisible();
  });

  test('removing a survey puts the global terrain back', async ({ page }) => {
    await openEditor(page, { center: [-93.1, 44.9], zoom: 14 });
    await openLayers(page);
    await setSwitch(page, 'Hillshade', true);
    await importSurvey(page);
    await expect
      .poll(() => layerVisible(page, SURVEY_HILLSHADE), {
        timeout: 20_000,
      })
      .toBe(true);

    await openLayers(page);
    await page.getByRole('button', { name: 'Remove survey' }).click();

    await expect.poll(async () => (await course(page)).siteSurvey).toBeNull();
    await expect.poll(() => layerVisible(page, GLOBAL_HILLSHADE)).toBe(true);
    await expect
      .poll(() =>
        page.evaluate(() => window.hyzerlinesMap!.getLayer('survey-hillshade') !== undefined),
      )
      .toBe(false);
  });

  /*
   * The document carries the survey's metadata and IndexedDB carries its
   * pixels, so both have to survive a reload for the survey to come back.
   */
  test('an imported survey survives a reload', async ({ page }) => {
    await openEditor(page, { center: [-93.1, 44.9], zoom: 14 });
    await importSurvey(page);
    await expect
      .poll(async () => (await course(page)).siteSurvey?.name, {
        timeout: 20_000,
      })
      .toBe('survey-1m.tif');

    await waitForSave(page);
    await page.reload();
    await page.locator('[data-hydrated="true"]').waitFor({ state: 'attached' });

    await expect
      .poll(
        () =>
          page.evaluate(() => window.hyzerlinesMap!.getLayer('survey-hillshade') !== undefined),
        { timeout: 20_000 },
      )
      .toBe(true);
  });

  /*
   * State Plane, in US survey feet.
   *
   * The importer started with a hand-written table of UTM, British National
   * Grid and lat/long, and refused `EPSG:6428` — NAD83(2011) / Colorado Central
   * (ftUS) — which is an entirely ordinary projection for county LiDAR. It
   * reads the whole EPSG registry now.
   *
   * Feet are the part worth a test of its own: every other supported projection
   * is in metres, and a linear unit silently ignored would place a survey about
   * three times too far from the projection's origin.
   */
  test('a State Plane survey in US survey feet imports', async ({ page }) => {
    await openEditor(page, { center: [-104.99, 39.74], zoom: 14 });
    await openLayers(page);

    await page.locator('input[type="file"]').setInputFiles({
      name: 'denver-1m.tif',
      mimeType: 'image/tiff',
      // Colorado Central's origin is 3,000,000 x 1,000,000 ftUS; this sits a
      // little north-east of Denver, and the pixel size is in feet too.
      buffer: await fakeSurveyGeoTiff({
        epsg: 6428,
        origin: [3_140_000, 1_700_000],
        pixelSize: 26,
      }),
    });

    await expect
      .poll(async () => (await course(page)).siteSurvey?.crs, { timeout: 20_000 })
      .toBe('EPSG:6428');

    const survey = (await course(page)).siteSurvey!;
    // The published name, not just the code — it is what a designer can check
    // against what they exported, and it says outright that this one is in feet.
    expect(survey.crsName).toContain('Colorado Central');

    /*
     * Landed in Colorado rather than somewhere the units got lost. Denver is
     * near -105, 39.7; treating ftUS as metres would put this over 1000km away.
     */
    const [west, south, east, north] = survey.bounds;
    expect(west).toBeGreaterThan(-106);
    expect(east).toBeLessThan(-104);
    expect(south).toBeGreaterThan(39);
    expect(north).toBeLessThan(41);

    // And the resolution is reported in metres whatever the file used.
    expect(survey.resolutionMeters).toBeGreaterThan(5);
    expect(survey.resolutionMeters).toBeLessThan(12);

    await openLayers(page);
    await expect(page.getByText(/Colorado Central/)).toBeVisible();
  });

  /*
   * A GeoTIFF with no projection cannot be placed on the earth, and guessing
   * one would put a course in the wrong hemisphere. Refusing has to say why, in
   * words written for whoever chose the file.
   */
  test('a file with no projection is refused, with a reason', async ({ page }) => {
    await openEditor(page, { center: [-93.1, 44.9], zoom: 14 });
    await openLayers(page);

    await page.locator('input[type="file"]').setInputFiles({
      name: 'not-elevation.tif',
      mimeType: 'image/tiff',
      buffer: Buffer.from('this is not a geotiff at all'),
    });

    await expect(page.getByRole('alert')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: 'Try another file' })).toBeVisible();
  });
});

/**
 * Vertical units.
 *
 * The bug these exist to prevent shipped once: a Colorado survey in State Plane
 * US survey feet, read as metres, put the ground at 22,000 ft. Everything else
 * about the import was right — the projection resolved, the bounds landed, the
 * contours drew — which is what made it survive review. Elevations were out by
 * 3.28, and the PDGA's effective-length formula then multiplied them by three.
 *
 * Browser-only: the unit is recovered from GeoKeys by `geotiff`, and the
 * conversion has to survive resampling, terrarium encoding, a PNG round trip
 * and IndexedDB before anybody reads a number off it.
 */

/** The elevations the chart's own axis is labelled with. */
async function axisLabels(page: Page): Promise<number[]> {
  const chart = page.locator('svg[aria-label*="Ground profile"]');
  const text = await chart.locator('text').allTextContents();
  return text.filter((t) => /^-?\d+$/.test(t)).map(Number);
}

/** Import a file, look at it, and draw a hole across it. */
async function surveyWithHole(page: Page, tiff: Buffer): Promise<void> {
  await openLayers(page);
  await page.locator('input[type="file"]').setInputFiles({
    name: 'site.tif',
    mimeType: 'image/tiff',
    buffer: tiff,
  });
  await expect
    .poll(async () => (await course(page)).siteSurvey !== null, { timeout: 20_000 })
    .toBe(true);
  await page.keyboard.press('Escape');

  const bounds = await page.evaluate(
    () => window.hyzerlinesStore!.getSnapshot().course.siteSurvey!.bounds,
  );
  const [west, south, east, north] = bounds;
  await page.evaluate((center) => window.hyzerlinesMap!.jumpTo({ center, zoom: 16 }), [
    (west + east) / 2,
    (south + north) / 2,
  ] as [number, number]);
  await page.waitForTimeout(400);

  await place(page, 'Tee pad', 450, 300);
  await place(page, 'Target', 800, 500);
  await page.getByRole('button', { name: 'Add hole' }).click();
}

test.describe('survey vertical units', () => {
  /*
   * The regression itself. EPSG:6428 is NAD83(2011) / Colorado Central (ftUS),
   * and a State Plane DEM carries its heights in the same US survey feet its
   * coordinates are in. Ground here is around 6,700 ft; read as metres it
   * reports 22,000, which is above the summit of Denali.
   */
  test('a State Plane survey in feet reports feet, not metres', async ({ page }) => {
    await openEditor(page, { center: [-105.5, 39.0], zoom: 16 });
    await surveyWithHole(
      page,
      await fakeSurveyGeoTiff({
        epsg: 6428,
        origin: [3_000_000, 1_600_000],
        pixelSize: 26,
        baseElevation: 6700,
      }),
    );

    await expect(page.getByText(/From your imported survey/)).toBeVisible({ timeout: 20_000 });

    const labels = await axisLabels(page);
    expect(labels.length).toBeGreaterThan(0);
    // Colorado ground, in the feet the reader asked for. The failing build put
    // every one of these above 22,000.
    for (const label of labels) {
      expect(label).toBeGreaterThan(6000);
      expect(label).toBeLessThan(8000);
    }
  });

  /* The panel says which unit was used, and that it was worked out rather than read. */
  test('the panel says the vertical unit was inferred', async ({ page }) => {
    await openEditor(page, { center: [-105.5, 39.0], zoom: 16 });
    await openLayers(page);
    await page.locator('input[type="file"]').setInputFiles({
      name: 'colorado.tif',
      mimeType: 'image/tiff',
      buffer: await fakeSurveyGeoTiff({
        epsg: 6428,
        origin: [3_000_000, 1_600_000],
        pixelSize: 26,
        baseElevation: 6700,
      }),
    });

    await expect(page.getByText(/Heights in US survey feet/)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/inferred from its coordinates/)).toBeVisible();
  });

  /*
   * A declaration beats the inference. A file whose coordinates are in feet but
   * whose heights are declared metric is unusual and entirely legal, and
   * `VerticalUnitsGeoKey` is the file saying so outright.
   */
  test('a declared vertical unit wins over the coordinate system', async ({ page }) => {
    await openEditor(page, { center: [-105.5, 39.0], zoom: 16 });
    await openLayers(page);
    await page.locator('input[type="file"]').setInputFiles({
      name: 'declared.tif',
      mimeType: 'image/tiff',
      buffer: await fakeSurveyGeoTiff({
        epsg: 6428,
        origin: [3_000_000, 1_600_000],
        pixelSize: 26,
        baseElevation: 2042,
        verticalUnits: 9001,
      }),
    });

    await expect(page.getByText(/Heights in meters/)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/inferred from its coordinates/)).toHaveCount(0);
  });

  /* And a metric file is still read as metric — the fix must not invert. */
  test('a UTM survey in metres is unchanged', async ({ page }) => {
    await openEditor(page, { center: [-93.1, 44.9], zoom: 16 });
    await surveyWithHole(page, await fakeSurveyGeoTiff({ baseElevation: 100 }));

    await expect(page.getByText(/From your imported survey/)).toBeVisible({ timeout: 20_000 });

    const labels = await axisLabels(page);
    expect(labels.length).toBeGreaterThan(0);
    // 100–303 m of fixture, read in feet: 328–995. Nothing near 1,000 m worth.
    for (const label of labels) {
      expect(label).toBeGreaterThan(200);
      expect(label).toBeLessThan(1200);
    }
  });
});
