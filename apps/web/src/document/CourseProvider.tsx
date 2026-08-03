import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  CourseStore,
  createCourse,
  loadCourse,
  saveCourse,
  type Course,
  type Op,
  type StoreState,
} from '@hyzerlines/core';

/**
 * Owns the document and keeps it saved.
 *
 * The store itself is framework-agnostic; this is the only React-aware layer.
 * `useSyncExternalStore` is the correct binding rather than useState-plus-effect
 * because the store is an external mutable source — it gives us tearing-free
 * reads and correct behavior under concurrent rendering for free.
 */

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface CourseContextValue extends StoreState {
  dispatch: (op: Op) => void;
  undo: () => void;
  redo: () => void;
  load: (course: Course) => void;
  saveStatus: SaveStatus;
  saveError: string | null;
  /** True until the autosaved document has been restored (or found absent). */
  hydrating: boolean;
  /**
   * Whether an autosaved document was found on startup.
   *
   * This is what "is this a first run" actually means. An earlier version
   * inferred it from the map being at the default zoom, which was wrong: a user
   * who typed a course name and reloaded got the "find your land" card thrown
   * back over their restored work, because naming a course doesn't move the map.
   */
  restored: boolean;
}

const CourseContext = createContext<CourseContextValue | null>(null);

/**
 * Long enough that a drag or a run of keystrokes produces one write, short
 * enough that closing the tab shortly after an edit doesn't lose it.
 */
const AUTOSAVE_DEBOUNCE_MS = 800;

export function CourseProvider({ children }: { children: ReactNode }) {
  // Created once. A new store per render would discard undo history.
  const store = useMemo(() => new CourseStore(createCourse()), []);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);

  const [hydrating, setHydrating] = useState(true);
  const [restored, setRestored] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);

  // Restore the autosave once, on mount.
  useEffect(() => {
    let cancelled = false;
    void loadCourse().then((saved) => {
      if (cancelled) return;
      if (saved) {
        store.load(saved);
        setRestored(true);
      }
      setHydrating(false);
    });
    return () => {
      cancelled = true;
    };
  }, [store]);

  // Autosave. Watches `dirty` rather than the course object so that undo and
  // redo — which change content without a new op — still trigger a write.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (hydrating || !state.dirty) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setSaveStatus('saving');
      void saveCourse(state.course).then((result) => {
        if (result.ok) {
          store.markClean();
          setSaveStatus('saved');
          setSaveError(null);
        } else {
          // Private browsing, a full disk, a blocked origin. The session is
          // still perfectly usable — say so rather than pretending it saved.
          setSaveStatus('error');
          setSaveError(result.error ?? 'Could not save locally.');
        }
      });
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [state.dirty, state.course, hydrating, store]);

  const value = useMemo<CourseContextValue>(
    () => ({
      ...state,
      dispatch: (op: Op) => store.dispatch(op),
      undo: () => store.undo(),
      redo: () => store.redo(),
      load: (course: Course) => store.load(course),
      saveStatus,
      saveError,
      hydrating,
      restored,
    }),
    [state, store, saveStatus, saveError, hydrating, restored],
  );

  return <CourseContext.Provider value={value}>{children}</CourseContext.Provider>;
}

export function useCourse(): CourseContextValue {
  const ctx = useContext(CourseContext);
  if (!ctx) throw new Error('useCourse must be used inside <CourseProvider>');
  return ctx;
}

/** Convenience for the common case of dispatching a single op. */
export function useDispatch(): (op: Op) => void {
  const { dispatch } = useCourse();
  return useCallback((op: Op) => dispatch(op), [dispatch]);
}
