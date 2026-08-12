import type { FeatureKind } from '@hyzerlines/core';

import type { ResolvedStyle } from './mapStyle';

/**
 * The repeating lettering over a regulated area.
 *
 * A course map shades out-of-bounds and writes OB across it, and the writing is
 * what makes it unambiguous: four regulated areas in four shades of the same
 * idea are four things you have to remember, where OB, HZ, CAS and REL are four
 * things you can read.
 *
 * ## A tiled image, because MapLibre has no repeating text
 *
 * `symbol-placement` offers `point`, `line` and `line-center` — one label per
 * feature, not a field of them. What does exist is `fill-pattern`, which tiles
 * an image across a polygon and clips it to the shape, so the lettering is
 * drawn once onto a square canvas and MapLibre repeats it.
 *
 * The consequences are worth knowing. The tile is in *screen* pixels, so the
 * lettering stays the same size as you zoom rather than growing with the ground
 * — right for an annotation, the same argument line widths make. And the angle
 * has to be baked into the image rather than applied to the layer, which is why
 * the tile is drawn nine times over: a rotated tile has to carry its
 * neighbours' overflow or the pattern breaks at every seam.
 */

/** What each regulated area is called, in the letters a course map uses. */
export const PATTERN_TEXT: Partial<Record<FeatureKind, string>> = {
  ob: 'OB',
  hazard: 'HZ',
  casualArea: 'CAS',
  requiredRelief: 'REL',
};

export const hasPattern = (kind: FeatureKind): boolean => kind in PATTERN_TEXT;

export const patternImage = (kind: FeatureKind) => `pattern-${kind}`;

/** Rendered at twice the size and registered at `pixelRatio: 2`, like the markers. */
const PIXEL_RATIO = 2;

function render(
  text: string,
  size: number,
  spacing: number,
  angleDeg: number,
  color: string,
): ImageData | null {
  const side = Math.max(16, Math.round(spacing));
  const canvas = document.createElement('canvas');
  canvas.width = side * PIXEL_RATIO;
  canvas.height = side * PIXEL_RATIO;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.scale(PIXEL_RATIO, PIXEL_RATIO);
  ctx.translate(side / 2, side / 2);
  ctx.rotate((angleDeg * Math.PI) / 180);

  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  /*
   * A system stack rather than the interface's own face. Canvas cannot use a
   * webfont that has not finished loading, and a pattern that silently fell
   * back mid-session would change the map's look without anybody touching it.
   */
  ctx.font = `700 ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;

  /*
   * Nine copies: the tile itself and its eight neighbours.
   *
   * Rotation moves ink across the tile's edges, and a tile that drew only its
   * own copy would lose whatever crossed the boundary — a pattern with a bite
   * out of it at every seam. Drawing the ring around it puts that ink back.
   */
  for (let row = -1; row <= 1; row++) {
    for (let column = -1; column <= 1; column++) {
      ctx.fillText(text, column * side, row * side);
    }
  }

  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/**
 * Register a pattern image for every kind that has lettering.
 *
 * Re-registers rather than skipping, for the reason the markers do: `addImage`
 * refuses a name it already holds, so a changed pattern has to replace the old
 * one explicitly.
 */
export function addPatternImages(
  map: {
    hasImage: (id: string) => boolean;
    addImage: (id: string, image: ImageData, options?: { pixelRatio?: number }) => void;
    removeImage: (id: string) => void;
  },
  style: ResolvedStyle,
): void {
  for (const [kind, text] of Object.entries(PATTERN_TEXT) as [FeatureKind, string][]) {
    const drawn = style.features[kind];
    const image = render(
      text,
      drawn.patternSize,
      drawn.patternSpacing,
      drawn.patternAngle,
      // The lettering takes the line's colour, so an area's outline and its
      // letters can never disagree about which area it is.
      drawn.stroke,
    );
    if (!image) continue;

    const id = patternImage(kind);
    if (map.hasImage(id)) map.removeImage(id);
    map.addImage(id, image, { pixelRatio: PIXEL_RATIO });
  }
}
