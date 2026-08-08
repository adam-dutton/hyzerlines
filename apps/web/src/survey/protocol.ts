import maplibregl from 'maplibre-gl';

import { readTile } from './store';

/**
 * Serving stored tiles to MapLibre.
 *
 * MapLibre fetches raster tiles by URL, and ours are in IndexedDB rather than
 * at an address. `addProtocol` is the seam for exactly this: register a scheme
 * and MapLibre hands over every request for it.
 *
 * The payoff is that an imported survey needs no special case anywhere else. It
 * is a `raster-dem` source with a `survey://` url, so the hillshade layer, the
 * contour generator and everything else built for the global overlay work on it
 * unchanged — they cannot tell that these tiles came off disk rather than S3.
 */

export const SURVEY_PROTOCOL = 'survey';

/** The url template a source uses. Parsed straight back apart below. */
export const SURVEY_TILES_URL = `${SURVEY_PROTOCOL}://tile/{z}/{x}/{y}`;

/**
 * A 256×256 fully transparent PNG, for coordinates the survey does not cover.
 *
 * MapLibre treats a rejected tile request as an error and retries it; returning
 * an empty tile says "nothing here" once and is done. Hard-coded rather than
 * drawn at runtime because it is 70 bytes and generating it would mean an
 * `OffscreenCanvas` on the first pan past the survey's edge.
 */
const EMPTY_TILE = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAQAAAD2e2DtAAAAAnRSTlMAAHaTzTgAAABwSURBVHja' +
      '7cEBDQAAAMKg909tDjegAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
      'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAvBsRgAABQ0BpsQAA' +
      'AABJRU5ErkJggg==',
  ),
  (c) => c.charCodeAt(0),
);

let registered = false;

/**
 * Register the protocol. Idempotent, and safe to call before any tiles exist.
 *
 * Module-scope registration would be simpler but happens at import time, which
 * is before the app knows whether it has a survey at all; this way the call
 * site reads as a decision rather than a side effect of an import.
 */
export function registerSurveyProtocol(): void {
  if (registered) return;
  registered = true;

  maplibregl.addProtocol(SURVEY_PROTOCOL, async (params) => {
    const match = /\/(\d+)\/(\d+)\/(\d+)/.exec(params.url);
    if (!match) return { data: EMPTY_TILE.slice().buffer };

    const [, z, x, y] = match;
    try {
      const blob = await readTile(Number(z), Number(x), Number(y));
      if (!blob) return { data: EMPTY_TILE.slice().buffer };
      return { data: await blob.arrayBuffer() };
    } catch {
      /*
       * A storage failure is an empty tile, not a broken map.
       *
       * Private browsing, a full disk and a database another tab is upgrading
       * all land here. None of them is a reason to stop drawing the course, and
       * the survey's absence is already visible — there is no terrain.
       */
      return { data: EMPTY_TILE.slice().buffer };
    }
  });
}
