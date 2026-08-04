/**
 * PDGA course design reference data.
 *
 * Every figure here is transcribed from a published PDGA document, cited on the
 * table it came from. Nothing in this file is estimated, interpolated, or
 * remembered — if a number is not in a source document, it is not here.
 *
 * That rule exists because a designer may take a tee pad dimension or a safety
 * figure to a parks department, a landowner, or an insurer on this tool's
 * authority. An invented number is worse than a missing one, because it cannot
 * be told apart from a correct one.
 *
 * SOURCES (see docs/PDGA.md for the full record)
 *   [PAR]        PDGA Par Guidelines, 01/01/2022 (draft)
 *   [SKILL]      PDGA Course Design Player Skill Level Guidelines
 *   [ELEMENTS]   Disc Golf Course Design Elements
 *   [ACREAGE]    Disc Golf Course Acreage Guide
 *
 * UNITS: feet are canonical, because that is how the PDGA publishes them and
 * how the sport measures. The documents also print metric tables, but those are
 * independently rounded and in places overlap at the boundaries — the Gold row
 * of the par table gives par 2 as 0–58 m and par 3 as 57–180 m. Converting from
 * the foot values yields one contiguous, unambiguous scale, so that is what the
 * code does. The published metric figures are recorded in docs/PDGA.md.
 */

import { z } from 'zod';

/** Feet to meters. Exact by definition. */
const FT = 0.3048;
export const feetToMeters = (feet: number): number => feet * FT;
export const metersToFeet = (meters: number): number => meters / FT;

/* ------------------------------------------------------------------------- */
/* Skill levels                                                               */
/* ------------------------------------------------------------------------- */

export const SKILL_LEVELS = ['gold', 'blue', 'white', 'red', 'green'] as const;
export type SkillLevel = (typeof SKILL_LEVELS)[number];

export const skillLevelSchema = z.enum(SKILL_LEVELS);

/**
 * The level a new course is designed for.
 *
 * White. [SKILL] p1 puts it at 875+, which is the recreational-to-intermediate
 * band most municipal courses are actually built for, and it sits in the middle
 * of the five so a designer is one step from wherever they meant to be. Gold as
 * a default would flag almost every real park course as too short.
 */
export const DEFAULT_SKILL_LEVEL: SkillLevel = 'white';

export interface SkillLevelInfo {
  label: string;
  /** Player rating range this level targets. [SKILL] p1. */
  ratingDescription: string;
}

/**
 * Player skill levels.
 *
 * [SKILL] p1: "Skill level ranges are defined using PDGA Player Ratings as
 * follows: Gold 970+, Blue 925+, White 875+, Red 825+, Green under 825."
 *
 * [PAR] p3 lists a parallel set of *target* ratings used for par-setting
 * (Gold 1000, Blue 950, White 900, Red 850, Green 800) plus Pink 930 and
 * Purple 700. The two schemes differ because one describes who plays a course
 * and the other describes the "expert" whose score defines par. Only the five
 * design levels are modelled; Pink and Purple appear solely in par tables.
 */
export const SKILL_LEVEL_INFO: Record<SkillLevel, SkillLevelInfo> = {
  gold: { label: 'Gold', ratingDescription: '970+' },
  blue: { label: 'Blue', ratingDescription: '925+' },
  white: { label: 'White', ratingDescription: '875+' },
  red: { label: 'Red', ratingDescription: '825+' },
  green: { label: 'Green', ratingDescription: 'under 825' },
};

/* ------------------------------------------------------------------------- */
/* Par by hole length — [PAR] p10, "Hole Length Ranges in Feet"               */
/* ------------------------------------------------------------------------- */

/**
 * Upper bound in FEET for each par, by skill level.
 *
 * Read as: a hole at or below `par3` is par 3, at or below `par4` is par 4, and
 * so on; anything longer is par 6. `par2` is the upper bound of the par-2 band,
 * or null where the published table gives "na".
 *
 * [PAR] p10 prints these as inclusive ranges (Gold: 0-185, 186-585, 586-1010,
 * 1011-1395, 1396+). Only the upper bounds are stored, since the bands are
 * contiguous and the lower bound is always the previous upper bound plus one.
 *
 * [PAR] p10 also warns: "This is the simplest method, but disc golf scores can
 * vary widely for holes of a given length. Strictly following the table will
 * not give appropriate pars for all holes." That caveat is why par in this app
 * is always a suggestion with a visible override.
 */
export const PAR_BY_LENGTH_FT: Record<
  SkillLevel,
  { par2: number | null; par3: number; par4: number; par5: number }
> = {
  gold: { par2: 185, par3: 585, par4: 1010, par5: 1395 },
  blue: { par2: 85, par3: 480, par4: 845, par5: 1245 },
  white: { par2: 55, par3: 430, par4: 765, par5: 1170 },
  red: { par2: 30, par3: 375, par4: 680, par5: 1010 },
  green: { par2: null, par3: 310, par4: 525, par5: 790 },
};

/**
 * Par for an effective hole length, per [PAR] p10.
 *
 * Takes meters because that is what the document model stores; converts at the
 * boundary so the published foot figures stay the ones in the table.
 */
export function parForLength(meters: number, skill: SkillLevel): number {
  /*
   * Rounded to the nearest whole foot before the lookup, because that is the
   * resolution the table is printed at: [PAR] p10 runs par 2 to 55 and starts
   * par 3 at 56, and says nothing about 55.4. It also keeps a hole measured at
   * exactly a boundary on the correct side of it — metres-to-feet is not an
   * exact round trip in binary floating point, and 55 ft can come back as
   * 55.00000000000001 and silently fall into the next band.
   */
  const feet = Math.round(metersToFeet(meters));
  const bands = PAR_BY_LENGTH_FT[skill];

  if (bands.par2 !== null && feet <= bands.par2) return 2;
  if (feet <= bands.par3) return 3;
  if (feet <= bands.par4) return 4;
  if (feet <= bands.par5) return 5;
  return 6;
}

/** Band boundaries in meters, for "is this call borderline" checks. */
export function parBoundariesMeters(skill: SkillLevel): number[] {
  const bands = PAR_BY_LENGTH_FT[skill];
  return [bands.par2, bands.par3, bands.par4, bands.par5]
    .filter((f): f is number => f !== null)
    .map(feetToMeters);
}

/* ------------------------------------------------------------------------- */
/* Effective length — [PAR] pp7–8                                             */
/* ------------------------------------------------------------------------- */

/**
 * The elevation multiplier in the effective-length formula.
 *
 * [PAR] p8: "Effective Length = Measured Length + 3 x (Target Elevation - Tee
 * Elevation) + ..." — and [SKILL] p2 gives the worked example: "if a 300 ft
 * hole measured by laser from tee to pin goes uphill 10 feet, multiply 10 ft
 * x 3 (= 30 feet), add this to 300".
 *
 * [SKILL] p2 also notes: "In cases where the slope is greater than 10% up or
 * down, the multiplier is likely greater than 3. Only testing and experience
 * can provide a good estimate." The app uses 3 and does not attempt to guess
 * beyond it.
 */
export const ELEVATION_MULTIPLIER = 3;

/**
 * Maximum throw lengths in FEET — [PAR] p9.
 *
 * Used by the effective-length formula's dogleg term and by the Close Range Par
 * method. The document prints a metric table too; see the units note above for
 * why the foot figures are canonical.
 */
export const THROW_LENGTHS_FT: Record<
  SkillLevel,
  { drive: number; fairway: number; closeRange: number }
> = {
  gold: { drive: 400, fairway: 330, closeRange: 225 },
  blue: { drive: 340, fairway: 270, closeRange: 165 },
  white: { drive: 300, fairway: 240, closeRange: 140 },
  red: { drive: 260, fairway: 210, closeRange: 120 },
  green: { drive: 210, fairway: 170, closeRange: 90 },
};

export interface EffectiveLengthInput {
  /** Measured length, meters. */
  measured: number;
  /** Target elevation minus tee elevation, meters. Positive is uphill. */
  elevationGain?: number;
  /**
   * Effective length of a dogleg leg, meters — the distance to the corner.
   * Omit when the hole has no dogleg.
   */
  doglegLength?: number;
  /** Extra distance forced by a water carry, meters. */
  waterCarryExtra?: number;
}

/**
 * Effective Length, per [PAR] p8.
 *
 *   Effective Length = Measured Length
 *     + 3 x (Target Elevation - Tee Elevation)
 *     + (Fairway Throw Length - Dogleg Effective Length) not less than zero
 *     + (Extra Length forced by Water Carries)
 *
 * Every term is optional except the measured length, so a hole contributes only
 * what is actually known about it. Elevation stays zero until terrain data
 * arrives; the formula is already shaped to take it.
 */
export function effectiveLength(input: EffectiveLengthInput, skill: SkillLevel): number {
  const { measured, elevationGain = 0, doglegLength, waterCarryExtra = 0 } = input;

  const elevationTerm = ELEVATION_MULTIPLIER * elevationGain;

  const fairwayThrow = feetToMeters(THROW_LENGTHS_FT[skill].fairway);
  // "not less than zero": a dogleg longer than a fairway throw needs no
  // adjustment, per [PAR] p7.
  const doglegTerm = doglegLength === undefined ? 0 : Math.max(0, fairwayThrow - doglegLength);

  return measured + elevationTerm + doglegTerm + waterCarryExtra;
}

/* ------------------------------------------------------------------------- */
/* Tee pads — [ELEMENTS] pp2–3                                                */
/* ------------------------------------------------------------------------- */

/**
 * [ELEMENTS] p2: "Typical size for pads at the longer tee positions is 6 ft
 * (2m) wide by 13 ft (4m) long. The back end might flare out to 10 feet (3m)
 * wide. Minimum rectangular size is 4 feet (1.2m) wide by 10 feet (3m) long."
 *
 * p3 adds: "Each tee area should have at least a two-foot apron around all
 * sides", and pads "should be level from left to right. They should not slope
 * from front to back."
 */
export const TEE_PAD_FT = {
  minimumWidth: 4,
  minimumLength: 10,
  typicalWidth: 6,
  typicalLength: 13,
  /** The optional flare at the back of the pad. */
  flaredWidth: 10,
  apron: 2,
} as const;

export const TEE_PAD_M = {
  minimumWidth: feetToMeters(TEE_PAD_FT.minimumWidth),
  minimumLength: feetToMeters(TEE_PAD_FT.minimumLength),
  typicalWidth: feetToMeters(TEE_PAD_FT.typicalWidth),
  typicalLength: feetToMeters(TEE_PAD_FT.typicalLength),
} as const;

/* ------------------------------------------------------------------------- */
/* Hole and course lengths                                                    */
/* ------------------------------------------------------------------------- */

/**
 * [ELEMENTS] p2: "No hole should effectively be shorter than about 100 feet
 * (30m) even on courses for beginners."
 *
 * "About" is the document's own hedge, which is why the check built on this is
 * a warning rather than an error.
 */
export const MIN_HOLE_LENGTH_FT = 100;
export const MIN_HOLE_LENGTH_M = feetToMeters(MIN_HOLE_LENGTH_FT);

/**
 * Minimum length in FEET for a hole to be designed as a given par — [SKILL] p2.
 *
 * A second, looser framing of the same question the [PAR] table answers, and
 * the two do not quite agree: [SKILL] puts the White par-4 floor at 450 ft
 * while [PAR] starts the White par-4 band at 431 ft. Both are transcribed
 * because both are published; `parForLength` uses [PAR], because that is the
 * document written to assign par, and [SKILL] p1 explicitly defers to it
 * ("Refer to PDGA Par Guidelines for assistance assigning values").
 */
export const MIN_LENGTH_BY_PAR_FT: Record<
  SkillLevel,
  { par3: number; par4: number; par5: number }
> = {
  gold: { par3: 250, par4: 625, par5: 1000 },
  blue: { par3: 200, par4: 525, par5: 800 },
  white: { par3: 160, par4: 450, par5: 675 },
  red: { par3: 140, par4: 375, par5: 550 },
  green: { par3: 100, par4: 325, par5: 475 },
};

/**
 * Approach throw lengths in FEET — [SKILL] p3.
 *
 * "The lengths in this table indicate how far a player in that skill range can
 * be expected to throw with a mid-range disc or fairway driver in OPEN terrain
 * or CONSTRAINED such as woods or hazards. The max length in parentheses should
 * be used sparingly for when the designer requires the player to throw a
 * hi-speed driver for their approach."
 *
 * `openStretch` is that parenthesised figure. The document publishes no
 * equivalent for constrained terrain, so there is no field for one.
 */
export const APPROACH_LENGTH_FT: Record<
  SkillLevel,
  {
    open: { min: number; max: number };
    openStretch: number;
    constrained: { min: number; max: number };
  }
> = {
  gold: { open: { min: 180, max: 290 }, openStretch: 320, constrained: { min: 125, max: 225 } },
  blue: { open: { min: 140, max: 240 }, openStretch: 275, constrained: { min: 100, max: 180 } },
  white: { open: { min: 110, max: 180 }, openStretch: 230, constrained: { min: 80, max: 135 } },
  red: { open: { min: 90, max: 140 }, openStretch: 185, constrained: { min: 65, max: 120 } },
  green: { open: { min: 70, max: 100 }, openStretch: 135, constrained: { min: 50, max: 75 } },
};

/**
 * Basket rim height above the playing surface — [ELEMENTS] p3.
 *
 * "Manufacturers are required to produce targets so the height of the basket
 * rim above the playing surface is 82 cm +/- 6 cm." The document adds that the
 * Course Committee "suggests that no more than 6 targets out of 18 be installed
 * outside the manufactured height range with just 2 or 3 being preferred."
 *
 * Recorded, not checked: nothing in the document model knows how a basket is
 * mounted, and it never will from satellite imagery.
 */
export const BASKET_RIM_HEIGHT_CM = { nominal: 82, tolerance: 6, min: 76, max: 88 } as const;

/**
 * Forced water carries — [ELEMENTS] p2.
 *
 * "It is a best practice, but not always the case for a player throwing from
 * the shortest (or only) tee on a hole to be 'forced' to throw over water that
 * is normally greater than 18" deep (50cm)."
 */
export const FORCED_WATER_MAX_DEPTH = { inches: 18, cm: 50 } as const;

/**
 * Typical 18-hole course length ranges in FEET — [SKILL] p2.
 *
 * "The following course lengths for 18 holes are typical for each skill level."
 * Typical, not mandatory, so this drives an advisory note rather than an error.
 */
export const COURSE_LENGTH_FT: Record<SkillLevel, { min: number; max: number }> = {
  gold: { min: 7000, max: 11000 },
  blue: { min: 5000, max: 8500 },
  white: { min: 4500, max: 7500 },
  red: { min: 3500, max: 5500 },
  green: { min: 2500, max: 4000 },
};

/**
 * The hole count those ranges are quoted for.
 *
 * [SKILL] p2 states them "for 18 holes" and gives no per-hole figure, so any
 * check against them applies to an 18-hole course and nothing else. Scaling the
 * range to a 9- or 24-hole layout would be interpolation, not transcription.
 */
export const COURSE_LENGTH_HOLE_COUNT = 18;

export const courseLengthMeters = (skill: SkillLevel): { min: number; max: number } => ({
  min: feetToMeters(COURSE_LENGTH_FT[skill].min),
  max: feetToMeters(COURSE_LENGTH_FT[skill].max),
});

/**
 * Maximum dogleg length in FEET — [SKILL] p4.
 *
 * "A player in each of these skill levels should not be required to throw
 * farther than shown to reach the corner of a sharper dogleg."
 */
export const MAX_DOGLEG_FT: Record<SkillLevel, number> = {
  gold: 295,
  blue: 260,
  white: 200,
  red: 160,
  green: 100,
};

/**
 * Maximum forced water carry in FEET — [SKILL] p3.
 *
 * Published only for Gold and Blue; the table prints "-" for White, Red and
 * Green, which is recorded here as null rather than guessed at. The document
 * also advises providing a drop zone whenever terrain forces the carry.
 */
export const MAX_WATER_CARRY_FT: Record<SkillLevel, number | null> = {
  gold: 265,
  blue: 230,
  white: null,
  red: null,
  green: null,
};

/**
 * Fairway corridor widths in FEET — [ELEMENTS] p1.
 *
 * "Fairways in the woods typically range from 15 ft wide pinch points up to 40
 * feet wide." Descriptive of typical practice, not a requirement.
 */
export const FAIRWAY_WIDTH_FT = { pinchPoint: 15, open: 40 } as const;

/* ------------------------------------------------------------------------- */
/* Acreage — [ACREAGE]                                                        */
/* ------------------------------------------------------------------------- */

export type FoliageDensity = 'scattered' | 'average' | 'corridor';

/**
 * Course length in FEET and acreage, by skill level and foliage density.
 *
 * [ACREAGE] gives three course scales per row — Minimum (par ~56), Average
 * (~61) and Championship (~67). All three are recorded; the "foliage factor"
 * column (165 / 125 / 100) is the relative acreage multiplier the chart uses.
 *
 * Denser foliage needs less land: [ELEMENTS] p1, "more trees, less acreage
 * required."
 */
/**
 * The hole mix each acreage column assumes — [ACREAGE], footer.
 *
 * "* (P56) = estimated course par for that player level":
 *   Minimum (P56)      16-Par 3, 2-Par 4
 *   Average (P61)      12-P3, 5-P4, 1-P5
 *   Championship (P67) 8-P3, 7-P4, 3-P5
 *
 * All three are 18-hole layouts, which is what makes the acreage figures
 * comparable across the columns.
 */
export const ACREAGE_HOLE_MIX = {
  minimum: { par: 56, par3: 16, par4: 2, par5: 0 },
  average: { par: 61, par3: 12, par4: 5, par5: 1 },
  championship: { par: 67, par3: 8, par4: 7, par5: 3 },
} as const;

export interface AcreageRow {
  minimum: { feet: number; acres: number };
  average: { feet: number; acres: number };
  championship: { feet: number; acres: number };
  foliageFactor: number;
}

/**
 * Null where the chart has no row. Green is absent from [ACREAGE], which covers
 * only the four tee colours it names, so `ACREAGE.green` is null rather than a
 * plausible set of zeroes — a caller has to notice the gap instead of quietly
 * rendering "0 acres" as though it were guidance.
 */
export const ACREAGE: Record<SkillLevel, Record<FoliageDensity, AcreageRow> | null> = {
  gold: {
    scattered: {
      minimum: { feet: 6900, acres: 26 },
      average: { feet: 8450, acres: 32 },
      championship: { feet: 10350, acres: 39 },
      foliageFactor: 165,
    },
    average: {
      minimum: { feet: 6400, acres: 18 },
      average: { feet: 7750, acres: 22 },
      championship: { feet: 9350, acres: 27 },
      foliageFactor: 125,
    },
    corridor: {
      minimum: { feet: 5900, acres: 14 },
      average: { feet: 7150, acres: 16 },
      championship: { feet: 8650, acres: 20 },
      foliageFactor: 100,
    },
  },
  blue: {
    scattered: {
      minimum: { feet: 5500, acres: 21 },
      average: { feet: 6900, acres: 26 },
      championship: { feet: 8600, acres: 33 },
      foliageFactor: 165,
    },
    average: {
      minimum: { feet: 5000, acres: 14 },
      average: { feet: 6250, acres: 18 },
      championship: { feet: 7750, acres: 22 },
      foliageFactor: 125,
    },
    corridor: {
      minimum: { feet: 4500, acres: 10 },
      average: { feet: 5650, acres: 13 },
      championship: { feet: 7050, acres: 16 },
      foliageFactor: 100,
    },
  },
  white: {
    scattered: {
      minimum: { feet: 4150, acres: 16 },
      average: { feet: 5475, acres: 21 },
      championship: { feet: 7025, acres: 27 },
      foliageFactor: 165,
    },
    average: {
      minimum: { feet: 3650, acres: 10 },
      average: { feet: 4875, acres: 14 },
      championship: { feet: 6325, acres: 18 },
      foliageFactor: 125,
    },
    corridor: {
      minimum: { feet: 3550, acres: 8 },
      average: { feet: 4575, acres: 11 },
      championship: { feet: 5825, acres: 13 },
      foliageFactor: 100,
    },
  },
  red: {
    scattered: {
      minimum: { feet: 3200, acres: 12 },
      average: { feet: 4450, acres: 17 },
      championship: { feet: 5950, acres: 23 },
      foliageFactor: 165,
    },
    average: {
      minimum: { feet: 3100, acres: 9 },
      average: { feet: 4100, acres: 12 },
      championship: { feet: 5300, acres: 15 },
      foliageFactor: 125,
    },
    corridor: {
      minimum: { feet: 2600, acres: 6 },
      average: { feet: 3525, acres: 8 },
      championship: { feet: 4675, acres: 11 },
      foliageFactor: 100,
    },
  },
  green: null,
};

/** Citation strings, so findings can say where a figure came from. */
export const SOURCES = {
  par: {
    title: 'PDGA Par Guidelines',
    revision: '01/01/2022 (draft)',
    url: 'https://www.pdga.com/files/draftpdgaparguidelines20229.pdf',
  },
  skill: {
    title: 'PDGA Course Design Player Skill Level Guidelines',
    revision: 'undated',
    url: 'https://www.pdga.com/course-design-player-skill-level-guidelines',
  },
  elements: {
    title: 'Disc Golf Course Design Elements',
    revision: 'undated',
    url: 'https://www.pdga.com/course-design-elements',
  },
  acreage: {
    title: 'Disc Golf Course Acreage Guide',
    revision: 'undated',
    url: 'https://www.pdga.com/files/AcreageChart_0.pdf',
  },
} as const;
