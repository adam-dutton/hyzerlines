import {
  decodeTerrarium,
  tileForPosition,
  type Position,
  type ProfilePoint,
} from '@hyzerlines/core';

import { readTile } from './store';

/**
 * Reading elevation at a point, from the tiles already on the map.
 *
 * Both elevation sources are terrarium PNGs — the global AWS overlay and an
 * imported survey — so one decoder serves both. All this has to do is fetch the
 * right tile, find the pixel, and turn three bytes back into metres.
 *
 * ## Why not ask MapLibre
 *
 * `map.queryTerrainElevation` exists and would be a line of code, but it only
 * answers while 3D terrain is enabled, which this app deliberately does not do
 * yet. Tying an elevation profile to a rendering mode nobody has turned on
 * would be a strange coupling, and it would go blank the moment somebody turned
 * tilt off.
 */

/** Where the numbers came from. Decides whether they may move a par. */
export type ElevationSource = 'survey' | 'global';

export type DecodedTile = { width: number; height: number; data: Float32Array };

/** Terrarium tiles are 256px, whichever source produced them. */
const TILE_SIZE = 256;

type Decoded = DecodedTile | null;

/**
 * Decode one tile to a grid of metres, or null where there is no tile.
 *
 * Survey tiles come out of IndexedDB; global ones go through the same
 * `maplibre-contour` manager that feeds the contour lines, so a tile already
 * fetched for a contour is not fetched again for a profile.
 */
async function loadTile(
  source: ElevationSource,
  z: number,
  x: number,
  y: number,
): Promise<Decoded> {
  if (source === 'survey') {
    const blob = await readTile(z, x, y);
    if (!blob) return null;
    return decodeSurveyTile(blob);
  }

  const { demSource } = await import('../map/terrain');
  try {
    const tile = await demSource.getDemTile(z, x, y);
    return { width: tile.width, height: tile.height, data: tile.data };
  } catch {
    return null;
  }
}

/**
 * Decode a survey tile to metres, with absent ground as NaN.
 *
 * Shared with the contour generator — see `contourProtocol` — so that "the
 * survey does not describe this pixel" means the same thing to a chart and to
 * an isoline. Two decoders would be two answers, and the one that drifted would
 * be the one drawing lines across ground nobody measured.
 */
export async function decodeSurveyTile(blob: Blob): Promise<Decoded> {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(bitmap, 0, 0);
    const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);

    const metres = new Float32Array(bitmap.width * bitmap.height);
    for (let i = 0; i < metres.length; i++) {
      const o = i * 4;
      /*
       * A fully transparent pixel is a hole the survey genuinely has — see
       * `writeNoData` in core's resampler. Nothing downstream of MapLibre reads
       * alpha, but we wrote it, so we can read it, and it is the difference
       * between "sea level here" and "no data here".
       */
      metres[i] =
        data[o + 3] === 0 ? Number.NaN : decodeTerrarium(data[o]!, data[o + 1]!, data[o + 2]!);
    }
    return { width: bitmap.width, height: bitmap.height, data: metres };
  } finally {
    bitmap.close();
  }
}

/**
 * Decoded tiles held for as long as one batch of profiles is being built.
 *
 * Passed in rather than kept module-level, because the right lifetime is one
 * recomputation. A course-wide cache would be faster and would also keep
 * serving the old ground after a survey was replaced; a per-hole cache would
 * decode the same tile once per hole, and eighteen holes over one hillside
 * share most of their tiles.
 */
export type TileCache = Map<string, Promise<Decoded>>;

export const tileCache = (): TileCache => new Map();

/**
 * Sample elevation at a set of positions.
 *
 * Batched rather than one call per point, and deliberately so: sixty-four
 * samples along one hole fall in a handful of tiles, and fetching per point
 * would decode the same tile sixty times.
 *
 * `zoom` is the survey's own deepest level, so samples are read at the finest
 * detail that exists rather than at whatever the map happens to be showing.
 */
export async function sampleElevations(
  positions: readonly Position[],
  source: ElevationSource,
  zoom: number,
  cache: TileCache = tileCache(),
): Promise<(number | null)[]> {
  const tileAt = (z: number, x: number, y: number): Promise<Decoded> => {
    const key = `${z}/${x}/${y}`;
    let pending = cache.get(key);
    if (!pending) {
      pending = loadTile(source, z, x, y);
      cache.set(key, pending);
    }
    return pending;
  };

  return Promise.all(
    positions.map(async ([lng, lat]) => {
      const { x, y } = tileForPosition(lng, lat, zoom);
      const tile = await tileAt(zoom, Math.floor(x), Math.floor(y));
      if (!tile) return null;

      /*
       * Nearest neighbour, matching the resampler that wrote these tiles.
       * Bilinear would be smoother and would also smear a nodata cell into its
       * neighbours, which is the one thing an elevation reading must not do.
       */
      const px = Math.min(TILE_SIZE - 1, Math.floor((x % 1) * tile.width));
      const py = Math.min(TILE_SIZE - 1, Math.floor((y % 1) * tile.height));
      const metres = tile.data[py * tile.width + px];

      return metres === undefined || !Number.isFinite(metres) ? null : metres;
    }),
  );
}

/** Attach sampled elevations to the positions they were taken at. */
export async function profilePoints(
  samples: readonly { distance: number; position: Position }[],
  source: ElevationSource,
  zoom: number,
  cache?: TileCache,
): Promise<ProfilePoint[]> {
  const elevations = await sampleElevations(
    samples.map((s) => s.position),
    source,
    zoom,
    cache,
  );
  return samples.map((sample, i) => ({ ...sample, elevation: elevations[i] ?? null }));
}
