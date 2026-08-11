import { useMemo } from 'react';
import { cn } from '@hyzerlines/design';
import {
  FOCUS_DEFINITIONS,
  KIND_DEFINITIONS,
  featureName,
  type Course,
  type Feature,
  type FeatureKind,
} from '@hyzerlines/core';

/**
 * What is on the ground, grouped by what it is.
 *
 * The holes panel is a sequence because a course is one. The land is not: a
 * pond, a road and forty trees have no order, and numbering them would invent
 * one. So this groups by kind and counts, which is the question actually being
 * asked here — *how much of the site have I traced, and did I get the pond?*
 *
 * It exists because the Land focus otherwise had no left panel, and a focus
 * whose panel is the previous focus's panel is not a focus. This is the
 * strongest argument for the whole mechanism: a scorecard and an inventory are
 * different answers, and without a focus they would have to share one column.
 */
export function LandPanel({
  course,
  selectedId,
  onSelectFeature,
}: {
  course: Course;
  selectedId: string | null;
  onSelectFeature: (id: string) => void;
}) {
  const groups = useMemo(() => {
    const byKind = new Map<FeatureKind, Feature[]>();
    for (const feature of course.features) {
      if (!FOCUS_DEFINITIONS.land.kinds.includes(feature.kind)) continue;
      const list = byKind.get(feature.kind);
      if (list) list.push(feature);
      else byKind.set(feature.kind, [feature]);
    }
    /*
     * The focus's own order, not insertion order and not alphabetical. It runs
     * property line, path, water, terrain, noted — roughly outside-in, which is
     * the order a site actually gets traced.
     */
    return FOCUS_DEFINITIONS.land.kinds
      .map((kind) => ({ kind, features: byKind.get(kind) ?? [] }))
      .filter(({ features }) => features.length > 0);
  }, [course.features]);

  if (groups.length === 0) {
    return (
      <p className="px-3 pb-3 text-2xs leading-4 text-text-muted">
        Nothing traced yet. Draw the property line first — it is what the acreage check and the
        site analysis measure against.
      </p>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {groups.map(({ kind, features }) => (
        <section key={kind}>
          <h3 className="flex items-baseline justify-between border-t border-border-subtle px-3 py-1 text-2xs text-text-muted">
            <span>{KIND_DEFINITIONS[kind].label}</span>
            <span className="font-mono tabular-nums">{features.length}</span>
          </h3>
          <ul>
            {features.map((feature) => (
              <li key={feature.id}>
                <button
                  type="button"
                  onClick={() => onSelectFeature(feature.id)}
                  className={cn(
                    'flex w-full items-center py-1 pl-5 pr-3 text-left',
                    'transition-colors duration-fast hover:bg-surface-hover',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
                    feature.id === selectedId && 'bg-surface-selected',
                  )}
                >
                  <span className="min-w-0 flex-1 truncate text-xs text-text-primary">
                    {featureName(feature)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
