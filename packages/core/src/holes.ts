import { z } from 'zod';

import type { Course } from './schema.js';
import { type Feature } from './features.js';
import { anchorOf, distance, pathLength } from './measure.js';

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
   * Stored separately from the computed value so improving the heuristic never
   * silently overwrites a deliberate decision.
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
  /** Why. Shown in the UI — a bare number nobody can interrogate gets ignored. */
  factors: ParFactor[];
  /** True when the hole is close enough to a boundary to be arguable. */
  borderline: boolean;
}

/**
 * Distance thresholds, in meters, for the base estimate.
 *
 * THESE ARE A HEURISTIC, NOT A STANDARD. They approximate common practice in
 * amateur course design and are deliberately not presented anywhere in the UI
 * as a PDGA requirement. The PDGA publishes its own guidance; this project has
 * not transcribed it (see rules.ts for why), and these numbers must not be
 * described to users as if it had.
 *
 * They are exported so they can be tuned in one place, and so the tests can
 * assert against the same values the code uses rather than restating them.
 */
export const PAR_THRESHOLDS_M = {
  /** Below this, a hole is a par 3 regardless of technicality. */
  par3Max: 122, // ~400 ft
  par4Max: 244, // ~800 ft
  par5Max: 366, // ~1200 ft
} as const;

/** Within this margin of a threshold, the call is genuinely arguable. */
const BORDERLINE_MARGIN_M = 15;

/**
 * Suggest a par, with reasoning.
 *
 * Returns null when the hole is not measurable yet — a suggestion built on a
 * missing tee would be a guess dressed as a calculation.
 *
 * The model is deliberately simple and legible. A more elaborate one that
 * nobody can follow is worse than a rough one whose reasoning is on screen: a
 * designer can correct a number they understand, and will simply distrust one
 * they can't.
 */
export function suggestPar(course: Course, hole: Hole): ParSuggestion | null {
  const measurement = measureHole(course, hole);
  if (measurement.effective === null) return null;

  const factors: ParFactor[] = [];
  let effective = measurement.effective;

  if (measurement.routed !== null && measurement.straight !== null) {
    // A dogleg plays longer than its chord; say so when it is material.
    const extra = measurement.routed - measurement.straight;
    if (extra > 15) {
      factors.push({ label: 'Doglegs — measured along the fairway', effect: 'lengthens' });
    }
  }

  /*
   * A mandatory forces a route rather than merely suggesting one, which costs
   * distance and options. Treated as a modest length penalty rather than a
   * direct par bump: mandos vary far too much for a blanket rule.
   */
  const mandoCount = course.features.filter((f) => f.kind === 'mando').length;
  if (mandoCount > 0 && measurement.straight !== null) {
    effective += 10 * Math.min(mandoCount, 2);
    factors.push({ label: 'Mandatory restricts the line', effect: 'lengthens' });
  }

  const par =
    effective <= PAR_THRESHOLDS_M.par3Max
      ? 3
      : effective <= PAR_THRESHOLDS_M.par4Max
        ? 4
        : effective <= PAR_THRESHOLDS_M.par5Max
          ? 5
          : 6;

  const borderline = (
    [PAR_THRESHOLDS_M.par3Max, PAR_THRESHOLDS_M.par4Max, PAR_THRESHOLDS_M.par5Max] as const
  ).some((threshold) => Math.abs(effective - threshold) <= BORDERLINE_MARGIN_M);

  factors.unshift({ label: 'Based on effective distance', effect: 'neutral' });

  return { par, effectiveMeters: effective, factors, borderline };
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
