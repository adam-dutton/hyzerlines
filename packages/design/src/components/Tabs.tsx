import { useRef, type ReactNode } from 'react';

import { cn } from '../cn.js';

/**
 * A tab strip sized to sit in a panel header.
 *
 * Not Radix, unlike `Menu` and `Dialog` — a tablist is one of the few WAI-ARIA
 * patterns small enough to get right by hand: roles, `aria-selected`, roving
 * tabindex and arrow keys, all of which are below. The reason to reach for a
 * library is behaviour that is genuinely hard (focus trapping, collision
 * detection, typeahead), and none of that applies here.
 *
 * The count badge is part of the tab rather than a separate line, because the
 * subheading it replaces used to say `9 · Par 28 · 2545 ft` — and those totals
 * now live in the course panel's own header, which is the thing they describe.
 * What is left for a tab to carry is how many, and that fits in a chip.
 */

export interface TabDefinition {
  id: string;
  label: string;
  /** A count, shown as a chip. Omitted rather than shown as zero. */
  badge?: number;
}

export function Tabs({
  tabs,
  value,
  onChange,
  label,
  children,
}: {
  tabs: readonly TabDefinition[];
  value: string;
  onChange: (id: string) => void;
  /** Names the tablist for a screen reader — "Holes and layouts", not "Tabs". */
  label: string;
  /** The panel for the active tab. */
  children: ReactNode;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  /*
   * Arrow keys move between tabs, which is what makes this a tablist rather
   * than a row of buttons. Wrapping at both ends, because a tab strip is a
   * ring: stopping dead at the last tab is the behaviour of a form, and this
   * is a selector.
   */
  const onKeyDown = (e: React.KeyboardEvent) => {
    const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (delta === 0) return;
    e.preventDefault();

    const index = tabs.findIndex((tab) => tab.id === value);
    const next = tabs[(index + delta + tabs.length) % tabs.length];
    if (!next) return;

    onChange(next.id);
    // Focus follows selection, per the ARIA pattern for automatic activation.
    listRef.current?.querySelector<HTMLElement>(`[data-tab="${next.id}"]`)?.focus();
  };

  const activeTab = tabs.find((tab) => tab.id === value) ?? tabs[0];

  return (
    <>
      <div
        ref={listRef}
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        className="flex shrink-0 items-center gap-0.5 border-b border-border-subtle px-1.5 py-1"
      >
        {tabs.map((tab) => {
          const selected = tab.id === value;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              data-tab={tab.id}
              id={`tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`tabpanel-${tab.id}`}
              // Only the selected tab is in the tab order; arrows reach the rest.
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(tab.id)}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-2 py-1 text-xs',
                'transition-colors duration-fast',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
                selected
                  ? 'bg-surface-active font-medium text-text-primary'
                  : 'text-text-muted hover:bg-surface-hover hover:text-text-secondary',
              )}
            >
              {tab.label}
              {tab.badge !== undefined && tab.badge > 0 && (
                <span
                  className={cn(
                    'rounded px-1 font-mono text-2xs tabular-nums',
                    selected ? 'bg-accent-soft text-text-accent' : 'text-text-muted',
                  )}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`tabpanel-${activeTab?.id ?? ''}`}
        aria-labelledby={`tab-${activeTab?.id ?? ''}`}
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        {children}
      </div>
    </>
  );
}
