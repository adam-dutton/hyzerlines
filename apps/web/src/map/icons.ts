import { feature as featureColors } from '@hyzerlines/design';

import { LARGE_ART } from '../chrome/iconArt';

/**
 * Map markers that are pictures rather than dots.
 *
 * A basket is the one object on a disc golf course that everybody recognises on
 * sight, and drawing it as a coloured circle throws that away — a circle is
 * indistinguishable from a mando, a noted point, or anything else that happens
 * to be a point. The glyph is worth the code.
 *
 * Drawn to a canvas at load rather than shipped as a PNG, so the colours come
 * from the design tokens like everything else. A committed image file would be
 * the one place in the app where a colour is not a token, and it would go stale
 * silently the first time the palette moved.
 *
 * The artwork is the interface's own, read from `chrome/iconArt`: `Path2D`
 * accepts SVG path data directly, so one drawing serves the React component and
 * this canvas. There is no second basket to keep in step.
 */

/** The box every drawing is authored in. */
const ART_SIZE = 24;

/**
 * How much bigger than the artwork the marker is drawn.
 *
 * The art's thinnest parts — the chains, and the pole — are one unit wide. At
 * `pixelRatio: 2` a scale of 3 puts those at three device pixels, which is 1.5
 * on screen: thick enough to hold their colour against imagery, where two
 * device pixels had left the chains translucent at the edges.
 */
const SCALE = 3;

/**
 * The basket's filled variant, not the outline the tool bar uses.
 *
 * At marker size the outline's interior lines are a pixel apart and read as
 * grey mush; the solid silhouette holds its shape over canopy and sand alike.
 * The two are the same drawing — see `basket` and `basketFill` in `iconArt`.
 */
const BASKET_ART = LARGE_ART.basketFill;

/**
 * The lowest the basket's own ink reaches, in art units.
 *
 * The pole stops at 22 of 24. The canvas is cropped to that rather than left
 * square, because the marker is anchored `bottom` — two units of empty box
 * below the pole would float the whole basket off the ground it stands on.
 */
const BASKET_INK_BOTTOM = 22;

/**
 * The basket, filled from the icon's paths with a casing stroked underneath.
 *
 * The casing is stroked around the same paths before they are filled, which is
 * how every other vector on the map gets its contrast floor: no single colour
 * survives the range from tree canopy to bright sand.
 *
 * `evenodd`, because the band is a path with a hole in it — the same subpath
 * describes the outside and the inside, and the nonzero rule would fill the
 * gap and turn the basket into a solid lozenge.
 */
function drawBasket(ctx: CanvasRenderingContext2D, color: string, casing: string): void {
  const paths = BASKET_ART.map((d) => new Path2D(d));

  ctx.save();
  ctx.scale(SCALE, SCALE);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.strokeStyle = casing;
  ctx.lineWidth = 2;
  for (const path of paths) ctx.stroke(path);

  ctx.fillStyle = color;
  for (const path of paths) ctx.fill(path, 'evenodd');
  ctx.restore();
}

function render(color: string, casing: string): ImageData | null {
  const canvas = document.createElement('canvas');
  canvas.width = ART_SIZE * SCALE;
  canvas.height = BASKET_INK_BOTTOM * SCALE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  drawBasket(ctx, color, casing);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

export const BASKET_ICON = 'target-basket';
export const BASKET_ICON_SELECTED = 'target-basket-selected';

/**
 * Register the basket markers with a map.
 *
 * Two images rather than one recoloured at draw time: MapLibre can only tint an
 * icon that is an SDF, and an SDF is a single-channel silhouette — it cannot
 * carry both the casing and the stroke, which is the whole point of the glyph.
 * Two images is a few kilobytes and keeps the contrast floor.
 *
 * Idempotent, because a basemap change re-runs style installation.
 */
export function addBasketIcons(map: {
  hasImage: (id: string) => boolean;
  addImage: (id: string, image: ImageData, options?: { pixelRatio?: number }) => void;
}): void {
  const variants: [string, string, string][] = [
    [BASKET_ICON, featureColors.target.stroke, featureColors.target.casing],
    /*
     * Selected: the accent, stroke and casing both, exactly as every other
     * vector on the map does it.
     *
     * It used to keep the feature colour and invert the casing to white, which
     * worked while baskets were red. The monochrome pass made every feature
     * white and left this as a white glyph cased in white — invisible as a
     * casing, identical to the unselected glyph, so selecting a hole lit up its
     * tee, its corridor and its number and left the basket looking untouched.
     */
    [BASKET_ICON_SELECTED, featureColors.selected.stroke, featureColors.selected.casing],
  ];

  for (const [id, color, casing] of variants) {
    if (map.hasImage(id)) continue;
    const image = render(color, casing);
    if (image) map.addImage(id, image, { pixelRatio: 2 });
  }
}
