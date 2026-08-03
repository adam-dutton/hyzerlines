import { useCallback, useEffect, useState } from 'react';
import {
  TooltipProvider,
  applyTheme,
  resolveInitialTheme,
  type ThemeName,
} from '@hyzerlines/design';

import { MapCanvas } from './map/MapCanvas';
import { basemaps, DEFAULT_BASEMAP } from './map/basemaps';
import { TopBar } from './chrome/TopBar';
import { StatusBar } from './chrome/StatusBar';
import { MapControls } from './chrome/MapControls';
import { LocationSearch } from './chrome/LocationSearch';
import { ShortcutsOverlay } from './chrome/ShortcutsOverlay';
import { useShortcuts } from './keyboard/useShortcuts';
import { getStoredUnits, storeUnits, type UnitSystem } from './units';

/**
 * The shell.
 *
 * One rule governs this layout: chrome floats over the map and never displaces
 * it. Every panel is absolutely positioned so that opening or closing one cannot
 * resize the canvas — a map that reflows loses your place, and losing your place
 * while measuring a fairway is the difference between a tool and a toy.
 */
export function App() {
  const [theme, setTheme] = useState<ThemeName>(resolveInitialTheme);
  const [basemapId, setBasemapId] = useState<string>(DEFAULT_BASEMAP.id);
  const [units, setUnits] = useState<UnitSystem>(getStoredUnits);
  const [courseName, setCourseName] = useState('Untitled course');
  const [showSearch, setShowSearch] = useState(true);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [chromeHidden, setChromeHidden] = useState(false);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    document.title = courseName.trim() ? `${courseName} · Hyzerlines` : 'Hyzerlines';
  }, [courseName]);

  const changeUnits = useCallback((next: UnitSystem) => {
    setUnits(next);
    storeUnits(next);
  }, []);

  useShortcuts({
    'view.toggleTheme': () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')),
    'view.toggleBasemap': () =>
      setBasemapId((id) => {
        const i = basemaps.findIndex((b) => b.id === id);
        return basemaps[(i + 1) % basemaps.length]!.id;
      }),
    // Presentation mode: strip the interface to show a client the land itself.
    'view.toggleChrome': () => setChromeHidden((v) => !v),
    'help.shortcuts': () => setShowShortcuts((v) => !v),
    'edit.cancel': () => {
      // Escape unwinds one layer at a time, outermost first. The shortcuts
      // dialog is absent here on purpose: Radix handles Escape inside a modal
      // and closes it before this ever runs. Duplicating it would close two
      // layers on one keypress.
      if (showSearch) setShowSearch(false);
      else if (chromeHidden) setChromeHidden(false);
    },
  });

  return (
    <TooltipProvider>
      <div className="relative h-dvh w-screen overflow-hidden bg-surface-canvas">
        <MapCanvas basemapId={basemapId}>
          {!chromeHidden && (
            <>
              <TopBar
                courseName={courseName}
                onCourseNameChange={setCourseName}
                theme={theme}
                onToggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                onShowShortcuts={() => setShowShortcuts(true)}
              />
              <StatusBar basemapId={basemapId} units={units} onUnitsChange={changeUnits} />
              <MapControls basemapId={basemapId} onBasemapChange={setBasemapId} />
            </>
          )}

          {showSearch && !chromeHidden && (
            <LocationSearch onDismiss={() => setShowSearch(false)} />
          )}
          <ShortcutsOverlay open={showShortcuts} onOpenChange={setShowShortcuts} />
        </MapCanvas>
      </div>
    </TooltipProvider>
  );
}
