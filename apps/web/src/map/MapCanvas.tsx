import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

import { basemapById, styleForBasemap, type Basemap } from './basemaps';
import { MapContext, type MapViewState } from './MapContext';

interface MapCanvasProps {
  basemapId: string;
  children?: React.ReactNode;
  /** Debounced camera reports, for persisting where the user was working. */
  onViewChange?: (view: MapViewState) => void;
}

/** One op per gesture, not one per frame. */
const VIEW_DEBOUNCE_MS = 400;

/**
 * Owns the MapLibre instance.
 *
 * The map is created exactly once and never torn down on prop changes — basemap
 * switches swap the style in place. Recreating the map would reset camera, break
 * pointer capture mid-drag, and (once drawing lands) drop editing state. Anything
 * that needs the instance gets it through MapContext rather than by remounting.
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
export function MapCanvas({ basemapId, children, onViewChange }: MapCanvasProps) {
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

    const basemap: Basemap = basemapById(basemapId);
    const instance = new maplibregl.Map({
      container: containerRef.current,
      style: styleForBasemap(basemap),
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
      dragRotate: true,
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

  // Basemap changes swap the style, preserving camera and any future overlays.
  useEffect(() => {
    const instance = mapRef.current;
    if (!instance) return;
    instance.setStyle(styleForBasemap(basemapById(basemapId)));
  }, [basemapId]);

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
