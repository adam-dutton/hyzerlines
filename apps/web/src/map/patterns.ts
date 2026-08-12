import { pointInRing, planeAt, fromLocal, toLocal, type Position } from '@hyzerlines/core';
import type { FeatureKind } from '@hyzerlines/core';

/**
 * The repeating lettering over a regulated area.
 *
 * A course map shades out-of-bounds and writes OB across it, and the writing is
 * what makes it unambiguous: four regulated areas in four shades of the same
 * idea are four things you have to remember, where OB, HZ, CAS and REL are four
 * things you can read.
 *
 * ## Labels on a grid, not a tiled image
 *
 * `fill-pattern` was the obvious tool and is the wrong one. A fill pattern is
 * rendered in tile space, so it **turns with the map** — and selecting a hole
 * spins the camera to face the shot, which left every OB area written sideways
 * or upside down. Text that has to stay upright has to be a symbol layer, which
 * is viewport-aligned by default and stays the right way up however the camera
 * moves.
 *
 * So the labels are generated here: a grid of points across each area, clipped
 * to it, and handed to a symbol layer as ordinary features.
 *
 * ## The grid starts at the middle
 *
 * Seeded from the polygon's own centre rather than from a global origin, and
 * that is what makes a *small* area readable — a grid anchored anywhere else
 * lands its letters wherever they happen to fall, and a pond narrower than the
 * spacing gets none at all. Starting at the centre guarantees one, which is the
 * one that matters.
 *
 * Spacing is in metres, because it is a density over the land: how much ground
 * one "OB" is responsible for. A pixel spacing would multiply the labels every
 * time you zoomed out, which is the opposite of what a designer means by it.
 */

/** What each regulated area is called, in the letters a course map uses. */
export const PATTERN_TEXT: Partial<Record<FeatureKind, string>> = {
  ob: 'OB',
  hazard: 'HZ',
  casualArea: 'CAS',
  requiredRelief: 'REL',
};

export const hasPattern = (kind: FeatureKind): boolean => kind in PATTERN_TEXT;

export const letteringLayer = (kind: FeatureKind): string => `features-${kind}-lettering`;

/**
 * How many labels one area may produce.
 *
 * A guard rather than a design decision. Spacing is a distance and an area is
 * whatever somebody drew, so the two together can ask for a number bounded only
 * by patience — a five-metre spacing over a property-sized polygon is tens of
 * thousands of symbols and a frozen tab. Reaching this cap means the lettering
 * is far too dense to read anyway, so stopping is also the right *drawing*.
 */
const MAX_LABELS = 600;

/**
 * The centre of a ring, as the average of its vertices.
 *
 * Not a true centroid, and it does not need to be: this is where a grid starts,
 * so what matters is that it is inside the shape for the shapes people actually
 * draw. A vertex average is that for anything convex and close enough for the
 * rest, and it is stable as a polygon is edited.
 */
function centreOf(ring: readonly Position[]): Position {
  let lng = 0;
  let lat = 0;
  for (const [x, y] of ring) {
    lng += x;
    lat += y;
  }
  return [lng / ring.length, lat / ring.length];
}

/**
 * Where the letters go for one area.
 *
 * Walks a grid outward from the centre in a square big enough to cover the
 * ring's extent, keeping the points that land inside it.
 */
export function letteringPoints(
  ring: readonly Position[],
  spacingM: number,
  angleDeg: number,
): Position[] {
  if (ring.length < 3 || spacingM <= 0) return [];

  const centre = centreOf(ring);
  const plane = planeAt(centre);
  const local = ring.map((position) => toLocal(plane, position));

  // How far the ring reaches from its centre, so the grid covers it and no more.
  let reach = 0;
  for (const [east, north] of local) reach = Math.max(reach, Math.hypot(east, north));
  if (reach === 0) return [];

  const steps = Math.ceil(reach / spacingM);
  const radians = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  const points: Position[] = [];
  for (let row = -steps; row <= steps && points.length < MAX_LABELS; row++) {
    for (let column = -steps; column <= steps && points.length < MAX_LABELS; column++) {
      // The grid is rotated, so the letters march at an angle across the area
      // while each one stays upright — the angle tilts the pattern, not the text.
      const east = column * spacingM * cos - row * spacingM * sin;
      const north = column * spacingM * sin + row * spacingM * cos;
      const at = fromLocal(plane, [east, north]);
      if (pointInRing(ring, at)) points.push(at);
    }
  }

  return points;
}
