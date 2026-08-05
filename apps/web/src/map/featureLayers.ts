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
export const DERIVED_SOURCE = 'derived-geometry';
export const HANDLES_SOURCE = 'edit-handles';

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

/**
 * Derived geometry: tee and drop-zone pads, fairway corridors.
 *
 * Installed BEFORE the feature layers, so they sit underneath, and left out of
 * `INTERACTIVE_LAYERS`, so they never take a click. Both matter — the pad is a
 * consequence of the point, and a designer who could grab either would have to
 * work out which one is the real feature.
 *
 * Drawn as a fill with a dashed hairline instead of a solid outline. That is the
 * conventional grammar for "computed", and it keeps a tee pad from looking like
 * a small polygon somebody drew by hand.
 */
export function derivedLayers(): LayerSpecification[] {
  return [
    {
      id: 'derived-fill',
      type: 'fill',
      source: DERIVED_SOURCE,
      paint: {
        'fill-color': colorByKind('fill'),
        // Fainter than a drawn area of the same kind: it is context for the
        // feature on top of it, not a thing in its own right.
        'fill-opacity': 0.55,
      },
    },
    {
      id: 'derived-outline',
      type: 'line',
      source: DERIVED_SOURCE,
      layout: { 'line-join': 'round' },
      paint: {
        'line-color': colorByKind('stroke'),
        'line-width': 1,
        'line-opacity': 0.7,
        'line-dasharray': [3, 2],
      },
    },
  ];
}

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

/**
 * Vertex handles for the shape being reshaped.
 *
 * Installed last, above everything, because they are the smallest targets on
 * screen and losing a hit test to the line they sit on would make them feel
 * broken. Solid for a real vertex, hollow for the midpoint that becomes one —
 * the same distinction every vector editor draws, so it needs no explanation.
 */
export function vertexLayers(): LayerSpecification[] {
  return [
    {
      id: 'edit-midpoint',
      type: 'circle',
      source: HANDLES_SOURCE,
      filter: ['==', ['get', 'role'], 'midpoint'],
      paint: {
        // Hollow: the map shows through, so it reads as a slot rather than a point.
        'circle-color': 'rgba(0, 0, 0, 0)',
        'circle-radius': 4,
        'circle-stroke-color': featureColors.handle.stroke,
        'circle-stroke-width': 1.5,
        'circle-opacity': 1,
      },
    },
    {
      id: 'edit-vertex',
      type: 'circle',
      source: HANDLES_SOURCE,
      filter: ['==', ['get', 'role'], 'vertex'],
      paint: {
        'circle-color': featureColors.handle.fill,
        'circle-radius': 5,
        'circle-stroke-color': featureColors.handle.stroke,
        'circle-stroke-width': 2,
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
