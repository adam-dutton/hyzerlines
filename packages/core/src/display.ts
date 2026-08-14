import { z } from 'zod';

import type { FeatureKind } from './features.js';
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
/**
 * One switch per kind of thing drawn on the course.
 *
 * Spelled out key by key rather than generated from `FeatureKind`, so adding a
 * kind is a **compile error here** rather than a feature the map can draw and
 * this panel has no switch for. That is the same discipline `TARGET_CIRCLES`
 * enforces on the rings, and it exists because the failure is silent: nobody
 * notices a missing switch until somebody wants to turn that thing off.
 *
 * `fairway` is absent on purpose. It is not one switch but three — the pair
 * below already carries a master and its line and corridor halves — and adding
 * a fourth of equal standing would make two controls quietly fight over the
 * same geometry.
 *
 * All default on. A designer who has never opened the panel sees everything
 * they have drawn, which is the only defensible start for a drawing.
 */
const kindVisibilitySchema = z.object({
  tee: z.boolean().default(true),
  target: z.boolean().default(true),
  mando: z.boolean().default(true),
  dropzone: z.boolean().default(true),
  ob: z.boolean().default(true),
  hazard: z.boolean().default(true),
  casualArea: z.boolean().default(true),
  requiredRelief: z.boolean().default(true),
  boundary: z.boolean().default(true),
  notedArea: z.boolean().default(true),
  notedPoint: z.boolean().default(true),
  path: z.boolean().default(true),
  water: z.boolean().default(true),
  terrain: z.boolean().default(true),
});

/** Every kind that has its own switch. `fairway` is governed by the trio above. */
export type SwitchableKind = keyof z.infer<typeof kindVisibilitySchema>;

/**
 * The switchable kinds, in the order a panel should list them.
 *
 * Read off the schema rather than written out a second time, so the list and
 * the model cannot disagree about which kinds exist — the order is the one the
 * keys are declared in above.
 */
export const SWITCHABLE_KINDS = Object.keys(
  kindVisibilitySchema.shape,
) as readonly SwitchableKind[];

/*
 * The compile-time half of the promise above: this stops typechecking the
 * moment `FeatureKind` gains a member with no switch, and the error names the
 * kind that was forgotten. Types only — nothing here reaches the bundle.
 */
type AssertNever<T extends never> = T;
export type _EveryKindHasASwitch = AssertNever<
  Exclude<FeatureKind, SwitchableKind | 'fairway'>
>;

export const displaySchema = z.object({
  /**
   * Per-kind visibility. See `kindVisibilitySchema`.
   *
   * Nested rather than flattened into the fields below, so a kind called
   * `circles` or `fairways` could never collide with a master switch — and so
   * the panel can render the list from one object instead of a hand-kept map.
   */
  kinds: kindVisibilitySchema.default({}),

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

/**
 * Whether a feature of this kind is drawn at all.
 *
 * Fairways answer through their own trio, and answer `true` here so a caller
 * filtering a mixed list does not have to special-case the one kind that is
 * governed elsewhere — the fairway layers read `showsFairwayLines` and
 * `showsFairwayAreas` themselves.
 */
export const showsKind = (display: Display, kind: FeatureKind): boolean =>
  kind === 'fairway' ? true : display.kinds[kind];
