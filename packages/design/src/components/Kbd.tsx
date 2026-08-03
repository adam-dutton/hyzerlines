import { formatKeys } from '../keymap.js';
import { cn } from '../cn.js';

/**
 * A rendered key combination.
 *
 * Takes the registry's combo syntax (`mod+shift+z`) rather than pre-formatted
 * text, so platform formatting happens in exactly one place — callers can't
 * accidentally hardcode `Ctrl` on a Mac.
 */
export function Kbd({ combo, className }: { combo: string; className?: string }) {
  return (
    <kbd
      className={cn(
        'rounded border border-border-default bg-surface-inset px-1.5 py-0.5',
        'font-mono text-2xs tabular-nums text-text-primary',
        className,
      )}
    >
      {formatKeys(combo)}
    </kbd>
  );
}
