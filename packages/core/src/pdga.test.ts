import { describe, expect, it } from 'vitest';

import {
  effectiveLength,
  feetToMeters,
  metersToFeet,
  parBoundariesMeters,
  parForLength,
  ACREAGE,
  COURSE_LENGTH_FT,
  ELEVATION_MULTIPLIER,
  MAX_DOGLEG_FT,
  MAX_WATER_CARRY_FT,
  MIN_HOLE_LENGTH_FT,
  PAR_BY_LENGTH_FT,
  SKILL_LEVELS,
  SOURCES,
  TEE_PAD_FT,
  THROW_LENGTHS_FT,
  type SkillLevel,
} from './pdga.js';
import { createCourse } from './schema.js';
import { createFeature } from './features.js';
import { createHole } from './holes.js';
import { applyOp } from './ops.js';
import { checkCourse, PDGA_RULES } from './rules.js';
import { distance } from './measure.js';

/**
 * The transcription is the product here.
 *
 * These tests restate the published figures independently of the tables the
 * code reads, so a typo in pdga.ts fails the build instead of silently becoming
 * the app's idea of a PDGA standard. Anywhere a test merely re-reads the
 * constant it is checking a property (ordering, contiguity, presence of a
 * citation) rather than a value.
 */

describe('par table transcription', () => {
  /** [PAR] p10, "Hole Length Ranges in Feet" — upper bound of each band. */
  const published: Record<SkillLevel, [number | null, number, number, number]> = {
    gold: [185, 585, 1010, 1395],
    blue: [85, 480, 845, 1245],
    white: [55, 430, 765, 1170],
    red: [30, 375, 680, 1010],
    green: [null, 310, 525, 790],
  };

  it('matches the published foot figures', () => {
    for (const level of SKILL_LEVELS) {
      const [par2, par3, par4, par5] = published[level];
      expect(PAR_BY_LENGTH_FT[level], level).toEqual({ par2, par3, par4, par5 });
    }
  });

  it('assigns par at every published band boundary', () => {
    for (const level of SKILL_LEVELS) {
      const bands = PAR_BY_LENGTH_FT[level];
      const at = (feet: number) => parForLength(feetToMeters(feet), level);

      if (bands.par2 !== null) {
        expect(at(bands.par2), `${level} par 2 upper`).toBe(2);
        expect(at(bands.par2 + 1), `${level} par 3 lower`).toBe(3);
      } else {
        // "na" means the level has no par 2 at all, not that it starts at zero.
        expect(at(0), `${level} has no par 2`).toBe(3);
      }

      expect(at(bands.par3), `${level} par 3 upper`).toBe(3);
      expect(at(bands.par3 + 1), `${level} par 4 lower`).toBe(4);
      expect(at(bands.par4), `${level} par 4 upper`).toBe(4);
      expect(at(bands.par4 + 1), `${level} par 5 lower`).toBe(5);
      expect(at(bands.par5), `${level} par 5 upper`).toBe(5);
      expect(at(bands.par5 + 1), `${level} par 6 lower`).toBe(6);
    }
  });

  /**
   * A longer hole must never be a lower par. This is the property that would
   * catch a transposed pair of numbers that happened to stay inside its band.
   */
  it('is monotonic in length for every level', () => {
    for (const level of SKILL_LEVELS) {
      let previous = 0;
      for (let feet = 0; feet <= 1600; feet += 5) {
        const par = parForLength(feetToMeters(feet), level);
        expect(par, `${level} at ${feet} ft`).toBeGreaterThanOrEqual(previous);
        previous = par;
      }
    }
  });

  /** Harder levels play longer holes for the same par, at every band. */
  it('orders the levels from longest to shortest', () => {
    const order: SkillLevel[] = ['gold', 'blue', 'white', 'red', 'green'];
    for (const band of ['par3', 'par4', 'par5'] as const) {
      for (let i = 1; i < order.length; i++) {
        expect(
          PAR_BY_LENGTH_FT[order[i]!][band],
          `${order[i]} ${band} < ${order[i - 1]} ${band}`,
        ).toBeLessThan(PAR_BY_LENGTH_FT[order[i - 1]!][band]);
      }
    }
  });

  it('reports band boundaries in meters for borderline checks', () => {
    // Gold publishes all four bounds; green has no par 2, so it publishes three.
    expect(parBoundariesMeters('gold')).toHaveLength(4);
    expect(parBoundariesMeters('green')).toHaveLength(3);
    expect(parBoundariesMeters('white')[0]).toBeCloseTo(feetToMeters(55), 6);
  });
});

describe('effective length', () => {
  /**
   * [SKILL] p2's worked example: "if a 300 ft hole measured by laser from tee
   * to pin goes uphill 10 feet, multiply 10 ft x 3 (= 30 feet), add this to
   * 300" — 330 ft.
   */
  it('reproduces the published elevation example', () => {
    const result = effectiveLength(
      { measured: feetToMeters(300), elevationGain: feetToMeters(10) },
      'gold',
    );
    expect(metersToFeet(result)).toBeCloseTo(330, 6);
  });

  it('shortens a downhill hole by the same multiplier', () => {
    const result = effectiveLength(
      { measured: feetToMeters(300), elevationGain: feetToMeters(-10) },
      'gold',
    );
    expect(metersToFeet(result)).toBeCloseTo(270, 6);
  });

  it('uses the multiplier of three from the published formula', () => {
    expect(ELEVATION_MULTIPLIER).toBe(3);
  });

  /**
   * [PAR] p7: "If the effective length of the Dogleg is longer than the length
   * of a Fairway Throw, no adjustment is needed." White's fairway throw is
   * 240 ft, so a 300 ft dogleg adds nothing and a 200 ft one adds 40 ft.
   */
  it('adds the dogleg shortfall, and nothing when the dogleg is long enough', () => {
    const base = feetToMeters(500);
    const long = effectiveLength({ measured: base, doglegLength: feetToMeters(300) }, 'white');
    expect(metersToFeet(long)).toBeCloseTo(500, 6);

    const short = effectiveLength({ measured: base, doglegLength: feetToMeters(200) }, 'white');
    expect(metersToFeet(short)).toBeCloseTo(540, 6);
  });

  it('leaves the measured length alone when nothing else is known', () => {
    expect(effectiveLength({ measured: 137 }, 'blue')).toBe(137);
  });

  it('adds the extra distance a water carry forces', () => {
    expect(effectiveLength({ measured: 100, waterCarryExtra: 25 }, 'blue')).toBe(125);
  });
});

describe('other transcribed figures', () => {
  /** [PAR] p9, "Maximum Throw Lengths in Feet". */
  it('matches the published throw lengths', () => {
    expect(THROW_LENGTHS_FT).toEqual({
      gold: { drive: 400, fairway: 330, closeRange: 225 },
      blue: { drive: 340, fairway: 270, closeRange: 165 },
      white: { drive: 300, fairway: 240, closeRange: 140 },
      red: { drive: 260, fairway: 210, closeRange: 120 },
      green: { drive: 210, fairway: 170, closeRange: 90 },
    });
  });

  /** [ELEMENTS] p2: minimum 4 ft by 10 ft, typical 6 ft by 13 ft, 2 ft apron. */
  it('matches the published tee pad dimensions', () => {
    expect(TEE_PAD_FT.minimumWidth).toBe(4);
    expect(TEE_PAD_FT.minimumLength).toBe(10);
    expect(TEE_PAD_FT.typicalWidth).toBe(6);
    expect(TEE_PAD_FT.typicalLength).toBe(13);
    expect(TEE_PAD_FT.apron).toBe(2);
    // A pad cannot be typical and below minimum at once.
    expect(TEE_PAD_FT.typicalWidth).toBeGreaterThan(TEE_PAD_FT.minimumWidth);
  });

  it('matches the published minimum hole length', () => {
    expect(MIN_HOLE_LENGTH_FT).toBe(100);
  });

  /** [SKILL] p2, typical 18-hole course lengths. */
  it('matches the published course length ranges, ordered by level', () => {
    expect(COURSE_LENGTH_FT.gold).toEqual({ min: 7000, max: 11000 });
    expect(COURSE_LENGTH_FT.green).toEqual({ min: 2500, max: 4000 });
    for (const level of SKILL_LEVELS) {
      expect(COURSE_LENGTH_FT[level].min, level).toBeLessThan(COURSE_LENGTH_FT[level].max);
    }
  });

  /** [SKILL] p4. */
  it('matches the published maximum dogleg lengths', () => {
    expect(MAX_DOGLEG_FT).toEqual({ gold: 295, blue: 260, white: 200, red: 160, green: 100 });
  });

  /**
   * [SKILL] p3 prints a figure only for Gold and Blue. The nulls are the point:
   * the guidance does not exist for the other levels and must not be invented.
   */
  it('records unpublished water carries as null rather than a guess', () => {
    expect(MAX_WATER_CARRY_FT.gold).toBe(265);
    expect(MAX_WATER_CARRY_FT.blue).toBe(230);
    expect(MAX_WATER_CARRY_FT.white).toBeNull();
    expect(MAX_WATER_CARRY_FT.red).toBeNull();
    expect(MAX_WATER_CARRY_FT.green).toBeNull();
  });

  /** [ACREAGE] has no Green row, so there is no Green entry. */
  it('has no acreage row for the level the chart does not cover', () => {
    expect(ACREAGE.green).toBeNull();
    expect(ACREAGE.gold?.corridor.minimum).toEqual({ feet: 5900, acres: 14 });
    // Denser foliage, less land: [ELEMENTS] p1.
    for (const level of ['gold', 'blue', 'white', 'red'] as const) {
      const row = ACREAGE[level]!;
      expect(row.corridor.average.acres, level).toBeLessThan(row.scattered.average.acres);
    }
  });

  it('cites a title and revision for every source', () => {
    for (const [key, source] of Object.entries(SOURCES)) {
      expect(source.title, key).toBeTruthy();
      expect(source.revision, key).toBeTruthy();
      expect(source.url, key).toMatch(/^https:\/\/www\.pdga\.com\//);
    }
  });
});

describe('PDGA design checks', () => {
  const pt = (lng: number, lat: number) => ({
    type: 'point' as const,
    coordinates: [lng, lat] as [number, number],
  });

  it('cites a source and revision on every rule', () => {
    expect(PDGA_RULES.length).toBeGreaterThan(0);
    for (const rule of PDGA_RULES) {
      expect(rule.authority, rule.id).toBe('pdga');
      expect(rule.source, rule.id).toBeTruthy();
      expect(rule.revision, rule.id).toBeTruthy();
    }
  });

  it('flags a tee pad below the 4 ft by 10 ft minimum', () => {
    let course = createCourse();
    const tee = createFeature('tee', pt(-93.1, 44.9));
    course = applyOp(course, { type: 'addFeature', feature: tee }).course;
    course = applyOp(course, {
      type: 'setProp',
      id: tee.id,
      key: 'width',
      value: feetToMeters(3),
    }).course;

    const findings = checkCourse(course, course.holes);
    expect(findings.map((f) => f.ruleId)).toContain('pdga.tee-pad-undersized');
    expect(findings.find((f) => f.ruleId === 'pdga.tee-pad-undersized')?.source).toBe(
      SOURCES.elements.title,
    );
  });

  /**
   * A tee with no dimensions entered is unspecified, not undersized. Nagging
   * about a field the designer has not reached yet is how a checks panel gets
   * switched off entirely.
   */
  it('says nothing about a tee whose dimensions are not entered', () => {
    let course = createCourse();
    const tee = createFeature('tee', pt(-93.1, 44.9));
    course = applyOp(course, { type: 'addFeature', feature: tee }).course;
    expect(checkCourse(course, course.holes).map((f) => f.ruleId)).not.toContain(
      'pdga.tee-pad-undersized',
    );
  });

  it('flags a hole under the 100 ft minimum, but not a merely unfinished one', () => {
    const metersPerDegreeLat = distance([0, 44.9], [0, 45.9]);
    const build = (meters: number) => {
      let course = createCourse();
      const tee = createFeature('tee', pt(-93.1, 44.9));
      const basket = createFeature('basket', pt(-93.1, 44.9 + meters / metersPerDegreeLat));
      for (const f of [tee, basket]) {
        course = applyOp(course, { type: 'addFeature', feature: f }).course;
      }
      const hole = createHole(1, { teeIds: [tee.id], basketIds: [basket.id] });
      course = applyOp(course, { type: 'addHole', hole }).course;
      return course;
    };

    const ruleIds = (meters: number) => {
      const course = build(meters);
      return checkCourse(course, course.holes).map((f) => f.ruleId);
    };

    // 20 m is ~66 ft.
    expect(ruleIds(20)).toContain('pdga.hole-too-short');

    // Under 5 m is the structural "is it finished?" case, not a length opinion.
    expect(ruleIds(2)).not.toContain('pdga.hole-too-short');

    // 40 m is over 100 ft.
    expect(ruleIds(40)).not.toContain('pdga.hole-too-short');
  });

  /**
   * [ELEMENTS] p4: "Fairways should not cross one another." Checked on the
   * played line, so it works before a fairway has been drawn at all.
   */
  it('flags two holes whose played lines cross', () => {
    const build = (legs: readonly [[number, number], [number, number]][]) => {
      let course = createCourse();
      legs.forEach(([from, to], i) => {
        const tee = createFeature('tee', pt(...from));
        const basket = createFeature('basket', pt(...to));
        for (const f of [tee, basket]) {
          course = applyOp(course, { type: 'addFeature', feature: f }).course;
        }
        course = applyOp(course, {
          type: 'addHole',
          hole: createHole(i + 1, { teeIds: [tee.id], basketIds: [basket.id] }),
        }).course;
      });
      return course;
    };

    const crossing = build([
      [
        [-93.1, 44.9],
        [-93.09, 44.903],
      ],
      [
        [-93.09, 44.9],
        [-93.1, 44.903],
      ],
    ]);
    const found = checkCourse(crossing, crossing.holes).find(
      (f) => f.ruleId === 'pdga.fairways-cross',
    );
    expect(found?.message).toMatch(/Hole 1 and Hole 2 cross/);

    // Side by side, no crossing.
    const parallel = build([
      [
        [-93.1, 44.9],
        [-93.1, 44.903],
      ],
      [
        [-93.099, 44.9],
        [-93.099, 44.903],
      ],
    ]);
    expect(checkCourse(parallel, parallel.holes).map((f) => f.ruleId)).not.toContain(
      'pdga.fairways-cross',
    );
  });

  /**
   * [SKILL] p2 quotes the range for 18 holes and gives no per-hole figure, so
   * the check must stay silent on any other hole count rather than pro-rating.
   */
  it('only judges course length on an 18-hole course', () => {
    const metersPerDegreeLat = distance([0, 44.9], [0, 45.9]);
    const build = (holeCount: number, metersEach: number) => {
      let course = createCourse({ skillLevel: 'white' });
      for (let i = 0; i < holeCount; i++) {
        const lat = 44.9 + i * 0.01;
        const tee = createFeature('tee', pt(-93.1, lat));
        const basket = createFeature(
          'basket',
          pt(-93.1, lat + metersEach / metersPerDegreeLat),
        );
        for (const f of [tee, basket]) {
          course = applyOp(course, { type: 'addFeature', feature: f }).course;
        }
        course = applyOp(course, {
          type: 'addHole',
          hole: createHole(i + 1, { teeIds: [tee.id], basketIds: [basket.id] }),
        }).course;
      }
      return course;
    };

    // 18 x 50 m = 900 m ~ 2950 ft, well under White's 4500 ft minimum.
    const eighteen = build(18, 50);
    const flagged = checkCourse(eighteen, eighteen.holes).find(
      (f) => f.ruleId === 'pdga.course-length-outside-range',
    );
    expect(flagged?.message).toMatch(/shorter than the typical White range/);

    // The same holes, nine of them: no opinion.
    const nine = build(9, 50);
    expect(checkCourse(nine, nine.holes).map((f) => f.ruleId)).not.toContain(
      'pdga.course-length-outside-range',
    );

    // 18 x 100 m = 1800 m ~ 5900 ft, inside 4500-7500.
    const inRange = build(18, 100);
    expect(checkCourse(inRange, inRange.holes).map((f) => f.ruleId)).not.toContain(
      'pdga.course-length-outside-range',
    );
  });
});
