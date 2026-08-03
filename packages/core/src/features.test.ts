import { describe, expect, it } from 'vitest';

import {
  createFeature,
  featureName,
  featureSchema,
  fieldsFor,
  geometryMatchesKind,
  geometrySchema,
  KIND_DEFINITIONS,
  FEATURE_KINDS,
  type Feature,
  type Geometry,
} from './features.js';
import { createCourse, parseCourse } from './schema.js';
import { applyOp, canCoalesce, type Op } from './ops.js';
import { CourseStore } from './store.js';
import { serializeCourse, deserializeCourse } from './file.js';

const point = (lng = -93.1, lat = 44.9): Geometry => ({
  type: 'point',
  coordinates: [lng, lat],
});
const line = (): Geometry => ({
  type: 'line',
  coordinates: [
    [-93.1, 44.9],
    [-93.11, 44.91],
  ],
});
const polygon = (): Geometry => ({
  type: 'polygon',
  coordinates: [
    [-93.1, 44.9],
    [-93.11, 44.9],
    [-93.11, 44.91],
  ],
});

describe('geometry', () => {
  it('requires enough points to be the shape it claims', () => {
    expect(geometrySchema.safeParse({ type: 'line', coordinates: [[-93, 44]] }).success).toBe(
      false,
    );
    expect(
      geometrySchema.safeParse({
        type: 'polygon',
        coordinates: [
          [-93, 44],
          [-93.1, 44],
        ],
      }).success,
    ).toBe(false);
  });

  it('rejects out-of-range coordinates', () => {
    expect(geometrySchema.safeParse({ type: 'point', coordinates: [-93, 91] }).success).toBe(
      false,
    );
    expect(geometrySchema.safeParse({ type: 'point', coordinates: [-181, 44] }).success).toBe(
      false,
    );
  });

  /**
   * The bounds catch a [lat, lng] transposition only when the swapped latitude
   * lands outside ±90 — which covers most of the populated world, since any
   * longitude beyond ±90 is over a third of the globe.
   *
   * It does NOT catch a swap where both numbers are small: [30, 40] and
   * [40, 30] are each individually valid. That case is undetectable by
   * validation and can only be prevented by convention, which is why the
   * lng-first rule is stated at the top of geo.ts rather than left implied.
   */
  it('catches transposed coordinates only when latitude goes out of range', () => {
    // Minneapolis, correctly [lng, lat].
    expect(
      geometrySchema.safeParse({ type: 'point', coordinates: [-93.1, 44.9] }).success,
    ).toBe(true);
    // The same point transposed: latitude -93.1 is impossible, so it is caught.
    expect(
      geometrySchema.safeParse({ type: 'point', coordinates: [44.9, -93.1] }).success,
    ).toBe(false);
    // Both in range for both axes — indistinguishable, and accepted.
    expect(geometrySchema.safeParse({ type: 'point', coordinates: [30, 40] }).success).toBe(
      true,
    );
    expect(geometrySchema.safeParse({ type: 'point', coordinates: [40, 30] }).success).toBe(
      true,
    );
  });
});

describe('feature kinds', () => {
  it('defines every kind exactly once', () => {
    expect(Object.keys(KIND_DEFINITIONS).sort()).toEqual([...FEATURE_KINDS].sort());
  });

  it('gives every kind a geometry and a label', () => {
    for (const kind of FEATURE_KINDS) {
      const def = KIND_DEFINITIONS[kind];
      expect(def.label, kind).toBeTruthy();
      expect(['point', 'line', 'polygon'], kind).toContain(def.geometry);
    }
  });

  it('guards against storing a geometry the kind cannot use', () => {
    expect(geometryMatchesKind('basket', point())).toBe(true);
    expect(geometryMatchesKind('basket', polygon())).toBe(false);
    expect(geometryMatchesKind('ob', polygon())).toBe(true);
    expect(geometryMatchesKind('fairway', line())).toBe(true);
    expect(geometryMatchesKind('fairway', point())).toBe(false);
  });

  it('falls back to the kind label when unnamed', () => {
    const basket = createFeature('basket', point());
    expect(featureName(basket)).toBe('Basket');
    expect(featureName({ ...basket, label: 'Hole 4 pin' })).toBe('Hole 4 pin');
    // Whitespace is not a name.
    expect(featureName({ ...basket, label: '   ' })).toBe('Basket');
  });
});

describe('inspector field definitions', () => {
  // The inspector renders these directly, so a malformed descriptor would
  // produce a broken control rather than a type error.
  it('are well-formed for every kind', () => {
    for (const kind of FEATURE_KINDS) {
      for (const field of fieldsFor(kind)) {
        expect(field.key, `${kind}.${field.key}`).toMatch(/^[a-z][A-Za-z0-9]*$/);
        expect(field.label, `${kind}.${field.key}`).toBeTruthy();
        if (field.type === 'select') {
          expect(field.options?.length, `${kind}.${field.key} needs options`).toBeGreaterThan(
            0,
          );
        }
      }
    }
  });

  it('has no duplicate keys within a kind', () => {
    for (const kind of FEATURE_KINDS) {
      const keys = fieldsFor(kind).map((f) => f.key);
      expect(new Set(keys).size, kind).toBe(keys.length);
    }
  });
});

describe('feature ops', () => {
  const withFeature = (): { course: ReturnType<typeof createCourse>; feature: Feature } => {
    const feature = createFeature('basket', point());
    const { course } = applyOp(createCourse(), { type: 'addFeature', feature });
    return { course, feature };
  };

  it('adds and removes', () => {
    const { course, feature } = withFeature();
    expect(course.features).toHaveLength(1);

    const { course: after } = applyOp(course, { type: 'removeFeature', id: feature.id });
    expect(after.features).toHaveLength(0);
  });

  // Undoing a delete must restore the feature entire, not a bare shape.
  it('restores label and props when a delete is undone', () => {
    const { course, feature } = withFeature();
    const named = applyOp(course, { type: 'setLabel', id: feature.id, label: 'Hole 7' }).course;
    const propped = applyOp(named, {
      type: 'setProp',
      id: feature.id,
      key: 'model',
      value: 'Mach X5',
    }).course;

    const { course: deleted, inverse } = applyOp(propped, {
      type: 'removeFeature',
      id: feature.id,
    });
    expect(deleted.features).toHaveLength(0);

    const restored = applyOp(deleted, inverse).course;
    expect(restored.features[0]?.label).toBe('Hole 7');
    expect(restored.features[0]?.props['model']).toBe('Mach X5');
  });

  it('clears a prop when set to undefined, rather than storing a hole', () => {
    const { course, feature } = withFeature();
    const set = applyOp(course, {
      type: 'setProp',
      id: feature.id,
      key: 'model',
      value: 'X',
    }).course;
    const cleared = applyOp(set, {
      type: 'setProp',
      id: feature.id,
      key: 'model',
      value: undefined,
    }).course;

    expect('model' in (cleared.features[0]?.props ?? {})).toBe(false);
    // And it survives a JSON round trip as an absent key, not null.
    const text = serializeCourse(cleared);
    expect(text).not.toContain('"model"');
  });

  /**
   * Reachable in normal use: the inspector can dispatch an edit for a feature
   * that was deleted between render and click. Throwing would take down an
   * editing session over a stale reference.
   */
  it('treats edits to a missing feature as no-ops', () => {
    const course = createCourse();
    for (const op of [
      { type: 'removeFeature', id: 'nope' },
      { type: 'setLabel', id: 'nope', label: 'x' },
      { type: 'setGeometry', id: 'nope', geometry: point() },
      { type: 'setProp', id: 'nope', key: 'k', value: 1 },
    ] satisfies Op[]) {
      const { course: after, undoable } = applyOp(course, op);
      expect(after, op.type).toBe(course);
      expect(undoable, op.type).toBe(false);
    }
  });

  it('round-trips every feature op through its inverse', () => {
    const { course, feature } = withFeature();
    const ops: Op[] = [
      { type: 'setLabel', id: feature.id, label: 'Renamed' },
      { type: 'setGeometry', id: feature.id, geometry: point(-93.5, 45.1) },
      { type: 'setProp', id: feature.id, key: 'model', value: 'Mach X5' },
      { type: 'removeFeature', id: feature.id },
      { type: 'addFeature', feature: createFeature('tee', point()) },
    ];

    for (const op of ops) {
      const { course: next, inverse } = applyOp(course, op);
      const restored = applyOp(next, inverse).course;
      expect({ ...restored, updatedAt: '' }, op.type).toEqual({ ...course, updatedAt: '' });
    }
  });

  it('never coalesces structural changes', () => {
    const a = createFeature('tee', point());
    expect(
      canCoalesce({ type: 'addFeature', feature: a }, { type: 'addFeature', feature: a }, 10),
    ).toBe(false);
    expect(
      canCoalesce({ type: 'removeFeature', id: 'x' }, { type: 'removeFeature', id: 'y' }, 10),
    ).toBe(false);
  });

  // Dragging a vertex fires continuously; without coalescing each frame would
  // be its own undo step. But two *different* features must never merge.
  it('coalesces a drag on one feature but not across features', () => {
    expect(
      canCoalesce(
        { type: 'setGeometry', id: 'a', geometry: point() },
        { type: 'setGeometry', id: 'a', geometry: point(-93.2) },
        50,
      ),
    ).toBe(true);
    expect(
      canCoalesce(
        { type: 'setGeometry', id: 'a', geometry: point() },
        { type: 'setGeometry', id: 'b', geometry: point() },
        50,
      ),
    ).toBe(false);
  });

  it('coalesces a prop edit only for the same key', () => {
    expect(
      canCoalesce(
        { type: 'setProp', id: 'a', key: 'model', value: 'M' },
        { type: 'setProp', id: 'a', key: 'model', value: 'Ma' },
        50,
      ),
    ).toBe(true);
    expect(
      canCoalesce(
        { type: 'setProp', id: 'a', key: 'model', value: 'M' },
        { type: 'setProp', id: 'a', key: 'other', value: 'x' },
        50,
      ),
    ).toBe(false);
  });
});

describe('features in the document', () => {
  it('survive a file round trip', () => {
    let course = createCourse({ name: 'With features' });
    for (const [kind, geometry] of [
      ['tee', point()],
      ['basket', point(-93.2, 44.95)],
      ['fairway', line()],
      ['ob', polygon()],
    ] as const) {
      course = applyOp(course, {
        type: 'addFeature',
        feature: createFeature(kind, geometry),
      }).course;
    }

    const result = deserializeCourse(serializeCourse(course));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.course.features).toHaveLength(4);
  });

  it('rejects a document containing an invalid feature', () => {
    const course = createCourse();
    const broken = { ...course, features: [{ id: 'x', kind: 'nope', geometry: point() }] };
    expect(parseCourse(broken).ok).toBe(false);
  });

  it('defaults label and props when absent', () => {
    const parsed = featureSchema.safeParse({ id: 'a', kind: 'tee', geometry: point() });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.label).toBe('');
      expect(parsed.data.props).toEqual({});
    }
  });

  it('puts feature edits on the undo stack', () => {
    const store = new CourseStore(createCourse());
    store.dispatch({ type: 'addFeature', feature: createFeature('tee', point()) }, 1000);
    expect(store.getSnapshot().course.features).toHaveLength(1);
    expect(store.getSnapshot().canUndo).toBe(true);

    store.undo();
    expect(store.getSnapshot().course.features).toHaveLength(0);
  });
});
