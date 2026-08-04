import { useEffect, useRef, useState } from 'react';
import type maplibregl from 'maplibre-gl';

import { isDrawingTool, type NavTool, type Tool } from './tools';

/**
 * Camera navigation: which gesture moves the map, and what the cursor says.
 *
 * The model is the one every design tool uses, because it is the one people
 * already have in their hands:
 *
 *   Select (V)   click selects; a drag does nothing to the camera
 *   Move (H)     drag pans; hold Space for it from any other tool
 *   Zoom         hold Z; drag a region to zoom to it, Alt to reverse
 *
 * The held-key variants matter more than the rail buttons. Reaching for a
 * toolbar to pan and then reaching back is the interaction that makes a map
 * editor feel slow, and Space-to-pan is the single gesture that fixes it.
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
 * a hand, and the Select tool ends up claiming it will pan. `default` is the
 * arrow, said out loud.
 */
function cursorFor(tool: Tool, invertZoom: boolean, dragging: boolean): string {
  if (tool === 'pan') return dragging ? 'grabbing' : 'grab';
  if (tool === 'zoom') return invertZoom ? 'zoom-out' : 'zoom-in';
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
   * Held keys.
   *
   * Deliberately not routed through the keyboard registry. Every other shortcut
   * is an event — it fires and is done — while these are states that last as
   * long as a finger is down, and the dispatcher has no concept of keyup. They
   * are still declared in the registry so the help overlay lists them.
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

      if (e.code === 'Space') {
        // Otherwise Space scrolls the page, or re-triggers a focused button.
        e.preventDefault();
        setHeld('pan');
      } else if (e.key === 'z' || e.key === 'Z') {
        e.preventDefault();
        setHeld('zoom');
      }
    };

    const up = (e: KeyboardEvent) => {
      if (e.key === 'Alt') setInvertZoom(false);
      if (e.code === 'Space') setHeld((h) => (h === 'pan' ? null : h));
      else if (e.key === 'z' || e.key === 'Z') setHeld((h) => (h === 'zoom' ? null : h));
    };

    /*
     * Losing the window mid-hold would otherwise strand the map in pan mode
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
   * Drag-pan is on only for the move tool, so a drag with the Select tool or a
   * drawing tool cannot slide the map out from under the thing being placed.
   * Space is always one keypress away, which is what makes that affordable.
   */
  useEffect(() => {
    if (!map) return;

    if (effective === 'pan') map.dragPan.enable();
    else map.dragPan.disable();

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
   * The move tool's cursor has to change on press, and MapLibre swallows the
   * pointer events that would tell us — its drag handler stops propagation
   * before they reach anything we bind. Watching the class it toggles is
   * indirect, but it is the state the map itself considers authoritative.
   */
  useEffect(() => {
    if (!map || effective !== 'pan') return;
    const container = map.getCanvasContainer();
    const down = () => setDragging(true);
    const up = () => setDragging(false);
    container.addEventListener('pointerdown', down);
    window.addEventListener('pointerup', up);
    return () => {
      container.removeEventListener('pointerdown', down);
      window.removeEventListener('pointerup', up);
      setDragging(false);
    };
  }, [map, effective]);

  const state: NavigationState = { effective, marquee, invertZoom };
  return state;
}
