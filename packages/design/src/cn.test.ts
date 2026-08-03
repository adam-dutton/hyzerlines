import { describe, expect, it } from 'vitest';

import { cn } from './cn.js';
import { shadow, duration, easing, fontSize } from './tokens/scale.js';

/**
 * These tests exist because two of these cases were real bugs.
 *
 * `cn` is invisible when it works and silently wrong when it doesn't: an
 * unrecognized utility group means BOTH classes survive, so a component's
 * default quietly beats the override its caller passed. Nothing throws, and the
 * result depends on CSS source order — the kind of failure you chase for an hour
 * before suspecting the class merger.
 *
 * Stock Tailwind values are covered by tailwind-merge itself. What needs testing
 * here is every scale where Hyzerlines uses names tailwind-merge can't infer.
 */
describe('cn', () => {
  it('resolves conflicts in stock utility groups', () => {
    expect(cn('px-2 px-4')).toBe('px-4');
    expect(cn('rounded-md rounded-2xl')).toBe('rounded-2xl');
  });

  it('resolves semantic color conflicts', () => {
    expect(cn('bg-surface-raised bg-surface-inset')).toBe('bg-surface-inset');
    expect(cn('text-text-muted text-text-primary')).toBe('text-text-primary');
    expect(cn('border-border-subtle border-border-accent')).toBe('border-border-accent');
  });

  // Regression: `shadow-float` isn't a shape tailwind-merge recognizes, so
  // before the extended config both classes survived.
  it('resolves custom shadow conflicts', () => {
    expect(cn('shadow-float shadow-xl')).toBe('shadow-xl');
    expect(cn('shadow-sm shadow-float')).toBe('shadow-float');
  });

  // Regression: durations are named, not numeric, so tailwind-merge saw
  // `duration-fast` as an unknown class rather than a duration.
  it('resolves custom motion conflicts', () => {
    expect(cn('duration-fast duration-slow')).toBe('duration-slow');
    expect(cn('duration-normal duration-draw')).toBe('duration-draw');
    expect(cn('ease-standard ease-flight')).toBe('ease-flight');
  });

  it('resolves custom font sizes', () => {
    expect(cn('text-2xs text-base')).toBe('text-base');
    expect(cn('text-sm text-2xs')).toBe('text-2xs');
  });

  // text-* is overloaded: size and color share the prefix but are independent.
  // Collapsing them would silently drop one.
  it('keeps font size and text color independent', () => {
    expect(cn('text-2xs text-text-muted')).toBe('text-2xs text-text-muted');
  });

  it('keeps non-conflicting utilities', () => {
    expect(cn('h-8 w-8')).toBe('h-8 w-8');
  });

  it('handles conditional and falsy inputs', () => {
    const active = false;
    expect(cn('px-2', active && 'px-4', null, undefined, 'py-1')).toBe('px-2 py-1');
  });

  /**
   * Guards the generated config itself. Every token in these scales must be
   * recognized as a member of its group — if someone adds a token and the
   * config stops covering it, this fails rather than degrading silently.
   */
  it('covers every token in the custom scales', () => {
    const check = (prefix: string, names: string[], reference: string) => {
      for (const name of names) {
        if (name === reference) continue;
        expect(cn(`${prefix}-${name} ${prefix}-${reference}`), `${prefix}-${name}`).toBe(
          `${prefix}-${reference}`,
        );
      }
    };

    check('shadow', Object.keys(shadow), 'lg');
    check('duration', Object.keys(duration), 'normal');
    check('ease', Object.keys(easing), 'standard');
    check('text', Object.keys(fontSize), 'base');
  });
});
