import { describe, expect, it } from 'vitest';

import { createFeature } from './features.js';
import { createHole } from './holes.js';
import type { Position } from './geo.js';
import { ringArea } from './measure.js';
import { createCourse } from './schema.js';
import { courseAcreage } from './acreage.js';
import { checkCourse } from './rules.js';
import { ACREAGE, acreageRange, acresToSquareMeters, squareMetersToAcres } from './pdga.js';

/**
 * Area, and the acreage chart it is compared against.
 *
 * This is the number a designer prints and takes to a parks department, so the
 * tests are anchored to independently known values rather than to whatever the
 * code currently returns.
 */

/** A square of a given side, in metres, at a mid-latitude. */
function square(sideMeters: number, atLat = 44.9): Position[] {
  const perDegLat = 111194.9266;
  const dLat = sideMeters / perDegLat;
  const dLng = sideMeters / (perDegLat * Math.cos((atLat * Math.PI) / 180));
  return [
    [-93.1, atLat],
    [-93.1 + dLng, atLat],
    [-93.1 + dLng, atLat + dLat],
    [-93.1, atLat + dLat],
  ];
}

describe('ringArea', () => {
  /*
   * Anchored to arithmetic, not to our own output: a 100 m square is 10,000 m²
   * by definition, so this catches a wrong formula rather than merely a changed
   * one. Within a tenth of a percent, which is the curvature over 100 m.
   */
  it('measures a square of known side', () => {
    expect(ringArea(square(100))).toBeCloseTo(10_000, -1);
    expect(ringArea(square(500))).toBeCloseTo(250_000, -3);
  });

  it('does not care which way round the ring was drawn', () => {
    const ring = square(200);
    expect(ringArea([...ring].reverse())).toBeCloseTo(ringArea(ring), 6);
  });

  it('is zero for anything that encloses nothing', () => {
    expect(ringArea([])).toBe(0);
    expect(
      ringArea([
        [-93.1, 44.9],
        [-93.0, 44.9],
      ]),
    ).toBe(0);
  });

  /*
   * The reason this uses the spherical formula rather than a projected one: a
   * degree of longitude is 40% shorter at this latitude than at the equator, so
   * a flat shoelace in degrees would report the same ring as far larger here.
   */
  it('does not inflate a polygon with latitude', () => {
    // Same ground dimensions, two very different latitudes.
    const near = ringArea(square(300, 5));
    const far = ringArea(square(300, 60));
    expect(far).toBeCloseTo(near, -3);
  });

  it('round-trips through acres', () => {
    expect(squareMetersToAcres(acresToSquareMeters(26))).toBeCloseTo(26, 9);
    // One acre is 43,560 square feet, which is this many square metres.
    expect(acresToSquareMeters(1)).toBeCloseTo(4046.8564224, 6);
  });
});

describe('acreageRange', () => {
  it('spans the chart’s own three columns', () => {
    // [ACREAGE] Blue / average foliage: 14, 18, 22 acres.
    expect(acreageRange('blue', 'average')).toEqual({
      minAcres: 14,
      maxAcres: 22,
      minScale: 'minimum',
      maxScale: 'championship',
    });
  });

  /*
   * Green has no row in the published chart. Null rather than zeroes, so a
   * caller notices the gap instead of showing guidance the PDGA never gave.
   */
  it('is null where the chart has no row', () => {
    expect(ACREAGE.green).toBeNull();
    expect(acreageRange('green', 'average')).toBeNull();
  });
});

/* ------------------------------------------------------------------------- */

/** A course with one blue tee, a target, and a boundary of a given size. */
function site(acres: number | null, foliage?: string) {
  const tee = createFeature(
    'tee',
    { type: 'point', coordinates: [-93.1, 44.9] },
    {
      props: { color: 'blue' },
    },
  );
  const target = createFeature('target', {
    type: 'point',
    coordinates: [-93.099, 44.9],
  });
  const hole = createHole(1, { teeIds: [tee.id], targetIds: [target.id] });

  const features = [tee, target];
  if (acres !== null) {
    const side = Math.sqrt(acresToSquareMeters(acres));
    features.push(
      createFeature(
        'boundary',
        { type: 'polygon', coordinates: square(side) },
        foliage ? { props: { foliage } } : {},
      ),
    );
  }

  return createCourse({ features, holes: [hole] });
}

describe('courseAcreage', () => {
  it('measures nothing when no boundary is drawn', () => {
    const acreage = courseAcreage(site(null));
    expect(acreage.boundaryCount).toBe(0);
    expect(acreage.acres).toBe(0);
    // No boundary means no verdict — not a verdict of "too small".
    expect(acreage.verdict).toBeNull();
  });

  it('withholds the comparison until a foliage density is set', () => {
    const acreage = courseAcreage(site(18));
    expect(acreage.acres).toBeCloseTo(18, 1);
    expect(acreage.skill).toBe('blue');
    // The chart is indexed by density and publishes three columns with none
    // marked typical, so there is nothing to default to.
    expect(acreage.density).toBeNull();
    expect(acreage.guidance).toBeNull();
    expect(acreage.verdict).toBeNull();
  });

  it('places the site against the published span', () => {
    // Blue / average is 14–22 acres.
    expect(courseAcreage(site(18, 'average')).verdict).toBe('inside');
    expect(courseAcreage(site(6, 'average')).verdict).toBe('below');
    expect(courseAcreage(site(40, 'average')).verdict).toBe('above');
  });

  it('reports the finding only when it lands outside', () => {
    const ids = (course: ReturnType<typeof site>) => checkCourse(course).map((f) => f.ruleId);

    expect(ids(site(18, 'average'))).not.toContain('pdga.acreage-outside-range');
    expect(ids(site(6, 'average'))).toContain('pdga.acreage-outside-range');
    // …and never without a density to index the chart by.
    expect(ids(site(6))).not.toContain('pdga.acreage-outside-range');
  });
});
