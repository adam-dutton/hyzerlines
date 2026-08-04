import { useCallback, useEffect, useState } from 'react';
import {
  TooltipProvider,
  applyTheme,
  resolveInitialTheme,
  type ThemeName,
} from '@hyzerlines/design';
import type { View } from '@hyzerlines/core';

import { MapCanvas } from './map/MapCanvas';
import { basemaps } from './map/basemaps';
import { TopBar } from './chrome/TopBar';
import { StatusBar } from './chrome/StatusBar';
import { MapControls } from './chrome/MapControls';
import { LocationSearch } from './chrome/LocationSearch';
import { ShortcutsOverlay } from './chrome/ShortcutsOverlay';
import { CourseEditor } from './CourseEditor';
import { useShortcuts } from './keyboard/useShortcuts';
import { getStoredUnits, storeUnits, type UnitSystem } from './units';
import { CourseProvider, useCourse } from './document/CourseProvider';
import { downloadCourse, openCourseFile } from './document/fileActions';

/**
 * The shell.
 *
 * One rule governs this layout: chrome floats over the map and never displaces
 * it. Every panel is absolutely positioned so that opening or closing one cannot
 * resize the canvas — a map that reflows loses your place, and losing your place
 * while measuring a fairway is the difference between a tool and a toy.
 */
function Shell() {
  const {
    course,
    dispatch,
    undo,
    redo,
    canUndo,
    canRedo,
    load,
    saveStatus,
    hydrating,
    restored,
  } = useCourse();

  const [theme, setTheme] = useState<ThemeName>(resolveInitialTheme);
  const [units, setUnits] = useState<UnitSystem>(getStoredUnits);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [chromeHidden, setChromeHidden] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  /*
   * The search card is first-run only: no autosaved document means nothing to
   * come back to. Showing "find your land" over work already in progress would
   * be nonsense, and it waits for hydration so it can tell the difference.
   */
  const [dismissedSearch, setDismissedSearch] = useState(false);
  const showSearch = !hydrating && !restored && !dismissedSearch;

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    document.title = course.name.trim() ? `${course.name} · Hyzerlines` : 'Hyzerlines';
  }, [course.name]);

  const changeUnits = useCallback((next: UnitSystem) => {
    setUnits(next);
    storeUnits(next);
  }, []);

  /*
   * Camera changes are recorded, but they are not undoable — see isUndoable()
   * in core. MapCanvas debounces these, so a drag produces one op rather than
   * one per frame.
   *
   * The stored view is now only a fallback for a course with nothing drawn:
   * CourseEditor frames the features themselves when a document loads.
   */
  const handleViewChange = useCallback(
    (view: View) => dispatch({ type: 'setView', view }),
    [dispatch],
  );

  const openFile = useCallback(async () => {
    const result = await openCourseFile();
    if (result.ok && result.course) {
      // The camera follows from the load: CourseEditor frames whatever the
      // document contains. One mechanism, not two racing to move the map.
      load(result.course);
      setDismissedSearch(true);
      setFileError(null);
    } else if (result.error) {
      setFileError(result.error);
    }
  }, [load]);

  useShortcuts({
    'edit.undo': undo,
    'edit.redo': redo,
    'view.toggleTheme': () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')),
    'view.toggleBasemap': () => {
      const i = basemaps.findIndex((b) => b.id === course.basemapId);
      dispatch({ type: 'setBasemap', basemapId: basemaps[(i + 1) % basemaps.length]!.id });
    },
    // Presentation mode: strip the interface to show a client the land itself.
    'view.toggleChrome': () => setChromeHidden((v) => !v),
    'help.shortcuts': () => setShowShortcuts((v) => !v),
    'edit.cancel': () => {
      // Escape unwinds one layer at a time, outermost first. The shortcuts
      // dialog is absent here on purpose: Radix handles Escape inside a modal
      // and closes it before this ever runs.
      if (fileError) setFileError(null);
      else if (showSearch) setDismissedSearch(true);
      else if (chromeHidden) setChromeHidden(false);
    },
  });

  return (
    <div
      className="relative h-dvh w-screen overflow-hidden bg-surface-canvas"
      /*
       * Restoring the autosave is asynchronous, so for a moment after load the
       * app genuinely doesn't know whether there is prior work. Tests that race
       * that window see whichever state they happen to catch; this lets them
       * wait for the answer instead of sleeping and hoping.
       */
      data-hydrated={hydrating ? undefined : 'true'}
    >
      <MapCanvas basemapId={course.basemapId} onViewChange={handleViewChange}>
        {!chromeHidden && (
          <>
            <TopBar
              courseName={course.name}
              onCourseNameChange={(name) => dispatch({ type: 'setName', name })}
              basemapId={course.basemapId}
              onBasemapChange={(basemapId) => dispatch({ type: 'setBasemap', basemapId })}
              theme={theme}
              onToggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              onShowShortcuts={() => setShowShortcuts(true)}
              canUndo={canUndo}
              canRedo={canRedo}
              onUndo={undo}
              onRedo={redo}
              onSave={() => downloadCourse(course)}
              onOpen={() => void openFile()}
              saveStatus={saveStatus}
            />
            <StatusBar basemapId={course.basemapId} units={units} onUnitsChange={changeUnits} />
            <MapControls />
          </>
        )}

        <CourseEditor units={units} hidden={chromeHidden} />

        {showSearch && !chromeHidden && (
          <LocationSearch onDismiss={() => setDismissedSearch(true)} />
        )}
        <ShortcutsOverlay open={showShortcuts} onOpenChange={setShowShortcuts} />

        {fileError && (
          <div
            role="alert"
            className="pointer-events-auto absolute bottom-4 left-1/2 max-w-md -translate-x-1/2 rounded-lg border border-status-danger/40 bg-surface-overlay px-3.5 py-2.5 text-xs text-status-danger shadow-lg backdrop-blur-md"
            style={{ zIndex: 'var(--hz-z-toast)' }}
          >
            {fileError}
          </div>
        )}
      </MapCanvas>
    </div>
  );
}

export function App() {
  return (
    <TooltipProvider>
      <CourseProvider>
        <Shell />
      </CourseProvider>
    </TooltipProvider>
  );
}
