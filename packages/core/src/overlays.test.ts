import { describe, expect, it } from 'vitest';

import { DEFAULT_OVERLAYS, hasOverlays, overlaysSchema } from './overlays.js';
/**
 * The adjustments.
 *
 * Every one of these has a default that reproduces the appearance from before
 * it was adjustable, which is what lets an existing document open unchanged —
 * a course saved with hillshade on should look the way its author left it, not
 * pick up whatever we later decided was a nicer starting point.
 */
describe('overlay adjustments', () => {
  it('defaults to the appearance that existed before them', () => {
    expect(DEFAULT_OVERLAYS.hillshadeOpacity).toBe(1);
    expect(DEFAULT_OVERLAYS.contourOpacity).toBe(1);
    expect(DEFAULT_OVERLAYS.hillshadeSoftness).toBe(0);
    expect(DEFAULT_OVERLAYS.contourSmoothing).toBe(0);
  });

  it('fills them in for a document written before they existed', () => {
    const parsed = overlaysSchema.parse({ hillshade: true, contours: true });
    expect(parsed.hillshadeOpacity).toBe(1);
    expect(parsed.hillshadeSoftness).toBe(0);
    expect(parsed.contourOpacity).toBe(1);
    expect(parsed.contourSmoothing).toBe(0);
  });

  it('keeps opacities inside 0 and 1', () => {
    expect(overlaysSchema.safeParse({ hillshadeOpacity: 1.5 }).success).toBe(false);
    expect(overlaysSchema.safeParse({ contourOpacity: -0.1 }).success).toBe(false);
    expect(overlaysSchema.parse({ hillshadeOpacity: 0 }).hillshadeOpacity).toBe(0);
  });

  /*
   * Whole steps only. Each one halves the elevation grid, so there is nothing
   * between them — a slider offering tenths would mostly do nothing, and a
   * stored 1.4 would be a number the renderer has to round behind the reader's
   * back.
   */
  it('takes softness and smoothing as whole steps within range', () => {
    expect(overlaysSchema.safeParse({ hillshadeSoftness: 1.5 }).success).toBe(false);
    expect(overlaysSchema.safeParse({ contourSmoothing: 3 }).success).toBe(false);
    expect(overlaysSchema.safeParse({ hillshadeSoftness: -1 }).success).toBe(false);
    expect(overlaysSchema.parse({ contourSmoothing: 2 }).contourSmoothing).toBe(2);
  });

  /*
   * The adjustments are not switches. `hasOverlays` decides whether the
   * elevation credit appears in the attribution, and an opacity of zero still
   * means the layer is on and its tiles are being fetched — the credit is owed
   * for the request, not for the pixels.
   */
  it('does not confuse an adjustment with being switched on', () => {
    expect(hasOverlays(overlaysSchema.parse({ hillshadeOpacity: 0.5 }))).toBe(false);
    expect(hasOverlays(overlaysSchema.parse({ hillshade: true, hillshadeOpacity: 0 }))).toBe(
      true,
    );
  });
});
