import type maplibregl from 'maplibre-gl';
import { boundsOf, type Feature } from '@hyzerlines/core';

import {
  GAP,
  GUTTER,
  TOOL_BAR_BOTTOM,
  TOOL_BAR_HEIGHT,
  TOP_BAR_HEIGHT,
  shellEdges,
} from '../chrome/layout';

/**
 * Putting the work on screen.
 *
 * Opening a course and being shown the middle of Kansas — or the corner of a
 * course you were nowhere near — is the fastest way to make a map feel broken.
 * Framing what exists is almost always what someone wants on load, and it is
 * what `Zoom to fit` does on demand.
 */

/**
 * The safe area: the map you can actually see, with the chrome subtracted.
 *
 * Panels float over the map rather than displacing it, so fitting to the raw
 * viewport tucks the outermost tees underneath them. Framing means framing into
 * *this*, not into the canvas.
 *
 * Derived from the shell's own metrics rather than restated. They were literals
 * here — 288px columns and a 128px top — describing a layout two rewrites ago:
 * the columns are 268 now and the chrome above and below is a top bar and a
 * tool bar, so every fit was being padded for furniture that had moved. Read
 * from `layout.ts` and the numbers cannot drift again.
 */
const chromePadding = () => ({
  top: TOP_BAR_HEIGHT + GAP,
  // The whole tool bar — the gap under it, the bar itself, and a gap above.
  // Subtracting only `TOOL_BAR_BOTTOM` clears the attribution line and leaves
  // the palette sitting on the map, which is where a fitted tee ended up.
  bottom: TOOL_BAR_BOTTOM + TOOL_BAR_HEIGHT + GAP,
  // Read at call time, not at module load: the rail is two widths and the
  // drawer is open or shut, so framing has to ask what the chrome is covering
  // *now*. See `shellEdges`.
  left: shellEdges.rail + GUTTER,
  right: shellEdges.drawer + GUTTER,
});

/** A course this small is a single tee, not an extent worth fitting to. */
const DEGENERATE_SPAN_DEGREES = 1e-6;

/** Close enough to read a basket, far enough to see the ground around it. */
const SINGLE_FEATURE_ZOOM = 18;

function padding(map: maplibregl.Map) {
  const canvas = map.getCanvas();
  // Never more than a third of the viewport per side, so a phone-width window
  // still gets a usable box instead of a negative one.
  const maxX = canvas.clientWidth / 3;
  const maxY = canvas.clientHeight / 3;
  const chrome = chromePadding();
  return {
    top: Math.min(chrome.top, maxY),
    bottom: Math.min(chrome.bottom, maxY),
    left: Math.min(chrome.left, maxX),
    right: Math.min(chrome.right, maxX),
  };
}

/**
 * Whether the course has been left behind.
 *
 * Two ways to lose it, and they need one answer because the fix is the same:
 * pan until it is off the edge, or zoom out until it is a speck. The second is
 * the one people do by accident — a couple of scroll-wheel flicks and the
 * course is four pixels across in the middle of a county.
 *
 * Returns false when there is nothing drawn. An empty course cannot be lost.
 */
export function courseIsAdrift(map: maplibregl.Map, features: readonly Feature[]): boolean {
  const bounds = boundsOf(features);
  if (!bounds) return false;

  const [west, south, east, north] = bounds;
  const canvas = map.getCanvas();
  const corners = [
    map.project([west, south]),
    map.project([east, north]),
    map.project([west, north]),
    map.project([east, south]),
  ];

  const left = Math.min(...corners.map((p) => p.x));
  const right = Math.max(...corners.map((p) => p.x));
  const top = Math.min(...corners.map((p) => p.y));
  const bottom = Math.max(...corners.map((p) => p.y));

  // Entirely outside the viewport, on any side.
  if (right < 0 || left > canvas.clientWidth || bottom < 0 || top > canvas.clientHeight) {
    return true;
  }

  /*
   * Or on screen but too small to work with. A tenth of the shorter viewport
   * edge is about where a nine-hole course stops being a course and starts
   * being a smudge — far enough out that you are navigating, not designing.
   */
  const span = Math.max(right - left, bottom - top);
  const viewport = Math.min(canvas.clientWidth, canvas.clientHeight);
  return span < viewport * 0.1;
}

export interface FrameOptions {
  /** 0 jumps. Use a duration for a deliberate gesture, not for a document load. */
  duration?: number;
  /**
   * Turn the map so this compass bearing points up the screen.
   *
   * For a hole, the bearing from the tee to the basket — so the shot runs away
   * from the reader the way it runs away from the player standing on the pad.
   * A designer judging whether a gap is throwable is imagining the view from
   * the tee, and a north-up map asks them to do that rotation in their head
   * for every hole on the course.
   *
   * Omitted leaves the current bearing alone. Framing the whole course must not
   * spin the map — there is no single direction a course faces.
   */
  bearing?: number;
}

/**
 * Frame a set of features. Returns false when there was nothing to frame, so
 * callers can fall back to a stored camera rather than silently doing nothing.
 */
export function frameFeatures(
  map: maplibregl.Map,
  features: readonly Feature[],
  { duration = 0, bearing }: FrameOptions = {},
): boolean {
  const bounds = boundsOf(features);
  if (!bounds) return false;

  const [west, south, east, north] = bounds;
  const turn = bearing === undefined ? {} : { bearing };

  /*
   * A single point has no extent, and fitBounds on a zero-size box runs to
   * maxZoom — which lands you inside a single pixel of imagery with no idea
   * where you are.
   */
  if (east - west < DEGENERATE_SPAN_DEGREES && north - south < DEGENERATE_SPAN_DEGREES) {
    const center: [number, number] = [(west + east) / 2, (south + north) / 2];
    const camera = { center, zoom: SINGLE_FEATURE_ZOOM, ...turn };
    if (duration > 0) map.easeTo({ ...camera, duration });
    else map.jumpTo(camera);
    return true;
  }

  /*
   * The fit is computed rather than applied, so the bearing is part of the same
   * calculation instead of a second move after it.
   *
   * `fitBounds` with a bearing fits the box *as rotated*, which is what a hole
   * needs: a shot running east is a wide flat box north-up and a tall narrow one
   * once the map has turned to face it, and fitting the unrotated box would
   * leave two thirds of the screen empty. Turning after the fit would also frame
   * it twice and animate through a wrong camera on the way.
   */
  const camera = map.cameraForBounds(
    [
      [west, south],
      [east, north],
    ],
    {
      padding: padding(map),
      ...turn,
    },
  );

  if (!camera) return false;

  map.easeTo({
    ...camera,
    // Not maxZoom 21: filling the screen with two tees a metre apart is
    // technically a fit and practically useless.
    zoom: Math.min(camera.zoom ?? SINGLE_FEATURE_ZOOM, SINGLE_FEATURE_ZOOM),
    duration,
  });
  return true;
}
