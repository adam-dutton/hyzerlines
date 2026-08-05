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

/**
 * Build a MapLibre `match` expression over feature kinds from the tokens.
 *
 * Every kind currently resolves to the same white — see the note on `feature` in
 * the design tokens. The expression is kept rather than collapsed to a constant
 * because bringing hue back for some kinds is then a token change and nothing
 * else, which is the whole point of generating map styling from the tokens.
 */
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

/** Kind colour normally, the selection colour when selected. */
function selectableColor(role: 'stroke' | 'fill'): ExpressionSpecification {
  return ['case', selected, featureColors.selected[role], colorByKind(role)];
}

/**
 * Selection turns the casing into a coloured halo.
 *
 * Size alone is not enough to read as "selected" — a slightly larger dot next
 * to a slightly smaller one is a comparison, not a state, and it disappears
 * entirely when the feature is the only one of its kind on screen. Recolouring
 * the contrast floor gives an unmistakable halo against both dark canopy and
 * bright sand.
 *
 * It used to invert dark-to-white, which worked while features carried their
 * own hues. Now that every feature *is* white, a white halo would be invisible
 * against the thing it surrounds, so selection is the one place colour is spent.
 */
const CASING_COLOR: ExpressionSpecification = [
  'case',
  selected,
  featureColors.selected.casing,
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
 * A dash pattern and the casing pattern that lines up underneath it.
 *
 * `line-dasharray` is measured in line widths, so a casing twice as wide as its
 * stroke needs half the dash numbers to break in the same places. Get that wrong
 * and the casing fills the gaps — which is exactly how a dashed line ends up
 * looking solid, and is what made selected fairways read as solid strokes: the
 * gaps were there, filled in by a casing in a near-identical blue.
 *
 * The ratio has to be constant for this to hold, so widths that vary with
 * selection vary together.
 */
function casingDash(dash: readonly [number, number], ratio: number): [number, number] {
  return [dash[0] / ratio, dash[1] / ratio];
}

/** Casing width as a multiple of stroke width, wherever a dash has to align. */
const CASING_RATIO = 2.2;

const CENTRELINE_DASH = [3, 2] as const;
const CENTRELINE_WIDTH: ExpressionSpecification = ['case', selected, 4, 2.5];
const CENTRELINE_CASING_WIDTH: ExpressionSpecification = [
  'case',
  selected,
  4 * CASING_RATIO,
  2.5 * CASING_RATIO,
];

/**
 * A property boundary is a note about the land, not a thing on it.
 *
 * So it gets the thinnest dotted line on the map and no fill at all. The fill
 * was the real problem: a boundary is routinely the largest shape on screen, and
 * a translucent wash over the whole site dims the imagery a designer is reading
 * the terrain from — every tree line and every fall of ground goes through it.
 * A dotted outline says the same thing and takes nothing away.
 */
const BOUNDARY_DASH = [1, 2] as const;
const BOUNDARY_WIDTH: ExpressionSpecification = ['case', selected, 2, 1.25];
const BOUNDARY_CASING_WIDTH: ExpressionSpecification = [
  'case',
  selected,
  2 * CASING_RATIO,
  1.25 * CASING_RATIO,
];

const isBoundary: ExpressionSpecification = ['==', ['get', 'kind'], 'boundary'];

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
    /*
     * Putting circles, at their real size on the ground.
     *
     * Outline only — three filled rings stacked around every basket would sit
     * on the imagery a designer is reading the terrain from. Circle 1 is the one
     * that is a rule, so it is drawn solid and the other two dashed: 20 m is a
     * real figure the rules use for pace of play rather than a named circle, and
     * the 3 m bullseye is league convention that appears in no PDGA document.
     * See TARGET_CIRCLES.
     */
    {
      id: 'derived-circle',
      type: 'line',
      source: DERIVED_SOURCE,
      filter: ['==', ['get', 'derived'], 'circle'],
      layout: { 'line-join': 'round' },
      paint: {
        'line-color': featureColors.target.stroke,
        'line-width': ['case', ['==', ['get', 'circle'], 'c1'], 1.5, 1],
        'line-opacity': ['case', ['==', ['get', 'authority'], 'rules'], 0.75, 0.45],
        'line-dasharray': [
          'case',
          ['==', ['get', 'authority'], 'rules'],
          ['literal', [1, 0]],
          ['literal', [2, 2]],
        ],
      },
    },
    {
      id: 'derived-corridor',
      type: 'fill',
      source: DERIVED_SOURCE,
      filter: isCorridor,
      paint: {
        'fill-color': selectableColor('fill'),
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
        'line-color': selectableColor('stroke'),
        'line-width': 1,
        'line-opacity': 0.6,
        'line-dasharray': [3, 2],
      },
    },
    /*
     * The centreline, cased like any other vector, and always dashed.
     *
     * Always: a fairway is a drawing aid the app worked out, not a thing on the
     * ground, and it should say so whether or not anybody has bent it. It used
     * to go solid once shaped, which put the two most similar-looking marks on
     * the map — a routed fairway and a drawn path — one keystroke apart.
     *
     * Butt caps, not round: round caps swell each dash into a lozenge and close
     * the gaps at this width.
     */
    {
      id: 'derived-centreline-casing',
      type: 'line',
      source: DERIVED_SOURCE,
      filter: isCentreline,
      layout: { 'line-join': 'round', 'line-cap': 'butt' },
      paint: {
        'line-color': CASING_COLOR,
        'line-width': CENTRELINE_CASING_WIDTH,
        'line-dasharray': casingDash(CENTRELINE_DASH, CASING_RATIO),
      },
    },
    {
      id: 'derived-centreline',
      type: 'line',
      source: DERIVED_SOURCE,
      filter: isCentreline,
      layout: { 'line-join': 'round', 'line-cap': 'butt' },
      paint: {
        'line-color': selectableColor('stroke'),
        'line-width': CENTRELINE_WIDTH,
        'line-dasharray': [...CENTRELINE_DASH],
      },
    },
    {
      id: 'derived-footprint',
      type: 'fill',
      source: DERIVED_SOURCE,
      filter: isFootprint,
      paint: {
        'fill-color': selectableColor('fill'),
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
        'line-color': selectableColor('stroke'),
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
  const isArea: ExpressionSpecification = ['==', ['geometry-type'], 'Polygon'];
  /*
   * Boundaries are split out rather than styled by a `case` inside one layer.
   *
   * `line-dasharray` takes no data-driven expression — MapLibre accepts only a
   * constant or a zoom function — so "dashed for one kind, solid for the rest"
   * cannot be written as a paint expression at all. Two filtered layers is the
   * supported way to say it, and the filters are exact complements so nothing
   * is drawn twice or missed.
   */
  const isPlainArea: ExpressionSpecification = ['all', isArea, ['!', isBoundary]];
  const isBoundaryArea: ExpressionSpecification = ['all', isArea, isBoundary];

  return [
    // --- Areas. Fill first so outlines sit on top of their own fill.
    {
      id: 'features-polygon-fill',
      type: 'fill',
      source: FEATURES_SOURCE,
      filter: isPlainArea,
      paint: {
        'fill-color': selectableColor('fill'),
        'fill-opacity': ['case', selected, 0.9, 0.7],
      },
    },
    {
      id: 'features-polygon-casing',
      type: 'line',
      source: FEATURES_SOURCE,
      filter: isPlainArea,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': CASING_COLOR, 'line-width': LINE_CASING_WIDTH },
    },
    {
      id: 'features-polygon-stroke',
      type: 'line',
      source: FEATURES_SOURCE,
      filter: isPlainArea,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': selectableColor('stroke'), 'line-width': LINE_WIDTH },
    },

    // The property boundary: no fill, a thin dotted outline. See BOUNDARY_DASH.
    {
      id: 'features-boundary-casing',
      type: 'line',
      source: FEATURES_SOURCE,
      filter: isBoundaryArea,
      layout: { 'line-join': 'round', 'line-cap': 'butt' },
      paint: {
        'line-color': CASING_COLOR,
        'line-width': BOUNDARY_CASING_WIDTH,
        'line-dasharray': casingDash(BOUNDARY_DASH, CASING_RATIO),
      },
    },
    {
      id: 'features-boundary-stroke',
      type: 'line',
      source: FEATURES_SOURCE,
      filter: isBoundaryArea,
      layout: { 'line-join': 'round', 'line-cap': 'butt' },
      paint: {
        'line-color': selectableColor('stroke'),
        'line-width': BOUNDARY_WIDTH,
        'line-dasharray': [...BOUNDARY_DASH],
      },
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
      paint: { 'line-color': selectableColor('stroke'), 'line-width': LINE_WIDTH },
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
        'circle-color': selectableColor('stroke'),
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
 * How far the hole number sits off the point it labels, in screen pixels.
 *
 * It has to sit off it at all because the label's home is the midpoint of the
 * shot, and on a straight fairway that is exactly where the midpoint handle
 * appears when the hole is selected — so selecting a hole put a vertex handle
 * dead centre over its own number. Everything else on that spot is small, so
 * clearing the handle's radius is enough.
 *
 * Screen pixels, not ground metres: the gap has to stay the same at every zoom
 * because the thing it is clearing is drawn in screen pixels too.
 */
const LABEL_OFFSET_PX: [number, number] = [0, -22];

/**
 * The hole's number, on the ground.
 *
 * A disc, not bare text: a number floating over satellite imagery is unreadable
 * over a good fraction of it, and a filled pill gives the digits a background to
 * be legible against without a text halo doing the work of a shape.
 *
 * Installed above the features it labels and clickable — it is the most direct
 * way to select a hole, and the only one that does not require already knowing
 * which shapes belong to it.
 */
export function holeLabelLayers(): LayerSpecification[] {
  const isLabel: ExpressionSpecification = ['==', ['get', 'derived'], 'holeLabel'];
  return [
    {
      id: 'hole-label-disc',
      type: 'circle',
      source: DERIVED_SOURCE,
      filter: isLabel,
      paint: {
        'circle-color': ['case', selected, featureColors.selected.casing, CASING],
        'circle-radius': ['case', selected, 14, 12],
        'circle-stroke-color': featureColors.tee.stroke,
        'circle-stroke-width': ['case', selected, 2, 1],
        'circle-translate': LABEL_OFFSET_PX,
      },
    },
    {
      id: 'hole-label',
      type: 'symbol',
      source: DERIVED_SOURCE,
      filter: isLabel,
      layout: {
        'text-field': ['get', 'number'],
        'text-size': 13,
        // Never dropped for collision: a course where 7 and 8 sit close together
        // is exactly when you need to tell them apart.
        'text-allow-overlap': true,
        'text-ignore-placement': true,
      },
      paint: {
        'text-color': featureColors.tee.stroke,
        'text-translate': LABEL_OFFSET_PX,
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
  'hole-label-disc',
  'features-target',
  'features-point',
  'features-line-stroke',
  'features-polygon-fill',
  /*
   * A boundary has no fill, so its outline is the only thing to click, and the
   * casing is used rather than the stroke because it is the wider of the two —
   * a 1.25 px dotted line is not a target anybody can hit. It carries the same
   * feature id, so which one answers makes no difference to the caller.
   */
  'features-boundary-casing',
  'derived-footprint',
] as const;

/** The layers that stand for a drawn area, whichever way it is styled. */
const AREA_LAYERS: readonly string[] = ['features-polygon-fill', 'features-boundary-casing'];

/**
 * Layers a drag can pick a feature up by. Everything interactive except areas.
 *
 * An area is usually the biggest thing on the screen — a property boundary can
 * cover the entire viewport — so making its fill a drag target means the map
 * stops panning. You go to push the view across and take the boundary with you
 * instead, and the one gesture used constantly loses to one used almost never.
 * Areas are still selectable, still reshapeable by their vertex handles; they
 * just do not slide under the cursor.
 *
 * `derived-footprint` stays: a tee pad is drawn as an area but it *is* its tee,
 * a point a few metres across, and dragging the pad is how you move the tee.
 */
export const DRAGGABLE_LAYERS = INTERACTIVE_LAYERS.filter(
  (layer) => !AREA_LAYERS.includes(layer),
);

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
