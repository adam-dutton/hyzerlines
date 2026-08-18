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
        // 30 x 17 with a 13px knob and 2px of padding, per the kit.
        'relative inline-flex h-[17px] w-[30px] shrink-0 items-center rounded-full',
        'transition-colors duration-fast',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
        // Disabled reads as a state rather than as a bug: the track keeps its
        // on/off colour at reduced strength, so you can still see which way it
        // is set while it cannot be moved.
        disabled && 'pointer-events-none',
        checked ? 'bg-accent-solid' : 'bg-surface-active',
        disabled && (checked ? 'opacity-40' : 'bg-surface-hover'),
      )}
    >
      {/*
        The knob is the ink colour in both positions, not the panel colour.

        It reads as a hole punched through the track rather than as a chip
        sitting on it, which is what keeps the off state legible: a knob in the
        surface colour on a translucent track disappears against whatever
        imagery happens to be behind the panel.
      */}
      <span
        aria-hidden="true"
        className={cn(
          'inline-block h-[13px] w-[13px] rounded-full',
          'transition-transform duration-fast',
          disabled ? 'bg-accent-text-on-solid/50' : 'bg-accent-text-on-solid',
          checked ? 'translate-x-[15px]' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}
