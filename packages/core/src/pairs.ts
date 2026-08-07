import { z } from 'zod';

import type { Feature } from './features.js';
import { anchorOf, distance, pathLength } from './measure.js';
import {
  effectiveLength,
  parBoundariesMeters,
  parForLength,
  SKILL_LEVELS,
  SKILL_LEVEL_INFO,
  type SkillLevel,
} from './pdga.js';

/**
 * A pair: one tee to one target.
 *
 * **This is the unit of measurement.** Not the hole.
 *
 * A hole with three tees and three pin positions is nine different shots, with
 * nine lengths and potentially nine pars. Attaching par to the hole forces a
 * lie in every one of those cases — it is only ever true for whichever
 * combination happens to be selected. So distance, effective length, elevation
 * change and par all belong here, and the hole becomes a container for the
 * tees and targets that form these pairs.
 *
 * Pairs are stored **sparsely**. A pair only needs a record once it carries
 * something the geometry cannot derive: a par the designer overrode, or a
 * fairway they drew. Every other pair is implied by its hole's tees and
 * targets, measured as a straight line, and costs nothing.
 */

export const pairSchema = z.object({
  id: z.string().min(1),
  teeId: z.string().min(1),
  targetId: z.string().min(1),
  /**
   * The designer's par, when they disagree with the suggestion.
   *
   * On the pair rather than the play, because par is a property of the shot and
   * not of the routing. The same tee and target in two different layouts is the
   * same throw, and setting it twice would be a bug waiting to happen.
   */
  parOverride: z.number().int().min(2).max(6).nullable().default(null),
  /**
   * The routed line for this pairing.
   *
   * Null means "not drawn yet" — measure the straight line. The feature is
   * materialised on the first edit rather than eagerly, because a three-tee,
   * three-pin hole would otherwise create nine empty fairways the moment you
   * place the third pin.
   */
  fairwayId: z.string().nullable().default(null),
});

export type Pair = z.infer<typeof pairSchema>;

export function createPair(
  teeId: string,
  targetId: string,
  overrides: Partial<Pair> = {},
): Pair {
  return pairSchema.parse({
    id: crypto.randomUUID(),
    teeId,
    targetId,
    parOverride: null,
    fairwayId: null,
    ...overrides,
  });
}

/** The stored pair for a tee and target, if one exists. */
export function findPair(
  pairs: readonly Pair[],
  teeId: string,
  targetId: string,
): Pair | undefined {
  return pairs.find((p) => p.teeId === teeId && p.targetId === targetId);
}

/* ------------------------------------------------------------------------- */
/* Measurement                                                                */
/* ------------------------------------------------------------------------- */

export interface PairMeasurement {
  /** Straight line, tee front to target. Null when either end is missing. */
  straight: number | null;
  /** Along the drawn fairway, when one exists. */
  routed: number | null;
  /**
   * What the pair actually plays.
   *
   * [ELEMENTS] p2: "Hole length is measured from front of the tee to the target
   * along the fairway route the designer intended players of that skill level
   * to throw. For doglegs or water carries, the only time the straight line,
   * crow flies, measurement should be used is if the designer intended players
   * ... to throw over the treetops."
   */
  effective: number | null;
}

interface Ends {
  tee: Feature | undefined;
  target: Feature | undefined;
  fairway: Feature | undefined;
}

const endsOf = (
  featureById: ReadonlyMap<string, Feature>,
  teeId: string,
  targetId: string,
  fairwayId: string | null,
): Ends => ({
  tee: featureById.get(teeId),
  target: featureById.get(targetId),
  fairway: fairwayId ? featureById.get(fairwayId) : undefined,
});

export function measurePair(
  featureById: ReadonlyMap<string, Feature>,
  teeId: string,
  targetId: string,
  fairwayId: string | null = null,
): PairMeasurement {
  const { tee, target, fairway } = endsOf(featureById, teeId, targetId, fairwayId);

  /*
   * anchorOf a tee is its stored point, which is the FRONT CENTRE of the pad —
   * see TEEING_AREA in pdga.ts. That is exactly the point hole length is
   * measured from, so no adjustment is needed here.
   */
  const straight = tee && target ? distance(anchorOf(tee), anchorOf(target)) : null;

  const routed =
    fairway && fairway.geometry.type === 'line'
      ? pathLength(fairway.geometry.coordinates)
      : null;

  return { straight, routed, effective: routed ?? straight };
}

/* ------------------------------------------------------------------------- */
/* Par                                                                        */
/* ------------------------------------------------------------------------- */

export interface ParFactor {
  label: string;
  effect: 'lengthens' | 'shortens' | 'neutral';
}

export interface ParSuggestion {
  par: number;
  effectiveMeters: number;
  measuredMeters: number;
  skillLevel: SkillLevel;
  factors: ParFactor[];
  /** True when the pair is close enough to a band boundary to be arguable. */
  borderline: boolean;
}

/**
 * Within this margin of a band boundary, the call is genuinely arguable.
 *
 * Ours, not the PDGA's — the document publishes hard boundaries and no
 * tolerance. It exists because a hole one metre inside a boundary is not
 * meaningfully different from one metre outside it, and saying so is more
 * honest than presenting a coin-flip as a fact. 15 m is roughly a putt.
 */
const BORDERLINE_MARGIN_M = 15;

/**
 * The skill level a tee is built for, from its colour.
 *
 * The colour *is* the skill level — [ELEMENTS] p3: "The designated color for
 * each set of tees ... should match one of the four recognized player skill
 * levels that set of tees was designed for: Gold, Blue, White or Red."
 */
export function skillLevelOfTee(tee: Feature | undefined): SkillLevel | null {
  const color = tee?.props['color'];
  if (typeof color !== 'string') return null;
  const match = SKILL_LEVELS.find((level) => level === color.toLowerCase());
  return match ?? null;
}

/**
 * Suggest a par for a pair, with reasoning.
 *
 * Uses the PDGA "Par by Hole Length" table fed by the PDGA Effective Length
 * formula. Returns null when the pair is not measurable yet — a suggestion
 * built on a missing tee would be a guess dressed as a calculation.
 *
 * The Par Guidelines themselves warn that "disc golf scores can vary widely for
 * holes of a given length. Strictly following the table will not give
 * appropriate pars for all holes." That is why this is a suggestion with a
 * visible override and its reasoning on screen.
 */
/**
 * Below this, an elevation difference is not worth adjusting par for.
 *
 * Half a metre of rise is 1.5m of effective length on a hole measured in
 * hundreds — inside the noise of any elevation source, and inside the noise of
 * where somebody dropped the basket pin. Applying it would make par jitter as
 * a tee is nudged, which reads as the tool being unsure of itself.
 */
export const ELEVATION_FLOOR_M = 0.5;

export function suggestParForPair(
  featureById: ReadonlyMap<string, Feature>,
  teeId: string,
  targetId: string,
  fairwayId: string | null,
  fallbackSkill: SkillLevel,
  /**
   * Target elevation minus tee elevation, in metres, or null when unknown.
   *
   * The PDGA's elevation term, supplied only when it can be trusted — see
   * `useProfiles` in the web app, which withholds it unless an imported LiDAR
   * survey covers the hole. **Null is not zero**: zero asserts the hole is
   * flat, null says nobody measured, and only one of those should move a par.
   */
  elevationGain: number | null = null,
): ParSuggestion | null {
  const measurement = measurePair(featureById, teeId, targetId, fairwayId);
  if (measurement.effective === null) return null;

  // The tee's own colour wins over the layout's level: a red tee plays as red
  // even inside a layout the designer has called Blue.
  const skillLevel = skillLevelOfTee(featureById.get(teeId)) ?? fallbackSkill;

  const factors: ParFactor[] = [];
  if (measurement.routed !== null && measurement.straight !== null) {
    if (measurement.routed - measurement.straight > 15) {
      factors.push({ label: 'Doglegs — measured along the fairway', effect: 'lengthens' });
    }
  }

  /*
   * The elevation term is real now, when there is elevation worth trusting.
   *
   * The dogleg term still needs the distance to the corner and the water term
   * the detour a carry forces, neither of which is in the document model. Those
   * stay omitted rather than estimated.
   */
  const usesElevation = elevationGain !== null && Math.abs(elevationGain) >= ELEVATION_FLOOR_M;

  if (usesElevation) {
    const rise = Math.round(Math.abs(elevationGain));
    factors.push({
      label:
        elevationGain > 0
          ? `Uphill ${rise}m — the PDGA adds three times the rise`
          : `Downhill ${rise}m — the PDGA subtracts three times the drop`,
      effect: elevationGain > 0 ? 'lengthens' : 'shortens',
    });
  }

  const effective = effectiveLength(
    { measured: measurement.effective, ...(usesElevation ? { elevationGain } : {}) },
    skillLevel,
  );

  factors.unshift({
    label: `PDGA par table, ${SKILL_LEVEL_INFO[skillLevel].label} level`,
    effect: 'neutral',
  });

  return {
    par: parForLength(effective, skillLevel),
    effectiveMeters: effective,
    measuredMeters: measurement.effective,
    skillLevel,
    factors,
    borderline: parBoundariesMeters(skillLevel).some(
      (boundary) => Math.abs(effective - boundary) <= BORDERLINE_MARGIN_M,
    ),
  };
}
