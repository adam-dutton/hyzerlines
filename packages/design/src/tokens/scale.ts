/**
 * Dimensional tokens: space, radius, type, elevation, motion, z-index.
 *
 * Spacing is a 4px base. Map chrome is dense — panels are tight, and the
 * scale bottoms out at 2px because inspector rows need it.
 */

export const space = {
  0: '0',
  px: '1px',
  0.5: '0.125rem', // 2
  1: '0.25rem', // 4
  1.5: '0.375rem', // 6
  2: '0.5rem', // 8
  2.5: '0.625rem', // 10
  3: '0.75rem', // 12
  4: '1rem', // 16
  5: '1.25rem', // 20
  6: '1.5rem', // 24
  8: '2rem', // 32
  10: '2.5rem', // 40
  12: '3rem', // 48
  16: '4rem', // 64
} as const;

export const radius = {
  none: '0',
  sm: '0.25rem',
  md: '0.375rem',
  lg: '0.5rem',
  xl: '0.75rem',
  '2xl': '1rem',
  full: '9999px',
} as const;

export const font = {
  /** UI. System stack — a webfont request is a blocking round trip we don't need. */
  sans: `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`,
  /**
   * Measurements. Tabular numerals are mandatory: distance readouts update
   * continuously while dragging, and proportional digits make them jitter.
   */
  mono: `ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace`,
} as const;

export const fontSize = {
  '2xs': ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.01em' }], // 11 — dense labels
  xs: ['0.75rem', { lineHeight: '1.125rem' }], // 12 — inspector rows
  sm: ['0.8125rem', { lineHeight: '1.25rem' }], // 13 — default UI size
  base: ['0.875rem', { lineHeight: '1.375rem' }], // 14 — body
  lg: ['1rem', { lineHeight: '1.5rem' }],
  xl: ['1.25rem', { lineHeight: '1.75rem' }],
  '2xl': ['1.5rem', { lineHeight: '2rem', letterSpacing: '-0.01em' }],
  '3xl': ['2rem', { lineHeight: '2.375rem', letterSpacing: '-0.02em' }],
} as const;

export const fontWeight = {
  normal: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

/**
 * Elevation. Chrome floats over imagery, so shadows carry a ring as well as a
 * blur — a pure blur disappears against a busy satellite tile.
 */
export const shadow = {
  none: 'none',
  sm: '0 1px 2px rgb(0 0 0 / 0.30), 0 0 0 1px rgb(0 0 0 / 0.20)',
  md: '0 4px 12px rgb(0 0 0 / 0.35), 0 0 0 1px rgb(0 0 0 / 0.22)',
  lg: '0 12px 32px rgb(0 0 0 / 0.42), 0 0 0 1px rgb(0 0 0 / 0.25)',
  xl: '0 24px 56px rgb(0 0 0 / 0.50), 0 0 0 1px rgb(0 0 0 / 0.28)',
  /** For elements sitting directly on the map with no panel behind them. */
  float: '0 2px 8px rgb(0 0 0 / 0.45), 0 0 0 1px rgb(0 0 0 / 0.30)',
} as const;

/**
 * Motion. Durations stay short — this is a tool, not a landing page. Anything
 * over 200ms on an interaction path reads as lag rather than polish.
 *
 * Every consumer must respect `prefers-reduced-motion`; the generated CSS
 * collapses these to 0ms under that query.
 */
export const duration = {
  instant: '0ms',
  fast: '90ms', // hover, press
  normal: '150ms', // panel open, tool switch
  slow: '240ms', // route/mode changes
  /** Flight-path draw-on. The one place a longer curve is the point. */
  draw: '520ms',
} as const;

export const easing = {
  standard: 'cubic-bezier(0.2, 0, 0, 1)',
  /** Entering elements. Decelerate. */
  enter: 'cubic-bezier(0, 0, 0, 1)',
  /** Leaving elements. Accelerate — get out of the way. */
  exit: 'cubic-bezier(0.3, 0, 1, 1)',
  /** Flight paths and camera flights. */
  flight: 'cubic-bezier(0.33, 0.1, 0.15, 1)',
} as const;

/**
 * Z-index. Centralized because a map app stacks a lot of floating surfaces and
 * ad-hoc numbers turn into a bug class.
 */
export const zIndex = {
  map: '0',
  mapOverlay: '10', // measurement badges, snap indicators
  chrome: '20', // toolbar, panels, inspector
  chromeRaised: '30', // dropdowns anchored in chrome
  popover: '40',
  dialog: '50',
  toast: '60',
  tooltip: '70',
} as const;
