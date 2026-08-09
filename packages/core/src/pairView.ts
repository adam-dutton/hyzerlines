import { createFeature, type Feature } from './features.js';
import type { Position } from './geo.js';
import type { Hole } from './holes.js';
import { anchorOf, bearing, distance, pathLength } from './measure.js';
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
  fromLocal,
  planeAt,
  toLocal,
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

/**
 * Elevation gains a view can use, keyed by `pairElevationKey`.
 *
 * Passed in rather than looked up, because elevation is not in the document:
 * it comes from tiles the browser holds, is asynchronous to read, and is
 * absent entirely until somebody imports a survey. Core stays synchronous and
 * pure; the web app decides what is known and hands it over.
 */
export type PairElevations = ReadonlyMap<string, number>;

/** One pair's key in a `PairElevations` map. */
export const pairElevationKey = (teeId: string, targetId: string): string =>
  `${teeId}:${targetId}`;

export function pairView(
  course: Course,
  teeId: string,
  targetId: string,
  featureById: ReadonlyMap<string, Feature> = featureIndex(course),
  fallback: SkillLevel = fallbackSkillLevel(course),
  elevations?: PairElevations,
): PairView {
  const pair = findPair(course.pairs, teeId, targetId);
  const fairwayId = pair?.fairwayId ?? null;
  const elevationGain = elevations?.get(pairElevationKey(teeId, targetId)) ?? null;
  const suggestion = suggestParForPair(
    featureById,
    teeId,
    targetId,
    fairwayId,
    fallback,
    elevationGain,
  );

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

/**
 * Which shot a hole is being shown as: the designer's pick, else the
 * representative one.
 *
 * **The pick is validated, not trusted.** It is interface state and the
 * document moves underneath it — delete the pin you were measuring to and the
 * pick names a target the hole no longer has. Falling back is the only honest
 * answer available; honouring it would leave the panel, the card and the map
 * all describing a throw that does not exist.
 *
 * The one place that resolution happens, so the map's corridor, the card's
 * length and the hole panel's par are the same shot by construction rather
 * than by three functions agreeing.
 */
export function chosenPair(
  course: Course,
  hole: Hole,
  choices?: FairwayChoices,
): { teeId: string; targetId: string } | null {
  const choice = choices?.get(hole.id);
  if (
    choice &&
    hole.teeIds.includes(choice.teeId) &&
    hole.targetIds.includes(choice.targetId)
  ) {
    return choice;
  }
  return representativePair(course, hole);
}

/** Every tee-and-target combination a hole offers. The shots it contains. */
export function holePairings(hole: Hole): { teeId: string; targetId: string }[] {
  return hole.teeIds.flatMap((teeId) =>
    hole.targetIds.map((targetId) => ({ teeId, targetId })),
  );
}

/** The chosen pair's view, or null when the hole has no measurable shot. */
export function viewHole(
  course: Course,
  hole: Hole,
  featureById: ReadonlyMap<string, Feature> = featureIndex(course),
  fallback: SkillLevel = fallbackSkillLevel(course),
  elevations?: PairElevations,
  choices?: FairwayChoices,
): PairView | null {
  const chosen = chosenPair(course, hole, choices);
  if (!chosen) return null;
  return pairView(course, chosen.teeId, chosen.targetId, featureById, fallback, elevations);
}

/** Every hole's view in one pass, so a panel does not index features per row. */
export function viewHoles(
  course: Course,
  holes: readonly Hole[],
  elevations?: PairElevations,
  choices?: FairwayChoices,
): Map<string, PairView | null> {
  const featureById = featureIndex(course);
  const fallback = fallbackSkillLevel(course);
  return new Map(
    holes.map((hole) => [
      hole.id,
      viewHole(course, hole, featureById, fallback, elevations, choices),
    ]),
  );
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
/**
 * The default straight fairway line, tee to target — three equal segments
 * rather than one.
 *
 * A single segment has exactly one vertex handle, sitting at its own
 * midpoint — which is also where the hole's number sits, since
 * `holeLabelPosition` places it at the midpoint of the shot. The handle and
 * the label then compete for the same pixel, and the handle usually loses:
 * it is the smaller of the two and ends up hidden underneath.
 *
 * Splitting the derived line into thirds gives every hole two solid, visible
 * handles a third of the way in from each end — nowhere near the label — so
 * there is always an obvious point to grab to start routing a fairway.
 * Computed on the local tangent plane so the interior points are exactly
 * collinear with the ends; interpolating lng/lat directly would leave them a
 * hair off the straight line the corridor buffer is built from.
 */
const DEFAULT_FAIRWAY_SEGMENTS = 3;

function defaultFairwayLine(tee: Position, target: Position): Position[] {
  const plane = planeAt(tee);
  const from = toLocal(plane, tee);
  const to = toLocal(plane, target);
  const line: Position[] = [];
  for (let i = 0; i <= DEFAULT_FAIRWAY_SEGMENTS; i++) {
    const t = i / DEFAULT_FAIRWAY_SEGMENTS;
    line.push(
      fromLocal(plane, [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t]),
    );
  }
  return line;
}

/**
 * The centreline a shot actually follows: the stored line, or tee to target.
 *
 * The one place that question is answered. `courseFairways` uses it to build
 * what the map draws, and the elevation profile uses it to decide what ground
 * to sample — and those two must agree, or the chart would describe a straight
 * line over a ridge while the map showed a fairway routed around it.
 *
 * Null when either end is missing. A shot needs both.
 */
export function fairwayLine(
  course: Course,
  teeId: string,
  targetId: string,
  featureById: ReadonlyMap<string, Feature> = featureIndex(course),
): Position[] | null {
  const tee = featureById.get(teeId);
  const target = featureById.get(targetId);
  if (!tee || !target) return null;

  const pair = findPair(course.pairs, teeId, targetId);
  const stored = pair?.fairwayId ? featureById.get(pair.fairwayId) : undefined;

  /*
   * anchorOf a tee is its stored point, which is the front centre of the pad —
   * the same point hole length is measured from. The straight line therefore
   * starts exactly where the measurement does.
   */
  return stored?.geometry.type === 'line'
    ? [...stored.geometry.coordinates]
    : defaultFairwayLine(anchorOf(tee), anchorOf(target));
}

export function courseFairways(course: Course, choices?: FairwayChoices): HoleFairway[] {
  const featureById = featureIndex(course);
  const holeOfPair = new Map<string, string>();
  const fairways: HoleFairway[] = [];
  const seen = new Set<string>();

  const key = (teeId: string, targetId: string) => `${teeId} ${targetId}`;

  const add = (holeId: string | null, teeId: string, targetId: string) => {
    if (seen.has(key(teeId, targetId))) return;

    const tee = featureById.get(teeId);
    const line = fairwayLine(course, teeId, targetId, featureById);
    if (!tee || !line) return;

    const pair = findPair(course.pairs, teeId, targetId);
    const stored = pair?.fairwayId ? featureById.get(pair.fairwayId) : undefined;

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
    const chosen = chosenPair(course, hole, choices);
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

/** A shot a hole offers but is not currently being shown as. */
export interface AlternativeShot {
  holeId: string;
  teeId: string;
  targetId: string;
  /** The centreline, so it can be drawn without re-deriving it. */
  line: Position[];
}

/**
 * The shots a hole contains that it is not currently being drawn as.
 *
 * **A cross, not a grid.** A hole with three tees and three pins holds nine
 * shots, and eight faint lines down one corridor of land is not a drawing of
 * anything. What a designer is actually comparing is one variable at a time:
 * every tee to the pin in play, and every pin from the tee in play. Three tees
 * and three pins is four alternatives rather than eight, and each of them
 * differs from the chosen shot in exactly one end.
 *
 * The tee half is also the scorecard's row read onto the ground — the card
 * lists every tee measured to the same pin, and these are those measurements as
 * lines. The two views agreeing is not a coincidence to be maintained; they
 * resolve the pin through the same `chosenPair`.
 *
 * Shots with a fairway the designer has shaped are left out. `courseFairways`
 * already returns those, in full, with the corridor and width they were given —
 * drawing them again as a faint line would be a second, thinner copy of a line
 * already on screen.
 */
export function alternativeShots(course: Course, choices?: FairwayChoices): AlternativeShot[] {
  const featureById = featureIndex(course);
  const shots: AlternativeShot[] = [];

  for (const hole of course.holes) {
    const chosen = chosenPair(course, hole, choices);
    if (!chosen) continue;

    const pairings = [
      ...hole.teeIds
        .filter((teeId) => teeId !== chosen.teeId)
        .map((teeId) => ({ teeId, targetId: chosen.targetId })),
      ...hole.targetIds
        .filter((targetId) => targetId !== chosen.targetId)
        .map((targetId) => ({ teeId: chosen.teeId, targetId })),
    ];

    for (const { teeId, targetId } of pairings) {
      if (findPair(course.pairs, teeId, targetId)?.fairwayId) continue;
      const line = fairwayLine(course, teeId, targetId, featureById);
      if (line) shots.push({ holeId: hole.id, teeId, targetId, line });
    }
  }

  return shots;
}

/**
 * Which way a tee faces by default: down the first leg of its fairway.
 *
 * The same figure the map derives when a tee carries no `bearing` of its own —
 * see `fairwayBearings` in the web app's `derived.ts`. Exported because the
 * inspector needs it for the opposite reason: to turn the default into a
 * stored value the moment somebody unticks "align to fairway", so the field
 * they are about to edit opens with the angle already on screen rather than
 * blank.
 *
 * Null when the tee has no fairway to face down. There is nothing to fall back
 * to, and a bearing of 0 would be a claim about north that nobody made.
 */
export function fairwayBearingFor(course: Course, teeId: string): number | null {
  for (const fairway of courseFairways(course)) {
    if (fairway.teeId !== teeId) continue;
    const [from, to] = fairway.line;
    if (from && to) return bearing(from, to);
  }
  return null;
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
