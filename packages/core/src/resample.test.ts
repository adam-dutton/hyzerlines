import { describe, expect, it } from 'vitest';

import { TILE_SIZE, boundsFromGrid, resampleTile, type SourceGrid } from './resample.js';
import { decodeTerrarium, tileBounds, tileForPosition } from './survey.js';

/**
 * Resampling, against grids whose every value is known.
 *
 * This is the part of the import that can be silently, plausibly wrong: terrain
 * that lands mirrored, or half a pixel north, or with nodata smeared into real
 * ground, all render as *something*, and something is much harder to notice
 * than nothing. So the fixtures below encode position into the elevation — a
 * ramp, a corner marker — and the assertions read the position back out.
 */

/**
 * Elevation of the grid's westmost column.
 *
 * Deliberately not zero: sea level is what a failed lookup produces, so a ramp
 * starting at 0 cannot tell "clamped to the edge correctly" apart from "fell
 * back to nothing". Every real elevation in these fixtures is at least this.
 */
const BASE_ELEVATION = 100;

/**
 * A grid in a fake "projected" CRS that is just degrees, so the forward
 * transform is the identity and the test is about resampling rather than about
 * proj4. Elevation ramps with the column index, so a sample's value says which
 * column it came from.
 */
function rampGrid(options: Partial<SourceGrid> = {}): SourceGrid {
  const width = 100;
  const height = 100;
  const data = new Float32Array(width * height);
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) data[row * width + col] = BASE_ELEVATION + col;
  }
  return {
    data,
    width,
    height,
    // One degree square at the origin, which at z10 spans several tiles.
    bbox: [0, 0, 1, 1],
    noDataValue: null,
    ...options,
  };
}

const identity = (lngLat: [number, number]): [number, number] => lngLat;

/** The raw bytes at a pixel, for asserting about ground that has no elevation. */
function raw(rgba: Uint8ClampedArray, px: number, py: number): number[] {
  const i = (py * TILE_SIZE + px) * 4;
  return [rgba[i]!, rgba[i + 1]!, rgba[i + 2]!, rgba[i + 3]!];
}

function elevationAt(rgba: Uint8ClampedArray, px: number, py: number): number | null {
  const i = (py * TILE_SIZE + px) * 4;
  if (rgba[i + 3] === 0) return null;
  return decodeTerrarium(rgba[i]!, rgba[i + 1]!, rgba[i + 2]!);
}

/** The tile containing a position, at a zoom. */
function tileAt(lng: number, lat: number, z: number) {
  const { x, y } = tileForPosition(lng, lat, z);
  return { z, x: Math.floor(x), y: Math.floor(y) };
}

describe('resampleTile', () => {
  it('samples the source value at the matching position', () => {
    const grid = rampGrid();
    const { z, x, y } = tileAt(0.5, 0.5, 12);
    const rgba = resampleTile(grid, identity, z, x, y);
    expect(rgba).not.toBeNull();

    // Take the tile's own centre pixel, work out its longitude, and check the
    // elevation matches the column that longitude falls in.
    const [west, , east] = tileBounds(z, x, y);
    const centreLng = west + ((TILE_SIZE / 2 + 0.5) / TILE_SIZE) * (east - west);
    const expectedColumn = Math.floor(centreLng * grid.width);

    expect(elevationAt(rgba!, TILE_SIZE / 2, TILE_SIZE / 2)).toBe(
      BASE_ELEVATION + expectedColumn,
    );
  });

  /*
   * The failure that would look like bad data rather than a bug: tile rows run
   * north to south while grid rows run from maxY down, so a sign error here
   * flips the terrain vertically. A north-south ramp catches it; the east-west
   * ramp above cannot.
   */
  it('does not flip north and south', () => {
    const width = 100;
    const height = 100;
    const data = new Float32Array(width * height);
    // Row 0 is the NORTH edge of the grid. Make elevation increase southwards.
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) data[row * width + col] = row;
    }
    const grid: SourceGrid = { data, width, height, bbox: [0, 0, 1, 1], noDataValue: null };

    const { z, x, y } = tileAt(0.5, 0.5, 12);
    const rgba = resampleTile(grid, identity, z, x, y)!;

    const top = elevationAt(rgba, TILE_SIZE / 2, 2)!;
    const bottom = elevationAt(rgba, TILE_SIZE / 2, TILE_SIZE - 3)!;
    expect(bottom).toBeGreaterThan(top);
  });

  it('does not flip east and west', () => {
    const grid = rampGrid();
    const { z, x, y } = tileAt(0.5, 0.5, 12);
    const rgba = resampleTile(grid, identity, z, x, y)!;

    const left = elevationAt(rgba, 2, TILE_SIZE / 2)!;
    const right = elevationAt(rgba, TILE_SIZE - 3, TILE_SIZE / 2)!;
    expect(right).toBeGreaterThan(left);
  });

  /*
   * A tile with nothing in it must not be stored: MapLibre should fall through
   * to the global overlay outside the survey rather than draw a flat plain at
   * sea level, whose hillshade is a cliff along the survey's own edge.
   */
  it('returns null for a tile entirely outside the grid', () => {
    const grid = rampGrid();
    const { z, x, y } = tileAt(50, 50, 12);
    expect(resampleTile(grid, identity, z, x, y)).toBeNull();
  });

  /*
   * The artifact that made clamping untenable.
   *
   * This used to continue the last real elevation outward, on the grounds that
   * MapLibre's DEM decoder reads RGB and cannot be told about nodata. It kept
   * the hillshade continuous and it drew ground that was not there: clamping
   * repeats the edge column, so the terrain goes flat *across* the boundary
   * while still varying *along* it — rendered as long horizontal smears running
   * off the side of the survey, with contour lines extending straight out of
   * them into land nobody surveyed.
   *
   * So outside is absent now, and alpha carries that. The two consumers that
   * can read it do — the contour generator decodes absent cells to NaN and
   * skips them, and the elevation profile reports a gap. The hillshade still
   * cannot be told, which is what the flat fill is for: relief shading is a
   * function of slope, and a constant has none.
   */
  it('marks ground outside the grid absent rather than clamping to the edge', () => {
    /*
     * The grid's west edge has to fall *inside* a tile for any of this tile's
     * pixels to be outside it. At z12 a tile spans 0.088°, so a grid starting
     * at lng 0 aligns exactly with a tile boundary and nothing straddles —
     * hence 0.04, which lands mid-tile.
     */
    const grid = rampGrid({ bbox: [0.04, 0, 1, 1] });
    const { z, x, y } = tileAt(0.05, 0.5, 12);
    const [west, , east] = tileBounds(z, x, y);
    expect(west).toBeLessThan(0.04);
    expect(east).toBeGreaterThan(0.04);

    const rgba = resampleTile(grid, identity, z, x, y)!;
    expect(rgba).not.toBeNull();

    const row = TILE_SIZE / 2;

    // West of the grid there is no data, and it says so.
    expect(elevationAt(rgba, 0, row)).toBeNull();
    // Inside it, the ramp is measured as it always was.
    expect(elevationAt(rgba, TILE_SIZE - 1, row)).toBeGreaterThanOrEqual(BASE_ELEVATION);

    /*
     * And the absent side is *flat*, which is the half that only the hillshade
     * cares about. Under the old clamp these pixels inherited the edge column's
     * variation and shaded as terrain; a constant has no slope and shades as
     * nothing.
     */
    const absent = [0, 1, 2].map((px) => raw(rgba, px, row));
    expect(absent[0]).toEqual(absent[1]);
    expect(absent[1]).toEqual(absent[2]);
    // Flat down the column too, where the clamp used to vary most.
    expect(raw(rgba, 0, 10)).toEqual(raw(rgba, 0, TILE_SIZE - 10));
  });

  /* A tile with nothing of the survey in it is not a tile worth storing. */
  it('rejects a tile with no measured ground in it', () => {
    const grid = rampGrid();
    // Adjacent to the grid but not overlapping it.
    const { z, x, y } = tileAt(1.5, 0.5, 12);
    expect(resampleTile(grid, identity, z, x, y)).toBeNull();
  });

  /*
   * Except for the skirt, which exists because `maplibre-contour` builds each
   * contour tile from a 3×3 neighbourhood and throws the whole thing away if
   * any of the nine is missing. A course-sized survey is narrower than three
   * tiles, so without this it produces no contours at all — which is exactly
   * what it did until this was added.
   */
  it('produces an all-absent tile when asked, for the contour skirt', () => {
    const grid = rampGrid();
    const { z, x, y } = tileAt(1.5, 0.5, 12);

    const rgba = resampleTile(grid, identity, z, x, y, { allowFullyClamped: true });
    expect(rgba).not.toBeNull();

    /*
     * It exists, and every pixel of it is absent. That is what the generator
     * needs: a neighbour it can read, saying there is nothing here — so the
     * isolines stop at the survey's edge instead of being thrown away for a
     * missing tile or continued into land nobody measured.
     */
    for (const px of [0, TILE_SIZE / 2, TILE_SIZE - 1]) {
      expect(elevationAt(rgba!, px, TILE_SIZE / 2)).toBeNull();
    }
  });

  /*
   * What the hillshade sees where the survey says nothing.
   *
   * It is the one consumer that cannot be told — MapLibre reads RGB and has no
   * nodata — so the RGB has to be chosen rather than left to chance. Sea level,
   * the old choice, puts a two-kilometre cliff around a survey of Colorado.
   */
  it('fills absent ground with the elevation it is given', () => {
    const grid = rampGrid();
    const { z, x, y } = tileAt(1.5, 0.5, 12);

    const rgba = resampleTile(grid, identity, z, x, y, {
      allowFullyClamped: true,
      fillMeters: 2000,
    })!;

    const i = ((TILE_SIZE / 2) * TILE_SIZE + TILE_SIZE / 2) * 4;
    // Absent, and carrying the fill rather than sea level.
    expect(rgba[i + 3]).toBe(0);
    expect(decodeTerrarium(rgba[i]!, rgba[i + 1]!, rgba[i + 2]!)).toBeCloseTo(2000, 2);
  });

  /*
   * Nodata sentinels are not heights. A producer's -9999 must not be encoded as
   * a very deep hole, and a nearest-neighbour sampler must never let one bleed
   * into a neighbouring cell the way bilinear would.
   */
  it('treats a nodata sentinel as absent, not as a very low elevation', () => {
    const grid = rampGrid();
    grid.data.fill(-9999);
    const { z, x, y } = tileAt(0.5, 0.5, 12);
    expect(resampleTile(grid, identity, z, x, y)).toBeNull();
  });

  it('honours a producer-declared nodata value that is a plausible height', () => {
    const grid = rampGrid({ noDataValue: BASE_ELEVATION + 50 });
    const { z, x, y } = tileAt(0.5, 0.5, 12);
    const rgba = resampleTile(grid, identity, z, x, y)!;

    // Column 50 carries the sentinel, so no pixel anywhere should decode to it.
    for (let px = 0; px < TILE_SIZE; px++) {
      expect(elevationAt(rgba, px, TILE_SIZE / 2)).not.toBe(BASE_ELEVATION + 50);
    }
  });

  it('rejects NaN, which is how some GeoTIFFs spell nodata', () => {
    const grid = rampGrid();
    grid.data.fill(Number.NaN);
    const { z, x, y } = tileAt(0.5, 0.5, 12);
    expect(resampleTile(grid, identity, z, x, y)).toBeNull();
  });

  /*
   * Sampling at pixel corners rather than centres biases every tile half a
   * pixel north-west — half a metre at 1m, in the same direction everywhere.
   * With the grid and the tile aligned, a centre-sampled tile is symmetric
   * about its middle; a corner-sampled one is not.
   */
  it('samples pixel centres, so the tile is not offset half a pixel', () => {
    const width = 256;
    const height = 256;
    const data = new Float32Array(width * height);
    // A single peak at the exact centre of the grid.
    data[128 * width + 128] = 1000;

    const [west, south, east, north] = tileBounds(12, 2048, 2048);
    const grid: SourceGrid = {
      data,
      width,
      height,
      bbox: [west, south, east, north],
      noDataValue: null,
    };

    const rgba = resampleTile(grid, identity, 12, 2048, 2048)!;
    expect(elevationAt(rgba, 128, 128)).toBe(1000);
  });
});

describe('boundsFromGrid', () => {
  it('takes the extremes of all four corners, not just two', () => {
    /*
     * A transform that bows the north edge, standing in for what UTM does away
     * from its central meridian. Using only SW and NE would clip the bulge.
     */
    const bow = ([x, y]: [number, number]): [number, number] => [x, y + (x === 10 ? 0 : 5)];

    const bounds = boundsFromGrid([0, 0, 10, 10], bow);
    expect(bounds[3]).toBe(15);
  });

  it('errs outwards rather than inwards', () => {
    const identityXY = ([x, y]: [number, number]): [number, number] => [x, y];
    expect(boundsFromGrid([1, 2, 3, 4], identityXY)).toEqual([1, 2, 3, 4]);
  });
});
