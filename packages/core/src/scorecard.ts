import type { Feature } from './features.js';
import type { Hole } from './holes.js';
import { SKILL_LEVELS, SKILL_LEVEL_INFO, type SkillLevel } from './pdga.js';
import { skillLevelOfTee } from './pairs.js';
import {
  fallbackSkillLevel,
  pairView,
  representativePair,
  type PairElevations,
  type PairView,
} from './pairView.js';
import { featureIndex, type Course } from './schema.js';

/**
 * The course as a card, with a column per tee.
 *
 * A hole with three tees has three lengths and possibly three pars, and the
 * list on the left has been showing exactly one of them — resolved through
 * `representativePair`, so the other two existed in the file and appeared
 * nowhere. That is the shape of a real scorecard's problem and a real
 * scorecard's answer: one row per hole, one column per tee position, every
 * number visible at once.
 *
 * ## Columns are skill levels, not tees
 *
 * Because that is what a tee's colour *means*. `skillLevelOfTee` reads it, every
 * PDGA figure is defined per level, and a printed card's Blue/White/Red columns
 * are those levels under their common names. Keying on the level rather than on
 * the feature is also what lets a column span the course: hole 3's blue tee and
 * hole 4's blue tee are different features and the same column.
 *
 * Tees with no colour set get a column of their own. A course where nobody has
 * touched the colour field is the common starting state, and it produces exactly
 * one column — the card degrades to the single list it replaced rather than
 * demanding the designer classify anything first.
 */

export interface ScorecardColumn {
  /** The level these tees carry, or null for tees with no colour set. */
  level: SkillLevel | null;
  /** What to print at the head of the column. */
  label: string;
}

export interface ScorecardRow {
  hole: Hole;
  /**
   * One entry per column, aligned by index.
   *
   * Null where the hole has no tee of that level — which is normal and is not
   * an error. Courses routinely run eighteen white tees and nine reds.
   */
  cells: (PairView | null)[];
}

export interface ScorecardTotal {
  par: number;
  length: number;
  /**
   * How many holes this column actually covers.
   *
   * Reported rather than implied, because a column present on six holes has a
   * total that is not a course length. Printing "2,140 ft" against a nine-hole
   * card without saying it came from six of them is the kind of true-but-
   * misleading number this app exists to avoid.
   */
  holes: number;
}

export interface Scorecard {
  columns: ScorecardColumn[];
  rows: ScorecardRow[];
  /** Aligned with `columns`. */
  totals: ScorecardTotal[];
}

const UNMARKED: ScorecardColumn = { level: null, label: 'Unmarked' };

/** Which target each hole is being presented as playing to. */
export type TargetChoices = ReadonlyMap<string, string>;

/**
 * The tee a hole offers at a given level.
 *
 * The first one, when a hole somehow has two of the same colour. That is not a
 * design anybody intends and the alternative — inventing a second column for
 * one hole — would distort the whole card to represent a mistake.
 */
function teeAtLevel(
  hole: Hole,
  level: SkillLevel | null,
  featureById: ReadonlyMap<string, Feature>,
): string | null {
  for (const id of hole.teeIds) {
    if (skillLevelOfTee(featureById.get(id)) === level) return id;
  }
  return null;
}

/**
 * Which target a hole's row measures to.
 *
 * The column decides the tee; something has to decide the pin, and it is the
 * one the rest of the interface is presenting — the caller's choice, else the
 * representative pair. A card that measured to a different pin than the map was
 * drawing would be two answers to one question.
 */
function targetFor(
  course: Course,
  hole: Hole,
  targets: TargetChoices | undefined,
): string | null {
  const chosen = targets?.get(hole.id);
  if (chosen && hole.targetIds.includes(chosen)) return chosen;
  return representativePair(course, hole)?.targetId ?? null;
}

/** Every tee level the course actually has, in the published order. */
export function scorecardColumns(course: Course): ScorecardColumn[] {
  const featureById = featureIndex(course);
  const present = new Set<SkillLevel | null>();

  for (const hole of course.holes) {
    for (const id of hole.teeIds) present.add(skillLevelOfTee(featureById.get(id)));
  }

  /*
   * `SKILL_LEVELS` order, which is gold to green — longest to shortest, and the
   * order every printed card uses. Sorting by measured length instead would
   * reorder the card as a designer moved a tee, which is the opposite of what a
   * column is for.
   */
  const columns: ScorecardColumn[] = SKILL_LEVELS.filter((level) => present.has(level)).map(
    (level) => ({ level, label: SKILL_LEVEL_INFO[level].label }),
  );

  // Last, because unclassified tees are the ones a designer has not got to yet.
  if (present.has(null)) columns.push(UNMARKED);
  return columns;
}

/**
 * The whole card.
 *
 * One `featureIndex` and one skill-level fallback for the entire course rather
 * than per cell: an eighteen-hole course with four tee levels is seventy-two
 * cells, and each one otherwise re-indexes every feature in the document.
 */
export function scorecard(
  course: Course,
  holes: readonly Hole[],
  { elevations, targets }: { elevations?: PairElevations; targets?: TargetChoices } = {},
): Scorecard {
  const columns = scorecardColumns(course);
  const featureById = featureIndex(course);
  const fallback = fallbackSkillLevel(course);

  const rows = holes.map((hole) => {
    const targetId = targetFor(course, hole, targets);

    const cells = columns.map((column) => {
      const teeId = teeAtLevel(hole, column.level, featureById);
      if (!teeId || !targetId) return null;
      return pairView(course, teeId, targetId, featureById, fallback, elevations);
    });

    return { hole, cells };
  });

  const totals = columns.map((_, index) => {
    let par = 0;
    let length = 0;
    let counted = 0;

    for (const row of rows) {
      const view = row.cells[index];
      // A tee with no measurable shot contributes nothing and is not counted —
      // it would otherwise inflate the hole count against an unchanged total.
      if (!view || view.measurement.effective === null) continue;
      par += view.par ?? 0;
      length += view.measurement.effective;
      counted++;
    }

    return { par, length, holes: counted };
  });

  return { columns, rows, totals };
}

/**
 * Whether a card would show anything a single list could not.
 *
 * One column is one tee per hole, which is the state the old list was correct
 * for — so the interface can keep showing that list rather than drawing a table
 * with a single column and a header nobody needs.
 *
 * Asked of the course rather than of a built card, so the answer is available
 * *before* paying for one: on a single-tee course the card is discarded, and
 * building seventy-two pair views to decide not to draw them is the kind of
 * work that only shows up as a panel that lags behind the map.
 */
export const hasMultipleTees = (course: Course): boolean => scorecardColumns(course).length > 1;
