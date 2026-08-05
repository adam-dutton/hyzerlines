import { useId, useState, type ReactNode } from 'react';

import { cn } from '../cn.js';

/**
 * A collapsible section of a panel.
 *
 * The inspector grows a section every time the app learns something new about
 * a course, and an inspector that only grows eventually stops being an
 * inspector: the course panel had reached the point where it filled its whole
 * column and pushed the hole list out of reach. Sections that fold are how a
 * panel accumulates without accumulating cost.
 *
 * **The preview is the part that matters.** A collapsed section that says only
 * its own name makes you open it to find out whether there is anything in
 * there, which is worse than leaving it open. So a closed section shows what
 * it is holding — the first line of the notes, the site's acreage — and
 * collapsing becomes a way to compress rather than a way to hide.
 *
 * Hand-rolled rather than Radix, for the reason `Tabs` is: a disclosure is a
 * button, a region, and `aria-expanded`. There is no focus management to get
 * wrong.
 */
export function Accordion({
  title,
  preview,
  defaultOpen = false,
  children,
}: {
  title: string;
  /** Shown to the right of the title while closed. Omit when there is nothing. */
  preview?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();

  return (
    <div className="border-b border-border-subtle last:border-b-0">
      <button
        type="button"
        /*
         * Named for the section, not for what it currently contains.
         *
         * Without this the preview is part of the button's accessible name, so
         * "Analysis" is announced as "Analysis, Blue · 163 acres" — a name that
         * changes as the course does, which is no name at all. The preview is a
         * visual summary of what is inside the region anyway; the region is
         * where a screen reader should meet it, in context.
         */
        aria-label={title}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex w-full items-center gap-2 px-3 py-2 text-left',
          'transition-colors duration-fast hover:bg-surface-hover',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
        )}
      >
        <span className="text-2xs font-semibold uppercase tracking-wider text-text-muted">
          {title}
        </span>

        {!open && preview !== undefined && preview !== '' && (
          <span
            aria-hidden="true"
            className="min-w-0 flex-1 truncate text-right text-2xs text-text-secondary"
          >
            {preview}
          </span>
        )}

        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          aria-hidden="true"
          className={cn(
            'ml-auto shrink-0 text-text-muted transition-transform duration-fast',
            // Rotated rather than swapped for a second glyph: the turn is the
            // affordance, and it survives prefers-reduced-motion zeroing the
            // transition because the end states still differ.
            open && 'rotate-90',
            !open && preview !== undefined && preview !== '' && 'ml-0',
          )}
        >
          <path
            d="m3.5 1.5 3.5 3.5-3.5 3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {/*
        Unmounted when closed rather than hidden with CSS. These sections hold
        live controls, and a hidden-but-present checkbox is still in the tab
        order and still findable by a screen reader — a section that folded
        away but could still be operated by keyboard.
      */}
      {open && (
        <div id={id} className="px-3 pb-2">
          {children}
        </div>
      )}
    </div>
  );
}
