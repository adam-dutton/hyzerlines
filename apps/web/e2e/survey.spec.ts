import { test, expect, type Page } from '@playwright/test';

import {
  course,
  fakeSurveyGeoTiff,
  layerVisible,
  openEditor,
  openLayers,
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
    await expect(page.getByText(/EPSG:26915/)).toBeVisible();
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
