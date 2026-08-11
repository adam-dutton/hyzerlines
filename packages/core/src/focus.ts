import { FEATURE_KINDS, type FeatureKind } from './features.js';

/**
 * Which kind of work the editor is set up for right now.
 *
 * Not a mode in the usual sense, and the difference matters. A hole and the
 * tree behind it are drawn minutes apart by the same person in the same
 * gesture of thought, so anything that made you *leave* one to reach the other
 * would be an obstacle wearing the costume of an organising principle.
 *
 * A focus therefore changes exactly three things:
 *
 * 1. Which tools the rail offers.
 * 2. Which panel the left column shows.
 * 3. Which features win a click where two overlap.
 *
 * **It never hides a feature and never makes one unselectable.** In `land` you
 * still see every tee and can still click one; the palette simply does not
 * offer to draw another. That single rule is the whole difference between a
 * focus that helps and a mode that fights you, and the browser tests assert it
 * directly rather than trusting it.
 *
 * The strongest argument for focus is not the tool count — it is the left
 * panel. A scorecard and a routing list are different panels answering
 * different questions, and without a focus they would have to share one.
 */

export const FOCUSES = ['play', 'land', 'routing', 'simulate'] as const;
export type Focus = (typeof FOCUSES)[number];

export interface FocusDefinition {
  label: string;
  /** One line, shown where the focus has nothing built yet. */
  summary: string;
  /**
   * The kinds this focus is responsible for.
   *
   * Declared for every kind, including the ones no tool draws yet. The rail
   * renders the intersection of this list with the icons it has, so the
   * expanded palette becomes an exercise in drawing icons rather than a second
   * argument about which focus a drop zone belongs to.
   */
  kinds: readonly FeatureKind[];
  /**
   * Whether this focus has anything behind it yet.
   *
   * A focus that is a frame says so in its own panel. The alternative — hiding
   * it until the milestone lands — leaves the structure invisible exactly when
   * somebody is trying to learn it.
   */
  ready: boolean;
}

export const FOCUS_DEFINITIONS: Record<Focus, FocusDefinition> = {
  /*
   * Play holds the regulated areas as well as the obvious four. A pond is a
   * thing on the ground and belongs to `land`; the hazard *ruling* over that
   * pond is a claim about how the hole plays, and the designer making it is
   * thinking about the shot, not about the water.
   */
  play: {
    label: 'Play',
    summary: 'Tees, baskets and the shots between them.',
    kinds: [
      'tee',
      'target',
      'mando',
      'dropzone',
      'ob',
      'hazard',
      'casualArea',
      'requiredRelief',
    ],
    ready: true,
  },
  land: {
    label: 'Land',
    summary: 'The ground the course sits on: water, paths, trees and the property line.',
    kinds: ['boundary', 'path', 'water', 'terrain', 'notedArea', 'notedPoint'],
    ready: true,
  },
  routing: {
    label: 'Routing',
    summary: 'The order a course is played in — which can skip a hole, or play one twice.',
    kinds: [],
    ready: false,
  },
  simulate: {
    label: 'Simulate',
    summary: 'What a real throw does on this land, and whether the hole plays as drawn.',
    kinds: [],
    ready: false,
  },
};

export const DEFAULT_FOCUS: Focus = 'play';

/**
 * The focus that owns a kind.
 *
 * Null only for `fairway`, which no focus lists because no palette draws one —
 * a fairway is the line between two ends, materialised on the first edit. See
 * `courseFairways`.
 */
export function focusOf(kind: FeatureKind): Focus | null {
  for (const focus of FOCUSES) {
    if (FOCUS_DEFINITIONS[focus].kinds.includes(kind)) return focus;
  }
  return null;
}

/**
 * Rank a set of click candidates so the focused ones answer first.
 *
 * **Ordering, not filtering.** Every candidate stays in the list; the ones this
 * focus is responsible for move to the front. So a click where a tree overlaps
 * hole 7's corridor selects the tree in `land` and the hole in `play`, and in
 * both cases the other one is still reachable — it is under the cursor, not
 * removed from the map.
 *
 * Stable, so the geometry-based order the map already establishes survives
 * within each group. A small thing standing on a big thing still wins.
 */
export function byFocus<T>(
  candidates: readonly T[],
  focus: Focus,
  kindOf: (candidate: T) => FeatureKind | null,
): T[] {
  const owned = (candidate: T) => {
    const kind = kindOf(candidate);
    return kind !== null && FOCUS_DEFINITIONS[focus].kinds.includes(kind);
  };
  return [...candidates.filter(owned), ...candidates.filter((c) => !owned(c))];
}

/**
 * Kinds no focus claims. Should only ever be `fairway`.
 *
 * Exported so a test can assert it rather than a comment claiming it. Adding a
 * kind to `FEATURE_KINDS` without placing it makes that test fail, which is the
 * point — an unplaced kind is a kind with no tool and no home.
 */
export const unplacedKinds = (): FeatureKind[] =>
  FEATURE_KINDS.filter((kind) => focusOf(kind) === null);
