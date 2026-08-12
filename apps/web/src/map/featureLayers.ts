import type { LayerSpecification, ExpressionSpecification } from 'maplibre-gl';
import { feature as featureColors } from '@hyzerlines/design';
import {
  EARTH_RADIUS,
  FEATURE_KINDS,
  KIND_DEFINITIONS,
  PLACED_RECTANGLE_DEFAULTS,
  TARGET_CIRCLES,
  type Feature,
  type FeatureKind,
  type TargetCircleId,
} from '@hyzerlines/core';

import { MARKER_SIZE_PX, markerIcon, type MarkerName } from './icons';
import { CASING_RATIO, DASH_PATTERNS, casingDash, type ResolvedStyle } from './mapStyle';

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
export const COURSE_BOTTOM_LAYER = 'derived-circle';

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
const M_PER_PIXEL_AT_ZOOM_0 = (2 * Math.PI * EARTH_RADIUS) / 256;
const PAD_LEGIBLE_ZOOM = Math.log2(
  (MARKER_SIZE_PX * M_PER_PIXEL_AT_ZOOM_0 * Math.cos((REFERENCE_LATITUDE * Math.PI) / 180)) /
    PLACED_RECTANGLE_DEFAULTS.lengthM,
);

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
export function derivedLayers(style: ResolvedStyle): LayerSpecification[] {
  /*
   * Derived geometry belongs to a kind even though the document does not store
   * it. A corridor and a centreline are two drawings of one fairway, a pad is
   * a tee, and a mandatory line is a mandatory — so each takes that kind's
   * style rather than one of its own. Restyling `fairway` restyles the shot.
   */
  const fairway = style.features.fairway;
  const mando = style.features.mando;
  const tee = style.features.tee;
  const fairwayDash = DASH_PATTERNS[fairway.dash];
  const mandoDash = DASH_PATTERNS[mando.dash];

  const isCorridor: ExpressionSpecification = ['==', ['get', 'derived'], 'corridor'];
  const isFootprint: ExpressionSpecification = ['==', ['get', 'derived'], 'footprint'];
  const isMandoLine: ExpressionSpecification = ['==', ['get', 'derived'], 'mandoLine'];
  const isCentreline: ExpressionSpecification = ['==', ['get', 'derived'], 'centreline'];

  return [
    /*
     * The alternatives, first and therefore underneath everything.
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
        'line-color': selectable(fairway.stroke, 'stroke'),
        'line-width': fairway.strokeWidth * ALTERNATIVE_SCALE,
        'line-opacity': ALTERNATIVE_OPACITY,
        'line-dasharray': [...ALTERNATIVE_DASH],
      },
    },
    /*
     * Putting circles, at their real size on the ground, one layer per ring.
     *
     * One layer each rather than one layer with expressions inside it, for the
     * reason the feature layers are split the same way: `line-dasharray` takes
     * no data-driven expression, so three rings that can each carry their own
     * dash have to be three layers. It also means a designer restyling Circle 1
     * cannot accidentally restyle the bullseye.
     *
     * Outline only — three filled rings stacked around every basket would sit
     * on the imagery a designer is reading the terrain from.
     */
    ...TARGET_CIRCLES.map((circle): LayerSpecification => {
      const ring = style.circles[circle.id];
      return {
        id: circleLayer(circle.id),
        type: 'line',
        source: DERIVED_SOURCE,
        filter: [
          'all',
          ['==', ['get', 'derived'], 'circle'],
          ['==', ['get', 'circle'], circle.id],
        ],
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
      };
    }),
    /*
     * No outline. A corridor is a drawing aid, not a boundary anyone has
     * actually drawn, and a stroke around it read as a claim about where the
     * fairway stops that the app has no business making. The fill alone says
     * "the room this shot has" without pretending to a precision it doesn't
     * have — and at the target end, where the corridor now rounds to the
     * same radius as Circle 1, a stroke would have cut a visible seam across
     * a ring the map is already drawing there.
     */
    {
      id: 'derived-corridor',
      type: 'fill',
      source: DERIVED_SOURCE,
      filter: isCorridor,
      paint: {
        'fill-color': selectable(fairway.fill, 'fill'),
        // Fainter than a drawn area of the same kind: it is the room the shot
        // has, not a thing in its own right.
        //
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
        'line-color': casingColor(fairway.casing),
        'line-opacity': fairway.casingOn ? fairway.casingOpacity : 0,
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
        ...dashPaint(fairwayDash),
      },
    },
    /*
     * The mandatory line: the plane the disc may not cross.
     *
     * Solid and full weight, unlike everything else the derived source draws.
     * A corridor is a drawing aid and says so with a dashed hairline; this is a
     * rule about where the disc may go, and a rule that reads as a suggestion
     * is worse than no mark at all.
     *
     * Under the glyph, so the marker that says which side you must pass sits on
     * top of the wall that says which side you may not.
     */
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
        ...dashPaint(mandoDash),
      },
    },
    /*
     * A tee pad is solid ground, not an annotation, so it is drawn as one:
     * an opaque fill and nothing else. No coloured outline — the fill's own
     * edge already is the pad's edge — and the fill stays fully opaque
     * whether or not it is selected, so selection reads entirely from its
     * colour (white to accent) rather than from a stroke appearing on top of
     * it. The casing stays: against sand or bleached grass a solid pad can
     * still lose its edge without the dark ring underneath it.
     */
    {
      id: 'derived-footprint-casing',
      type: 'line',
      source: DERIVED_SOURCE,
      filter: isFootprint,
      minzoom: PAD_LEGIBLE_ZOOM,
      layout: { 'line-join': 'round' },
      paint: {
        'line-color': casingColor(tee.casing),
        'line-opacity': tee.casingOn ? tee.casingOpacity : 0,
        'line-width': tee.strokeWidth * 1.4,
      },
    },
    {
      id: 'derived-footprint',
      type: 'fill',
      source: DERIVED_SOURCE,
      filter: isFootprint,
      minzoom: PAD_LEGIBLE_ZOOM,
      paint: {
        'fill-color': selectable(tee.stroke, 'fill'),
        'fill-opacity': tee.strokeOpacity,
      },
    },

    /*
     * The glyphs.
     *
     * A tee and a drop zone are anchored at the TOP of their drawing, not its
     * centre, and that is the same fact `footprintOf` is built on: the stored
     * point is the front centre of the pad and the pad extends backwards from
     * it. Anchored at the top and turned to the pad's bearing, the glyph lies
     * exactly where the rectangle it stands in for does — centring it would
     * hang half the marker out in front of the tee line.
     *
     * A mandatory is anchored at its centre, because the object really is in
     * the middle of the marker, and it is not hidden by zoom: unlike a pad
     * there is no larger drawing coming to replace it.
     */
    ...markerLayers('derived-marker-tee', 'tee', {
      source: DERIVED_SOURCE,
      filter: markerOfKind('tee'),
      anchor: 'top',
      rotate: ['get', 'bearing'],
      maxzoom: PAD_LEGIBLE_ZOOM,
    }),
    ...markerLayers('derived-marker-dropzone', 'dropzone', {
      source: DERIVED_SOURCE,
      filter: markerOfKind('dropzone'),
      anchor: 'top',
      rotate: ['get', 'bearing'],
      maxzoom: PAD_LEGIBLE_ZOOM,
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
const markerOfKind = (kind: string): ExpressionSpecification => [
  'all',
  ['==', ['get', 'derived'], 'marker'],
  ['==', ['get', 'kind'], kind],
];

/**
 * The feature layers, generated per kind.
 *
 * One set of layers for every kind that can be an area, and one for every kind
 * that can be a line, rather than a handful of shared layers with `match`
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
 * its own fill. Order between kinds follows `FEATURE_KINDS`, which is stable.
 */
export function featureLayers(style: ResolvedStyle): LayerSpecification[] {
  const layers: LayerSpecification[] = [];

  const ofKind = (
    kind: FeatureKind,
    geometry: 'Polygon' | 'LineString',
  ): ExpressionSpecification => [
    'all',
    ['==', ['geometry-type'], geometry],
    ['==', ['get', 'kind'], kind],
  ];

  // --- Areas. Fill first so outlines sit on top of their own fill.
  for (const kind of FEATURE_KINDS) {
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
          'fill-opacity': drawn.fillOpacity,
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
  }

  /*
   * --- Lines.
   *
   * Fairways are excluded: they are drawn by the derived source instead,
   * whether or not the document stores one. Drawing a shaped fairway here as
   * well would put two lines on the same coordinates, and the designer would
   * see a doubled stroke on exactly the holes they had bothered to route.
   */
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

  /*
   * --- Points last: they are the things you click, and must win hit-testing.
   *
   * The plain circle is for kinds with no drawing of their own. A basket, a
   * tee, a drop zone and a mandatory get glyphs — see `markerLayers` — and a
   * circle underneath one would be a second marker for one object.
   *
   * Tees with a pad are a subtler case, handled by the derived source: the pad
   * *is* the tee, but a pad is two metres of real ground, which is a fraction
   * of a pixel at the zoom you use to see a whole course.
   */
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
export function holeLabelLayers(style: ResolvedStyle): LayerSpecification[] {
  const isLabel: ExpressionSpecification = ['==', ['get', 'derived'], 'holeLabel'];
  const { text, disc, size } = style.holeNumber;
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
        // Never dropped for collision: a course where 7 and 8 sit close together
        // is exactly when you need to tell them apart.
        'text-allow-overlap': true,
        'text-ignore-placement': true,
      },
      paint: { 'text-color': text },
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
 * `derived-centreline` and `derived-mando-line` are not here. A fairway with no
 * stored feature has no id to select, and a mandatory line is a consequence of
 * the mandatory rather than a thing in its own right — clicking either should
 * reach whatever is under it.
 */
export const INTERACTIVE_LAYERS: readonly string[] = [
  'hole-label-disc',
  'features-target',
  'features-point',
  ...lineKinds().map(lineStrokeLayer),
  ...areaKinds().map(areaFillLayer),
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
  'derived-marker-mando-left',
  'derived-marker-mando-right',
  'derived-marker-tee',
  'derived-marker-dropzone',
  'derived-footprint',
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
 * The two drawn-area layers, plus the fairway corridor — which is not draggable
 * for a second reason as well: it is derived, so there is nothing there to
 * move. Dragging it would have to mean dragging the hole.
 */
const AREA_LAYERS: readonly string[] = [
  ...areaKinds().map(areaFillLayer),
  ...areaKinds().map((kind) => `features-${kind}-casing`),
  'derived-corridor',
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
      const ring = f.geometry.coordinates;
      return { type: 'Polygon', coordinates: [[...ring, ring[0]!]] };
    }
  }
}
