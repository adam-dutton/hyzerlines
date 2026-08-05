import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  anchorOf,
  checkCourse,
  createFeature,
  createHole,
  findPair,
  geometryMatchesKind,
  representativePair,
  shapeFairway,
  type Feature,
  type FeatureKind,
  type Finding,
  type Geometry,
  type Op,
} from '@hyzerlines/core';

import { useMap } from './map/MapContext';
import { FeatureLayer } from './map/FeatureLayer';
import { useDrawing, drawingPreview } from './map/useDrawing';
import { derivedGeometry } from './map/derived';
import { useVertexEditing, type EditableShape } from './map/useVertexEditing';
import { useNavigation } from './map/useNavigation';
import { frameFeatures } from './map/frame';
import type { Tool } from './map/tools';
import { ToolRail } from './chrome/ToolRail';
import { RightPanel } from './chrome/RightPanel';
import type { SelectedPair } from './chrome/HoleProperties';
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
  const { course, dispatch, documentEpoch } = useCourse();

  const [tool, setTool] = useState<Tool>('select');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedHoleId, setSelectedHoleId] = useState<string | null>(null);
  const [pairChoice, setPairChoice] = useState<SelectedPair | null>(null);

  const selected = course.features.find((f) => f.id === selectedId) ?? null;
  const selectedHole = course.holes.find((h) => h.id === selectedHoleId) ?? null;

  /*
   * Which of the hole's shots the panels are describing.
   *
   * Derived rather than stored in an effect, and self-healing: a choice is kept
   * only while it is still a shot the hole offers, so deleting the pin you were
   * measuring to falls back to the representative pair instead of leaving the
   * panel describing a throw that no longer exists.
   *
   * Not in the document. Which shot you are inspecting is a view of the course,
   * like which layer is selected in an editor — putting it in the file would
   * autosave it, land it on the undo stack, and travel to whoever you sent the
   * course to.
   */
  const selectedPair = useMemo<SelectedPair | null>(() => {
    if (!selectedHole) return null;
    if (
      pairChoice &&
      selectedHole.teeIds.includes(pairChoice.teeId) &&
      selectedHole.targetIds.includes(pairChoice.targetId)
    ) {
      return pairChoice;
    }
    return representativePair(course, selectedHole);
  }, [course, selectedHole, pairChoice]);

  const findings = useMemo(() => checkCourse(course, course.dismissedRules), [course]);

  /*
   * Tee pads and fairway corridors, recomputed whenever the features change.
   *
   * Cheap enough to do on every edit — a few dozen multiplications per feature —
   * and the alternative is caching derived geometry, which is the one thing this
   * whole approach exists to avoid. A cached pad is a pad that is wrong for
   * exactly as long as it takes someone to notice.
   */
  const derived = useMemo(
    () =>
      derivedGeometry(
        course,
        // So the map shows the shot the panel is showing. Without this, picking
        // pin B would re-measure the hole while the fairway stayed on pin A.
        selectedHole && selectedPair ? new Map([[selectedHole.id, selectedPair]]) : undefined,
      ),
    [course, selectedHole, selectedPair],
  );

  /**
   * Create a hole from what is already drawn.
   *
   * Adding an empty hole and then hunting for its tee is busywork; the common
   * case is that you have just drawn a tee and a basket. So the nearest
   * unassigned pair is claimed automatically. Everything it guesses is visible
   * and editable in the hole panel, and anything it gets wrong shows up as a
   * structural finding rather than silently sitting there.
   *
   * It no longer looks for a fairway to claim. There is nothing to claim: a
   * fairway is the line between the tee and the target, so the hole has one the
   * moment it has both ends.
   */
  const addHole = useCallback(() => {
    const assigned = new Set(course.holes.flatMap((h) => [...h.teeIds, ...h.targetIds]));
    const free = (kind: FeatureKind): Feature | undefined =>
      course.features.find((f) => f.kind === kind && !assigned.has(f.id));

    const tee = free('tee');
    const target = free('target');

    const number = course.holes.reduce((max, h) => Math.max(max, h.number), 0) + 1;
    const hole = createHole(number, {
      teeIds: tee ? [tee.id] : [],
      targetIds: target ? [target.id] : [],
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
    // A new hole starts on its own representative shot rather than inheriting
    // the last hole's tee, which would almost never be one of its own.
    setPairChoice(null);
  }, []);

  /** Frame whatever a finding points at, so it can be seen rather than read. */
  const reveal = useCallback(
    (finding: Finding) => {
      if (finding.holeId) {
        setSelectedHoleId(finding.holeId);
        setPairChoice(null);
      }
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
   * Navigation runs first, because the zoom hold decides what the tool
   * actually is right now. Everything downstream — drawing, the cursor, the
   * rail's highlight — reads `effective` rather than `tool`, so holding Z
   * mid-line suspends drawing rather than dropping a vertex at the corner of
   * the region you were framing.
   */
  const nav = useNavigation({ map, tool });

  const drawing = useDrawing({
    map,
    tool: nav.effective,
    onCommit: commitFeature,
    onDone: backToSelect,
  });

  /*
   * What the vertex handles are attached to.
   *
   * A selected line or area, or — when a hole is selected — that hole's
   * fairway. The second case is the reason this is a shape rather than a
   * feature: a fairway is the line between a tee and a target whether or not
   * the document stores one, and dragging its midpoint is the moment it starts
   * being stored. `shapeFairway` returns a single batch that creates the
   * feature and attaches it to the pair, so one ⌘Z takes both back.
   */
  const editableShape = useMemo<EditableShape | null>(() => {
    if (selected && selected.geometry.type !== 'point') {
      const { type, coordinates } = selected.geometry;
      return {
        key: selected.id,
        type,
        coordinates,
        write: (next, gesture) =>
          dispatch({
            type: 'setGeometry',
            id: selected.id,
            geometry: { type, coordinates: next } as Geometry,
            ...(gesture === undefined ? {} : { gesture }),
          }),
      };
    }

    if (!selectedHole || !selectedPair) return null;
    const fairway = derived.fairways.find(
      (f) => f.teeId === selectedPair.teeId && f.targetId === selectedPair.targetId,
    );
    if (!fairway) return null;

    return {
      key: `${fairway.teeId} ${fairway.targetId}`,
      type: 'line',
      coordinates: fairway.line,
      write: (next, gesture) =>
        dispatch(
          shapeFairway(course, fairway.teeId, fairway.targetId, next, selectedHole.id, gesture),
        ),
    };
  }, [selected, selectedHole, selectedPair, derived.fairways, course, dispatch]);

  /*
   * Gated on the tool because handles are hit targets: leaving them up while a
   * drawing tool is active would mean a click meant to place a vertex grabs an
   * existing one instead.
   */
  const editing = useVertexEditing({
    map,
    shape: editableShape,
    enabled: nav.effective === 'select' && !drawing.active,
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

  /** Put the whole course on screen. Bound to Zoom to fit, and used on load. */
  const frameCourse = useCallback(
    (duration = 400) => {
      if (map) frameFeatures(map, course.features, { duration });
    },
    [map, course.features],
  );

  /*
   * Frame the course when a document arrives.
   *
   * Opening a course and being shown the middle of Kansas, or a corner of a
   * layout you were nowhere near, is the fastest way to make a map feel broken.
   * So the camera goes to the work, not to a stored camera position — a saved
   * viewport was where you happened to stop scrolling, which is rarely where
   * you want to resume.
   *
   * A course with nothing drawn falls back to its stored view, because there is
   * nothing to frame and the last place you were looking is then the best
   * guess available.
   *
   * Keyed on the epoch rather than on the course object: this must fire when a
   * document is loaded and never while one is being edited.
   */
  const framedEpoch = useRef(-1);
  useEffect(() => {
    if (!map || documentEpoch === framedEpoch.current) return;
    framedEpoch.current = documentEpoch;
    // Jump rather than fly. Opening a file should present the course, not
    // perform a several-second animation across the globe to reach it.
    if (!frameFeatures(map, course.features, { duration: 0 })) {
      map.jumpTo(course.view);
    }
  }, [map, documentEpoch, course.features, course.view]);

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
      'view.fit': () => frameCourse(),
      // Reserved in the registry since PR 0; it needs exactly the same helper,
      // so leaving it inert now would be the odd choice.
      'view.zoomSelection': () => {
        if (!map) return;
        /*
         * A hole frames the shot you are looking at, not every shape it owns.
         * Framing all three tees and all three pins of a long hole zooms out
         * far enough that the throw you were inspecting is a smudge.
         */
        const holeIds = selectedPair
          ? [
              selectedPair.teeId,
              selectedPair.targetId,
              findPair(course.pairs, selectedPair.teeId, selectedPair.targetId)?.fairwayId,
            ].filter((id): id is string => typeof id === 'string')
          : [];
        const target = selected
          ? [selected]
          : course.features.filter((f) => holeIds.includes(f.id));
        // Nothing selected means "fit everything", which is what a user
        // pressing a zoom-to key with an empty selection is reaching for.
        frameFeatures(map, target.length > 0 ? target : course.features, { duration: 400 });
      },
      'tool.tee': () => setTool('tee'),
      'tool.basket': () => setTool('target'),
      'tool.path': () => setTool('path'),
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
        derived={derived}
        handles={editing.handles}
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
            pair={selectedPair}
            onOp={handleOp}
            onDeleteFeature={deleteSelected}
            onDeleteHole={deleteSelectedHole}
            onSelectFeature={selectFeature}
            onSelectPair={setPairChoice}
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
