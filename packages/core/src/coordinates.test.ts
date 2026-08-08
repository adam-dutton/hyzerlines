import { describe, expect, it } from 'vitest';

import {
  COORDINATE_DECIMALS,
  formatCoordinate,
  formatPosition,
  inRange,
  isPositionText,
  parseCoordinate,
  parsePosition,
} from './coordinates.js';

/**
 * Reading and writing coordinates the way people write them.
 *
 * The document is `[lng, lat]` and people write latitude first, so this module
 * is a transposition — and a transposition is the one thing here that can be
 * wrong while looking entirely reasonable. A Minnesota course at 44.9, -93.1
 * read backwards is not a valid latitude and fails loudly; one at 40, -75 read
 * backwards lands in Kazakhstan and fails silently. Hence the fixtures below
 * use coordinates whose two halves cannot be confused for each other.
 */

/** Somewhere in Minnesota, where the rest of the test suite puts its courses. */
const MINNESOTA: [number, number] = [-93.123457, 44.901234];

describe('formatting', () => {
  it('writes latitude first, which is not how the document stores it', () => {
    expect(formatPosition(MINNESOTA)).toBe('44.901234, -93.123457');
  });

  /*
   * Six decimals is about 11cm — finer than any handheld GPS. It is the
   * position's address rather than a claim about its accuracy, and rounding it
   * shorter would move a tee every time somebody opened the field.
   */
  it('keeps enough precision to round-trip a position unchanged', () => {
    expect(COORDINATE_DECIMALS).toBe(6);
    const text = formatPosition(MINNESOTA);
    expect(parsePosition(text)).toEqual(MINNESOTA);
  });

  it('pads to a fixed width so a column of fields lines up', () => {
    expect(formatCoordinate(44.9)).toBe('44.900000');
    expect(formatCoordinate(-93)).toBe('-93.000000');
    expect(formatCoordinate(0)).toBe('0.000000');
  });
});

describe('ranges', () => {
  it('knows what each axis can hold', () => {
    expect(inRange(90, 'latitude')).toBe(true);
    expect(inRange(90.000001, 'latitude')).toBe(false);
    expect(inRange(-180, 'longitude')).toBe(true);
    expect(inRange(180.5, 'longitude')).toBe(false);
    expect(inRange(Number.NaN, 'latitude')).toBe(false);
  });

  /*
   * The asymmetry that catches a transposition. A longitude past ±90 is simply
   * not a latitude, so most swapped pairs are rejected outright rather than
   * placed somewhere wrong.
   */
  it('refuses a longitude offered as a latitude', () => {
    expect(inRange(-93.1, 'latitude')).toBe(false);
    expect(parseCoordinate('-93.1', 'latitude')).toBeNull();
    expect(parseCoordinate('-93.1', 'longitude')).toBe(-93.1);
  });
});

describe('parseCoordinate', () => {
  it('reads plain decimal degrees', () => {
    expect(parseCoordinate('44.901234', 'latitude')).toBeCloseTo(44.901234, 9);
    expect(parseCoordinate('-93.123457', 'longitude')).toBeCloseTo(-93.123457, 9);
    expect(parseCoordinate('  44.9  ', 'latitude')).toBeCloseTo(44.9, 9);
  });

  it('reads degrees, minutes and seconds', () => {
    // 44° 54' 4.4" = 44 + 54/60 + 4.4/3600
    expect(parseCoordinate(`44° 54' 4.4" N`, 'latitude')).toBeCloseTo(44.901222, 6);
  });

  it('reads degrees and decimal minutes, which is what a Garmin shows', () => {
    expect(parseCoordinate('44 54.0740 N', 'latitude')).toBeCloseTo(44.901233, 6);
  });

  /*
   * The sign belongs to the whole coordinate. `-93 7 24.4` is 93°7'24.4" west;
   * treating the minutes as negative too gives 92.87°, which is a kilometre and
   * a half east of where it should be and looks perfectly plausible on a map.
   */
  it('applies a leading minus to the whole coordinate, not just the degrees', () => {
    expect(parseCoordinate('-93 7 24.4', 'longitude')).toBeCloseTo(-93.123444, 6);
  });

  it('reads a hemisphere letter as the sign', () => {
    expect(parseCoordinate('93.123457 W', 'longitude')).toBeCloseTo(-93.123457, 9);
    expect(parseCoordinate('44.901234 S', 'latitude')).toBeCloseTo(-44.901234, 9);
    expect(parseCoordinate('W 93.123457', 'longitude')).toBeCloseTo(-93.123457, 9);
  });

  /*
   * A field labelled Latitude already knows its axis. Text that says otherwise
   * is a mistake worth refusing — quietly accepting a longitude there would put
   * the feature somewhere the designer never asked for.
   */
  it('refuses text whose hemisphere contradicts the field', () => {
    expect(parseCoordinate('44 W', 'latitude')).toBeNull();
    expect(parseCoordinate('44 N', 'longitude')).toBeNull();
    expect(parseCoordinate('44 N', 'latitude')).toBeCloseTo(44, 9);
  });

  it('refuses a minus and a southern hemisphere at once', () => {
    // Two ways of saying the same thing, or a mistake. Either way it is the
    // reader's to resolve, not ours to guess at.
    expect(parseCoordinate('-44 S', 'latitude')).toBeNull();
  });

  it('refuses minutes and seconds that are not sixtieths', () => {
    expect(parseCoordinate('44 60 0', 'latitude')).toBeNull();
    expect(parseCoordinate('44 30 75', 'latitude')).toBeNull();
  });

  it('refuses anything that is not a coordinate', () => {
    for (const text of ['', '   ', 'north', 'tee 1', '44.9abc', '44 54 4.4 9', 'NaN']) {
      expect(parseCoordinate(text, 'latitude'), text).toBeNull();
    }
  });

  it('refuses a value outside its axis', () => {
    expect(parseCoordinate('91', 'latitude')).toBeNull();
    expect(parseCoordinate('181', 'longitude')).toBeNull();
  });
});

describe('parsePosition', () => {
  /*
   * The paste. Copying a coordinate out of Google Maps gives both numbers in
   * one string, and dropping the second silently would land a feature a hundred
   * kilometres away with nothing on screen to say so.
   */
  it('reads what Google Maps copies', () => {
    expect(parsePosition('44.901234, -93.123457')).toEqual(MINNESOTA);
  });

  it('reads a pair separated by a space', () => {
    expect(parsePosition('44.901234 -93.123457')).toEqual(MINNESOTA);
  });

  it('assumes latitude first, as every source writes it', () => {
    const [lng, lat] = parsePosition('40, -75')!;
    expect(lat).toBe(40);
    expect(lng).toBe(-75);
  });

  /*
   * Both numbers are valid latitudes *and* valid longitudes here, so nothing
   * but the convention decides — which is exactly the case a transposition
   * would survive. Read the wrong way round this is Kazakhstan.
   */
  it('does not transpose a pair that would be valid either way', () => {
    expect(parsePosition('40, -75')).toEqual([-75, 40]);
  });

  it('lets hemisphere letters override the order', () => {
    const swapped = parsePosition('93.123457 W, 44.901234 N')!;
    expect(swapped[0]).toBeCloseTo(-93.123457, 6);
    expect(swapped[1]).toBeCloseTo(44.901234, 6);
  });

  it('reads a DMS pair with no comma, split on its hemisphere letters', () => {
    const parsed = parsePosition(`44° 54' 4.4" N 93° 7' 24.4" W`)!;
    expect(parsed[1]).toBeCloseTo(44.901222, 5);
    expect(parsed[0]).toBeCloseTo(-93.123444, 5);
  });

  /*
   * Refused rather than guessed. `44 54 4.4 93 7 24.4` can be cut three ways
   * and no reading is more defensible than another; picking one would put a
   * course somewhere plausible-looking and wrong.
   */
  it('refuses an ambiguous run of numbers with nothing to split on', () => {
    expect(parsePosition('44 54 4.4 93 7 24.4')).toBeNull();
  });

  it('refuses two of the same axis', () => {
    expect(parsePosition('44 N, 45 N')).toBeNull();
  });

  it('refuses a pair out of range', () => {
    // Latitude first, so this is a latitude of 93 — which does not exist.
    expect(parsePosition('93.1, 44.9')).toBeNull();
  });

  it('refuses a single coordinate, a list, and nonsense', () => {
    for (const text of ['44.9', '44.9, -93.1, 12', '', 'somewhere nice']) {
      expect(parsePosition(text), text).toBeNull();
    }
  });

  it('survives the punctuation a PDF pastes with', () => {
    expect(parsePosition('44.901234°, −93.123457')).toBeNull();
    // A real minus sign works; the unicode one above is a different character
    // and is refused rather than read as a positive number.
    expect(parsePosition('44.901234°, -93.123457')).toEqual(MINNESOTA);
  });

  it('tells a pair apart from a single coordinate', () => {
    expect(isPositionText('44.9, -93.1')).toBe(true);
    expect(isPositionText('44.9')).toBe(false);
  });
});
