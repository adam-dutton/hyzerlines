import { z } from 'zod';

import type { Bounds } from './measure.js';

/**
 * A site survey: elevation the designer brought themselves.
 *
 * The global overlay in `terrain.ts` reads roughly 10m data. That shows a ridge
 * and a fall line and is honest about being nothing more. But LiDAR at 1m exists
 * for most of the US and all of England, free and public domain, and at 1m the
 * questions change: not "which way does this fall" but "how much does it drop
 * between the tee and the landing zone", answered to the foot.
 *
 * Nobody is going to host a global 1m tileset — it is petabytes. But a course is
 * about a square kilometre, and a square kilometre of 1m elevation is a few
 * megabytes. So the designer brings a GeoTIFF for their own site and the app
 * turns it into tiles in the browser. No backend, no key, no per-request cost,
 * and it works anywhere LiDAR is published rather than only where we happened
 * to build an integration.
 *
 * ## What travels in the file, and what does not
 *
 * This metadata is in the document. The pixels are not — they live in IndexedDB
 * keyed by course, because a `.hyzer` is a document you email and forty
 * megabytes of elevation is not.
 *
 * That split is deliberate rather than merely pragmatic. Someone opening a
 * course you sent should be told the design was drawn against a 1m survey, and
 * which one, even though they do not have it — that is a fact about how the
 * course was designed. A missing survey is a missing attachment, not a
 * corrupted document.
 */

export const siteSurveySchema = z.object({
  /** The file it came from. The only name a designer will recognise. */
  name: z.string().min(1).max(200),

  /** Where it covers, in WGS84, after reprojection. */
  bounds: z.tuple([z.number(), z.number(), z.number(), z.number()]),

  /**
   * Ground sample distance actually achieved, in metres.
   *
   * Not the source file's resolution — the resolution of the tiles that were
   * built from it, which may be coarser if the area was large enough that the
   * finest level would not fit in memory. Reporting the source's number when
   * the tiles are half as detailed would be the same overstatement of precision
   * this app exists to avoid.
   */
  resolutionMeters: z.number().positive(),

  /** The projection it arrived in, e.g. `EPSG:26916`. Shown, not used again. */
  crs: z.string().min(1),

  /** Deepest zoom with real detail. Past this the tiles are interpolation. */
  maxZoom: z.number().int().min(0).max(24),
  minZoom: z.number().int().min(0).max(24),

  importedAt: z.string().datetime(),
});

export type SiteSurvey = z.infer<typeof siteSurveySchema>;

/*
 * Web Mercator tile arithmetic.
 *
 * Small enough to write, and worth writing rather than depending on: the whole
 * import turns on getting these right, and a wrong sign here produces terrain
 * that is subtly in the wrong place — which looks like bad data rather than
 * like a bug.
 */

/** Metres per pixel at a given zoom and latitude, for 256px tiles. */
export function metersPerPixel(zoom: number, latitude: number): number {
  const EQUATORIAL_METERS_PER_PIXEL_Z0 = 156543.03392804097;
  return (EQUATORIAL_METERS_PER_PIXEL_Z0 * Math.cos((latitude * Math.PI) / 180)) / 2 ** zoom;
}

/**
 * The shallowest zoom whose pixels are at least as fine as the data.
 *
 * Rounded *up* to the next whole zoom so the tiles never claim less detail than
 * the source carries; going finer than the data would be inventing it, which is
 * what `maxZoom` on the source is for.
 */
export function zoomForResolution(resolutionMeters: number, latitude: number): number {
  const exact = Math.log2(metersPerPixel(0, latitude) / resolutionMeters);
  return Math.max(0, Math.min(22, Math.ceil(exact)));
}

/** Longitude/latitude to fractional tile coordinates at a zoom. */
export function tileForPosition(
  lng: number,
  lat: number,
  zoom: number,
): { x: number; y: number } {
  const n = 2 ** zoom;
  const clamped = Math.max(-85.051129, Math.min(85.051129, lat));
  const radians = (clamped * Math.PI) / 180;
  return {
    x: ((lng + 180) / 360) * n,
    y: ((1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2) * n,
  };
}

/** The WGS84 bounds of a single tile. Inverse of `tileForPosition`. */
export function tileBounds(z: number, x: number, y: number): Bounds {
  const n = 2 ** z;
  const lng = (i: number) => (i / n) * 360 - 180;
  const lat = (j: number) => {
    const t = Math.PI * (1 - (2 * j) / n);
    return (180 / Math.PI) * Math.atan(Math.sinh(t));
  };
  // North is the *smaller* row index: tile y grows southwards.
  return [lng(x), lat(y + 1), lng(x + 1), lat(y)];
}

export interface TileRange {
  z: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** Every tile at `zoom` that touches `bounds`, inclusive. */
export function tileRange(bounds: Bounds, zoom: number): TileRange {
  const [west, south, east, north] = bounds;
  const topLeft = tileForPosition(west, north, zoom);
  const bottomRight = tileForPosition(east, south, zoom);
  const limit = 2 ** zoom - 1;
  const clamp = (v: number) => Math.max(0, Math.min(limit, v));
  return {
    z: zoom,
    minX: clamp(Math.floor(topLeft.x)),
    maxX: clamp(Math.floor(bottomRight.x)),
    minY: clamp(Math.floor(topLeft.y)),
    maxY: clamp(Math.floor(bottomRight.y)),
  };
}

/** How many tiles a range holds. Used to budget the import before running it. */
export const tileCount = (range: TileRange): number =>
  (range.maxX - range.minX + 1) * (range.maxY - range.minY + 1);

/**
 * The same range with a one-tile skirt around it.
 *
 * Not for display. `maplibre-contour` builds every contour tile from a 3×3
 * neighbourhood and rejects the whole tile if any of the nine is missing — so a
 * survey covering fewer than three tiles across, which is most of them, would
 * produce no contours at all. The skirt gives the generator its neighbours.
 *
 * Those tiles are pure edge-clamped extrapolation and must never be drawn; both
 * survey sources carry the survey's real bounds, so MapLibre never asks for
 * them.
 */
export function withMargin(range: TileRange, margin = 1): TileRange {
  const limit = 2 ** range.z - 1;
  const clamp = (v: number) => Math.max(0, Math.min(limit, v));
  return {
    z: range.z,
    minX: clamp(range.minX - margin),
    maxX: clamp(range.maxX + margin),
    minY: clamp(range.minY - margin),
    maxY: clamp(range.maxY + margin),
  };
}

/*
 * Terrarium encoding.
 *
 * `elevation = (R * 256 + G + B / 256) - 32768`, which is what MapLibre's
 * `raster-dem` decoder expects for `encoding: 'terrarium'` and what
 * `maplibre-contour` reads. Writing our own tiles in the same encoding is what
 * lets an imported survey drop into the machinery already built for the global
 * overlay without either side knowing the difference.
 */

/** Elevation below which a sample is treated as absent rather than very low. */
export const NODATA_THRESHOLD = -9000;

/** The terrarium triple for a height in metres. */
export function encodeTerrarium(meters: number): [number, number, number] {
  // Clamped to the range the encoding can hold: -32768m to +32767m covers
  // Challenger Deep to Everest with room to spare, so anything outside it is a
  // nodata sentinel rather than a real height.
  const clamped = Math.max(-32768, Math.min(32767, meters));
  const value = clamped + 32768;
  const r = Math.floor(value / 256);
  const g = Math.floor(value) % 256;
  const b = Math.round((value - Math.floor(value)) * 256) % 256;
  return [r, g, b];
}

/** Metres from a terrarium triple. Inverse of `encodeTerrarium`. */
export const decodeTerrarium = (r: number, g: number, b: number): number =>
  r * 256 + g + b / 256 - 32768;

/** What a nodata pixel encodes to: sea level, the only neutral choice. */
export const TERRARIUM_NODATA: [number, number, number] = encodeTerrarium(0);

/**
 * How many source cells an import may hold in memory at once.
 *
 * A 10km USGS tile at 1m is 100 million float32 samples — 400MB, which is not a
 * thing to allocate in a browser tab. The importer reads a window rather than a
 * file, and steps down through the GeoTIFF's overview levels until the window
 * fits this budget. Sixteen million cells is 64MB as float32, which is large but
 * survivable, and covers about 4km square at 1m.
 *
 * When it does step down, the survey records the resolution it actually got.
 */
export const MAX_SOURCE_CELLS = 16_000_000;

/**
 * Choose the pyramid to build for an area.
 *
 * `maxZoom` follows the data and `minZoom` is four levels above it — enough to
 * keep the survey visible while zooming out to see the whole property, without
 * generating tiles for a continent that is mostly empty. Below `minZoom` the
 * global overlay takes over, which is the right fallback: a 1m survey rendered
 * across a county is a smudge either way.
 */
export function surveyZooms(
  resolutionMeters: number,
  latitude: number,
): { minZoom: number; maxZoom: number } {
  const maxZoom = zoomForResolution(resolutionMeters, latitude);
  return { minZoom: Math.max(0, maxZoom - 4), maxZoom };
}
