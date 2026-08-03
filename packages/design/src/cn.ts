import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

import { shadow, duration, easing, fontSize } from './tokens/scale.js';

/**
 * Merge class names, with later Tailwind utilities winning over earlier ones.
 *
 * Every component takes a `className` that must be able to override its own
 * defaults. Plain concatenation can't do that — `px-2` and `px-4` would both
 * survive and the winner would depend on CSS source order rather than on what
 * the caller asked for. tailwind-merge resolves the conflict by group.
 *
 * WHY THIS IS EXTENDED: tailwind-merge recognizes conflicts by matching known
 * value shapes, not just prefixes. `bg-surface-raised` works out of the box
 * because any word is a plausible color, but `shadow-float` and `duration-fast`
 * do not — it expects shadows from a fixed set and durations to be numbers. Left
 * unconfigured it silently keeps *both* classes, and the override the caller
 * asked for loses to whatever CSS order decides.
 *
 * The custom scales are therefore fed in from the token files directly rather
 * than restated here. Add a shadow or a duration token and this updates with it;
 * there is no second list to forget.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      shadow: [{ shadow: Object.keys(shadow) }],
      'font-size': [{ text: Object.keys(fontSize) }],
      duration: [{ duration: Object.keys(duration) }],
      ease: [{ ease: Object.keys(easing) }],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
