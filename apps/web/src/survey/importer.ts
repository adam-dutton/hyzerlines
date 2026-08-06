import {
  MAX_SOURCE_CELLS,
  boundsFromGrid,
  resampleTile,
  surveyZooms,
  tileCount,
  tileRange,
  withMargin,
  type Bounds,
  type SiteSurvey,
  type SourceGrid,
} from '@hyzerlines/core';

/**
 * Turning an uploaded GeoTIFF into terrarium tiles.
 *
 * The pure arithmetic is in core — tile bounds, resampling, terrarium encoding,
 * all unit tested against grids whose every value is known. This file is the
 * I/O around it: reading the file, recovering its projection, choosing how much
 * to load, and encoding PNGs.
 *
 * ## Why the browser can do this at all
 *
 * A USGS 1m tile is 10012×10012 samples — 400MB as float32, which is not a
 * thing to allocate in a tab. But GeoTIFFs from every serious producer are
 * cloud-optimised: internally tiled, with a pyramid of overviews. So we read a
 * *window* at the *level* that suits, and a course-sized area at 1m is a few
 * million samples.
 *
 * `geotiff` and `proj4` are dynamically imported so they land in their own
 * chunk. They are together larger than the rest of the app and only matter to
 * someone who imports a survey, which most people never will.
 */

/** Progress, for a job that takes seconds and must not look hung. */
export interface ImportProgress {
  phase: 'reading' | 'projecting' | 'tiling' | 'storing';
  /** 0–1 within the current phase, or null when it cannot be known yet. */
  ratio: number | null;
}

export interface ImportedTile {
  z: number;
  x: number;
  y: number;
  png: Blob;
}

export interface ImportResult {
  survey: Omit<SiteSurvey, 'importedAt'>;
  tiles: ImportedTile[];
}

/** Anything wrong with the file itself, phrased for someone who chose it. */
export class SurveyImportError extends Error {}

/*
 * Projections we can name without a lookup service.
 *
 * proj4 ships definitions for WGS84 and little else, so a projected GeoTIFF
 * arrives as an EPSG code we have to turn into a proj string ourselves. These
 * three families cover the LiDAR a disc golf designer will actually be handed:
 * the US national programme, the UK's, and anything already in the web's own
 * projection.
 *
 * An unknown code is refused rather than guessed. Silently treating unknown
 * metres as UTM zone 1 would place a course in the Pacific, and a survey that
 * lands in the wrong hemisphere is worse than one that declines to load.
 */
function projDefinition(epsg: number): string | null {
  // NAD83 / UTM north zones 1–23 — the USGS 3DEP 1m products.
  if (epsg >= 26901 && epsg <= 26923) {
    return `+proj=utm +zone=${epsg - 26900} +datum=NAD83 +units=m +no_defs`;
  }
  // WGS84 / UTM north and south.
  if (epsg >= 32601 && epsg <= 32660) {
    return `+proj=utm +zone=${epsg - 32600} +datum=WGS84 +units=m +no_defs`;
  }
  if (epsg >= 32701 && epsg <= 32760) {
    return `+proj=utm +zone=${epsg - 32700} +south +datum=WGS84 +units=m +no_defs`;
  }
  // OSGB36 / British National Grid — the UK Environment Agency's LiDAR.
  if (epsg === 27700) {
    return (
      '+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 ' +
      '+ellps=airy +towgs84=446.448,-125.157,542.06,0.15,0.247,0.842,-20.489 +units=m +no_defs'
    );
  }
  // Already geographic, or already Web Mercator.
  if (epsg === 4326 || epsg === 4269) return '+proj=longlat +datum=WGS84 +no_defs';
  if (epsg === 3857 || epsg === 900913) {
    return (
      '+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 ' +
      '+units=m +nadgrids=@null +no_defs'
    );
  }
  return null;
}

/**
 * Pick the overview level whose full extent fits the memory budget.
 *
 * Level 0 is the source resolution and each subsequent level is roughly half.
 * Walking down until the whole image fits means a big county-wide tile still
 * imports — at reduced detail, honestly reported — rather than failing.
 *
 * The survey records the resolution this actually achieved, never the file's,
 * so the panel cannot claim 1m for tiles built at 4m.
 */
async function chooseLevel(tiff: {
  getImageCount: () => Promise<number>;
  getImage: (i?: number) => Promise<GeoTiffImage>;
}): Promise<{ image: GeoTiffImage; index: number }> {
  const count = await tiff.getImageCount();
  let fallback: GeoTiffImage | null = null;

  for (let index = 0; index < count; index++) {
    const image = await tiff.getImage(index);
    fallback = image;
    if (image.getWidth() * image.getHeight() <= MAX_SOURCE_CELLS) return { image, index };
  }

  // Every level too large: take the coarsest there is and let it be coarse.
  if (!fallback) throw new SurveyImportError('That file has no image data in it.');
  return { image: fallback, index: count - 1 };
}

/** The subset of geotiff's image API this file uses. */
interface GeoTiffImage {
  getWidth: () => number;
  getHeight: () => number;
  getBoundingBox: () => number[];
  getGeoKeys: () => Record<string, unknown>;
  getSamplesPerPixel: () => number;
  getGDALNoData: () => number | null;
  readRasters: (options: { interleave?: boolean }) => Promise<unknown>;
}

export async function importSurvey(
  file: File,
  onProgress: (progress: ImportProgress) => void,
): Promise<ImportResult> {
  onProgress({ phase: 'reading', ratio: null });

  const [{ fromBlob }, proj4Module] = await Promise.all([import('geotiff'), import('proj4')]);
  const proj4 = proj4Module.default;

  const tiff = await fromBlob(file);
  const { image } = await chooseLevel(tiff as never);

  const keys = image.getGeoKeys() ?? {};
  const epsg = keys['ProjectedCSTypeGeoKey'] ?? keys['GeographicTypeGeoKey'];
  if (typeof epsg !== 'number') {
    throw new SurveyImportError(
      'That GeoTIFF does not say what projection it is in, so it cannot be placed on the map.',
    );
  }

  const definition = projDefinition(epsg);
  if (!definition) {
    throw new SurveyImportError(
      `EPSG:${epsg} is not a projection this can read yet. UTM, British National Grid ` +
        'and plain latitude/longitude are supported — reprojecting to one of those in QGIS ' +
        'will work.',
    );
  }

  const crs = `EPSG:${epsg}`;
  proj4.defs(crs, definition);
  const toSource = proj4('EPSG:4326', crs);

  onProgress({ phase: 'projecting', ratio: null });

  const bbox = image.getBoundingBox() as [number, number, number, number];
  const bounds: Bounds = boundsFromGrid(bbox, (xy) => toSource.inverse(xy) as [number, number]);

  const rasters = (await image.readRasters({ interleave: false })) as ArrayLike<
    Float32Array | Int16Array | Uint16Array
  >;
  const band = rasters[0];
  if (!band) throw new SurveyImportError('That file has no elevation band in it.');

  const grid: SourceGrid = {
    // Float32Array regardless of the file's own type, so the resampler has one
    // shape to handle and integer DEMs still carry their values exactly.
    data: band instanceof Float32Array ? band : Float32Array.from(band),
    width: image.getWidth(),
    height: image.getHeight(),
    bbox,
    noDataValue: image.getGDALNoData(),
  };

  /*
   * Ground sample distance in metres, measured rather than assumed.
   *
   * A projected file's own resolution is already metres, but a geographic one
   * is in degrees, and a degree of longitude is not a distance. Taking the
   * width of the reprojected bounds and dividing by the pixel count gets the
   * right answer for both without branching on the CRS.
   */
  const midLatitude = (bounds[1] + bounds[3]) / 2;
  const METERS_PER_DEGREE_LAT = 111_320;
  const widthMeters =
    (bounds[2] - bounds[0]) * METERS_PER_DEGREE_LAT * Math.cos((midLatitude * Math.PI) / 180);
  const resolutionMeters = Math.abs(widthMeters) / grid.width;

  const { minZoom, maxZoom } = surveyZooms(resolutionMeters, midLatitude);

  /*
   * Every zoom's tiles, plus a one-tile skirt for the contour generator.
   *
   * See `withMargin`: isolines are built from a 3×3 neighbourhood and a missing
   * neighbour throws the whole tile away, so a survey narrower than three tiles
   * — which a single course always is — produces nothing without the skirt.
   */
  const ranges = [];
  let total = 0;
  for (let z = minZoom; z <= maxZoom; z++) {
    const range = withMargin(tileRange(bounds, z));
    ranges.push(range);
    total += tileCount(range);
  }

  const forward = (lngLat: [number, number]) => toSource.forward(lngLat) as [number, number];
  const tiles: ImportedTile[] = [];
  let done = 0;

  for (const range of ranges) {
    for (let x = range.minX; x <= range.maxX; x++) {
      for (let y = range.minY; y <= range.maxY; y++) {
        // The skirt is allowed to be pure extrapolation; it is read by the
        // isoline generator and never drawn, because the sources carry the
        // survey's real bounds.
        const rgba = resampleTile(grid, forward, range.z, x, y, { allowFullyClamped: true });
        done++;
        if (rgba) tiles.push({ z: range.z, x, y, png: await encodePng(rgba) });
        if (done % 16 === 0) onProgress({ phase: 'tiling', ratio: done / total });
      }
    }
  }

  if (tiles.length === 0) {
    throw new SurveyImportError(
      'That file reprojected to somewhere with no data in it. It may be a different area ' +
        'than it claims, or its projection may be mislabelled.',
    );
  }

  return {
    survey: { name: file.name, bounds, resolutionMeters, crs, minZoom, maxZoom },
    tiles,
  };
}

/**
 * RGBA to PNG bytes.
 *
 * PNG because MapLibre decodes a raster tile with `createImageBitmap`, which
 * wants encoded image bytes, and because it is the only widely supported
 * lossless format — a lossy one would quantise the low byte of the terrarium
 * encoding, which is the sub-metre detail this whole feature exists for.
 *
 * `OffscreenCanvas` rather than a hand-rolled encoder: it is in every browser
 * this app targets, and `putImageData` is defined to write the exact bytes
 * given, with no premultiplication on the way in.
 */
async function encodePng(rgba: Uint8ClampedArray): Promise<Blob> {
  const size = Math.sqrt(rgba.length / 4);
  const canvas = new OffscreenCanvas(size, size);
  const context = canvas.getContext('2d');
  if (!context) throw new SurveyImportError('This browser cannot encode the tiles.');
  /*
   * The cast is about `SharedArrayBuffer`, not about the pixels.
   *
   * `ImageData` will only take a view backed by a plain `ArrayBuffer`, and
   * TypeScript widens any `Uint8ClampedArray` to `ArrayBufferLike` — which
   * includes the shared kind. `resampleTile` allocates its own buffer and
   * hands it to exactly one caller, so it is never shared; asserting that
   * beats copying a quarter-megabyte per tile to prove it.
   */
  const pixels = rgba as Uint8ClampedArray<ArrayBuffer>;
  context.putImageData(new ImageData(pixels, size, size), 0, 0);
  return canvas.convertToBlob({ type: 'image/png' });
}
