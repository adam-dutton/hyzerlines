import { z } from 'zod';

/**
 * A hole: a corridor of land, with the tees and targets that sit in it.
 *
 * Deliberately thin. Everything measurable — distance, par, elevation change —
 * lives on the pair (see pairs.ts), because a hole with three tees and three
 * pins is nine different shots and a single par on the hole would be true of
 * at most one of them.
 *
 * Holes reference features by id rather than containing them. A fairway belongs
 * to a pair, an OB boundary usually spans several holes, and a shared pond
 * belongs to none — ownership would force a lie in all those cases. References
 * also mean deleting a hole never deletes the land you drew.
 */

export const holeSchema = z.object({
  id: z.string().min(1),
  /**
   * The designer's name for this corridor — NOT the number a player sees.
   *
   * Those are different once layouts exist: a layout can skip a hole or play it
   * twice, so the played number is a position in the routing (see layouts.ts).
   * This one is stable, survives reordering, and is what the map labels.
   */
  number: z.number().int().min(1).max(99),
  name: z.string().default(''),
  notes: z.string().default(''),
  /** Tee positions. Multiple is the norm, not an edge case. */
  teeIds: z.array(z.string()).default([]),
  /** Pin positions. Multiple for courses that rotate placements. */
  targetIds: z.array(z.string()).default([]),
});

export type Hole = z.infer<typeof holeSchema>;

export function createHole(number: number, overrides: Partial<Hole> = {}): Hole {
  return holeSchema.parse({
    id: crypto.randomUUID(),
    number,
    name: '',
    notes: '',
    teeIds: [],
    targetIds: [],
    ...overrides,
  });
}

export function holeName(hole: Hole): string {
  return hole.name.trim() || `Hole ${hole.number}`;
}

/**
 * Every tee × target combination in a hole.
 *
 * The pairs that *could* exist, whether or not any of them has a stored record.
 * Used to offer the designer a choice of which shot to look at, and to check
 * that a stored pair still refers to features the hole holds.
 */
export function pairingsOf(hole: Hole): { teeId: string; targetId: string }[] {
  return hole.teeIds.flatMap((teeId) =>
    hole.targetIds.map((targetId) => ({ teeId, targetId })),
  );
}
