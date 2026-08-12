import type { FeatureKind } from '@hyzerlines/core';

import { LARGE_ART, SMALL_ART, type LargeIconName } from './iconArt';

/**
 * The feature icons, one drawing per kind.
 *
 * Thin wrappers around `iconArt`: the path data lives there because the map's
 * canvas markers draw from the same strings, and a drawing that exists twice is
 * a drawing that will differ twice.
 *
 * ## Everything is `currentColor`
 *
 * Inherited from the button, which is what makes an icon follow the theme and
 * the active state without knowing about either. The rail learned this the hard
 * way: icons painted from the map's feature tokens went white-on-white in the
 * light theme, because those tokens are deliberately theme-independent — they
 * sit on imagery, not on chrome.
 *
 * ## The boxes are square, and that is load-bearing
 *
 * Both sets are drawn in square boxes now. The previous set was not — three
 * were `0 0 23 24` and most of the small art was 15 units wide — and every
 * container that drew one had to refuse to centre it, because an odd width
 * centred in an even box lands the artwork on a half pixel and fringes every
 * edge the drawing had snapped to a whole one. Squaring the art removed the
 * constraint, so icons are centred normally again.
 */

/** The kinds this file can draw. Everything else has no icon yet. */
export type IconKind = Extract<
  FeatureKind,
  'tee' | 'dropzone' | 'target' | 'mando' | 'ob' | 'hazard' | 'path' | 'boundary'
>;

interface IconProps {
  /** 24 in the tool bar, 16 in the panels. Nothing else, so far. */
  size?: 16 | 20 | 24;
}

/** A drawing from the 24px table, at whatever size the caller asked for. */
function art(name: LargeIconName) {
  return function Icon({ size = 24 }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
      >
        {LARGE_ART[name].map((d) => (
          <path key={d} d={d} />
        ))}
      </svg>
    );
  };
}

/**
 * The arrow cursor, for the select tool.
 *
 * Not a feature kind — it draws nothing — so it lives beside the others rather
 * than in the kind map below, and it is written out because it is the one glyph
 * the design set does not carry.
 */
export function SelectIcon({ size = 24 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M3.10564 5.62713C2.58648 4.06899 4.06898 2.58648 5.62711 3.10564L19.6368 7.77557C21.6064 8.43212 21.3852 11.2864 19.338 11.632L14.1427 12.51L13.9884 12.5422C13.2265 12.7337 12.6425 13.3585 12.5099 14.1428L11.632 19.3381C11.2971 21.3214 8.60839 21.5908 7.8439 19.8147L7.77554 19.6369L3.10564 5.62713ZM5.31071 4.05486C4.53433 3.79629 3.79628 4.53434 4.05485 5.31072L8.72475 19.3205C9.05192 20.302 10.4743 20.1922 10.6466 19.1721L11.5236 13.9768C11.7357 12.7202 12.7201 11.7358 13.9767 11.5236L19.172 10.6467C20.192 10.4743 20.3019 9.05196 19.3204 8.7248L5.31071 4.05486Z" />
    </svg>
  );
}

/** A tee pad in plan: the pad, its back edge, and the line of the shot. */
export const TeeIcon = art('tee');

/**
 * A drop zone: the same pad outline, with the arrow of a re-throw inside it.
 *
 * Deliberately the tee's rectangle rather than a shape of its own. A drop zone
 * *is* a teeing area — you throw from inside it under the same rules — and the
 * icons saying so is worth more than two unrelated drawings would be.
 */
export const DropzoneIcon = art('dropzone');

/**
 * A basket in side elevation: the rim, the chains, the band and the pole.
 *
 * The pole runs to the bottom of the box rather than stopping short of it,
 * which is what a basket on a map has to do — the marker stands on the point it
 * marks, and a pole floating above the ground reads as a basket hovering. The
 * map draws the *filled* variant of this same art; see `map/icons`.
 */
export const BasketIcon = art('basket');

/**
 * A mandatory: the M, in a marker that comes to a point on the side the disc
 * has to pass.
 *
 * Two drawings rather than one mirrored in CSS, because the pair is not a
 * mirror — the M stays upright in both while the point moves, which a
 * `scaleX(-1)` would not give.
 */
export const MandoIcon = art('mandoLeft');
export const MandoRightIcon = art('mandoRight');

/** Out of bounds: a dashed enclosure lettered O B. */
export const ObIcon = art('ob');

/**
 * A hazard: the same dashed enclosure, lettered H Z.
 *
 * Sharing OB's outline is the point — both are regulated areas, and what
 * separates them is the ruling, which is what the lettering carries. One stroke
 * and relief, versus out of bounds.
 */
export const HazardIcon = art('hazard');

/** A path: the walk between two points, bending. */
export const PathIcon = art('path');

/**
 * A property boundary: the parcel line, dashed.
 *
 * The one icon here that did not come from the design set, because that set was
 * drawn for the play palette and a boundary belongs to the land. It is also the
 * one drawn with strokes rather than as a hairline fill — a dashed outline is
 * what a parcel line looks like on every plat and survey drawing, and
 * `stroke-dasharray` is the only honest way to draw one.
 *
 * Which means it does not scale quite like its neighbours: at 16px the 1.5 stroke
 * lands near a pixel and the dashes tighten. That reads acceptably, and the
 * alternative — tracing a dashed hexagon as a dozen filled slivers — would be
 * unmaintainable for one icon.
 *
 * A hexagon rather than the rectangle the OB icon uses. Both are dashed
 * enclosures, and if they were the same shape the only thing separating "the land
 * you have" from "the land that costs a stroke" would be the lettering inside.
 */
export function BoundaryIcon({ size = 24 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M3.5 7.2 12 3l8.5 4.2v9.6L12 21l-8.5-4.2Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeDasharray="2.6 2.2"
      />
    </svg>
  );
}

/**
 * Kind to drawing.
 *
 * Only the kinds that have art. A kind absent from here has no icon yet, and
 * callers fall back rather than rendering a gap — `FOCUS_DEFINITIONS` places
 * every kind including those, deliberately, so the expanded palette stays an
 * exercise in drawing icons.
 */
export const FEATURE_ICONS: Record<IconKind, (props: IconProps) => React.ReactElement> = {
  tee: TeeIcon,
  dropzone: DropzoneIcon,
  target: BasketIcon,
  mando: MandoIcon,
  ob: ObIcon,
  hazard: HazardIcon,
  path: PathIcon,
  boundary: BoundaryIcon,
};

export function hasIcon(kind: FeatureKind): kind is IconKind {
  return kind in FEATURE_ICONS;
}

/**
 * A feature's icon at a panel size, or nothing.
 *
 * Returns null rather than a placeholder glyph for a kind with no art. A box or
 * a question mark reads as "this feature is broken" when the truth is only that
 * nobody has drawn its icon.
 *
 * The small set wins at 16 where it exists — see `iconArt` for why there are
 * two sets rather than one scaled.
 */
export function FeatureIcon({ kind, size = 16 }: { kind: FeatureKind } & IconProps) {
  const small = size === 16 ? SMALL_ART[kind] : undefined;
  if (small) {
    return (
      <svg width={16} height={16} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        {small.map((d) => (
          <path key={d} d={d} />
        ))}
      </svg>
    );
  }

  if (!hasIcon(kind)) return null;
  const Icon = FEATURE_ICONS[kind];
  return <Icon size={size} />;
}
