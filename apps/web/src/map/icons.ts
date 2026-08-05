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

/** Device pixels. Rendered at pixelRatio 2, so half this on screen. */
const W = 48;
const H = 60;

/**
 * The basket, in side elevation, standing on the point it marks.
 *
 * **Drawn as a silhouette, not as a line drawing.** The first version outlined
 * the band and the chains at three device pixels; at the ~24 screen pixels a
 * marker actually occupies, that resolved into a red smudge with no
 * recognisable shape. Filled masses survive being small — a wide top ring, a
 * solid tapered band, a thin pole between them — and that trio is the
 * silhouette everybody already reads as a basket.
 */
function drawBasket(ctx: CanvasRenderingContext2D, color: string, casing: string): void {
  const mid = W / 2;
  const ringY = 12;
  const bandTop = 32;
  const bandBottom = 48;
  const groundY = 54;

  /** Filled shapes, drawn with the casing stroked around them. */
  const solids: ((c: CanvasRenderingContext2D) => void)[] = [
    // Top ring, seen nearly edge-on: a bar with a slight droop at the ends.
    (c) => {
      c.moveTo(mid - 18, ringY - 3);
      c.lineTo(mid + 18, ringY - 3);
      c.lineTo(mid + 18, ringY + 3);
      c.lineTo(mid - 18, ringY + 3);
      c.closePath();
    },
    // The basket: a band tapering inwards towards its base.
    (c) => {
      c.moveTo(mid - 16, bandTop);
      c.lineTo(mid + 16, bandTop);
      c.lineTo(mid + 12, bandBottom);
      c.lineTo(mid - 12, bandBottom);
      c.closePath();
    },
  ];

  /** Thin parts, stroked. */
  const lines: ((c: CanvasRenderingContext2D) => void)[] = [
    // Pole, from the ground up through the basket to the ring.
    (c) => {
      c.moveTo(mid, groundY);
      c.lineTo(mid, ringY);
    },
    // Two chains, which is as much detail as survives at this size.
    (c) => {
      c.moveTo(mid - 11, ringY + 3);
      c.lineTo(mid - 7, bandTop);
      c.moveTo(mid + 11, ringY + 3);
      c.lineTo(mid + 7, bandTop);
    },
    // The ground line, so the marker reads as standing on its coordinate.
    (c) => {
      c.moveTo(mid - 9, groundY);
      c.lineTo(mid + 9, groundY);
    },
  ];

  /*
   * Casing first, in one pass over everything.
   *
   * Same reasoning as every vector on the map: no single colour survives the
   * range from tree canopy to sand, so a dark outline underneath is the
   * contrast floor.
   */
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = casing;

  ctx.lineWidth = 8;
  for (const path of solids) {
    ctx.beginPath();
    path(ctx);
    ctx.stroke();
  }
  ctx.lineWidth = 9;
  for (const path of lines) {
    ctx.beginPath();
    path(ctx);
    ctx.stroke();
  }

  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  for (const path of solids) {
    ctx.beginPath();
    path(ctx);
    ctx.fill();
  }
  ctx.lineWidth = 4;
  for (const path of lines) {
    ctx.beginPath();
    path(ctx);
    ctx.stroke();
  }
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
    // Selection inverts the casing to white, exactly as it does for every other
    // feature, so a selected basket is unmistakable without changing its hue.
    [BASKET_ICON_SELECTED, featureColors.target.stroke, featureColors.handle.stroke],
  ];

  for (const [id, color, casing] of variants) {
    if (map.hasImage(id)) continue;
    const image = render(color, casing);
    if (image) map.addImage(id, image, { pixelRatio: 2 });
  }
}
