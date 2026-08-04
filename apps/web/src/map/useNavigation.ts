import { useEffect, useRef, useState } from 'react';
import type maplibregl from 'maplibre-gl';

import { isDrawingTool, type NavTool, type Tool } from './tools';

/**
 * Camera navigation: which gesture moves the map, and what the cursor says.
 *
 *   Select (V)   click selects; drag pans
 *   Zoom         hold Z; drag a region to zoom to it, Alt to reverse
 *
 * **Dragging pans from every tool except Zoom.** That is what a map does, and
 * it is worth saying why explicitly: an earlier version made panning its own
 * mode with a hand tool and a Space-to-pan hold, borrowed from design tools. On
 * a canvas that is a map first, requiring a modifier to do the thing every
 * other map on the internet does on a plain drag is friction with nothing on
 * the other side of it.
 *
 * The cursor carries the whole story instead: an arrow until you press, the
 * four-way move cursor while you are actually dragging the ground.
 *
 * MapLibre's own shift+drag box zoom is switched off. It collides with
 * shift-click multi-select, it is undiscoverable, and it would be a second way
 * to do what Z-drag does — with different behaviour.
 */

export interface Marquee {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface NavigationState {
  /**
   * What the map is actually doing, after held keys are applied.
   *
   * Differs from the rail's tool while Space or Z is down. The rail reads this
   * rather than its own prop, so the highlighted button always matches what the
   * next drag will do.
   */
  effective: Tool;
  /** The zoom region being dragged, in container pixels. */
  marquee: Marquee | null;
  /** True when a zoom gesture would zoom out — Alt held. */
  invertZoom: boolean;
}

/** Below this, a zoom drag is a click: too small a region to mean anything. */
const DRAG_THRESHOLD_PX = 6;

/** Never leave the user staring at one grey pixel of an over-zoomed marquee. */
const MIN_MARQUEE_PX = 12;

const EDITABLE = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

const isTyping = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement && (EDITABLE.has(target.tagName) || target.isContentEditable);

/**
 * Always an explicit value, never the empty string.
 *
 * MapLibre's stylesheet sets `cursor: grab` on `.maplibregl-canvas-container`,
 * so clearing our own value does not fall back to an arrow — it falls back to
 * a hand, permanently, whether or not anything is being dragged. `default` is
 * the arrow, said out loud.
 */
function cursorFor(tool: Tool, invertZoom: boolean, dragging: boolean): string {
  if (tool === 'zoom') return invertZoom ? 'zoom-out' : 'zoom-in';
  // The four-way arrows, and only while the ground is actually moving. A hand
  // sitting there permanently claims a mode the map is not in.
  if (dragging) return 'move';
  if (isDrawingTool(tool)) return 'crosshair';
  return 'default';
}

export function useNavigation({ map, tool }: { map: maplibregl.Map | null; tool: Tool }) {
  /** Which key is currently overriding the tool, if any. */
  const [held, setHeld] = useState<NavTool | null>(null);
  const [invertZoom, setInvertZoom] = useState(false);
  const [marquee, setMarquee] = useState<Marquee | null>(null);
  const [dragging, setDragging] = useState(false);

  const effective: Tool = held ?? tool;

  const effectiveRef = useRef(effective);
  effectiveRef.current = effective;
  const invertRef = useRef(invertZoom);
  invertRef.current = invertZoom;

  /*
   * The zoom hold.
   *
   * Deliberately not routed through the keyboard registry. Every other shortcut
   * is an event — it fires and is done — while this is a state that lasts as
   * long as a finger is down, and the dispatcher has no concept of keyup. It is
   * still declared in the registry so the help overlay lists it.
   */
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.altKey && (e.key === 'Alt' || effectiveRef.current === 'zoom')) {
        setInvertZoom(true);
      }
      if (isTyping(e.target)) return;
      // A modifier means this is a real shortcut (⌘Z), not a tool hold.
      if (e.metaKey || e.ctrlKey) return;

      if (e.key === 'z' || e.key === 'Z') {
        e.preventDefault();
        setHeld('zoom');
      }
    };

    const up = (e: KeyboardEvent) => {
      if (e.key === 'Alt') setInvertZoom(false);
      if (e.key === 'z' || e.key === 'Z') setHeld((h) => (h === 'zoom' ? null : h));
    };

    /*
     * Losing the window mid-hold would otherwise strand the map in zoom mode
     * forever: the keyup lands on whatever took focus, not on us.
     */
    const clear = () => {
      setHeld(null);
      setInvertZoom(false);
    };

    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear);
    };
  }, []);

  /*
   * Which MapLibre handlers are live.
   *
   * Drag-pan is on for everything except Zoom, where the drag is drawing a
   * region and panning at the same time would be incoherent. Placing a feature
   * is a click, and MapLibre suppresses `click` once the pointer has moved
   * past its tolerance, so a pan mid-draw cannot drop a stray vertex.
   */
  useEffect(() => {
    if (!map) return;

    if (effective === 'zoom') map.dragPan.disable();
    else map.dragPan.enable();

    // Ours replaces it — see the note at the top of the file.
    map.boxZoom.disable();

    // A double-click while the zoom tool is held would fight the marquee.
    if (effective === 'zoom') map.doubleClickZoom.disable();
    else map.doubleClickZoom.enable();
  }, [map, effective]);

  /*
   * Set on the canvas container as well as the canvas.
   *
   * The container is the element MapLibre's own stylesheet targets, and an
   * inline style there is the only thing that reliably outranks it. The canvas
   * is set too so that a hit test on the canvas itself agrees.
   */
  useEffect(() => {
    if (!map) return;
    const cursor = cursorFor(effective, invertZoom, dragging);
    const canvas = map.getCanvas();
    const container = map.getCanvasContainer();
    canvas.style.cursor = cursor;
    container.style.cursor = cursor;
    return () => {
      canvas.style.cursor = '';
      container.style.cursor = '';
    };
  }, [map, effective, invertZoom, dragging]);

  /*
   * The zoom marquee.
   *
   * Drag a region and the map zooms to it; hold Alt and the current view
   * shrinks into that region instead. One formula drives both directions, so
   * zooming out is exactly the inverse of zooming in rather than a separate
   * behaviour that happens to be nearby.
   *
   * A drag under a few pixels is a click, and clicks step one zoom level.
   */
  useEffect(() => {
    if (!map) return;
    const container = map.getCanvasContainer();
    let origin: { x: number; y: number } | null = null;

    const pointFor = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const onPointerDown = (e: PointerEvent) => {
      if (effectiveRef.current !== 'zoom' || e.button !== 0) return;
      e.preventDefault();
      origin = pointFor(e);
      container.setPointerCapture(e.pointerId);
      setDragging(true);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!origin) return;
      const p = pointFor(e);
      setMarquee({
        left: Math.min(origin.x, p.x),
        top: Math.min(origin.y, p.y),
        width: Math.abs(p.x - origin.x),
        height: Math.abs(p.y - origin.y),
      });
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!origin) return;
      const start = origin;
      origin = null;
      setDragging(false);
      setMarquee(null);
      if (container.hasPointerCapture(e.pointerId)) {
        container.releasePointerCapture(e.pointerId);
      }

      const end = pointFor(e);
      const out = e.altKey || invertRef.current;
      const width = Math.abs(end.x - start.x);
      const height = Math.abs(end.y - start.y);

      if (width < DRAG_THRESHOLD_PX && height < DRAG_THRESHOLD_PX) {
        // A click, not a region. Step one level around where it landed.
        map.easeTo({
          zoom: map.getZoom() + (out ? -1 : 1),
          around: map.unproject([end.x, end.y]),
          duration: 200,
        });
        return;
      }

      const box = map.getCanvas();
      const scale = Math.min(
        box.clientWidth / Math.max(width, MIN_MARQUEE_PX),
        box.clientHeight / Math.max(height, MIN_MARQUEE_PX),
      );
      const delta = Math.log2(scale);

      map.easeTo({
        center: map.unproject([(start.x + end.x) / 2, (start.y + end.y) / 2]),
        zoom: map.getZoom() + (out ? -delta : delta),
        duration: 300,
      });
    };

    container.addEventListener('pointerdown', onPointerDown);
    container.addEventListener('pointermove', onPointerMove);
    container.addEventListener('pointerup', onPointerUp);
    container.addEventListener('pointercancel', onPointerUp);
    return () => {
      container.removeEventListener('pointerdown', onPointerDown);
      container.removeEventListener('pointermove', onPointerMove);
      container.removeEventListener('pointerup', onPointerUp);
      container.removeEventListener('pointercancel', onPointerUp);
    };
  }, [map]);

  /*
   * The drag cursor.
   *
   * Tracked from raw pointer events on the container rather than from
   * MapLibre's own drag events, because `dragstart` only fires once the pointer
   * has moved past its tolerance — the cursor would change a few pixels late,
   * which reads as lag rather than as a threshold.
   *
   * `pointerup` is on the window: a drag that ends outside the canvas must
   * still put the cursor back.
   */
  useEffect(() => {
    if (!map || effective === 'zoom') return;
    const container = map.getCanvasContainer();
    const down = (e: PointerEvent) => {
      if (e.button === 0) setDragging(true);
    };
    const up = () => setDragging(false);
    container.addEventListener('pointerdown', down);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      container.removeEventListener('pointerdown', down);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      setDragging(false);
    };
  }, [map, effective]);

  const state: NavigationState = { effective, marquee, invertZoom };
  return state;
}
