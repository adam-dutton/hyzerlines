import { z } from 'zod';

import type { Course } from './schema.js';
import { type Feature } from './features.js';
import { anchorOf, distance, pathLength } from './measure.js';
import {
  effectiveLength,
  parBoundariesMeters,
  parForLength,
  SKILL_LEVEL_INFO,
  type SkillLevel,
} from './pdga.js';

/**
 * A hole: a tee, a target, and the route between them.
 *
 * Holes reference features by id rather than containing them. A fairway line
 * belongs to a hole, but an OB boundary usually spans several, and a shared
 * pond belongs to none — ownership would force a lie in all those cases.
 * References also mean deleting a hole never deletes the land you drew.
 */

export const holeSchema = z.object({
  id: z.string().min(1),
  /** Playing order. Not an array index — holes get renumbered and reordered. */
  number: z.number().int().min(1).max(99),
  name: z.string().default(''),
  /**
   * Tee positions, in order. Multiple tees are the norm, not an edge case:
   * most courses have at least a long and a short pad.
   */
  teeIds: z.array(z.string()).default([]),
  /** Pin positions. Multiple for courses that rotate placements. */
  basketIds: z.array(z.string()).default([]),
  /** Optional routing line; when present it measures the played distance. */
  fairwayId: z.string().nullable().default(null),
  /**
   * The designer's par, when they disagree with the suggestion.
   *
   * Stored separately from the computed value so that changing the course's
   * skill level — or a later revision of the PDGA tables — never silently
   * overwrites a deliberate decision.
   */
  parOverride: z.number().int().min(2).max(6).nullable().default(null),
});

export type Hole = z.infer<typeof holeSchema>;

export function createHole(number: number, overrides: Partial<Hole> = {}): Hole {
  return holeSchema.parse({
    id: crypto.randomUUID(),
    number,
    name: '',
    teeIds: [],
    basketIds: [],
    fairwayId: null,
    parOverride: null,
    ...overrides,
  });
}

export function holeName(hole: Hole): string {
  return hole.name.trim() || `Hole ${hole.number}`;
}

const byId = (course: Course, id: string | null): Feature | undefined =>
  id ? course.features.find((f) => f.id === id) : undefined;

export interface HoleMeasurement {
  /** Straight line, tee to basket. Null when either end is missing. */
  straight: number | null;
  /** Along the fairway line, when one is drawn. */
  routed: number | null;
  /**
   * What the hole actually plays.
   *
   * The routed length when a fairway is drawn, because a dogleg plays its
   * route and not its chord; otherwise the straight line.
   */
  effective: number | null;
}

export function measureHole(course: Course, hole: Hole): HoleMeasurement {
  const tee = byId(course, hole.teeIds[0] ?? null);
  const basket = byId(course, hole.basketIds[0] ?? null);
  const fairway = byId(course, hole.fairwayId);

  const straight = tee && basket ? distance(anchorOf(tee), anchorOf(basket)) : null;

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
  /** Plain-language reason, shown to the designer. */
  label: string;
  /** How it moved the estimate. Positive lengthens the effective distance. */
  effect: 'lengthens' | 'shortens' | 'neutral';
}

export interface ParSuggestion {
  par: number;
  /** Distance the estimate was actually based on, in meters. */
  effectiveMeters: number;
  /** The measured length before any effective-length adjustment, in meters. */
  measuredMeters: number;
  /** The skill level the bands were read from. */
  skillLevel: SkillLevel;
  /** Why. Shown in the UI — a bare number nobody can interrogate gets ignored. */
  factors: ParFactor[];
  /** True when the hole is close enough to a band boundary to be arguable. */
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
 * Suggest a par, with reasoning.
 *
 * Uses the PDGA "Par by Hole Length" table for the course's skill level, fed
 * with an Effective Length computed by the PDGA formula. See pdga.ts for both,
 * with citations.
 *
 * Returns null when the hole is not measurable yet — a suggestion built on a
 * missing tee would be a guess dressed as a calculation.
 *
 * The Par Guidelines themselves warn that "disc golf scores can vary widely for
 * holes of a given length. Strictly following the table will not give
 * appropriate pars for all holes." That is exactly why this is a suggestion
 * with a visible override and its reasoning on screen: a designer can correct a
 * number they understand, and will simply distrust one they can't.
 */
export function suggestPar(course: Course, hole: Hole): ParSuggestion | null {
  const measurement = measureHole(course, hole);
  if (measurement.effective === null) return null;

  const skillLevel = course.skillLevel;
  const factors: ParFactor[] = [];

  if (measurement.routed !== null && measurement.straight !== null) {
    // A dogleg plays longer than its chord; say so when it is material.
    const extra = measurement.routed - measurement.straight;
    if (extra > 15) {
      factors.push({ label: 'Doglegs — measured along the fairway', effect: 'lengthens' });
    }
  }

  /*
   * The PDGA's dogleg term needs the distance to the corner, and the water term
   * needs the detour a carry forces. Neither is in the document model yet, and
   * elevation waits on terrain data — so those inputs are omitted rather than
   * estimated, and `effectiveLength` contributes nothing for them. The formula
   * is already shaped to take them when the data exists.
   */
  const effective = effectiveLength({ measured: measurement.effective }, skillLevel);

  const par = parForLength(effective, skillLevel);

  const borderline = parBoundariesMeters(skillLevel).some(
    (boundary) => Math.abs(effective - boundary) <= BORDERLINE_MARGIN_M,
  );

  factors.unshift({
    label: `PDGA par table, ${SKILL_LEVEL_INFO[skillLevel].label} level`,
    effect: 'neutral',
  });

  return {
    par,
    effectiveMeters: effective,
    measuredMeters: measurement.effective,
    skillLevel,
    factors,
    borderline,
  };
}

/** The par in force: the designer's override, else the suggestion, else null. */
export function effectivePar(course: Course, hole: Hole): number | null {
  if (hole.parOverride !== null) return hole.parOverride;
  return suggestPar(course, hole)?.par ?? null;
}

/** Total par across every hole that has one. */
export function coursePar(course: Course, holes: readonly Hole[]): number {
  return holes.reduce((total, hole) => total + (effectivePar(course, hole) ?? 0), 0);
}

/** Total effective length across every measurable hole, in meters. */
export function courseLength(course: Course, holes: readonly Hole[]): number {
  return holes.reduce((total, hole) => total + (measureHole(course, hole).effective ?? 0), 0);
}
