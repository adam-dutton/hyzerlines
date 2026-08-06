import { test, expect, type Page } from '@playwright/test';

import {
  chooseBasemap,
  course,
  layerVisible,
  openEditor,
  openLayers,
  place,
  setSwitch,
  waitForSave,
} from './fixtures';

/**
 * The terrain overlays, and the style architecture underneath them.
 *
 * Two things only a browser can answer. The first is whether contours are
 * actually computed: they are generated in the page from elevation tiles rather
 * than fetched as lines, so "did the isoline generator run in its worker and
 * hand MapLibre a vector tile" has no representation anywhere else — not in a
 * type, not in a unit test.
 *
 * The second is the switch from `setStyle` to visibility toggles. Every basemap
 * is a source in one style now, which is a claim about MapLibre's behaviour —
 * that it does not fetch tiles for a source no visible layer uses, and that
 * nothing the app added is disturbed when the picture underneath changes.
 */

const HILLSHADE = 'terrain-hillshade';
const CONTOUR_LINE = 'terrain-contour-line';
const CONTOUR_LABEL = 'terrain-contour-label';

/**
 * How many distinct contour lines reached the map.
 *
 * Deduplicated on the elevation and the geometry's first coordinate, because
 * `querySourceFeatures` returns one copy per rendered tile — the same reason
 * `derivedOnMap` in geometry.spec.ts collapses on a key.
 */
const contoursOnMap = (page: Page): Promise<number> =>
  page.evaluate(() => {
    const rendered =
      window.hyzerlinesMap?.querySourceFeatures('terrain-contours', {
        sourceLayer: 'contours',
      }) ?? [];
    const seen = new Set(
      rendered.map((f) => {
        const geometry = f.geometry as { coordinates?: unknown };
        return `${String(f.properties?.['ele'])}:${JSON.stringify(geometry.coordinates).slice(0, 40)}`;
      }),
    );
    return seen.size;
  });

test.describe('terrain overlays', () => {
  /*
   * Off by default, and installed rather than added on demand.
   *
   * The switch is the whole architecture in one assertion: the layers exist
   * from the first frame and are merely hidden, which is what makes turning one
   * on a `visibility` change rather than a style rebuild.
   */
  test('the overlays are installed hidden, and start off', async ({ page }) => {
    await openEditor(page, { zoom: 14 });

    for (const layer of [HILLSHADE, CONTOUR_LINE, CONTOUR_LABEL]) {
      expect(
        await page.evaluate((id) => window.hyzerlinesMap!.getLayer(id) !== undefined, layer),
        `${layer} should be installed`,
      ).toBe(true);
      expect(await layerVisible(page, layer), `${layer} should start hidden`).toBe(false);
    }

    const { overlays } = await course(page);
    expect(overlays).toEqual({ hillshade: false, contours: false });
  });

  test('hillshade turns on from the layers panel', async ({ page }) => {
    await openEditor(page, { zoom: 14 });
    await openLayers(page);

    await setSwitch(page, 'Hillshade', true);
    await expect.poll(() => layerVisible(page, HILLSHADE)).toBe(true);

    await setSwitch(page, 'Hillshade', false);
    await expect.poll(() => layerVisible(page, HILLSHADE)).toBe(false);
  });

  /*
   * The one that proves the work happened.
   *
   * Nothing fetches contour lines — a worker reads the elevation tile, runs
   * marching squares over it and encodes a vector tile in the browser. Features
   * arriving in the `terrain-contours` source means that whole chain ran.
   */
  test('contours are generated in the browser from elevation tiles', async ({ page }) => {
    await openEditor(page, { zoom: 14 });
    await openLayers(page);

    await setSwitch(page, 'Contours', true);
    await expect.poll(() => layerVisible(page, CONTOUR_LINE)).toBe(true);
    await expect.poll(() => contoursOnMap(page), { timeout: 15_000 }).toBeGreaterThan(0);
  });

  /*
   * Both overlays read one elevation source and it is not ours, so the credit
   * appears when they do — and, just as importantly, leaves when they do.
   * Crediting a provider whose data is not on screen is its own kind of wrong.
   */
  test('the elevation credit follows the overlays on and off', async ({ page }) => {
    await openEditor(page, { zoom: 14 });

    const credit = page.getByText(/AWS Terrain Tiles/);
    await expect(credit).toBeHidden();

    await openLayers(page);
    await setSwitch(page, 'Hillshade', true);
    await expect(credit).toBeVisible();

    await setSwitch(page, 'Hillshade', false);
    await expect(credit).toBeHidden();
  });

  test('the overlay choice is part of the document and survives a reload', async ({ page }) => {
    await openEditor(page, { zoom: 14 });
    await openLayers(page);
    await setSwitch(page, 'Contours', true);

    await waitForSave(page);
    await page.reload();
    await page.locator('[data-hydrated="true"]').waitFor({ state: 'attached' });

    /*
     * Read off the map, not off the panel. What survived is the document's
     * business, and this also catches the race the restore has to win: the map
     * is built from a default document and the real one lands a beat later, so
     * an overlay applied before the style parsed would be silently dropped.
     */
    await expect.poll(() => layerVisible(page, CONTOUR_LINE)).toBe(true);
  });
});

test.describe('one style, switched rather than swapped', () => {
  /*
   * `setStyle` used to discard every source and layer the app had added, which
   * cost a real bug: the reinstall closure captured the empty first-render
   * document, so switching the basemap emptied the map until you reloaded.
   * Nothing is discarded now — the basemap layer's visibility changes and the
   * course is never touched.
   */
  test('the course survives a basemap switch', async ({ page }) => {
    await openEditor(page, { zoom: 16 });
    await place(page, 'Tee pad', 480, 460);
    await place(page, 'Target', 800, 260);
    await page.getByRole('button', { name: 'Add hole' }).click();

    const corridors = () =>
      page.evaluate(
        () =>
          new Set(
            window
              .hyzerlinesMap!.queryRenderedFeatures({ layers: ['derived-corridor'] })
              .map((f) => String(f.properties?.['id'])),
          ).size,
      );

    await expect.poll(corridors).toBe(1);

    await chooseBasemap(page, 'Street');
    await expect
      .poll(() =>
        page.evaluate(() => window.hyzerlinesMap!.getLayer('basemap-osm') !== undefined),
      )
      .toBe(true);

    await expect.poll(corridors, { message: 'the course should outlive the basemap' }).toBe(1);
  });

  /*
   * All three basemaps are sources in the style from the first frame. That is
   * only affordable because MapLibre does not request tiles for a source no
   * visible layer uses — if it did, opening the app would fetch three sets of
   * imagery to show one.
   */
  test('only the visible basemap requests tiles', async ({ page }) => {
    const requested = new Set<string>();
    await page.route('**://tile.openstreetmap.org/**', (route) => {
      requested.add('osm');
      return route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.alloc(0) });
    });

    await openEditor(page, { zoom: 14 });
    await page.waitForTimeout(600);
    expect(requested.has('osm'), 'a hidden basemap should not fetch').toBe(false);

    await chooseBasemap(page, 'Street');
    await expect.poll(() => requested.has('osm'), { timeout: 10_000 }).toBe(true);
  });
});
