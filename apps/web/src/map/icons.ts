import { feature as featureColors } from '@hyzerlines/design';

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
 */

/**
 * The basket marker, drawn from the same artwork as the toolbar icon.
 *
 * It used to be a hand-built silhouette on this canvas — a bar, a tapered band,
 * two stroked chains — invented here because an outlined version had smudged at
 * marker size. That is two drawings of one object, and they had already drifted:
 * the icon grew a rim and a pole to the ground, and the marker did not.
 *
 * `Path2D` takes SVG path data directly, so the icon's own paths can be filled
 * onto a canvas at any scale. One drawing, two renderers.
 */
const ART_WIDTH = 23;
const ART_HEIGHT = 24;

/**
 * How much bigger than the artwork the marker is drawn.
 *
 * The art's thinnest parts — the chains, and the pole — are one unit wide. At
 * `pixelRatio: 2` a scale of 3 puts those at three device pixels, which is 1.5
 * on screen: thick enough to hold their colour against imagery, where two
 * device pixels had left the chains translucent at the edges.
 */
const SCALE = 3;

/** Device pixels. Rendered at pixelRatio 2, so half this on screen. */
const W = ART_WIDTH * SCALE;
const H = ART_HEIGHT * SCALE;

/**
 * The icon's paths, verbatim.
 *
 * Copied rather than imported because this file runs against a canvas and that
 * one returns JSX; the shared thing between them is the path data, and a string
 * is the only form both can use. They are checked against each other by a test
 * rather than by hoping.
 */
export const BASKET_PATHS: readonly string[] = [
  'M6 6V5.5H7V6C7 7.43159 7.36137 9.2413 7.96192 10.6826C8.26222 11.4033 8.61102 12.0034 8.98145 12.415C9.3553 12.8304 9.69919 13 10 13V14C9.30084 14 8.7072 13.607 8.23731 13.085C7.76401 12.5591 7.36276 11.8466 7.03809 11.0674C6.38866 9.50871 6 7.56839 6 6Z',
  'M17 6V5.5H16V6C16 7.43159 15.6386 9.2413 15.0381 10.6826C14.7378 11.4033 14.389 12.0034 14.0186 12.415C13.6447 12.8304 13.3008 13 13 13V14C13.6992 14 14.2928 13.607 14.7627 13.085C15.236 12.5591 15.6372 11.8466 15.9619 11.0674C16.6114 9.50871 17 7.56839 17 6Z',
  'M5 2H6V6H5V2Z',
  'M6 3V2H17V3L6 3Z',
  'M6 6V5L17 5V6H6Z',
  'M18.5 13C18.6607 13 18.8113 13.0776 18.9053 13.208C18.9992 13.3384 19.0254 13.5058 18.9746 13.6582L17.9746 16.6582C17.9066 16.8624 17.7152 17 17.5 17H5.5C5.28479 17 5.09345 16.8624 5.02539 16.6582L4.02539 13.6582C3.97458 13.5058 4.0008 13.3384 4.09473 13.208C4.1887 13.0776 4.33928 13 4.5 13H18.5ZM5.86035 16H17.1397L17.8057 14H5.19434L5.86035 16Z',
  'M17 2H18V6H17V2Z',
  'M11 6H12V22H11V6Z',
];

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
  const paths = BASKET_PATHS.map((d) => new Path2D(d));

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
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  drawBasket(ctx, color, casing);
  return ctx.getImageData(0, 0, W, H);
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
