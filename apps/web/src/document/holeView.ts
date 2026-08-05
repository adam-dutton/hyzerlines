import {
  createPair,
  featureIndex,
  findPair,
  measurePair,
  suggestParForPair,
  activeLayout,
  layoutSkillLevel,
  DEFAULT_SKILL_LEVEL,
  type Course,
  type Feature,
  type Hole,
  type Op,
  type Pair,
  type PairMeasurement,
  type ParSuggestion,
  type SkillLevel,
} from '@hyzerlines/core';

/**
 * One hole, reduced to a single answer.
 *
 * The document now measures **pairs** — one tee to one target — because a hole
 * with three tees and three pins is nine different shots. The interface has not
 * caught up yet: the scorecard and the properties panel still ask a hole for
 * *its* length and *its* par, which is only a well-formed question when you say
 * which tee and which pin.
 *
 * This picks the first of each and answers as if that were the hole, which is
 * exactly what the app did before the model changed. It is a deliberate,
 * temporary narrowing, and it is confined to this file so that the pair picker
 * in PR 6 can delete it rather than hunt for the assumption in six components.
 */

export interface HoleView {
  teeId: string | null;
  targetId: string | null;
  /** The stored record, when the pair has one. Pairs are sparse. */
  pair: Pair | undefined;
  measurement: PairMeasurement;
  suggestion: ParSuggestion | null;
  /** The par in force: the override if set, else the suggestion, else null. */
  par: number | null;
  overridden: boolean;
}

/** The level to fall back on when a tee carries no colour of its own. */
export function fallbackSkillLevel(course: Course): SkillLevel {
  const layout = activeLayout(course);
  const featureById = featureIndex(course);
  return (layout && layoutSkillLevel(layout, featureById)) ?? DEFAULT_SKILL_LEVEL;
}

export function viewHole(
  course: Course,
  hole: Hole,
  featureById: ReadonlyMap<string, Feature> = featureIndex(course),
  fallback: SkillLevel = fallbackSkillLevel(course),
): HoleView {
  const teeId = hole.teeIds[0] ?? null;
  const targetId = hole.targetIds[0] ?? null;

  if (!teeId || !targetId) {
    return {
      teeId,
      targetId,
      pair: undefined,
      measurement: { straight: null, routed: null, effective: null },
      suggestion: null,
      par: null,
      overridden: false,
    };
  }

  const pair = findPair(course.pairs, teeId, targetId);
  const fairwayId = pair?.fairwayId ?? null;
  const suggestion = suggestParForPair(featureById, teeId, targetId, fairwayId, fallback);

  return {
    teeId,
    targetId,
    pair,
    measurement: measurePair(featureById, teeId, targetId, fairwayId),
    suggestion,
    par: pair?.parOverride ?? suggestion?.par ?? null,
    overridden: pair?.parOverride != null,
  };
}

/** Every hole's view in one pass, so the panel does not index features per row. */
export function viewHoles(course: Course, holes: readonly Hole[]): Map<string, HoleView> {
  const featureById = featureIndex(course);
  const fallback = fallbackSkillLevel(course);
  return new Map(holes.map((hole) => [hole.id, viewHole(course, hole, featureById, fallback)]));
}

export function totalPar(views: Iterable<HoleView>): number {
  let total = 0;
  for (const view of views) total += view.par ?? 0;
  return total;
}

export function totalLength(views: Iterable<HoleView>): number {
  let total = 0;
  for (const view of views) total += view.measurement.effective ?? 0;
  return total;
}

/**
 * Set — or clear — the par on a hole's primary pair.
 *
 * Clearing means removing the record when nothing else is on it, rather than
 * leaving a pair whose every field is empty. Sparse means sparse; a document
 * full of blank pairs would grow with every par the designer set and then
 * thought better of.
 */
export function setHolePar(course: Course, hole: Hole, par: number | null): Op | null {
  const { teeId, targetId, pair } = viewHole(course, hole);
  if (!teeId || !targetId) return null;

  if (par === null && pair && pair.fairwayId === null) {
    return { type: 'removePair', id: pair.id };
  }

  return {
    type: 'setPair',
    pair: pair
      ? { ...pair, parOverride: par }
      : createPair(teeId, targetId, { parOverride: par }),
  };
}
