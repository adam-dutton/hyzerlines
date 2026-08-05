import type { Feature } from './features.js';
import type { Hole } from './holes.js';
import type { Op } from './ops.js';
import {
  createPair,
  findPair,
  measurePair,
  suggestParForPair,
  type Pair,
  type PairMeasurement,
  type ParSuggestion,
} from './pairs.js';
import { courseSkillLevel } from './layouts.js';
import { DEFAULT_SKILL_LEVEL, type SkillLevel } from './pdga.js';
import { activeLayout, featureIndex, type Course } from './schema.js';
import {
  defaultCorridorWidths,
  fairwayCorridor,
  type Corridor,
  type CorridorWidths,
} from './geometry.js';

/**
 * One pair, fully answered.
 *
 * The document measures **pairs** — one tee to one target — but an interface has
 * to put something on screen for a hole before the designer has said which shot
 * they mean. This module is where that choice is made, once, deliberately, and
 * where every consumer reads it from.
 *
 * It replaces a temporary shim in the web app that answered every question with
 * the hole's first tee and first target. That shim was wrong the moment a hole
 * had two pins, and it was invisible: a par silently describing a shot nobody
 * asked about.
 */

export interface PairView {
  teeId: string;
  targetId: string;
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
  const featureById = featureIndex(course);
  return (
    courseSkillLevel(activeLayout(course), course.features, featureById) ?? DEFAULT_SKILL_LEVEL
  );
}

export function pairView(
  course: Course,
  teeId: string,
  targetId: string,
  featureById: ReadonlyMap<string, Feature> = featureIndex(course),
  fallback: SkillLevel = fallbackSkillLevel(course),
): PairView {
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

/**
 * Which shot to show for a hole, when only one can be shown.
 *
 * **The routing decides.** If the active layout plays this hole, the pair it
 * plays is the pair that matters — that is the shot a card would print and the
 * one a player would throw. Only when the hole is unrouted does this fall back
 * to the hole's first tee and first target, which is the best available guess
 * and no longer a pretence that a hole has one length.
 *
 * A hole played twice in one layout resolves to its first play. The scorecard
 * lists both, because it is a list of plays; a panel describing "this hole" has
 * to pick, and the first is the one with a defensible claim.
 */
export function representativePair(
  course: Course,
  hole: Hole,
): { teeId: string; targetId: string } | null {
  const routed = activeLayout(course)?.plays.find((play) => play.holeId === hole.id);
  if (routed) return { teeId: routed.teeId, targetId: routed.targetId };

  const teeId = hole.teeIds[0];
  const targetId = hole.targetIds[0];
  return teeId && targetId ? { teeId, targetId } : null;
}

/** Every tee-and-target combination a hole offers. The shots it contains. */
export function holePairings(hole: Hole): { teeId: string; targetId: string }[] {
  return hole.teeIds.flatMap((teeId) =>
    hole.targetIds.map((targetId) => ({ teeId, targetId })),
  );
}

/** The representative pair's view, or null when the hole has no measurable shot. */
export function viewHole(
  course: Course,
  hole: Hole,
  featureById: ReadonlyMap<string, Feature> = featureIndex(course),
  fallback: SkillLevel = fallbackSkillLevel(course),
): PairView | null {
  const chosen = representativePair(course, hole);
  if (!chosen) return null;
  return pairView(course, chosen.teeId, chosen.targetId, featureById, fallback);
}

/** Every hole's view in one pass, so a panel does not index features per row. */
export function viewHoles(
  course: Course,
  holes: readonly Hole[],
): Map<string, PairView | null> {
  const featureById = featureIndex(course);
  const fallback = fallbackSkillLevel(course);
  return new Map(holes.map((hole) => [hole.id, viewHole(course, hole, featureById, fallback)]));
}

export function totalPar(views: Iterable<PairView | null>): number {
  let total = 0;
  for (const view of views) total += view?.par ?? 0;
  return total;
}

export function totalLength(views: Iterable<PairView | null>): number {
  let total = 0;
  for (const view of views) total += view?.measurement.effective ?? 0;
  return total;
}

/**
 * Set — or clear — the par on a pair.
 *
 * Clearing removes the record when nothing else is on it, rather than leaving a
 * pair whose every field is empty. Sparse means sparse; a document full of blank
 * pairs would grow with every par the designer set and then thought better of.
 */
export function setPairPar(
  course: Course,
  teeId: string,
  targetId: string,
  par: number | null,
): Op {
  const pair = findPair(course.pairs, teeId, targetId);

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

/** Attach — or detach — a drawn fairway from a pair, materialising the record. */
export function setPairFairway(
  course: Course,
  teeId: string,
  targetId: string,
  fairwayId: string | null,
): Op {
  const pair = findPair(course.pairs, teeId, targetId);

  if (fairwayId === null && pair && pair.parOverride === null) {
    return { type: 'removePair', id: pair.id };
  }

  return {
    type: 'setPair',
    pair: pair ? { ...pair, fairwayId } : createPair(teeId, targetId, { fairwayId }),
  };
}

/* ------------------------------------------------------------------------- */
/* Corridors                                                                  */
/* ------------------------------------------------------------------------- */

/**
 * A fairway's corridor width, read from the tee it is thrown from.
 *
 * Per-fairway overrides win: `widthStart` and `widthEnd` on the feature let a
 * designer say what the corridor actually is, which is the point — the taper is
 * a starting position, not a measurement.
 */
export function corridorWidthsFor(
  fairway: Feature | undefined,
  tee: Feature | undefined,
): CorridorWidths {
  const teeWidth = tee?.props['width'];
  const defaults = defaultCorridorWidths(typeof teeWidth === 'number' ? teeWidth : null);

  const override = (key: string): number | null => {
    const value = fairway?.props[key];
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
  };

  return {
    atStart: override('widthStart') ?? defaults.atStart,
    atEnd: override('widthEnd') ?? defaults.atEnd,
  };
}

export interface FairwayCorridor extends Corridor {
  fairwayId: string;
}

/**
 * Every fairway's corridor, keyed by the fairway's own id.
 *
 * Walks pairs rather than features so each corridor is built against the tee it
 * actually belongs to. A fairway attached to no pair still gets a corridor — the
 * designer drew a line and deserves to see how wide it reads — using the
 * fallback width, which is what `corridorWidthsFor` returns for a missing tee.
 */
export function courseCorridors(course: Course): Map<string, FairwayCorridor> {
  const featureById = featureIndex(course);
  const teeOfFairway = new Map<string, string>();
  for (const pair of course.pairs) {
    if (pair.fairwayId) teeOfFairway.set(pair.fairwayId, pair.teeId);
  }

  const corridors = new Map<string, FairwayCorridor>();
  for (const feature of course.features) {
    if (feature.kind !== 'fairway' || feature.geometry.type !== 'line') continue;

    const teeId = teeOfFairway.get(feature.id);
    const widths = corridorWidthsFor(feature, teeId ? featureById.get(teeId) : undefined);
    const corridor = fairwayCorridor(feature.geometry.coordinates, widths);
    if (corridor) corridors.set(feature.id, { ...corridor, fairwayId: feature.id });
  }
  return corridors;
}
