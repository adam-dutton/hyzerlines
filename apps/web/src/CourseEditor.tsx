import { useCallback, useMemo, useState } from 'react';
import {
  anchorOf,
  checkCourse,
  createFeature,
  createHole,
  geometryMatchesKind,
  type Feature,
  type FeatureKind,
  type Finding,
  type Geometry,
  type Op,
  distance,
} from '@hyzerlines/core';

import { useMap } from './map/MapContext';
import { FeatureLayer } from './map/FeatureLayer';
import { useDrawing, drawingPreview } from './map/useDrawing';
import { useNavigation } from './map/useNavigation';
import type { Tool } from './map/tools';
import { ToolRail } from './chrome/ToolRail';
import { RightPanel } from './chrome/RightPanel';
import { LeftPanel } from './chrome/LeftPanel';
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
  const [selectedHoleId, setSelectedHoleId] = useState<string | null>(null);

  const selected = course.features.find((f) => f.id === selectedId) ?? null;
  const selectedHole = course.holes.find((h) => h.id === selectedHoleId) ?? null;

  const findings = useMemo(
    () => checkCourse(course, course.holes, course.dismissedRules),
    [course],
  );

  /**
   * Create a hole from what is already drawn.
   *
   * Adding an empty hole and then hunting for its tee is busywork; the common
   * case is that you have just drawn a tee and a basket. So the nearest
   * unassigned pair is claimed automatically, and the fairway too if one
   * plausibly connects them. Everything it guesses is visible and editable —
   * and anything it gets wrong shows up as a structural finding rather than
   * silently sitting there.
   */
  const addHole = useCallback(() => {
    const assigned = new Set(course.holes.flatMap((h) => [...h.teeIds, ...h.basketIds]));
    const free = (kind: FeatureKind): Feature[] =>
      course.features.filter((f) => f.kind === kind && !assigned.has(f.id));

    const tee = free('tee')[0];
    const basket = free('basket')[0];

    const claimedFairways = new Set(
      course.holes.map((h) => h.fairwayId).filter((id): id is string => id !== null),
    );
    const fairway =
      tee &&
      course.features.find(
        (f) =>
          f.kind === 'fairway' &&
          !claimedFairways.has(f.id) &&
          f.geometry.type === 'line' &&
          // Same threshold the fairway-detached check uses, so the two agree.
          distance(f.geometry.coordinates[0]!, anchorOf(tee)) <= 30,
      );

    const number = course.holes.reduce((max, h) => Math.max(max, h.number), 0) + 1;
    const hole = createHole(number, {
      teeIds: tee ? [tee.id] : [],
      basketIds: basket ? [basket.id] : [],
      fairwayId: fairway ? fairway.id : null,
    });

    dispatch({ type: 'addHole', hole });
    setSelectedHoleId(hole.id);
  }, [course, dispatch]);

  /*
   * Selecting a feature drops the hole selection, and vice versa.
   *
   * The right panel shows one thing at a time, so holding both would mean the
   * hole stays highlighted in the list while the panel talks about a tee — the
   * interface claiming two answers to "what am I looking at".
   */
  const selectFeature = useCallback((id: string | null) => {
    setSelectedId(id);
    if (id) setSelectedHoleId(null);
  }, []);

  const selectHole = useCallback((id: string | null) => {
    setSelectedHoleId(id);
    if (id) setSelectedId(null);
  }, []);

  /** Frame whatever a finding points at, so it can be seen rather than read. */
  const reveal = useCallback(
    (finding: Finding) => {
      if (finding.holeId) setSelectedHoleId(finding.holeId);
      if (finding.featureId) {
        setSelectedId(finding.featureId);
        const feature = course.features.find((f) => f.id === finding.featureId);
        if (feature && map) map.easeTo({ center: anchorOf(feature), duration: 500 });
      }
    },
    [course.features, map],
  );

  const dismissRule = useCallback(
    (ruleId: string) => {
      if (course.dismissedRules.includes(ruleId)) return;
      dispatch({ type: 'setDismissed', ruleIds: [...course.dismissedRules, ruleId] });
    },
    [course.dismissedRules, dispatch],
  );

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
      // Select what was just drawn, so the properties panel opens on it — the
      // next thing you want is almost always to name it or set a property.
      // Through selectFeature, not setSelectedId: drawing while a hole is
      // selected must hand the panel over, or it keeps describing the hole.
      selectFeature(feature.id);
    },
    [dispatch, selectFeature],
  );

  const backToSelect = useCallback(() => setTool('select'), []);

  /*
   * Navigation runs first, because its held-key overrides decide what the tool
   * actually is right now. Everything downstream — drawing, the cursor, the
   * rail's highlight — reads `effective` rather than `tool`, so holding Space
   * mid-line suspends drawing instead of dropping a vertex where you meant to
   * pan from.
   */
  const nav = useNavigation({ map, tool });

  const drawing = useDrawing({
    map,
    tool: nav.effective,
    onCommit: commitFeature,
    onDone: backToSelect,
  });

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    dispatch({ type: 'removeFeature', id: selectedId });
    setSelectedId(null);
  }, [dispatch, selectedId]);

  const deleteSelectedHole = useCallback(() => {
    if (!selectedHoleId) return;
    dispatch({ type: 'removeHole', id: selectedHoleId });
    setSelectedHoleId(null);
  }, [dispatch, selectedHoleId]);

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
      'tool.pan': () => setTool('pan'),
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
        else if (selectedHoleId) setSelectedHoleId(null);
      },
    },
    drawing.active ? ['global', 'map', 'editing'] : ['global', 'map'],
  );

  return (
    <>
      <FeatureLayer
        features={course.features}
        selectedId={selectedId}
        onSelect={selectFeature}
        preview={drawingPreview(nav.effective, drawing.pending, drawing.cursor)}
        selectable={nav.effective === 'select'}
      />

      {/* The zoom region, drawn over the canvas in screen space. Not a map
          layer: it is a gesture, not geometry, and it must not move with the
          camera it is about to change. */}
      {nav.marquee && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute rounded-sm border border-border-accent bg-accent-soft"
          style={{
            left: nav.marquee.left,
            top: nav.marquee.top,
            width: nav.marquee.width,
            height: nav.marquee.height,
            zIndex: 'var(--hz-z-chrome)',
          }}
        />
      )}

      {!hidden && (
        <>
          <ToolRail tool={nav.effective} invertZoom={nav.invertZoom} onToolChange={setTool} />

          <LeftPanel
            course={course}
            units={units}
            findings={findings}
            selectedHoleId={selectedHoleId}
            onSelectHole={selectHole}
            onOp={handleOp}
            onAddHole={addHole}
            onRevealFinding={reveal}
            onDismissRule={dismissRule}
          />

          <RightPanel
            course={course}
            units={units}
            feature={selected}
            hole={selectedHole}
            onOp={handleOp}
            onDeleteFeature={deleteSelected}
            onDeleteHole={deleteSelectedHole}
            onSelectFeature={selectFeature}
            onClearSelection={() => {
              setSelectedId(null);
              setSelectedHoleId(null);
            }}
          />

          {/* While drawing a multi-point shape, say how to finish it. Nothing
              about click-click-Enter is discoverable otherwise. Sits above the
              tool rail, which now occupies the bottom centre. */}
          {drawing.active && (
            <div
              className="pointer-events-none absolute bottom-16 left-1/2 -translate-x-1/2 rounded-lg border border-border-default bg-surface-overlay px-3 py-1.5 text-2xs text-text-secondary shadow-float backdrop-blur-md"
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
