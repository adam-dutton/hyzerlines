import { describe, expect, it } from 'vitest';

import { createFeature } from './features.js';
import { bearing, distance } from './measure.js';
import type { Position } from './geo.js';
import {
  FAIRWAY_CORRIDOR,
  PLACED_RECTANGLE_DEFAULTS,
  circleRing,
  defaultCorridorWidths,
  fairwayCorridor,
  footprintOf,
  ringSelfIntersects,
} from './geometry.js';
import { TEEING_AREA, TEE_PAD_M } from './pdga.js';

/**
 * Derived geometry.
 *
 * Everything here is computed from something the document does store, and the
 * tests are written in METRES against `distance()` rather than against
 * coordinates. A test that asserted on longitudes would pass while the shape was
 * 40% too wide at this latitude, which is precisely the failure this module
 * exists to prevent.
 */

const AT = [-93.1, 44.9] as Position;

/** How far apart two positions are, rounded to a centimetre. */
const apart = (a: Position, b: Position): number => Math.round(distance(a, b) * 100) / 100;

describe('placed rectangles', () => {
  it('extends backwards from the stored point, which is the front centre', () => {
    // Facing due north: the pad must lie to the SOUTH of the tee line.
    const tee = createFeature(
      'tee',
      { type: 'point', coordinates: AT },
      {
        props: { bearing: 0, width: 2, length: 4 },
      },
    );

    const footprint = footprintOf(tee)!;
    expect(footprint).not.toBeNull();

    const [frontLeft, frontRight, backRight, backLeft] = footprint.ring as [
      Position,
      Position,
      Position,
      Position,
    ];

    // Front edge runs through the stored point.
    expect(apart(frontLeft, AT)).toBeCloseTo(1, 1);
    expect(apart(frontRight, AT)).toBeCloseTo(1, 1);
    expect(apart(frontLeft, frontRight)).toBeCloseTo(2, 1);

    // And the back corners are 4 m behind it — south, not north.
    expect(backLeft[1]).toBeLessThan(AT[1]);
    expect(backRight[1]).toBeLessThan(AT[1]);
    expect(apart(frontLeft, backLeft)).toBeCloseTo(4, 1);

    /*
     * The regression this guards: anchoring at the pad's centre instead of its
     * front would put the tee line half a pad length forward and silently add
     * that to every hole on the course.
     */
    const frontMidpoint: Position = [
      (frontLeft[0] + frontRight[0]) / 2,
      (frontLeft[1] + frontRight[1]) / 2,
    ];
    expect(apart(frontMidpoint, AT)).toBeLessThan(0.01);
  });

  it('rotates with the bearing', () => {
    const east = createFeature(
      'tee',
      { type: 'point', coordinates: AT },
      {
        props: { bearing: 90, width: 2, length: 4 },
      },
    );

    const ring = footprintOf(east)!.ring;
    const backLeft = ring[3]!;

    // Facing east, the pad extends west. Its back edge bears due west of the
    // tee line, give or take the half-width offset.
    const backMidpoint: Position = [
      (ring[2]![0] + backLeft[0]) / 2,
      (ring[2]![1] + backLeft[1]) / 2,
    ];
    expect(bearing(AT, backMidpoint)).toBeCloseTo(270, 0);
    expect(apart(AT, backMidpoint)).toBeCloseTo(4, 1);
  });

  it('falls back to the rules figure for depth and the typical width', () => {
    const bare = createFeature(
      'tee',
      { type: 'point', coordinates: AT },
      {
        props: { bearing: 0 },
      },
    );

    const footprint = footprintOf(bare)!;
    expect(footprint.lengthM).toBe(TEEING_AREA.defaultDepthM);
    expect(footprint.widthM).toBe(TEE_PAD_M.typicalWidth);
    // Flagged, so the interface can say "this is what the rules allow" rather
    // than presenting a default as a measurement.
    expect(footprint.defaulted).toBe(true);
    expect(PLACED_RECTANGLE_DEFAULTS.lengthM).toBe(3);
  });

  it('withholds the rectangle when nothing says which way it faces', () => {
    const unoriented = createFeature('tee', { type: 'point', coordinates: AT });
    expect(footprintOf(unoriented)).toBeNull();

    // A caller that knows — from the tee's own target — supplies one.
    expect(footprintOf(unoriented, 45)?.bearingDeg).toBe(45);

    // The feature's own bearing wins over the caller's.
    const stated = createFeature(
      'tee',
      { type: 'point', coordinates: AT },
      {
        props: { bearing: 10 },
      },
    );
    expect(footprintOf(stated, 200)?.bearingDeg).toBe(10);
  });

  it('is only for kinds that are a point plus a rectangle', () => {
    const dropzone = createFeature(
      'dropzone',
      { type: 'point', coordinates: AT },
      {
        props: { bearing: 0 },
      },
    );
    expect(footprintOf(dropzone)).not.toBeNull();

    const target = createFeature(
      'target',
      { type: 'point', coordinates: AT },
      {
        props: { bearing: 0 },
      },
    );
    expect(footprintOf(target)).toBeNull();
  });
});

/* ------------------------------------------------------------------------- */

const metersPerDegreeLat = distance([0, 44.9], [0, 45.9]);
const north = (meters: number): number => AT[1] + meters / metersPerDegreeLat;
const east = (meters: number): number =>
  AT[0] + meters / (metersPerDegreeLat * Math.cos((44.9 * Math.PI) / 180));

/**
 * The corridor's full width across one vertex.
 *
 * The ring runs down the left side and back up the right, so the point mirroring
 * vertex `index` is the same distance in from the other end.
 */
function widthAcross(ring: readonly Position[], index: number): number {
  return apart(ring[index]!, ring[ring.length - 1 - index]!);
}

describe('fairway corridors', () => {
  it('tapers from the tee width to Circle 1 at the target', () => {
    const line: Position[] = [AT, [AT[0], north(200)]];
    const corridor = fairwayCorridor(line, { atStart: 2, atEnd: 10 })!;

    expect(widthAcross(corridor.ring, 0)).toBeCloseTo(2, 1);
    expect(widthAcross(corridor.ring, 1)).toBeCloseTo(10, 1);
    expect(corridor.selfIntersects).toBe(false);
  });

  it('the target width is Circle 1, not a number of its own', () => {
    // Pins the link: if TARGET_CIRCLES ever changes, this says so out loud
    // rather than the corridor quietly becoming a different shape.
    expect(FAIRWAY_CORRIDOR.widthAtTargetM).toBe(10);
  });

  it('interpolates by distance along the line, not by vertex index', () => {
    /*
     * The bug this exists for: a hole with a 10 m first leg and a 190 m second
     * one has its middle vertex 5% of the way down the fairway. Interpolating by
     * index would put it at 50% — a corridor that balloons to its full width in
     * the first ten metres and then runs parallel for the rest of the hole.
     */
    const line: Position[] = [AT, [AT[0], north(10)], [AT[0], north(200)]];
    const corridor = fairwayCorridor(line, { atStart: 2, atEnd: 10 })!;

    const atMiddleVertex = widthAcross(corridor.ring, 1);
    expect(atMiddleVertex).toBeCloseTo(2.4, 1); // 2 + 8 × (10/200)
    expect(atMiddleVertex).toBeLessThan(3);
  });

  it('clamps the mitre at a sharp dogleg', () => {
    // A near-hairpin. Unclamped, the outside corner runs to width/cos(θ/2),
    // which heads for infinity as the turn closes up.
    const line: Position[] = [AT, [east(100), AT[1]], [east(2), north(4)]];
    const corridor = fairwayCorridor(line, { atStart: 10, atEnd: 10 })!;

    const corner = corridor.ring[1]!;
    const spike = distance(corner, [east(100), AT[1]]);
    expect(spike).toBeLessThanOrEqual(5 * FAIRWAY_CORRIDOR.miterLimit + 0.01);
  });

  it('reports a corridor that folds over itself', () => {
    // A turn far sharper than the corridor is wide: the inside edge crosses
    // itself, and the polygon stops describing ground.
    const hairpin: Position[] = [AT, [AT[0], north(30)], [east(3), AT[1]]];
    expect(fairwayCorridor(hairpin, { atStart: 40, atEnd: 40 })!.selfIntersects).toBe(true);

    // The same turn with a corridor narrow enough to get around it is fine.
    expect(fairwayCorridor(hairpin, { atStart: 2, atEnd: 2 })!.selfIntersects).toBe(false);
  });

  it('refuses geometry with no length', () => {
    expect(fairwayCorridor([AT], { atStart: 2, atEnd: 10 })).toBeNull();
    // Two identical points is a click, not a fairway. Consecutive duplicates
    // are what a double-click that finishes a line actually leaves behind.
    expect(fairwayCorridor([AT, AT], { atStart: 2, atEnd: 10 })).toBeNull();
    expect(
      fairwayCorridor([AT, AT, [AT[0], north(50)]], { atStart: 2, atEnd: 10 }),
    ).not.toBeNull();
  });

  it('takes its tee-end width from the pad, with a floor and a fallback', () => {
    expect(defaultCorridorWidths(6).atStart).toBe(6);
    // No pad width set: the typical pad width from [ELEMENTS] p2.
    expect(defaultCorridorWidths(null).atStart).toBe(TEE_PAD_M.typicalWidth);
    // A pad narrower than the floor still gets a drawable corridor.
    expect(defaultCorridorWidths(0.2).atStart).toBe(FAIRWAY_CORRIDOR.minimumWidthAtTeeM);
    expect(defaultCorridorWidths(6).atEnd).toBe(10);
  });
});

describe('rings', () => {
  it('finds a bowtie and leaves a simple ring alone', () => {
    const square: Position[] = [
      AT,
      [east(50), AT[1]],
      [east(50), north(50)],
      [AT[0], north(50)],
    ];
    expect(ringSelfIntersects(square)).toBe(false);

    // Swap two corners and the same four points become a bowtie.
    const bowtie: Position[] = [
      AT,
      [east(50), AT[1]],
      [AT[0], north(50)],
      [east(50), north(50)],
    ];
    expect(ringSelfIntersects(bowtie)).toBe(true);
  });

  it('draws a circle of the radius asked for, in metres', () => {
    const ring = circleRing(AT, 10, 32);
    expect(ring).toHaveLength(32);
    for (const point of ring) expect(distance(AT, point)).toBeCloseTo(10, 1);
  });
});
