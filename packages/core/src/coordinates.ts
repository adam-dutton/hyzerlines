import type { Position } from './geo.js';

/**
 * Reading and writing a position the way a person writes one.
 *
 * The document stores `[lng, lat]` because GeoJSON and MapLibre do — see the
 * note in `geo.ts`. **People write latitude first**, universally: Google Maps,
 * every handheld GPS, every permit application. So this module is the seam
 * between the two conventions, and it exists as one module precisely so the
 * transposition happens in exactly one place that can be tested.
 *
 * Getting that backwards is the classic coordinate bug and it is not subtle in
 * its consequences — a Minnesota course at `44.9, -93.1` read the wrong way
 * round lands at `-93.1, 44.9`, which is not a valid latitude at all, and one
 * at `40, -75` lands in Kazakhstan. Every function here names its order.
 *
 * ## What it has to accept
 *
 * Whatever the designer has in their hand. That is realistically:
 *
 * - `44.901234, -93.123457` — Google Maps' "copy coordinates"
 * - `44.901234 -93.123457` — the same, pasted out of a spreadsheet
 * - `44° 54' 4.4" N, 93° 7' 24.4" W` — degrees/minutes/seconds, off a permit
 * - `44 54.073 N, 93 7.407 W` — degrees and decimal minutes, which is what
 *   Garmin handhelds show by default
 *
 * Rejecting the last two would mean telling somebody holding a GPS unit to go
 * and convert their own coordinates first, which is the app declining to do
 * arithmetic that is entirely mechanical.
 */

/**
 * Decimal places shown, and the reason it is six.
 *
 * A millionth of a degree is about 11cm at the equator — finer than any
 * handheld GPS and finer than 1m LiDAR. That is deliberate and is **not** a
 * claim about accuracy: this is the position the document holds, its address
 * rather than a measurement of it. Rounding the display to something coarser
 * would mean a designer who opened the field and closed it again moved their
 * tee by half a metre.
 */
export const COORDINATE_DECIMALS = 6;

export const LATITUDE_RANGE = { min: -90, max: 90 } as const;
export const LONGITUDE_RANGE = { min: -180, max: 180 } as const;

export type Axis = 'latitude' | 'longitude';

const RANGE = { latitude: LATITUDE_RANGE, longitude: LONGITUDE_RANGE } as const;

/** One coordinate, at the precision above. Trailing zeros kept, so fields align. */
export const formatCoordinate = (degrees: number): string =>
  degrees.toFixed(COORDINATE_DECIMALS);

/** A position as a person writes it: **latitude first**, comma separated. */
export const formatPosition = (position: Position): string =>
  `${formatCoordinate(position[1])}, ${formatCoordinate(position[0])}`;

export const inRange = (degrees: number, axis: Axis): boolean =>
  Number.isFinite(degrees) && degrees >= RANGE[axis].min && degrees <= RANGE[axis].max;

/**
 * Normalise the punctuation people paste along with their numbers.
 *
 * Degree signs, primes and quotes carry no information once the numbers are
 * separated out — they are only there to say "this group is degrees, minutes,
 * seconds", which the *count* of numbers already says. Smart quotes are here
 * because pasting out of a PDF or a Word document is how a permit's coordinates
 * usually arrive.
 */
const clean = (text: string): string =>
  text
    .replace(/[°‘’“”′″'"`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const HEMISPHERE: Record<string, { axis: Axis; sign: number }> = {
  N: { axis: 'latitude', sign: 1 },
  S: { axis: 'latitude', sign: -1 },
  E: { axis: 'longitude', sign: 1 },
  W: { axis: 'longitude', sign: -1 },
};

interface Parsed {
  degrees: number;
  /** Which axis the text said it was, when it said. `null` when it did not. */
  axis: Axis | null;
}

/**
 * One coordinate in any of the four notations.
 *
 * Degrees, minutes and seconds are simply "the numbers, in order" — one number
 * is degrees, two is degrees and decimal minutes, three is degrees, minutes and
 * seconds. That is the whole grammar, and it is why the punctuation can be
 * thrown away first.
 */
function parseOne(text: string): Parsed | null {
  const cleaned = clean(text).toUpperCase();
  if (cleaned === '') return null;

  let axis: Axis | null = null;
  let sign = 1;

  const letters = cleaned.match(/[NSEW]/g) ?? [];
  if (letters.length > 1) return null;
  if (letters.length === 1) {
    const hemisphere = HEMISPHERE[letters[0]!]!;
    axis = hemisphere.axis;
    sign = hemisphere.sign;
  }

  const body = cleaned.replace(/[NSEW]/g, ' ');
  // Anything left that is not a number, a sign or a separator means this was
  // not a coordinate — better to refuse than to find digits inside a sentence.
  if (/[^0-9+\-. ]/.test(body)) return null;

  const numbers = body.match(/[+-]?\d*\.?\d+/g);
  if (!numbers || numbers.length === 0 || numbers.length > 3) return null;

  const values = numbers.map(Number);
  if (values.some((value) => !Number.isFinite(value))) return null;

  /*
   * The sign belongs to the whole coordinate, not to the minutes.
   *
   * `-93 7 24.4` is 93°7'24.4" west, so the magnitude is built from positive
   * parts and negated at the end. Adding a negative minutes term instead would
   * give 92.87°, which is a kilometre and a half away and looks entirely
   * plausible on a map.
   */
  const [first, ...rest] = values;
  if (rest.some((value) => value < 0)) return null;
  // Minutes and seconds are sixtieths; anything at or past 60 is a typo, not a
  // coordinate, and silently carrying it would move the point.
  if (rest.some((value) => value >= 60)) return null;

  const negative = first! < 0 || sign < 0;
  const magnitude = Math.abs(first!) + (rest[0] ?? 0) / 60 + (rest[1] ?? 0) / 3600;

  // Both a minus sign and a southern/western hemisphere letter is a
  // contradiction the reader has to resolve, not us.
  if (first! < 0 && sign < 0) return null;

  return { degrees: negative ? -magnitude : magnitude, axis };
}

/**
 * A single coordinate for a known axis, or null when it is not one.
 *
 * The axis is supplied because a field labelled "Latitude" already knows; when
 * the *text* disagrees — `93 W` typed into the latitude box — that is a
 * mistake worth refusing rather than quietly accepting a longitude.
 */
export function parseCoordinate(text: string, axis: Axis): number | null {
  const parsed = parseOne(text);
  if (!parsed) return null;
  if (parsed.axis !== null && parsed.axis !== axis) return null;
  return inRange(parsed.degrees, axis) ? parsed.degrees : null;
}

/**
 * A whole position from one string, returned in the document's `[lng, lat]`.
 *
 * The reason this exists is the paste. Copying a coordinate from Google Maps
 * gives you both numbers in one string, and pasting that into a field labelled
 * "Latitude" should not silently take the first number and drop the second —
 * that is a feature landing a hundred kilometres away with no error shown.
 *
 * **Latitude is assumed first** when the text does not say otherwise, because
 * every source a designer copies from writes it that way. When hemisphere
 * letters are present they decide instead, so `93 W, 44 N` is read correctly
 * however it was ordered.
 */
export function parsePosition(text: string): Position | null {
  const cleaned = clean(text);
  if (cleaned === '') return null;

  const halves = splitPair(cleaned);
  if (!halves) return null;

  const first = parseOne(halves[0]);
  const second = parseOne(halves[1]);
  if (!first || !second) return null;

  // Two of the same axis is not a position, however well formed each half is.
  if (first.axis !== null && first.axis === second.axis) return null;

  const latitudeFirst =
    first.axis === 'latitude' || second.axis === 'longitude' || first.axis === null;

  const latitude = latitudeFirst ? first.degrees : second.degrees;
  const longitude = latitudeFirst ? second.degrees : first.degrees;

  if (!inRange(latitude, 'latitude') || !inRange(longitude, 'longitude')) return null;
  return [longitude, latitude];
}

/**
 * Cut a pasted string into its two coordinates.
 *
 * A comma is unambiguous and is what every "copy coordinates" produces, so it
 * wins. Failing that, a hemisphere letter ends the coordinate it belongs to —
 * `44 54 4.4 N 93 7 24.4 W` has no other structure to go on.
 *
 * Only then does whitespace get a turn, and only for exactly two numbers.
 * `44 54 4.4 93 7 24.4` could be split three ways and no reading is more
 * defensible than another, so it is refused. Guessing there would put a course
 * somewhere plausible-looking and wrong.
 */
function splitPair(cleaned: string): [string, string] | null {
  const comma = cleaned.indexOf(',');
  if (comma !== -1) {
    const rest = cleaned.slice(comma + 1);
    // A second comma means this is a list of something, not a position.
    if (rest.includes(',')) return null;
    return [cleaned.slice(0, comma), rest];
  }

  const letters = [...cleaned.matchAll(/[NSEWnsew]/g)];
  if (letters.length === 2) {
    const cut = letters[0]!.index + 1;
    return [cleaned.slice(0, cut), cleaned.slice(cut)];
  }

  const numbers = cleaned.match(/[+-]?\d*\.?\d+/g);
  if (numbers?.length === 2) {
    const cut = cleaned.indexOf(numbers[1]!, numbers[0]!.length);
    if (cut > 0) return [cleaned.slice(0, cut), cleaned.slice(cut)];
  }

  return null;
}

/** Whether a string carries both coordinates. Decides if a paste fills two fields. */
export const isPositionText = (text: string): boolean => parsePosition(text) !== null;
