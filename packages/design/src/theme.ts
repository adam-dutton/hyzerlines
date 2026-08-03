/**
 * Theme application. Framework-agnostic on purpose — it touches the document
 * root and localStorage, nothing else, so the React binding stays trivial.
 *
 * Dark is the default and is never overridden by the OS preference. That is a
 * deliberate product decision rather than an oversight: the map is the majority
 * of the viewport and it is dark, so light chrome is the exception case (bright
 * sunlight in the field) that a user opts into explicitly.
 */

import type { ThemeName } from './tokens/index.js';

const STORAGE_KEY = 'hyzerlines.theme';
const DEFAULT_THEME: ThemeName = 'dark';

export function getStoredTheme(): ThemeName | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === 'dark' || raw === 'light' ? raw : null;
  } catch {
    // Private browsing / blocked storage. Not worth failing over.
    return null;
  }
}

export function resolveInitialTheme(): ThemeName {
  return getStoredTheme() ?? DEFAULT_THEME;
}

export function applyTheme(theme: ThemeName): void {
  const root = document.documentElement;
  root.dataset['theme'] = theme;
  // Keeps form controls, scrollbars and the browser chrome in step.
  root.style.colorScheme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* non-fatal */
  }
}
