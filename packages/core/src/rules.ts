import type { Course } from './schema.js';
import { KIND_DEFINITIONS, type Feature } from './features.js';
import { anchorOf, distance } from './measure.js';
import { holeName, measureHole, type Hole } from './holes.js';

/**
 * Design checks.
 *
 * Advisory, never prescriptive — a stated principle of this project. Every
 * finding is dismissible, because designers break guidelines deliberately and a
 * tool that nags is a tool that gets ignored.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ON PDGA STANDARDS — READ BEFORE ADDING RULES
 *
 * The plan called for encoding the PDGA course design standards here. That has
 * NOT been done, and the omission is deliberate.
 *
 * The PDGA documents could not be retrieved (pdga.com returns 403 to automated
 * requests), and the numbers were not transcribed from memory. Tee pad
 * dimensions, hole length bands, and safety separation distances are figures a
 * designer may take to a parks department, a landowner, or an insurer on this
 * tool's authority. A plausible-looking invented number is worse than no number
 * at all, because it cannot be told apart from a correct one.
 *
 * `PDGA_RULES` below is therefore empty. To populate it:
 *   1. Obtain the current PDGA course design documents.
 *   2. Transcribe each figure with its `source` and `revision` filled in.
 *   3. Only then set `authority: 'pdga'` on the rule.
 *
 * Everything currently shipping is in `STRUCTURAL_RULES`: checks that follow
 * from geometry and self-consistency and need no external authority. They claim
 * nothing they cannot prove.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type Severity = 'error' | 'warning' | 'info';

/**
 * Where a rule's authority comes from.
 *
 * `structural` findings are provable from the document itself. `pdga` findings
 * cite a published standard and MUST carry a source. The distinction is surfaced
 * in the UI so a designer knows whether they are being told a fact or a rule.
 */
export type Authority = 'structural' | 'pdga' | 'local';

export interface RuleDefinition {
  id: string;
  title: string;
  severity: Severity;
  authority: Authority;
  /** Required when authority is 'pdga'. The document a figure came from. */
  source?: string;
  revision?: string;
  docUrl?: string;
}

export interface Finding {
  ruleId: string;
  title: string;
  severity: Severity;
  authority: Authority;
  /** What is wrong, in the designer's terms. */
  message: string;
  /** Feature or hole this attaches to, for click-to-reveal. */
  featureId?: string;
  holeId?: string;
  source?: string;
  docUrl?: string;
}

interface RuleContext {
  course: Course;
  holes: readonly Hole[];
  featureById: Map<string, Feature>;
}

interface Rule extends RuleDefinition {
  run: (ctx: RuleContext) => Finding[];
}

const finding = (
  rule: RuleDefinition,
  message: string,
  extra: Partial<Finding> = {},
): Finding => ({
  ruleId: rule.id,
  title: rule.title,
  severity: rule.severity,
  authority: rule.authority,
  message,
  ...(rule.source ? { source: rule.source } : {}),
  ...(rule.docUrl ? { docUrl: rule.docUrl } : {}),
  ...extra,
});

/* ------------------------------------------------------------------------- */
/* Structural rules — provable from the document, no external authority       */
/* ------------------------------------------------------------------------- */

const holeNeedsTee: Rule = {
  id: 'structural.hole-missing-tee',
  title: 'Hole has no tee',
  severity: 'error',
  authority: 'structural',
  run: ({ holes }) =>
    holes
      .filter((hole) => hole.teeIds.length === 0)
      .map((hole) =>
        finding(holeNeedsTee, `${holeName(hole)} has no tee assigned.`, { holeId: hole.id }),
      ),
};

const holeNeedsBasket: Rule = {
  id: 'structural.hole-missing-basket',
  title: 'Hole has no target',
  severity: 'error',
  authority: 'structural',
  run: ({ holes }) =>
    holes
      .filter((hole) => hole.basketIds.length === 0)
      .map((hole) =>
        finding(holeNeedsBasket, `${holeName(hole)} has no basket assigned.`, {
          holeId: hole.id,
        }),
      ),
};

const danglingReference: Rule = {
  id: 'structural.dangling-reference',
  title: 'Hole references a deleted feature',
  severity: 'error',
  authority: 'structural',
  run: ({ holes, featureById }) => {
    const found: Finding[] = [];
    for (const hole of holes) {
      const referenced = [...hole.teeIds, ...hole.basketIds, hole.fairwayId].filter(
        (id): id is string => id !== null,
      );
      for (const id of referenced) {
        if (!featureById.has(id)) {
          found.push(
            finding(
              danglingReference,
              `${holeName(hole)} points at a feature that no longer exists.`,
              {
                holeId: hole.id,
              },
            ),
          );
          break; // One finding per hole is enough; the fix is the same.
        }
      }
    }
    return found;
  },
};

const duplicateNumbers: Rule = {
  id: 'structural.duplicate-hole-number',
  title: 'Two holes share a number',
  severity: 'warning',
  authority: 'structural',
  run: ({ holes }) => {
    const seen = new Map<number, Hole[]>();
    for (const hole of holes) seen.set(hole.number, [...(seen.get(hole.number) ?? []), hole]);
    return [...seen.entries()]
      .filter(([, group]) => group.length > 1)
      .map(([number, group]) =>
        finding(duplicateNumbers, `${group.length} holes are numbered ${number}.`, {
          holeId: group[0]!.id,
        }),
      );
  },
};

/**
 * A tee and basket at the same spot is almost always an unfinished hole rather
 * than a design decision — usually a basket dropped before the tee was moved.
 */
const degenerateHole: Rule = {
  id: 'structural.tee-and-basket-coincide',
  title: 'Tee and basket are in the same place',
  severity: 'warning',
  authority: 'structural',
  run: ({ course, holes }) =>
    holes.flatMap((hole) => {
      const measurement = measureHole(course, hole);
      if (measurement.straight === null || measurement.straight > 5) return [];
      return [
        finding(degenerateHole, `${holeName(hole)} measures under 5 m — is it finished?`, {
          holeId: hole.id,
        }),
      ];
    }),
};

/**
 * A fairway line that starts nowhere near its tee is usually assigned to the
 * wrong hole. Advisory, because a deliberate drop zone route can look like this.
 */
const fairwayDetached: Rule = {
  id: 'structural.fairway-detached',
  title: 'Fairway line does not start at the tee',
  severity: 'info',
  authority: 'structural',
  run: ({ holes, featureById }) =>
    holes.flatMap((hole) => {
      const fairway = hole.fairwayId ? featureById.get(hole.fairwayId) : undefined;
      const tee = hole.teeIds[0] ? featureById.get(hole.teeIds[0]) : undefined;
      if (!fairway || !tee || fairway.geometry.type !== 'line') return [];

      const gap = distance(fairway.geometry.coordinates[0]!, anchorOf(tee));
      if (gap <= 30) return [];
      return [
        finding(
          fairwayDetached,
          `${holeName(hole)}'s fairway starts ${Math.round(gap)} m from its tee.`,
          { holeId: hole.id, featureId: fairway.id },
        ),
      ];
    }),
};

const unassignedTargets: Rule = {
  id: 'structural.unassigned-feature',
  title: 'Tee or basket belongs to no hole',
  severity: 'info',
  authority: 'structural',
  run: ({ course, holes }) => {
    const assigned = new Set(holes.flatMap((h) => [...h.teeIds, ...h.basketIds]));
    return course.features
      .filter((f) => (f.kind === 'tee' || f.kind === 'basket') && !assigned.has(f.id))
      .map((f) =>
        finding(
          unassignedTargets,
          `${f.label.trim() || KIND_DEFINITIONS[f.kind].label} is not assigned to a hole.`,
          { featureId: f.id },
        ),
      );
  },
};

export const STRUCTURAL_RULES: readonly Rule[] = [
  holeNeedsTee,
  holeNeedsBasket,
  danglingReference,
  duplicateNumbers,
  degenerateHole,
  fairwayDetached,
  unassignedTargets,
];

/**
 * PDGA-sourced rules.
 *
 * Intentionally empty — see the note at the top of this file. Do not add
 * entries here without a verifiable `source` and `revision`.
 */
export const PDGA_RULES: readonly Rule[] = [];

export const ALL_RULES: readonly Rule[] = [...STRUCTURAL_RULES, ...PDGA_RULES];

/**
 * Run every rule.
 *
 * `dismissed` carries rule ids the designer has silenced for this course.
 * Filtering happens here rather than in the UI so that a dismissal means the
 * same thing everywhere, including in an export.
 */
export function checkCourse(
  course: Course,
  holes: readonly Hole[],
  dismissed: readonly string[] = [],
): Finding[] {
  const ctx: RuleContext = {
    course,
    holes,
    featureById: new Map(course.features.map((f) => [f.id, f])),
  };

  const silenced = new Set(dismissed);
  const severityOrder: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

  return ALL_RULES.filter((rule) => !silenced.has(rule.id))
    .flatMap((rule) => rule.run(ctx))
    .sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
}
