import type { ReactNode } from 'react';
import { Menu, MenuItem, Panel, Tooltip, cn } from '@hyzerlines/design';
import {
  FOCUS_DEFINITIONS,
  KIND_DEFINITIONS,
  type FeatureKind,
  type Focus,
} from '@hyzerlines/core';

import type { Tool } from '../map/tools';
import { COLUMN, TOOL_BAR_BOTTOM } from './layout';
import { FEATURE_ICONS, SelectIcon, hasIcon, type IconKind } from './featureIcons';

/**
 * The palette.
 *
 * Bottom centre, in the channel between the two panel columns. It was top centre,
 * on the argument that the bottom edge is where the land you are working on is —
 * a course runs down and away from you on screen more often than up. That held
 * while the top edge was empty; the top bar is there now, and stacking a palette
 * under a document bar put two rows of chrome across the horizon and left the
 * bottom edge carrying nothing but an attribution line.
 *
 * ## It clips rather than overlapping
 *
 * The bar is centred inside `left: COLUMN, right: COLUMN` — the free map between
 * the panels — rather than on the viewport. On a narrow window that means the
 * bar runs out of room and is clipped at the panel edge, which is deliberate and
 * is the better failure: overlapping would put a tool button underneath a panel,
 * where it is visible, apparently clickable, and not.
 *
 * The buttons hold their size while that happens (`shrink-0`), so a cramped
 * window loses whole tools off the end rather than squeezing eight tools into
 * six tools' worth of space — a 28px target nobody can hit is worse than a
 * target that is not there.
 *
 * ## The focus decides which tools exist
 *
 * Only the kinds this focus is responsible for, and only those with an icon
 * drawn. `FOCUS_DEFINITIONS` places every kind including the ones with no art
 * yet, so widening the palette stays an exercise in drawing icons rather than a
 * second argument about which focus owns a drop zone.
 *
 * ## Flyouts
 *
 * Two kinds share a slot with the tool they are a variation of: a drop zone under
 * the tee, a hazard under out of bounds. Both were undrawable before this — the
 * model had the kinds and the palette had no room to give each one a slot of its
 * own. The corner triangle is the tell, and it is a *sibling* of the tool button
 * rather than a child, because a button inside a button is invalid and swallows
 * its own clicks.
 */

/**
 * Kinds that open a flyout, what is in it, and what the handle is called.
 *
 * The handle's name is spelled out rather than derived from the parent's label,
 * and that is not incidental. An accessible name is matched as a substring by
 * assistive tech and by tests alike, so a handle called "More tee pad tools"
 * *also* answers to "Tee pad" — and then the slot has two buttons by that name,
 * one of which arms the tool and one of which opens a menu. Naming the handle for
 * the family rather than the tool keeps every name in the palette unambiguous.
 */
const FLYOUTS: Partial<Record<FeatureKind, { kinds: readonly FeatureKind[]; handle: string }>> =
  {
    tee: { kinds: ['tee', 'dropzone'], handle: 'More teeing tools' },
    ob: { kinds: ['ob', 'hazard'], handle: 'More area tools' },
  };

/**
 * Palette order, independent of focus.
 *
 * This decides what *can* appear; the focus decides what does. Select and zoom
 * are not here — they are navigation, they belong to every focus, and they are
 * rendered before the divider.
 */
const PALETTE: readonly FeatureKind[] = [
  'tee',
  'target',
  'mando',
  'ob',
  'boundary',
  'path',
  'water',
  'terrain',
];

/** A magnifier. The sign inside follows what a click would actually do. */

/**
 * A 38px tool target.
 *
 * Bigger than the `md` icon buttons in the panels and smaller than the 44px the
 * rail used, which is the size the palette can afford now that it has to fit
 * between two columns. A tool is a target you hit dozens of times an hour without
 * looking, so it is the one place in the interface that gets its own size.
 */
const slotClass = cn(
  'relative grid h-[38px] w-[38px] shrink-0 place-items-center rounded-lg',
  'transition-colors duration-fast',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
);

function ToolButton({
  label,
  command,
  active,
  onClick,
  children,
}: {
  label: string;
  command?: string;
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip label={label} side="top" {...(command ? { command } : {})}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={active}
        onClick={onClick}
        className={cn(
          slotClass,
          active
            ? 'bg-accent-solid text-accent-text-on-solid'
            : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary',
        )}
      >
        {children}
      </button>
    </Tooltip>
  );
}

/**
 * The corner triangle, and the flyout it opens.
 *
 * Overlaps the bottom-right of the tool button it belongs to, as a sibling. Small
 * on purpose — it is a secondary affordance and the primary tool must stay easy
 * to hit — and the variations it holds are all reachable by keyboard as well, so
 * a 12px target is never the only route to one.
 */
function FlyoutHandle({
  parent,
  kinds,
  handle,
  tool,
  onPick,
}: {
  parent: FeatureKind;
  kinds: readonly FeatureKind[];
  /** The handle's accessible name. See `FLYOUTS` for why it is not derived. */
  handle: string;
  tool: Tool;
  onPick: (kind: FeatureKind) => void;
}) {
  const active = kinds.includes(tool as FeatureKind);

  return (
    <Menu
      label={`${KIND_DEFINITIONS[parent].label} variations`}
      align="center"
      trigger={
        <button
          type="button"
          aria-label={handle}
          className={cn(
            'absolute bottom-0 right-0 grid h-3 w-3 place-items-center rounded-br-lg',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
            active ? 'text-accent-text-on-solid' : 'text-text-muted hover:text-text-primary',
          )}
        >
          {/* A filled corner wedge, which is the convention every vector editor
              uses for "this slot holds more than one thing". */}
          <svg width="6" height="6" viewBox="0 0 6 6" aria-hidden="true">
            <path d="M6 0v6H0z" fill="currentColor" opacity="0.7" />
          </svg>
        </button>
      }
    >
      {kinds.map((kind) => (
        <MenuItem
          key={kind}
          onSelect={() => onPick(kind)}
          {...(KIND_DEFINITIONS[kind].command
            ? { command: KIND_DEFINITIONS[kind].command }
            : {})}
          icon={hasIcon(kind) ? FEATURE_ICONS[kind]({ size: 16 }) : undefined}
        >
          {KIND_DEFINITIONS[kind].label}
        </MenuItem>
      ))}
    </Menu>
  );
}

export function ToolBar({
  tool,
  focus,
  onToolChange,
}: {
  /**
   * The *effective* tool, not the chosen one.
   *
   * While Z is held the map zooms rather than doing what was clicked, and the
   * palette has to say so — a lit Select button over a map about to zoom is the
   * palette lying about the mode. With no zoom button to light instead, nothing
   * is lit for the duration of the hold, which is the honest reading: no drawing
   * tool is armed.
   */
  tool: Tool;
  focus: Focus;
  onToolChange: (tool: Tool) => void;
}) {
  const kinds = FOCUS_DEFINITIONS[focus].kinds;

  /*
   * A kind earns a slot if this focus owns it, it has an icon, and it is not
   * already inside somebody else's flyout. The last clause is what keeps a drop
   * zone from appearing twice in `play`, which owns both it and the tee.
   */
  const nested = new Set(
    Object.entries(FLYOUTS).flatMap(([parent, flyout]) =>
      flyout.kinds.filter((kind) => kind !== parent),
    ),
  );
  const slots = PALETTE.filter(
    (kind) => kinds.includes(kind) && hasIcon(kind) && !nested.has(kind),
  );

  return (
    <div
      className="pointer-events-none absolute flex justify-center overflow-hidden"
      style={{
        left: COLUMN,
        right: COLUMN,
        bottom: TOOL_BAR_BOTTOM,
        zIndex: 'var(--hz-z-chrome)',
      }}
    >
      <Panel
        elevation="solid"
        padding="none"
        className="flex max-w-full items-center gap-3 px-2.5 py-1.5"
        role="toolbar"
        aria-label="Tools"
      >
        <ToolButton
          label="Select"
          command="tool.select"
          active={tool === 'select'}
          onClick={() => onToolChange('select')}
        >
          <SelectIcon size={24} />
        </ToolButton>

        {slots.map((kind) => {
          const flyout = FLYOUTS[kind];
          // Active when this slot's tool is armed, including through its flyout —
          // the slot is what the designer sees, so the slot is what looks armed.
          const active = flyout ? flyout.kinds.includes(tool as FeatureKind) : tool === kind;

          /*
           * The armed variation's icon, not the slot's default.
           *
           * A slot drawing a tee while the next click would place a drop zone is
           * the palette disagreeing with itself about the mode the map is in —
           * the same failure as a lit Select button over a map about to zoom.
           */
          const shown =
            flyout?.kinds.find((candidate) => candidate === tool && hasIcon(candidate)) ?? kind;
          const Icon = FEATURE_ICONS[shown as IconKind];

          return (
            <span key={kind} className="relative flex shrink-0">
              <ToolButton
                label={KIND_DEFINITIONS[kind].label}
                {...(KIND_DEFINITIONS[kind].command
                  ? { command: KIND_DEFINITIONS[kind].command }
                  : {})}
                active={active}
                onClick={() => onToolChange(kind)}
              >
                <Icon size={24} />
              </ToolButton>

              {flyout && (
                <FlyoutHandle
                  parent={kind}
                  kinds={flyout.kinds}
                  handle={flyout.handle}
                  tool={tool}
                  onPick={onToolChange}
                />
              )}
            </span>
          );
        })}
      </Panel>
    </div>
  );
}
