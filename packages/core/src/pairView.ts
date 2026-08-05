import { createFeature, type Feature } from './features.js';
import type { Position } from './geo.js';
import type { Hole } from './holes.js';
import { anchorOf, distance, pathLength } from './measure.js';
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

/**
 * A fairway, drawn or not.
 *
 * **Every measurable pair has one.** A fairway is not something a designer draws
 * from scratch — a tee and a target already imply the line between them, and
 * making someone trace it by hand to see their own hole was busywork with a
 * blank map as the reward for skipping it.
 *
 * So the line is derived, straight, from the moment both ends exist. It becomes
 * a stored feature only when the designer bends it, which is the same sparseness
 * pairs already have: a record appears when it carries something the geometry
 * cannot work out on its own.
 */
export interface HoleFairway {
  holeId: string | null;
  teeId: string;
  targetId: string;
  /** The stored feature, once the line has been shaped. Null while straight. */
  fairwayId: string | null;
  /** The centreline in use: the stored line, or tee to target. */
  line: Position[];
  corridor: Corridor | null;
}

/**
 * Which shot each hole's fairway is drawn for.
 *
 * Keyed by hole id, so the editor can say "the panel is showing pin B on hole 4"
 * and have the map agree. Anything absent falls back to `representativePair`.
 */
export type FairwayChoices = ReadonlyMap<string, { teeId: string; targetId: string }>;

/**
 * Every fairway the course should show.
 *
 * **One per hole, not one per pairing.** A three-tee, three-pin hole contains
 * nine shots, and drawing nine overlapping corridors down one corridor of land
 * would be unreadable — so each hole draws the shot it is currently being
 * presented as, which is the same one the panels measure. Any pair the designer
 * has actually shaped is drawn as well, so bending a line never makes it vanish
 * when the picker moves.
 */
export function courseFairways(course: Course, choices?: FairwayChoices): HoleFairway[] {
  const featureById = featureIndex(course);
  const holeOfPair = new Map<string, string>();
  const fairways: HoleFairway[] = [];
  const seen = new Set<string>();

  const key = (teeId: string, targetId: string) => `${teeId} ${targetId}`;

  const add = (holeId: string | null, teeId: string, targetId: string) => {
    if (seen.has(key(teeId, targetId))) return;

    const tee = featureById.get(teeId);
    const target = featureById.get(targetId);
    if (!tee || !target) return;

    const pair = findPair(course.pairs, teeId, targetId);
    const stored = pair?.fairwayId ? featureById.get(pair.fairwayId) : undefined;

    /*
     * anchorOf a tee is its stored point, which is the front centre of the pad —
     * the same point hole length is measured from. The straight line therefore
     * starts exactly where the measurement does.
     */
    const line =
      stored?.geometry.type === 'line'
        ? [...stored.geometry.coordinates]
        : [anchorOf(tee), anchorOf(target)];

    seen.add(key(teeId, targetId));
    fairways.push({
      holeId,
      teeId,
      targetId,
      fairwayId: stored?.id ?? null,
      line,
      corridor: fairwayCorridor(line, corridorWidthsFor(stored, tee)),
    });
  };

  for (const hole of course.holes) {
    for (const pairing of holePairings(hole)) {
      holeOfPair.set(key(pairing.teeId, pairing.targetId), hole.id);
    }
    const chosen = choices?.get(hole.id) ?? representativePair(course, hole);
    if (chosen) add(hole.id, chosen.teeId, chosen.targetId);
  }

  // Shaped lines the picker is not currently pointing at. The designer put work
  // into these; they do not disappear because the panel moved to another pin.
  for (const pair of course.pairs) {
    if (!pair.fairwayId) continue;
    add(holeOfPair.get(key(pair.teeId, pair.targetId)) ?? null, pair.teeId, pair.targetId);
  }

  return fairways;
}

/**
 * Where a hole's number belongs on the map.
 *
 * The midpoint of the shot rather than the centroid of everything the hole owns.
 * A centroid drifts towards whichever end has more features — three tees and one
 * pin pulls it back onto the pad — and it lands on top of the corridor it is
 * meant to label. The midpoint of the fairway sits in open ground, moves with
 * the hole, and reads as belonging to the throw.
 *
 * Falls back to the centroid of whatever the hole does have when there is no
 * shot yet, so a hole with only a tee is still findable.
 */
export function holeLabelPosition(
  course: Course,
  hole: Hole,
  fairway?: HoleFairway,
): Position | null {
  const line = fairway?.line;
  if (line && line.length >= 2) {
    // Halfway along the ground, not halfway along the vertex list: a dogleg's
    // middle vertex can sit near one end.
    const total = pathLength(line);
    let walked = 0;
    for (let i = 1; i < line.length; i++) {
      const step = distance(line[i - 1]!, line[i]!);
      if (walked + step >= total / 2) {
        const t = step === 0 ? 0 : (total / 2 - walked) / step;
        return [
          line[i - 1]![0] + (line[i]![0] - line[i - 1]![0]) * t,
          line[i - 1]![1] + (line[i]![1] - line[i - 1]![1]) * t,
        ];
      }
      walked += step;
    }
  }

  const featureById = featureIndex(course);
  const owned = [...hole.teeIds, ...hole.targetIds]
    .map((id) => featureById.get(id))
    .filter((f): f is Feature => f !== undefined);
  if (owned.length === 0) return null;

  const anchors = owned.map(anchorOf);
  return [
    anchors.reduce((sum, p) => sum + p[0], 0) / anchors.length,
    anchors.reduce((sum, p) => sum + p[1], 0) / anchors.length,
  ];
}

/** Which hole a feature belongs to, for click-to-select-the-hole on the map. */
export function holeOfFeature(course: Course, featureId: string): Hole | undefined {
  return course.holes.find(
    (hole) =>
      hole.teeIds.includes(featureId) ||
      hole.targetIds.includes(featureId) ||
      course.pairs.some(
        (pair) =>
          pair.fairwayId === featureId &&
          hole.teeIds.includes(pair.teeId) &&
          hole.targetIds.includes(pair.targetId),
      ),
  );
}

/**
 * Turn a derived fairway into a stored one, at the moment it is first shaped.
 *
 * One batch, because it is one action: the feature and the pair record that
 * points at it have to arrive together or undo would leave a pair referencing
 * nothing.
 *
 * `gesture` ties the whole drag — this batch and every geometry edit after it —
 * into a single undo entry, so a slow frame mid-drag cannot split the bend from
 * the fairway it created.
 */
export function shapeFairway(
  course: Course,
  teeId: string,
  targetId: string,
  line: Position[],
  holeId: string | null = null,
  gesture?: string,
): Op {
  const stamp = gesture === undefined ? {} : { gesture };
  const existing = findPair(course.pairs, teeId, targetId)?.fairwayId;

  if (existing) {
    return {
      type: 'setGeometry',
      id: existing,
      geometry: { type: 'line', coordinates: line },
      ...stamp,
    };
  }

  const fairway = createFeature('fairway', { type: 'line', coordinates: line }, { holeId });
  return {
    type: 'batch',
    ops: [
      { type: 'addFeature', feature: fairway },
      setPairFairway(course, teeId, targetId, fairway.id),
    ],
    ...stamp,
  };
}
