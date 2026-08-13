import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

import type { Overlays } from '@hyzerlines/core';

import { MapContext, type MapViewState } from './MapContext';
import { groundIsDark } from './basemaps';
import {
  applyBasemap,
  applyContourUnits,
  applyDemSoftness,
  applyOverlayStyling,
  applyOverlays,
  buildStyle,
  styleReady,
} from './style';
import { useOrbit } from './useOrbit';
import type { UnitSystem } from '../units';

interface MapCanvasProps {
  basemapId: string;
  /** What is drawn over the basemap. See terrain.ts. */
  overlays: Overlays;
  /** Contour intervals are quoted in whatever the reader thinks in. */
  units: UnitSystem;
  /**
   * An imported survey is supplying the elevation, so the global overlay stands
   * down. Both drawn at once would be two hillshades of the same hill at
   * different resolutions, stacked.
   */
  suppressTerrain: boolean;
  /**
   * Whether the interface is dark, which decides two things about the map.
   *
   * Which tiles a basemap draws — the light ones or its dark twin — and which
   * way round the hillshade is inked. Both are visibility and paint changes on
   * a style that already holds every option, so a theme switch costs no more
   * than a basemap switch does. See `applyBasemap` and `hillshadeInk`.
   */
  dark: boolean;
  children?: React.ReactNode;
  /** Debounced camera reports, for persisting where the user was working. */
  onViewChange?: (view: MapViewState) => void;
}

/** One op per gesture, not one per frame. */
const VIEW_DEBOUNCE_MS = 400;

/**
 * Owns the MapLibre instance.
 *
 * The map is created exactly once and never torn down on prop changes.
 * Recreating it would reset the camera, break pointer capture mid-drag, and drop
 * editing state. Anything that needs the instance gets it through MapContext
 * rather than by remounting.
 *
 * The style is built once too. Every basemap and both terrain overlays are in it
 * from the start, and changing what is shown is a `visibility` change on a
 * layer — see `style.ts` for why `setStyle` is no longer called at all.
 *
 * Two things this component deliberately does NOT do:
 *
 * - **Set the camera when a document loads.** CourseEditor frames the features
 *   themselves, and it needs the document to do that. Two places moving the map
 *   on open is one too many; this owns the instance, that owns the intent.
 * - **Configure `scrollZoom`.** MapLibre's default anchors wheel zoom to the
 *   pointer, which is what you want. It was once set to `{ around: 'center' }`
 *   under a comment claiming that smoothed the wheel curve — it does not, it
 *   only moves the anchor, and anchoring to the centre walks a tee at the edge
 *   of the screen straight off it.
 */
export function MapCanvas({
  basemapId,
  overlays,
  units,
  suppressTerrain,
  dark,
  children,
  onViewChange,
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const viewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Held in a ref so the map's `move` handler — bound once, for the lifetime of
  // the map — always calls the current callback without rebinding.
  const onViewChangeRef = useRef(onViewChange);
  onViewChangeRef.current = onViewChange;
  const [map, setMap] = useState<maplibregl.Map | null>(null);
  const [view, setView] = useState<MapViewState>({
    center: [-98.5795, 39.8283], // geographic center of the contiguous US
    zoom: 3.4,
    bearing: 0,
    pitch: 0,
  });

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const instance = new maplibregl.Map({
      container: containerRef.current,
      style: buildStyle(basemapId, overlays, units, dark),
      center: view.center,
      zoom: view.zoom,
      // Course design is a plan-view task. Rotation and tilt are available but
      // never the default — a rotated north confuses distance and bearing reads.
      bearing: 0,
      pitch: 0,
      maxPitch: 60,
      // MapLibre's own controls are replaced by our chrome so the whole app
      // shares one visual language and one keyboard model.
      attributionControl: false,
      // Aerial detail matters more than bandwidth here.
      maxZoom: 21,
      // Ours, not MapLibre's own — see useOrbit for why.
      dragRotate: false,
      // Two-finger rotate constantly fires by accident while panning on trackpads.
      touchPitch: false,
    });

    instance.on('move', () => {
      const next: MapViewState = {
        center: instance.getCenter().toArray() as [number, number],
        zoom: instance.getZoom(),
        bearing: instance.getBearing(),
        pitch: instance.getPitch(),
      };
      // Chrome readouts follow every frame; the document does not.
      setView(next);

      if (viewTimerRef.current) clearTimeout(viewTimerRef.current);
      viewTimerRef.current = setTimeout(() => {
        onViewChangeRef.current?.(next);
      }, VIEW_DEBOUNCE_MS);
    });

    mapRef.current = instance;
    setMap(instance);

    /*
     * A debugging handle on the map instance.
     *
     * Genuinely useful from the console when diagnosing a rendering problem —
     * and, since this is AGPL and meant to be self-hosted, useful to anyone
     * running their own copy. The end-to-end tests use it to assert on things
     * that have no DOM representation, such as whether a feature is actually
     * flagged selected: a bug where selection silently did nothing shipped
     * past a full suite of tests that only ever checked the inspector opened.
     */
    (window as unknown as { hyzerlinesMap?: maplibregl.Map }).hyzerlinesMap = instance;

    return () => {
      if (viewTimerRef.current) clearTimeout(viewTimerRef.current);
      instance.remove();
      mapRef.current = null;
      setMap(null);
    };
    // Intentionally empty: the map is created once. See the comment above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useOrbit(map);

  /*
   * What is shown, as visibility rather than as a new style.
   *
   * One effect for all three, and it has to survive arriving early. Restoring
   * the autosave is asynchronous: the map is built from the default document
   * and the real one — which may have had hillshade on — lands a beat later.
   * If that beat falls before the style JSON has parsed, `setLayoutProperty`
   * has no layer to talk to and the restored setting is silently dropped.
   *
   * So it applies now if it can, and waits on `styledata` if it cannot,
   * dropping the listener the moment it succeeds. That last part matters:
   * applying visibility itself fires `styledata`, so a handler that stayed
   * subscribed would keep re-entering.
   *
   * Values come from a ref rather than the closure, so a listener registered on
   * one render applies whatever is current when it finally runs.
   */
  const desiredRef = useRef({ basemapId, overlays, units, suppressTerrain, dark });
  desiredRef.current = { basemapId, overlays, units, suppressTerrain, dark };

  useEffect(() => {
    if (!map) return;

    const apply = (): boolean => {
      if (!styleReady(map)) return false;
      const desired = desiredRef.current;
      applyBasemap(map, desired.basemapId, desired.dark);
      /*
       * Suppression turns the global overlays off without touching the rest of
       * the settings: an imported survey draws its own hillshade and contours
       * from the same opacity and softness, so those must survive the switch
       * or the shading would jump when a survey arrived.
       */
      const effective = desired.suppressTerrain
        ? { ...desired.overlays, hillshade: false, contours: false }
        : desired.overlays;

      applyOverlays(map, effective);
      // The basemap decides the ink, not the theme: in a dark interface over
      // imagery there is still a photograph underneath. See `groundIsDark`.
      applyOverlayStyling(map, effective, groundIsDark(desired.basemapId, desired.dark));
      applyDemSoftness(map, effective);
      applyContourUnits(map, desired.units, effective.contourSmoothing);
      return true;
    };

    if (apply()) return;

    const retry = () => {
      if (apply()) map.off('styledata', retry);
    };
    map.on('styledata', retry);
    return () => {
      map.off('styledata', retry);
    };
  }, [map, basemapId, overlays, units, suppressTerrain, dark]);

  return (
    <MapContext.Provider value={{ map, view }}>
      <div
        ref={containerRef}
        /*
         * h-full/w-full are load-bearing, not belt-and-braces.
         *
         * MapLibre adds a `maplibregl-map` class to this element at runtime, and
         * its stylesheet declares `.maplibregl-map { position: relative }`. That
         * selector and Tailwind's `.absolute` have identical specificity, so the
         * winner is decided by bundle order — and MapLibre's CSS lands after
         * Tailwind's. `position` reverts to relative, `inset-0` stops sizing
         * anything, and the container collapses to zero height while the canvas
         * falls back to its intrinsic 300px.
         *
         * The failure is silent: tiles still download, there is just nothing to
         * draw them into, which looks identical to a basemap that failed to
         * load. Explicit sizing is correct under either `position` value, so it
         * does not depend on winning an ordering race.
         */
        className="absolute inset-0 h-full w-full bg-surface-canvas"
        // The canvas is a real focus target: every map shortcut is scoped to it,
        // and keyboard users need to be able to reach it without a mouse.
        tabIndex={0}
        role="application"
        aria-label="Course map"
      />
      {children}
    </MapContext.Provider>
  );
}
