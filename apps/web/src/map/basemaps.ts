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
  /**
   * The same map, drawn for a dark interface.
   *
   * A second set of tiles rather than a filter over the first, and that is
   * forced rather than chosen: MapLibre's raster paint offers brightness,
   * contrast, saturation and hue — and no invert. Darkening a light map without
   * inverting it drags the paper to mid-grey while the labels stay black, so the
   * map comes out *less* readable than the one it replaced. Only tiles a
   * provider drew dark are actually dark.
   *
   * Absent for imagery. A photograph of the ground has no light mode to invert:
   * it is whatever colour that ground is.
   */
  dark?: DarkBasemap;
}

/**
 * A basemap's dark twin.
 *
 * Esri splits its canvas basemaps in two — the ground in one service and the
 * labels in another — where the topographic and imagery services bake the
 * labels in. So this carries an optional second URL, drawn directly over the
 * first. It is the only place in the registry where one basemap is two layers,
 * and it earns that: a dark street map with no street names is a picture of
 * roads rather than a map.
 */
export interface DarkBasemap {
  tiles: string[];
  /** Labels and boundaries, over the ground. */
  reference?: string[];
  /** Shown in the switcher, in place of the light map's. */
  hint: string;
  attribution: string;
  maxZoom: number;
}

/**
 * What Esri's canvas services credit.
 *
 * Deliberately short. The imagery and topographic entries below carry the full
 * contributor lists those services publish; this one names only Esri, because
 * the exact list for the dark canvas is the `copyrightText` field of the
 * service's own metadata and nobody here has read it. Crediting Esri is
 * certainly required and certainly true — inventing a list of data partners to
 * sit beside it would not be.
 */
const ESRI_CANVAS_ATTRIBUTION = 'Tiles &copy; Esri';

/**
 * Where Esri's dark canvas stops.
 *
 * Under-claimed on purpose. Past a source's real maximum the provider returns
 * nothing and the map goes blank; short of it MapLibre overzooms the last good
 * tile, which is blurry and still legible. Given one of those has to be wrong,
 * blurry beats blank — and the terrain overlays this app draws on top keep
 * their own resolution either way.
 */
const ESRI_CANVAS_MAX_ZOOM = 16;

/**
 * Esri's dark grey canvas, standing in for both light maps.
 *
 * One record shared by two entries, because it genuinely is one service. The
 * topographic and street maps differ in what they draw; their dark twin is the
 * same neutral ground either way, and pretending otherwise by writing it twice
 * would invite the two copies to drift.
 *
 * It is a canvas rather than a dark topographic map, because there is no such
 * thing on offer keyless — and for this app that turns out to be the better half
 * of the trade. A canvas is deliberately drained of terrain colouring so that
 * whatever is drawn over it reads; this app draws hillshade and contours from a
 * real DEM, so the dark Topographic is our own terrain on a neutral ground
 * rather than Esri's tinting underneath ours.
 */
const ESRI_DARK_CANVAS: DarkBasemap = {
  tiles: [
    'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
  ],
  reference: [
    'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
  ],
  hint: 'Esri Dark Gray Canvas',
  attribution: ESRI_CANVAS_ATTRIBUTION,
  maxZoom: ESRI_CANVAS_MAX_ZOOM,
};

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
    dark: ESRI_DARK_CANVAS,
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
    dark: ESRI_DARK_CANVAS,
  },
] as const;

export const DEFAULT_BASEMAP = basemaps[0]!;

export function basemapById(id: string): Basemap {
  return basemaps.find((b) => b.id === id) ?? DEFAULT_BASEMAP;
}

/**
 * Which tiles a basemap actually draws right now, and what they credit.
 *
 * One function so the renderer and the attribution line can never disagree
 * about which of the two is on screen — a credit for tiles nobody is looking at
 * is worse than no credit at all, because it is a specific false claim.
 *
 * `dark` on the way out is not `dark` on the way in. The argument is what the
 * *interface* is doing; the field is whether the tiles that resulted are dark
 * ones, which is a weaker claim — a dark interface over imagery still has a
 * photograph underneath.
 */
export function effectiveBasemap(
  basemap: Basemap,
  dark: boolean,
): { hint: string; attribution: string; maxZoom: number; dark: boolean } {
  const variant = dark ? basemap.dark : undefined;
  if (variant) {
    return {
      hint: variant.hint,
      attribution: variant.attribution,
      maxZoom: variant.maxZoom,
      dark: true,
    };
  }
  return {
    hint: basemap.hint,
    attribution: basemap.attribution,
    maxZoom: basemap.maxZoom,
    dark: false,
  };
}

/**
 * Whether the ground under the overlays is dark tiles.
 *
 * The question anything drawn *over* the basemap has to ask, and it is not
 * "is the interface dark". Imagery has no dark twin, so a dark interface leaves
 * a photograph on screen — and shading it as though it were a dark canvas would
 * ink the relief in white over a mid-tone aerial, washing out the very detail
 * the imagery was chosen for. See `hillshadeInk`.
 */
export const groundIsDark = (basemapId: string, dark: boolean): boolean =>
  effectiveBasemap(basemapById(basemapId), dark).dark;
