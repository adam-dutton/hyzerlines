import type { LayerSpecification, ExpressionSpecification } from 'maplibre-gl';
import { feature as featureColors, type FeatureKind } from '@hyzerlines/design';
import { FEATURE_KINDS, type Feature } from '@hyzerlines/core';

/**
 * How course features are drawn.
 *
 * Colors come from the design tokens rather than being restated here, so map
 * geometry and interface chrome share one source of truth. This is the payoff
 * for authoring tokens in TypeScript: MapLibre can't read CSS custom
 * properties, but it can read the object those properties were generated from.
 *
 * EVERY VECTOR IS DRAWN TWICE — a dark casing beneath a colored stroke. No
 * single stroke color survives the range from tree canopy to sand to snow, and
 * without the casing features vanish over a large fraction of real imagery.
 * That is why each geometry gets a pair of layers rather than one.
 */

export const FEATURES_SOURCE = 'course-features';

/** Build a MapLibre `match` expression over feature kinds from the tokens. */
function colorByKind(role: 'stroke' | 'fill'): ExpressionSpecification {
  const cases = FEATURE_KINDS.flatMap((kind) => [
    kind,
    featureColors[kind as FeatureKind][role],
  ]) as (string | number)[];
  // A match needs a fallback; an unknown kind should be loud, not invisible.
  return [
    'match',
    ['get', 'kind'],
    ...cases,
    featureColors.handle.stroke,
  ] as unknown as ExpressionSpecification;
}

const CASING = featureColors.tee.casing;

const selected: ExpressionSpecification = ['boolean', ['feature-state', 'selected'], false];

/**
 * Selection swaps the casing from dark to white.
 *
 * Size alone is not enough to read as "selected" — a slightly larger dot next
 * to a slightly smaller one is a comparison, not a state, and it disappears
 * entirely when the feature is the only one of its kind on screen. Inverting
 * the casing turns the contrast floor into a halo, which is unmistakable
 * against both dark canopy and bright sand, and it does not touch hue — so a
 * selected OB boundary is still recognizably red.
 */
const CASING_COLOR: ExpressionSpecification = [
  'case',
  selected,
  featureColors.handle.stroke,
  CASING,
];

/**
 * Widths are in screen pixels, deliberately, not ground meters.
 *
 * A fairway centerline is an annotation, not a physical object — it should stay
 * legible at every zoom rather than shrinking to nothing when you zoom out to
 * see the whole property. Areas differ: an OB boundary encloses real ground, so
 * its fill scales naturally with the map while its outline stays readable.
 */
const LINE_WIDTH: ExpressionSpecification = ['case', selected, 4, 2.5];
const LINE_CASING_WIDTH: ExpressionSpecification = ['case', selected, 8, 6];
const POINT_RADIUS: ExpressionSpecification = ['case', selected, 9, 7];

export function featureLayers(): LayerSpecification[] {
  return [
    // --- Areas. Fill first so outlines sit on top of their own fill.
    {
      id: 'features-polygon-fill',
      type: 'fill',
      source: FEATURES_SOURCE,
      filter: ['==', ['geometry-type'], 'Polygon'],
      paint: {
        'fill-color': colorByKind('fill'),
        'fill-opacity': ['case', selected, 0.9, 0.7],
      },
    },
    {
      id: 'features-polygon-casing',
      type: 'line',
      source: FEATURES_SOURCE,
      filter: ['==', ['geometry-type'], 'Polygon'],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': CASING_COLOR, 'line-width': LINE_CASING_WIDTH },
    },
    {
      id: 'features-polygon-stroke',
      type: 'line',
      source: FEATURES_SOURCE,
      filter: ['==', ['geometry-type'], 'Polygon'],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': colorByKind('stroke'), 'line-width': LINE_WIDTH },
    },

    // --- Lines.
    {
      id: 'features-line-casing',
      type: 'line',
      source: FEATURES_SOURCE,
      filter: ['==', ['geometry-type'], 'LineString'],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': CASING_COLOR, 'line-width': LINE_CASING_WIDTH },
    },
    {
      id: 'features-line-stroke',
      type: 'line',
      source: FEATURES_SOURCE,
      filter: ['==', ['geometry-type'], 'LineString'],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': colorByKind('stroke'), 'line-width': LINE_WIDTH },
    },

    // --- Points last: they are the things you click, and must win hit-testing.
    {
      id: 'features-point',
      type: 'circle',
      source: FEATURES_SOURCE,
      filter: ['==', ['geometry-type'], 'Point'],
      paint: {
        'circle-color': colorByKind('stroke'),
        'circle-radius': POINT_RADIUS,
        // The casing, as a stroke rather than a second layer.
        'circle-stroke-color': CASING_COLOR,
        'circle-stroke-width': ['case', selected, 3, 2],
      },
    },
  ];
}

/** Layers that should respond to clicks, topmost first. */
export const INTERACTIVE_LAYERS = [
  'features-point',
  'features-line-stroke',
  'features-polygon-fill',
] as const;

/**
 * Convert the document's features into GeoJSON for MapLibre.
 *
 * Polygon rings are stored open — see features.ts — so the closing point is
 * added here. GeoJSON requires it; the rest of the app is spared having to
 * remember it.
 */
export function toGeoJSON(features: readonly Feature[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: features.map((f) => ({
      type: 'Feature',
      // `id` lives in properties, not at the top level: the source declares
      // promoteId: 'id' because MapLibre rejects non-numeric top-level ids.
      properties: { id: f.id, kind: f.kind, label: f.label },
      geometry: toGeoJSONGeometry(f),
    })),
  };
}

function toGeoJSONGeometry(f: Feature): GeoJSON.Geometry {
  switch (f.geometry.type) {
    case 'point':
      return { type: 'Point', coordinates: f.geometry.coordinates };
    case 'line':
      return { type: 'LineString', coordinates: f.geometry.coordinates };
    case 'polygon': {
      const ring = f.geometry.coordinates;
      return { type: 'Polygon', coordinates: [[...ring, ring[0]!]] };
    }
  }
}
