import type maplibregl from 'maplibre-gl';
import type { Overlays, SiteSurvey } from '@hyzerlines/core';

import { SURVEY_TILES_URL, registerSurveyProtocol } from '../survey/protocol';
import {
  SURVEY_CONTOUR_TILES_URL,
  prepareSurveyContours,
  registerSurveyContourProtocol,
  setSurveyContourUnits,
} from '../survey/contourProtocol';
import { COURSE_BOTTOM_LAYER } from './featureLayers';
import { contourLayerSpecs, hillshadeLayerSpec } from './terrain';
import type { UnitSystem } from '../units';

/**
 * The imported survey, as map layers.
 *
 * Everything the global overlay does, pointed at a different DEM: one
 * `raster-dem` source, one hillshade layer, one contour source and its two
 * layers. That symmetry is the whole reason the importer writes terrarium PNGs
 * rather than some format of its own — the machinery already existed, and a
 * survey only had to arrive in a shape it recognised.
 *
 * ## Why these are added at runtime, when the basemaps are not
 *
 * `style.ts` puts every basemap in the style up front precisely so nothing has
 * to be added or removed later. A survey cannot work that way: its source's
 * `maxzoom` is a property of the file somebody imported, and it decides where
 * MapLibre stops asking for real tiles and starts scaling up the last one it
 * has. Fixed at a guess it is wrong in both directions — too low throws away
 * detail that was imported, too high asks for tiles that were never generated
 * and draws nothing.
 *
 * So the layers arrive with the survey and leave with it. That is a handful of
 * `addLayer` calls rather than a style swap, so it still disturbs nothing else
 * on the map.
 */

export const SURVEY_DEM_SOURCE = 'survey-dem';
export const SURVEY_CONTOUR_SOURCE = 'survey-contours';

export const SURVEY_HILLSHADE_LAYER = 'survey-hillshade';
export const SURVEY_CONTOUR_LINE_LAYER = 'survey-contour-line';
export const SURVEY_CONTOUR_LABEL_LAYER = 'survey-contour-label';

const SURVEY_LAYERS = [
  SURVEY_HILLSHADE_LAYER,
  SURVEY_CONTOUR_LINE_LAYER,
  SURVEY_CONTOUR_LABEL_LAYER,
] as const;

/** Remove the survey's sources and layers, if they are installed. */
export function removeSurveyLayers(map: maplibregl.Map): void {
  for (const layer of SURVEY_LAYERS) {
    if (map.getLayer(layer)) map.removeLayer(layer);
  }
  // Sources only after every layer using them is gone; MapLibre throws
  // otherwise, and the throw takes down whatever effect called this.
  for (const source of [SURVEY_CONTOUR_SOURCE, SURVEY_DEM_SOURCE]) {
    if (map.getSource(source)) map.removeSource(source);
  }
}

/**
 * Install the survey's layers, replacing any already there.
 *
 * Torn down and rebuilt rather than mutated, because the interesting change —
 * importing a different file — changes the source's depth, and a source's
 * `maxzoom` cannot be edited in place.
 */
export function applySurveyLayers(
  map: maplibregl.Map,
  survey: SiteSurvey,
  overlays: Overlays,
  units: UnitSystem,
): void {
  removeSurveyLayers(map);
  registerSurveyProtocol();
  registerSurveyContourProtocol();
  setSurveyContourUnits(units);
  prepareSurveyContours(survey.maxZoom);

  map.addSource(SURVEY_DEM_SOURCE, {
    type: 'raster-dem',
    tiles: [SURVEY_TILES_URL],
    encoding: 'terrarium',
    tileSize: 256,
    maxzoom: survey.maxZoom,
    bounds: survey.bounds,
  });

  map.addSource(SURVEY_CONTOUR_SOURCE, {
    type: 'vector',
    tiles: [SURVEY_CONTOUR_TILES_URL],
    maxzoom: survey.maxZoom,
    bounds: survey.bounds,
  });

  /*
   * Under the course, over the basemap.
   *
   * `beforeId` is the course's own bottom layer when it is installed, and
   * undefined before then — on a fresh load these can land first, and appending
   * is correct in that case because `FeatureLayer` puts the course on top of
   * whatever it finds.
   */
  const beforeId = map.getLayer(COURSE_BOTTOM_LAYER) ? COURSE_BOTTOM_LAYER : undefined;

  const layers = [
    hillshadeLayerSpec(SURVEY_HILLSHADE_LAYER, SURVEY_DEM_SOURCE, overlays.hillshade),
    ...contourLayerSpecs(
      SURVEY_CONTOUR_LINE_LAYER,
      SURVEY_CONTOUR_LABEL_LAYER,
      SURVEY_CONTOUR_SOURCE,
      overlays.contours,
    ),
  ];

  for (const layer of layers) {
    if (beforeId) map.addLayer(layer, beforeId);
    else map.addLayer(layer);
  }
}

/** Show or hide the survey's layers, following the overlay switches. */
export function applySurveyVisibility(map: maplibregl.Map, overlays: Overlays): void {
  const visible: Record<string, boolean> = {
    [SURVEY_HILLSHADE_LAYER]: overlays.hillshade,
    [SURVEY_CONTOUR_LINE_LAYER]: overlays.contours,
    [SURVEY_CONTOUR_LABEL_LAYER]: overlays.contours,
  };
  for (const [layer, on] of Object.entries(visible)) {
    if (map.getLayer(layer)) {
      map.setLayoutProperty(layer, 'visibility', on ? 'visible' : 'none');
    }
  }
}
