/**
 * Basemap registry — what goes underneath everything.
 *
 * Course design is imagery-first — you are reading tree lines, terrain and
 * existing paths — so aerial is the default and the others are references.
 *
 * ATTRIBUTION IS NOT OPTIONAL. Each entry carries the exact string its provider
 * requires and `Attribution` renders it. Do not add a source without one.
 *
 * Adding one is this list and nothing else: `style.ts` turns every entry into a
 * source and a hidden layer, and switching is a visibility change. What is
 * drawn *over* the basemap lives in `terrain.ts`.
 *
 * ## Two registries, chosen at build time
 *
 * With a MapTiler key the app draws MapTiler's cartography; without one it
 * draws the keyless sources it always did. **The fallback is deliberate and is
 * not a stopgap.** A missing key would otherwise mean a blank map, and three
 * things depend on the app working without an account: the browser suite, which
 * stubs tile hosts rather than buying quota; anyone self-hosting a copy; and the
 * first thirty seconds of a new visitor's session, which is the whole argument
 * for a tool that opens and works.
 *
 * The two registries deliberately share ids, labels and roles. Only the tiles
 * differ, so nothing downstream — the document, the switcher, the tests — can
 * tell which one it got.
 */

/**
 * The MapTiler key, compiled in.
 *
 * Public by construction: this is a client-side app, so the key is in the
 * bundle and readable by anyone. That is normal for MapTiler and is why their
 * dashboard restricts a key by **origin** — the protection is that the key only
 * works on your domains, not that nobody can see it. Restrict it there before
 * shipping, or you are paying for other people's maps.
 */
const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY ?? '';

/**
 * A Mapbox access token, compiled in. Public for the same reason the MapTiler
 * key is, and restricted the same way — by URL, in the Mapbox dashboard.
 *
 * **This is a spike.** It exists so the two providers can be compared on the
 * real app by swapping one environment variable, not because a decision has
 * been made. See `MAPBOX_BASEMAPS` for what the comparison actually turns on.
 */
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN ?? '';

export const usingMapTiler = MAPTILER_KEY !== '';
export const usingMapbox = MAPBOX_TOKEN !== '';

export interface Basemap {
  id: string;
  label: string;
  /** Shown in the switcher under the label. */
  hint: string;
  tiles: string[];
  attribution: string;
  maxZoom: number;
  /**
   * Pixels per tile edge. 512 for MapTiler, 256 for the keyless sources.
   *
   * Not cosmetic. A 512px tile covers four times the ground of a 256px one, so
   * a screenful is a quarter of the requests — and MapTiler bills per tile
   * request. MapLibre handles either natively; this is not Leaflet, so no
   * `zoomOffset` correction is needed.
   */
  tileSize: number;
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
   */
  dark?: DarkBasemap;
}

/**
 * A basemap's dark twin.
 *
 * `reference` exists for one provider's shape: Esri splits its canvas basemaps
 * into ground and labels, where every other service here bakes the labels in.
 * MapTiler needs none of it — a dark style is one set of tiles — so the field is
 * optional and unused on that path.
 */
export interface DarkBasemap {
  tiles: string[];
  /** Labels and boundaries, over the ground. Esri's canvas only. */
  reference?: string[];
  /** Shown in the switcher, in place of the light map's. */
  hint: string;
  attribution: string;
  maxZoom: number;
  tileSize: number;
}

/* ------------------------------------------------------------------ *
 * MapTiler
 * ------------------------------------------------------------------ */

/**
 * A rasterised MapTiler style.
 *
 * Raster rather than vector, and that is a deliberate trade against the prettier
 * option. MapTiler's styles are vector, and vector would be crisper at every
 * zoom — but a vector basemap is a *whole style document*, with its own sources,
 * glyphs, sprite and a hundred layers. Three of those cannot coexist as hidden
 * layers, so switching would mean `setStyle` again: the call this app removed
 * because it threw away every layer the app had added and emptied the map until
 * you reloaded. See the note at the top of `style.ts`.
 *
 * So the basemap stays one raster layer, the architecture stays intact, and the
 * cartography is MapTiler's either way. 512px tiles narrow the crispness gap and
 * cut the request count at the same time.
 */
const maptilerTiles = (mapId: string): string[] => [
  `https://api.maptiler.com/maps/${mapId}/{z}/{x}/{y}.png?key=${MAPTILER_KEY}`,
];

/**
 * What MapTiler's vector styles credit.
 *
 * The string MapTiler's own examples publish for their OpenStreetMap-derived
 * maps. Their terms require "© MapTiler" on every map drawn from their content;
 * the OpenStreetMap half is required by ODbL because that is where the data came
 * from. Both are obligations, not courtesies.
 *
 * **A free account additionally has to show the MapTiler logo** as a linked
 * image, which no string can satisfy — and the free plan is non-commercial in
 * any case. On a paid plan the text below is sufficient.
 */
const MAPTILER_ATTRIBUTION =
  '&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/**
 * What MapTiler's satellite credits.
 *
 * Deliberately shorter than the string above, and short for the same reason the
 * Esri canvas line is: the aerial is not OpenStreetMap data, so naming
 * OpenStreetMap under it would be false, and the actual imagery partners are
 * listed by MapTiler rather than known here. Crediting MapTiler is certainly
 * required and certainly true. Confirm the partner list from their satellite
 * page before launch and lengthen this.
 */
const MAPTILER_SATELLITE_ATTRIBUTION =
  '&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a>';

/**
 * Where MapTiler's rasters stop.
 *
 * Under-claimed on purpose, the same way the Esri canvas is. Past a source's
 * real maximum the provider returns nothing and the map goes blank; short of it
 * MapLibre overzooms the last good tile, which is blurry and still legible.
 * Given one of those has to be wrong, blurry beats blank — and the terrain
 * overlays drawn on top keep their own resolution either way.
 */
const MAPTILER_MAX_ZOOM = 20;

const MAPTILER_TILE_SIZE = 512;

function maptilerBasemap(
  id: string,
  label: string,
  mapId: string,
  attribution: string,
  imagery: boolean,
  /** Absent for imagery. See `MAPTILER_BASEMAPS`. */
  darkMapId?: string,
): Basemap {
  return {
    id,
    label,
    hint: `MapTiler ${label}`,
    tiles: maptilerTiles(mapId),
    attribution,
    maxZoom: MAPTILER_MAX_ZOOM,
    tileSize: MAPTILER_TILE_SIZE,
    imagery,
    ...(darkMapId
      ? {
          dark: {
            tiles: maptilerTiles(darkMapId),
            hint: `MapTiler ${label} Dark`,
            attribution,
            maxZoom: MAPTILER_MAX_ZOOM,
            tileSize: MAPTILER_TILE_SIZE,
          },
        }
      : {}),
  };
}

/**
 * MapTiler for all three, dark twins for the two that should have one.
 *
 * **Satellite is never dark, on any path.** MapTiler does publish
 * `satellite-v4-dark`, and it was wired up here on the reasoning that every map
 * deserves a dark twin — which mistook symmetry for correctness. That style is
 * *night imagery*: it darkens the ground itself. Aerial is the layer a designer
 * reads tree lines, mown paths and clearings off, and dimming it to suit the
 * interface destroys the information it is on screen for. A photograph is not
 * chrome and does not have a theme.
 */
const MAPTILER_BASEMAPS: readonly Basemap[] = [
  maptilerBasemap(
    'satellite',
    'Satellite',
    'satellite-v4',
    MAPTILER_SATELLITE_ATTRIBUTION,
    true,
  ),
  maptilerBasemap(
    'topo',
    'Topographic',
    'topo-v4',
    MAPTILER_ATTRIBUTION,
    false,
    'topo-v4-dark',
  ),
  maptilerBasemap(
    'street',
    'Street',
    'streets-v4',
    MAPTILER_ATTRIBUTION,
    false,
    'streets-v4-dark',
  ),
] as const;

/* ------------------------------------------------------------------ *
 * Mapbox — spike
 * ------------------------------------------------------------------ */

/**
 * A Mapbox style, rasterised by their Static Tiles API.
 *
 * `@2x` on a 512 tile returns a 1024px image for the same *request*, and Mapbox
 * bills by request — so the sharper tile is free in the only currency that
 * matters here. `tileSize` stays 512 because that is the tile's extent on the
 * ground; the doubling is pixel density, not coverage.
 *
 * Rendering with MapLibre rather than Mapbox GL JS is documented and supported
 * by Mapbox themselves, which is worth writing down because it used to be the
 * blocker: Mapbox GL JS went proprietary at v2 and MapLibre is the fork of the
 * last open version. Their own guide now covers using their APIs from MapLibre
 * over plain HTTPS tile URLs, which is exactly what this does.
 */
const mapboxTiles = (styleId: string): string[] => [
  `https://api.mapbox.com/styles/v1/mapbox/${styleId}/tiles/512/{z}/{x}/{y}@2x?access_token=${MAPBOX_TOKEN}`,
];

/**
 * What Mapbox requires on the map.
 *
 * Their terms also require the Mapbox **wordmark** as an image, and an
 * "Improve this map" link back to their feedback tool — neither of which a
 * string can satisfy. Confirm the current wording and the logo rules from their
 * attribution page before this ships as anything but a spike; what is below is
 * the text half only.
 */
const MAPBOX_ATTRIBUTION =
  '&copy; <a href="https://www.mapbox.com/about/maps/">Mapbox</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const MAPBOX_SATELLITE_ATTRIBUTION =
  '&copy; <a href="https://www.mapbox.com/about/maps/">Mapbox</a>';

const MAPBOX_MAX_ZOOM = 20;

function mapboxBasemap(
  id: string,
  label: string,
  styleId: string,
  attribution: string,
  imagery: boolean,
  darkStyleId?: string,
): Basemap {
  return {
    id,
    label,
    hint: `Mapbox ${label}`,
    tiles: mapboxTiles(styleId),
    attribution,
    maxZoom: MAPBOX_MAX_ZOOM,
    tileSize: 512,
    imagery,
    ...(darkStyleId
      ? {
          dark: {
            tiles: mapboxTiles(darkStyleId),
            hint: 'Mapbox Dark',
            attribution,
            maxZoom: MAPBOX_MAX_ZOOM,
            tileSize: 512,
          },
        }
      : {}),
  };
}

/**
 * Mapbox for all three — and the finding this spike exists to record.
 *
 * **Mapbox Standard has a proper dark mode, and this cannot reach it.** Their
 * v3 Standard style carries a `lightPreset` — dawn, day, dusk, night — and the
 * night preset is a night rendering of the *same* map rather than a separate
 * generic dark one. It is the right answer to the problem, and it is the thing
 * you see offered in Studio.
 *
 * It is unreachable from here for a specific, dated reason: the Static Tiles
 * API does not support Standard or Standard Satellite, and Mapbox document that
 * custom styles importing either are unsupported too, with support "planned for
 * a future release". Raster tiles are the only path that keeps this app's
 * one-style architecture — see `mapboxTiles` — so Standard's night preset sits
 * behind an API we cannot use.
 *
 * Reaching it would mean rendering vector with Mapbox GL JS v3, which is a
 * different proposition entirely: that library is proprietary from v2 onward,
 * and this app's terrain and survey layers are built on MapLibre's `addProtocol`
 * — `maplibre-contour` computes its isolines through it. That is an engine
 * replacement, not a provider switch.
 *
 * So the classic styles are what is available over raster, and they have no
 * per-style dark: `outdoors-v12` and `streets-v12` both fall back to the generic
 * `dark-v11` below, which is the same "two maps, one grey ground" result that
 * got Esri's dark canvas rejected.
 *
 * **The way out, if Mapbox is wanted anyway,** is Studio: author a dark
 * topographic and a dark street style there and serve those style ids. Static
 * Tiles serves custom styles fine as long as they do not import Standard. That
 * is real work and a real capability MapTiler's fixed catalogue does not offer —
 * it is just not something a token alone unlocks.
 */
const MAPBOX_BASEMAPS: readonly Basemap[] = [
  mapboxBasemap('satellite', 'Satellite', 'satellite-v9', MAPBOX_SATELLITE_ATTRIBUTION, true),
  mapboxBasemap('topo', 'Topographic', 'outdoors-v12', MAPBOX_ATTRIBUTION, false, 'dark-v11'),
  mapboxBasemap('street', 'Street', 'streets-v12', MAPBOX_ATTRIBUTION, false, 'dark-v11'),
] as const;

/* ------------------------------------------------------------------ *
 * Keyless
 * ------------------------------------------------------------------ */

/**
 * What Esri's canvas services credit.
 *
 * Deliberately short. The imagery and topographic entries carry the full
 * contributor lists those services publish; this one names only Esri, because
 * the exact list for the dark canvas is the `copyrightText` field of the
 * service's own metadata and nobody here has read it. Crediting Esri is
 * certainly required and certainly true — inventing a list of data partners to
 * sit beside it would not be.
 */
const ESRI_CANVAS_ATTRIBUTION = 'Tiles &copy; Esri';

/** Where Esri's dark canvas stops. Under-claimed; see `MAPTILER_MAX_ZOOM`. */
const ESRI_CANVAS_MAX_ZOOM = 16;

/**
 * Esri's dark grey canvas, standing in for both light maps.
 *
 * One record shared by two entries, because it genuinely is one service. The
 * topographic and street maps differ in what they draw; their dark twin is the
 * same neutral ground either way, and writing it twice would invite the copies
 * to drift.
 *
 * It ships its labels as a separate service, so this is the one basemap drawn as
 * two layers — a dark street map with no street names is a picture of roads
 * rather than a map.
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
  tileSize: 256,
};

/**
 * The no-account path.
 *
 * Every source is keyless and usable under its published attribution, which is
 * what lets the app work the moment it loads with no signup and no billing
 * relationship.
 *
 * Satellite has no dark twin here. A photograph of the ground has no light mode
 * to invert — it is whatever colour that ground is — and unlike MapTiler, none
 * of these providers offers a night pass.
 */
const KEYLESS_BASEMAPS: readonly Basemap[] = [
  {
    id: 'satellite',
    label: 'Satellite',
    hint: 'Esri World Imagery',
    tiles: [
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    ],
    attribution:
      'Imagery &copy; Esri, Maxar, Earthstar Geographics, and the GIS User Community',
    maxZoom: 19,
    tileSize: 256,
    imagery: true,
  },
  {
    id: 'topo',
    label: 'Topographic',
    hint: 'Esri World Topo',
    tiles: [
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    ],
    attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ, USGS, NOAA',
    maxZoom: 19,
    tileSize: 256,
    imagery: false,
    dark: ESRI_DARK_CANVAS,
  },
  {
    id: 'street',
    label: 'Street',
    hint: 'OpenStreetMap',
    tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
    tileSize: 256,
    imagery: false,
    dark: ESRI_DARK_CANVAS,
  },
] as const;

/* ------------------------------------------------------------------ *
 * Lookup
 * ------------------------------------------------------------------ */

/**
 * Which registry the build got.
 *
 * MapTiler wins a tie deliberately: it is the provider this app is actually
 * on, and the Mapbox entry is a spike reached only by setting its token and
 * nothing else. Keyless remains the floor — see the note at the top of this
 * file for why a missing key must not mean a blank map.
 */
export const basemaps: readonly Basemap[] = usingMapTiler
  ? MAPTILER_BASEMAPS
  : usingMapbox
    ? MAPBOX_BASEMAPS
    : KEYLESS_BASEMAPS;

export const DEFAULT_BASEMAP = basemaps[0]!;

/**
 * Ids that were once written into saved courses.
 *
 * `basemapId` is a document field, so it outlives the registry that produced
 * it. The ids used to name their provider — which stopped being true the moment
 * a second provider could serve the same role — so they name the role now, and
 * this maps the old spellings forward.
 *
 * Without it every course saved before the rename would open on Satellite,
 * because `basemapById` falls back to the default for an id it does not know.
 * That is a silent loss of the designer's choice, which is exactly the kind of
 * quiet data damage a migration exists to prevent.
 */
const LEGACY_IDS: Readonly<Record<string, string>> = {
  'esri-imagery': 'satellite',
  'esri-topo': 'topo',
  osm: 'street',
};

/**
 * A document's stored id, as the current registry spells it.
 *
 * Anything comparing a stored `basemapId` against a registry id has to go
 * through this, not through `===`. The switcher is the case that proves it: it
 * marked a radio active by raw string equality, so a course saved as
 * `esri-topo` drew the topographic map correctly — `basemapById` resolved it —
 * while the panel showed nothing selected at all. The map and the control
 * disagreed about the same field.
 */
export const resolveBasemapId = (id: string): string => basemapById(id).id;

export function basemapById(id: string): Basemap {
  const resolved = LEGACY_IDS[id] ?? id;
  return basemaps.find((b) => b.id === resolved) ?? DEFAULT_BASEMAP;
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
 * ones, which is a weaker claim — on the keyless path a dark interface over
 * imagery still has a daylight photograph underneath.
 */
export function effectiveBasemap(
  basemap: Basemap,
  dark: boolean,
): {
  hint: string;
  attribution: string;
  maxZoom: number;
  tileSize: number;
  dark: boolean;
} {
  const variant = dark ? basemap.dark : undefined;
  if (variant) {
    return {
      hint: variant.hint,
      attribution: variant.attribution,
      maxZoom: variant.maxZoom,
      tileSize: variant.tileSize,
      dark: true,
    };
  }
  return {
    hint: basemap.hint,
    attribution: basemap.attribution,
    maxZoom: basemap.maxZoom,
    tileSize: basemap.tileSize,
    dark: false,
  };
}

/**
 * Whether the ground under the overlays is dark tiles.
 *
 * The question anything drawn *over* the basemap has to ask, and it is not
 * "is the interface dark". On the keyless path imagery has no dark twin, so a
 * dark interface leaves a daylight photograph on screen — and shading it as
 * though it were a dark canvas would ink the relief in white over a mid-tone
 * aerial, washing out the very detail the imagery was chosen for. See
 * `hillshadeInk`.
 */
export const groundIsDark = (basemapId: string, dark: boolean): boolean =>
  effectiveBasemap(basemapById(basemapId), dark).dark;
