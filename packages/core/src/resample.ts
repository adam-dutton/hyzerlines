import { NODATA_THRESHOLD, encodeTerrarium, tileBounds } from './survey.js';
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

  /**
   * The elevation to write where the survey has nothing, in metres.
   *
   * Nothing downstream may treat this as a measurement — every pixel carrying
   * it has its alpha zeroed, which is how the contour generator and the
   * elevation profile know to ignore it. It exists for the one consumer that
   * cannot be told: MapLibre's hillshade reads RGB and has no concept of
   * nodata, so those pixels are going to be shaded whatever we put there.
   *
   * A single flat value is what makes them shade to *nothing*: relief shading
   * is a function of slope, and a constant has none. The survey's own mean is
   * the right constant because it also minimises the step at the boundary,
   * which is the only place any shading can then appear.
   *
   * Sea level — the old behaviour — is exactly wrong for this. A survey of
   * Colorado at 2,000m surrounded by zeroes is a two-kilometre cliff all the
   * way round it.
   */
  fillMeters?: number;
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
  { allowFullyClamped = false, fillMeters = 0 }: ResampleOptions = {},
): Uint8ClampedArray | null {
  const fill = encodeTerrarium(fillMeters);
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

      const out = (py * TILE_SIZE + px) * 4;

      /*
       * Outside the grid is not data, and is no longer pretended to be.
       *
       * This used to clamp to the nearest edge sample, which kept the hillshade
       * continuous and produced the artifact that made it untenable: clamping
       * repeats the edge column outward, so the terrain goes flat *across* the
       * boundary while still varying *along* it — drawn as long horizontal
       * smears running off the side of the survey, with contour lines extending
       * straight out of them. It looked like measured ground and was the
       * survey's outermost pixel copied a hundred times.
       */
      const outside = rawCol < 0 || rawCol >= grid.width || rawRow < 0 || rawRow >= grid.height;
      if (outside) {
        writeAbsent(rgba, out, fill);
        continue;
      }

      inside++;
      const meters = grid.data[rawRow * grid.width + rawCol]!;

      if (
        !Number.isFinite(meters) ||
        meters <= NODATA_THRESHOLD ||
        (grid.noDataValue !== null && meters === grid.noDataValue)
      ) {
        writeAbsent(rgba, out, fill);
        // An interior hole is not coverage, however far inside the grid it is.
        inside--;
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
 * Ground the survey does not describe: beyond its edge, or a hole inside it —
 * a lake the LiDAR did not return from, a gap between flight lines.
 *
 * **Alpha zero is the mechanism now, not documentation.** Two of the three
 * consumers read it and act on it: the contour generator decodes these pixels
 * to NaN, and `maplibre-contour` skips every cell touching one, so no isoline
 * is drawn across ground nobody measured. The elevation profile reads it as a
 * gap for the same reason.
 *
 * MapLibre's hillshade is the third and cannot be told — it reads RGB and has
 * no nodata — which is what `fill` is for. See `fillMeters`.
 */
function writeAbsent(
  rgba: Uint8ClampedArray,
  offset: number,
  fill: readonly [number, number, number],
): void {
  rgba[offset] = fill[0];
  rgba[offset + 1] = fill[1];
  rgba[offset + 2] = fill[2];
  rgba[offset + 3] = 0;
}

/**
 * A representative elevation for a grid: the mean of everything real in it.
 *
 * What the tiles are filled with where the survey says nothing — see
 * `fillMeters`. The mean rather than the minimum or sea level, because the only
 * thing this number can produce is the step at the survey's boundary, and the
 * mean is what makes that step smallest.
 *
 * Zero when the grid is entirely nodata, which is the one case where it cannot
 * matter: there is no boundary to step across.
 */
export function gridFillElevation(grid: SourceGrid): number {
  let total = 0;
  let count = 0;
  for (const meters of grid.data) {
    if (!Number.isFinite(meters) || meters <= NODATA_THRESHOLD) continue;
    if (grid.noDataValue !== null && meters === grid.noDataValue) continue;
    total += meters;
    count++;
  }
  return count === 0 ? 0 : total / count;
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
