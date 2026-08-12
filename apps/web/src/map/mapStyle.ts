import { feature as featureColors } from '@hyzerlines/design';
import {
  FEATURE_KINDS,
  KIND_DEFINITIONS,
  TARGET_CIRCLES,
  circleStyleOf,
  featureStyleOf,
  glyphById,
  type CircleStyle,
  type Dash,
  type FeatureKind,
  type MapStyle,
  type TargetCircleId,
} from '@hyzerlines/core';

import { LARGE_ART } from '../chrome/iconArt';

/**
 * The defaults a stylesheet overrides, and the answer after it has.
 *
 * `@hyzerlines/core` holds what the designer *said* and nothing else — see
 * style.ts for why. This is the other half: what the app draws when they have
 * said nothing, and the merge of the two that the map actually reads.
 *
 * It lives in the web app because the defaults are the design tokens, and the
 * tokens are also the interface's colours. Core knowing about hue would make
 * the document model depend on the look of the thing displaying it.
 *
 * ## Widths are in screen pixels, deliberately
 *
 * A fairway centreline is an annotation, not a physical object — it should stay
 * legible at every zoom rather than shrinking to nothing when you zoom out to
 * see the whole property. Areas differ: an OB boundary encloses real ground, so
 * its fill scales with the map while its outline stays readable.
 */

/** Everything the map needs to draw one kind, with nothing left unanswered. */
export interface ResolvedFeatureStyle {
  stroke: string;
  strokeOpacity: number;
  strokeWidth: number;
  dash: Dash;
  casing: string;
  casingOpacity: number;
  casingOn: boolean;
  fill: string;
  fillOpacity: number;
  /** A built-in name or an uploaded glyph's id. Empty for kinds with no point. */
  glyph: string;
  glyphSize: number;
  secondCorridor: boolean;
  secondFill: string;
  secondFillOpacity: number;
  arrow: boolean;
  arrowSize: number;
  lineGap: number;
  shade: boolean;
  shadeOpacity: number;
  fillOutside: boolean;
}

export interface ResolvedCircleStyle {
  stroke: string;
  strokeWidth: number;
  dash: Dash;
}

/**
 * How wide the casing is, as a multiple of the stroke it sits under.
 *
 * A ratio rather than a width of its own, so a designer who thickens a line
 * gets a casing that still reads as one. It also has to be constant for dashed
 * lines to work: `line-dasharray` is measured in line widths, so a casing twice
 * as wide needs half the dash numbers to break in the same places. Get that
 * wrong and the casing fills the gaps, which is how a dashed line ends up
 * looking solid.
 */
export const CASING_RATIO = 2.2;

/**
 * What each dash means, in line widths.
 *
 * Named rather than numbered in the document, because a designer picking
 * "dotted" is saying *this is a note about the land* — and the lengths that
 * express it are a rendering decision that should stay free to change.
 */
export const DASH_PATTERNS: Record<Dash, readonly number[] | null> = {
  // Null, not [1, 0]: MapLibre wants the property absent for a solid line, and
  // a zero-length gap renders as a row of degenerate segments.
  solid: null,
  dashed: [3, 1.5],
  dotted: [1, 2],
  // Four numbers, because a pattern is dash-gap-dash-gap and this one alternates
  // two different dashes. The survey convention for a boundary that is inferred
  // rather than surveyed, and the reason the list is names and not numbers.
  dotDash: [4, 1.5, 1, 1.5],
  longDash: [6, 2],
};

/** The casing's dash for a stroke's dash, breaking in the same places. */
export function casingDash(dash: Dash): number[] | null {
  const pattern = DASH_PATTERNS[dash];
  return pattern ? pattern.map((n) => n / CASING_RATIO) : null;
}

/**
 * The glyph each kind is marked with when nobody has said otherwise.
 *
 * Only the kinds with a drawing. A point kind absent from here gets the plain
 * circle, which is the honest marker for something nobody has drawn an icon
 * for yet.
 */
const DEFAULT_GLYPHS: Partial<Record<FeatureKind, string>> = {
  target: 'basketFill',
  tee: 'teePad',
  dropzone: 'dropzone',
  mando: 'mandoLeft',
};

/**
 * Glyphs a designer can pick from, per kind.
 *
 * A few each rather than the whole art table: a basket may be drawn solid or
 * outlined, a tee as a bare pad or a lettered one, and offering the OB
 * lettering as an option for a tee would be offering a mistake. Uploads are
 * added to whichever list the kind has — see `glyphOptionsFor`.
 */
const BUILT_IN_GLYPHS: Partial<Record<FeatureKind, readonly string[]>> = {
  target: ['basketFill', 'basketSolid', 'basket'],
  tee: ['teePad', 'teeFill', 'tee'],
  dropzone: ['dropzone', 'teePad'],
  /*
   * Pairs, and the order is what makes them pairs.
   *
   * A mandatory's right-hand marker is the entry *after* the chosen one, so the
   * outlined pair and the filled pair have to sit next to each other in that
   * order — see `artFor`. Picking either half of a pair picks both.
   */
  mando: ['mandoLeft', 'mandoRight', 'mandoLeftFill', 'mandoRightFill'],
};

/** Whether a kind is marked with a glyph at all. */
export const hasGlyph = (kind: FeatureKind): boolean => kind in BUILT_IN_GLYPHS;

/** The built-in choices for a kind, in the order the picker should offer them. */
export const builtInGlyphsFor = (kind: FeatureKind): readonly string[] =>
  BUILT_IN_GLYPHS[kind] ?? [];

/**
 * How big a glyph lands on screen by default, in pixels.
 *
 * One size for the set. A basket and a mandatory marking the same ground at
 * different sizes would read as a claim about importance that nobody made.
 */
const DEFAULT_GLYPH_SIZE = 36;

/**
 * Line weights, by what the line *is* rather than by kind.
 *
 * Three registers, and the difference between them is a claim: a thing on the
 * ground is drawn at full weight, a drawing aid at a hairline, and a property
 * line — a note about the land rather than anything on it — thinner still.
 */
const STROKE_WIDTH = { feature: 2.5, aid: 2.5, note: 1.25 } as const;

/**
 * The tokens, as hex plus an opacity of its own.
 *
 * The tokens carry their alpha inside the colour — `rgb(8 9 11 / 0.85)` for the
 * casing, a translucent white for a fill. That is right for CSS and wrong here
 * for two reasons. A colour picker cannot show it: `input type="color"` takes
 * `#rrggbb` and nothing else, so the casing well came up **white** while the map
 * drew it near-black, which is the interface lying about the value it is
 * editing. And an opacity slider beside it would then multiply against an alpha
 * already baked into the colour, so dragging it to 1 would not reach opaque.
 *
 * Split at the boundary instead: hex in the picker, alpha in the slider, and
 * the two recombined by the renderer.
 */
function splitAlpha(token: string): { color: string; opacity: number } {
  const rgb = /^rgb\(\s*(\d+)\s+(\d+)\s+(\d+)\s*(?:\/\s*([\d.]+)\s*)?\)$/.exec(token);
  if (rgb) {
    const [, r, g, b, alpha] = rgb;
    const hex = [r, g, b].map((n) => Number(n).toString(16).padStart(2, '0')).join('');
    return { color: `#${hex}`, opacity: alpha === undefined ? 1 : Number(alpha) };
  }
  // Already hex with alpha: `#rrggbbaa`.
  if (/^#[0-9a-fA-F]{8}$/.test(token)) {
    return { color: token.slice(0, 7), opacity: parseInt(token.slice(7), 16) / 255 };
  }
  return { color: token, opacity: 1 };
}

function defaultFeatureStyle(kind: FeatureKind): ResolvedFeatureStyle {
  const colors = featureColors[kind];
  const geometry = KIND_DEFINITIONS[kind].geometry;
  const stroke = splitAlpha(colors.stroke);
  const casing = splitAlpha(colors.casing);
  const fill = splitAlpha(colors.fill);

  /*
   * A property boundary is a note about the land, not a thing on it — so it
   * gets the thinnest line on the map. Its fill is the *outside*: see
   * `INVERTED_FILL_KINDS`.
   */
  const isNote = kind === 'boundary';
  /* A fairway is a drawing aid the app worked out, not a thing on the ground,
     and it should say so whether or not anybody has bent it. */
  const isAid = kind === 'fairway';
  /* A mandatory line is a rule about where a disc may go — dashed, because
     there is nothing at the site to walk along. */
  const isRule = kind === 'mando';

  return {
    stroke: stroke.color,
    strokeOpacity: stroke.opacity,
    strokeWidth: isNote ? STROKE_WIDTH.note : STROKE_WIDTH.feature,
    dash: isNote ? 'dotted' : isAid || isRule ? 'dashed' : 'solid',
    casing: casing.color,
    casingOpacity: casing.opacity,
    casingOn: true,
    /*
     * The token's own alpha, multiplied by how solid this kind's areas are.
     *
     * A corridor is more solid than a plain area. It was 0.5, tuned against a
     * corridor that also had a dashed outline holding its shape; with the
     * outline gone the fill is the only thing saying where the corridor is, and
     * the room a shot has is one of the two things this map is for.
     */
    /*
     * A boundary's fill is the *outside*, and it is a wash rather than a tint:
     * light enough to read imagery through, dark enough to say which side of
     * the line the site is on.
     */
    fill: isNote ? '#000000' : fill.color,
    fillOpacity: isNote ? 0.28 : fill.opacity * (geometry === 'polygon' ? 1 : 0.9),
    fillOutside: isNote,
    glyph: DEFAULT_GLYPHS[kind] ?? '',
    glyphSize: DEFAULT_GLYPH_SIZE,
    /*
     * An arrowhead at the far end of a mandatory's wall, on by default.
     *
     * The line says where the plane is; the arrow says which way it faces, and
     * on a hole with two mandatories a wall with no direction is one you have
     * to work out from a glyph forty pixels away.
     */
    /*
     * The approach corridor is off until asked for.
     *
     * It is a second claim about the same shot, and two translucent bands down
     * one strip of land is a lot of ink for a map whose whole job is to be read
     * through. The designer who wants it knows they want it.
     */
    secondCorridor: false,
    secondFill: fill.color,
    secondFillOpacity: 0.3,
    arrow: isRule,
    arrowSize: 14,
    shade: isRule,
    shadeOpacity: 0.35,
    /* Clear of the glyph, which is about thirty pixels across at the zoom a
       hole is designed at. */
    lineGap: isRule ? 4 : 0,
  };
}

/**
 * The default sheet, computed once.
 *
 * Every kind, fully answered. Built at module load rather than per call because
 * it cannot change: it is a function of the tokens, which are constants.
 */
export const DEFAULT_FEATURE_STYLES: Record<FeatureKind, ResolvedFeatureStyle> =
  Object.fromEntries(FEATURE_KINDS.map((kind) => [kind, defaultFeatureStyle(kind)])) as Record<
    FeatureKind,
    ResolvedFeatureStyle
  >;

/**
 * Circle 1 is the one worth seeing. The other two are reference.
 *
 * Outline only — three filled rings stacked around every basket would sit on
 * the imagery a designer is reading the terrain from.
 */
export const DEFAULT_CIRCLE_STYLES: Record<TargetCircleId, ResolvedCircleStyle> =
  Object.fromEntries(
    TARGET_CIRCLES.map((circle) => [
      circle.id,
      {
        stroke: splitAlpha(featureColors.target.stroke).color,
        strokeWidth: circle.id === 'c1' ? 1.5 : 1,
        dash: 'dotted' as Dash,
      },
    ]),
  ) as Record<TargetCircleId, ResolvedCircleStyle>;

/** The hole number's disc and its numeral. */
export interface ResolvedHoleNumberStyle {
  text: string;
  offset: number;
  weight: 'regular' | 'bold';
  /** Null when the numeral is drawn bare, with no pill behind it. */
  disc: string | null;
  size: number;
}

export const DEFAULT_HOLE_NUMBER: ResolvedHoleNumberStyle = {
  text: splitAlpha(featureColors.tee.stroke).color,
  offset: 0,
  weight: 'bold',
  disc: splitAlpha(featureColors.tee.casing).color,
  size: 13,
};

/** What is actually drawn: the defaults, with the document's overrides on top. */
/**
 * How the four regulated areas are lettered. One setting for all of them.
 *
 * Sparse and modest, because the lettering is a *ground* rather than a label:
 * it has to say which area this is without competing with the tees, the
 * corridor and the numbers drawn over it.
 */
export interface ResolvedLettering {
  on: boolean;
  size: number;
  spacingM: number;
  angle: number;
}

export const DEFAULT_LETTERING_STYLE: ResolvedLettering = {
  on: true,
  size: 11,
  spacingM: 30,
  angle: 0,
};

export interface ResolvedStyle {
  lettering: ResolvedLettering;
  features: Record<FeatureKind, ResolvedFeatureStyle>;
  circles: Record<TargetCircleId, ResolvedCircleStyle>;
  holeNumber: ResolvedHoleNumberStyle;
  /** The paths behind every glyph name in use, built-in or uploaded. */
  glyphPaths: (name: string) => GlyphArt | null;
}

export interface GlyphArt {
  paths: readonly string[];
  /** `[minX, minY, width, height]`. Built-in art is authored in a 24 box. */
  viewBox: readonly [number, number, number, number];
}

const BUILT_IN_BOX: readonly [number, number, number, number] = [0, 0, 24, 24];

/**
 * Fold a stylesheet over the defaults.
 *
 * `??` at every field rather than a spread, because an override object holds
 * only the keys somebody set and a spread of `{ stroke: undefined }` would
 * overwrite a default with nothing. That is the whole point of optional
 * overrides, and the one place it could quietly go wrong.
 */
export function resolveStyle(style: MapStyle): ResolvedStyle {
  const features = Object.fromEntries(
    FEATURE_KINDS.map((kind) => {
      const base = DEFAULT_FEATURE_STYLES[kind];
      const over = featureStyleOf(style, kind);
      return [
        kind,
        {
          stroke: over.stroke ?? base.stroke,
          strokeOpacity: over.strokeOpacity ?? base.strokeOpacity,
          strokeWidth: over.strokeWidth ?? base.strokeWidth,
          dash: over.dash ?? base.dash,
          casing: over.casing ?? base.casing,
          casingOpacity: over.casingOpacity ?? base.casingOpacity,
          casingOn: over.casingOn ?? base.casingOn,
          fill: over.fill ?? base.fill,
          fillOpacity: over.fillOpacity ?? base.fillOpacity,
          secondCorridor: over.secondCorridor ?? base.secondCorridor,
          secondFill: over.secondFill ?? base.secondFill,
          secondFillOpacity: over.secondFillOpacity ?? base.secondFillOpacity,
          shade: over.shade ?? base.shade,
          shadeOpacity: over.shadeOpacity ?? base.shadeOpacity,
          arrow: over.arrow ?? base.arrow,
          arrowSize: over.arrowSize ?? base.arrowSize,
          lineGap: over.lineGap ?? base.lineGap,
          fillOutside: over.fillOutside ?? base.fillOutside,
          glyph: over.glyph ?? base.glyph,
          glyphSize: over.glyphSize ?? base.glyphSize,
        } satisfies ResolvedFeatureStyle,
      ];
    }),
  ) as Record<FeatureKind, ResolvedFeatureStyle>;

  const circles = Object.fromEntries(
    TARGET_CIRCLES.map((circle) => {
      const base = DEFAULT_CIRCLE_STYLES[circle.id];
      const over: CircleStyle = circleStyleOf(style, circle.id);
      return [
        circle.id,
        {
          stroke: over.stroke ?? base.stroke,
          strokeWidth: over.strokeWidth ?? base.strokeWidth,
          dash: over.dash ?? base.dash,
        } satisfies ResolvedCircleStyle,
      ];
    }),
  ) as Record<TargetCircleId, ResolvedCircleStyle>;

  return {
    features,
    circles,
    lettering: {
      on: style.lettering.on ?? DEFAULT_LETTERING_STYLE.on,
      size: style.lettering.size ?? DEFAULT_LETTERING_STYLE.size,
      spacingM: style.lettering.spacing ?? DEFAULT_LETTERING_STYLE.spacingM,
      angle: style.lettering.angle ?? DEFAULT_LETTERING_STYLE.angle,
    },
    holeNumber: {
      text: style.holeNumber.text ?? DEFAULT_HOLE_NUMBER.text,
      // `null` is a value here, not an absence — see `holeNumberStyleSchema`.
      disc:
        style.holeNumber.disc === undefined ? DEFAULT_HOLE_NUMBER.disc : style.holeNumber.disc,
      size: style.holeNumber.size ?? DEFAULT_HOLE_NUMBER.size,
      offset: style.holeNumber.offset ?? DEFAULT_HOLE_NUMBER.offset,
      weight: style.holeNumber.weight ?? DEFAULT_HOLE_NUMBER.weight,
    },
    /*
     * Built-in first, then the uploads.
     *
     * Null for a name that resolves to neither, which the marker builder reads
     * as "draw the default instead". A course whose custom glyph was deleted
     * should lose the drawing, not the basket.
     */
    glyphPaths: (name) => {
      const builtIn = LARGE_ART[name as keyof typeof LARGE_ART] as
        readonly string[] | undefined;
      if (builtIn) return { paths: builtIn, viewBox: BUILT_IN_BOX };

      const uploaded = glyphById(style, name);
      return uploaded ? { paths: uploaded.paths, viewBox: uploaded.viewBox } : null;
    },
  };
}
