import maplibregl from 'maplibre-gl';
import mlcontour from 'maplibre-contour';

import { readTile } from './store';
import { contourThresholds, subsampleFor } from '../map/terrain';
import type { UnitSystem } from '../units';

/**
 * Contours from tiles that are not on the internet.
 *
 * `maplibre-contour`'s `DemSource` is the easy path and it cannot be used here.
 * It takes a URL and **fetches it itself**, in its own worker, with `fetch` —
 * so a MapLibre custom protocol like `survey://` is invisible to it. MapLibre
 * resolves those; `fetch` does not, and the failure is silent: the hillshade
 * draws, because MapLibre loads that source, and the contours simply never
 * appear because their generator got nothing.
 *
 * `LocalDemManager` is the seam. It is the same isoline machinery underneath,
 * exported separately, and it accepts a `getTile` — so we hand it one that
 * reads IndexedDB and register the protocol ourselves.
 *
 * The cost is that this runs on the main thread rather than in the library's
 * worker, because the worker path is reachable only through `DemSource`. For a
 * course-sized survey that is a few dozen tiles of a few hundred milliseconds
 * total, and it happens once per zoom rather than continuously.
 */

export const SURVEY_CONTOUR_PROTOCOL = 'survey-contour';

/**
 * The survey's contour tiles, with the smoothing level in the url.
 *
 * Units are held in module state and swapped in place — the url is stable for
 * them — but smoothing cannot be, because there has to be something for
 * `setTiles` to notice. MapLibre drops a source's cached tiles when its url
 * changes and keeps them when it does not, so a setting that must retrace the
 * isolines has to be visible in the url. This is the same reason the global
 * overlay encodes every generator argument into its own.
 */
export const surveyContourTilesUrl = (smoothing = 0): string =>
  `${SURVEY_CONTOUR_PROTOCOL}://tile/{z}/{x}/{y}?s=${Math.round(smoothing)}`;

const TILE_PATTERN = /\/(\d+)\/(\d+)\/(\d+)/;

/*
 * Held at module scope and swapped, rather than baked into the URL.
 *
 * `DemSource` encodes its options into the tile url, which is why the global
 * overlay changes units by re-pointing its source. Owning the protocol means we
 * can just change the numbers: the url is stable, so MapLibre keeps the source
 * and only the tiles it asks for again are regenerated.
 */
let units: UnitSystem = 'imperial';
let manager: InstanceType<typeof mlcontour.LocalDemManager> | null = null;
let managerMaxZoom = 0;
let registered = false;

export function setSurveyContourUnits(next: UnitSystem): void {
  units = next;
}

/**
 * Rebuild the manager for a survey of a given depth.
 *
 * `maxzoom` is fixed at construction and decides where the generator stops
 * asking for real tiles, so a new survey with a different depth needs a new
 * manager. Cheap: it holds caches, not data.
 */
export function prepareSurveyContours(maxZoom: number): void {
  if (manager && managerMaxZoom === maxZoom) return;
  manager = new mlcontour.LocalDemManager({
    // Substituted by the library and then parsed straight back out by
    // `getTile`; it never reaches the network.
    demUrlPattern: 'survey://tile/{z}/{x}/{y}',
    cacheSize: 200,
    encoding: 'terrarium',
    maxzoom: maxZoom,
    timeoutMs: 10_000,
    getTile: async (url) => {
      const match = TILE_PATTERN.exec(url);
      if (!match) throw new Error(`unreadable tile url: ${url}`);
      const [, z, x, y] = match;
      const blob = await readTile(Number(z), Number(x), Number(y));
      // Throwing rather than returning an empty blob: the generator treats a
      // failed tile as "no data here", which is exactly right outside the
      // survey, and an empty blob would fail later in the image decoder with a
      // much worse message.
      if (!blob) throw new Error('no tile');
      return { data: blob };
    },
  });
  managerMaxZoom = maxZoom;
}

/**
 * The `[minor, major]` interval for a zoom.
 *
 * `DemSource` does this lookup internally from its `thresholds` map — take the
 * entry for this zoom, or the nearest one below it. Owning the protocol means
 * owning the lookup too. Below the lowest entry there are no contours at all,
 * which is deliberate: a line every 250ft across a county is a texture.
 */
function levelsFor(zoom: number): number[] {
  const { thresholds } = contourThresholds(units);
  let best: number[] | null = null;
  let bestZoom = -Infinity;
  for (const [key, levels] of Object.entries(thresholds)) {
    const at = Number(key);
    if (at <= zoom && at > bestZoom) {
      bestZoom = at;
      best = levels;
    }
  }
  return best ?? [];
}

export function registerSurveyContourProtocol(): void {
  if (registered) return;
  registered = true;

  maplibregl.addProtocol(SURVEY_CONTOUR_PROTOCOL, async (params, abortController) => {
    const match = TILE_PATTERN.exec(params.url);
    if (!match || !manager) return { data: new ArrayBuffer(0) };

    const [, z, x, y] = match;
    const levels = levelsFor(Number(z));
    if (levels.length === 0) return { data: new ArrayBuffer(0) };

    // Read back off the url rather than held here, so a tile always traces at
    // the setting it was requested for even if another change is in flight.
    const smoothing = Number(/[?&]s=(\d+)/.exec(params.url)?.[1] ?? 0);

    try {
      const tile = await manager.fetchContourTile(
        Number(z),
        Number(x),
        Number(y),
        {
          levels,
          multiplier: contourThresholds(units).multiplier,
          // A real number here, unlike the global path where the library's own
          // url codec hands it back as a string. See `contourTilesUrl`.
          subsampleBelow: subsampleFor(smoothing),
          elevationKey: 'ele',
          levelKey: 'level',
          contourLayer: 'contours',
        },
        abortController,
      );
      return { data: tile.arrayBuffer };
    } catch {
      // Outside the survey, or a storage failure. Either way this coordinate
      // has no contours, which is a normal answer rather than a broken map.
      return { data: new ArrayBuffer(0) };
    }
  });
}
