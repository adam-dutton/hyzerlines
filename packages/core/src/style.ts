import { z } from 'zod';

import { featureKindSchema, type FeatureKind } from './features.js';
import { TARGET_CIRCLES, type TargetCircleId } from './pdga.js';

/**
 * How this course is drawn.
 *
 * In the document, beside `display` and `overlays`, and for the same reason:
 * the look of a course is part of the course. A designer who hands a park board
 * a `.hyzer` with the fairways in green and the mandatories in orange meant them
 * to see it that way, and a look that lived in whichever browser last touched
 * the file would arrive as somebody else's defaults.
 *
 * ## Everything here is optional, and that is the design
 *
 * An unset value means "whatever the app draws by default", not "transparent"
 * or "zero". Three things follow from it, all of them worth having:
 *
 *   - A course that has never been styled carries an empty object, so the file
 *     stays small and says nothing it does not mean.
 *   - Improving a default reaches every course that never overrode it, which is
 *     how a default earns the name.
 *   - The interface can show the difference between a value somebody chose and
 *     one they inherited, which is the difference between a decision and a
 *     starting point. `Reset` is then deletion rather than a second guess at
 *     what the default used to be.
 *
 * The defaults themselves are deliberately NOT here. They come from the design
 * tokens, which live in the design package because they are also the interface's
 * colours; core holds the overrides and knows nothing about hue. See
 * `resolveStyle` in the web app.
 */

/**
 * Colours are hex, and validated.
 *
 * Not decoration: these strings are handed to MapLibre as paint values, and a
 * colour it cannot parse fails the *whole layer* rather than the one property —
 * which presents as a feature kind silently not drawing. A document that has
 * been round-tripped through a text editor is exactly where that would come
 * from, so the schema is the place to stop it.
 *
 * Three digits, six, or eight with alpha. Named colours and `rgb()` are refused
 * rather than parsed: the picker produces hex, opacity has its own field, and a
 * second way to say the same thing is a second thing to keep in step.
 */
const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
export const colorSchema = z
  .string()
  .regex(HEX, 'A colour has to be a hex value, like #ff6b64.');

/**
 * How a line is broken.
 *
 * Three, named for what they mean rather than for numbers. A designer picking
 * "dotted" is saying *this is a note about the land*, and the dash lengths that
 * express it are a rendering decision that should be free to change — see
 * `DASH_PATTERNS` in the web app.
 */
export const DASHES = ['solid', 'dashed', 'dotted', 'dotDash', 'longDash'] as const;
export const dashSchema = z.enum(DASHES);
export type Dash = z.infer<typeof dashSchema>;

/**
 * Everything one kind of feature can be told about how to draw itself.
 *
 * One shape for all fifteen kinds rather than a shape per geometry. A point has
 * no fill and a polygon has no glyph, and the interface only offers what the
 * kind can use — but a single record means adding a property is one field here
 * and one control there, instead of three parallel edits that drift.
 */
export const featureStyleSchema = z.object({
  /** The line, the outline of an area, and the ink of a glyph. */
  stroke: colorSchema.optional(),
  strokeOpacity: z.number().min(0).max(1).optional(),
  /** In screen pixels: an annotation stays legible at every zoom. */
  strokeWidth: z.number().min(0).max(24).optional(),
  dash: dashSchema.optional(),
  /**
   * The dark line under the stroke — the contrast floor.
   *
   * Customisable, and it is the one setting here that can make a map unreadable.
   * It is offered anyway because it is also the setting that makes a *light*
   * basemap work: over a print-white plan the casing wants to be light and the
   * stroke dark, which is not reachable by changing the stroke alone.
   */
  casing: colorSchema.optional(),
  casingOpacity: z.number().min(0).max(1).optional(),
  /**
   * Whether the casing is drawn at all.
   *
   * A boolean rather than an opacity of zero, because they are different
   * statements: "no contrast floor on this kind" is a decision, and a slider
   * dragged to the end is a value that happens to be invisible. On a printed
   * plan or a light basemap the floor is often not wanted at all, and turning
   * it off should be one click that can be clicked back.
   */
  casingOn: z.boolean().optional(),
  fill: colorSchema.optional(),
  fillOpacity: z.number().min(0).max(1).optional(),
  /**
   * Fill the ground *outside* the shape rather than inside it.
   *
   * What a property boundary means. A parcel line says "the site is in here",
   * and shading the site is the one thing that cannot help: a designer reads
   * terrain through that fill for the whole job. Shading everything *else*
   * makes the same statement and takes nothing away — it is how every site plan
   * is drawn, and it is why the boundary had no fill at all until now.
   */
  fillOutside: z.boolean().optional(),
  /**
   * A fairway's second, wider corridor.
   *
   * The first says how much room the shot has; this says how much room the
   * *approach* has — it runs from the front of the tee pad and opens out to
   * enclose Circle 2, which is the ground a player is trying to reach rather
   * than the line they are trying to hold. Two claims about one shot, so two
   * shapes with their own colour and their own weight.
   */
  secondCorridor: z.boolean().optional(),
  secondFill: colorSchema.optional(),
  secondFillOpacity: z.number().min(0).max(1).optional(),
  /**
   * A mandatory's own three, shown only on that kind.
   *
   * They live in the same record as everything else for the reason the record
   * is one shape for fifteen kinds: adding a property is one field here and one
   * control there, rather than a second schema that drifts.
   */
  arrow: z.boolean().optional(),
  arrowSize: z.number().min(6).max(48).optional(),
  /** Where the mandatory line starts, measured out from the object, in metres. */
  lineGap: z.number().min(0).max(50).optional(),
  /**
   * The shading behind a mandatory's wall.
   *
   * A half disc with its flat edge on the line, bulging the way play goes: the
   * ground you end up on if you take the wrong side and carry on to the basket.
   * The line says where the plane is; this says what it costs you.
   */
  shade: z.boolean().optional(),
  shadeOpacity: z.number().min(0).max(1).optional(),
  /**
   * Which drawing marks a point of this kind.
   *
   * A built-in name, or the id of an uploaded glyph. Unknown ids fall back to
   * the default rather than drawing nothing — a course whose custom glyph was
   * deleted should lose the drawing, not the basket.
   */
  glyph: z.string().min(1).optional(),
  /** How big the glyph lands on screen, in pixels. */
  glyphSize: z.number().min(8).max(96).optional(),
});

export type FeatureStyle = z.infer<typeof featureStyleSchema>;

/**
 * The hole's number, on the ground.
 *
 * A disc with a numeral in it, so the two colours are the ink and the ground it
 * sits on. Sized in pixels like every other annotation: the number is a label
 * on the map, not an object on the site.
 */
export const holeNumberStyleSchema = z.object({
  text: colorSchema.optional(),
  /**
   * How far off the shot the number sits, in metres on the ground.
   *
   * Metres rather than pixels, because the number is placed relative to the
   * *hole*: it should keep the same relationship to the corridor at every zoom,
   * the way the corridor keeps its width. A pixel offset would swing the label
   * across the fairway as you zoomed out.
   *
   * Positive is the player's right, looking down the shot. Zero puts it on the
   * line, which is where it has always been.
   */
  offset: z.number().min(-200).max(200).optional(),
  /**
   * The weight the numeral is set in.
   *
   * Two, and that is the font server's list rather than a design decision: the
   * glyph source publishes a regular and a bold of each family, and offering a
   * weight it cannot serve would render as no text at all.
   */
  weight: z.enum(['regular', 'bold']).optional(),
  /**
   * The filled pill behind the numeral, or `null` for no pill at all.
   *
   * Three states rather than two, and the third is the point: absent means the
   * default disc, a colour means that disc, and `null` means the number is
   * drawn bare. Over a light plan or a printed sign the disc is often not
   * wanted, and "off" has to be distinguishable from "not yet set" or turning
   * it off would read as never having chosen.
   */
  disc: colorSchema.nullable().optional(),
  size: z.number().min(8).max(48).optional(),
});

export type HoleNumberStyle = z.infer<typeof holeNumberStyleSchema>;

/** A putting circle's ring. It has no fill — see the note in `derivedLayers`. */
export const circleStyleSchema = z.object({
  stroke: colorSchema.optional(),
  strokeWidth: z.number().min(0).max(12).optional(),
  dash: dashSchema.optional(),
});

export type CircleStyle = z.infer<typeof circleStyleSchema>;

/**
 * A glyph somebody uploaded.
 *
 * **Path data and nothing else.** An SVG file is a document format with scripts,
 * external references and embedded images in it; what this stores is the `d`
 * attribute of its paths, which is a string of coordinates that `Path2D` turns
 * into a shape. Nothing in an uploaded file can *do* anything, because nothing
 * but the coordinates survives the import. See `glyphFromSvg`.
 *
 * The box is kept so the drawing can be scaled to whatever size the style asks
 * for without the importer having to re-fit anybody's artwork.
 */
export const customGlyphSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(60),
  paths: z.array(z.string().min(1)).min(1).max(200),
  /** `[minX, minY, width, height]`, straight from the file's own viewBox. */
  viewBox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
});

export type CustomGlyph = z.infer<typeof customGlyphSchema>;

const TARGET_CIRCLE_IDS = TARGET_CIRCLES.map((circle) => circle.id) as [
  TargetCircleId,
  ...TargetCircleId[],
];

/**
 * Colours the designer keeps to hand.
 *
 * A course has a palette whether or not the app has one — the four or five
 * colours the whole map is built from — and without somewhere to put it that
 * palette lives in a designer's head and gets retyped, slightly wrong, into
 * every picker. Stored with the style rather than with the browser for the same
 * reason the style is in the document: it belongs to this course.
 */
/**
 * The repeating lettering over the regulated areas.
 *
 * **One setting for all four**, not one per kind. OB, HZ, CAS and REL are the
 * same annotation doing the same job at four different rulings, and a designer
 * who sets the lettering sparse on out-of-bounds and dense on hazards has not
 * made a distinction — they have made the map inconsistent and will now go and
 * fix the other three by hand. What legitimately differs between them is what
 * the letters *say* and what colour they are, and neither of those is in here:
 * the text is the kind's own name, and the colour follows its line.
 */
export const letteringSchema = z.object({
  on: z.boolean().optional(),
  /** Cap height, in pixels. */
  size: z.number().min(6).max(48).optional(),
  /** Centre to centre on the ground, in metres. Bigger is sparser. */
  spacing: z.number().min(5).max(400).optional(),
  /** Degrees clockwise. Tilts the grid, not the letters. */
  angle: z.number().min(-90).max(90).optional(),
});

export type Lettering = z.infer<typeof letteringSchema>;

export const paletteSchema = z.array(colorSchema).max(24);

export const mapStyleSchema = z.object({
  /** Overrides by kind. Absent kinds draw at their defaults. */
  features: z.record(featureKindSchema, featureStyleSchema).default({}),
  holeNumber: holeNumberStyleSchema.default({}),
  /** Shared by the four regulated areas. See `letteringSchema`. */
  lettering: letteringSchema.default({}),
  /** Keyed by `TargetCircleId`, so a new ring is a compile error rather than
      a circle nobody can restyle. */
  circles: z.record(z.enum(TARGET_CIRCLE_IDS), circleStyleSchema).default({}),
  /** Colours to pick from, in every picker. Empty until somebody keeps one. */
  palette: paletteSchema.default([]),
  /** The uploaded library, referenced by `featureStyle.glyph`. */
  glyphs: z.array(customGlyphSchema).default([]),
});

export type MapStyle = z.infer<typeof mapStyleSchema>;

export const DEFAULT_MAP_STYLE: MapStyle = mapStyleSchema.parse({});

/** What has been said about a kind, which is usually nothing. */
export const featureStyleOf = (style: MapStyle, kind: FeatureKind): FeatureStyle =>
  style.features[kind] ?? {};

export const circleStyleOf = (style: MapStyle, id: TargetCircleId): CircleStyle =>
  style.circles[id] ?? {};

export const glyphById = (style: MapStyle, id: string): CustomGlyph | undefined =>
  style.glyphs.find((glyph) => glyph.id === id);

/**
 * Set one kind's style, dropping the keys that were cleared.
 *
 * An override set back to its default is *removed* rather than written as the
 * default's current value. Storing it would freeze today's default into the
 * document and quietly opt the course out of every future improvement to it —
 * and it would make "inherited" and "chosen, and happens to match" the same
 * state, which is exactly the distinction this model exists to keep.
 */
export function withFeatureStyle(
  style: MapStyle,
  kind: FeatureKind,
  next: FeatureStyle,
): MapStyle {
  const cleaned = Object.fromEntries(
    Object.entries(next).filter(([, value]) => value !== undefined),
  ) as FeatureStyle;

  const features = { ...style.features };
  if (Object.keys(cleaned).length === 0) delete features[kind];
  else features[kind] = cleaned;

  return { ...style, features };
}

/** Whether anything at all has been overridden. Drives "Reset all". */
export const isDefaultStyle = (style: MapStyle): boolean =>
  Object.keys(style.features).length === 0 &&
  Object.keys(style.holeNumber).length === 0 &&
  Object.keys(style.circles).length === 0 &&
  Object.keys(style.lettering).length === 0 &&
  style.palette.length === 0 &&
  style.glyphs.length === 0;

/**
 * Everything back to the defaults, keeping what is not a default.
 *
 * The uploaded glyphs and the palette survive, and that is the whole reason
 * this is a function rather than `DEFAULT_MAP_STYLE`. Those two are the
 * designer's *materials*, not their decisions: "put this course back to how it
 * arrived" should not throw away the drawings they imported and the colours
 * they collected on the way.
 */
export const resetStyle = (style: MapStyle): MapStyle => ({
  ...DEFAULT_MAP_STYLE,
  palette: style.palette,
  glyphs: style.glyphs,
});
