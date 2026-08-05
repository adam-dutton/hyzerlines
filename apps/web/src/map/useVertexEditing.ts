import { useCallback, useEffect, useRef } from 'react';
import type maplibregl from 'maplibre-gl';
import type { Feature, Geometry, Position } from '@hyzerlines/core';

/**
 * Reshaping a line or an area after it has been drawn.
 *
 * Drag a vertex to move it, click the hollow handle between two vertices to
 * insert one there, Alt-click a vertex to remove it. That is the same grammar
 * every vector editor uses, and a fairway is a thing you adjust dozens of times
 * after the first pass — redrawing it from scratch to move one corner is the
 * kind of friction that makes people stop routing holes properly.
 *
 * Edits go straight into the document, one op per pointer move. That keeps a
 * single source of truth for geometry while a drag is in flight, so the fairway
 * length in the panel and the corridor under the cursor both track the vertex
 * live rather than snapping into place on release. `canCoalesce` folds the run
 * into one undo entry.
 */

/** Below these a shape stops being its own geometry type. */
const MINIMUM_VERTICES = { line: 2, polygon: 3 } as const;

export const VERTEX_LAYERS = ['edit-vertex', 'edit-midpoint'] as const;

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

/**
 * Handles for a feature's geometry.
 *
 * Solid handles sit on the vertices; hollow ones sit between them and become a
 * vertex when clicked. Midpoints are a straight average of the two ends rather
 * than a great-circle midpoint — over a fairway segment the difference is
 * centimetres, and the handle's whole purpose is to be dragged somewhere else.
 */
export function vertexHandles(feature: Feature | null): GeoJSON.FeatureCollection {
  if (!feature || feature.geometry.type === 'point') return EMPTY;

  const coordinates = feature.geometry.coordinates;
  const closed = feature.geometry.type === 'polygon';
  const features: GeoJSON.Feature[] = [];

  coordinates.forEach((position, index) => {
    features.push({
      type: 'Feature',
      properties: { role: 'vertex', index },
      geometry: { type: 'Point', coordinates: position },
    });
  });

  // A polygon's ring is stored open, so its closing edge needs a handle too.
  const edges = closed ? coordinates.length : coordinates.length - 1;
  for (let i = 0; i < edges; i++) {
    const a = coordinates[i]!;
    const b = coordinates[(i + 1) % coordinates.length]!;
    features.push({
      type: 'Feature',
      // The position this handle would insert at: after the vertex it follows.
      // For the closing edge that is the end of the array, which is exactly
      // where an open ring wants its new last point.
      properties: { role: 'midpoint', index: i + 1 },
      geometry: { type: 'Point', coordinates: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] },
    });
  }

  return { type: 'FeatureCollection', features };
}

interface UseVertexEditingArgs {
  map: maplibregl.Map | null;
  /** The feature being reshaped, or null when nothing editable is selected. */
  feature: Feature | null;
  /** Off while a tool is drawing or the zoom hold is down. */
  enabled: boolean;
  onGeometry: (id: string, geometry: Geometry) => void;
}

export function useVertexEditing({ map, feature, enabled, onGeometry }: UseVertexEditingArgs): {
  handles: GeoJSON.FeatureCollection;
} {
  // Handlers bind to the map once and read current values through refs, so a
  // re-render mid-drag does not tear down the listener holding the gesture.
  const featureRef = useRef(feature);
  featureRef.current = feature;
  const onGeometryRef = useRef(onGeometry);
  onGeometryRef.current = onGeometry;

  /** Rewrite the selected feature's coordinates, keeping its geometry type. */
  const write = useCallback((next: Position[]) => {
    const current = featureRef.current;
    if (!current || current.geometry.type === 'point') return;
    onGeometryRef.current(current.id, {
      type: current.geometry.type,
      coordinates: next,
    } as Geometry);
  }, []);

  useEffect(() => {
    if (!map || !enabled || !feature || feature.geometry.type === 'point') return;

    /** Live drag terminators, so unmounting mid-gesture cannot strand one. */
    const releases = new Set<() => void>();

    const coordinatesNow = (): Position[] | null => {
      const current = featureRef.current;
      return current && current.geometry.type !== 'point'
        ? [...current.geometry.coordinates]
        : null;
    };

    /** Follow the pointer until it comes up, moving one vertex as it goes. */
    const beginDrag = (index: number) => {
      const onMove = (move: maplibregl.MapMouseEvent) => {
        const coordinates = coordinatesNow();
        if (!coordinates || index >= coordinates.length) return;
        coordinates[index] = [move.lngLat.lng, move.lngLat.lat];
        write(coordinates);
      };

      const onUp = () => {
        map.off('mousemove', onMove);
        releases.delete(onUp);
      };
      releases.add(onUp);

      map.on('mousemove', onMove);
      /*
       * The release is caught on the window, not on the map.
       *
       * MapLibre's `mouseup` only fires while the pointer is over the canvas,
       * and a vertex near the edge of the viewport is routinely dragged out
       * over a docked panel before the button comes up. Listening on the map
       * would leave that drag running forever, with the vertex following the
       * cursor around the interface until the next click.
       */
      window.addEventListener('pointerup', onUp, { once: true });
      window.addEventListener('pointercancel', onUp, { once: true });
    };

    const onVertexDown = (e: maplibregl.MapLayerMouseEvent) => {
      // Stops MapLibre panning the map out from under the vertex.
      e.preventDefault();

      const index = e.features?.[0]?.properties?.['index'];
      if (typeof index !== 'number') return;

      const coordinates = coordinatesNow();
      if (!coordinates) return;

      if (e.originalEvent.altKey) {
        /*
         * Alt-click removes. Refused below the minimum rather than silently
         * deleting the feature: a two-point line and a three-point area are
         * still shapes, and dropping to one point would fail the schema and
         * lose the whole thing.
         */
        const floor = MINIMUM_VERTICES[featureRef.current!.geometry.type as 'line' | 'polygon'];
        if (coordinates.length <= floor) return;
        coordinates.splice(index, 1);
        write(coordinates);
        return;
      }

      beginDrag(index);
    };

    const onMidpointDown = (e: maplibregl.MapLayerMouseEvent) => {
      e.preventDefault();

      const index = e.features?.[0]?.properties?.['index'];
      const geometry = e.features?.[0]?.geometry;
      if (typeof index !== 'number' || geometry?.type !== 'Point') return;

      const coordinates = coordinatesNow();
      if (!coordinates) return;

      coordinates.splice(index, 0, geometry.coordinates as Position);
      write(coordinates);
      // Straight into a drag on the new vertex: clicking a midpoint means "I
      // want a corner here", and here is almost never exactly halfway.
      beginDrag(index);
    };

    // Handles read as grabbable. Set on the canvas, matching how FeatureLayer
    // does its own hover feedback.
    const onEnter = () => {
      map.getCanvas().style.cursor = 'move';
    };
    const onLeave = () => {
      map.getCanvas().style.cursor = '';
    };

    map.on('mousedown', 'edit-vertex', onVertexDown);
    map.on('mousedown', 'edit-midpoint', onMidpointDown);
    for (const layer of VERTEX_LAYERS) {
      map.on('mouseenter', layer, onEnter);
      map.on('mouseleave', layer, onLeave);
    }

    return () => {
      map.off('mousedown', 'edit-vertex', onVertexDown);
      map.off('mousedown', 'edit-midpoint', onMidpointDown);
      for (const layer of VERTEX_LAYERS) {
        map.off('mouseenter', layer, onEnter);
        map.off('mouseleave', layer, onLeave);
      }
      for (const release of [...releases]) release();
    };
    // `feature` is in the deps only so that selecting a different shape rebinds
    // against the right minimum; the handlers themselves read it through a ref.
  }, [map, enabled, feature, write]);

  return { handles: enabled ? vertexHandles(feature) : EMPTY };
}
