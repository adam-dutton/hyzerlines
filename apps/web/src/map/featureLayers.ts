import type { LayerSpecification, ExpressionSpecification } from 'maplibre-gl';
import { feature as featureColors, type FeatureKind } from '@hyzerlines/design';
import { FEATURE_KINDS, type Feature } from '@hyzerlines/core';

import { BASKET_ICON, BASKET_ICON_SELECTED } from './icons';

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
 * A point marker fades out once the shape it stands for is legible.
 *
 * Only affects features that have a derived footprint — everything else stays
 * at full strength. The window is z17 to z18.5: a typical 2 m pad is about four
 * screen pixels across at 17 and twelve at 18.5, which is where it stops being
 * a smudge and starts being a rectangle you could point at.
 */
const POINT_OPACITY: ExpressionSpecification = [
  /*
   * The interpolate has to be outermost, and the per-feature test inside it.
   *
   * MapLibre only accepts `zoom` as the direct input to a top-level `step` or
   * `interpolate`; wrapping it in a `case` fails validation and takes the whole
   * layer down with it, which presents as points that simply never draw. So the
   * fade runs for every point and the endpoint decides whether it goes anywhere:
   * 1 → 0 for a feature with a pad, 1 → 1 for everything else.
   */
  'interpolate',
  ['linear'],
  ['zoom'],
  17,
  1,
  18.5,
  ['case', ['coalesce', ['get', 'hasFootprint'], false], 0, 1],
];

/**
 * Derived geometry: tee and drop-zone pads, fairway corridors and centrelines.
 *
 * Installed BEFORE the feature layers so they sit underneath — with one
 * deliberate exception. **The tee pad is the tee.** It carries the tee's own id,
 * it responds to clicks, and it takes selection styling, because the point
 * underneath it is suppressed once a pad exists. A dot and a rectangle both
 * standing for one tee would be the interface claiming two objects where the
 * designer placed one.
 *
 * Corridors keep the dashed hairline that reads as "computed". A tee pad does
 * not: it is a physical rectangle of concrete, and the fact that its corners
 * were calculated is an implementation detail rather than something to hedge
 * about on screen.
 */
export function derivedLayers(): LayerSpecification[] {
  const isCorridor: ExpressionSpecification = ['==', ['get', 'derived'], 'corridor'];
  const isFootprint: ExpressionSpecification = ['==', ['get', 'derived'], 'footprint'];
  const isCentreline: ExpressionSpecification = ['==', ['get', 'derived'], 'centreline'];

  return [
    {
      id: 'derived-corridor',
      type: 'fill',
      source: DERIVED_SOURCE,
      filter: isCorridor,
      paint: {
        'fill-color': colorByKind('fill'),
        // Fainter than a drawn area of the same kind: it is the room the shot
        // has, not a thing in its own right.
        'fill-opacity': ['case', selected, 0.8, 0.5],
      },
    },
    {
      id: 'derived-corridor-outline',
      type: 'line',
      source: DERIVED_SOURCE,
      filter: isCorridor,
      layout: { 'line-join': 'round' },
      paint: {
        'line-color': colorByKind('stroke'),
        'line-width': 1,
        'line-opacity': 0.6,
        'line-dasharray': [3, 2],
      },
    },
    /*
     * The centreline, cased like any other vector.
     *
     * Dashed until the designer bends it. A straight line is a consequence of
     * where the tee and the pin are; a shaped one is a decision, and the two
     * should not look alike.
     */
    {
      id: 'derived-centreline-casing',
      type: 'line',
      source: DERIVED_SOURCE,
      filter: isCentreline,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': CASING_COLOR, 'line-width': LINE_CASING_WIDTH },
    },
    {
      id: 'derived-centreline',
      type: 'line',
      source: DERIVED_SOURCE,
      filter: isCentreline,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': colorByKind('stroke'),
        'line-width': LINE_WIDTH,
        'line-dasharray': ['case', ['get', 'shaped'], ['literal', [1, 0]], ['literal', [3, 2]]],
      },
    },
    {
      id: 'derived-footprint',
      type: 'fill',
      source: DERIVED_SOURCE,
      filter: isFootprint,
      paint: {
        'fill-color': colorByKind('fill'),
        'fill-opacity': ['case', selected, 0.95, 0.75],
      },
    },
    {
      id: 'derived-footprint-casing',
      type: 'line',
      source: DERIVED_SOURCE,
      filter: isFootprint,
      layout: { 'line-join': 'round' },
      paint: { 'line-color': CASING_COLOR, 'line-width': ['case', selected, 5, 3.5] },
    },
    {
      id: 'derived-footprint-outline',
      type: 'line',
      source: DERIVED_SOURCE,
      filter: isFootprint,
      layout: { 'line-join': 'round' },
      paint: {
        'line-color': colorByKind('stroke'),
        'line-width': ['case', selected, 2.5, 1.5],
      },
    },
  ];
}

function basketLayer(
  id: string,
  icon: string,
  opacity: ExpressionSpecification,
): LayerSpecification {
  return {
    id,
    type: 'symbol',
    source: FEATURES_SOURCE,
    filter: ['all', ['==', ['geometry-type'], 'Point'], ['==', ['get', 'kind'], 'target']],
    layout: {
      'icon-image': icon,
      // The pole's base sits on the coordinate, because that is where the
      // basket actually stands.
      'icon-anchor': 'bottom',
      // Baskets on adjacent pin positions must all stay visible; MapLibre would
      // otherwise drop whichever it decided was less important.
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
    paint: { 'icon-opacity': opacity },
  };
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

    /*
     * --- Lines.
     *
     * Fairways are excluded: they are drawn by the derived source instead,
     * whether or not the document stores one. Drawing a shaped fairway here as
     * well would put two lines on the same coordinates, and the designer would
     * see a doubled stroke on exactly the holes they had bothered to route.
     */
    {
      id: 'features-line-casing',
      type: 'line',
      source: FEATURES_SOURCE,
      filter: [
        'all',
        ['==', ['geometry-type'], 'LineString'],
        ['!=', ['get', 'kind'], 'fairway'],
      ],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': CASING_COLOR, 'line-width': LINE_CASING_WIDTH },
    },
    {
      id: 'features-line-stroke',
      type: 'line',
      source: FEATURES_SOURCE,
      filter: [
        'all',
        ['==', ['geometry-type'], 'LineString'],
        ['!=', ['get', 'kind'], 'fairway'],
      ],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': colorByKind('stroke'), 'line-width': LINE_WIDTH },
    },

    /*
     * --- Points last: they are the things you click, and must win hit-testing.
     *
     * Targets are excluded outright — they get the basket glyph below, because
     * a basket is the one object on a course everybody recognises on sight and
     * a coloured circle is indistinguishable from a mando or a noted point.
     *
     * Tees with a pad are a subtler case. The pad *is* the tee, so a dot in the
     * middle of it is a second marker for one object — but a pad is two metres
     * of real ground, which is a fraction of a pixel at the zoom you use to see
     * a whole course. Suppressing the dot outright makes tees vanish exactly
     * when you are looking at the layout as a whole.
     *
     * So the dot hands over rather than disappearing: full strength while the
     * pad is too small to see, gone by the time the pad is unmistakable.
     */
    {
      id: 'features-point',
      type: 'circle',
      source: FEATURES_SOURCE,
      filter: ['all', ['==', ['geometry-type'], 'Point'], ['!=', ['get', 'kind'], 'target']],
      paint: {
        'circle-color': colorByKind('stroke'),
        'circle-radius': POINT_RADIUS,
        'circle-opacity': POINT_OPACITY,
        // The casing, as a stroke rather than a second layer.
        'circle-stroke-color': CASING_COLOR,
        'circle-stroke-width': ['case', selected, 3, 2],
        'circle-stroke-opacity': POINT_OPACITY,
      },
    },
    /*
     * The basket, as two stacked layers cross-faded by selection.
     *
     * It has to be two. `icon-image` is a LAYOUT property, and MapLibre refuses
     * feature-state expressions in layout properties — the whole layer fails
     * validation and never installs, which presents as baskets simply not
     * drawing. `icon-opacity` is paint, where feature-state is allowed, so the
     * selected glyph is a second layer faded in over the first.
     */
    basketLayer('features-target', BASKET_ICON, ['case', selected, 0, 1]),
    basketLayer('features-target-selected', BASKET_ICON_SELECTED, ['case', selected, 1, 0]),
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

/**
 * Layers that should respond to clicks, topmost first.
 *
 * `derived-footprint` is in here despite being derived geometry, because a tee
 * pad *is* its tee — it carries the tee's id and the point beneath it is not
 * drawn. It sits last so that anything standing on a pad still wins the click.
 *
 * `derived-centreline` is not: a fairway with no stored feature has no id to
 * select, and clicking one should reach whatever is under it.
 */
export const INTERACTIVE_LAYERS = [
  'features-target',
  'features-point',
  'features-line-stroke',
  'features-polygon-fill',
  'derived-footprint',
] as const;

/**
 * Convert the document's features into GeoJSON for MapLibre.
 *
 * Polygon rings are stored open — see features.ts — so the closing point is
 * added here. GeoJSON requires it; the rest of the app is spared having to
 * remember it.
 */
export function toGeoJSON(
  features: readonly Feature[],
  withFootprint: ReadonlySet<string> = new Set(),
): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: features.map((f) => ({
      type: 'Feature',
      // `id` lives in properties, not at the top level: the source declares
      // promoteId: 'id' because MapLibre rejects non-numeric top-level ids.
      properties: {
        id: f.id,
        kind: f.kind,
        label: f.label,
        // Suppresses the point marker: the derived pad is standing in for it.
        hasFootprint: withFootprint.has(f.id),
      },
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
