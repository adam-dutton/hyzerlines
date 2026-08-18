import { feature as featureColors } from '@hyzerlines/design';
import type { FeatureKind } from '@hyzerlines/core';

import { LARGE_ART } from '../chrome/iconArt';
import {
  DEFAULT_FEATURE_STYLES,
  builtInGlyphsFor,
  type GlyphArt,
  type ResolvedStyle,
} from './mapStyle';

/** Each kind's own default drawing, for when a chosen one resolves to nothing. */
const DEFAULT_GLYPH_OF: Partial<Record<FeatureKind, string>> = Object.fromEntries(
  (Object.keys(DEFAULT_FEATURE_STYLES) as FeatureKind[]).map((kind) => [
    kind,
    DEFAULT_FEATURE_STYLES[kind].glyph,
  ]),
);

/**
 * Map markers that are pictures rather than dots.
 *
 * A basket is the one object on a disc golf course that everybody recognises on
 * sight, and drawing it as a coloured circle throws that away — a circle is
 * indistinguishable from a mando, a noted point, or anything else that happens
 * to be a point. That argument was always going to reach the rest of them, and
 * it has: a tee, a drop zone and a mandatory are all pictures now too.
 *
 * Drawn to a canvas at load rather than shipped as PNGs, so the colours come
 * from the design tokens like everything else. Committed image files would be
 * the one place in the app where a colour is not a token, and they would go
 * stale silently the first time the palette moved.
 *
 * The artwork is the interface's own, read from `chrome/iconArt`: `Path2D`
 * accepts SVG path data directly, so one drawing serves the React component and
 * this canvas. There is no second basket to keep in step.
 */

/** The box every drawing is authored in. */
const ART_SIZE = 24;

/** The device pixel ratio the images are registered at. */
const PIXEL_RATIO = 2;

/**
 * How much bigger than the artwork a marker is drawn.
 *
 * The art's thinnest parts — the basket's chains, its pole — are one unit wide.
 * At `pixelRatio: 2` a scale of 3 puts those at three device pixels, which is
 * 1.5 on screen: thick enough to hold their colour against imagery, where two
 * device pixels had left the chains translucent at the edges.
 */
const SCALE = 3;

/**
 * How big a marker lands on screen, in CSS pixels.
 *
 * Exported because the map has to compare it against real ground: a tee pad is
 * drawn at its true size only once the true size is bigger than this, and the
 * zoom that happens at is arithmetic rather than a number somebody picked. See
 * `PAD_LEGIBLE_ZOOM`.
 */
export const MARKER_SIZE_PX = (ART_SIZE * SCALE) / PIXEL_RATIO;

/**
 * The kinds that are marked with a drawing, and how each one stands on its
 * coordinate.
 *
 * A mandatory has two entries because which way it points *is* the ruling — see
 * `mandoLineOf`. Everything else is one marker whose artwork the stylesheet
 * chooses.
 */
interface Marker {
  kind: FeatureKind;
  /**
   * Which of the kind's drawings this marker is, when a kind has more than one.
   *
   * Only the mandatory does. The style names one glyph for `mando`, and the
   * right-hand marker is the left-hand one's opposite number — so it takes the
   * glyph *after* the chosen one in the kind's built-in list rather than a
   * setting of its own, which is what keeps "pass left" and "pass right"
   * looking like a pair.
   */
  variant?: 'opposite' | 'arrow';
  /**
   * Fill the drawing's outer contour with the casing colour first.
   *
   * For a marker something is drawn *underneath*. The mandatory's line runs
   * from the object outward, and the mandatory's glyph is an outline with the
   * map showing through it — so the line ran visibly through the middle of the
   * badge that is supposed to be marking its start. A backing makes the glyph
   * opaque and the line emerges from its edge, at every zoom, without either
   * having to know how big the other is on screen.
   *
   * `nonzero` rather than `evenodd`, deliberately: it fills the silhouette
   * including the hole in the middle, which is the whole point.
   */
  backing?: true;
  /**
   * Whether the drawing is a solid silhouette rather than an outline.
   *
   * It decides the casing width, and it is the one place these markers are not
   * interchangeable. A silhouette takes a casing two units wide that lies
   * entirely outside it and reads as an edge. An *outline* is a one-unit band
   * with the map showing through, and the same casing centred on it leaves a
   * third of the band inside a dark surround — at marker size that is not a
   * glyph with a contrast floor, it is a blob.
   *
   * Which a drawing is depends on the artwork, and an uploaded one could be
   * either, so this is a property of the *slot* and the default for uploads is
   * the safer of the two.
   */
  solid?: true;
}

/**
 * How far down its box a drawing's ink actually reaches, as a fraction.
 *
 * Keyed by the *drawing* rather than by the marker slot, and that is the fix
 * for a real bug: it was a property of the slot, so a tee that had picked any
 * pad other than the default was still cropped to the default's height and lost
 * its bottom third. A slot can hold several drawings and an uploaded one can be
 * anything, so the crop has to follow the artwork.
 *
 * It exists at all because a basket is anchored at its base: the pole stops
 * short of the box's bottom edge, and empty box under the ink would float every
 * basket off the ground it stands on. Anything not listed here fills its box.
 */
const INK_BOTTOM: Record<string, number> = {
  basketFill: 22 / 24,
  basketSolid: 22 / 24,
  basket: 22 / 24,
  teePad: 18 / 24,
};

const MARKERS = {
  target: { kind: 'target', solid: true },
  tee: { kind: 'tee', solid: true },
  dropzone: { kind: 'dropzone' },
  mandoLeft: { kind: 'mando', backing: true },
  mandoRight: { kind: 'mando', variant: 'opposite', backing: true },
  /*
   * The arrowhead is not a glyph anybody picks, so it is not in the built-in
   * lists and takes no `glyph` from the style. It takes the mandatory's colours
   * and its own size, because it is part of the line rather than a second
   * marker for the object.
   */
  mandoArrow: { kind: 'mando', variant: 'arrow', solid: true },
} as const satisfies Record<string, Marker>;

export type MarkerName = keyof typeof MARKERS;

/**
 * The image id for a marker in a state.
 *
 * Two images per marker rather than one recoloured at draw time: MapLibre can
 * only tint an icon that is an SDF, and an SDF is a single-channel silhouette —
 * it cannot carry both the casing and the fill, which is the whole point of
 * these glyphs. A few kilobytes buys the contrast floor.
 */
export function markerIcon(name: MarkerName, selected = false): string {
  return selected ? `marker-${name}-selected` : `marker-${name}`;
}

/**
 * One marker, filled from its paths with a casing stroked underneath.
 *
 * The casing is stroked around the same paths before they are filled, which is
 * how every other vector on the map gets its contrast floor: no single colour
 * survives the range from tree canopy to bright sand.
 *
 * `evenodd`, because several of these are paths with holes in them — the same
 * subpath describes the outside and the inside, and the nonzero rule would fill
 * the gap and turn the basket into a solid lozenge and the tee into a slab.
 */
function draw(
  ctx: CanvasRenderingContext2D,
  marker: Marker,
  art: GlyphArt,
  color: string,
  casing: string,
  /** Zero when the kind's casing is switched off. See `featureStyleSchema`. */
  casingAlpha: number,
): void {
  const paths = art.paths.map((d) => new Path2D(d));
  const [minX, minY, width, height] = art.viewBox;
  // Uploaded artwork is authored in whatever box its designer used, so it is
  // fitted to the marker's square rather than assumed to be 24 by 24.
  const fit = ART_SIZE / Math.max(width, height, 1);

  ctx.save();
  ctx.scale(SCALE * fit, SCALE * fit);
  ctx.translate(-minX, -minY);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  /*
   * The casing obeys the stylesheet, like every other line on the map.
   *
   * It did not: the glyphs took the casing *colour* and drew it at full
   * strength whatever the kind's casing switch and opacity said, so turning the
   * contrast floor off left every marker still wearing one. The backing goes
   * with it — it is the same dark ink, filled rather than stroked.
   */
  if (casingAlpha > 0) {
    ctx.globalAlpha = casingAlpha;
    if (marker.backing) {
      ctx.fillStyle = casing;
      for (const path of paths) ctx.fill(path);
    }

    ctx.strokeStyle = casing;
    // Divided by the fit so an uploaded glyph in a 512 box gets the same casing
    // on screen as a built-in one in a 24 box.
    ctx.lineWidth = (marker.solid ? 2 : 1) / fit;
    for (const path of paths) ctx.stroke(path);
    ctx.globalAlpha = 1;
  }

  ctx.fillStyle = color;
  for (const path of paths) ctx.fill(path, 'evenodd');
  ctx.restore();
}

function render(
  marker: Marker,
  art: GlyphArt,
  glyph: string,
  sizePx: number,
  color: string,
  casing: string,
  casingAlpha: number,
): ImageData | null {
  const canvas = document.createElement('canvas');
  // The style asks for a size in CSS pixels; the image is drawn at the device
  // ratio it will be registered at.
  const side = Math.round(sizePx * PIXEL_RATIO);
  canvas.width = side;
  canvas.height = Math.max(1, Math.round(side * (INK_BOTTOM[glyph] ?? 1)));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // `draw` works in art units scaled by SCALE; rescale to the asked-for size.
  ctx.scale(side / (ART_SIZE * SCALE), side / (ART_SIZE * SCALE));
  draw(ctx, marker, art, color, casing, casingAlpha);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/**
 * Which drawing a marker uses, after the stylesheet has had its say.
 *
 * Falls back to the kind's default when the style names a glyph that resolves
 * to nothing — an uploaded one that has since been deleted, most likely. A
 * course should lose the drawing, not the basket.
 */
function artFor(name: MarkerName, style: ResolvedStyle): GlyphArt | null {
  const marker: Marker = MARKERS[name];
  const chosen = style.features[marker.kind].glyph;
  const fallback = () => style.glyphPaths(DEFAULT_GLYPH_OF[marker.kind] ?? '');

  if (marker.variant === 'arrow')
    return { paths: LARGE_ART.arrowhead, viewBox: [0, 0, 24, 24] };

  if (marker.variant === 'opposite') {
    /*
     * The built-in list holds *pairs*, left then right, and the pair is what a
     * designer picks. So the drawing is found by clearing the low bit to get
     * the pair and adding one for its right-hand half — picking either side of
     * the outlined pair selects both sides of the outlined pair, and the same
     * for the filled one.
     *
     * Stepping to the *next* entry instead, which is what this did while there
     * were only two, walks off the end of a pair as soon as there is more than
     * one: choosing the outlined right-hand drawing gave you the filled
     * left-hand one on the other side of the hole.
     *
     * An uploaded glyph is one drawing with no opposite number, so both sides
     * use it and the line is what says which side you must pass. Inventing a
     * mirror image would be the app claiming to know which way somebody else's
     * artwork points.
     */
    const pair = builtInGlyphsFor(marker.kind);
    const index = pair.indexOf(chosen);
    const opposite = index === -1 ? chosen : (pair[(index & ~1) + 1] ?? chosen);
    return style.glyphPaths(opposite) ?? fallback();
  }

  /* And the left-hand marker takes the pair's first half, however the designer
     named it: picking the right-hand drawing still means the pair. */
  const pair = builtInGlyphsFor(marker.kind);
  const index = pair.indexOf(chosen);
  const own =
    marker.variant === undefined && index !== -1 && MARKERS[name].kind === 'mando'
      ? (pair[index & ~1] ?? chosen)
      : chosen;
  return style.glyphPaths(own) ?? fallback();
}

/**
 * Register every marker image with a map.
 *
 * Re-registers rather than skipping: `addImage` refuses a name it already
 * holds, so a changed drawing has to replace the old one explicitly. Cheap —
 * five drawings on a canvas — and it runs only when the stylesheet changes.
 */
export function addMarkerIcons(
  map: {
    hasImage: (id: string) => boolean;
    addImage: (id: string, image: ImageData, options?: { pixelRatio?: number }) => void;
    removeImage: (id: string) => void;
  },
  style: ResolvedStyle,
): void {
  for (const [name, marker] of Object.entries(MARKERS) as [MarkerName, Marker][]) {
    const art = artFor(name, style);
    if (!art) continue;

    const drawn = style.features[marker.kind];
    const size = marker.variant === 'arrow' ? drawn.arrowSize : drawn.glyphSize;
    // Which drawing this ended up being, so the crop follows the artwork.
    const glyph = marker.variant === 'arrow' ? 'arrowhead' : drawn.glyph;
    const casingAlpha = drawn.casingOn ? drawn.casingOpacity : 0;
    /*
     * Selection is the *casing*, not the fill.
     *
     * The glyph keeps the colour the designer gave it and gains an accent
     * outline. Recolouring the fill as well was the old behaviour, and it made
     * a selected hole read as a hole drawn in a different colour rather than as
     * one that happens to be picked — on a map whose job is to be measured off,
     * the drawing should not change because of what is selected.
     *
     * This is not the pre-monochrome arrangement returning. That one kept the
     * feature colour and inverted the *casing to white*, which vanished once
     * every feature became white: a white glyph cased in white is identical to
     * an unselected one. Accent against white is not.
     *
     * The casing is forced to full strength for the selected variant, because a
     * kind whose casing is switched off would otherwise have no selected state
     * at all — here the casing is carrying the selection, not just the contrast
     * floor it normally provides.
     */
    const variants: [string, string, string, number][] = [
      [markerIcon(name), drawn.stroke, drawn.casing, casingAlpha],
      [markerIcon(name, true), drawn.stroke, featureColors.selected.casing, 1],
    ];

    for (const [id, color, casing, alpha] of variants) {
      const image = render(marker, art, glyph, size, color, casing, alpha);
      if (!image) continue;
      if (map.hasImage(id)) map.removeImage(id);
      map.addImage(id, image, { pixelRatio: PIXEL_RATIO });
    }
  }
}
