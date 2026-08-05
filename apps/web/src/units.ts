/**
 * Units.
 *
 * All internal geometry is metric — meters, always, with no exceptions — and
 * conversion happens only at the display boundary. Mixed-unit internals are the
 * classic way a measurement tool ends up quietly wrong, and this app's entire
 * value proposition is that its numbers are right.
 *
 * Feet is the default because disc golf distances are quoted in feet almost
 * everywhere the sport is played, including by the PDGA.
 */

export type UnitSystem = 'imperial' | 'metric';

const STORAGE_KEY = 'hyzerlines.units';
const FEET_PER_METER = 3.280839895;

export function getStoredUnits(): UnitSystem {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === 'metric' ? 'metric' : 'imperial';
  } catch {
    return 'imperial';
  }
}

export function storeUnits(units: UnitSystem): void {
  try {
    localStorage.setItem(STORAGE_KEY, units);
  } catch {
    /* non-fatal */
  }
}

export const toFeet = (meters: number): number => meters * FEET_PER_METER;
export const toMeters = (feet: number): number => feet / FEET_PER_METER;

/**
 * Format a distance for display. Hole lengths are whole units — a tee-to-basket
 * measurement claiming decimal precision would be lying about what the imagery
 * and GPS underneath it can actually support.
 */
export function formatDistance(meters: number, units: UnitSystem): string {
  if (units === 'metric') {
    return meters >= 1000 ? `${trim(meters / 1000)} km` : `${Math.round(meters)} m`;
  }
  const feet = toFeet(meters);
  return feet >= 5280 ? `${trim(feet / 5280)} mi` : `${Math.round(feet)} ft`;
}

/**
 * A range, in one unit throughout.
 *
 * `formatDistance` switches to miles or kilometres past a threshold, which is
 * right for a single measurement and wrong for a span: a course length range of
 * "4500 ft to 1.42 mi" makes the reader convert one end in their head to know
 * whether their course fits. Both bounds take the unit the lower one would use.
 */
export function formatRange(minMeters: number, maxMeters: number, units: UnitSystem): string {
  const suffix = units === 'metric' ? 'm' : 'ft';
  const value = (meters: number) =>
    Math.round(units === 'metric' ? meters : toFeet(meters)).toLocaleString();
  return `${value(minMeters)}–${value(maxMeters)} ${suffix}`;
}

/**
 * Format an area for display.
 *
 * **Acres in imperial, hectares in metric**, not square feet or square metres.
 * A property boundary is quoted in acres by every parks department, landowner
 * and land registry the sport deals with — and it is the unit the PDGA's own
 * acreage chart is published in, which is what makes a measured site comparable
 * with it at all.
 *
 * Small areas fall back to squared linear units, because "0.01 acres" for a tee
 * pad apron is a number nobody can picture.
 */
const SQUARE_METRES_PER_ACRE = 4046.8564224;
const SQUARE_METRES_PER_HECTARE = 10000;

export function formatArea(squareMeters: number, units: UnitSystem): string {
  if (units === 'metric') {
    return squareMeters >= SQUARE_METRES_PER_HECTARE
      ? `${trim(squareMeters / SQUARE_METRES_PER_HECTARE)} ha`
      : `${Math.round(squareMeters).toLocaleString()} m²`;
  }
  const acres = squareMeters / SQUARE_METRES_PER_ACRE;
  return acres >= 0.1
    ? `${trim(acres)} acres`
    : `${Math.round(toFeet(toFeet(squareMeters))).toLocaleString()} ft²`;
}

/**
 * Two decimals at most, and none that are only zeros. `500.00 mi` reads as a
 * precision claim the number does not deserve; `500 mi` is the same value
 * without the noise.
 */
function trim(value: number): string {
  return Number(value.toFixed(2)).toString();
}

/** Elevation deltas always carry a sign — direction is the whole point. */
export function formatElevation(meters: number, units: UnitSystem): string {
  const value = units === 'metric' ? meters : toFeet(meters);
  const suffix = units === 'metric' ? 'm' : 'ft';
  const sign = value > 0 ? '+' : '';
  return `${sign}${Math.round(value)} ${suffix}`;
}
