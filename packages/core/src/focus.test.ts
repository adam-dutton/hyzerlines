import { describe, expect, it } from 'vitest';

import { FEATURE_KINDS, type FeatureKind } from './features.js';
import { byFocus, focusOf, FOCUSES, FOCUS_DEFINITIONS, unplacedKinds } from './focus.js';

/**
 * The focus taxonomy.
 *
 * These tests are mostly about completeness and exclusivity, because both fail
 * silently: a kind in two focuses gets two tools and no complaint, and a kind
 * in none gets no tool at all and looks like a kind nobody implemented.
 */

describe('the focus taxonomy', () => {
  it('places every kind except the one nothing draws', () => {
    // `fairway` is the line between two ends. It is materialised on the first
    // edit, never drawn from a palette, so no focus should list it.
    expect(unplacedKinds()).toEqual(['fairway']);
  });

  it('places no kind in two focuses', () => {
    for (const kind of FEATURE_KINDS) {
      const owners = FOCUSES.filter((f) => FOCUS_DEFINITIONS[f].kinds.includes(kind));
      expect(owners.length, `${kind} is in ${owners.length} focuses`).toBeLessThanOrEqual(1);
    }
  });

  it('lists no kind that is not a real kind', () => {
    for (const focus of FOCUSES) {
      for (const kind of FOCUS_DEFINITIONS[focus].kinds) {
        expect(FEATURE_KINDS).toContain(kind);
      }
    }
  });

  it('puts the regulated areas with play, not with the land they cover', () => {
    // A pond is land. The hazard ruling over that pond is a claim about how the
    // hole plays, and the designer making it is thinking about the shot.
    expect(focusOf('water')).toBe('land');
    expect(focusOf('hazard')).toBe('play');
    expect(focusOf('casualArea')).toBe('play');
    expect(focusOf('requiredRelief')).toBe('play');
  });

  it('marks the focuses that have nothing behind them yet', () => {
    expect(FOCUS_DEFINITIONS.routing.ready).toBe(false);
    expect(FOCUS_DEFINITIONS.simulate.ready).toBe(false);
    // A focus with no milestone behind it must offer no tools either.
    for (const focus of FOCUSES) {
      if (!FOCUS_DEFINITIONS[focus].ready) expect(FOCUS_DEFINITIONS[focus].kinds).toEqual([]);
    }
  });
});

describe('byFocus', () => {
  const kinds: FeatureKind[] = ['water', 'tee', 'path', 'target'];
  const kindOf = (k: FeatureKind) => k;

  /*
   * The rule the whole design rests on. A focus reorders the candidates; it
   * never removes one. Losing the tree from the list in `play` would make it
   * unselectable, which is the failure this design exists to avoid.
   */
  it('keeps every candidate, whichever focus is active', () => {
    for (const focus of FOCUSES) {
      expect(byFocus(kinds, focus, kindOf).sort()).toEqual([...kinds].sort());
    }
  });

  it('moves the focused kinds to the front', () => {
    expect(byFocus(kinds, 'play', kindOf)).toEqual(['tee', 'target', 'water', 'path']);
    expect(byFocus(kinds, 'land', kindOf)).toEqual(['water', 'path', 'tee', 'target']);
  });

  it('is stable inside each group, so the map’s own order survives', () => {
    // Two play kinds and two land kinds: the relative order of each pair is the
    // order they arrived in, which is what the map decided by geometry.
    expect(byFocus(['target', 'tee'] as FeatureKind[], 'play', kindOf)).toEqual([
      'target',
      'tee',
    ]);
  });

  it('sends an unknown kind to the back rather than dropping it', () => {
    const withNull = ['tee', 'mystery'] as const;
    const result = byFocus(withNull, 'play', (c) =>
      c === 'tee' ? 'tee' : (null as FeatureKind | null),
    );
    expect(result).toEqual(['tee', 'mystery']);
  });

  it('changes nothing for a focus that owns no kinds', () => {
    expect(byFocus(kinds, 'routing', kindOf)).toEqual(kinds);
  });
});
