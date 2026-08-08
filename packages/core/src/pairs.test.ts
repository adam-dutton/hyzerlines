import { describe, expect, it } from 'vitest';

import { createFeature, type Feature, type Geometry } from './features.js';
import { distance } from './measure.js';
import {
  ELEVATION_FLOOR_M,
  findPair,
  measurePair,
  skillLevelOfTee,
  suggestParForPair,
} from './pairs.js';
import {
  createLayout,
  createPlay,
  isLayoutPlayable,
  layoutLength,
  layoutPar,
  layoutSkillLevel,
  measureLayout,
} from './layouts.js';
import { feetToMeters, PAR_BY_LENGTH_FT, type SkillLevel } from './pdga.js';

/**
 * Pairs and layouts.
 *
 * The pair is where measurement lives now, so this is where the par tests live
 * too. What is new and worth pinning down is that a hole with several tees is
 * several different answers, and that the layout is what turns those answers
 * into a course.
 */

const pt = (lng: number, lat: number): Geometry => ({ type: 'point', coordinates: [lng, lat] });

const metersPerDegreeLat = distance([0, 44.9], [0, 45.9]);
const northOf = (meters: number) => 44.9 + meters / metersPerDegreeLat;

const index = (features: Feature[]) => new Map(features.map((f) => [f.id, f]));

/** A tee and a target an exact distance apart, walking north. */
function shot(meters: number, teeColor?: SkillLevel) {
  const tee = createFeature(
    'tee',
    pt(-93.1, 44.9),
    teeColor ? { props: { color: teeColor } } : {},
  );
  const target = createFeature('target', pt(-93.1, northOf(meters)));
  return { tee, target, featureById: index([tee, target]) };
}

const feet = (n: number) => feetToMeters(n);

describe('pair measurement', () => {
  it('measures the straight line from the tee front to the target', () => {
    const { tee, target, featureById } = shot(300);
    const m = measurePair(featureById, tee.id, target.id);
    expect(m.straight).toBeCloseTo(300, 3);
    expect(m.routed).toBeNull();
    expect(m.effective).toBe(m.straight);
  });

  /**
   * A dogleg plays its route, not its chord — [ELEMENTS] p2 says hole length is
   * measured "along the fairway route the designer intended".
   */
  it('prefers the routed length when a fairway is drawn', () => {
    const { tee, target } = shot(300);
    const fairway = createFeature('fairway', {
      type: 'line',
      coordinates: [
        [-93.1, 44.9],
        [-93.095, northOf(150)],
        [-93.1, northOf(300)],
      ],
    });
    const featureById = index([tee, target, fairway]);

    const m = measurePair(featureById, tee.id, target.id, fairway.id);
    expect(m.routed).not.toBeNull();
    expect(m.routed!).toBeGreaterThan(m.straight!);
    expect(m.effective).toBe(m.routed);
  });

  it('reports null rather than guessing when an end is missing', () => {
    const { tee, featureById } = shot(300);
    expect(measurePair(featureById, tee.id, 'gone').effective).toBeNull();
    expect(suggestParForPair(featureById, tee.id, 'gone', null, 'white')).toBeNull();
  });

  it('finds a stored pair by its two ends, in either document order', () => {
    const pairs = [
      { id: 'p1', teeId: 't1', targetId: 'a', parOverride: 4, fairwayId: null },
      { id: 'p2', teeId: 't1', targetId: 'b', parOverride: null, fairwayId: 'f' },
    ];
    expect(findPair(pairs, 't1', 'b')?.id).toBe('p2');
    expect(findPair(pairs, 't1', 'c')).toBeUndefined();
  });
});

describe('par for a pair', () => {
  const parAt = (feetLong: number, teeColor: SkillLevel) => {
    const { tee, target, featureById } = shot(feet(feetLong), teeColor);
    return suggestParForPair(featureById, tee.id, target.id, null, 'white')?.par;
  };

  /**
   * Asserted against the published foot figures rather than against our own
   * output, so this fails if the transcription drifts rather than merely
   * changing with it. [PAR] p10, White: par 2 is 0-55, par 3 is 56-430,
   * par 4 is 431-765, par 5 is 766-1170, par 6 is 1171+.
   */
  it('reads par from the PDGA table', () => {
    for (const [length, expected] of [
      [40, 2],
      [55, 2],
      [56, 3],
      [430, 3],
      [431, 4],
      [765, 4],
      [766, 5],
      [1170, 5],
      [1171, 6],
    ] as const) {
      expect(parAt(length, 'white'), `${length} ft, white`).toBe(expected);
    }
  });

  /**
   * The whole reason a tee carries a colour: the same ground is a different
   * par depending on who is throwing. 700 ft is par 4 for Gold and Blue, par 5
   * for Red.
   */
  it('gives the same distance a different par at different tee colours', () => {
    expect(parAt(700, 'gold')).toBe(4);
    expect(parAt(700, 'blue')).toBe(4);
    expect(parAt(700, 'red')).toBe(5);
    // Green's table prints "na" for par 2, so even 20 ft is a par 3.
    expect(parAt(20, 'green')).toBe(3);
  });

  /**
   * A tee with no colour has to fall back to something, and the layout's level
   * is the only thing that knows more than nothing.
   */
  it('falls back to the given level for a tee with no colour', () => {
    const { tee, target, featureById } = shot(feet(700));
    expect(suggestParForPair(featureById, tee.id, target.id, null, 'red')?.par).toBe(5);
    expect(suggestParForPair(featureById, tee.id, target.id, null, 'gold')?.par).toBe(4);
  });

  it('reads a skill level off a tee, and nothing off anything else', () => {
    expect(skillLevelOfTee(createFeature('tee', pt(0, 0), { props: { color: 'Blue' } }))).toBe(
      'blue',
    );
    expect(skillLevelOfTee(createFeature('tee', pt(0, 0), { props: { color: 'teal' } }))).toBe(
      null,
    );
    expect(skillLevelOfTee(undefined)).toBeNull();
  });

  it('always explains itself, and names the level it used', () => {
    const { tee, target, featureById } = shot(200, 'white');
    const suggestion = suggestParForPair(featureById, tee.id, target.id, null, 'white');
    expect(suggestion?.factors.length).toBeGreaterThan(0);
    expect(suggestion?.factors[0]?.label).toContain('White');
    expect(suggestion?.skillLevel).toBe('white');
  });

  it('flags a distance sitting on a band boundary as borderline', () => {
    const onEdge = shot(feet(PAR_BY_LENGTH_FT.white.par3), 'white');
    expect(
      suggestParForPair(onEdge.featureById, onEdge.tee.id, onEdge.target.id, null, 'white')
        ?.borderline,
    ).toBe(true);

    const clear = shot(feet(250), 'white');
    expect(
      suggestParForPair(clear.featureById, clear.tee.id, clear.target.id, null, 'white')
        ?.borderline,
    ).toBe(false);
  });
});

describe('layouts', () => {
  /** Two tees, one target, one hole — the case a per-hole par cannot express. */
  function twoTeeHole() {
    const longTee = createFeature('tee', pt(-93.1, 44.9), { props: { color: 'blue' } });
    const shortTee = createFeature('tee', pt(-93.1, northOf(120)), {
      props: { color: 'red' },
    });
    const target = createFeature('target', pt(-93.1, northOf(feet(700))));
    return { longTee, shortTee, target, featureById: index([longTee, shortTee, target]) };
  }

  it('numbers plays by position, not by hole', () => {
    const { longTee, target, featureById } = twoTeeHole();
    // The same hole played twice, which is why played number cannot be a hole
    // property: hole 3 to pin A, then hole 3 to pin B.
    const layout = createLayout('Doubles', [
      createPlay('hole-3', longTee.id, target.id),
      createPlay('hole-3', longTee.id, target.id),
    ]);
    const measured = measureLayout(layout, featureById, []);
    expect(measured.map((m) => m.playedNumber)).toEqual([1, 2]);
  });

  it('has no skill level when tees are mixed, and one when they are not', () => {
    const { longTee, shortTee, target, featureById } = twoTeeHole();

    const blue = createLayout('Blue', [createPlay('h1', longTee.id, target.id)]);
    expect(layoutSkillLevel(blue, featureById)).toBe('blue');

    const mixed = createLayout('Mixed', [
      createPlay('h1', longTee.id, target.id),
      createPlay('h2', shortTee.id, target.id),
    ]);
    expect(layoutSkillLevel(mixed, featureById)).toBeNull();
  });

  /** Each play resolves par from its own tee, even inside a mixed layout. */
  it('pars each play from its own tee colour', () => {
    const { longTee, shortTee, target, featureById } = twoTeeHole();
    const layout = createLayout('Mixed', [
      createPlay('h1', longTee.id, target.id),
      createPlay('h2', shortTee.id, target.id),
    ]);

    const measured = measureLayout(layout, featureById, []);
    // 700 ft from blue is par 4; the red tee is closer still and shorter.
    expect(measured[0]!.par).toBe(4);
    expect(measured[1]!.par).toBeLessThanOrEqual(measured[0]!.par!);
  });

  it('lets a stored override win over the suggestion', () => {
    const { longTee, target, featureById } = twoTeeHole();
    const layout = createLayout('Blue', [createPlay('h1', longTee.id, target.id)]);
    const pairs = [
      { id: 'p', teeId: longTee.id, targetId: target.id, parOverride: 6, fairwayId: null },
    ];
    expect(measureLayout(layout, featureById, pairs)[0]!.par).toBe(6);
  });

  it('totals par and length over the plays', () => {
    const { longTee, target, featureById } = twoTeeHole();
    const layout = createLayout('Blue', [
      createPlay('h1', longTee.id, target.id),
      createPlay('h2', longTee.id, target.id),
    ]);
    const measured = measureLayout(layout, featureById, []);
    expect(layoutPar(measured)).toBe(8);
    expect(layoutLength(measured)).toBeCloseTo(feet(1400), 0);
  });

  /**
   * A design decision and a groundskeeping fact are different things. A layout
   * routed through a pin with no basket in the ground is a valid design that
   * cannot be played this week.
   */
  it('is unplayable when a tee or target is only a position', () => {
    const tee = createFeature('tee', pt(-93.1, 44.9));
    const installed = createFeature('target', pt(-93.1, northOf(100)));
    const positionOnly = createFeature('target', pt(-93.1, northOf(150)), {
      props: { status: 'position-only' },
    });
    const featureById = index([tee, installed, positionOnly]);

    expect(
      isLayoutPlayable(
        createLayout('A', [createPlay('h1', tee.id, installed.id)]),
        featureById,
      ),
    ).toBe(true);
    expect(
      isLayoutPlayable(
        createLayout('B', [createPlay('h1', tee.id, positionOnly.id)]),
        featureById,
      ),
    ).toBe(false);
  });

  it('is unplayable when a play points at a feature that is gone', () => {
    const { longTee, featureById } = twoTeeHole();
    const layout = createLayout('Broken', [createPlay('h1', longTee.id, 'deleted')]);
    expect(isLayoutPlayable(layout, featureById)).toBe(false);
  });

  it('measures an empty layout as nothing rather than failing', () => {
    const measured = measureLayout(createLayout('Empty'), new Map(), []);
    expect(measured).toEqual([]);
    expect(layoutPar(measured)).toBe(0);
    expect(layoutLength(measured)).toBe(0);
  });
});

/**
 * Elevation in the par suggestion.
 *
 * `[PAR]` p8: "Effective Length = Measured Length + 3 x (Target Elevation - Tee
 * Elevation) + ...". The term has existed in `effectiveLength` since PR 4 and
 * has always been handed a zero; these are the tests for it actually carrying a
 * measurement.
 *
 * The stakes are why they are this thorough. This is the one input that can
 * move a par by two strokes on a number nobody typed, so every way it could be
 * plausibly wrong — reading the sign backwards, treating "unknown" as "flat",
 * amplifying sampling noise into a stroke — is its own case.
 */
describe('elevation in the par suggestion', () => {
  const suggest = (meters: number, gain: number | null) => {
    const { tee, target, featureById } = shot(meters);
    return suggestParForPair(featureById, tee.id, target.id, null, 'white', gain);
  };

  it('adds three times the rise for an uphill hole', () => {
    const flat = suggest(200, null)!;
    const uphill = suggest(200, 10)!;
    expect(uphill.effectiveMeters).toBeCloseTo(flat.effectiveMeters + 30, 6);
    // The measured length is untouched: only the *effective* length moves.
    expect(uphill.measuredMeters).toBeCloseTo(flat.measuredMeters, 6);
  });

  it('subtracts three times the drop for a downhill hole', () => {
    const flat = suggest(200, null)!;
    const downhill = suggest(200, -10)!;
    expect(downhill.effectiveMeters).toBeCloseTo(flat.effectiveMeters - 30, 6);
  });

  /*
   * The reason the parameter is `number | null` and not `number`.
   *
   * Zero is a claim that somebody measured this hole and found it flat. Null is
   * "nobody measured". They produce the same arithmetic and must not produce
   * the same panel: a hole with no elevation data has no business showing an
   * elevation factor at all.
   */
  it('treats unknown elevation differently from flat ground', () => {
    const unknown = suggest(200, null)!;
    const flat = suggest(200, 0)!;

    expect(unknown.effectiveMeters).toBeCloseTo(flat.effectiveMeters, 6);
    expect(unknown.factors.some((f) => /uphill|downhill/i.test(f.label))).toBe(false);
    expect(flat.factors.some((f) => /uphill|downhill/i.test(f.label))).toBe(false);
  });

  /*
   * A floor under the term, because the multiplier is three.
   *
   * Two adjacent DEM samples can differ by a few centimetres from interpolation
   * alone. Tripled and pushed through a band boundary, that noise could flip a
   * par — so anything under half a metre is not treated as elevation.
   */
  it('ignores changes below the floor', () => {
    const flat = suggest(200, null)!;
    const trivial = suggest(200, ELEVATION_FLOOR_M - 0.01)!;
    expect(trivial.effectiveMeters).toBeCloseTo(flat.effectiveMeters, 6);
    expect(trivial.factors.some((f) => /uphill/i.test(f.label))).toBe(false);

    const real = suggest(200, ELEVATION_FLOOR_M)!;
    expect(real.effectiveMeters).toBeCloseTo(flat.effectiveMeters + 3 * ELEVATION_FLOOR_M, 6);
  });

  it('says which way the hole runs, and that the multiplier is three', () => {
    const uphill = suggest(200, 10)!.factors.find((f) => /uphill/i.test(f.label));
    expect(uphill?.effect).toBe('lengthens');
    expect(uphill?.label).toMatch(/three times/i);

    const downhill = suggest(200, -10)!.factors.find((f) => /downhill/i.test(f.label));
    expect(downhill?.effect).toBe('shortens');
  });

  /*
   * The whole point. A par that does not move is a term that does not matter.
   *
   * White plays par 3 to 430 ft. A 425 ft hole is par 3 on the flat and par 4
   * climbing two metres, which is exactly the call a plan view cannot make.
   */
  it('can move a par across a band boundary', () => {
    expect(suggest(feet(425), null)!.par).toBe(3);
    expect(suggest(feet(425), 2)!.par).toBe(4);
  });

  it('can move a par down a band when the hole drops', () => {
    expect(suggest(feet(440), null)!.par).toBe(4);
    expect(suggest(feet(440), -2)!.par).toBe(3);
  });

  it('reads the sign as target minus tee, not the other way round', () => {
    // If the sign were inverted this test and the two above would still pass in
    // isolation, so pin the direction directly: uphill is always the longer of
    // the two, whatever the band arithmetic does.
    expect(suggest(200, 10)!.effectiveMeters).toBeGreaterThan(
      suggest(200, -10)!.effectiveMeters,
    );
  });
});
