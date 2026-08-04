import { useMemo } from 'react';
import { Dialog, Kbd, shortcuts } from '@hyzerlines/design';

/**
 * The shortcuts reference, generated entirely from the keyboard registry.
 *
 * Nothing here is hand-written, so it cannot fall out of date — adding a
 * shortcut to the registry adds it to this overlay in the same commit.
 */
export function ShortcutsOverlay({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const groups = useMemo(() => {
    const map = new Map<string, typeof shortcuts>();
    for (const s of shortcuts) {
      map.set(s.group, [...(map.get(s.group) ?? []), s]);
    }
    return [...map.entries()];
  }, []);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Keyboard shortcuts"
      description="Tool keys are reserved and become active as each tool ships."
      size="lg"
    >
      <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
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
                  <span className="flex items-center gap-1">
                    {/* A hold lasts while the key is down, so it is labelled
                        differently — "Space" alone reads as a thing you press
                        once, which is the wrong mental model entirely. */}
                    {s.hold && <span className="text-2xs text-text-muted">Hold</span>}
                    {s.keys.map((k) => (
                      <Kbd key={k} combo={k} />
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Dialog>
  );
}
