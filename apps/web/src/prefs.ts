import { DEFAULT_FOCUS, FOCUSES, type Focus, type Smoothing } from '@hyzerlines/core';

/**
 * Reading preferences: facts about the reader, not about the course.
 *
 * The same argument that keeps units out of the document — a US club and a
 * European one should open the same file and each see it the way they think —
 * applies to how hard the elevation charts are filtered. It is a property of
 * the person looking, and a `.hyzer` you send somebody should not carry your
 * chart settings any more than it carries your zoom level.
 *
 * Units still live in `units.ts` because they have conversion arithmetic
 * attached; this is for preferences that are only a stored choice.
 */

const SMOOTHING_KEY = 'hyzerlines.smoothing';

const LEVELS: readonly Smoothing[] = ['off', 'light', 'medium', 'strong'];

/**
 * Light by default, not off.
 *
 * Off would be the more cautious-looking choice and it is the wrong one: the
 * raw series is not the ground, it is the ground plus a sampling staircase, and
 * shipping that as the default means every designer's first look at a hole
 * reports a grade twice what the land actually does. Light removes the artifact
 * and nothing else, and the chart names the setting it is drawn at — so the
 * filtering is visible rather than assumed.
 */
export const DEFAULT_SMOOTHING: Smoothing = 'light';

export function getStoredSmoothing(): Smoothing {
  try {
    const raw = localStorage.getItem(SMOOTHING_KEY);
    return LEVELS.find((level) => level === raw) ?? DEFAULT_SMOOTHING;
  } catch {
    return DEFAULT_SMOOTHING;
  }
}

export function storeSmoothing(value: Smoothing): void {
  try {
    localStorage.setItem(SMOOTHING_KEY, value);
  } catch {
    /* non-fatal — see units.ts */
  }
}

/** What the picker offers, and how each level is described. */
export const SMOOTHING_OPTIONS: readonly { value: Smoothing; label: string }[] = [
  { value: 'off', label: 'Off — raw samples' },
  { value: 'light', label: 'Light — 10 m' },
  { value: 'medium', label: 'Medium — 25 m' },
  { value: 'strong', label: 'Strong — 50 m' },
];

const FOCUS_KEY = 'hyzerlines.focus';

/**
 * The focus survives a reload, because the work does.
 *
 * A designer who spent the afternoon drawing the tree line closes the tab and
 * opens it again to keep drawing the tree line. Coming back to the tee palette
 * every time would be the tool forgetting what you were doing — and unlike the
 * document, which shot you were inspecting or which units you read in, this
 * costs nothing to remember and is wrong to guess.
 *
 * A preference, not document state: it describes the person, not the course.
 */
export function getStoredFocus(): Focus {
  try {
    const raw = localStorage.getItem(FOCUS_KEY);
    return FOCUSES.find((focus) => focus === raw) ?? DEFAULT_FOCUS;
  } catch {
    return DEFAULT_FOCUS;
  }
}

export function storeFocus(value: Focus): void {
  try {
    localStorage.setItem(FOCUS_KEY, value);
  } catch {
    /* non-fatal — see units.ts */
  }
}
