import { IconButton, Menu, MenuItem, MenuSeparator, type ThemeName } from '@hyzerlines/design';

import { SOURCE_URL } from './Attribution';

/**
 * What has nowhere better to be.
 *
 * That is the whole membership rule, and it is why this keeps shrinking. Undo and
 * redo left for the top bar's own row, because they are used constantly and
 * mid-gesture. Units and elevation smoothing left for Settings, next to the other
 * display preferences, because that is what they are. Open and save left most
 * recently: they are `Import` and `Export` in the bar now, named as buttons
 * because a designer reaches for them by name rather than hunting a menu.
 *
 * What is left is a theme toggle, the shortcuts overlay and the source link —
 * three things used a few times a session, which is exactly what a menu is for.
 * When one of them earns a button it should take one, and this should get smaller
 * again.
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
}: {
  theme: ThemeName;
  onToggleTheme: () => void;
  onShowShortcuts: () => void;
}) {
  return (
    <Menu
      label="Course menu"
      align="end"
      trigger={
        <IconButton label="Menu" tooltipSide="bottom">
          <MenuIcon />
        </IconButton>
      }
    >
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
