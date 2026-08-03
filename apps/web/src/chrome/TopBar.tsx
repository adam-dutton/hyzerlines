import { IconButton, Panel, ChromeLayer, TextField, type ThemeName } from '@hyzerlines/design';

import type { SaveStatus } from '../document/CourseProvider';

/** The wordmark. Inline SVG — a logo request is not worth a network round trip. */
function Mark() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" className="shrink-0">
      {/* A hyzer line: the arcing, left-finishing flight the app is named for,
          ending at the basket. Weights are tuned for legibility at 20px — the
          arc thins toward the tee so the flight reads directionally. */}
      <path
        d="M2.5 4c7 .2 12 4 12.4 8.6"
        fill="none"
        stroke="var(--hz-feature-flight-stroke)"
        strokeWidth="2.25"
        strokeLinecap="round"
      />
      <circle cx="15" cy="15.2" r="2.6" fill="var(--hz-feature-basket-stroke)" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
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
    <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
      <path d="M13 9.3A6 6 0 0 1 5.7 2 6 6 0 1 0 13 9.3z" fill="currentColor" />
    </svg>
  );
}

function KeyboardIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
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

function UndoIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
      <path
        d="M3 7.5h6.2a3 3 0 0 1 0 6H7M3 7.5 6 4.5M3 7.5l3 3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RedoIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
      <path
        d="M12 7.5H5.8a3 3 0 0 0 0 6H8M12 7.5 9 4.5M12 7.5l-3 3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
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
    <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
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

/**
 * Autosave feedback.
 *
 * Deliberately quiet. A persistent "Saved" badge trains people to ignore it, so
 * the only states worth pixels are the two that carry information: a write in
 * flight, and a write that failed. Success is silent — the absence of a warning
 * is the signal.
 */
function SaveIndicator({ status }: { status: SaveStatus }) {
  if (status === 'saving') {
    return (
      <span className="px-1.5 text-2xs text-text-muted" aria-live="polite">
        Saving&hellip;
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className="px-1.5 text-2xs text-status-warning" role="status">
        Not saved
      </span>
    );
  }
  return null;
}

export function TopBar({
  courseName,
  onCourseNameChange,
  theme,
  onToggleTheme,
  onShowShortcuts,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onSave,
  onOpen,
  saveStatus,
}: {
  courseName: string;
  onCourseNameChange: (name: string) => void;
  theme: ThemeName;
  onToggleTheme: () => void;
  onShowShortcuts: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onOpen: () => void;
  saveStatus: SaveStatus;
}) {
  return (
    <ChromeLayer className="inset-x-0 top-0 flex items-start justify-between p-4">
      <div className="flex items-start gap-2">
        <Panel className="flex items-center gap-2 py-1.5 pl-2.5 pr-1.5">
          <Mark />
          {/* The title edits in place. A course name is not important enough to
              deserve a dialog, and inline editing keeps the map unobstructed. */}
          <TextField
            label="Course name"
            variant="bare"
            size="sm"
            value={courseName}
            onChange={(e) => onCourseNameChange(e.target.value)}
            spellCheck={false}
            className="w-48 font-medium"
          />
          <SaveIndicator status={saveStatus} />
        </Panel>

        <Panel className="flex items-center gap-0.5">
          <IconButton label="Undo" command="edit.undo" disabled={!canUndo} onClick={onUndo}>
            <UndoIcon />
          </IconButton>
          <IconButton label="Redo" command="edit.redo" disabled={!canRedo} onClick={onRedo}>
            <RedoIcon />
          </IconButton>

          <span className="mx-0.5 h-5 w-px bg-border-subtle" aria-hidden="true" />

          <IconButton label="Open course file" onClick={onOpen}>
            <OpenIcon />
          </IconButton>
          <IconButton label="Save course to a file" onClick={onSave}>
            <DownloadIcon />
          </IconButton>
        </Panel>
      </div>

      <Panel className="flex items-center gap-0.5">
        <IconButton
          label={theme === 'dark' ? 'Light theme' : 'Dark theme'}
          command="view.toggleTheme"
          onClick={onToggleTheme}
        >
          {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </IconButton>

        <IconButton
          label="Keyboard shortcuts"
          command="help.shortcuts"
          onClick={onShowShortcuts}
        >
          <KeyboardIcon />
        </IconButton>
      </Panel>
    </ChromeLayer>
  );
}
