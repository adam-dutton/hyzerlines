import type { FeatureKind } from '@hyzerlines/core';

/**
 * Small icons: a second drawing, not the large one scaled down.
 *
 * The 24px set is drawn as hairline *fills* — closed shapes about a unit wide —
 * which is what let one drawing serve both sizes. It does not survive all the
 * way down. The basket's chains and the O/B lettering are the thinnest strokes
 * in the set, and at 16px they were a third of a pixel and went soft; the note
 * left in `featureIcons.tsx` predicted exactly this and named the fix as a 16px
 * variant rather than a stroke width on all eight. This is that variant.
 *
 * Every shape here is snapped to whole units, which is why they are legible at
 * this size and why the next point matters so much.
 *
 * ## Most of these are 15 units wide, not 16
 *
 * That is the drawing, not a mistake, and it must not be "fixed" by stretching
 * the art to a square. It does mean an odd width, and an odd width centred in an
 * even-width box lands on a half pixel — which un-snaps every edge the artwork
 * carefully snapped and produces exactly the grey fringe the whole redraw was
 * meant to remove.
 *
 * So `SmallIcon` does not centre. It renders the artwork at its own width and
 * lets the caller's box place it on a whole pixel. See `IconSlot`.
 */

export interface SmallIconArt {
  /** 15 or 16. The height is always 16. */
  width: number;
  viewBox: string;
  paths: readonly string[];
}

export const SMALL_ICONS: Partial<Record<FeatureKind, SmallIconArt>> = {
  target: {
    width: 15,
    viewBox: '0 0 15 16',
    paths: [
      'M7 4H8V15H7V4Z',
      'M3 2H12V4H3V2Z',
      'M3 9H12V10H3V9Z',
      'M4 12H11V13H4V12Z',
      'M3.5 10H4.5V11H3.5V10Z',
      'M4 11H5V12H4V11Z',
      'M10.5 10H11.5V11H10.5V10Z',
      'M10 11H11V12H10V11Z',
      'M4 4V3.5H5V4C5 4.59871 5.2116 5.91695 5.62207 7.08398C5.82671 7.6658 6.06851 8.1742 6.33398 8.52734C6.60749 8.89109 6.83412 9 7 9H7.5V10H7C6.36606 10 5.88039 9.58792 5.53516 9.12891C5.18198 8.6592 4.89902 8.04234 4.67871 7.41602C4.23918 6.16638 4 4.73462 4 4Z',
      'M11 4V3.5H10V4C10 4.59871 9.7884 5.91695 9.37793 7.08398C9.17329 7.6658 8.93149 8.1742 8.66602 8.52734C8.39251 8.89109 8.16588 9 8 9H7.5V10H8C8.63394 10 9.11961 9.58792 9.46484 9.12891C9.81802 8.6592 10.101 8.04234 10.3213 7.41602C10.7608 6.16638 11 4.73462 11 4Z',
    ],
  },
  dropzone: {
    width: 15,
    viewBox: '0 0 15 16',
    paths: [
      'M13 1V15H2V1H13ZM3 14H12V2H3V14Z',
      'M5 4H6V7H5V4Z',
      'M5 11H10V12H5V11Z',
      'M9 4H10V7H9V4Z',
      'M6 4H7V5H6V4Z',
      'M5 9H6V11H5V9Z',
      'M6 8H9V9H6V8Z',
      'M9 9H10V11H9V9Z',
      'M7 5H8V6H7V5Z',
      'M8 6H9V7H8V6Z',
    ],
  },
  hazard: {
    width: 15,
    viewBox: '0 0 15 16',
    paths: [
      'M2 12.2861V13H2.85742V14H1V12.2861H2ZM9.35742 13V14H5.64258V13H9.35742ZM14 12.2861V14H12.1426V13H13V12.2861H14ZM2 6.28613V9.71387H1V6.28613H2ZM14 6.28613V9.71387H13V6.28613H14ZM2.85742 2V3H2V3.71387H1V2H2.85742ZM14 2V3.71387H13V3H12.1426V2H14ZM9.35742 2V3H5.64258V2H9.35742Z',
      'M5 5H6V11H5V5Z',
      'M6 7H9V8H6V7Z',
      'M9 5H10V11H9V5Z',
    ],
  },
  mando: {
    width: 16,
    viewBox: '0 0 16 16',
    paths: [
      'M5 5H6V11H5V5Z',
      'M6 6H7V7H6V6Z',
      'M7 7H8V8H7V7Z',
      'M8 7H9V8H8V7Z',
      'M9 6H10V7H9V6Z',
      'M7.5 8H8.5V9H7.5V8Z',
      'M7.5 8H8.5V9H7.5V8Z',
      'M10 5H11V11H10V5Z',
      'M14 8C14 4.68629 11.3137 2 8 2C4.68629 2 2 4.68629 2 8C2 11.3137 4.68629 14 8 14V15C4.13401 15 1 11.866 1 8C1 4.13401 4.13401 1 8 1C11.866 1 15 4.13401 15 8C15 11.866 11.866 15 8 15V14C11.3137 14 14 11.3137 14 8Z',
    ],
  },
  ob: {
    width: 15,
    viewBox: '0 0 15 16',
    paths: [
      'M2 12.2861V13H2.85742V14H1V12.2861H2ZM9.35742 13V14H5.64258V13H9.35742ZM14 12.2861V14H12.1426V13H13V12.2861H14ZM2 6.28613V9.71387H1V6.28613H2ZM14 6.28613V9.71387H13V6.28613H14ZM2.85742 2V3H2V3.71387H1V2H2.85742ZM14 2V3.71387H13V3H12.1426V2H14ZM9.35742 2V3H5.64258V2H9.35742Z',
      'M7 5H8V6H7V5Z',
      'M6 5H7V6H6V5Z',
      'M5 6H6V8H5V6Z',
      'M5 8H6V10H5V8Z',
      'M6 10H7V11H6V10Z',
      'M7 10H8V11H7V10Z',
      'M8 10H9V11H8V10Z',
      'M9 8H10V10H9V8Z',
      'M9 6H10V8H9V6Z',
      'M8 5H9V6H8V5Z',
    ],
  },
  path: {
    width: 16,
    viewBox: '0 0 16 16',
    paths: [
      'M3 10H5V11H3V10Z',
      'M11 2H13V3H11V2Z',
      'M2 11H3V13H2V11Z',
      'M10 3H11V5H10V3Z',
      'M3 13H5V14H3V13Z',
      'M11 5H13V6H11V5Z',
      'M5 11H6V13H5V11Z',
      'M6 11.5H7V12.5H6V11.5Z',
      'M7 11H8V12H7V11Z',
      'M8 10H9V11H8V10Z',
      'M8 9H9V10H8V9Z',
      'M8 8H9V9H8V8Z',
      'M7 7H8V8H7V7Z',
      'M7 6H8V7H7V6Z',
      'M7 5H8V6H7V5Z',
      'M8 4H9V5H8V4Z',
      'M9 3.5H10V4.5H9V3.5Z',
      'M13 3H14V5H13V3Z',
    ],
  },
  tee: {
    width: 15,
    viewBox: '0 0 15 16',
    paths: ['M13 1V15H2V1H13ZM3 14H12V2H3V14Z', 'M7 4H8V12H7V4Z', 'M5 4H10V5H5V4Z'],
  },
};

/** Whether a kind has a small drawing of its own. */
export const hasSmallIcon = (kind: FeatureKind): boolean => kind in SMALL_ICONS;
