import { useEffect, useRef } from 'react';
import type maplibregl from 'maplibre-gl';
import type { Position } from '@hyzerlines/core';

import { INTERACTIVE_LAYERS } from './featureLayers';
import { VERTEX_LAYERS } from './useVertexEditing';

/**
 * Moving a feature by dragging it.
 *
 * Distinct from vertex editing, which reshapes one point of a line. This picks
 * the whole thing up: a basket to the other side of the clearing, an OB boundary
 * back from the road. Everything drawn can be moved — a course is adjusted far
 * more often than it is drawn, and re-placing a feature to move it two metres is
 * the kind of friction that stops people iterating.
 *
 * Vertex handles win. They are installed above these layers and their own
 * mousedown handler calls `preventDefault`, so grabbing a corner of a fairway
 * reshapes it rather than sliding the whole line sideways.
 *
 * A drag only starts past a small threshold, so a click that wobbles a pixel
 * still selects rather than nudging the thing it selected.
 */

/** Below this a press is a click, not a drag. */
const DRAG_THRESHOLD_PX = 3;

interface UseFeatureDraggingArgs {
  map: maplibregl.Map | null;
  /** Off unless the select tool is live and nothing is being drawn. */
  enabled: boolean;
  /** Called with the feature id and where its anchor should land. */
  onMove: (id: string, to: Position, gesture: string) => void;
}

export function useFeatureDragging({ map, enabled, onMove }: UseFeatureDraggingArgs): void {
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;

  useEffect(() => {
    if (!map || !enabled) return;

    let release: (() => void) | null = null;

    const onDown = (e: maplibregl.MapMouseEvent) => {
      /*
       * Vertex handles are checked explicitly rather than relying on ordering.
       *
       * `useVertexEditing` binds its own layer-scoped mousedown and calls
       * preventDefault, but that only stops MapLibre's built-in handlers — it
       * does not stop this one, and which of the two runs first is not something
       * to depend on. Without this, grabbing a fairway's corner would reshape it
       * *and* slide the whole line.
       */
      if (
        map.getLayer('edit-vertex') !== undefined &&
        map.queryRenderedFeatures(e.point, { layers: [...VERTEX_LAYERS] }).length > 0
      ) {
        return;
      }

      const hit = map.queryRenderedFeatures(e.point, { layers: [...INTERACTIVE_LAYERS] })[0];
      const id = hit?.properties?.['id'];
      // Hole labels are selectable but not draggable: the number's position is
      // derived from the hole's geometry, so there is nothing there to move.
      if (typeof id !== 'string' || hit?.properties?.['derived'] === 'holeLabel') return;

      const start = e.point;
      const gesture = crypto.randomUUID();
      let dragging = false;

      /*
       * dragPan is disabled up front rather than on the first qualifying move.
       *
       * MapLibre decides a pan has begun from its own tolerance, and by the time
       * this handler could react the camera has already started sliding — which
       * looks like the feature refusing to move.
       */
      map.dragPan.disable();

      const onPointerMove = (move: maplibregl.MapMouseEvent) => {
        if (!dragging) {
          const far =
            Math.abs(move.point.x - start.x) > DRAG_THRESHOLD_PX ||
            Math.abs(move.point.y - start.y) > DRAG_THRESHOLD_PX;
          if (!far) return;
          dragging = true;
          map.getCanvas().style.cursor = 'grabbing';
        }
        onMoveRef.current(id, [move.lngLat.lng, move.lngLat.lat], gesture);
      };

      const finish = () => {
        map.off('mousemove', onPointerMove);
        map.dragPan.enable();
        map.getCanvas().style.cursor = '';
        release = null;
      };

      release = finish;
      map.on('mousemove', onPointerMove);
      // On the window, not the map: a feature dragged out over a docked panel
      // and released there would otherwise never see the button come up, and
      // would follow the cursor around the interface until the next click.
      window.addEventListener('pointerup', finish, { once: true });
      window.addEventListener('pointercancel', finish, { once: true });
    };

    map.on('mousedown', onDown);
    return () => {
      map.off('mousedown', onDown);
      release?.();
    };
  }, [map, enabled]);
}
