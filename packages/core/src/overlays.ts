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
});

export type Overlays = z.infer<typeof overlaysSchema>;

export const DEFAULT_OVERLAYS: Overlays = overlaysSchema.parse({});

/** Whether anything at all is drawn over the basemap. */
export const hasOverlays = (overlays: Overlays): boolean =>
  overlays.hillshade || overlays.contours;
