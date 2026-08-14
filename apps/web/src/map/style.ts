import type maplibregl from 'maplibre-gl';
import type { StyleSpecification } from 'maplibre-gl';
import type { Overlays } from '@hyzerlines/core';

import { basemaps, basemapById, groundIsDark } from './basemaps';
import {
  CONTOUR_LABEL_LAYER,
  CONTOUR_LINE_LAYER,
  CONTOUR_SOURCE,
  DEM_SOURCE,
  HILLSHADE_LAYER,
  contourTilesUrl,
  demSourceSpec,
  MINOR_RATIO,
  hillshadeInk,
  terrainLayers,
} from './terrain';
import type { UnitSystem } from '../units';

/**
 * One style, built once, never replaced.
 *
 * Changing the basemap used to call `setStyle`, which throws away every source
 * and layer the app added and re-parses the whole document. That is a large
 * hammer for "show a different picture", and it had already cost one real bug:
 * `FeatureLayer` had to reinstall its entire scene on `styledata`, and because
 * that handler was bound once it closed over first-render props and re-added
 * the sources with an empty document. Switching the basemap emptied the map
 * until you reloaded.
 *
 * So every basemap is a source in this style from the start, and switching is a
 * `visibility` change on a layer. MapLibre does not request tiles for a source
 * no visible layer uses, so the three unused basemaps cost nothing but a few
 * lines of JSON — and the course, the handles and the preview are never
 * disturbed, because nothing is ever removed.
 *
 * The same mechanism carries the terrain overlays, which is the point: once
 * layers are switched rather than swapped, an overlay is not a new concept.
 *
 * ## Draw order
 *
 * Basemaps, then terrain, then whatever `FeatureLayer` appends. Terrain is
 * context for the design and must sit under it — a contour line over a hole
 * number is the map arguing with itself about what matters.
 */

/** Glyphs for every symbol layer. Labels are the one thing not drawn locally. */
const GLYPHS = 'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf';

/**
 * Layer ids for a basemap's rasters.
 *
 * Up to three per registry entry: the light tiles, the dark tiles, and — for a
 * dark twin that ships its labels separately — the reference layer over them.
 * A dark variant is not a new mechanism, just another hidden layer, which is
 * the whole point of building every basemap into one style: switching theme is
 * the same visibility change as switching basemap.
 */
export const basemapLayerId = (id: string): string => `basemap-${id}`;
export const basemapDarkLayerId = (id: string): string => `basemap-${id}-dark`;
export const basemapDarkLabelsLayerId = (id: string): string => `basemap-${id}-dark-labels`;

export function buildStyle(
  basemapId: string,
  overlays: Overlays,
  units: UnitSystem,
  dark: boolean,
): StyleSpecification {
  const active = basemapById(basemapId);

  const sources: StyleSpecification['sources'] = {
    [DEM_SOURCE]: demSourceSpec(overlays.hillshadeSoftness),
    [CONTOUR_SOURCE]: {
      type: 'vector',
      tiles: [contourTilesUrl(units, overlays.contourSmoothing)],
      maxzoom: 14,
    },
  };
  for (const basemap of basemaps) {
    sources[basemap.id] = {
      type: 'raster',
      tiles: [...basemap.tiles],
      tileSize: basemap.tileSize,
      maxzoom: basemap.maxZoom,
      attribution: basemap.attribution,
    };
    if (!basemap.dark) continue;
    sources[`${basemap.id}-dark`] = {
      type: 'raster',
      tiles: [...basemap.dark.tiles],
      tileSize: basemap.dark.tileSize,
      maxzoom: basemap.dark.maxZoom,
      attribution: basemap.dark.attribution,
    };
    if (basemap.dark.reference) {
      sources[`${basemap.id}-dark-labels`] = {
        type: 'raster',
        tiles: [...basemap.dark.reference],
        tileSize: basemap.dark.tileSize,
        maxzoom: basemap.dark.maxZoom,
        // Credited by the ground beneath it; the two are one service split in
        // two, and printing Esri twice on one line helps nobody.
        attribution: '',
      };
    }
  }

  return {
    version: 8,
    glyphs: GLYPHS,
    sources,
    layers: [
      ...basemaps.flatMap((basemap) => {
        const raster = (id: string, source: string, visible: boolean) => ({
          id,
          type: 'raster' as const,
          source,
          layout: { visibility: (visible ? 'visible' : 'none') as 'visible' },
          paint: { 'raster-fade-duration': 120 },
        });
        const chosen = basemap.id === active.id;
        const layers = [raster(basemapLayerId(basemap.id), basemap.id, chosen && !dark)];
        if (basemap.dark) {
          layers.push(
            raster(basemapDarkLayerId(basemap.id), `${basemap.id}-dark`, chosen && dark),
          );
          // Labels directly over their own ground, and under the terrain — the
          // same place the baked-in labels of the light maps already sit.
          if (basemap.dark.reference) {
            layers.push(
              raster(
                basemapDarkLabelsLayerId(basemap.id),
                `${basemap.id}-dark-labels`,
                chosen && dark,
              ),
            );
          }
        }
        return layers;
      }),
      /*
       * Inked for the ground, not for the interface. `dark` decides which
       * basemap tiles are drawn; whether those tiles came out dark is a
       * separate question, and it is the one the shading has to ask — see
       * `groundIsDark`.
       */
      ...terrainLayers(overlays, groundIsDark(basemapId, dark)),
    ],
  } as StyleSpecification;
}

/** Layers governed by each overlay switch. */
/**
 * The switches, and what each one shows.
 *
 * Keyed by the two boolean fields rather than by `keyof Overlays`, which now
 * also carries opacities and softness — those are not things that can be shown
 * or hidden, and typing this against the whole record would have demanded a
 * layer list for a number.
 */
const OVERLAY_LAYERS = {
  hillshade: [HILLSHADE_LAYER],
  contours: [CONTOUR_LINE_LAYER, CONTOUR_LABEL_LAYER],
} satisfies Record<string, readonly string[]>;

function setVisible(map: maplibregl.Map, layerId: string, visible: boolean): void {
  // Guarded because these run from effects that can fire before the style JSON
  // has parsed, and setLayoutProperty on a missing layer throws.
  if (!map.getLayer(layerId)) return;
  map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
}

/**
 * Whether the style has parsed far enough to be told what to show.
 *
 * Deliberately not `map.isStyleLoaded()`, which is a much stronger claim: it
 * means every *source* has loaded too, and it stays false while any of them is
 * still fetching — including one whose tiles will never arrive, which on a bad
 * network is forever. Gating a visibility change on that means a switch that
 * silently does nothing.
 *
 * What actually has to be true is that the layers exist, and they exist as soon
 * as the style JSON is parsed, because `buildStyle` puts all of them in it.
 */
export function styleReady(map: maplibregl.Map): boolean {
  return map.getLayer(basemapLayerId(basemaps[0]!.id)) !== undefined;
}

export function applyBasemap(map: maplibregl.Map, basemapId: string, dark: boolean): void {
  const active = basemapById(basemapId);
  for (const basemap of basemaps) {
    const chosen = basemap.id === active.id;
    // A basemap with no dark twin stays itself in a dark interface. Imagery is
    // the case that matters: a photograph has no light mode to invert.
    const showDark = chosen && dark && basemap.dark !== undefined;
    setVisible(map, basemapLayerId(basemap.id), chosen && !showDark);
    setVisible(map, basemapDarkLayerId(basemap.id), showDark);
    setVisible(map, basemapDarkLabelsLayerId(basemap.id), showDark);
  }
}

export function applyOverlays(map: maplibregl.Map, overlays: Overlays): void {
  for (const [key, layers] of Object.entries(OVERLAY_LAYERS)) {
    const on = overlays[key as keyof typeof OVERLAY_LAYERS];
    for (const layer of layers) setVisible(map, layer, on);
  }
}

/**
 * The overlays' appearance, as live paint properties.
 *
 * Separate from `applyOverlays` because these are cheap in a way visibility is
 * not interesting about: `setPaintProperty` re-renders the frame and touches
 * nothing else, so a slider can drive it directly at pointer rate. Softness is
 * the exception and has its own function below, because it changes what is
 * fetched rather than how it is drawn.
 *
 * The survey's layers take the same treatment from `applySurveyStyling`; both
 * read the same fields, so an imported survey and the global model shade
 * identically and switching between them looks like a change of data rather
 * than a change of settings.
 */
export function applyOverlayStyling(
  map: maplibregl.Map,
  overlays: Overlays,
  darkGround: boolean,
): void {
  setHillshadeOpacity(map, HILLSHADE_LAYER, overlays.hillshadeOpacity, darkGround);
  setContourOpacity(map, CONTOUR_LINE_LAYER, CONTOUR_LABEL_LAYER, overlays.contourOpacity);
}

/** Shared with the survey's hillshade, so the two never drift apart. */
export function setHillshadeOpacity(
  map: maplibregl.Map,
  layerId: string,
  opacity: number,
  darkGround: boolean,
): void {
  if (!map.getLayer(layerId)) return;
  const ink = hillshadeInk(opacity, darkGround);
  map.setPaintProperty(layerId, 'hillshade-shadow-color', ink.shadow);
  map.setPaintProperty(layerId, 'hillshade-highlight-color', ink.highlight);
}

export function setContourOpacity(
  map: maplibregl.Map,
  lineId: string,
  labelId: string,
  opacity: number,
): void {
  if (map.getLayer(lineId)) {
    map.setPaintProperty(lineId, 'line-opacity', [
      'case',
      ['>', ['get', 'level'], 0],
      opacity,
      opacity * MINOR_RATIO,
    ]);
  }
  /*
   * The labels follow the lines, at full strength rather than scaled.
   *
   * A contour's number is the only part of it carrying a value, and turning the
   * lines down is usually done to stop them competing with the imagery — not to
   * stop being able to read the heights. They go when the layer goes.
   */
  if (map.getLayer(labelId)) {
    map.setPaintProperty(labelId, 'text-opacity', opacity === 0 ? 0 : 1);
  }
}

/**
 * Re-point the DEM when the softness changes what depth to read.
 *
 * A `raster-dem` source's `maxzoom` is fixed at construction, so this is a
 * remove-and-re-add — the same reason `applySurveyLayers` tears itself down. It
 * is the expensive one of these, which is why it compares first: dropping the
 * source throws away every decoded elevation tile, and doing that to arrive at
 * the same depth would be a stutter for nothing.
 */
export function applyDemSoftness(map: maplibregl.Map, overlays: Overlays): void {
  const spec = demSourceSpec(overlays.hillshadeSoftness);
  const existing = map.getSource(DEM_SOURCE) as { maxzoom?: number } | undefined;
  if (!existing || existing.maxzoom === spec.maxzoom) return;

  /*
   * The layer has to go first and come back in the same place. MapLibre refuses
   * to remove a source anything still references, and re-adding a layer without
   * `beforeId` would append it over the course.
   */
  const layer = map.getLayer(HILLSHADE_LAYER) ? map.getStyle().layers : null;
  const index = layer?.findIndex((l) => l.id === HILLSHADE_LAYER) ?? -1;
  const before = index >= 0 ? layer?.[index + 1]?.id : undefined;
  const spec_ = index >= 0 ? layer?.[index] : undefined;

  if (map.getLayer(HILLSHADE_LAYER)) map.removeLayer(HILLSHADE_LAYER);
  map.removeSource(DEM_SOURCE);
  map.addSource(DEM_SOURCE, spec);
  if (spec_) map.addLayer(spec_, before);
}

/**
 * Re-point the contour source when the reader switches units.
 *
 * The interval and the metres-to-feet multiplier are encoded in the tile url —
 * that is how `maplibre-contour` is configured — so changing units means
 * changing the url. `setTiles` swaps it on the live source and drops the cached
 * tiles, which is the whole operation: no style rebuild, and every other layer
 * on the map is untouched.
 *
 * Compares before writing, because the caller cannot tell which of its inputs
 * changed and this is the expensive one: re-pointing a source throws away every
 * contour tile already computed, and recomputing them to arrive at identical
 * lines is a stutter for nothing.
 */
export function applyContourUnits(map: maplibregl.Map, units: UnitSystem, smoothing = 0): void {
  const source = map.getSource(CONTOUR_SOURCE) as
    { tiles?: string[]; setTiles?: (tiles: string[]) => void } | undefined;
  if (!source?.setTiles) return;

  // Smoothing rides in the same url for the same reason the interval does —
  // it is an argument to the isoline generator, and changing it is what
  // invalidates the tiles already traced.
  const url = contourTilesUrl(units, smoothing);
  if (source.tiles?.[0] === url) return;
  source.setTiles([url]);
}
