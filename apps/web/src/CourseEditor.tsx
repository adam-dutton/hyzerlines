import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  anchorOf,
  assignToHole,
  bearing,
  checkCourse,
  chosenPair,
  focusOf,
  createFeature,
  fairwayLine,
  createHole,
  findPair,
  geometryMatchesKind,
  holeOfFeature,
  moveFeatureTo,
  shapeFairway,
  type FairwayChoices,
  type Focus,
  type Feature,
  type FeatureKind,
  type Finding,
  type Geometry,
  type Op,
  type Position,
} from '@hyzerlines/core';

import { useMap } from './map/MapContext';
import { FeatureLayer } from './map/FeatureLayer';
import { useDrawing, drawingPreview } from './map/useDrawing';
import { derivedGeometry } from './map/derived';
import { useVertexEditing, type EditableShape } from './map/useVertexEditing';
import { useFeatureDragging } from './map/useFeatureDragging';
import { useNavigation } from './map/useNavigation';
import { frameFeatures } from './map/frame';
import type { Tool } from './map/tools';
import { ToolBar } from './chrome/ToolBar';
import { RightPanel } from './chrome/RightPanel';
import type { SelectedPair } from './chrome/HoleProperties';
import { LeftPanel } from './chrome/LeftPanel';
import { StyleSubjectPanel, type StyleSubject } from './chrome/StyleProperties';
import { useShortcuts } from './keyboard/useShortcuts';
import type { UnitSystem } from './units';
import { useCourse } from './document/CourseProvider';
import { getStoredFocus, storeFocus } from './prefs';

/**
 * No hole picked yet, as one shared value.
 *
 * A fresh `new Map()` per render would give `derivedGeometry` a new argument
 * every time and recompute every pad and corridor on the course for a course
 * nobody has touched the picker on.
 */
const NO_CHOICES: FairwayChoices = new Map();

/**
 * Drawing, selection and the inspector.
 *
 * Lives inside <MapCanvas> because it needs the map instance, which is only
 * available through MapContext. Keeping it here rather than lifting the map
 * instance into App means the shell stays a layout component and the editing
 * behaviour sits next to the thing it edits.
 */
export function CourseEditor({
  units,
  hidden,
  shell,
  courseProperties,
}: {
  units: UnitSystem;
  hidden: boolean;
  /**
   * The top bar, built by the shell.
   *
   * A function rather than a node because it needs two things only the editor
   * has — the focus and the way to change it — while everything else on it
   * belongs to the shell: the theme, the file actions, the save status. Handing
   * the shell what it needs is the same arrangement `courseProperties` uses, and
   * it beats lifting focus out of here, which would separate it from the tool
   * state it disarms and the hit-testing it reorders.
   */
  shell: (api: { focus: Focus; onFocusChange: (focus: Focus) => void }) => ReactNode;
  /**
   * The course's own properties, for the right panel's third mode.
   *
   * Built by the shell because it needs the shell's state — units, elevation
   * smoothing — and hands back the one action that reaches into the editor: the
   * prompt to draw a property boundary, which has to arm a tool. Tool state
   * belongs here, next to the map that uses it.
   */
  courseProperties: (api: { drawBoundary: () => void }) => ReactNode;
}) {
  const { map } = useMap();
  // Undo and redo are the shell's now — their buttons are in the top bar, which
  // reads them from the store itself. The editor only needs the document.
  const { course, dispatch, documentEpoch } = useCourse();

  const [tool, setTool] = useState<Tool>('select');
  const [focus, setFocus] = useState<Focus>(getStoredFocus);

  /*
   * Leaving a focus must not leave a tool armed from it.
   *
   * Otherwise switching to Land with the basket tool held would put the next
   * click's basket on a palette that no longer offers one — a tool the
   * interface has stopped admitting to, which is exactly the kind of hidden
   * state a focus is supposed to remove.
   */
  const changeFocus = useCallback((next: Focus) => {
    setFocus(next);
    storeFocus(next);
    setTool('select');
  }, []);

  /**
   * Arm a drawing tool, moving to the focus that offers it.
   *
   * Buttons elsewhere in the interface arm tools — "Draw a tee" in the hole
   * panel, "Draw a property boundary" in Analysis — and they cannot assume the
   * rail is currently showing that tool. Setting the tool alone would leave the
   * map armed with something the palette has stopped admitting to, which is
   * precisely the hidden state a focus exists to remove.
   *
   * Not `changeFocus`, which disarms on purpose. Here the arming *is* the
   * request, so the focus moves under it rather than cancelling it.
   */
  const armKind = useCallback((kind: FeatureKind) => {
    const owner = focusOf(kind);
    if (owner) {
      setFocus(owner);
      storeFocus(owner);
    }
    setTool(kind);
  }, []);

  /*
   * What the style focus is describing.
   *
   * Its own state rather than part of the selection, because it is not a thing
   * on the ground: a designer restyling out-of-bounds has no OB area selected
   * and should not — the map stays clickable while they work, which is the
   * point of a focus that claims no kinds.
   */
  const [styleSubject, setStyleSubject] = useState<StyleSubject | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedHoleId, setSelectedHoleId] = useState<string | null>(null);

  /*
   * Features the designer has hidden, for the session.
   *
   * The same kind of state as `pairChoices` below, and out of the document for
   * the same reasons: hiding the tree line to read the corridor under it is
   * something you do at a desk for a minute, and storing it would autosave it,
   * put it on the undo stack, and travel to whoever you sent the course to — who
   * would open it with features missing and no way to know why.
   *
   * Emphatically not the focus mechanism. A focus never hides a feature, and that
   * rule is what keeps it from becoming a mode you have to escape. This is the
   * opposite kind of act: explicit, one feature at a time, and reversible from
   * the row that did it.
   */
  const [hiddenIds, setHiddenIds] = useState<ReadonlySet<string>>(() => new Set());

  const toggleHidden = useCallback((id: string) => {
    setHiddenIds((previous) => {
      const next = new Set(previous);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);

  /*
   * Which shot each hole is being looked at as, for the session.
   *
   * One entry per hole rather than one for the whole editor. Comparing hole 4's
   * long pin against hole 5's is an ordinary thing to do, and with a single
   * choice the first hole snapped back to its representative pair the moment
   * you clicked the second — so the comparison could not be made in the app
   * that exists to make it.
   *
   * Not in the document, for the reason the old single choice was not: which
   * shot you are inspecting is a view of the course, like which layer is
   * selected in an editor. Storing it would autosave it, land it on the undo
   * stack, and travel to whoever you sent the course to. That also decides how
   * long it lives — this session, and no longer.
   */
  const [pairChoices, setPairChoices] = useState<FairwayChoices>(NO_CHOICES);

  const selected = course.features.find((f) => f.id === selectedId) ?? null;
  const selectedHole = course.holes.find((h) => h.id === selectedHoleId) ?? null;

  /*
   * Which of the hole's shots the panels are describing.
   *
   * Derived rather than stored in an effect, and resolved by `chosenPair` —
   * the same function the map and the card go through, so all three describe
   * one throw by construction. It is also self-healing: a pick survives only
   * while it names a shot the hole still offers, so deleting the pin you were
   * measuring to falls back rather than leaving the panel on a throw that no
   * longer exists.
   */
  const selectedPair = useMemo<SelectedPair | null>(
    () => (selectedHole ? chosenPair(course, selectedHole, pairChoices) : null),
    [course, selectedHole, pairChoices],
  );

  /**
   * Record the designer's pick for the hole the panel is describing.
   *
   * Keyed by the selected hole because the picker is that hole's control — the
   * panel showing it *is* the selection.
   */
  const choosePair = useCallback(
    (pair: SelectedPair) => {
      if (!selectedHoleId) return;
      setPairChoices((previous) => new Map(previous).set(selectedHoleId, pair));
    },
    [selectedHoleId],
  );

  const findings = useMemo(() => checkCourse(course, course.dismissedRules), [course]);

  /** Playing order, which is what "4 of 18" and the stepper both count in. */
  const ordered = useMemo(
    () => [...course.holes].sort((a, b) => a.number - b.number),
    [course.holes],
  );

  /**
   * Where the selected hole falls in playing order, one-based.
   *
   * Its position, not its number: a nine-hole course numbered 10–18 is still
   * showing you the first of nine, and "10 of 9" is the panel contradicting
   * itself. Null when no hole is selected.
   */
  const holePosition = useMemo(() => {
    if (!selectedHoleId) return null;
    const index = ordered.findIndex((hole) => hole.id === selectedHoleId);
    return index === -1 ? null : index + 1;
  }, [ordered, selectedHoleId]);

  /*
   * What reads as active on the map.
   *
   * A selected feature is just itself. A selected *hole* is everything it is
   * made of — label, tees, targets and the corridor between them — so that
   * clicking a number tells you at a glance which land the hole occupies, which
   * is most of the reason to make holes clickable at all.
   */
  const highlighted = useMemo<string[]>(() => {
    if (selectedId) return [selectedId];
    if (!selectedHole) return [];

    const ids = [`hole ${selectedHole.id}`, ...selectedHole.teeIds, ...selectedHole.targetIds];
    if (selectedPair) {
      const pair = findPair(course.pairs, selectedPair.teeId, selectedPair.targetId);
      // The corridor is keyed by its feature when shaped and by the pair when
      // still derived — the same key `derivedGeometry` writes.
      ids.push(pair?.fairwayId ?? `${selectedPair.teeId} ${selectedPair.targetId}`);
    }
    return ids;
  }, [course.pairs, selectedId, selectedHole, selectedPair]);

  /*
   * Tee pads and fairway corridors, recomputed whenever the features change.
   *
   * Cheap enough to do on every edit — a few dozen multiplications per feature —
   * and the alternative is caching derived geometry, which is the one thing this
   * whole approach exists to avoid. A cached pad is a pad that is wrong for
   * exactly as long as it takes someone to notice.
   */
  /*
   * The course as the map should draw it: everything except what is hidden.
   *
   * Derived geometry is computed from *this* rather than from `course`, which is
   * the whole reason it is a course-shaped value and not just a filtered array.
   * A tee pad is derived from its tee and a corridor from a tee and a target, so
   * hiding the tee has to take its pad and its corridor with it — otherwise
   * hiding a feature leaves its shadow on the map, which reads as a bug rather
   * than as a hidden feature.
   *
   * Nothing is hidden by default, so this is the identity in the ordinary case
   * and the extra pass costs a single `Set.has` per feature.
   */
  const visible = useMemo(
    () =>
      hiddenIds.size === 0
        ? course
        : { ...course, features: course.features.filter((f) => !hiddenIds.has(f.id)) },
    [course, hiddenIds],
  );

  const derived = useMemo(
    () =>
      // So the map shows the shots the panels are showing. Without this, picking
      // pin B would re-measure the hole while the fairway stayed on pin A — and
      // passing only the selected hole's choice snapped every other hole back
      // the moment the selection moved.
      derivedGeometry(visible, pairChoices, course.style.holeNumber.offset ?? 0),
    [visible, pairChoices, course.style.holeNumber.offset],
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
  }, []);

  /** Everything a hole is made of, for framing it. */
  const holeFeatures = useCallback(
    (id: string) => {
      const hole = course.holes.find((h) => h.id === id);
      if (!hole) return [];
      const ids = new Set<string>([...hole.teeIds, ...hole.targetIds]);
      for (const pair of course.pairs) {
        if (pair.fairwayId && ids.has(pair.teeId) && ids.has(pair.targetId)) {
          ids.add(pair.fairwayId);
        }
      }
      return course.features.filter((f) => ids.has(f.id));
    },
    [course.features, course.holes, course.pairs],
  );

  /**
   * Selecting a hole from the list also flies to it.
   *
   * The list is navigation as much as it is a scorecard — it is how you move
   * around a course once there are eighteen of them, and picking hole 12 out
   * of it and then having to find hole 12 on the map is the list doing half
   * its job.
   *
   * Deliberately not wired to `selectHole` itself. Clicking a hole *on the
   * map* also selects it, and moving the camera out from under a click is
   * disorienting in a way that clicking a list row is not — you can already
   * see what you clicked.
   */
  /**
   * Which way the hole's shot runs, as a compass bearing.
   *
   * Down the first leg of the fairway rather than tee-to-basket, because that is
   * the direction the tee pad faces and the direction the player is looking. On
   * a dogleg the two disagree, and turning the map to the basket would point it
   * at something nobody standing on the pad can see.
   *
   * Null when the hole has no measurable shot, which leaves the map's bearing
   * alone rather than snapping it to north.
   */
  const shotBearing = useCallback(
    (holeId: string): number | null => {
      const hole = course.holes.find((h) => h.id === holeId);
      if (!hole) return null;
      const chosen = chosenPair(course, hole, pairChoices);
      if (!chosen) return null;
      const line = fairwayLine(course, chosen.teeId, chosen.targetId);
      const [from, to] = line ?? [];
      return from && to ? bearing(from, to) : null;
    },
    [course, pairChoices],
  );

  const selectHoleFromList = useCallback(
    (id: string | null) => {
      selectHole(id);
      if (!id || !map) return;

      const turn = shotBearing(id);
      frameFeatures(map, holeFeatures(id), {
        duration: 400,
        ...(turn === null ? {} : { bearing: turn }),
      });
    },
    [holeFeatures, map, selectHole, shotBearing],
  );

  /**
   * Step to the next or previous hole, wrapping at both ends.
   *
   * Wrapping rather than stopping, because the alternative is a control that
   * goes dead at the first hole and the last — and a course is a loop you walk,
   * so stepping off the eighteenth green onto the first tee is the more natural
   * of the two.
   *
   * Goes through `selectHoleFromList`, so stepping frames the hole it lands on.
   * The stepper is navigation in exactly the way the grid is, and stepping to
   * hole 12 without moving the camera to hole 12 is the control doing half its
   * job. With nothing selected it starts at the first hole, because `findIndex`
   * returns −1 and −1 + 1 is 0 — which is the answer you want and is worth
   * saying out loud rather than looking like an accident.
   */
  const stepHole = useCallback(
    (delta: 1 | -1) => {
      if (ordered.length === 0) return;
      const index = ordered.findIndex((hole) => hole.id === selectedHoleId);
      const next = ordered[(index + delta + ordered.length) % ordered.length];
      if (next) selectHoleFromList(next.id);
    },
    [ordered, selectedHoleId, selectHoleFromList],
  );

  /**
   * Clicking on the map: the hole first, the feature on the way in.
   *
   * A course is a sequence of holes, and a hole is what a designer is usually
   * reasoning about — its length, its par, where it goes. So a click on anything
   * belonging to a hole selects the hole, which is also what makes the hole's
   * fairway grow handles and its number highlight.
   *
   * Clicking *again* on the same feature drills in to the feature itself, which
   * is the grouping idiom every vector editor uses and needs no explaining. A
   * feature belonging to no hole selects directly — there is no group to enter.
   */
  const selectAt = useCallback(
    (id: string | null) => {
      if (!id) {
        setSelectedId(null);
        setSelectedHoleId(null);
        return;
      }

      // The hole label selects its hole and nothing else.
      const labelled = id.startsWith('hole ') ? id.slice('hole '.length) : null;
      if (labelled) return selectHole(labelled);

      const hole = holeOfFeature(course, id);
      if (!hole || hole.id === selectedHoleId || id === selectedId) {
        return selectFeature(id);
      }
      selectHole(hole.id);
    },
    [course, selectedHoleId, selectedId, selectFeature, selectHole],
  );

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

      /*
       * Anything drawn while a hole is selected is *about* that hole.
       *
       * Scope, not membership — see the note on `holeId` in the schema. A tee
       * and a target go further and join the hole's arrays below; everything
       * else only needs the scope, and it only needed it as a nicety until
       * mandatories arrived. A mandatory takes its direction of play from its
       * hole's shot, so one drawn at the course level has no left and no right
       * and draws nothing at all — you would place it on hole 4's dogleg and
       * watch it do nothing.
       */
      const feature = createFeature(kind, geometry, { holeId: selectedHoleId });
      dispatch({ type: 'addFeature', feature });

      /*
       * A tee or basket drawn while a hole is selected joins that hole.
       *
       * Holes could only ever be built the other way round: draw both ends,
       * then press Add hole and let it guess which loose pair you meant. That
       * is backwards for the case where you already know what hole 4 is and
       * are placing its pad — and it gave the empty hole you can now create
       * no way to be filled except by drawing features somewhere else first
       * and adopting them afterwards.
       *
       * Two ops rather than one batch: `addFeature` has already been
       * dispatched and stands on its own, and `assignToHole` is itself a
       * batch that keeps the hole's arrays and the feature's `holeId` in
       * step. Undoing once takes back the assignment and leaves the feature,
       * which is the right granularity — the placement was deliberate even
       * when the hole was not.
       */
      const joinsHole =
        selectedHoleId !== null && (kind === 'tee' || kind === 'target')
          ? assignToHole(
              { ...course, features: [...course.features, feature] },
              feature.id,
              selectedHoleId,
            )
          : null;

      if (joinsHole) {
        dispatch(joinsHole);
        /*
         * The hole keeps the selection, and that is the whole point.
         *
         * Selecting the tee that was just placed would deselect the hole, so
         * the basket placed next would land loose — you would get one end of
         * hole 4 and then silently start a different job. Building a hole is
         * one task with two placements in it, and the hole is the context
         * that task happens in.
         */
        return;
      }

      // Otherwise, select what was just drawn, so the properties panel opens
      // on it — the next thing you want is almost always to name it or set a
      // property. Through selectFeature, not setSelectedId: drawing while a
      // hole is selected must hand the panel over, or it keeps describing the
      // hole.
      selectFeature(feature.id);
    },
    [course, dispatch, selectFeature, selectedHoleId],
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
    /*
     * A hidden shape grows no handles.
     *
     * An aid you cannot see must not be one you can edit by accident — the same
     * rule the per-hole fairway switch follows. Handles are hit targets, and
     * leaving them on an invisible line means a drag in empty space silently
     * reshapes something the designer has taken off the map.
     */
    if (selected && hiddenIds.has(selected.id)) return null;

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
      // The line starts at the tee and ends at the target, always. Those ends
      // follow when those features are dragged — see `moveFeatureTo`.
      fixedEnds: true,
      write: (next, gesture) =>
        dispatch(
          shapeFairway(course, fairway.teeId, fairway.targetId, next, selectedHole.id, gesture),
        ),
    };
  }, [selected, hiddenIds, selectedHole, selectedPair, derived.fairways, course, dispatch]);

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

  /*
   * Everything drawn can be picked up and moved.
   *
   * A course is adjusted far more often than it is drawn, and until now moving a
   * basket five metres meant deleting it and placing another — which loses its
   * name, its properties and its place in a hole.
   */
  useFeatureDragging({
    map,
    enabled: nav.effective === 'select' && !drawing.active,
    onMove: useCallback(
      (id: string, to: Position, gesture: string) => {
        const op = moveFeatureTo(course, id, to, gesture);
        if (op) dispatch(op);
      },
      [course, dispatch],
    ),
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
      'tool.boundary': () => setTool('boundary'),
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
        features={visible.features}
        selectedIds={highlighted}
        onSelect={selectAt}
        preview={drawingPreview(nav.effective, drawing.pending, drawing.cursor)}
        derived={derived}
        handles={editing.handles}
        selectable={nav.effective === 'select'}
        focus={focus}
        style={course.style}
        onPickStyle={(kind) =>
          setStyleSubject(
            kind === 'holeNumber' ? { type: 'holeNumber' } : { type: 'kind', kind },
          )
        }
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
          {shell({ focus, onFocusChange: changeFocus })}

          <ToolBar tool={nav.effective} focus={focus} onToolChange={setTool} />

          <LeftPanel
            course={course}
            units={units}
            findings={findings}
            choices={pairChoices}
            focus={focus}
            styleSubject={styleSubject}
            onSelectStyleSubject={setStyleSubject}
            hiddenIds={hiddenIds}
            selectedFeatureId={selectedId}
            onSelectFeature={selectFeature}
            onToggleHidden={toggleHidden}
            selectedHoleId={selectedHoleId}
            onSelectHole={selectHoleFromList}
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
            holeNumber={holePosition}
            holeCount={course.holes.length}
            onOp={handleOp}
            onDeleteFeature={deleteSelected}
            onDeleteHole={deleteSelectedHole}
            onSelectFeature={selectFeature}
            onSelectHole={selectHole}
            onSelectPair={choosePair}
            onStepHole={stepHole}
            styleSubject={
              focus === 'style' && styleSubject ? (
                <StyleSubjectPanel
                  subject={styleSubject}
                  style={course.style}
                  onOp={dispatch}
                  onClose={() => setStyleSubject(null)}
                />
              ) : null
            }
            onDrawFeature={armKind}
            onClearSelection={() => {
              setSelectedId(null);
              setSelectedHoleId(null);
            }}
            courseProperties={courseProperties({
              drawBoundary: () => armKind('boundary'),
            })}
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
