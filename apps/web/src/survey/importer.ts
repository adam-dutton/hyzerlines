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

/**
 * The projection a GeoTIFF says it is in.
 *
 * A projected GeoTIFF carries an EPSG code and, usually, nothing else — the
 * real USGS products carry `ProjectedCSTypeGeoKey` and no parameters at all —
 * so the code has to be turned into something proj4 understands.
 *
 * This began as a hand-written table of the three families a designer was
 * expected to meet: UTM, British National Grid, plain lat/long. It lasted until
 * somebody brought a file in `EPSG:6428`, NAD83(2011) / Colorado Central
 * (ftUS). US State Plane alone is about 120 zones across several datum
 * realizations, and every country has a grid of its own; a curated list is a
 * list that is always missing the one in front of you.
 *
 * So the whole registry is compiled in — see `scripts/build-epsg.ts`, and note
 * that it deliberately omits anything proj4js would get wrong rather than
 * refuse. Loaded lazily with the rest of the import machinery, because it is a
 * megabyte that matters to nobody who never imports a survey.
 */
async function lookUpProjection(
  epsg: number,
): Promise<{ definition: string; name: string } | null> {
  const { EPSG_DEFINITIONS } = await import('./epsg.generated');
  const entry = EPSG_DEFINITIONS[String(epsg)];
  if (!entry) return null;
  return { definition: entry[0], name: entry[1] };
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

  const projection = await lookUpProjection(epsg);
  if (!projection) {
    throw new SurveyImportError(
      `EPSG:${epsg} is a projection this cannot reproject accurately, so the file is not ` +
        'being placed rather than being placed wrongly. Exporting it from QGIS in UTM or ' +
        'plain latitude/longitude will work.',
    );
  }

  const crs = `EPSG:${epsg}`;
  proj4.defs(crs, projection.definition);
  const toSource = proj4('EPSG:4326', crs);

  onProgress({ phase: 'projecting', ratio: null });

  const bbox = image.getBoundingBox() as [number, number, number, number];
  const bounds: Bounds = boundsFromGrid(bbox, (xy) => toSource.inverse(xy) as [number, number]);

  /*
   * Refuse a reprojection that did not produce numbers.
   *
   * proj4js signals failure by returning NaN rather than by throwing, and the
   * generated table exists partly to keep that from happening — but a bad
   * bounding box in the file itself can do it too, and NaN bounds would flow
   * all the way into the document before anything noticed.
   */
  if (!bounds.every((n) => Number.isFinite(n))) {
    throw new SurveyImportError(
      `That file did not reproject from ${projection.name || crs} — its coordinates may not ` +
        'match the projection it declares.',
    );
  }

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
    survey: {
      name: file.name,
      bounds,
      resolutionMeters,
      crs,
      crsName: projection.name,
      minZoom,
      maxZoom,
    },
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
