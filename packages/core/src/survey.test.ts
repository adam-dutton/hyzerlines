import { describe, expect, it } from 'vitest';

import {
  VERTICAL_UNITS,
  VERTICAL_UNIT_METERS,
  decodeTerrarium,
  encodeTerrarium,
  linearUnitOf,
  metersPerPixel,
  siteSurveySchema,
  surveyZooms,
  tileBounds,
  tileCount,
  tileForPosition,
  tileRange,
  toMetersInPlace,
  withMargin,
  zoomForResolution,
} from './survey.js';

/**
 * The arithmetic the DEM importer turns on.
 *
 * All of it is testable without a browser, which is the point of it living
 * here: a sign error in the tile row calculation produces terrain that is
 * subtly in the wrong place, and that presents as bad data rather than as a
 * bug. Numbers below are checked against the Web Mercator definition rather
 * than against our own implementation.
 */

describe('web mercator arithmetic', () => {
  it('gives the published metres per pixel at the equator', () => {
    // The standard figure for z0, 256px tiles: earth circumference / 256.
    expect(metersPerPixel(0, 0)).toBeCloseTo(156543.03, 1);
    // Each zoom halves it.
    expect(metersPerPixel(1, 0)).toBeCloseTo(78271.52, 1);
    expect(metersPerPixel(19, 0)).toBeCloseTo(0.2986, 4);
  });

  it('narrows with latitude, by the cosine', () => {
    expect(metersPerPixel(15, 60)).toBeCloseTo(metersPerPixel(15, 0) * 0.5, 3);
  });

  /*
   * The whole reason resolution is latitude-dependent here: 1m data needs a
   * deeper zoom near the equator than it does in Scotland, and picking one
   * number for both would either waste tiles or throw away detail.
   */
  it('picks a zoom that resolves the data without overstating it', () => {
    const z = zoomForResolution(1, 45);
    expect(metersPerPixel(z, 45)).toBeLessThanOrEqual(1);
    expect(metersPerPixel(z - 1, 45)).toBeGreaterThan(1);
  });

  it('rounds up, so tiles never claim detail the source lacks', () => {
    // A resolution landing exactly between zooms must take the finer one.
    const latitude = 40;
    const between = (metersPerPixel(16, latitude) + metersPerPixel(17, latitude)) / 2;
    expect(zoomForResolution(between, latitude)).toBe(17);
  });

  it('round-trips a position through tile coordinates', () => {
    const lng = -93.1;
    const lat = 44.9;
    const zoom = 14;
    const { x, y } = tileForPosition(lng, lat, zoom);
    const [west, south, east, north] = tileBounds(zoom, Math.floor(x), Math.floor(y));

    expect(lng).toBeGreaterThanOrEqual(west);
    expect(lng).toBeLessThanOrEqual(east);
    expect(lat).toBeGreaterThanOrEqual(south);
    expect(lat).toBeLessThanOrEqual(north);
  });

  /*
   * Tile rows count southwards while latitude counts northwards. Getting this
   * backwards flips the terrain vertically, which on a symmetric hillside looks
   * almost right — the worst kind of wrong.
   */
  it('numbers tile rows southwards', () => {
    const north = tileForPosition(0, 60, 10);
    const south = tileForPosition(0, 10, 10);
    expect(north.y).toBeLessThan(south.y);

    const [, boundsSouth, , boundsNorth] = tileBounds(10, 512, 300);
    expect(boundsNorth).toBeGreaterThan(boundsSouth);
  });

  it('covers a bounds with an inclusive range of tiles', () => {
    const bounds: [number, number, number, number] = [-93.2, 44.8, -93.0, 45.0];
    const range = tileRange(bounds, 12);

    expect(range.minX).toBeLessThanOrEqual(range.maxX);
    expect(range.minY).toBeLessThanOrEqual(range.maxY);
    expect(tileCount(range)).toBe(
      (range.maxX - range.minX + 1) * (range.maxY - range.minY + 1),
    );

    // Both corners fall inside the range it reports.
    const nw = tileForPosition(bounds[0], bounds[3], 12);
    const se = tileForPosition(bounds[2], bounds[1], 12);
    expect(Math.floor(nw.x)).toBe(range.minX);
    expect(Math.floor(nw.y)).toBe(range.minY);
    expect(Math.floor(se.x)).toBe(range.maxX);
    expect(Math.floor(se.y)).toBe(range.maxY);
  });

  /*
   * The skirt the contour generator needs. Not for display — see `withMargin`.
   */
  it('grows a range by one tile on every side', () => {
    const range = tileRange([-93.2, 44.8, -93.0, 45.0], 12);
    const grown = withMargin(range);

    expect(grown.minX).toBe(range.minX - 1);
    expect(grown.maxX).toBe(range.maxX + 1);
    expect(grown.minY).toBe(range.minY - 1);
    expect(grown.maxY).toBe(range.maxY + 1);

    // A single-tile survey becomes the 3×3 the isoline generator demands.
    const single = { z: 14, minX: 100, maxX: 100, minY: 200, maxY: 200 };
    expect(tileCount(withMargin(single))).toBe(9);
  });

  it('does not let the margin run off the world', () => {
    expect(withMargin({ z: 1, minX: 0, maxX: 1, minY: 0, maxY: 1 })).toEqual({
      z: 1,
      minX: 0,
      maxX: 1,
      minY: 0,
      maxY: 1,
    });
  });

  it('clamps a range to the world rather than running off the edge', () => {
    const range = tileRange([-180, -85, 180, 85], 2);
    expect(range.minX).toBe(0);
    expect(range.maxX).toBe(3);
    expect(range.minY).toBe(0);
    expect(range.maxY).toBe(3);
  });
});

describe('terrarium encoding', () => {
  /*
   * These tiles are read by MapLibre's own decoder and by maplibre-contour, so
   * "our encoder agrees with our decoder" is not enough — the values have to
   * match the published formula, which is what the literals here are.
   */
  it('encodes sea level as the documented midpoint', () => {
    expect(encodeTerrarium(0)).toEqual([128, 0, 0]);
  });

  it('round-trips heights a course could actually sit at', () => {
    for (const meters of [0, 1, 12.5, 100, 337.75, 1609, 4400]) {
      const [r, g, b] = encodeTerrarium(meters);
      expect(decodeTerrarium(r, g, b)).toBeCloseTo(meters, 2);
    }
  });

  it('keeps sub-metre detail, which is the reason for importing at all', () => {
    const [r, g, b] = encodeTerrarium(100.25);
    expect(decodeTerrarium(r, g, b)).toBeCloseTo(100.25, 3);
    expect(decodeTerrarium(r, g, b)).not.toBe(100);
  });

  it('handles land below sea level', () => {
    const [r, g, b] = encodeTerrarium(-86);
    expect(decodeTerrarium(r, g, b)).toBeCloseTo(-86, 2);
  });

  it('clamps rather than wrapping, so a nodata sentinel cannot read as a peak', () => {
    // -32767 is a common nodata value; unclamped arithmetic would wrap it into
    // a plausible-looking positive elevation.
    const [r, g, b] = encodeTerrarium(-999999);
    expect(r).toBeGreaterThanOrEqual(0);
    expect(g).toBeGreaterThanOrEqual(0);
    expect(b).toBeGreaterThanOrEqual(0);
    expect(decodeTerrarium(r, g, b)).toBeLessThan(-32000);
  });

  it('never emits a byte outside 0-255', () => {
    for (const meters of [-40000, -32768, -1, 0, 0.001, 32767, 90000]) {
      for (const channel of encodeTerrarium(meters)) {
        expect(channel).toBeGreaterThanOrEqual(0);
        expect(channel).toBeLessThanOrEqual(255);
        expect(Number.isInteger(channel)).toBe(true);
      }
    }
  });
});

describe('choosing a pyramid', () => {
  it('spans four zooms below the data resolution', () => {
    const { minZoom, maxZoom } = surveyZooms(1, 45);
    expect(maxZoom - minZoom).toBe(4);
    expect(metersPerPixel(maxZoom, 45)).toBeLessThanOrEqual(1);
  });

  it('stays inside the world at coarse resolutions', () => {
    const { minZoom, maxZoom } = surveyZooms(200_000, 0);
    expect(minZoom).toBeGreaterThanOrEqual(0);
    expect(maxZoom).toBeGreaterThanOrEqual(minZoom);
  });

  /*
   * A course-sized survey has to be a manageable number of tiles, or the import
   * is a progress bar nobody waits for. Two kilometres square at 1m is the
   * shape this feature is for.
   */
  it('produces a tractable tile count for a course-sized area', () => {
    const latitude = 44.9;
    const { minZoom, maxZoom } = surveyZooms(1, latitude);
    // Roughly 2km square.
    const bounds: [number, number, number, number] = [-93.11, 44.89, -93.085, 44.908];

    let total = 0;
    for (let z = minZoom; z <= maxZoom; z++) total += tileCount(tileRange(bounds, z));

    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThan(400);
  });
});

/**
 * Vertical units.
 *
 * The bug this exists to prevent: a Colorado survey in State Plane US survey
 * feet, read as metres, reported ground at 22,000 ft. Every other part of the
 * import was correct — the projection, the bounds, the resolution, the contours
 * — which is exactly what makes it dangerous. The elevations were wrong by
 * 3.28, and then the PDGA's effective-length formula multiplied them by three.
 */
describe('vertical units', () => {
  it('converts feet to metres exactly', () => {
    expect(VERTICAL_UNIT_METERS.meter).toBe(1);
    expect(VERTICAL_UNIT_METERS.foot).toBe(0.3048);
    // The US survey foot is 1200/3937 m by definition, two parts per million
    // longer than the international foot. On a hole that is nothing; on an
    // elevation of 6,700 ft it is 4mm, and both are named in the EPSG register
    // so there is no reason to conflate them.
    expect(VERTICAL_UNIT_METERS.usFoot).toBeCloseTo(0.30480061, 8);
    expect(VERTICAL_UNIT_METERS.usFoot).not.toBe(VERTICAL_UNIT_METERS.foot);
  });

  it('maps the GeoTIFF VerticalUnitsGeoKey codes', () => {
    expect(VERTICAL_UNITS[9001]).toBe('meter');
    expect(VERTICAL_UNITS[9002]).toBe('foot');
    expect(VERTICAL_UNITS[9003]).toBe('usFoot');
    // Anything else is not a linear unit we can convert, and must not be
    // silently treated as one.
    expect(VERTICAL_UNITS[9102]).toBeUndefined();
  });

  /*
   * The fallback, for the common case of a file that declares no vertical unit
   * at all. It reads the unit the file states for its coordinates rather than
   * assuming metres — which is an assumption with no basis in the file.
   */
  describe('linearUnitOf', () => {
    it('reads US survey feet from a State Plane definition', () => {
      // EPSG:6428, NAD83(2011) / Colorado Central (ftUS) — the exact projection
      // that produced the 22,000 ft reading.
      expect(
        linearUnitOf(
          '+proj=lcc +lat_0=37.83 +lon_0=-105.5 +lat_1=39.75 +lat_2=38.45 ' +
            '+x_0=914401.828803657 +y_0=304800.609601219 +ellps=GRS80 +units=us-ft',
        ),
      ).toBe('usFoot');
    });

    it('tells international feet from US survey feet', () => {
      expect(linearUnitOf('+proj=lcc +units=ft')).toBe('foot');
      expect(linearUnitOf('+proj=lcc +units=us-ft')).toBe('usFoot');
    });

    it('reads metres from a UTM definition', () => {
      expect(linearUnitOf('+proj=utm +zone=15 +datum=NAD83 +units=m')).toBe('meter');
    });

    /*
     * A definition stating no unit, and a geographic one in degrees. proj4
     * treats an unstated linear unit as metres, and elevations alongside
     * latitude and longitude are metres by every convention going.
     */
    it('falls back to metres when no linear unit is stated', () => {
      expect(linearUnitOf('+proj=utm +zone=15 +datum=NAD83')).toBe('meter');
      expect(linearUnitOf('+proj=longlat +datum=WGS84')).toBe('meter');
    });
  });

  describe('toMetersInPlace', () => {
    it('leaves a metric grid untouched, without copying it', () => {
      const values = new Float32Array([100, 200, 300]);
      expect(toMetersInPlace(values, 'meter')).toBe(values);
      expect([...values]).toEqual([100, 200, 300]);
    });

    it('converts the reading that started this', () => {
      // 6,700 US survey feet is Colorado ground, not the roof of the Andes.
      const values = new Float32Array([6700]);
      toMetersInPlace(values, 'usFoot');
      expect(values[0]).toBeCloseTo(2042.16, 1);
    });

    it('handles elevations below sea level and zero', () => {
      const values = new Float32Array([0, -282]);
      toMetersInPlace(values, 'foot');
      expect(values[0]).toBe(0);
      expect(values[1]).toBeCloseTo(-85.95, 2);
    });
  });

  /*
   * Older documents carry no vertical unit. They were all imported by a build
   * that assumed metres, so metres is what they were read as — the default has
   * to describe what happened, not what we would choose now.
   */
  it('defaults an older survey record to declared metres', () => {
    const parsed = siteSurveySchema.parse({
      name: 'old.tif',
      bounds: [-93.2, 44.8, -93.1, 44.9],
      resolutionMeters: 1,
      crs: 'EPSG:26915',
      minZoom: 12,
      maxZoom: 16,
      importedAt: new Date().toISOString(),
    });
    expect(parsed.verticalUnit).toBe('meter');
    expect(parsed.verticalUnitDeclared).toBe(true);
  });
});
