/**
 * Basemap registry.
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
 * requires and MapCanvas renders it. Do not add a source without one.
 */

import type { StyleSpecification } from 'maplibre-gl';

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

/** Minimal MapLibre style for a single raster source. */
export function styleForBasemap(basemap: Basemap): StyleSpecification {
  return {
    version: 8,
    // Local glyphs would be better, but PR 0 has no labels of its own yet.
    glyphs: 'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf',
    sources: {
      basemap: {
        type: 'raster',
        tiles: [...basemap.tiles],
        tileSize: 256,
        maxzoom: basemap.maxZoom,
        attribution: basemap.attribution,
      },
    },
    layers: [
      {
        id: 'basemap',
        type: 'raster',
        source: 'basemap',
        paint: { 'raster-fade-duration': 120 },
      },
    ],
  } as StyleSpecification;
}
