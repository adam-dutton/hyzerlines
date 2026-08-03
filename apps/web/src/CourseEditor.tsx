import { useCallback, useState } from 'react';
import {
  createFeature,
  geometryMatchesKind,
  type FeatureKind,
  type Geometry,
  type Op,
} from '@hyzerlines/core';

import { useMap } from './map/MapContext';
import { FeatureLayer } from './map/FeatureLayer';
import { useDrawing, drawingPreview, type Tool } from './map/useDrawing';
import { ToolRail } from './chrome/ToolRail';
import { Inspector } from './chrome/Inspector';
import { useShortcuts } from './keyboard/useShortcuts';
import type { UnitSystem } from './units';
import { useCourse } from './document/CourseProvider';

/**
 * Drawing, selection and the inspector.
 *
 * Lives inside <MapCanvas> because it needs the map instance, which is only
 * available through MapContext. Keeping it here rather than lifting the map
 * instance into App means the shell stays a layout component and the editing
 * behaviour sits next to the thing it edits.
 */
export function CourseEditor({ units, hidden }: { units: UnitSystem; hidden: boolean }) {
  const { map } = useMap();
  const { course, dispatch } = useCourse();

  const [tool, setTool] = useState<Tool>('select');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = course.features.find((f) => f.id === selectedId) ?? null;

  /*
   * geometryMatchesKind guards the seam between the tool layer and the
   * document: storing a polygon as a basket would render as nothing at all and
   * be very hard to trace back from.
   */
  const commitFeature = useCallback(
    (kind: FeatureKind, geometry: Geometry) => {
      if (!geometryMatchesKind(kind, geometry)) return;
      const feature = createFeature(kind, geometry);
      dispatch({ type: 'addFeature', feature });
      // Select what was just drawn, so the inspector opens on it — the next
      // thing you want is almost always to name it or set a property.
      setSelectedId(feature.id);
    },
    [dispatch],
  );

  const backToSelect = useCallback(() => setTool('select'), []);

  const drawing = useDrawing({ map, tool, onCommit: commitFeature, onDone: backToSelect });

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    dispatch({ type: 'removeFeature', id: selectedId });
    setSelectedId(null);
  }, [dispatch, selectedId]);

  const handleOp = useCallback((op: Op) => dispatch(op), [dispatch]);

  /*
   * The `editing` scope is live only while a shape is in progress.
   *
   * Enter belongs to `edit.commit`, which is scoped to `editing` in the
   * registry — without switching the scope on, the binding is declared but
   * never reachable, and a line can only be finished by double-clicking.
   */
  useShortcuts(
    {
      'edit.delete': deleteSelected,
      'edit.commit': drawing.commit,
      'tool.select': backToSelect,
      'tool.tee': () => setTool('tee'),
      'tool.basket': () => setTool('basket'),
      'tool.fairway': () => setTool('fairway'),
      'tool.mando': () => setTool('mando'),
      'tool.ob': () => setTool('ob'),
      'edit.cancel': () => {
        // Innermost first: abandon the shape, then drop the tool, then the
        // selection. Each Escape undoes exactly one level of intent.
        if (drawing.active) drawing.cancel();
        else if (tool !== 'select') backToSelect();
        else if (selectedId) setSelectedId(null);
      },
    },
    drawing.active ? ['global', 'map', 'editing'] : ['global', 'map'],
  );

  return (
    <>
      <FeatureLayer
        features={course.features}
        selectedId={selectedId}
        onSelect={setSelectedId}
        preview={drawingPreview(tool, drawing.pending, drawing.cursor)}
        selectable={tool === 'select'}
      />

      {!hidden && (
        <>
          <ToolRail tool={tool} onToolChange={setTool} />

          {selected && (
            <Inspector
              feature={selected}
              units={units}
              onOp={handleOp}
              onDelete={deleteSelected}
              onClose={() => setSelectedId(null)}
            />
          )}

          {/* While drawing a multi-point shape, say how to finish it. Nothing
              about click-click-Enter is discoverable otherwise. */}
          {drawing.active && (
            <div
              className="pointer-events-none absolute bottom-20 left-1/2 -translate-x-1/2 rounded-lg border border-border-default bg-surface-overlay px-3 py-1.5 text-2xs text-text-secondary shadow-float backdrop-blur-md"
              style={{ zIndex: 'var(--hz-z-chrome)' }}
              role="status"
            >
              {drawing.pending.length} point{drawing.pending.length === 1 ? '' : 's'} · Enter or
              double-click to finish · Esc to cancel
            </div>
          )}
        </>
      )}
    </>
  );
}
