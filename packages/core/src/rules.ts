import type { Course } from './schema.js';
import { KIND_DEFINITIONS, type Feature } from './features.js';
import { anchorOf, distance, pathsCross } from './measure.js';
import { holeName, measureHole, type Hole } from './holes.js';
import {
  courseLengthMeters,
  metersToFeet,
  COURSE_LENGTH_HOLE_COUNT,
  MIN_HOLE_LENGTH_FT,
  MIN_HOLE_LENGTH_M,
  SKILL_LEVEL_INFO,
  SOURCES,
  TEE_PAD_FT,
  TEE_PAD_M,
} from './pdga.js';

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
 * Rules come in two kinds, and the distinction is load-bearing.
 *
 * `STRUCTURAL_RULES` follow from the document's own geometry and
 * self-consistency. They need no external authority and claim none.
 *
 * `PDGA_RULES` cite a published PDGA figure. A designer may take a tee pad
 * dimension or a length range from this tool to a parks department, a
 * landowner, or an insurer, so every one of these rules MUST carry the `source`
 * and `revision` of the document its number came from, and that number must be
 * transcribed in pdga.ts against a citation — never remembered, never
 * interpolated. `holes.test.ts` fails the build if a rule claims `authority:
 * 'pdga'` without both fields.
 *
 * Where the PDGA publishes no figure, this file has no rule. That is why there
 * is no safety-separation check: the documents transcribed so far describe
 * fairway widths and skill-level distances but publish no separation distance
 * between adjacent fairways, and inventing one would be the single most
 * dangerous number this app could get wrong.
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
  /** Which revision of the source. A figure without one cannot be looked up. */
  revision?: string;
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
  ...(rule.revision ? { revision: rule.revision } : {}),
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

/* ------------------------------------------------------------------------- */
/* PDGA rules — each cites the published figure it enforces                   */
/* ------------------------------------------------------------------------- */

const ft = (meters: number): number => Math.round(metersToFeet(meters));

/**
 * [ELEMENTS] p2: "Minimum rectangular size is 4 feet (1.2m) wide by 10 feet
 * (3m) long."
 *
 * Only fires once a dimension has actually been entered. A tee with no
 * measurements is unspecified, not undersized, and nagging about a field the
 * designer has not reached yet is how a checks panel gets switched off.
 */
const teePadUndersized: Rule = {
  id: 'pdga.tee-pad-undersized',
  title: 'Tee pad below the minimum size',
  severity: 'warning',
  authority: 'pdga',
  source: SOURCES.elements.title,
  revision: SOURCES.elements.revision,
  docUrl: SOURCES.elements.url,
  run: ({ course }) =>
    course.features.flatMap((feature) => {
      if (feature.kind !== 'tee') return [];

      const width = feature.props['width'];
      const length = feature.props['length'];
      const short: string[] = [];

      if (typeof width === 'number' && width > 0 && width < TEE_PAD_M.minimumWidth) {
        short.push(`${ft(width)} ft wide (minimum ${TEE_PAD_FT.minimumWidth} ft)`);
      }
      if (typeof length === 'number' && length > 0 && length < TEE_PAD_M.minimumLength) {
        short.push(`${ft(length)} ft long (minimum ${TEE_PAD_FT.minimumLength} ft)`);
      }
      if (short.length === 0) return [];

      const name = feature.label.trim() || KIND_DEFINITIONS.tee.label;
      return [
        finding(teePadUndersized, `${name} is ${short.join(' and ')}.`, {
          featureId: feature.id,
        }),
      ];
    }),
};

/**
 * [ELEMENTS] p2: "no hole should effectively be shorter than about 100 feet
 * (30m) even on courses designed for the youngest players."
 *
 * "About" is the document's own word, so this is a warning rather than an
 * error, and the degenerate-hole check already covers the under-5 m case that
 * means "unfinished" rather than "short".
 */
const holeTooShort: Rule = {
  id: 'pdga.hole-too-short',
  title: 'Hole below the minimum length',
  severity: 'warning',
  authority: 'pdga',
  source: SOURCES.elements.title,
  revision: SOURCES.elements.revision,
  docUrl: SOURCES.elements.url,
  run: ({ course, holes }) =>
    holes.flatMap((hole) => {
      const { effective } = measureHole(course, hole);
      if (effective === null || effective < 5 || effective >= MIN_HOLE_LENGTH_M) return [];
      return [
        finding(
          holeTooShort,
          `${holeName(hole)} plays ${ft(effective)} ft — under the ${MIN_HOLE_LENGTH_FT} ft minimum for any skill level.`,
          { holeId: hole.id },
        ),
      ];
    }),
};

/**
 * [SKILL] p2 publishes typical total lengths for 18 holes, per skill level.
 *
 * Only runs on an 18-hole course, because 18 holes is what the table is quoted
 * for and it gives no per-hole figure — pro-rating it to a 9- or 24-hole layout
 * would be this file inventing a number, which is exactly what it must not do.
 *
 * Informational: "typical" is the document's framing, and a deliberately tight
 * wooded course sitting under the range is a design decision, not a defect.
 */
const courseLengthOutsideRange: Rule = {
  id: 'pdga.course-length-outside-range',
  title: 'Course length outside the typical range for its skill level',
  severity: 'info',
  authority: 'pdga',
  source: SOURCES.skill.title,
  revision: SOURCES.skill.revision,
  docUrl: SOURCES.skill.url,
  run: ({ course, holes }) => {
    if (holes.length !== COURSE_LENGTH_HOLE_COUNT) return [];

    // Every hole has to be measurable, or the total is not a total.
    const lengths = holes.map((hole) => measureHole(course, hole).effective);
    if (lengths.some((length) => length === null)) return [];
    const total = lengths.reduce<number>((sum, length) => sum + length!, 0);

    const range = courseLengthMeters(course.skillLevel);
    if (total >= range.min && total <= range.max) return [];

    const level = SKILL_LEVEL_INFO[course.skillLevel].label;
    const direction = total < range.min ? 'shorter' : 'longer';
    return [
      finding(
        courseLengthOutsideRange,
        `At ${ft(total).toLocaleString()} ft this course is ${direction} than the typical ${level} range (${ft(range.min).toLocaleString()}–${ft(range.max).toLocaleString()} ft).`,
      ),
    ];
  },
};

/**
 * [ELEMENTS] p4: "Fairways should not cross one another and should be far
 * enough apart so errant throws aren't regularly in the wrong fairway."
 *
 * Only the first half is checked. Crossing is a geometric fact about two drawn
 * lines; "far enough apart" is a separation distance the document declines to
 * put a number on, and this file does not supply numbers the PDGA has not
 * published — least of all a safety one.
 */
const fairwaysCross: Rule = {
  id: 'pdga.fairways-cross',
  title: 'Two fairways cross',
  severity: 'warning',
  authority: 'pdga',
  source: SOURCES.elements.title,
  revision: SOURCES.elements.revision,
  docUrl: SOURCES.elements.url,
  run: ({ holes, featureById }) => {
    const routed = holes
      .map((hole) => {
        const fairway = hole.fairwayId ? featureById.get(hole.fairwayId) : undefined;
        return fairway?.geometry.type === 'line'
          ? { hole, fairway, line: fairway.geometry.coordinates }
          : null;
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

    // Unrouted holes still have a played line — tee to basket — and two of
    // those crossing is the same problem drawn with fewer clicks.
    for (const hole of holes) {
      if (routed.some((entry) => entry.hole.id === hole.id)) continue;
      const tee = hole.teeIds[0] ? featureById.get(hole.teeIds[0]) : undefined;
      const basket = hole.basketIds[0] ? featureById.get(hole.basketIds[0]) : undefined;
      if (!tee || !basket) continue;
      routed.push({
        hole,
        fairway: tee,
        line: [anchorOf(tee), anchorOf(basket)],
      });
    }

    const found: Finding[] = [];
    for (let i = 0; i < routed.length; i++) {
      for (let j = i + 1; j < routed.length; j++) {
        const a = routed[i]!;
        const b = routed[j]!;
        if (!pathsCross(a.line, b.line)) continue;
        found.push(
          finding(fairwaysCross, `${holeName(a.hole)} and ${holeName(b.hole)} cross.`, {
            holeId: a.hole.id,
          }),
        );
      }
    }
    return found;
  },
};

/**
 * PDGA-sourced rules.
 *
 * Every entry must carry `source` and `revision`, and its figure must be
 * transcribed in pdga.ts against a citation. See the note at the top of this
 * file before adding one.
 */
export const PDGA_RULES: readonly Rule[] = [
  teePadUndersized,
  holeTooShort,
  fairwaysCross,
  courseLengthOutsideRange,
];

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
