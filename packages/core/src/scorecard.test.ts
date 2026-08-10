import { describe, expect, it } from 'vitest';

import { createFeature } from './features.js';
import { createHole } from './holes.js';
import { distance } from './measure.js';
import { createCourse } from './schema.js';
import { hasMultipleTees, scorecard, scorecardColumns } from './scorecard.js';

/**
 * The course as a card, with a column per tee.
 *
 * The list this replaces resolved every hole through `representativePair`, so a
 * three-tee hole reported one length and one par and the other two shots — real
 * entries in the file — appeared nowhere. These tests are mostly about the
 * cases where a column is *not* a full round, because that is where a total can
 * be true and misleading at once.
 */

const AT: [number, number] = [-93.1, 44.9];
const metersPerDegreeLat = distance([0, 44.9], [0, 45.9]);
const north = (meters: number): [number, number] => [
  AT[0],
  AT[1] + meters / metersPerDegreeLat,
];
const point = (coordinates: [number, number]) => ({ type: 'point', coordinates }) as const;

const tee = (color?: string) =>
  createFeature('tee', point(AT), color ? { props: { color } } : {});

/** A hole with one basket and tees of the given colours, each at its own distance. */
function holeWith(tees: { color?: string; meters: number }[], targetMeters = 0) {
  const features = tees.map((t) =>
    createFeature(
      'tee',
      point(north(-t.meters + targetMeters)),
      t.color ? { props: { color: t.color } } : {},
    ),
  );
  const target = createFeature('target', point(north(targetMeters)));
  const hole = createHole(1, {
    teeIds: features.map((f) => f.id),
    targetIds: [target.id],
  });
  return { features: [...features, target], hole };
}

describe('scorecardColumns', () => {
  it('orders columns longest to shortest, as a printed card does', () => {
    const { features, hole } = holeWith([
      { color: 'red', meters: 60 },
      { color: 'gold', meters: 140 },
      { color: 'white', meters: 100 },
    ]);
    const course = createCourse({ features, holes: [hole] });

    expect(scorecardColumns(course).map((c) => c.level)).toEqual(['gold', 'white', 'red']);
  });

  /*
   * A course where nobody has touched the colour field is the ordinary starting
   * state. It must produce one column, so the interface can keep showing the
   * plain list rather than a table with one column and a header nobody needs.
   */
  it('gives uncoloured tees a column of their own, listed last', () => {
    const { features, hole } = holeWith([{ meters: 90 }, { color: 'blue', meters: 150 }]);
    const course = createCourse({ features, holes: [hole] });

    const columns = scorecardColumns(course);
    expect(columns.map((c) => c.level)).toEqual(['blue', null]);
    expect(columns.at(-1)!.label).toBe('Unmarked');
  });

  it('is one column for a course nobody has classified', () => {
    const { features, hole } = holeWith([{ meters: 90 }]);
    const course = createCourse({ features, holes: [hole] });

    expect(scorecardColumns(course)).toHaveLength(1);
    expect(hasMultipleTees(course)).toBe(false);
  });

  /*
   * Two tees on one hole is enough. A course does not have to be uniformly
   * multi-tee before the card is the right shape — the mixed case is exactly
   * the one the single list was hiding.
   */
  it('is more than one column as soon as a single hole has two levels', () => {
    const { features, hole } = holeWith([
      { color: 'white', meters: 120 },
      { color: 'red', meters: 80 },
    ]);
    const course = createCourse({ features, holes: [hole] });

    expect(hasMultipleTees(course)).toBe(true);
  });

  it('has no columns for a course with no tees', () => {
    expect(scorecardColumns(createCourse({}))).toEqual([]);
  });
});

describe('scorecard', () => {
  it('measures every tee, not just the representative one', () => {
    const { features, hole } = holeWith([
      { color: 'blue', meters: 150 },
      { color: 'red', meters: 60 },
    ]);
    const course = createCourse({ features, holes: [hole] });

    const card = scorecard(course, course.holes);
    const [blue, red] = card.rows[0]!.cells;

    expect(blue!.measurement.straight).toBeCloseTo(150, 0);
    expect(red!.measurement.straight).toBeCloseTo(60, 0);
    // Different lengths mean different pars, which is the whole point.
    expect(blue!.par).not.toBe(red!.par);
  });

  /*
   * Courses routinely run eighteen white tees and nine reds. A missing cell is
   * the normal shape of a real course, not a fault.
   */
  it('leaves a cell empty where a hole has no tee of that level', () => {
    const first = holeWith([
      { color: 'blue', meters: 150 },
      { color: 'red', meters: 60 },
    ]);
    const second = holeWith([{ color: 'blue', meters: 120 }]);
    second.hole = { ...second.hole, id: 'hole-2', number: 2 };

    const course = createCourse({
      features: [...first.features, ...second.features],
      holes: [first.hole, second.hole],
    });

    const card = scorecard(course, course.holes);
    const redIndex = card.columns.findIndex((c) => c.level === 'red');

    expect(card.rows[0]!.cells[redIndex]).not.toBeNull();
    expect(card.rows[1]!.cells[redIndex]).toBeNull();
  });

  /*
   * The number that could be true and misleading at once. A red column present
   * on one of two holes totals one hole's length, and printing that against a
   * two-hole card without saying so overstates the course.
   */
  it('reports how many holes each column actually covers', () => {
    const first = holeWith([
      { color: 'blue', meters: 150 },
      { color: 'red', meters: 60 },
    ]);
    const second = holeWith([{ color: 'blue', meters: 120 }]);
    second.hole = { ...second.hole, id: 'hole-2', number: 2 };

    const course = createCourse({
      features: [...first.features, ...second.features],
      holes: [first.hole, second.hole],
    });

    const card = scorecard(course, course.holes);
    const blue = card.columns.findIndex((c) => c.level === 'blue');
    const red = card.columns.findIndex((c) => c.level === 'red');

    expect(card.totals[blue]!.holes).toBe(2);
    expect(card.totals[blue]!.length).toBeCloseTo(270, 0);

    expect(card.totals[red]!.holes).toBe(1);
    expect(card.totals[red]!.length).toBeCloseTo(60, 0);
  });

  it('totals par per column', () => {
    const { features, hole } = holeWith([
      { color: 'blue', meters: 150 },
      { color: 'red', meters: 60 },
    ]);
    const course = createCourse({ features, holes: [hole] });

    const card = scorecard(course, course.holes);
    for (let i = 0; i < card.columns.length; i++) {
      expect(card.totals[i]!.par).toBe(card.rows[0]!.cells[i]!.par);
    }
  });

  /*
   * A hole with a tee and no basket has nothing to measure. It must not count
   * towards the column's hole count, or the total would describe more holes
   * than it contains.
   */
  it('does not count a hole it cannot measure', () => {
    const teeOnly = createFeature('tee', point(AT), { props: { color: 'blue' } });
    const hole = createHole(1, { teeIds: [teeOnly.id], targetIds: [] });
    const course = createCourse({ features: [teeOnly], holes: [hole] });

    const card = scorecard(course, course.holes);
    expect(card.rows[0]!.cells[0]).toBeNull();
    expect(card.totals[0]).toEqual({ par: 0, length: 0, holes: 0 });
  });

  /*
   * The column picks the tee; something has to pick the pin, and it is whatever
   * the rest of the interface is presenting. A card measuring to a different
   * pin than the map draws would be two answers to one question.
   */
  it('measures to the caller’s chosen pin', () => {
    const blue = tee('blue');
    const pinA = createFeature('target', point(north(90)));
    const pinB = createFeature('target', point(north(200)));
    const hole = createHole(1, {
      teeIds: [blue.id],
      targetIds: [pinA.id, pinB.id],
    });
    const course = createCourse({ features: [blue, pinA, pinB], holes: [hole] });

    const byDefault = scorecard(course, course.holes);
    expect(byDefault.rows[0]!.cells[0]!.measurement.straight).toBeCloseTo(90, 0);

    const chosen = scorecard(course, course.holes, {
      choices: new Map([[hole.id, { teeId: blue.id, targetId: pinB.id }]]),
    });
    expect(chosen.rows[0]!.cells[0]!.measurement.straight).toBeCloseTo(200, 0);
  });

  it('ignores a chosen pin the hole does not have', () => {
    const { features, hole } = holeWith([{ color: 'blue', meters: 150 }]);
    const course = createCourse({ features, holes: [hole] });

    const card = scorecard(course, course.holes, {
      choices: new Map([[hole.id, { teeId: 'not-a-tee', targetId: 'not-a-target' }]]),
    });
    expect(card.rows[0]!.cells[0]!.measurement.straight).toBeCloseTo(150, 0);
  });

  it('handles a course with no holes', () => {
    const card = scorecard(createCourse({}), []);
    expect(card.rows).toEqual([]);
    expect(card.totals).toEqual([]);
  });
});
