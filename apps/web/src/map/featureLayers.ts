import type { LayerSpecification, ExpressionSpecification } from 'maplibre-gl';
import { feature as featureColors } from '@hyzerlines/design';
import {
  FEATURE_KINDS,
  KIND_DEFINITIONS,
  PLACED_RECTANGLE_DEFAULTS,
  TARGET_CIRCLES,
  isSmoothed,
  metresPerPixel,
  smoothRing,
  type Feature,
  type FeatureKind,
  type TargetCircleId,
} from '@hyzerlines/core';

import { MARKER_SIZE_PX, markerIcon, type MarkerName } from './icons';
import { CASING_RATIO, DASH_PATTERNS, casingDash, type ResolvedStyle } from './mapStyle';
import { hasPattern, letteringLayer } from './patterns';

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

/**
 * The lowest layer the course itself draws.
 *
 * Anything installed at runtime that belongs *under* the design — an imported
 * survey's hillshade, say — inserts before this, so it cannot end up over a
 * fairway corridor or a hole number. Exported rather than spelled out at the
 * call site so that reordering `derivedLayers` cannot silently change what
 * "under the course" means.
 */
export const COURSE_BOTTOM_LAYER = 'derived-outside';

export const FEATURES_SOURCE = 'course-features';
export const DERIVED_SOURCE = 'derived-geometry';
export const HANDLES_SOURCE = 'edit-handles';

/**
 * A colour, or the selection colour when the feature is selected.
 *
 * Selection is a colour swap and nothing else. Every one of these used to be a
 * `case` on selection that also changed a size: lines thickened, points grew,
 * outlines appeared. Which meant selecting a hole *redrew* it — the geometry on
 * screen stopped being the geometry you had drawn, and a fairway's apparent
 * width depended on whether you happened to have it selected. On a map whose
 * whole job is to be measured off, that is the one thing the drawing must not
 * do.
 *
 * It is legible enough: accent blue against a designer's own colours is not a
 * subtle difference, and it is the only thing on screen that is ever blue.
 */
function selectable(color: string, role: 'stroke' | 'fill'): ExpressionSpecification {
  return ['case', selected, featureColors.selected[role], color];
}

/**
 * Selection turns the casing into a coloured halo.
 *
 * Size alone is not enough to read as "selected" — a slightly larger dot next
 * to a slightly smaller one is a comparison, not a state, and it disappears
 * entirely when the feature is the only one of its kind on screen. Recolouring
 * the contrast floor gives an unmistakable halo against both dark canopy and
 * bright sand.
 */
function casingColor(casing: string): ExpressionSpecification {
  return ['case', selected, featureColors.selected.casing, casing];
}

/**
 * A dash, as the paint fragment MapLibre wants.
 *
 * Absent for a solid line rather than `[1, 0]`: a zero-length gap renders as a
 * row of degenerate segments, which reads as a line that is somehow both solid
 * and broken.
 */
const dashPaint = (dash: readonly number[] | null) =>
  dash ? { 'line-dasharray': [...dash] } : {};

/** Layer ids, named once so the interactive and draggable lists cannot drift. */
export const circleLayer = (id: TargetCircleId) => `derived-circle-${id}`;
export const areaFillLayer = (kind: FeatureKind) => `features-${kind}-fill`;
export const areaStrokeLayer = (kind: FeatureKind) => `features-${kind}-stroke`;
export const lineStrokeLayer = (kind: FeatureKind) => `features-${kind}-stroke`;
/** A pad is drawn per kind, so a drop zone can sit under a tee. See `padLayers`. */
export const padLayer = (kind: 'tee' | 'dropzone') => `derived-footprint-${kind}`;

export const areaKinds = (): FeatureKind[] =>
  FEATURE_KINDS.filter((kind) => KIND_DEFINITIONS[kind].geometry === 'polygon');

export const lineKinds = (): FeatureKind[] =>
  FEATURE_KINDS.filter(
    (kind) => KIND_DEFINITIONS[kind].geometry === 'line' && kind !== 'fairway',
  );

const selected: ExpressionSpecification = ['boolean', ['feature-state', 'selected'], false];

/**
 * Widths are in screen pixels, deliberately, not ground meters.
 *
 * A fairway centerline is an annotation, not a physical object — it should stay
 * legible at every zoom rather than shrinking to nothing when you zoom out to
 * see the whole property. Areas differ: an OB boundary encloses real ground, so
 * its fill scales naturally with the map while its outline stays readable.
 *
 * ## Selection changes color and nothing else
 *
 * Every one of these used to be a `case` on selection: lines thickened, points
 * grew, outlines appeared. Which meant selecting a hole *redrew* it — the
 * geometry on screen stopped being the geometry you had drawn, and a fairway's
 * apparent width depended on whether you happened to have it selected. On a map
 * whose whole job is to be measured off, that is the one thing the drawing must
 * not do.
 *
 * So the shapes are fixed and selection is a color swap. It is legible enough:
 * accent blue against white over satellite imagery is not a subtle difference,
 * and it is the only thing on screen that is ever blue.
 */
const POINT_RADIUS = 7;

/**
 * The shots a hole offers but is not being drawn as.
 *
 * Half the width of a centreline, a third of its opacity, and **uncased**. The
 * casing is what makes a centreline hold up against bright sand and dark
 * canopy — legibility a line the designer is not currently working on does not
 * need, and paying for it here would put the alternatives in the same visual
 * register as the shot in play. They are supposed to lose that comparison.
 *
 * A longer gap than the centreline's, too, so the difference survives the two
 * being parallel and a few metres apart, which is exactly how three tees to one
 * basket end up drawn.
 */
const ALTERNATIVE_DASH = [2, 4] as const;
const ALTERNATIVE_SCALE = 0.5;
const ALTERNATIVE_OPACITY = 0.45;

/**
 * The plain circle is suppressed once a feature has a picture of its own.
 *
 * Permanently, not just once that picture is legible: a tee's glyph stands in
 * for its pad below the zoom the pad reads at, and takes over from it above.
 * A dot underneath either would be two markers answering the same question.
 */
const POINT_OPACITY: ExpressionSpecification = [
  'case',
  ['coalesce', ['get', 'hasMarker'], false],
  0,
  1,
];

/**
 * The zoom at which a tee pad outgrows the glyph standing in for it.
 *
 * Below it the marker is drawn and the real footprint is not; above it they
 * swap. Which is the honest arrangement, because below this zoom the pad is
 * *smaller than its own marker* — drawing both puts a three-pixel rectangle
 * inside a thirty-pixel one and asks the reader to believe the small one is the
 * measurement.
 *
 * Arithmetic rather than a number somebody picked. Web Mercator's ground
 * resolution is `2πR / (256 · 2^z)` metres per pixel at the equator, times
 * `cos(latitude)`, so the pad's length in pixels equals the marker's height
 * when:
 *
 *     2^z = markerPx · (2πR / 256) · cos(latitude) / padLength
 *
 * The latitude has to be fixed for a style built once, so it is the middle of
 * the band courses are actually in. Nearer the poles the swap happens a
 * fraction of a zoom late, which nobody can see.
 *
 * It is `minzoom`/`maxzoom` on the layers rather than a fade in opacity, and
 * that is forced rather than chosen: selection is a feature-state expression,
 * `zoom` may only be the direct input to a top-level `interpolate`, and the two
 * cannot be multiplied together in one property.
 */
const REFERENCE_LATITUDE = 45;
const PAD_LEGIBLE_ZOOM = Math.log2(
  (MARKER_SIZE_PX * metresPerPixel(0, REFERENCE_LATITUDE)) / PLACED_RECTANGLE_DEFAULTS.lengthM,
);

/**
 * The whole course scene, bottom to top.
 *
 * One list, and the order in it is the design. MapLibre draws in insertion
 * order and hit-tests in it too, so this is simultaneously what covers what and
 * what answers a click — and both of those are decisions about the map rather
 * than consequences of how the code is organised. It used to be three lists
 * concatenated: everything derived, then everything drawn, then the numbers.
 * That put an out-of-bounds area over the fairway line running through it,
 * which is exactly backwards — the line is the hole and the area is the ground
 * it crosses.
 *
 * So the order is stated once, here, as the sequence a course is read in:
 *
 *   1. the ground outside the property line, and the line itself
 *   2. the regulated areas, and anything else drawn on the land
 *   3. the approach corridor, then the corridor inside it
 *   4. the fairway line
 *   5. Circle 2, Circle 1, the bullseye — widest first
 *   6. mandatories, drop zones, tees, baskets
 *   7. the hole numbers, over everything they label
 *
 * Each step is one function below, and the only thing that decides where a
 * layer lands is which of them it is written in.
 */
export function courseLayers(style: ResolvedStyle): LayerSpecification[] {
  const drawnAreas = areaKinds().filter((kind) => kind !== 'boundary');
  return [
    ...outsideLayers(style),
    ...areaLayers(style, ['boundary']),
    ...areaLayers(style, drawnAreas),
    ...drawnLineLayers(style),
    ...corridorLayers(style),
    ...fairwayLineLayers(style),
    ...circleLayers(style),
    ...mandoLayers(style),
    ...padLayers(style, 'dropzone'),
    ...padLayers(style, 'tee'),
    ...pointLayers(style),
    ...holeLabelLayers(style),
    ...highlightLayers(),
  ];
}

/**
 * The ground outside a property line, under everything.
 *
 * It is a ground rather than a mark: the site is what is being read, and this
 * exists to say where the site stops.
 */
function outsideLayers(style: ResolvedStyle): LayerSpecification[] {
  const boundary = style.features.boundary;
  return [
    {
      id: 'derived-outside',
      type: 'fill',
      source: DERIVED_SOURCE,
      filter: ['==', ['get', 'derived'], 'outside'],
      paint: {
        'fill-color': boundary.fill,
        'fill-opacity': boundary.fillOutside ? boundary.fillOpacity : 0,
      },
    },
  ];
}

/**
 * Both fairway corridors: the approach, then the line's own.
 *
 * The approach is underneath because it is the wider claim — how much room the
 * approach has, where the first says how much room the line has.
 */
function corridorLayers(style: ResolvedStyle): LayerSpecification[] {
  const fairway = style.features.fairway;
  return [
    {
      id: 'derived-approach',
      type: 'fill',
      source: DERIVED_SOURCE,
      filter: ['==', ['get', 'derived'], 'approach'],
      paint: {
        'fill-color': fairway.secondFill,
        'fill-opacity': fairway.secondFillOpacity,
      },
    },
    /*
     * No outline. A corridor is a drawing aid, not a boundary anyone has
     * actually drawn, and a stroke around it read as a claim about where the
     * fairway stops that the app has no business making. The fill alone says
     * "the room this shot has" without pretending to a precision it doesn't
     * have — and at the target end, where the corridor rounds to the same
     * radius as Circle 1, a stroke would have cut a visible seam across a ring
     * the map is already drawing there.
     */
    {
      id: 'derived-corridor',
      type: 'fill',
      source: DERIVED_SOURCE,
      filter: ['==', ['get', 'derived'], 'corridor'],
      paint: {
        'fill-color': fairway.fill,
        // Zero when the designer has switched fairways off — see `derived.ts`.
        // The shape stays on the map so the ground a hole's shot runs over
        // still selects that hole; hiding the drawing must not take the target
        // away with it.
        'fill-opacity': [
          'case',
          ['coalesce', ['get', 'hidden'], false],
          0,
          fairway.fillOpacity,
        ],
      },
    },
  ];
}

/**
 * The fairway line: the shot in play, and the shots the hole also offers.
 *
 * **Selection is the centreline, and only the centreline.** It goes accent and
 * drops its casing; the corridors underneath never change colour at all.
 *
 * The corridor is the wrong surface for it. It is the largest thing on screen
 * by far, so recolouring it reads as the map changing rather than as a hole
 * being chosen — and it shades the ground the shot runs over, which is the
 * thing a designer selected the hole to look at. The line is a mark rather than
 * a field: it can carry the accent without hiding anything.
 *
 * Always dashed. A fairway is a drawing aid the app worked out, not a thing on
 * the ground, and it should say so whether or not anybody has bent it. It used
 * to go solid once shaped, which put the two most similar-looking marks on the
 * map — a routed fairway and a drawn path — one keystroke apart.
 *
 * Butt caps, not round: round caps swell each dash into a lozenge and close the
 * gaps at this width.
 */
function fairwayLineLayers(style: ResolvedStyle): LayerSpecification[] {
  const fairway = style.features.fairway;
  const isCentreline: ExpressionSpecification = ['==', ['get', 'derived'], 'centreline'];
  return [
    /*
     * The alternatives, under the shot in play.
     *
     * Not in the interactive list: at 1.25px these are a poor click target, and
     * a click landing on hole 7's spare tee line instead of the corridor it
     * runs down would be a worse answer than the one the corridor already
     * gives. They are here to be read, not hit.
     */
    {
      id: 'derived-alternative',
      type: 'line',
      source: DERIVED_SOURCE,
      filter: ['==', ['get', 'derived'], 'alternative'],
      layout: { 'line-join': 'round', 'line-cap': 'butt' },
      paint: {
        'line-color': fairway.stroke,
        'line-width': fairway.strokeWidth * ALTERNATIVE_SCALE,
        'line-opacity': ALTERNATIVE_OPACITY,
        'line-dasharray': [...ALTERNATIVE_DASH],
      },
    },
    {
      id: 'derived-centreline-casing',
      type: 'line',
      source: DERIVED_SOURCE,
      filter: isCentreline,
      layout: { 'line-join': 'round', 'line-cap': 'butt' },
      paint: {
        'line-color': fairway.casing,
        /*
         * Gone entirely while selected, rather than recoloured.
         *
         * The accent line is the selected state, and a casing under it is a
         * contrast floor for a colour that no longer needs one — it only
         * thickens the line, which is the one thing selection must not do on a
         * map that gets measured off.
         */
        'line-opacity': ['case', selected, 0, fairway.casingOn ? fairway.casingOpacity : 0],
        'line-width': fairway.strokeWidth * CASING_RATIO,
        ...dashPaint(casingDash(fairway.dash)),
      },
    },
    {
      id: 'derived-centreline',
      type: 'line',
      source: DERIVED_SOURCE,
      filter: isCentreline,
      layout: { 'line-join': 'round', 'line-cap': 'butt' },
      paint: {
        'line-color': selectable(fairway.stroke, 'stroke'),
        'line-opacity': fairway.strokeOpacity,
        'line-width': fairway.strokeWidth,
        ...dashPaint(DASH_PATTERNS[fairway.dash]),
      },
    },
  ];
}

/**
 * Putting circles, at their real size on the ground, widest first.
 *
 * Circle 2 under Circle 1 under the bullseye, so the tightest ring is never
 * buried by the loosest — which is the order they matter in as well.
 *
 * Two layers each rather than one with expressions inside it, for the reason
 * the feature layers are split the same way: `line-dasharray` takes no
 * data-driven expression, so rings that can each carry their own dash have to
 * be their own layers. It also means a designer restyling Circle 1 cannot
 * accidentally restyle the bullseye.
 */
function circleLayers(style: ResolvedStyle): LayerSpecification[] {
  const widestFirst = [...TARGET_CIRCLES].sort((a, b) => b.radiusM - a.radiusM);

  return widestFirst.flatMap((circle): LayerSpecification[] => {
    const ring = style.circles[circle.id];
    const filter: ExpressionSpecification = [
      'all',
      ['==', ['get', 'derived'], 'circle'],
      ['==', ['get', 'circle'], circle.id],
    ];

    /*
     * The fill stands down where a corridor is already shading the ground.
     *
     * `corridor` is set per basket in `derived.ts` — the course-wide fairway
     * switch and the hole's own, resolved there because the layer can only see
     * one answer for the whole map. See `circleStyleSchema`.
     */
    const opacity: number | ExpressionSpecification = !ring.fillOn
      ? 0
      : ring.hideOverCorridor
        ? ['case', ['coalesce', ['get', 'corridor'], false], 0, ring.fillOpacity]
        : ring.fillOpacity;

    return [
      {
        id: `${circleLayer(circle.id)}-fill`,
        type: 'fill',
        source: DERIVED_SOURCE,
        filter,
        paint: { 'fill-color': ring.fill, 'fill-opacity': opacity },
      },
      {
        id: circleLayer(circle.id),
        type: 'line',
        source: DERIVED_SOURCE,
        filter,
        layout: { 'line-join': 'round' },
        paint: {
          'line-color': ring.stroke,
          'line-width': ring.strokeWidth,
          /*
           * A ring the rules publish is drawn more strongly than one they do
           * not. The 3 m bullseye is league convention and appears in no PDGA
           * document; drawing it at the same weight as Circle 1 would be the
           * map making a claim the rules do not.
           */
          'line-opacity': circle.authority === 'rules' ? 0.75 : 0.45,
          ...dashPaint(DASH_PATTERNS[ring.dash]),
        },
      },
    ];
  });
}

/**
 * A mandatory: the shading, the wall, the arrow and the marker.
 *
 * All four together and above the fairway line, because a mandatory is a rule
 * about where the disc may go and the line is a suggestion about where it might
 * — a rule drawn underneath the suggestion reads as the weaker of the two.
 *
 * The wall is solid and full weight, unlike everything else the derived source
 * draws, for the same reason. And it sits under the glyph, so the marker saying
 * which side you must pass is on top of the plane saying which side you may not.
 */
function mandoLayers(style: ResolvedStyle): LayerSpecification[] {
  const mando = style.features.mando;
  const isMandoLine: ExpressionSpecification = ['==', ['get', 'derived'], 'mandoLine'];

  return [
    /*
     * Six nested half discs at a fraction of the asked-for opacity each,
     * because MapLibre fills have no radial gradient. They stack densest at the
     * flat edge and thin out towards the arc, which is the falloff a gradient
     * would give — and the whole point of the shape is that it fades, so a hard
     * edge at the far side would read as a second wall.
     */
    {
      id: 'derived-mando-shade',
      type: 'fill',
      source: DERIVED_SOURCE,
      filter: ['==', ['get', 'derived'], 'mandoShade'],
      paint: { 'fill-color': '#000000', 'fill-opacity': mando.shadeOpacity / 6 },
    },
    {
      id: 'derived-mando-line-casing',
      type: 'line',
      source: DERIVED_SOURCE,
      filter: isMandoLine,
      layout: { 'line-join': 'round', 'line-cap': 'butt' },
      paint: {
        'line-color': casingColor(mando.casing),
        'line-opacity': mando.casingOn ? mando.casingOpacity : 0,
        'line-width': mando.strokeWidth * CASING_RATIO,
        ...dashPaint(casingDash(mando.dash)),
      },
    },
    {
      id: 'derived-mando-line',
      type: 'line',
      source: DERIVED_SOURCE,
      filter: isMandoLine,
      layout: { 'line-join': 'round', 'line-cap': 'butt' },
      paint: {
        'line-color': selectable(mando.stroke, 'stroke'),
        'line-opacity': mando.strokeOpacity,
        'line-width': mando.strokeWidth,
        ...dashPaint(DASH_PATTERNS[mando.dash]),
      },
    },
    /*
     * The arrowhead, above the line and below the glyph. Turned to the wall
     * rather than to the direction of play, so it points the way the plane
     * runs — and map-aligned, so it keeps doing that when the camera spins.
     */
    ...markerLayers('derived-marker-mando-arrow', 'mandoArrow', {
      source: DERIVED_SOURCE,
      filter: ['all', ['==', ['get', 'derived'], 'mandoArrow'], mandoArrowShown(mando)],
      anchor: 'center',
      rotate: ['get', 'bearing'],
    }),
    /*
     * One layer per side, because which way the marker points *is* the ruling.
     *
     * Not one drawing mirrored: the pair keeps its M upright while the point
     * moves, which a flip would not. Both are turned to the direction of play,
     * so the point lands on the player's left or right rather than on the
     * screen's.
     */
    ...markerLayers('derived-marker-mando-left', 'mandoLeft', {
      source: DERIVED_SOURCE,
      filter: ['all', markerOfKind('mando'), ['==', ['get', 'side'], 'left']],
      anchor: 'center',
      rotate: ['get', 'bearing'],
    }),
    ...markerLayers('derived-marker-mando-right', 'mandoRight', {
      source: DERIVED_SOURCE,
      filter: ['all', markerOfKind('mando'), ['==', ['get', 'side'], 'right']],
      anchor: 'center',
      rotate: ['get', 'bearing'],
    }),
  ];
}

/**
 * A teeing area: its pad, and the glyph standing in for the pad.
 *
 * **The pad is the tee.** It carries the tee's own id, it responds to clicks,
 * and it takes selection styling, because the point underneath it is suppressed
 * once a pad exists. A dot and a rectangle both standing for one tee would be
 * the interface claiming two objects where the designer placed one.
 *
 * A pad is solid ground rather than an annotation, so it is drawn as one: an
 * opaque fill and nothing else. No coloured outline — the fill's own edge is the
 * pad's edge — and it stays fully opaque whether or not it is selected, so
 * selection reads from its colour rather than from a stroke appearing on top of
 * it. The casing stays: against sand or bleached grass a solid pad can still
 * lose its edge without the dark ring underneath it.
 *
 * Per kind rather than one pair of layers for both, so a drop zone can sit under
 * a tee where the two overlap — and so a drop zone can be coloured as itself
 * rather than as a tee it is not.
 */
function padLayers(style: ResolvedStyle, kind: 'tee' | 'dropzone'): LayerSpecification[] {
  const drawn = style.features[kind];
  const filter: ExpressionSpecification = [
    'all',
    ['==', ['get', 'derived'], 'footprint'],
    ['==', ['get', 'kind'], kind],
  ];

  return [
    {
      id: `${padLayer(kind)}-casing`,
      type: 'line',
      source: DERIVED_SOURCE,
      filter,
      minzoom: PAD_LEGIBLE_ZOOM,
      layout: { 'line-join': 'round' },
      paint: {
        'line-color': casingColor(drawn.casing),
        'line-opacity': drawn.casingOn ? drawn.casingOpacity : 0,
        'line-width': drawn.strokeWidth * 1.4,
      },
    },
    {
      id: padLayer(kind),
      type: 'fill',
      source: DERIVED_SOURCE,
      filter,
      minzoom: PAD_LEGIBLE_ZOOM,
      paint: {
        /*
         * The pad keeps its own colour when selected; the casing above carries
         * the state. See `addMarkerIcons` for the same rule on the glyphs.
         */
        'fill-color': drawn.stroke,
        'fill-opacity': drawn.strokeOpacity,
      },
    },
    /*
     * The glyph, anchored at the TOP of its drawing rather than its centre.
     *
     * The same fact `footprintOf` is built on: the stored point is the front
     * centre of the pad and the pad extends backwards from it. Anchored at the
     * top and turned to the pad's bearing, the glyph lies exactly where the
     * rectangle it stands in for does — centring it would hang half the marker
     * out in front of the tee line.
     */
    ...markerLayers(`derived-marker-${kind}`, kind, {
      source: DERIVED_SOURCE,
      filter: markerOfKind(kind),
      anchor: 'top',
      rotate: ['get', 'bearing'],
      maxzoom: PAD_LEGIBLE_ZOOM,
    }),
  ];
}

/**
 * A glyph marker, as the pair of layers selection needs.
 *
 * It has to be a pair. `icon-image` is a LAYOUT property, and MapLibre refuses
 * feature-state expressions in layout properties — the whole layer fails
 * validation and never installs, which presents as markers simply not drawing.
 * `icon-opacity` is paint, where feature-state is allowed, so the selected
 * glyph is a second layer faded in over the first.
 *
 * `sizedTo` is what makes one drawing serve a basket and a tee. A basket stands
 * on its point and the marker is anchored at the bottom of the art; everything
 * else marks the ground it sits on and is anchored at its centre.
 */
function markerLayers(
  id: string,
  name: MarkerName,
  options: {
    source: string;
    filter: ExpressionSpecification;
    anchor: 'top' | 'bottom' | 'center';
    /** Data-driven rotation, for glyphs that carry a direction. */
    rotate?: ExpressionSpecification;
    /** Hidden at and above this zoom, for a glyph standing in for a shape. */
    maxzoom?: number;
  },
): LayerSpecification[] {
  return ([false, true] as const).map((isSelected) => ({
    id: isSelected ? `${id}-selected` : id,
    type: 'symbol',
    source: options.source,
    filter: options.filter,
    ...(options.maxzoom === undefined ? {} : { maxzoom: options.maxzoom }),
    layout: {
      'icon-image': markerIcon(name, isSelected),
      'icon-anchor': options.anchor,
      ...(options.rotate
        ? {
            'icon-rotate': options.rotate,
            /*
             * The angle is a compass bearing, so it has to be measured against
             * the ground rather than the screen.
             *
             * Left alone, MapLibre aligns icon rotation to the viewport: a tee
             * facing 90° is drawn a quarter turn clockwise on screen no matter
             * which way the map is pointing. Selecting a hole turns the map to
             * face its shot, and every pad and mandatory on it then pointed
             * somewhere the ground did not. `map` alignment makes the marker
             * turn with the terrain, which is what the basket does by having no
             * rotation to get wrong.
             */
            'icon-rotation-alignment': 'map' as const,
          }
        : {}),
      // Markers on adjacent pin positions must all stay visible; MapLibre would
      // otherwise drop whichever it decided was less important.
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
    paint: { 'icon-opacity': ['case', selected, isSelected ? 1 : 0, isSelected ? 0 : 1] },
  }));
}

/** A point in the features source, of one kind. */
const pointOfKind = (kind: string): ExpressionSpecification => [
  'all',
  ['==', ['geometry-type'], 'Point'],
  ['==', ['get', 'kind'], kind],
];

/** A derived glyph marker, for one kind. */
/**
 * The arrowhead is filtered out rather than faded.
 *
 * `icon-opacity` would leave it in `queryRenderedFeatures`, and an invisible
 * arrow answering a click on the ground beside a mandatory is the kind of
 * target nobody can find and nobody meant.
 */
const mandoArrowShown = (mando: { arrow: boolean }): ExpressionSpecification =>
  mando.arrow ? ['literal', true] : ['literal', false];

const markerOfKind = (kind: string): ExpressionSpecification => [
  'all',
  ['==', ['get', 'derived'], 'marker'],
  ['==', ['get', 'kind'], kind],
];

/** Everything of one kind, in one geometry, in the document's own source. */
const ofKind = (
  kind: FeatureKind,
  geometry: 'Polygon' | 'LineString',
): ExpressionSpecification => [
  'all',
  ['==', ['geometry-type'], geometry],
  ['==', ['get', 'kind'], kind],
];

/**
 * The drawn areas, one set of layers per kind.
 *
 * One set per kind rather than a handful of shared layers with `match`
 * expressions inside them. That is not a stylistic preference: `line-dasharray`
 * is the one paint property MapLibre accepts no data-driven expression for, so
 * "dotted for a property line, solid for out of bounds" cannot be written
 * inside one layer at all. A stylesheet that lets any kind take any dash
 * therefore needs a layer per kind, and once you have that the colours and
 * widths stop needing expressions too.
 *
 * The property boundary used to be the only kind split out, for exactly this
 * reason, with a comment explaining the constraint. This is that comment
 * applied consistently.
 *
 * Order within a kind is fill, casing, stroke — so an outline sits on top of
 * its own fill. The caller decides the order *between* kinds, because that is
 * the map's reading order rather than a fact about any one of them.
 */
function areaLayers(style: ResolvedStyle, kinds: readonly FeatureKind[]): LayerSpecification[] {
  const layers: LayerSpecification[] = [];

  for (const kind of kinds) {
    if (KIND_DEFINITIONS[kind].geometry !== 'polygon') continue;
    const drawn = style.features[kind];
    const filter = ofKind(kind, 'Polygon');
    const dash = DASH_PATTERNS[drawn.dash];
    const under = casingDash(drawn.dash);

    layers.push(
      {
        id: areaFillLayer(kind),
        type: 'fill',
        source: FEATURES_SOURCE,
        filter,
        paint: {
          'fill-color': selectable(drawn.fill, 'fill'),
          // Nothing inside when the fill is the outside — `derived-outside`
          // is drawing it, and both at once would shade the whole world.
          'fill-opacity': drawn.fillOutside ? 0 : drawn.fillOpacity,
        },
      },
      {
        id: `features-${kind}-casing`,
        type: 'line',
        source: FEATURES_SOURCE,
        filter,
        layout: { 'line-join': 'round', 'line-cap': dash ? 'butt' : 'round' },
        paint: {
          'line-color': casingColor(drawn.casing),
          'line-opacity': drawn.casingOn ? drawn.casingOpacity : 0,
          'line-width': drawn.strokeWidth * CASING_RATIO,
          ...(under ? { 'line-dasharray': [...under] } : {}),
        },
      },
      {
        id: areaStrokeLayer(kind),
        type: 'line',
        source: FEATURES_SOURCE,
        filter,
        layout: { 'line-join': 'round', 'line-cap': dash ? 'butt' : 'round' },
        paint: {
          'line-color': selectable(drawn.stroke, 'stroke'),
          'line-opacity': drawn.strokeOpacity,
          'line-width': drawn.strokeWidth,
          ...(dash ? { 'line-dasharray': [...dash] } : {}),
        },
      },
    );

    /*
     * The lettering, as upright labels rather than a tiled fill.
     *
     * `fill-pattern` was the obvious tool and is the wrong one: a fill pattern
     * is rendered in tile space, so it turns with the map — and selecting a
     * hole spins the camera to face the shot, which left every OB area written
     * sideways. A symbol layer is viewport-aligned, so the letters stay upright
     * however the camera moves. The points come from `letteringPoints`.
     *
     * Not in `INTERACTIVE_LAYERS`: they sit on the fill that is, carry the same
     * feature, and would only mean answering the same click twice.
     */
    if (hasPattern(kind)) {
      layers.push({
        id: letteringLayer(kind),
        type: 'symbol',
        source: DERIVED_SOURCE,
        filter: ['all', ['==', ['get', 'derived'], 'lettering'], ['==', ['get', 'kind'], kind]],
        layout: {
          'text-field': ['get', 'text'],
          'text-size': style.lettering.size,
          'text-font': ['Noto Sans Bold'],
          /*
           * The angle turns the letters themselves.
           *
           * It used to turn the *grid*: the letters stayed upright and marched
           * diagonally across the area. That is a different effect from the one
           * the control is named after, and it is not the one anybody reached
           * for it wanting. Rotation alignment is left at its default, which is
           * the viewport — so the letters keep this angle relative to the
           * screen and do not swing round when the camera turns to face a shot.
           */
          'text-rotate': style.lettering.angle,
          // Never dropped for collision: a regular grid with gaps in it reads
          // as a mistake rather than as a pattern.
          'text-allow-overlap': true,
          'text-ignore-placement': true,
        },
        // The letters take the line's colour, so an area's outline and its
        // lettering can never disagree about which area it is.
        paint: { 'text-color': drawn.stroke, 'text-opacity': drawn.strokeOpacity },
      });
    }
  }

  return layers;
}

/**
 * The drawn lines: paths, and anything else traced as one.
 *
 * Fairways are excluded: they are drawn by the derived source instead, whether
 * or not the document stores one. Drawing a shaped fairway here as well would
 * put two lines on the same coordinates, and the designer would see a doubled
 * stroke on exactly the holes they had bothered to route.
 */
function drawnLineLayers(style: ResolvedStyle): LayerSpecification[] {
  const layers: LayerSpecification[] = [];

  for (const kind of FEATURE_KINDS) {
    if (KIND_DEFINITIONS[kind].geometry !== 'line' || kind === 'fairway') continue;
    const drawn = style.features[kind];
    const filter = ofKind(kind, 'LineString');
    const dash = DASH_PATTERNS[drawn.dash];
    const under = casingDash(drawn.dash);

    layers.push(
      {
        id: `features-${kind}-casing`,
        type: 'line',
        source: FEATURES_SOURCE,
        filter,
        layout: { 'line-join': 'round', 'line-cap': dash ? 'butt' : 'round' },
        paint: {
          'line-color': casingColor(drawn.casing),
          'line-opacity': drawn.casingOn ? drawn.casingOpacity : 0,
          'line-width': drawn.strokeWidth * CASING_RATIO,
          ...(under ? { 'line-dasharray': [...under] } : {}),
        },
      },
      {
        id: lineStrokeLayer(kind),
        type: 'line',
        source: FEATURES_SOURCE,
        filter,
        layout: { 'line-join': 'round', 'line-cap': dash ? 'butt' : 'round' },
        paint: {
          'line-color': selectable(drawn.stroke, 'stroke'),
          'line-opacity': drawn.strokeOpacity,
          'line-width': drawn.strokeWidth,
          ...(dash ? { 'line-dasharray': [...dash] } : {}),
        },
      },
    );
  }

  return layers;
}

/**
 * The points: everything you click, over everything you look at.
 *
 * The plain circle is for kinds with no drawing of their own. A basket, a tee,
 * a drop zone and a mandatory get glyphs — see `markerLayers` — and a circle
 * underneath one would be a second marker for one object.
 *
 * Tees with a pad are a subtler case, handled by the derived source: the pad
 * *is* the tee, but a pad is two metres of real ground, which is a fraction of
 * a pixel at the zoom you use to see a whole course.
 */
function pointLayers(style: ResolvedStyle): LayerSpecification[] {
  const layers: LayerSpecification[] = [];

  layers.push({
    id: 'features-point',
    type: 'circle',
    source: FEATURES_SOURCE,
    /*
     * Targets are excluded outright — a basket always has a glyph. Everything
     * else stands down only once it *has* one, which is the `hasMarker`
     * property `POINT_OPACITY` reads: a mandatory nobody has ruled yet gets no
     * glyph, and it still has to be on the map to be clicked and ruled.
     */
    filter: ['all', ['==', ['geometry-type'], 'Point'], ['!=', ['get', 'kind'], 'target']],
    paint: {
      'circle-color': selectable(style.features.notedPoint.stroke, 'stroke'),
      'circle-radius': POINT_RADIUS,
      'circle-opacity': POINT_OPACITY,
      // The casing, as a stroke rather than a second layer.
      'circle-stroke-color': casingColor(style.features.notedPoint.casing),
      'circle-stroke-width': 2,
      'circle-stroke-opacity': POINT_OPACITY,
    },
  });

  layers.push(
    ...markerLayers('features-target', 'target', {
      source: FEATURES_SOURCE,
      filter: pointOfKind('target'),
      // The pole's base sits on the coordinate, because that is where the
      // basket actually stands.
      anchor: 'bottom',
    }),
  );

  return layers;
}

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
function holeLabelLayers(style: ResolvedStyle): LayerSpecification[] {
  const isLabel: ExpressionSpecification = ['==', ['get', 'derived'], 'holeLabel'];
  const { text, disc, size, weight, casing, casingOn } = style.holeNumber;
  /*
   * The halo stands in for the disc, and only for the disc.
   *
   * With a disc behind it the numeral already has a shape to be read against,
   * and a halo as well would be two contrast floors thickening the digits for
   * no gain. With the disc off the number is bare over satellite imagery, which
   * is the case the halo exists for — so it is drawn exactly when the disc is
   * not. Scaled off the text size, so a bigger number keeps the same edge.
   */
  const halo = disc === null && casingOn ? Math.max(1, size * 0.14) : 0;
  // The disc grows with the numeral, so a bigger number does not outgrow the
  // shape that exists to make it readable.
  const radius = size * 0.92;
  return [
    {
      id: 'hole-label-disc',
      type: 'circle',
      source: DERIVED_SOURCE,
      filter: isLabel,
      paint: {
        'circle-color': ['case', selected, featureColors.selected.casing, disc ?? '#000000'],
        'circle-radius': radius,
        'circle-stroke-color': text,
        'circle-stroke-width': 1,
        /*
         * Off, not absent. The disc is still on the map at zero opacity because
         * it is the hole's click target — `hole-label-disc` is the first entry
         * in `INTERACTIVE_LAYERS`, and the most direct way to select a hole is
         * to click its number. Removing the shape would take that with it.
         */
        'circle-opacity': disc === null ? 0 : 1,
        'circle-stroke-opacity': disc === null ? 0 : 1,
      },
    },
    {
      id: 'hole-label',
      type: 'symbol',
      source: DERIVED_SOURCE,
      filter: isLabel,
      layout: {
        'text-field': ['get', 'number'],
        'text-size': size,
        /*
         * The font server's own names. It publishes a regular and a bold of
         * each family, and `text-font` naming a face it cannot serve renders as
         * no text at all rather than as a fallback — which is why the weights
         * on offer are its list rather than a design decision.
         */
        'text-font': [weight === 'bold' ? 'Noto Sans Bold' : 'Noto Sans Regular'],
        // Never dropped for collision: a course where 7 and 8 sit close together
        // is exactly when you need to tell them apart.
        'text-allow-overlap': true,
        'text-ignore-placement': true,
      },
      paint: {
        'text-color': text,
        'text-halo-color': casing,
        'text-halo-width': halo,
      },
    },
  ];
}

/**
 * The brief glow that says "these are the ones you just picked".
 *
 * Style is the one focus where selection is not a state you stay in. Clicking
 * an out-of-bounds area there means "show me how out-of-bounds areas are
 * drawn", and the answer is a panel — the map's job is only to confirm which
 * shapes the panel is about, once, and then get out of the way.
 *
 * So it is a **halo that fades**, not a recolour. Recolouring was what selection
 * did everywhere else and it is wrong here twice over: the fill is the thing
 * being edited, so swapping it hides the very decision the panel is making,
 * and a state that persists would leave the map lying about the course's
 * colours for as long as the designer stayed in the focus. A glow sits outside
 * the geometry, changes nothing about it, and is gone in a second.
 *
 * MapLibre's default paint transition carries the fade for free: the state is
 * set, the opacity animates up, the state is cleared, and it animates back.
 */
const flashed: ExpressionSpecification = ['boolean', ['feature-state', 'flash'], false];

const FLASH_OPACITY: ExpressionSpecification = ['case', flashed, 0.9, 0];

function highlightLayers(): LayerSpecification[] {
  const glow = (id: string, source: string, filter: ExpressionSpecification) => [
    {
      id,
      type: 'line' as const,
      source,
      filter: ['all', ['!=', ['geometry-type'], 'Point'], filter] as ExpressionSpecification,
      layout: { 'line-join': 'round' as const, 'line-cap': 'round' as const },
      paint: {
        'line-color': featureColors.selected.stroke,
        'line-width': 9,
        'line-blur': 4,
        'line-opacity': FLASH_OPACITY,
      },
    },
    {
      id: `${id}-point`,
      type: 'circle' as const,
      source,
      filter: ['all', ['==', ['geometry-type'], 'Point'], filter] as ExpressionSpecification,
      paint: {
        // Hollow: the glyph underneath is what is being confirmed, and filling
        // over it would hide the drawing the panel is about to restyle.
        'circle-color': 'rgba(0, 0, 0, 0)',
        'circle-radius': 15,
        'circle-blur': 0.4,
        'circle-stroke-color': featureColors.selected.stroke,
        'circle-stroke-width': 4,
        'circle-stroke-opacity': FLASH_OPACITY,
      },
    },
  ];

  return [
    ...glow('style-flash', FEATURES_SOURCE, ['literal', true]),
    /*
     * Derived shapes take the glow too, because most of what you click in Style
     * is derived: a corridor is its fairway, a pad is its tee, a wall is its
     * mandatory. They carry the feature's own id, so the same flash reaches
     * them with no extra bookkeeping.
     *
     * Three are excluded. The world-sized rectangle outside a property line
     * would put a glowing edge round the horizon; a mandatory's shading is six
     * stacked bands and would glow six times over; and the lettering is a
     * hundred points that would each grow a ring.
     */
    ...glow('style-flash-derived', DERIVED_SOURCE, [
      'all',
      ['!=', ['get', 'derived'], 'outside'],
      ['!=', ['get', 'derived'], 'mandoShade'],
      ['!=', ['get', 'derived'], 'lettering'],
    ]),
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
 * The derived glyphs and the footprint are in here despite being derived
 * geometry, because a tee pad *is* its tee — they carry the tee's own id, and
 * the point beneath them is not drawn. The mandatory glyphs are in for the same
 * reason and are not optional: a mandatory with a ruling has no circle left to
 * click.
 *
 * They sit last so that anything standing on a pad still wins the click. A pad
 * and its glyph never overlap in visibility — the glyph's `maxzoom` is the zoom
 * the pad becomes legible at — so their order relative to each other does not
 * matter.
 *
 * `derived-mando-line` is not here: a mandatory line is a consequence of the
 * mandatory rather than a thing in its own right, so clicking it should reach
 * whatever is under it.
 *
 * `derived-centreline` **is** here, and has to be. Handles only appear on the
 * line once the line itself is selected — editing is one level deeper than
 * selecting — so if the line could not be clicked, an unrouted fairway could
 * never be bent, which is the act that creates it. It was excluded on the
 * grounds that a fairway with no stored feature has no id to select; that is no
 * longer true, because the centreline carries `fairwayId ?? pair` and
 * `editableShape` accepts the pair key.
 */
export const INTERACTIVE_LAYERS: readonly string[] = [
  'hole-label-disc',
  'features-target',
  'features-point',
  ...lineKinds().map(lineStrokeLayer),
  /*
   * Every area's fill answers a click, except a property boundary's.
   *
   * A boundary encloses the whole site, so its fill is the largest target on
   * the map by a wide margin — clicking open ground in the middle of the course
   * would select the parcel line every time, and the tee you were aiming at
   * never. It is also the one kind whose fill is not *its* drawing: the shading
   * belongs to the ground outside it. So the line is the boundary, and the line
   * is what selects it.
   */
  ...areaKinds()
    .filter((kind) => kind !== 'boundary')
    .map(areaFillLayer),
  /*
   * A boundary has no fill, so its outline is the only thing to click, and the
   * casing is used rather than the stroke because it is the wider of the two —
   * a 1.25 px dotted line is not a target anybody can hit. It carries the same
   * feature id, so which one answers makes no difference to the caller.
   *
   * Generated for every area kind rather than for the boundary alone: any kind
   * can now be styled down to no fill, and the one that is would be the one you
   * could not click.
   */
  ...areaKinds().map((kind) => `features-${kind}-casing`),
  /*
   * Above the corridor, below everything solid.
   *
   * The line is the narrower target inside the band, so it wins over it; a tee
   * or a basket standing on the line still wins over both.
   */
  'derived-centreline',
  'derived-marker-mando-left',
  'derived-marker-mando-right',
  'derived-marker-tee',
  'derived-marker-dropzone',
  padLayer('tee'),
  padLayer('dropzone'),
  /*
   * The corridor is the biggest thing a hole owns, and until now the only part
   * of one you could not click. Selecting hole 7 meant hitting its centreline,
   * its pad or its number — three small targets — while the wide translucent
   * band that obviously *is* hole 7 did nothing.
   *
   * It sits last because it is installed first and therefore renders below
   * everything else, which is also the priority we want: anything standing on
   * a corridor wins the click.
   */
  'derived-corridor',
];

/**
 * Layers that stand for something too large to drag by.
 *
 * The two drawn-area layers, plus the two derived fairway layers — which are
 * not draggable for a second reason as well: they are derived, so there is
 * nothing there to move. Dragging the corridor would have to mean dragging the
 * hole, and the line is reshaped by its handles, one vertex at a time.
 */
const AREA_LAYERS: readonly string[] = [
  ...areaKinds().map(areaFillLayer),
  ...areaKinds().map((kind) => `features-${kind}-casing`),
  'derived-corridor',
  'derived-centreline',
];

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
 * The pads stay: a tee pad is drawn as an area but it *is* its tee, a point a
 * few metres across, and dragging the pad is how you move the tee.
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
 *
 * An area asked to be smooth is smoothed **here**, on the way to the renderer,
 * and nowhere else. The document keeps the vertices somebody placed, the
 * handles stay on them, and the panels go on measuring the shape that was
 * drawn — smoothing is a way of drawing a polygon, not a different polygon.
 */
export function toGeoJSON(
  features: readonly Feature[],
  withMarker: ReadonlySet<string> = new Set(),
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
        // Suppresses the plain circle: a pad or a glyph is standing in for it.
        hasMarker: withMarker.has(f.id),
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
      const ring = isSmoothed(f) ? smoothRing(f.geometry.coordinates) : f.geometry.coordinates;
      return { type: 'Polygon', coordinates: [[...ring, ring[0]!]] };
    }
  }
}
