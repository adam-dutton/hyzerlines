import { NODATA_THRESHOLD, TERRARIUM_NODATA, encodeTerrarium, tileBounds } from './survey.js';
import type { Bounds } from './measure.js';

/**
 * Turning a projected elevation grid into a Web Mercator tile.
 *
 * The one genuinely hard part of importing a survey, and the reason it is a
 * pure function in its own file: everything around it is I/O — reading a file,
 * writing to IndexedDB, posting between a worker and a page — and none of that
 * can tell you whether the terrain landed in the right place. This can be
 * tested against a grid whose every value is known.
 *
 * ## Why resampling is needed at all
 *
 * USGS 1m DEMs arrive in UTM, one zone per project; the UK's arrive in British
 * National Grid. MapLibre wants Web Mercator. Nothing in the browser will
 * reproject a raster for us — `maplibre-cog-protocol` refuses anything that is
 * not already EPSG:3857 rather than reprojecting it — so we do it here, per
 * output pixel.
 *
 * ## Inverse mapping, not forward
 *
 * For each pixel of the *output* tile, work out where it falls in the source
 * and sample there. The obvious alternative — walk the source and paint into
 * the output — leaves holes wherever the output is finer than the source, and
 * paints the same pixel repeatedly wherever it is coarser. Inverse mapping
 * produces exactly one value per output pixel by construction.
 *
 * Nearest neighbour rather than bilinear. Elevation is a continuous surface and
 * bilinear would be smoother, but a DEM's nodata cells are sentinels, not
 * heights: interpolating one into its neighbours smears an artificial value
 * across real ground. Nearest keeps every output sample a value that was
 * actually measured somewhere.
 *
 * ## Alpha is not an escape hatch
 *
 * The obvious way to say "no data here" is a transparent pixel, and it does not
 * work: MapLibre's `raster-dem` decoder and `maplibre-contour` both read RGB
 * and ignore alpha entirely. A transparent pixel carrying sea level does not
 * fall through to the layer beneath — it decodes as sea level, and a
 * transparent pixel carrying zeroes decodes as −32768, which hillshades as a
 * thirty-kilometre pit.
 *
 * So the edges are handled by **clamping to the nearest edge sample** instead,
 * which is what every texture sampler does at its border. A tile straddling the
 * survey's edge continues the last real elevation outward rather than falling
 * off a cliff to sea level. It is an extrapolation and it is confined to the
 * one ring of tiles that touches the boundary; the alternative is a visible
 * escarpment around every imported survey, which reads as data rather than as
 * an artefact and is the worse lie.
 *
 * A tile with no *genuinely* inside pixels is still rejected, so the clamping
 * cannot smear a survey across the county.
 */

export const TILE_SIZE = 256;

/** A grid of elevations in a projected CRS, north-up. */
export interface SourceGrid {
  /** Row-major, `width * height` samples, in metres. */
  data: Float32Array;
  width: number;
  height: number;
  /** Projected bounds: [minX, minY, maxX, maxY] in the source CRS units. */
  bbox: [number, number, number, number];
  /** Anything at or below this is absent. Sentinels vary by producer. */
  noDataValue: number | null;
}

/** Projects WGS84 lng/lat into the source CRS. Supplied by the caller. */
export type Forward = (lngLat: [number, number]) => [number, number];

export interface ResampleOptions {
  /**
   * Produce a tile even when every pixel fell outside the grid.
   *
   * For the ring of tiles just beyond the survey, which exists for the contour
   * generator rather than for the eye. `maplibre-contour` builds each contour
   * tile from a 3×3 neighbourhood and rejects the whole thing if any neighbour
   * is missing — so a course-sized survey, which is smaller than three tiles
   * across, would never produce a single contour without this.
   *
   * The margin is never drawn: both survey sources carry the real bounds, so
   * MapLibre does not ask for tiles outside them. It is read by the generator
   * and by nothing else.
   */
  allowFullyClamped?: boolean;
}

/**
 * Sample a source grid into one terrarium tile.
 *
 * Returns `null` when no output pixel landed inside the grid, so that a tile of
 * pure extrapolation is not stored where it would be drawn. See
 * `allowFullyClamped` for the one case that wants exactly that.
 */
export function resampleTile(
  grid: SourceGrid,
  forward: Forward,
  z: number,
  x: number,
  y: number,
  { allowFullyClamped = false }: ResampleOptions = {},
): Uint8ClampedArray | null {
  const [tileWest, tileSouth, tileEast, tileNorth] = tileBounds(z, x, y);
  const [minX, minY, maxX, maxY] = grid.bbox;

  const scaleX = grid.width / (maxX - minX);
  const scaleY = grid.height / (maxY - minY);

  const rgba = new Uint8ClampedArray(TILE_SIZE * TILE_SIZE * 4);
  /*
   * Counts pixels that landed strictly inside the grid, which is what decides
   * whether this tile is worth storing. Clamped pixels do not count: they are
   * real measurements, but repeated ones, and a tile made entirely of them is a
   * tile made entirely of the survey's outermost row.
   */
  let inside = 0;

  for (let py = 0; py < TILE_SIZE; py++) {
    /*
     * Pixel centres, not corners: `+ 0.5`. Sampling at the corner biases the
     * whole tile half a pixel north-west, which at 1m is half a metre of
     * systematic error in the same direction everywhere — exactly the kind of
     * quiet wrongness that never looks like a bug.
     *
     * Latitude is interpolated linearly across the tile rather than through the
     * Mercator formula. At z13 and deeper a single tile spans so little
     * latitude that the error is far below a pixel, and doing it properly per
     * row costs a transcendental per scanline for nothing.
     */
    const lat = tileNorth + ((py + 0.5) / TILE_SIZE) * (tileSouth - tileNorth);

    for (let px = 0; px < TILE_SIZE; px++) {
      const lng = tileWest + ((px + 0.5) / TILE_SIZE) * (tileEast - tileWest);
      const [sx, sy] = forward([lng, lat]);

      // Source rows run north to south, so the row index counts down from maxY.
      const rawCol = Math.floor((sx - minX) * scaleX);
      const rawRow = Math.floor((maxY - sy) * scaleY);

      const col = Math.max(0, Math.min(grid.width - 1, rawCol));
      const row = Math.max(0, Math.min(grid.height - 1, rawRow));
      if (col === rawCol && row === rawRow) inside++;

      const out = (py * TILE_SIZE + px) * 4;
      const meters = grid.data[row * grid.width + col]!;

      if (
        !Number.isFinite(meters) ||
        meters <= NODATA_THRESHOLD ||
        (grid.noDataValue !== null && meters === grid.noDataValue)
      ) {
        writeNoData(rgba, out);
        // An interior hole is not coverage, however far inside the grid it is.
        if (col === rawCol && row === rawRow) inside--;
        continue;
      }

      const [r, g, b] = encodeTerrarium(meters);
      rgba[out] = r;
      rgba[out + 1] = g;
      rgba[out + 2] = b;
      rgba[out + 3] = 255;
    }
  }

  return inside <= 0 && !allowFullyClamped ? null : rgba;
}

/*
 * A hole the survey genuinely has — a lake the LiDAR did not return from, a
 * gap between flight lines.
 *
 * Sea level, with alpha zeroed. The alpha is documentation rather than
 * mechanism, since nothing downstream reads it (see the note above); it costs
 * nothing and it means a future consumer that *does* respect alpha gets the
 * right answer. Sea level is the least-wrong RGB: it is flat, so it hillshades
 * to nothing rather than to a feature that is not there.
 */
function writeNoData(rgba: Uint8ClampedArray, offset: number): void {
  rgba[offset] = TERRARIUM_NODATA[0];
  rgba[offset + 1] = TERRARIUM_NODATA[1];
  rgba[offset + 2] = TERRARIUM_NODATA[2];
  rgba[offset + 3] = 0;
}

/**
 * The WGS84 bounds of a projected grid, from its four corners.
 *
 * Four corners rather than two: a reprojected rectangle is not a rectangle. In
 * UTM well away from the central meridian the north edge bows, so taking only
 * the south-west and north-east corners clips a sliver off the top of the
 * survey. Taking the extremes of all four is still an approximation, but it
 * errs outwards, and an over-large bounds costs a few empty tiles that
 * `resampleTile` declines to store anyway.
 */
export function boundsFromGrid(
  bbox: [number, number, number, number],
  inverse: (xy: [number, number]) => [number, number],
): Bounds {
  const [minX, minY, maxX, maxY] = bbox;
  const corners: [number, number][] = [
    inverse([minX, minY]),
    inverse([minX, maxY]),
    inverse([maxX, minY]),
    inverse([maxX, maxY]),
  ];

  const lngs = corners.map((c) => c[0]);
  const lats = corners.map((c) => c[1]);
  return [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)];
}
