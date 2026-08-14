import { useMemo, type ReactNode } from 'react';
import { cn } from '@hyzerlines/design';
import {
  KIND_DEFINITIONS,
  SKILL_LEVELS,
  SKILL_LEVEL_INFO,
  featureArea,
  featureName,
  pathLength,
  type Feature,
  type FeatureKind,
} from '@hyzerlines/core';

import { formatArea, formatDistance, type UnitSystem } from '../units';
import { FeatureIcon } from './featureIcons';

/**
 * The features in scope, grouped by what they are.
 *
 * Figma's pages-over-layers split, and for the same reason: the thing above
 * chooses a context and the list below shows what is *in* it. Above this sits
 * either the holes grid — pick hole 4 and these are hole 4's features — or
 * nothing, and these are the course's.
 *
 * ## Grouped by kind, because there is no order to invent
 *
 * A hole's features have a natural grouping and no natural sequence: three tees
 * are alternatives, not steps. Numbering them would imply a first, which for
 * tees and pins is a real claim the interface makes elsewhere — the hole's
 * representative pair — and would be wrong to imply here by position.
 *
 * The group order comes from the caller, which passes the focus's own kind
 * order. In `land` that runs property line, path, water, terrain, noted —
 * roughly outside-in, which is the order a site actually gets traced.
 *
 * ## Hiding is a view, and it is per feature
 *
 * The eye is not a document edit. It is the same kind of state as which shot a
 * hole is being looked at as: a thing about this session at this desk, which
 * would be wrong to autosave, wrong to put on the undo stack, and wrong to send
 * to whoever you shared the course with.
 *
 * It is also emphatically not the focus mechanism. A focus never hides a
 * feature — that rule is what keeps it from becoming a mode you have to escape.
 * This is the opposite: an explicit, per-feature, obviously-reversible act, with
 * the control sitting on the row it affects.
 */

/**
 * Plural forms, for the group headings only.
 *
 * `KIND_DEFINITIONS` labels name one feature, which is right on a row and wrong
 * on a heading over four of them. Only the kinds whose plural is not the label
 * plus an `s` need an entry; the rest fall through.
 *
 * `target` is here because the model's word and the sport's word differ. The
 * kind is `target` — a hole can finish at an object rather than a basket — but a
 * heading over two baskets should say Baskets, which is what the hole panel's
 * own list already calls them.
 */
const GROUP_LABELS: Partial<Record<FeatureKind, string>> = {
  tee: 'Tees',
  target: 'Baskets',
  mando: 'Mandatories',
  dropzone: 'Drop zones',
  ob: 'Out of bounds',
  hazard: 'Hazards',
  casualArea: 'Casual areas',
  requiredRelief: 'Required relief',
  boundary: 'Property',
  notedArea: 'Notes',
  notedPoint: 'Notes',
  path: 'Paths',
  water: 'Water',
  terrain: 'Terrain',
  fairway: 'Fairways',
};

const groupLabel = (kind: FeatureKind): string =>
  GROUP_LABELS[kind] ?? `${KIND_DEFINITIONS[kind].label}s`;

/**
 * The one fact worth printing beside a feature's name.
 *
 * Chosen per kind rather than generically, because what identifies a feature is
 * different for each: a tee is identified by which skill level it serves, a pin
 * by its letter, an area by how big it is. A line gets its length and an area
 * gets its acreage because those are measured — they are the numbers a designer
 * is reaching for, and nobody typed them in.
 *
 * Empty rather than a placeholder when there is nothing to say. A dash in this
 * column would be a value, and the absence of one is not.
 */
function metaFor(feature: Feature, units: UnitSystem): string {
  if (feature.kind === 'tee') {
    // Matched against the list rather than cast into the record: a document can
    // hold any string here, and `props` is loosely typed on purpose.
    const level = SKILL_LEVELS.find((candidate) => candidate === feature.props['color']);
    return level ? SKILL_LEVEL_INFO[level].label : '';
  }

  if (feature.kind === 'target') {
    const pin = feature.props['pinId'];
    return typeof pin === 'string' && pin.trim() !== '' ? pin : '';
  }

  if (feature.kind === 'mando') {
    const side = feature.props['side'];
    if (side === 'left') return 'Left';
    if (side === 'right') return 'Right';
    if (side === 'over') return 'Over';
    return '';
  }

  if (feature.geometry.type === 'line') {
    return formatDistance(pathLength(feature.geometry.coordinates), units);
  }

  if (feature.geometry.type === 'polygon') {
    const area = featureArea(feature);
    return area === null ? '' : formatArea(area, units);
  }

  return '';
}

/** An open eye and a closed one, at the size the rows run at. */
function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path
        d="M1 7s2.2-3.5 6-3.5S13 7 13 7s-2.2 3.5-6 3.5S1 7 1 7Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      {open ? (
        <circle cx="7" cy="7" r="1.6" fill="currentColor" />
      ) : (
        /* A slash rather than a second drawing: the lid closing over the same
           eye reads as the on/off pair of one control. */
        <path
          d="M2.5 11.5 11.5 2.5"
          stroke="currentColor"
          strokeWidth="1.1"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

/**
 * One feature, as every list in the app draws it.
 *
 * Extracted so the hole panel and the course list cannot drift apart. They did:
 * the course list grew icons, measurements and a hover state while the hole
 * panel kept a bare radio and an underlined link, so the same tee looked like
 * two different kinds of thing depending on which column you found it in.
 *
 * `leading` and `trailing` are what let one row serve both. The hole panel puts
 * a radio in front — which tee is being measured from is a question only it
 * asks — and a remove control behind it; the course list puts the eye behind.
 * Both sit *outside* the row's own button, because a button inside a button is
 * invalid and the inner one's clicks are swallowed.
 */
export function FeatureRow({
  feature,
  units,
  selected,
  dimmed = false,
  onSelect,
  leading,
  trailing,
}: {
  feature: Feature;
  units: UnitSystem;
  selected: boolean;
  /** Reads as absent without leaving the list, so it can still be brought back. */
  dimmed?: boolean;
  onSelect: () => void;
  leading?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <li className="flex items-center">
      {leading}
      <button
        type="button"
        onClick={onSelect}
        aria-label={`Select ${featureName(feature)}`}
        className={cn(
          'flex h-7 min-w-0 flex-1 items-center gap-2 rounded-md pl-2 pr-1 text-left',
          'transition-colors duration-fast',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
          selected ? 'bg-accent-soft' : 'hover:bg-surface-hover',
          dimmed && 'opacity-50',
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'grid w-4 shrink-0 place-items-center',
            selected ? 'text-text-accent' : 'text-text-muted',
          )}
        >
          <FeatureIcon kind={feature.kind} size={16} />
        </span>
        <span className="min-w-0 flex-1 truncate text-xs text-text-primary">
          {featureName(feature)}
        </span>
        <span className="shrink-0 whitespace-nowrap text-2xs tabular-nums text-text-muted">
          {metaFor(feature, units)}
        </span>
      </button>
      {trailing}
    </li>
  );
}

export function FeatureList({
  features,
  order,
  units,
  selectedId,
  hiddenIds,
  onSelect,
  onToggleHidden,
  empty,
}: {
  features: readonly Feature[];
  /** Which kinds to show, and in what order the groups appear. */
  order: readonly FeatureKind[];
  units: UnitSystem;
  selectedId: string | null;
  hiddenIds: ReadonlySet<string>;
  onSelect: (id: string) => void;
  onToggleHidden: (id: string) => void;
  /** Shown instead of the list when the scope holds nothing. */
  empty: string;
}) {
  const groups = useMemo(() => {
    const byKind = new Map<FeatureKind, Feature[]>();
    for (const feature of features) {
      const list = byKind.get(feature.kind);
      if (list) list.push(feature);
      else byKind.set(feature.kind, [feature]);
    }
    return order
      .map((kind) => ({ kind, features: byKind.get(kind) ?? [] }))
      .filter(({ features: group }) => group.length > 0);
  }, [features, order]);

  if (groups.length === 0) {
    return <p className="px-2.5 pb-2.5 text-2xs leading-4 text-text-muted">{empty}</p>;
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2.5">
      {groups.map(({ kind, features: group }) => (
        <section key={kind} className="mt-2 first:mt-0">
          <h3 className="px-2 pb-0.5 pt-1 text-[10px] text-text-muted">{groupLabel(kind)}</h3>
          <ul>
            {group.map((feature) => {
              const selected = feature.id === selectedId;
              const hidden = hiddenIds.has(feature.id);

              return (
                <FeatureRow
                  key={feature.id}
                  feature={feature}
                  units={units}
                  selected={selected}
                  dimmed={hidden}
                  onSelect={() => onSelect(feature.id)}
                  trailing={
                    <button
                      type="button"
                      onClick={() => onToggleHidden(feature.id)}
                      aria-pressed={hidden}
                      aria-label={`${hidden ? 'Show' : 'Hide'} ${featureName(feature)}`}
                      title={hidden ? 'Hidden on the map' : 'Visible on the map'}
                      className={cn(
                        'grid h-7 w-6 shrink-0 place-items-center rounded-md',
                        'transition-colors duration-fast hover:bg-surface-hover',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
                        hidden
                          ? 'text-text-disabled'
                          : 'text-text-muted hover:text-text-primary',
                      )}
                    >
                      <EyeIcon open={!hidden} />
                    </button>
                  }
                />
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
