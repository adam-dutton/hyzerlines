import type maplibregl from 'maplibre-gl';
import { boundsOf, type Feature } from '@hyzerlines/core';

/**
 * Putting the work on screen.
 *
 * Opening a course and being shown the middle of Kansas — or the corner of a
 * course you were nowhere near — is the fastest way to make a map feel broken.
 * Framing what exists is almost always what someone wants on load, and it is
 * what `Zoom to fit` does on demand.
 */

/**
 * Room left for the docked chrome.
 *
 * Panels float over the map rather than displacing it, which means fitting to
 * the raw viewport would tuck the outermost tees underneath them. These are the
 * panel widths plus a margin, clamped below so the padding can never exceed the
 * space available on a narrow window — MapLibre throws when it does.
 *
 * Top is the larger of the two now that the tool rail is up there with the
 * recenter button beneath it; the bottom carries only a credit line and the
 * camera controls in one corner.
 */
const CHROME_PADDING = { top: 128, bottom: 64, left: 288, right: 288 };

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
  return {
    top: Math.min(CHROME_PADDING.top, maxY),
    bottom: Math.min(CHROME_PADDING.bottom, maxY),
    left: Math.min(CHROME_PADDING.left, maxX),
    right: Math.min(CHROME_PADDING.right, maxX),
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
}

/**
 * Frame a set of features. Returns false when there was nothing to frame, so
 * callers can fall back to a stored camera rather than silently doing nothing.
 */
export function frameFeatures(
  map: maplibregl.Map,
  features: readonly Feature[],
  { duration = 0 }: FrameOptions = {},
): boolean {
  const bounds = boundsOf(features);
  if (!bounds) return false;

  const [west, south, east, north] = bounds;

  /*
   * A single point has no extent, and fitBounds on a zero-size box runs to
   * maxZoom — which lands you inside a single pixel of imagery with no idea
   * where you are.
   */
  if (east - west < DEGENERATE_SPAN_DEGREES && north - south < DEGENERATE_SPAN_DEGREES) {
    const center: [number, number] = [(west + east) / 2, (south + north) / 2];
    if (duration > 0) map.easeTo({ center, zoom: SINGLE_FEATURE_ZOOM, duration });
    else map.jumpTo({ center, zoom: SINGLE_FEATURE_ZOOM });
    return true;
  }

  map.fitBounds(
    [
      [west, south],
      [east, north],
    ],
    {
      padding: padding(map),
      // Not maxZoom 21: filling the screen with two tees a metre apart is
      // technically a fit and practically useless.
      maxZoom: SINGLE_FEATURE_ZOOM,
      duration,
    },
  );
  return true;
}
