import type maplibregl from 'maplibre-gl';
import type { StyleSpecification } from 'maplibre-gl';
import type { Overlays } from '@hyzerlines/core';

import { basemaps, basemapById } from './basemaps';
import {
  CONTOUR_LABEL_LAYER,
  CONTOUR_LINE_LAYER,
  CONTOUR_SOURCE,
  DEM_SOURCE,
  HILLSHADE_LAYER,
  contourTilesUrl,
  demSourceSpec,
  shadowColor,
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

/** Layer id for a basemap's raster layer. One per entry in the registry. */
export const basemapLayerId = (id: string): string => `basemap-${id}`;

export function buildStyle(
  basemapId: string,
  overlays: Overlays,
  units: UnitSystem,
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
      tileSize: 256,
      maxzoom: basemap.maxZoom,
      attribution: basemap.attribution,
    };
  }

  return {
    version: 8,
    glyphs: GLYPHS,
    sources,
    layers: [
      ...basemaps.map((basemap) => ({
        id: basemapLayerId(basemap.id),
        type: 'raster' as const,
        source: basemap.id,
        layout: { visibility: (basemap.id === active.id ? 'visible' : 'none') as 'visible' },
        paint: { 'raster-fade-duration': 120 },
      })),
      ...terrainLayers(overlays),
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

export function applyBasemap(map: maplibregl.Map, basemapId: string): void {
  const active = basemapById(basemapId);
  for (const basemap of basemaps) {
    setVisible(map, basemapLayerId(basemap.id), basemap.id === active.id);
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
export function applyOverlayStyling(map: maplibregl.Map, overlays: Overlays): void {
  setHillshadeOpacity(map, HILLSHADE_LAYER, overlays.hillshadeOpacity);
  setContourOpacity(map, CONTOUR_LINE_LAYER, CONTOUR_LABEL_LAYER, overlays.contourOpacity);
}

/** Shared with the survey's hillshade, so the two never drift apart. */
export function setHillshadeOpacity(
  map: maplibregl.Map,
  layerId: string,
  opacity: number,
): void {
  if (!map.getLayer(layerId)) return;
  map.setPaintProperty(layerId, 'hillshade-shadow-color', shadowColor(opacity));
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
      0.7 * opacity,
      0.45 * opacity,
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
