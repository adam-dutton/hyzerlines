import { useCallback, useEffect, useRef } from 'react';
import type maplibregl from 'maplibre-gl';
import type { Position } from '@hyzerlines/core';

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
 *
 * The shape being edited is deliberately NOT a `Feature`. A fairway is the line
 * between a tee and a target whether or not the document stores one, and
 * dragging its midpoint is exactly the moment it becomes stored — so this works
 * against an interface that can describe a shape the document does not yet have,
 * and lets the caller decide what writing to it means.
 */

export interface EditableShape {
  /** Identity, for rebinding. A feature id, or a pair key for a derived line. */
  key: string;
  type: 'line' | 'polygon';
  coordinates: readonly Position[];
  /**
   * Whether the first and last vertices are owned by something else.
   *
   * True for a fairway: it runs from the tee to the target by definition, and
   * those ends move when those features do. Giving them handles would put a
   * grabbable dot exactly on top of every tee and basket on the course — which
   * swallowed the clicks and drags meant for them, and offered to detach a
   * fairway from the hole it belongs to.
   */
  fixedEnds?: boolean;
  /**
   * Persist a new outline. May create the feature that holds it.
   *
   * `gesture` is stable for one continuous drag, so every write it makes lands
   * as a single undo entry however long the drag takes.
   */
  write: (coordinates: Position[], gesture?: string) => void;
}

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
export function vertexHandles(shape: EditableShape | null): GeoJSON.FeatureCollection {
  if (!shape) return EMPTY;

  const coordinates = shape.coordinates;
  const closed = shape.type === 'polygon';
  const features: GeoJSON.Feature[] = [];

  coordinates.forEach((position, index) => {
    // Ends are the tee and the target; drag those instead.
    if (shape.fixedEnds && (index === 0 || index === coordinates.length - 1)) return;
    features.push({
      type: 'Feature',
      properties: { role: 'vertex', index },
      geometry: { type: 'Point', coordinates: position },
    });
  });

  /*
   * Fairways get no midpoint handles.
   *
   * The derived line is split into thirds precisely so the two solid handles
   * land a third in from each end and miss the hole's number, which
   * `holeLabelPosition` puts at the middle of the shot. The midpoints then
   * undid that: three of them, and the middle one sits exactly on the label —
   * so every hole read as a numeral with a hollow ring punched through it.
   *
   * Nothing is lost. Those two vertex handles are the routing affordance the
   * thirds were introduced to provide, and Alt-click still removes a corner
   * once one exists.
   *
   * Polygons and paths keep theirs: nothing is drawn at their midpoints, and
   * they have no interior handles of their own to fall back on.
   */
  if (shape.fixedEnds) return { type: 'FeatureCollection', features };

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
  /** The shape being reshaped, or null when nothing editable is in focus. */
  shape: EditableShape | null;
  /** Off while a tool is drawing or the zoom hold is down. */
  enabled: boolean;
}

export function useVertexEditing({ map, shape, enabled }: UseVertexEditingArgs): {
  handles: GeoJSON.FeatureCollection;
} {
  // Handlers bind to the map once and read current values through refs, so a
  // re-render mid-drag does not tear down the listener holding the gesture.
  const shapeRef = useRef(shape);
  shapeRef.current = shape;

  const write = useCallback((next: Position[], gesture?: string) => {
    shapeRef.current?.write(next, gesture);
  }, []);

  useEffect(() => {
    if (!map || !enabled || !shape) return;

    /** Live drag terminators, so unmounting mid-gesture cannot strand one. */
    const releases = new Set<() => void>();

    const coordinatesNow = (): Position[] | null =>
      shapeRef.current ? [...shapeRef.current.coordinates] : null;

    /** Follow the pointer until it comes up, moving one vertex as it goes. */
    const beginDrag = (index: number, gesture: string) => {
      const onMove = (move: maplibregl.MapMouseEvent) => {
        const coordinates = coordinatesNow();
        if (!coordinates || index >= coordinates.length) return;
        coordinates[index] = [move.lngLat.lng, move.lngLat.lat];
        write(coordinates, gesture);
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
        const floor = MINIMUM_VERTICES[shapeRef.current!.type];
        if (coordinates.length <= floor) return;
        coordinates.splice(index, 1);
        write(coordinates);
        return;
      }

      beginDrag(index, crypto.randomUUID());
    };

    const onMidpointDown = (e: maplibregl.MapLayerMouseEvent) => {
      e.preventDefault();

      const index = e.features?.[0]?.properties?.['index'];
      const geometry = e.features?.[0]?.geometry;
      if (typeof index !== 'number' || geometry?.type !== 'Point') return;

      const coordinates = coordinatesNow();
      if (!coordinates) return;

      /*
       * The insert and the drag that follows share one gesture id, so adding a
       * corner and putting it where you meant is a single undo step.
       */
      const gesture = crypto.randomUUID();
      coordinates.splice(index, 0, geometry.coordinates as Position);
      write(coordinates, gesture);
      // Straight into a drag on the new vertex: clicking a midpoint means "I
      // want a corner here", and here is almost never exactly halfway.
      beginDrag(index, gesture);
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
    /*
     * Keyed on identity, not on the object.
     *
     * `shape` is rebuilt on every render — its coordinates change with each
     * pointer move — so depending on it would tear down and rebind these
     * handlers mid-drag and drop the gesture. The handlers read the current
     * shape through a ref; only a change of *which* shape is being edited
     * needs a rebind.
     */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, enabled, shape?.key, write]);

  return { handles: enabled ? vertexHandles(shape) : EMPTY };
}
