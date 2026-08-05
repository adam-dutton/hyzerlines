/**
 * The keyboard registry.
 *
 * Every shortcut in the app is declared here exactly once. Tooltips, the help
 * overlay, and the actual key handling all read from this list, so there is no
 * way for a displayed shortcut to drift from the one that fires. Adding a
 * shortcut anywhere else is a bug.
 *
 * Hyzerlines is keyboard-first in the Figma sense: single unmodified keys switch
 * tools, space pans, Esc backs out. That only stays coherent if the whole set is
 * visible in one file.
 */

export type KeyScope =
  | 'global'
  | 'map' // active when the canvas has focus
  | 'editing'; // active mid-geometry

export interface Shortcut {
  /** Stable identifier the command dispatcher binds to. */
  id: string;
  /** Human label for tooltips and the help overlay. */
  label: string;
  /**
   * KeyboardEvent.key values. Multiple entries = alternates for the same command.
   * Modifiers use `mod+` for Cmd on macOS / Ctrl elsewhere.
   */
  keys: string[];
  scope: KeyScope;
  /** Grouping in the help overlay. */
  group: string;
  /** Fires on keydown even while an input is focused. Rare — use sparingly. */
  allowInInput?: boolean;
  /**
   * A modal hold rather than a command: the behaviour lasts while the key is
   * down and ends on keyup.
   *
   * Declared here so the help overlay can list it, but never dispatched — the
   * dispatcher only understands keydown, and a hold needs both edges. The
   * handling lives with the feature that owns the mode. The overlay renders
   * these as "Hold X" so they don't read as something you press once.
   */
  hold?: boolean;
}

export const shortcuts: readonly Shortcut[] = [
  // --- Tools. Single keys, Figma-style. Reserved here even where the tool
  // --- lands in a later PR, so the letters don't get claimed by something else.
  // Panning has no key and no tool: a plain drag pans from everything except
  // the zoom tool, which is what a map is expected to do.
  { id: 'tool.select', label: 'Select', keys: ['v'], scope: 'map', group: 'Tools' },
  {
    id: 'tool.zoomHold',
    label: 'Zoom — drag a region, Alt to zoom out',
    keys: ['z'],
    scope: 'map',
    group: 'Tools',
    hold: true,
  },
  { id: 'tool.tee', label: 'Tee pad', keys: ['t'], scope: 'map', group: 'Tools' },
  { id: 'tool.basket', label: 'Basket', keys: ['b'], scope: 'map', group: 'Tools' },
  { id: 'tool.path', label: 'Path', keys: ['p'], scope: 'map', group: 'Tools' },
  { id: 'tool.ob', label: 'Out of bounds', keys: ['o'], scope: 'map', group: 'Tools' },
  { id: 'tool.mando', label: 'Mandatory', keys: ['m'], scope: 'map', group: 'Tools' },
  { id: 'tool.measure', label: 'Measure', keys: ['l'], scope: 'map', group: 'Tools' },

  // --- Editing
  { id: 'edit.undo', label: 'Undo', keys: ['mod+z'], scope: 'global', group: 'Edit' },
  {
    id: 'edit.redo',
    label: 'Redo',
    keys: ['mod+shift+z', 'mod+y'],
    scope: 'global',
    group: 'Edit',
  },
  {
    id: 'edit.delete',
    label: 'Delete selection',
    keys: ['Delete', 'Backspace'],
    scope: 'map',
    group: 'Edit',
  },
  { id: 'edit.duplicate', label: 'Duplicate', keys: ['mod+d'], scope: 'map', group: 'Edit' },
  { id: 'edit.selectAll', label: 'Select all', keys: ['mod+a'], scope: 'map', group: 'Edit' },
  {
    id: 'edit.commit',
    label: 'Finish shape',
    keys: ['Enter'],
    scope: 'editing',
    group: 'Edit',
  },
  {
    id: 'edit.cancel',
    label: 'Cancel / deselect',
    keys: ['Escape'],
    scope: 'global',
    group: 'Edit',
    allowInInput: true,
  },

  // --- View
  { id: 'view.zoomIn', label: 'Zoom in', keys: ['=', '+'], scope: 'map', group: 'View' },
  { id: 'view.zoomOut', label: 'Zoom out', keys: ['-'], scope: 'map', group: 'View' },
  { id: 'view.fit', label: 'Zoom to fit', keys: ['shift+1'], scope: 'map', group: 'View' },
  {
    id: 'view.zoomSelection',
    label: 'Zoom to selection',
    keys: ['shift+2'],
    scope: 'map',
    group: 'View',
  },
  {
    id: 'view.toggleBasemap',
    label: 'Cycle basemap',
    keys: ['shift+b'],
    scope: 'global',
    group: 'View',
  },
  {
    id: 'view.toggleTheme',
    label: 'Toggle light / dark',
    keys: ['shift+d'],
    scope: 'global',
    group: 'View',
  },
  {
    id: 'view.toggleChrome',
    label: 'Hide interface',
    keys: ['shift+\\'],
    scope: 'global',
    group: 'View',
  },

  // --- Help
  {
    id: 'help.shortcuts',
    label: 'Keyboard shortcuts',
    keys: ['?'],
    scope: 'global',
    group: 'Help',
  },
] as const;

export const shortcutsById: ReadonlyMap<string, Shortcut> = new Map(
  shortcuts.map((s) => [s.id, s]),
);

const isApple = (): boolean =>
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform ?? '');

/** Render a shortcut for display: `mod+z` becomes `⌘Z` or `Ctrl+Z`. */
export function formatKeys(combo: string): string {
  const mac = isApple();
  return combo
    .split('+')
    .map((part) => {
      switch (part) {
        case 'mod':
          return mac ? '⌘' : 'Ctrl';
        case 'shift':
          return mac ? '⇧' : 'Shift';
        case 'alt':
          return mac ? '⌥' : 'Alt';
        case 'Escape':
          return 'Esc';
        case 'Delete':
          return mac ? '⌫' : 'Del';
        case 'Backspace':
          return mac ? '⌫' : 'Backspace';
        case 'Enter':
          return mac ? '↵' : 'Enter';
        case ' ':
          return 'Space';
        default:
          return part.length === 1 ? part.toUpperCase() : part;
      }
    })
    .join(mac ? '' : '+');
}

/** The display string for a command, or empty if it has no binding. */
export function shortcutFor(id: string): string {
  const s = shortcutsById.get(id);
  return s?.keys[0] ? formatKeys(s.keys[0]) : '';
}

/** Normalize a KeyboardEvent into the registry's combo syntax. */
export function comboFromEvent(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.metaKey || e.ctrlKey) parts.push('mod');
  if (e.shiftKey) parts.push('shift');
  if (e.altKey) parts.push('alt');
  parts.push(e.key.length === 1 ? e.key.toLowerCase() : e.key);
  return parts.join('+');
}
