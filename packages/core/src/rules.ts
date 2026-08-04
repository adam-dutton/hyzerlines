import type { Course } from './schema.js';
import { KIND_DEFINITIONS, type Feature } from './features.js';
import { anchorOf, distance, pathsCross } from './measure.js';
import { holeName, type Hole } from './holes.js';
import { findPair, measurePair } from './pairs.js';
import {
  layoutName,
  layoutSkillLevel,
  layoutLength,
  measureLayout,
  type Layout,
} from './layouts.js';
import { activeLayout, featureIndex } from './schema.js';
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
  /** Feature, hole or play this attaches to, for click-to-reveal. */
  featureId?: string;
  holeId?: string;
  playId?: string;
  source?: string;
  /** Which revision of the source. A figure without one cannot be looked up. */
  revision?: string;
  docUrl?: string;
}

interface RuleContext {
  course: Course;
  holes: readonly Hole[];
  featureById: Map<string, Feature>;
  /**
   * The layout being checked. Undefined only for a document with none.
   *
   * Checks that ask "how long is this course" or "what par does it play" have
   * no answer without one — a course with three tees and three pins per hole is
   * a different length depending on which you walk.
   */
  layout: Layout | undefined;
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

const holeNeedsTarget: Rule = {
  id: 'structural.hole-missing-basket',
  title: 'Hole has no target',
  severity: 'error',
  authority: 'structural',
  run: ({ holes }) =>
    holes
      .filter((hole) => hole.targetIds.length === 0)
      .map((hole) =>
        finding(holeNeedsTarget, `${holeName(hole)} has no basket assigned.`, {
          holeId: hole.id,
        }),
      ),
};

const danglingReference: Rule = {
  id: 'structural.dangling-reference',
  title: 'Hole references a deleted feature',
  severity: 'error',
  authority: 'structural',
  run: ({ course, holes, featureById }) => {
    const found: Finding[] = [];
    for (const hole of holes) {
      // Pairs carry the fairway now, so a hole's references are its tees, its
      // targets, and the fairway of any pair built from them.
      const fairwayIds = course.pairs
        .filter((p) => hole.teeIds.includes(p.teeId) && hole.targetIds.includes(p.targetId))
        .map((p) => p.fairwayId);
      const referenced = [...hole.teeIds, ...hole.targetIds, ...fairwayIds].filter(
        (id): id is string => id !== null && id !== undefined,
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
  run: ({ holes, featureById }) =>
    holes.flatMap((hole) => {
      const teeId = hole.teeIds[0];
      const targetId = hole.targetIds[0];
      if (!teeId || !targetId) return [];
      const { straight } = measurePair(featureById, teeId, targetId);
      if (straight === null || straight > 5) return [];
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
  run: ({ course, holes, featureById }) =>
    holes.flatMap((hole) =>
      // Every drawn fairway of the hole, since each pair can have its own.
      course.pairs
        .filter(
          (pair) =>
            pair.fairwayId !== null &&
            hole.teeIds.includes(pair.teeId) &&
            hole.targetIds.includes(pair.targetId),
        )
        .flatMap((pair) => {
          const fairway = featureById.get(pair.fairwayId!);
          const tee = featureById.get(pair.teeId);
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
    ),
};

/**
 * A tee or target no hole references.
 *
 * Usually it means you drew one and forgot to make the hole. Sometimes it means
 * a practice basket, which is a legitimate thing to have on a course and not a
 * mistake — so the check exempts anything explicitly marked as standalone
 * rather than nagging about it forever.
 */
const unassignedTargets: Rule = {
  id: 'structural.unassigned-feature',
  title: 'Tee or basket belongs to no hole',
  severity: 'info',
  authority: 'structural',
  run: ({ course, holes }) => {
    const assigned = new Set(holes.flatMap((h) => [...h.teeIds, ...h.targetIds]));
    return course.features
      .filter(
        (f) =>
          (f.kind === 'tee' || f.kind === 'target') &&
          !assigned.has(f.id) &&
          f.props['standalone'] !== true,
      )
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
  holeNeedsTarget,
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
  run: ({ course, holes, featureById }) =>
    holes.flatMap((hole) => {
      /*
       * Every tee-and-pin combination, not just the first. A hole can be fine
       * from the long tee and 60 ft from the short one, and the short one is
       * exactly the case this check exists for.
       */
      const shortest = hole.teeIds
        .flatMap((teeId) => hole.targetIds.map((targetId) => ({ teeId, targetId })))
        .map(({ teeId, targetId }) => {
          const pair = findPair(course.pairs, teeId, targetId);
          return measurePair(featureById, teeId, targetId, pair?.fairwayId ?? null).effective;
        })
        .filter((m): m is number => m !== null && m >= 5)
        .sort((a, b) => a - b)[0];

      if (shortest === undefined || shortest >= MIN_HOLE_LENGTH_M) return [];
      return [
        finding(
          holeTooShort,
          `${holeName(hole)} plays ${ft(shortest)} ft from its shortest tee — under the ${MIN_HOLE_LENGTH_FT} ft minimum for any skill level.`,
          { holeId: hole.id },
        ),
      ];
    }),
};

/**
 * [SKILL] p2 publishes typical total lengths for 18 holes, per skill level.
 *
 * Measures the LAYOUT, not the holes — which is what makes it correct now that
 * a layout can skip a hole or play one twice. Eighteen plays is eighteen plays
 * however many corridors they came from.
 *
 * Two conditions gate it, both because the alternative would be inventing a
 * figure. The table is quoted for 18 and gives no per-hole number, so a 9- or
 * 24-play layout is not covered. And every published range is per skill level,
 * so a layout mixing tee colours has no range to be inside or outside of.
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
  run: ({ course, featureById, layout }) => {
    if (!layout || layout.plays.length !== COURSE_LENGTH_HOLE_COUNT) return [];

    const skill = layoutSkillLevel(layout, featureById);
    if (!skill) return [];

    // Every play has to be measurable, or the total is not a total.
    const measurements = measureLayout(layout, featureById, course.pairs);
    if (measurements.some((m) => m.meters === null)) return [];

    const total = layoutLength(measurements);
    const range = courseLengthMeters(skill);
    if (total >= range.min && total <= range.max) return [];

    const level = SKILL_LEVEL_INFO[skill].label;
    const direction = total < range.min ? 'shorter' : 'longer';
    return [
      finding(
        courseLengthOutsideRange,
        `At ${ft(total).toLocaleString()} ft, ${layoutName(layout)} is ${direction} than the typical ${level} range (${ft(range.min).toLocaleString()}–${ft(range.max).toLocaleString()} ft).`,
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
  run: ({ course, holes, featureById, layout }) => {
    /*
     * The lines actually played, not every line that exists.
     *
     * A hole with three tees and three pins has nine routes, and comparing all
     * of them against all of another hole's would report a course as a mess of
     * crossings no player would ever make. The layout says which route is real;
     * without one, the first tee to the first target stands in.
     */
    const routed =
      layout?.plays.map((play) => ({
        holeId: play.holeId,
        teeId: play.teeId,
        targetId: play.targetId,
      })) ?? [];

    /*
     * An empty layout is not the same as no layout.
     *
     * A course being drawn has holes long before it has a routing — that is the
     * normal order of work — so falling through to the holes themselves is what
     * keeps this check useful during design rather than only after it.
     */
    const played =
      routed.length > 0
        ? routed
        : holes.flatMap((hole) => {
            const teeId = hole.teeIds[0];
            const targetId = hole.targetIds[0];
            return teeId && targetId ? [{ holeId: hole.id, teeId, targetId }] : [];
          });

    const routes = played.flatMap((entry) => {
      const hole = holes.find((h) => h.id === entry.holeId);
      const tee = featureById.get(entry.teeId);
      const target = featureById.get(entry.targetId);
      if (!hole || !tee || !target) return [];

      const pair = findPair(course.pairs, entry.teeId, entry.targetId);
      const fairway = pair?.fairwayId ? featureById.get(pair.fairwayId) : undefined;

      // A drawn fairway is the route; otherwise the played line is tee to
      // target, and two of those crossing is the same problem drawn with
      // fewer clicks.
      const line =
        fairway?.geometry.type === 'line'
          ? fairway.geometry.coordinates
          : [anchorOf(tee), anchorOf(target)];

      return [{ hole, line }];
    });

    const found: Finding[] = [];
    for (let i = 0; i < routes.length; i++) {
      for (let j = i + 1; j < routes.length; j++) {
        const a = routes[i]!;
        const b = routes[j]!;
        // A hole played twice in one layout shares its corridor with itself.
        if (a.hole.id === b.hole.id) continue;
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
 * Takes the whole course rather than a course plus a hole list: the checks now
 * need the active layout and the pair table too, and threading those through
 * separately would be three chances for a caller to pass a set that disagrees
 * with itself.
 *
 * `dismissed` carries rule ids the designer has silenced for this course.
 * Filtering happens here rather than in the UI so that a dismissal means the
 * same thing everywhere, including in an export.
 */
export function checkCourse(course: Course, dismissed: readonly string[] = []): Finding[] {
  const ctx: RuleContext = {
    course,
    holes: course.holes,
    featureById: featureIndex(course),
    layout: activeLayout(course),
  };

  const silenced = new Set(dismissed);
  const severityOrder: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

  return ALL_RULES.filter((rule) => !silenced.has(rule.id))
    .flatMap((rule) => rule.run(ctx))
    .sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
}
