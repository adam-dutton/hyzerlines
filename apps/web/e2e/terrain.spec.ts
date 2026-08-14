import { test, expect, type Page } from '@playwright/test';

import {
  chooseBasemap,
  course,
  layerVisible,
  openEditor,
  openLayers,
  place,
  setBasemapDark,
  setSwitch,
  setTheme,
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

    /*
     * The switches, not the whole record — it also carries opacities and
     * softness now, and this test is about what is *shown*. Asserting the
     * object wholesale made adding an adjustment fail a test about visibility,
     * which is the assertion being too broad rather than the change being wrong.
     */
    const { overlays } = await course(page);
    expect(overlays.hillshade).toBe(false);
    expect(overlays.contours).toBe(false);
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
        page.evaluate(() => window.hyzerlinesMap!.getLayer('basemap-street') !== undefined),
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

    /*
     * Street first, then its dark switch off — in that order, because the
     * switch only exists for a basemap that *has* a dark twin, and Satellite
     * does not. Turning it off first looked for a control correctly absent.
     *
     * Off at all, because the dark Street map is drawn from Esri and never
     * touches OpenStreetMap. The claim under test is about hidden sources, not
     * about which of the two is on screen — see the dark basemaps block.
     */
    await chooseBasemap(page, 'Street');
    await setBasemapDark(page, false);
    await expect.poll(() => requested.has('osm'), { timeout: 10_000 }).toBe(true);
  });
});

/**
 * The overlay adjustments.
 *
 * The panel is the easy half. What only a browser can answer is whether moving
 * a slider reaches the *map* — MapLibre validates paint properties at runtime
 * and rejects a bad one silently, a raster-dem source's `maxzoom` cannot be
 * edited in place at all, and a contour source keeps its cached tiles unless
 * its url changes. Each of those is a way for a control to look connected and
 * do nothing.
 */

/** A layer's paint property, read back off the live map. */
const paint = (page: Page, layer: string, property: string): Promise<unknown> =>
  page.evaluate(
    ([id, prop]) =>
      window.hyzerlinesMap!.getLayer(id!)
        ? window.hyzerlinesMap!.getPaintProperty(id!, prop!)
        : null,
    [layer, property],
  );

const sourceMaxZoom = (page: Page, id: string): Promise<number | undefined> =>
  page.evaluate(
    (source) => (window.hyzerlinesMap!.getSource(source) as { maxzoom?: number })?.maxzoom,
    id,
  );

const sourceTiles = (page: Page, id: string): Promise<string | undefined> =>
  page.evaluate(
    (source) => (window.hyzerlinesMap!.getSource(source) as { tiles?: string[] })?.tiles?.[0],
    id,
  );

/** Move one of the terrain sliders. */
async function setSlider(page: Page, name: string, value: string): Promise<void> {
  await openLayers(page);
  await page.getByRole('slider', { name }).fill(value);
}

test.describe('overlay adjustments', () => {
  /*
   * MapLibre has no `hillshade-opacity`, so this rides on the shadow's alpha —
   * which is exact, because Igor shading with transparent highlights puts down
   * no other ink. If that ever stopped being true the control would silently
   * become a no-op, so the assertion is on the property the map actually holds.
   */
  test('hillshade opacity reaches the layer', async ({ page }) => {
    await openEditor(page, { center: [-93.1, 44.9], zoom: 14 });
    await openLayers(page);
    await setSwitch(page, 'Hillshade', true);

    expect(await paint(page, 'terrain-hillshade', 'hillshade-shadow-color')).toBe(
      'rgba(0, 0, 0, 1)',
    );

    await setSlider(page, 'Hillshade opacity', '0.4');
    await expect
      .poll(() => paint(page, 'terrain-hillshade', 'hillshade-shadow-color'))
      .toBe('rgba(0, 0, 0, 0.4)');
  });

  /*
   * Softness is the one that cannot be a paint property: it changes how deep a
   * DEM the shading reads, and `maxzoom` is fixed when a source is built. So
   * the source is removed and re-added, and this checks the rebuild happened
   * *and* left the layer behind it.
   */
  test('hillshade softness re-points the elevation source', async ({ page }) => {
    await openEditor(page, { center: [-93.1, 44.9], zoom: 14 });
    await openLayers(page);
    await setSwitch(page, 'Hillshade', true);

    expect(await sourceMaxZoom(page, 'terrain-dem')).toBe(13);

    await setSlider(page, 'Hillshade softness', '2');
    await expect.poll(() => sourceMaxZoom(page, 'terrain-dem')).toBe(11);

    // The layer survived the source being swapped underneath it.
    await expect.poll(() => layerVisible(page, 'terrain-hillshade')).toBe(true);
  });

  test('contour opacity scales the lines but keeps the index contours heavier', async ({
    page,
  }) => {
    await openEditor(page, { center: [-93.1, 44.9], zoom: 14 });
    await openLayers(page);
    await setSwitch(page, 'Contours', true);

    await setSlider(page, 'Contours opacity', '0.5');

    await expect
      .poll(async () => {
        const value = (await paint(page, 'terrain-contour-line', 'line-opacity')) as unknown[];
        return Array.isArray(value) ? value.slice(-2) : null;
      })
      // Full strength is a solid line now — it used to top out at 0.7, which
      // over canopy was barely there. The minor lines keep their ratio to the
      // index ones, which is the contrast that makes the labels findable.
      .toEqual([0.5, 0.32]);
  });

  /*
   * Smoothing is an argument to the isoline generator, encoded into the tile
   * url — which is also what invalidates the lines already traced. A control
   * that changed the setting without changing the url would leave the old
   * contours on screen indefinitely.
   */
  test('contour smoothing re-points the contour source', async ({ page }) => {
    await openEditor(page, { center: [-93.1, 44.9], zoom: 14 });
    await openLayers(page);
    await setSwitch(page, 'Contours', true);

    const before = await sourceTiles(page, 'terrain-contours');
    expect(before).toContain('subsampleBelow=256');

    /*
     * 512, not 1024, and the cap is the point. The isoline pass is quadratic in
     * grid width, so four times the resolution is sixteen times the work — at
     * 1024 tiles began exceeding their timeout and coming back empty, which is
     * what "the contours sometimes disappear" was. One doubling is the most the
     * global overlay can be asked for safely.
     */
    await setSlider(page, 'Contours smoothing', '2');
    await expect
      .poll(() => sourceTiles(page, 'terrain-contours'))
      .toContain('subsampleBelow=512');
  });

  /* And the settings travel with the course, like the switches they sit under. */
  test('the adjustments are part of the document and survive a reload', async ({ page }) => {
    await openEditor(page, { center: [-93.1, 44.9], zoom: 14 });
    await openLayers(page);
    await setSwitch(page, 'Hillshade', true);
    await setSlider(page, 'Hillshade opacity', '0.3');
    await waitForSave(page);

    await page.reload();
    await page.locator('[data-hydrated="true"]').waitFor({ state: 'attached' });

    await expect
      .poll(() => paint(page, 'terrain-hillshade', 'hillshade-shadow-color'), {
        timeout: 10_000,
      })
      .toBe('rgba(0, 0, 0, 0.3)');
  });

  /* A slider under a switch that is off is inert, and reads as inert. */
  test('the adjustments are disabled while their overlay is off', async ({ page }) => {
    await openEditor(page, { center: [-93.1, 44.9], zoom: 14 });
    await openLayers(page);
    await expect(page.getByRole('slider', { name: 'Hillshade opacity' })).toBeDisabled();

    await setSwitch(page, 'Hillshade', true);
    await expect(page.getByRole('slider', { name: 'Hillshade opacity' })).toBeEnabled();
  });
});

/**
 * Dark basemaps, and which way round the shading is inked.
 *
 * Two claims a browser has to settle. The first is that a theme switch reaches
 * the map at all: the tiles are a *different source*, not a filter over the
 * light ones, because MapLibre's raster paint has no invert and darkening a
 * light map without inverting it leaves black labels on grey paper.
 *
 * The second is the one that is easy to get wrong, and did: the shading's ink
 * follows the **ground**, not the interface. Imagery has no dark twin, so a
 * dark theme over satellite leaves a photograph on screen — and inking that in
 * white washes out the detail the imagery was chosen for.
 */
test.describe('dark basemaps', () => {
  const TOPO = 'basemap-topo';
  const TOPO_DARK = 'basemap-topo-dark';
  const TOPO_DARK_LABELS = 'basemap-topo-dark-labels';

  /* Dark is the default, so this is what the app opens as. */
  test('the topographic map draws its dark twin, labels and all', async ({ page }) => {
    await openEditor(page);
    await chooseBasemap(page, 'Topographic');

    await expect.poll(() => layerVisible(page, TOPO_DARK)).toBe(true);
    expect(await layerVisible(page, TOPO)).toBe(false);
    /*
     * Esri ships the dark canvas's labels as a second service, so this is the
     * one basemap drawn as two layers. Without it a street map is a picture of
     * roads rather than a map.
     */
    expect(await layerVisible(page, TOPO_DARK_LABELS)).toBe(true);
  });

  test('and goes back to the light tiles when the dark basemap is switched off', async ({
    page,
  }) => {
    await openEditor(page);
    await chooseBasemap(page, 'Topographic');
    await setBasemapDark(page, false);

    await expect.poll(() => layerVisible(page, TOPO)).toBe(true);
    expect(await layerVisible(page, TOPO_DARK)).toBe(false);
    expect(await layerVisible(page, TOPO_DARK_LABELS)).toBe(false);
  });

  /**
   * The separation, asserted directly.
   *
   * The basemap used to follow the interface theme, and the two are different
   * questions: how bright the panels are, and how bright the ground under the
   * drawing is. A designer working at night may still want a light topographic
   * sheet because that is what their corridors read against — so switching the
   * application to light must leave the map exactly where they put it.
   */
  test('the interface theme does not touch the basemap', async ({ page }) => {
    await openEditor(page);
    await chooseBasemap(page, 'Topographic');
    await expect.poll(() => layerVisible(page, TOPO_DARK)).toBe(true);

    await setTheme(page, 'light');

    expect(await layerVisible(page, TOPO_DARK), 'the map follows its own switch').toBe(true);
    expect(await layerVisible(page, TOPO)).toBe(false);
  });

  /* A photograph has no light mode to invert: it is whatever colour the ground is. */
  test('imagery has no dark twin and keeps its own tiles', async ({ page }) => {
    await openEditor(page);

    expect(await layerVisible(page, 'basemap-satellite')).toBe(true);
    const twin = await page.evaluate(
      () => window.hyzerlinesMap!.getLayer('basemap-satellite-dark') !== undefined,
    );
    expect(twin, 'imagery should not have a dark layer at all').toBe(false);
  });

  /* The credit follows the tiles. Crediting a provider nobody is looking at is
     not a smaller obligation met — it is a specific false claim. */
  test('the dark twin carries its own attribution', async ({ page }) => {
    await openEditor(page);
    await chooseBasemap(page, 'Topographic');

    await expect(page.getByText(/Tiles © Esri/)).toBeVisible();
    await expect(page.getByText(/DeLorme/)).toHaveCount(0);
  });

  /**
   * The regression this describe block exists for.
   *
   * Inking off the theme rather than off the basemap put white highlights over
   * satellite imagery the moment dark became the default — which is every
   * first load. See `groundIsDark`.
   */
  test('the shading inks for the ground, not for the theme', async ({ page }) => {
    await openEditor(page, { center: [-93.1, 44.9], zoom: 14 });
    await openLayers(page);
    await setSwitch(page, 'Hillshade', true);

    // Dark interface, imagery underneath: still black on the shaded side.
    expect(await paint(page, HILLSHADE, 'hillshade-shadow-color')).toBe('rgba(0, 0, 0, 1)');
    expect(await paint(page, HILLSHADE, 'hillshade-highlight-color')).toBe('rgba(0, 0, 0, 0)');

    // Dark canvas underneath: black would be invisible, so the relief comes
    // from light on the lit side instead.
    await chooseBasemap(page, 'Topographic');
    await expect
      .poll(() => paint(page, HILLSHADE, 'hillshade-highlight-color'))
      .toBe('rgba(255, 255, 255, 1)');
    expect(await paint(page, HILLSHADE, 'hillshade-shadow-color')).toBe('rgba(0, 0, 0, 0)');

    // And back, when the dark basemap is switched off and the light tiles return.
    await setBasemapDark(page, false);
    await expect
      .poll(() => paint(page, HILLSHADE, 'hillshade-shadow-color'))
      .toBe('rgba(0, 0, 0, 1)');
    expect(await paint(page, HILLSHADE, 'hillshade-highlight-color')).toBe('rgba(0, 0, 0, 0)');
  });
});
