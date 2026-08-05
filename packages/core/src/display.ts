import { z } from 'zod';

import type { TargetCircleId } from './pdga.js';

/**
 * What the map draws.
 *
 * Part of the document rather than a browser preference, deliberately. Turning
 * the corridors off to read the canopy underneath is a decision about how this
 * course is presented, and a designer who sends someone a `.hyzer` of a wooded
 * site with the aids switched off meant them to see it that way. It also keeps
 * the per-hole switch and the course-wide ones in one place — splitting them
 * would put half the answer in the file and half in whichever browser last
 * touched it.
 *
 * Every switch defaults to on. A designer who has never opened this panel sees
 * everything, which is the only defensible starting point for drawing aids that
 * exist to be looked at.
 *
 * Each group is a master and its parts. `fairways` off hides both the line and
 * the corridor whatever the two below it say — that is what makes it a master
 * switch rather than a third checkbox of equal standing.
 */
export const displaySchema = z.object({
  /** Master switch for both halves of every fairway. */
  fairways: z.boolean().default(true),
  /** The centreline: where the shot goes. */
  fairwayLines: z.boolean().default(true),
  /** The corridor: how much room it has. */
  fairwayAreas: z.boolean().default(true),

  /** Master switch for all three rings around every target. */
  circles: z.boolean().default(true),
  /*
   * Keyed by TargetCircleId, so a new circle in `TARGET_CIRCLES` is a compile
   * error here rather than a ring that silently cannot be switched off.
   */
  bullseye: z.boolean().default(true),
  c1: z.boolean().default(true),
  c2: z.boolean().default(true),
});

export type Display = z.infer<typeof displaySchema>;

export const DEFAULT_DISPLAY: Display = displaySchema.parse({});

export const showsFairwayLines = (display: Display): boolean =>
  display.fairways && display.fairwayLines;

export const showsFairwayAreas = (display: Display): boolean =>
  display.fairways && display.fairwayAreas;

export const showsCircle = (display: Display, id: TargetCircleId): boolean =>
  display.circles && display[id];
