import { useEffect, useMemo, useRef } from 'react';
import { formatKeys, shortcuts } from '@hyzerlines/design';

/**
 * The shortcuts reference, generated entirely from the keyboard registry.
 *
 * Nothing here is hand-written, so it cannot fall out of date — adding a
 * shortcut to the registry adds it to this overlay in the same commit.
 *
 * Radix's Dialog replaces this in PR 1 (focus trap, scroll lock, portal). Until
 * the primitives package exists, this handles the two things that actually
 * matter for accessibility: initial focus and Escape.
 */
export function ShortcutsOverlay({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);

  const groups = useMemo(() => {
    const map = new Map<string, typeof shortcuts>();
    for (const s of shortcuts) {
      map.set(s.group, [...(map.get(s.group) ?? []), s]);
    }
    return [...map.entries()];
  }, []);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div
      className="absolute inset-0 grid place-items-center bg-surface-scrim p-4 backdrop-blur-sm"
      style={{ zIndex: 'var(--hz-z-dialog)' }}
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border-default bg-surface-raised p-6 shadow-xl"
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Keyboard shortcuts</h2>
            <p className="mt-1 text-xs text-text-muted">
              Tool keys are reserved and become active as each tool ships.
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-7 w-7 place-items-center rounded-md text-text-muted hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden="true">
              <path
                d="m2.5 2.5 8 8m0-8-8 8"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className="mt-5 grid gap-x-8 gap-y-6 sm:grid-cols-2">
          {groups.map(([group, items]) => (
            <section key={group}>
              <h3 className="text-2xs font-semibold uppercase tracking-wider text-text-muted">
                {group}
              </h3>
              <ul className="mt-2">
                {items.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between gap-4 border-b border-border-subtle py-1.5 last:border-b-0"
                  >
                    <span className="text-xs text-text-secondary">{s.label}</span>
                    <span className="flex gap-1">
                      {s.keys.map((k) => (
                        <kbd
                          key={k}
                          className="rounded border border-border-default bg-surface-inset px-1.5 py-0.5 font-mono text-2xs text-text-primary"
                        >
                          {formatKeys(k)}
                        </kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
