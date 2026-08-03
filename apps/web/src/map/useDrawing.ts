import { useCallback, useEffect, useRef, useState } from 'react';
import type maplibregl from 'maplibre-gl';
import {
  KIND_DEFINITIONS,
  type FeatureKind,
  type Geometry,
  type Position,
} from '@hyzerlines/core';

export type Tool = 'select' | FeatureKind;

interface UseDrawingArgs {
  map: maplibregl.Map | null;
  tool: Tool;
  onCommit: (kind: FeatureKind, geometry: Geometry) => void;
  /** Return to Select once a shape lands, matching how design tools behave. */
  onDone: () => void;
}

export interface DrawingState {
  /** Vertices placed so far in the current shape. */
  pending: Position[];
  /** Where the cursor is, for the rubber-band preview. */
  cursor: Position | null;
  /** True while a multi-point shape is in progress. */
  active: boolean;
  commit: () => void;
  cancel: () => void;
}

/**
 * Click-to-draw for points, lines and polygons.
 *
 * The interaction follows what people already know from vector editors: points
 * place on a single click; lines and areas take a click per vertex, finish on
 * Enter or by double-clicking, and abandon on Escape.
 *
 * Geometry accumulates here rather than in the document. A half-drawn line is
 * not a feature — putting it in the store would make it autosave, land on the
 * undo stack, and reappear on reload as a broken shape. Only completed geometry
 * is committed.
 */
export function useDrawing({ map, tool, onCommit, onDone }: UseDrawingArgs): DrawingState {
  const [pending, setPending] = useState<Position[]>([]);
  const [cursor, setCursor] = useState<Position | null>(null);

  // Handlers are bound to the map once; refs keep them reading current values
  // without rebinding on every render.
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const pendingRef = useRef(pending);
  pendingRef.current = pending;

  const reset = useCallback(() => {
    setPending([]);
    setCursor(null);
  }, []);

  const commit = useCallback(() => {
    const current = toolRef.current;
    const points = pendingRef.current;
    if (current === 'select') return;

    const geometryType = KIND_DEFINITIONS[current].geometry;
    // Below the minimum the shape isn't valid geometry — silently discard
    // rather than committing something the schema will reject.
    if (geometryType === 'line' && points.length < 2) return reset();
    if (geometryType === 'polygon' && points.length < 3) return reset();

    if (geometryType === 'line') onCommit(current, { type: 'line', coordinates: points });
    else if (geometryType === 'polygon')
      onCommit(current, { type: 'polygon', coordinates: points });

    reset();
    onDone();
  }, [onCommit, onDone, reset]);

  const cancel = useCallback(() => reset(), [reset]);

  // Reset whenever the tool changes: a half-drawn OB boundary must not carry
  // over into the fairway tool.
  useEffect(() => {
    reset();
  }, [tool, reset]);

  useEffect(() => {
    if (!map) return;

    const handleClick = (e: maplibregl.MapMouseEvent) => {
      const current = toolRef.current;
      if (current === 'select') return;

      const position: Position = [e.lngLat.lng, e.lngLat.lat];
      const geometryType = KIND_DEFINITIONS[current].geometry;

      if (geometryType === 'point') {
        onCommit(current, { type: 'point', coordinates: position });
        onDone();
        return;
      }

      setPending((prev) => [...prev, position]);
    };

    const handleMove = (e: maplibregl.MapMouseEvent) => {
      if (toolRef.current === 'select' || pendingRef.current.length === 0) return;
      setCursor([e.lngLat.lng, e.lngLat.lat]);
    };

    const handleDoubleClick = (e: maplibregl.MapMouseEvent) => {
      if (toolRef.current === 'select' || pendingRef.current.length === 0) return;
      // Otherwise MapLibre zooms in on the same gesture that finishes the shape.
      e.preventDefault();
      commit();
    };

    map.on('click', handleClick);
    map.on('mousemove', handleMove);
    map.on('dblclick', handleDoubleClick);

    return () => {
      map.off('click', handleClick);
      map.off('mousemove', handleMove);
      map.off('dblclick', handleDoubleClick);
    };
  }, [map, onCommit, onDone, commit]);

  // The cursor is the mode indicator: crosshair means "this click will place
  // something", grab means "this drag will move the map".
  useEffect(() => {
    if (!map) return;
    const canvas = map.getCanvas();
    canvas.style.cursor = tool === 'select' ? '' : 'crosshair';
    return () => {
      canvas.style.cursor = '';
    };
  }, [map, tool]);

  return { pending, cursor, active: pending.length > 0, commit, cancel };
}

/**
 * Live preview of the shape being drawn.
 *
 * Rendered from a separate source so it never touches the document, and so it
 * can be styled as provisional — dashed, with visible vertices — rather than
 * looking like something already committed.
 */
export function drawingPreview(
  tool: Tool,
  pending: Position[],
  cursor: Position | null,
): GeoJSON.FeatureCollection {
  if (tool === 'select' || pending.length === 0) {
    return { type: 'FeatureCollection', features: [] };
  }

  const geometryType = KIND_DEFINITIONS[tool].geometry;
  const path = cursor ? [...pending, cursor] : pending;
  const features: GeoJSON.Feature[] = [];

  if (geometryType === 'polygon' && path.length >= 3) {
    features.push({
      type: 'Feature',
      properties: { kind: tool },
      geometry: { type: 'Polygon', coordinates: [[...path, path[0]!]] },
    });
  }

  if (path.length >= 2) {
    features.push({
      type: 'Feature',
      properties: { kind: tool },
      geometry: {
        type: 'LineString',
        // Closing edge included so an area reads as enclosed while drawing.
        coordinates: geometryType === 'polygon' ? [...path, path[0]!] : path,
      },
    });
  }

  // Placed vertices, so it is obvious what has been committed to the shape.
  for (const point of pending) {
    features.push({
      type: 'Feature',
      properties: { kind: tool },
      geometry: { type: 'Point', coordinates: point },
    });
  }

  return { type: 'FeatureCollection', features };
}
