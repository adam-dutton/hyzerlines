import { z } from 'zod';

import { isInstalled, type Feature } from './features.js';
import {
  findPair,
  measurePair,
  skillLevelOfTee,
  suggestParForPair,
  type Pair,
} from './pairs.js';
import { DEFAULT_SKILL_LEVEL, type SkillLevel } from './pdga.js';

/**
 * A layout: how the course is actually played.
 *
 * Not a per-hole selection map. An **ordered sequence of plays**, because a
 * layout can skip a hole entirely and can play the same hole twice — once to
 * pin A, once to pin B. Neither is expressible as "pick a tee and a pin for
 * each hole", and both are ordinary things real courses do.
 *
 * That makes the number a player sees a property of the *routing*, not of the
 * hole: it is the position in this list. `hole.number` stays as the designer's
 * name for the corridor, which is what the map labels and what survives a
 * layout being reordered.
 */

export const playSchema = z.object({
  id: z.string().min(1),
  holeId: z.string().min(1),
  teeId: z.string().min(1),
  targetId: z.string().min(1),
});

export type Play = z.infer<typeof playSchema>;

export const layoutSchema = z.object({
  id: z.string().min(1),
  name: z.string().default(''),
  /** Ordered. Index + 1 is the number a player sees. */
  plays: z.array(playSchema).default([]),
});

export type Layout = z.infer<typeof layoutSchema>;

export function createPlay(
  holeId: string,
  teeId: string,
  targetId: string,
  id = crypto.randomUUID(),
): Play {
  return playSchema.parse({ id, holeId, teeId, targetId });
}

export function createLayout(name: string, plays: Play[] = []): Layout {
  return layoutSchema.parse({ id: crypto.randomUUID(), name, plays });
}

export function layoutName(layout: Layout): string {
  return layout.name.trim() || 'Untitled layout';
}

/* ------------------------------------------------------------------------- */
/* Derived properties                                                         */
/* ------------------------------------------------------------------------- */

/**
 * The skill level this layout is played at, or null when it mixes tee colours.
 *
 * Every PDGA figure — par bands, course length ranges, throw distances — is
 * defined per skill level. A layout with blue tees on some holes and red on
 * others simply has no level, and the honest answer is null rather than a
 * plausible average. Per-play par still resolves from each play's own tee.
 */
export function layoutSkillLevel(
  layout: Layout,
  featureById: ReadonlyMap<string, Feature>,
): SkillLevel | null {
  return skillLevelOfTees(layout.plays.map((play) => featureById.get(play.teeId)));
}

/**
 * The one level a set of tees agrees on, or null.
 *
 * Null covers three different situations that all have the same honest answer:
 * no tees, tees with no colour set, and tees that disagree. In every one of
 * them there is no published range to check against, and picking a winner would
 * mean inventing a figure.
 */
export function skillLevelOfTees(tees: Iterable<Feature | undefined>): SkillLevel | null {
  const levels = new Set<SkillLevel | null>();
  for (const tee of tees) levels.add(skillLevelOfTee(tee));
  if (levels.size !== 1) return null;
  return [...levels][0] ?? null;
}

/**
 * What the course as a whole plays as.
 *
 * The active layout when it has been routed, and every tee on the course when
 * it has not. A course being drawn has tees long before it has a routing — that
 * is the normal order of work — and answering "Mixed" for a course with three
 * blue tees and no layout yet would be wrong in the most discouraging way.
 */
export function courseSkillLevel(
  layout: Layout | undefined,
  features: readonly Feature[],
  featureById: ReadonlyMap<string, Feature>,
): SkillLevel | null {
  if (layout && layout.plays.length > 0) return layoutSkillLevel(layout, featureById);
  return skillLevelOfTees(features.filter((f) => f.kind === 'tee'));
}

/**
 * Whether the layout could be played today.
 *
 * A design decision and a groundskeeping fact are different things: a layout
 * routed through a pin position that has no basket in the ground right now is
 * perfectly valid as a design and simply unplayable this week. Reported as
 * information, never as an error.
 */
export function isLayoutPlayable(
  layout: Layout,
  featureById: ReadonlyMap<string, Feature>,
): boolean {
  return layout.plays.every((play) => {
    const tee = featureById.get(play.teeId);
    const target = featureById.get(play.targetId);
    return Boolean(tee && target && isInstalled(tee) && isInstalled(target));
  });
}

export interface PlayMeasurement {
  play: Play;
  /** The number a player sees: position in the routing. */
  playedNumber: number;
  par: number | null;
  /** Effective length in meters, or null when the play is not measurable. */
  meters: number | null;
}

/**
 * Measure every play in order.
 *
 * One pass, because the scorecard, the totals and the design checks all want
 * the same numbers and computing them three times would be three chances to
 * disagree.
 */
export function measureLayout(
  layout: Layout,
  featureById: ReadonlyMap<string, Feature>,
  pairs: readonly Pair[],
): PlayMeasurement[] {
  const fallback = layoutSkillLevel(layout, featureById) ?? DEFAULT_SKILL_LEVEL;

  return layout.plays.map((play, index) => {
    const pair = findPair(pairs, play.teeId, play.targetId);
    const fairwayId = pair?.fairwayId ?? null;
    const measurement = measurePair(featureById, play.teeId, play.targetId, fairwayId);

    const par =
      pair?.parOverride ??
      suggestParForPair(featureById, play.teeId, play.targetId, fairwayId, fallback)?.par ??
      null;

    return { play, playedNumber: index + 1, par, meters: measurement.effective };
  });
}

/** Total par across the plays that have one. */
export function layoutPar(measurements: readonly PlayMeasurement[]): number {
  return measurements.reduce((total, m) => total + (m.par ?? 0), 0);
}

/** Total length across the measurable plays, in meters. */
export function layoutLength(measurements: readonly PlayMeasurement[]): number {
  return measurements.reduce((total, m) => total + (m.meters ?? 0), 0);
}
