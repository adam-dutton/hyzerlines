import maplibregl from 'maplibre-gl';
import mlcontour from 'maplibre-contour';
import type { LayerSpecification, RasterDEMSourceSpecification } from 'maplibre-gl';
import { feature as featureColors } from '@hyzerlines/design';
import type { Overlays, OverlaySwitch } from '@hyzerlines/core';

import type { UnitSystem } from '../units';

/**
 * Reading the land.
 *
 * Imagery answers what is growing there and where the paths already run. It
 * cannot answer the question that decides half a course's routing: which way
 * does this fall, and by how much. A hole that plays flat on a photograph and
 * drops fifteen metres in the last eighty is a different hole.
 *
 * Both overlays here read the same elevation model and are drawn from the same
 * fetched tiles — see `demSource` below.
 *
 * ## The source
 *
 * AWS Open Data's terrain tiles: keyless, no signup, no billing relationship,
 * which is the same bar every basemap in `basemaps.ts` has to clear. Terrarium
 * encoding, which MapLibre decodes natively.
 *
 * **Know what the numbers are worth.** The dataset is roughly 10m posts over
 * the US (3DEP) and roughly 30m elsewhere (SRTM). Ten metres will show you a
 * ridge, a bowl and a fall line. It will not show a two-metre mound behind a
 * green, and a contour drawn through one is interpolation rather than
 * measurement. That is why the interval stops tightening past `MAX_DEM_ZOOM`:
 * drawing foot contours off a 30m grid would be inventing precision, and this
 * app's whole premise is that its numbers are honest.
 */

/**
 * Zoom past which the DEM has nothing more to say. Tiles stop here.
 *
 * Exported because the elevation profile samples at this level too — it wants
 * the finest posting that exists rather than whatever the camera is showing,
 * and asking deeper would return an upsampled copy of the same numbers dressed
 * up as more detail.
 */
export const MAX_DEM_ZOOM = 13;

const DEM_TILES = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';

export const TERRAIN_ATTRIBUTION =
  'Elevation &copy; <a href="https://registry.opendata.aws/terrain-tiles/">AWS Terrain Tiles</a>, USGS 3DEP and NASA SRTM';

export const DEM_SOURCE = 'terrain-dem';
export const CONTOUR_SOURCE = 'terrain-contours';

export const HILLSHADE_LAYER = 'terrain-hillshade';
export const CONTOUR_LINE_LAYER = 'terrain-contour-line';
export const CONTOUR_LABEL_LAYER = 'terrain-contour-label';

/**
 * One fetch, two overlays.
 *
 * `maplibre-contour` computes isolines in a worker from raster elevation tiles,
 * and it exposes the decoded DEM back to MapLibre under its own protocol. So
 * the hillshade source points at `demSource.sharedDemProtocolUrl` rather than
 * at S3 directly: with both overlays on, a tile is downloaded and decoded once
 * and serves the shading and the lines. Pointing hillshade straight at S3 would
 * work and would double the traffic.
 *
 * Constructed at module scope because the protocol has to be registered with
 * MapLibre before any style referencing it is parsed, and a style is built in
 * `MapCanvas`'s first render.
 */
export const demSource = new mlcontour.DemSource({
  url: DEM_TILES,
  encoding: 'terrarium',
  maxzoom: MAX_DEM_ZOOM,
  // Isoline generation is real arithmetic over a quarter-million samples per
  // tile. On the main thread it lands as a stutter mid-pan.
  worker: true,
});

demSource.setupMaplibre(maplibregl);

export function demSourceSpec(softness = 0): RasterDEMSourceSpecification {
  return {
    type: 'raster-dem',
    // The shared protocol, not the S3 url. See the note on `demSource`.
    tiles: [demSource.sharedDemProtocolUrl],
    encoding: 'terrarium',
    tileSize: 256,
    // Softening stops the source fetching past a coarser level and lets
    // MapLibre interpolate up. See `demZoomFor`.
    maxzoom: demZoomFor(softness),
    attribution: TERRAIN_ATTRIBUTION,
  };
}

/**
 * The overlays, as the interface sees them.
 *
 * Keyed by `Overlays` so a switch added to the document is a compile error here
 * until it has a label — the same discipline `TARGET_CIRCLES` enforces on the
 * putting rings, and for the same reason: an overlay the app can draw but the
 * panel has no control for is a setting only a file can reach.
 *
 * The hints say what the thing is *for*, not what it is. "Relief shading" names
 * the technique; "which way the land falls" is why you would turn it on.
 */
export const OVERLAY_DEFINITIONS: {
  readonly id: OverlaySwitch;
  readonly label: string;
  readonly hint: string;
}[] = [
  { id: 'hillshade', label: 'Hillshade', hint: 'Which way the land falls' },
  { id: 'contours', label: 'Contours', hint: 'How far it falls, in lines' },
];

/**
 * Contour intervals, per zoom, as `[minor, major]` in the displayed unit.
 *
 * Read these as "what is worth a line at this range". Zoomed out to a whole
 * property you want the shape of the land, not every ripple; zoomed into a
 * single hole you want the fall across a landing zone. Below z10 there are no
 * lines at all — a contour every 250ft across a county is a texture, not
 * information.
 *
 * They stop tightening at z13 because the data stops improving there. Anything
 * finer would be drawing the interpolator's opinion.
 */
const FEET_THRESHOLDS: Record<number, [number, number]> = {
  10: [200, 1000],
  11: [100, 500],
  12: [50, 200],
  13: [20, 100],
  14: [10, 50],
};

const METRE_THRESHOLDS: Record<number, [number, number]> = {
  10: [50, 250],
  11: [25, 125],
  12: [10, 50],
  13: [5, 25],
  14: [2, 10],
};

/** Metres to feet, for the multiplier the isoline generator applies. */
const FEET_PER_METRE = 3.280839895;

/**
 * Interval and unit conversion for the isoline generator.
 *
 * Shared with the imported-survey layers, which run the same generator over a
 * different DEM — see `surveyLayers.ts`. A survey should read in the same
 * intervals as the global overlay, or switching between them would look like
 * the terrain changed rather than the source.
 */
export function contourThresholds(units: UnitSystem): {
  thresholds: Record<number, [number, number]>;
  multiplier: number;
} {
  const imperial = units === 'imperial';
  return {
    thresholds: imperial ? FEET_THRESHOLDS : METRE_THRESHOLDS,
    multiplier: imperial ? FEET_PER_METRE : 1,
  };
}

/**
 * The contour source's tile url, which encodes the interval and the unit.
 *
 * Units are a fact about the reader, so this changes when the reader changes
 * it — `applyContourUnits` swaps the url on the live source rather than
 * rebuilding the style around it.
 */
export function contourTilesUrl(units: UnitSystem, smoothing = 0): string {
  return demSource.contourProtocolUrl({
    ...contourThresholds(units),
    /*
     * Encoded into the url like everything else `maplibre-contour` is
     * configured with, which is also how changing it invalidates the tiles
     * already computed.
     *
     * It arrives back through the library's own decoder as a string, since only
     * `extent`, `multiplier`, `overzoom` and `buffer` are coerced to numbers
     * there. That is harmless — it is compared with `<` and `>=`, which convert
     * a numeric string before comparing — but it is why this must stay a plain
     * integer with nothing clever in it.
     */
    subsampleBelow: subsampleFor(smoothing),
    // Overzoom one level: a z14 contour tile is generated from the z13 DEM,
    // which is the deepest that exists. Without this the lines simply stop.
    overzoom: 1,
    elevationKey: 'ele',
    levelKey: 'level',
    contourLayer: 'contours',
  });
}

/** Visibility as MapLibre spells it. */
const shown = (on: boolean) => (on ? ('visible' as const) : ('none' as const));

/**
 * How faint a minor contour is against an index one.
 *
 * The two were 0.45 and 0.7, so full strength was a 70%-opaque line over aerial
 * imagery — legible on grass and nearly invisible over canopy, which is exactly
 * where contours matter most. Full strength is a solid line now, and this is
 * the ratio the minor ones keep, so the contrast that makes the labelled lines
 * findable survives at every setting.
 */
export const MINOR_RATIO = 0.64;

/**
 * Which side of a slope the shading inks, and how strongly.
 *
 * Igor shading splits every slope into a lit half and a shaded half and paints
 * them with two separate colours — from the shader:
 *
 *     fragColor = shadow * shadow_strength + highlight * highlight_strength
 *
 * where the two strengths are complements by aspect. So relief can be drawn
 * with *either* ink alone, and which one is right depends entirely on what is
 * underneath.
 *
 * Over a light or photographic base, black on the shaded side. Over a dark
 * base, black is invisible — a shadow on near-black ground is nothing at all —
 * and the relief has to come from light on the lit side instead. Same layer,
 * same strength, opposite ink: the map keeps reading as terrain rather than
 * turning into a grey haze.
 *
 * `darkGround` is therefore a fact about the *tiles*, not about the interface.
 * A dark theme over satellite imagery still wants black, because imagery has no
 * dark twin to switch to and what is on screen is still a photograph — see
 * `groundIsDark`, which is the only thing that should be answering this.
 *
 * Opacity lives in the ink's alpha because there is nowhere else. MapLibre has
 * no `hillshade-opacity`, and with the accent transparent and only one of these
 * two carrying colour, that alpha *is* the layer's opacity rather than an
 * approximation of one.
 */
export function hillshadeInk(
  opacity: number,
  darkGround: boolean,
): { shadow: string; highlight: string } {
  const alpha = Math.max(0, Math.min(1, opacity));
  const clear = 'rgba(0, 0, 0, 0)';
  return darkGround
    ? { shadow: clear, highlight: `rgba(255, 255, 255, ${alpha})` }
    : { shadow: `rgba(0, 0, 0, ${alpha})`, highlight: clear };
}

/**
 * How deep a DEM to read the shading from, given a softness setting.
 *
 * Each level drops one zoom, so the source stops fetching at a coarser step and
 * MapLibre interpolates back up — a low-pass filter on the ground rather than
 * on the picture of it. See `hillshadeSoftness` in core.
 */
export const demZoomFor = (softness: number): number =>
  Math.max(0, MAX_DEM_ZOOM - Math.round(softness));

/**
 * `subsampleBelow`, per smoothing level.
 *
 * `maplibre-contour` upsamples its height grid until it is at least this wide
 * before tracing isolines. The 3×3 neighbourhood is 256 across, so 256 leaves
 * the grid alone and 512 interpolates it once.
 *
 * **It stops at 512 deliberately.** The isoline pass is quadratic in grid
 * width, so 1024 is sixteen times the work of 256, and tiles began exceeding
 * their timeout and coming back empty — lines that appeared at one setting and
 * vanished at another depending on what was already cached. One doubling is the
 * most that can be asked for safely, so the top two levels are the same here.
 *
 * The survey does not use this at all: it owns its decoder, so it averages the
 * elevation grid instead, which is linear rather than quadratic. See
 * `SMOOTH_RADIUS` in `contourProtocol`.
 */
const CONTOUR_SUBSAMPLE = [256, 512, 512] as const;

export const subsampleFor = (smoothing: number): number =>
  CONTOUR_SUBSAMPLE[Math.max(0, Math.min(2, Math.round(smoothing)))] ?? 256;

/**
 * One hillshade layer, over whichever DEM it is given.
 *
 * Parameterised because there are two DEMs — the global one and an imported
 * survey — and they must look identical. If they diverged, switching between
 * them would read as the terrain changing rather than the source, which is
 * exactly the wrong thing for a tool whose job is to be trusted about ground.
 */
export function hillshadeLayerSpec(
  id: string,
  source: string,
  visible: boolean,
  opacity = 1,
  darkGround = false,
): LayerSpecification {
  const ink = hillshadeInk(opacity, darkGround);
  return {
    id,
    type: 'hillshade',
    source,
    layout: { visibility: shown(visible) },
    paint: {
      /*
       * Igor, not the default.
       *
       * The standard method darkens by slope in both directions, which over
       * aerial imagery reads as grime — flat ground goes muddy and the
       * photograph underneath stops being legible. Igor shades only the
       * shadowed side and leaves flat ground alone, so tree canopy still looks
       * like tree canopy and the relief arrives as a separate signal.
       */
      'hillshade-method': 'igor',
      /*
       * Full exaggeration, with the strength carried entirely by the opacity
       * below. It used to sit at 0.5, which quietly capped how strong the
       * shading could ever be — so the opacity control could only make an
       * already-faint layer fainter. Now the top of the slider is the top of
       * the range, and the old appearance is somewhere in the middle of it.
       */
      'hillshade-exaggeration': 1,
      /*
       * One ink, on whichever side of the slope the base calls for. Over
       * imagery a white-lit slope would wash out the very detail the imagery
       * was chosen for; over a dark canvas a black one would not show at all.
       * See `hillshadeInk`.
       */
      'hillshade-shadow-color': ink.shadow,
      'hillshade-highlight-color': ink.highlight,
      'hillshade-accent-color': 'rgba(0, 0, 0, 0)',
    },
  };
}

/** The contour line and its labels, over whichever contour source it is given. */
export function contourLayerSpecs(
  lineId: string,
  labelId: string,
  source: string,
  visible: boolean,
  opacity = 1,
): LayerSpecification[] {
  return [
    {
      id: lineId,
      type: 'line',
      source,
      'source-layer': 'contours',
      layout: { visibility: shown(visible), 'line-join': 'round' },
      paint: {
        'line-color': featureColors.contour.stroke,
        // Index contours carry the labels and the number you actually read, so
        // they are the ones that have to survive being drawn over a photograph.
        'line-width': ['case', ['>', ['get', 'level'], 0], 1.1, 0.6],
        /*
         * Scaled rather than replaced, so the index contours keep reading as
         * heavier than the minor ones at every setting — that contrast is what
         * makes the labelled lines findable, and a flat opacity would throw it
         * away the moment somebody turned the lines down.
         */
        'line-opacity': ['case', ['>', ['get', 'level'], 0], opacity, opacity * MINOR_RATIO],
      },
    },
    {
      id: labelId,
      type: 'symbol',
      source,
      'source-layer': 'contours',
      // Only index contours are labelled. Numbering every minor line at a 10ft
      // interval buries the map in type you cannot read anyway.
      filter: ['>', ['get', 'level'], 0],
      layout: {
        visibility: shown(visible),
        'symbol-placement': 'line',
        // No `text-font`, deliberately: `hole-label` does not set one either,
        // and MapLibre's default stack is the one known to resolve against the
        // glyph server in `style.ts`. Naming a font here that stack does not
        // carry is a label that silently never draws.
        'text-field': ['concat', ['number-format', ['get', 'ele'], {}], ''],
        'text-size': 10,
        'text-max-angle': 25,
        // Far apart: a repeated elevation every 80px is noise, and one label
        // per screenful of a given line is enough to orient by.
        'symbol-spacing': 320,
      },
      paint: {
        'text-color': featureColors.contour.stroke,
        // A halo rather than a plate. The number has to be legible over canopy
        // and over sand, and it is the only thing here that carries a value.
        'text-halo-color': 'rgba(0, 0, 0, 0.65)',
        'text-halo-width': 1.2,
      },
    },
  ];
}

/**
 * The global overlay's layers, in draw order.
 *
 * Between the basemap and the course. Terrain is context for the design, so it
 * must never sit over a fairway corridor or a hole number — `FeatureLayer`
 * appends the course on top of whatever is already there, which is what keeps
 * that true without either file knowing about the other.
 *
 * Installed at the visibility the document asks for rather than hidden and then
 * corrected. A course saved with contours on should open with contours on, not
 * open bare and grow them a frame later.
 */
export function terrainLayers(overlays: Overlays, darkGround = false): LayerSpecification[] {
  return [
    hillshadeLayerSpec(
      HILLSHADE_LAYER,
      DEM_SOURCE,
      overlays.hillshade,
      overlays.hillshadeOpacity,
      darkGround,
    ),
    ...contourLayerSpecs(
      CONTOUR_LINE_LAYER,
      CONTOUR_LABEL_LAYER,
      CONTOUR_SOURCE,
      overlays.contours,
      overlays.contourOpacity,
    ),
  ];
}
