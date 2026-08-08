import { z } from 'zod';

/**
 * What is drawn over the imagery.
 *
 * A different question from `display.ts`, which is about the course — the
 * fairways and putting circles the app derives from what you drew. These are
 * about the *ground*: readings of the land itself, from sources outside the
 * document, sitting between the basemap and the design.
 *
 * ## Why these live in the document
 *
 * `basemapId` already does, and this is the same kind of fact. A wooded site
 * sent to a reviewer with hillshade on was sent that way on purpose: the
 * designer is saying "the reason hole 7 doglegs is this ridge". Units are a
 * fact about the reader and live in the browser; what the map is showing is a
 * fact about the presentation and travels with the file.
 *
 * ## Why these default off, when the drawing aids default on
 *
 * A fairway corridor is the app drawing something you made. Contours are the
 * app fetching tiles from a third party and printing lines over your imagery.
 * Everything in `display` is on by default because a designer who has never
 * opened that panel should see their own work; nobody's first impression of a
 * course should be a network request they did not ask for.
 */
export const overlaysSchema = z.object({
  /**
   * Relief shading, from the elevation model.
   *
   * The one that reads as terrain at a glance rather than as data. Over aerial
   * imagery it is the difference between a green field and a green field that
   * falls twelve metres left to right.
   */
  hillshade: z.boolean().default(false),

  /**
   * Contour lines, generated in the browser from the same elevation tiles.
   *
   * Slower to read than shading and far more precise, which is the trade: you
   * turn these on when you have stopped asking "is this flat" and started
   * asking "how much does it drop between the tee and the landing zone".
   */
  contours: z.boolean().default(false),

  /**
   * How dark the shading is drawn, 0 to 1.
   *
   * The hillshade uses the Igor method with fully transparent highlights and
   * accents — see `hillshadeLayerSpec` — so the shadow is the only ink on the
   * layer, and its alpha is exactly the layer's opacity. MapLibre has no
   * `hillshade-opacity` property; this is not a workaround for that so much as
   * the same thing spelled differently.
   *
   * Defaults to 1, which is the shading as it was before this was adjustable.
   */
  hillshadeOpacity: z.number().min(0).max(1).default(1),

  /**
   * How much terrain detail the shading reads, as elevation levels dropped.
   *
   * 0 is the full model. 1 reads one zoom coarser, 2 reads two — each step
   * halving the grid and letting MapLibre interpolate back up, which is a
   * low-pass filter on the ground.
   *
   * **This is what "blur" has to mean here.** MapLibre has no blur for a
   * hillshade, and a screen-space blur is not what the problem is anyway: a 1m
   * LiDAR hillshade looks like gravel because it is resolving tree crowns and
   * truck ruts, and the fix is to read the terrain at a coarser step rather
   * than to smear the picture of it. Costs nothing — a coarser step is fewer
   * tiles.
   */
  hillshadeSoftness: z.number().int().min(0).max(2).default(0),

  /** How strongly the contour lines are drawn, 0 to 1. Scales both weights. */
  contourOpacity: z.number().min(0).max(1).default(1),

  /**
   * How much the isoline generator smooths, in levels of subsampling.
   *
   * 0 leaves the lines on the elevation grid, which at high zoom over fine data
   * makes them visibly angular — a contour is piecewise linear between cells,
   * so a 1m grid draws 1m facets. Each level interpolates the grid to twice the
   * resolution before tracing, which curves the lines without inventing
   * elevation: the extra samples are bilinear between measured ones, and no
   * contour moves to a height the data does not support.
   */
  contourSmoothing: z.number().int().min(0).max(2).default(0),
});

export type Overlays = z.infer<typeof overlaysSchema>;

/**
 * The overlays that can be switched, and the amounts that can be dialled.
 *
 * Derived from the schema rather than listed, so adding a field puts it in
 * exactly one of the two sets automatically and every consumer that must handle
 * it — the panel's control registry, the layer registry — fails to compile
 * until it does. A setting only a file can reach is the thing this prevents.
 */
export type OverlaySwitch = {
  [K in keyof Overlays]: Overlays[K] extends boolean ? K : never;
}[keyof Overlays];

export type OverlayAmount = {
  [K in keyof Overlays]: Overlays[K] extends number ? K : never;
}[keyof Overlays];

export const DEFAULT_OVERLAYS: Overlays = overlaysSchema.parse({});

/** Whether anything at all is drawn over the basemap. */
export const hasOverlays = (overlays: Overlays): boolean =>
  overlays.hillshade || overlays.contours;
