import {
  IconButton,
  Menu,
  MenuItem,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  type ThemeName,
} from '@hyzerlines/design';

import { SOURCE_URL } from './Attribution';
import type { UnitSystem } from '../units';

/**
 * Everything that used to be scattered across the top bar's three cards.
 *
 * The theme toggle, the shortcuts overlay, open and save, and the units
 * switch — four islands of chrome spanning the top of the screen, none of them
 * used more than a few times a session, all of them permanently on top of the
 * land. One button on the course panel's header holds the lot.
 *
 * Undo and redo did not come here. They are used constantly and mid-gesture,
 * so they went the other way, into the tool rail.
 */

function MenuIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
      <path
        d="M2.5 4h10M2.5 7.5h10M2.5 11h10"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 15 15" aria-hidden="true">
      <circle cx="7.5" cy="7.5" r="3" fill="currentColor" />
      <path
        d="M7.5 1v1.5M7.5 12.5V14M14 7.5h-1.5M2.5 7.5H1M12.1 2.9l-1 1M3.9 11.1l-1 1M12.1 12.1l-1-1M3.9 3.9l-1-1"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 15 15" aria-hidden="true">
      <path d="M13 9.3A6 6 0 0 1 5.7 2 6 6 0 1 0 13 9.3z" fill="currentColor" />
    </svg>
  );
}

function KeyboardIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 15 15" aria-hidden="true">
      <rect
        x="1.2"
        y="3.5"
        width="12.6"
        height="8"
        rx="1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path
        d="M4 6h.01M6.5 6h.01M9 6h.01M11 6h.01M4.5 9h6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 15 15" aria-hidden="true">
      <path
        d="M7.5 1.8v7.4M4.6 6.4l2.9 2.9 2.9-2.9M2.5 12.2h10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function OpenIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 15 15" aria-hidden="true">
      <path
        d="M7.5 9.4V2M4.6 4.8 7.5 2l2.9 2.8M2.5 12.2h10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SourceIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 15 15" aria-hidden="true">
      <path
        d="M5.5 4.5 2.5 7.5l3 3M9.5 4.5l3 3-3 3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CourseMenu({
  theme,
  onToggleTheme,
  onShowShortcuts,
  onOpen,
  onSave,
  units,
  onUnitsChange,
}: {
  theme: ThemeName;
  onToggleTheme: () => void;
  onShowShortcuts: () => void;
  onOpen: () => void;
  onSave: () => void;
  units: UnitSystem;
  onUnitsChange: (units: UnitSystem) => void;
}) {
  return (
    <Menu
      label="Course menu"
      align="end"
      trigger={
        <IconButton label="Menu" size="sm" tooltipSide="bottom">
          <MenuIcon />
        </IconButton>
      }
    >
      <MenuItem onSelect={onOpen} icon={<OpenIcon />}>
        Open a course file
      </MenuItem>
      <MenuItem onSelect={onSave} icon={<DownloadIcon />}>
        Save to a file
      </MenuItem>

      <MenuSeparator />

      {/*
        Units are a display preference, and they get flipped often enough to
        want a home rather than a settings page — US clubs quote feet and
        everyone else quotes meters. Kept next to the theme for that reason:
        both are about how the app presents, not about the course.
      */}
      <MenuLabel>Units</MenuLabel>
      <MenuRadioGroup value={units} onValueChange={(v) => onUnitsChange(v as UnitSystem)}>
        <MenuRadioItem value="imperial" hint="Feet and acres">
          Imperial
        </MenuRadioItem>
        <MenuRadioItem value="metric" hint="Meters and hectares">
          Metric
        </MenuRadioItem>
      </MenuRadioGroup>

      <MenuSeparator />

      <MenuItem
        onSelect={onToggleTheme}
        command="view.toggleTheme"
        icon={theme === 'dark' ? <SunIcon /> : <MoonIcon />}
      >
        {theme === 'dark' ? 'Light theme' : 'Dark theme'}
      </MenuItem>
      <MenuItem onSelect={onShowShortcuts} command="help.shortcuts" icon={<KeyboardIcon />}>
        Keyboard shortcuts
      </MenuItem>

      <MenuSeparator />

      {/* AGPL section 13 again — the same obligation the credit line carries,
          reachable from the menu because that is where people look for it. */}
      <MenuItem
        onSelect={() => window.open(SOURCE_URL, '_blank', 'noreferrer')}
        icon={<SourceIcon />}
      >
        Source code
      </MenuItem>
    </Menu>
  );
}
