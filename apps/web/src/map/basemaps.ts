/**
 * Basemap registry — what goes underneath everything.
 *
 * Course design is imagery-first — you are reading tree lines, terrain and
 * existing paths — so aerial is the default and the others are references.
 *
 * Every source here is keyless and usable under its published attribution, which
 * is what lets the app work the moment it loads with no signup and no billing
 * relationship. Keyed providers (MapTiler, Mapbox) can be layered in later behind
 * the tile proxy; the shape below already accommodates them.
 *
 * ATTRIBUTION IS NOT OPTIONAL. Each entry carries the exact string its provider
 * requires and `Attribution` renders it. Do not add a source without one.
 *
 * Adding one is now this list and nothing else: `style.ts` turns every entry
 * into a source and a hidden layer, and switching is a visibility change.
 * What is drawn *over* the basemap lives in `terrain.ts`.
 */

export interface Basemap {
  id: string;
  label: string;
  /** Shown in the switcher under the label. */
  hint: string;
  tiles: string[];
  attribution: string;
  maxZoom: number;
  /** Aerial tiles are dark and noisy; UI over them needs different treatment. */
  imagery: boolean;
}

export const basemaps: readonly Basemap[] = [
  {
    id: 'esri-imagery',
    label: 'Satellite',
    hint: 'Esri World Imagery',
    tiles: [
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    ],
    attribution:
      'Imagery &copy; Esri, Maxar, Earthstar Geographics, and the GIS User Community',
    maxZoom: 19,
    imagery: true,
  },
  {
    id: 'esri-topo',
    label: 'Topographic',
    hint: 'Esri World Topo',
    tiles: [
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    ],
    attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ, USGS, NOAA',
    maxZoom: 19,
    imagery: false,
  },
  {
    id: 'osm',
    label: 'Street',
    hint: 'OpenStreetMap',
    tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
    imagery: false,
  },
] as const;

export const DEFAULT_BASEMAP = basemaps[0]!;

export function basemapById(id: string): Basemap {
  return basemaps.find((b) => b.id === id) ?? DEFAULT_BASEMAP;
}
