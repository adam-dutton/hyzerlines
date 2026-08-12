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
 * spacing gets none at all. Starting at the centre gives the best chance of one,
 * which is the one that matters.
 *
 * ## Spacing is a distance on the screen
 *
 * It was a distance on the ground, on the argument that the lettering is a
 * density over the land. That argument is true and it is the wrong answer:
 * zooming out shrinks the ground under each letter without shrinking the letter,
 * so an area that read as lettered at the zoom it was drawn at became a solid
 * block of OB at the zoom you check the routing from. What a designer means by
 * spacing is how far apart these look. So the caller converts pixels to metres
 * at the zoom being drawn, and these points are regenerated as it changes.
 *
 * ## Nothing is allowed to hang over the edge
 *
 * A label whose glyphs cross the boundary is writing on ground the area does not
 * cover, which on a map about where you may and may not throw is the one thing
 * it must not do. MapLibre cannot clip a symbol layer to a polygon, so the
 * clipping happens here instead: a candidate is dropped unless the whole text
 * box clears every edge. Areas narrower than their own lettering therefore get
 * none, which is the honest outcome — the alternative is OB written across a
 * fairway.
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
 * How many labels one area may produce, and how far the grid may walk.
 *
 * Guards rather than design decisions. Spacing is a screen distance and an area
 * is whatever somebody drew, so at a close zoom over a property-sized polygon
 * the two together can ask for a number bounded only by patience. Both caps are
 * far past the point where the lettering is legible, so reaching either means
 * the answer was going to be unreadable anyway.
 */
const MAX_LABELS = 600;
const MAX_STEPS = 60;

/**
 * How far a set of letters reaches from its own centre, in pixels.
 *
 * Half the diagonal of the text box, so the number holds whatever angle the
 * letters are turned to. The width per character is an approximation of the
 * font's average advance — it does not have to be exact, because it is used to
 * decide whether a label clears a boundary and being slightly generous only
 * costs a label that would have fitted.
 */
const CHARACTER_WIDTH = 0.62;

export function letteringReachPx(text: string, sizePx: number): number {
  const halfWidth = (text.length * CHARACTER_WIDTH * sizePx) / 2;
  const halfHeight = sizePx / 2;
  return Math.hypot(halfWidth, halfHeight);
}

/**
 * The centre of a ring, as the average of its vertices.
 *
 * Not a true centroid, and it does not need to be: this is where a grid starts,
 * so what matters is that it is inside the shape for the shapes people actually
 * draw. A vertex average is that for anything convex and close enough for the
 * rest, and it is stable as a polygon is edited.
 */
export function centreOf(ring: readonly Position[]): Position {
  let lng = 0;
  let lat = 0;
  for (const [x, y] of ring) {
    lng += x;
    lat += y;
  }
  return [lng / ring.length, lat / ring.length];
}

/** How far a point on the plane sits from the nearest edge of the ring. */
function clearanceOf(local: readonly [number, number][], east: number, north: number): number {
  let nearest = Infinity;
  for (let i = 0; i < local.length; i++) {
    const [ax, ay] = local[i]!;
    const [bx, by] = local[(i + 1) % local.length]!;
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSquared = dx * dx + dy * dy;
    // A repeated vertex is a zero-length edge; fall back to the point itself.
    const t =
      lengthSquared === 0
        ? 0
        : Math.min(1, Math.max(0, ((east - ax) * dx + (north - ay) * dy) / lengthSquared));
    nearest = Math.min(nearest, Math.hypot(east - (ax + t * dx), north - (ay + t * dy)));
    if (nearest === 0) return 0;
  }
  return nearest;
}

/**
 * Where the letters go for one area.
 *
 * Walks an axis-aligned grid outward from the centre in a square big enough to
 * cover the ring, keeping the points that land inside it with room for the text.
 *
 * The grid is axis-aligned and stays that way whatever angle the letters are
 * set at. It used to be the grid that turned, which is what "angle" did before:
 * the letters stayed upright and marched diagonally. That is a different effect
 * from the one the control names, and the one it names is the one people want.
 * The angle is now `text-rotate` on the symbol layer.
 */
export function letteringPoints(
  ring: readonly Position[],
  spacingM: number,
  /** How much room the text needs around each point, in metres. */
  reachM: number,
): Position[] {
  if (ring.length < 3 || spacingM <= 0) return [];

  const centre = centreOf(ring);
  const plane = planeAt(centre);
  const local = ring.map((position) => toLocal(plane, position));

  // How far the ring reaches from its centre, so the grid covers it and no more.
  let extent = 0;
  for (const [east, north] of local) extent = Math.max(extent, Math.hypot(east, north));
  if (extent === 0) return [];

  const steps = Math.min(MAX_STEPS, Math.ceil(extent / spacingM));

  const points: Position[] = [];
  for (let row = -steps; row <= steps && points.length < MAX_LABELS; row++) {
    for (let column = -steps; column <= steps && points.length < MAX_LABELS; column++) {
      const east = column * spacingM;
      const north = row * spacingM;
      const at = fromLocal(plane, [east, north]);
      if (!pointInRing(ring, at)) continue;
      // Inside is not enough: the whole set of letters has to clear the border.
      if (clearanceOf(local, east, north) < reachM) continue;
      points.push(at);
    }
  }

  return points;
}
