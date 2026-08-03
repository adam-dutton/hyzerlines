import { IconButton, Panel, ChromeLayer, TextField, type ThemeName } from '@hyzerlines/design';

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

export function TopBar({
  courseName,
  onCourseNameChange,
  theme,
  onToggleTheme,
  onShowShortcuts,
}: {
  courseName: string;
  onCourseNameChange: (name: string) => void;
  theme: ThemeName;
  onToggleTheme: () => void;
  onShowShortcuts: () => void;
}) {
  return (
    <ChromeLayer className="inset-x-0 top-0 flex items-start justify-between p-4">
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
      </Panel>

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
