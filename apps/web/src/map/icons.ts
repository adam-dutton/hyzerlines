import { feature as featureColors, type FeatureKind } from '@hyzerlines/design';

import { LARGE_ART } from '../chrome/iconArt';

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

interface Marker {
  art: readonly string[];
  /**
   * Which feature's colours it takes. Two markers can share a kind — a
   * mandatory has a drawing for each side it can send you.
   */
  kind: FeatureKind;
  /**
   * The lowest the drawing's own ink reaches, in art units, when that is not
   * the bottom of the box.
   *
   * Only the basket sets it. Its pole stops at 22 of 24, and the marker is
   * anchored `bottom`, so two empty units under the image would float every
   * basket off the ground it is standing on.
   */
  inkBottom?: number;
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
   * How wide the casing is stroked, in art units.
   *
   * Not one number for the set, and this is the one place these drawings are
   * not interchangeable. The basket marker is a solid silhouette, so a casing
   * two units wide lies entirely outside it and reads as an edge. The others
   * are *outlines* — one-unit bands with the map showing through — and a
   * two-unit casing centred on a one-unit band leaves a third of it white
   * inside a dark surround. At marker size that is not a glyph with a contrast
   * floor, it is a blob: the mandatory came out as a dark teardrop with a dot
   * in it, and the M it is named for was gone.
   */
  casingWidth?: number;
}

/**
 * Every marker the map draws, and the art it is drawn from.
 *
 * The basket is the *filled* variant rather than the outline the tool bar uses.
 * At marker size the outline's interior lines are a pixel apart and read as
 * grey mush, where the solid silhouette holds its shape over canopy and sand
 * alike. Everything else is the same drawing at both sizes: they are outlines
 * of simple shapes, and they survive.
 */
const MARKERS = {
  target: { art: LARGE_ART.basketFill, kind: 'target', inkBottom: 22, casingWidth: 2 },
  // A solid rectangle, like the basket, so it takes the basket's casing.
  tee: { art: LARGE_ART.teePad, kind: 'tee', inkBottom: 18, casingWidth: 2 },
  dropzone: { art: LARGE_ART.dropzone, kind: 'dropzone' },
  mandoLeft: { art: LARGE_ART.mandoLeft, kind: 'mando', backing: true },
  mandoRight: { art: LARGE_ART.mandoRight, kind: 'mando', backing: true },
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
function draw(ctx: CanvasRenderingContext2D, marker: Marker, color: string, casing: string) {
  const paths = marker.art.map((d) => new Path2D(d));

  ctx.save();
  ctx.scale(SCALE, SCALE);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (marker.backing) {
    ctx.fillStyle = casing;
    for (const path of paths) ctx.fill(path);
  }

  ctx.strokeStyle = casing;
  ctx.lineWidth = marker.casingWidth ?? 1;
  for (const path of paths) ctx.stroke(path);

  ctx.fillStyle = color;
  for (const path of paths) ctx.fill(path, 'evenodd');
  ctx.restore();
}

function render(marker: Marker, color: string, casing: string): ImageData | null {
  const canvas = document.createElement('canvas');
  canvas.width = ART_SIZE * SCALE;
  canvas.height = (marker.inkBottom ?? ART_SIZE) * SCALE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  draw(ctx, marker, color, casing);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/**
 * Register every marker image with a map.
 *
 * Idempotent, because a basemap change re-runs style installation.
 */
export function addMarkerIcons(map: {
  hasImage: (id: string) => boolean;
  addImage: (id: string, image: ImageData, options?: { pixelRatio?: number }) => void;
}): void {
  for (const [name, marker] of Object.entries(MARKERS) as [MarkerName, Marker][]) {
    const variants: [string, string, string][] = [
      [markerIcon(name), featureColors[marker.kind].stroke, featureColors[marker.kind].casing],
      /*
       * Selected: the accent, fill and casing both, exactly as every other
       * vector on the map does it.
       *
       * The basket used to keep the feature colour and invert the casing to
       * white, which worked while baskets were red. The monochrome pass made
       * every feature white and left it as a white glyph cased in white —
       * invisible as a casing, identical to the unselected glyph, so selecting
       * a hole lit up its tee, its corridor and its number and left the basket
       * looking untouched.
       */
      [markerIcon(name, true), featureColors.selected.stroke, featureColors.selected.casing],
    ];

    for (const [id, color, casing] of variants) {
      if (map.hasImage(id)) continue;
      const image = render(marker, color, casing);
      if (image) map.addImage(id, image, { pixelRatio: 2 });
    }
  }
}
