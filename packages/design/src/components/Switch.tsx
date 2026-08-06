import { cn } from '../cn.js';

/**
 * A switch, not a checkbox.
 *
 * The distinction is about when the change happens. A checkbox states an
 * intention that something else — a Save button, a form submit — later acts
 * on; a switch *is* the action, taking effect the moment it moves. Everything
 * this app toggles is the second kind: a corridor disappears off the map as
 * the thumb slides, and there is no step after it. Drawing them as checkboxes
 * was borrowing a control that implies a commit that never comes.
 *
 * `role="switch"` rather than a styled checkbox input, so a screen reader
 * announces "on"/"off" instead of "checked"/"unchecked" — the same distinction,
 * spoken.
 */
export function Switch({
  label,
  checked,
  disabled = false,
  onChange,
}: {
  /** Accessible name. Visible labels are the caller's business. */
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-4 w-7 shrink-0 items-center rounded-full',
        'transition-colors duration-fast',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
        // Disabled reads as a state rather than as a bug: the track keeps its
        // on/off colour at reduced strength, so you can still see which way it
        // is set while it cannot be moved.
        disabled && 'pointer-events-none opacity-40',
        checked ? 'bg-accent-solid' : 'bg-surface-inset ring-1 ring-inset ring-border-default',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'inline-block h-3 w-3 rounded-full bg-surface-raised shadow-sm',
          'transition-transform duration-fast',
          checked ? 'translate-x-3.5' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}
