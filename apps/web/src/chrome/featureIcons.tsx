import type { FeatureKind } from '@hyzerlines/core';

/**
 * The feature icons, one drawing per kind.
 *
 * ## One drawing at two sizes
 *
 * Every icon here is used at 24px in the tool bar and at 16px in the panels,
 * and they are the same paths both times rather than a pair of hand-tuned
 * variants. That is a property of how they are drawn: these are hairline
 * *fills* — closed shapes about a unit wide — rather than stroked outlines, so
 * scaling them shrinks the shape and its weight together and nothing has to be
 * re-hinted. A stroked set would need `vector-effect` or a second size to keep
 * its lines from thinning into nothing.
 *
 * The two places it does thin are the basket's chains and the O/B lettering. If
 * those ever read as soft at 16px the fix is a 16px variant of those two icons
 * and not a stroke width on all eight — see the note the design left about it.
 *
 * ## Everything is `currentColor`
 *
 * Inherited from the button, which is what makes an icon follow the theme and
 * the active state without knowing about either. The rail learned this the hard
 * way: icons painted from the map's feature tokens went white-on-white in the
 * light theme, because those tokens are deliberately theme-independent — they
 * sit on imagery, not on chrome.
 *
 * ## Viewboxes are not all 24 wide
 *
 * Three of these are `0 0 23 24`. That is how they were drawn and it is left
 * alone deliberately: re-fitting the art to a square would move every path by a
 * half pixel and the shapes are already optically centred within their own box.
 * The `<svg>` element carries whatever box its paths were authored in.
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

/**
 * The arrow cursor, for the select tool.
 *
 * Not a feature kind — it draws nothing — so it lives beside the others rather
 * than in the kind map below.
 */
export function SelectIcon({ size = 24 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M3.10564 5.62713C2.58648 4.06899 4.06898 2.58648 5.62711 3.10564L19.6368 7.77557C21.6064 8.43212 21.3852 11.2864 19.338 11.632L14.1427 12.51L13.9884 12.5422C13.2265 12.7337 12.6425 13.3585 12.5099 14.1428L11.632 19.3381C11.2971 21.3214 8.60839 21.5908 7.8439 19.8147L7.77554 19.6369L3.10564 5.62713ZM5.31071 4.05486C4.53433 3.79629 3.79628 4.53434 4.05485 5.31072L8.72475 19.3205C9.05192 20.302 10.4743 20.1922 10.6466 19.1721L11.5236 13.9768C11.7357 12.7202 12.7201 11.7358 13.9767 11.5236L19.172 10.6467C20.192 10.4743 20.3019 9.05196 19.3204 8.7248L5.31071 4.05486Z" />
    </svg>
  );
}

/** A tee pad in plan: the pad, its back edge, and the line of the shot. */
export function TeeIcon({ size = 24 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 23 24" fill="currentColor" aria-hidden="true">
      <path d="M11 7H12V18H11V7Z" />
      <path d="M17 21V22H6V21H17ZM18 20V4C18 3.44772 17.5523 3 17 3H6C5.44772 3 5 3.44772 5 4V20C5 20.5523 5.44772 21 6 21V22L5.7959 21.9893C4.85435 21.8938 4.1062 21.1457 4.01074 20.2041L4 20V4C4 2.89543 4.89543 2 6 2H17C18.1046 2 19 2.89543 19 4V20L18.9893 20.2041C18.8938 21.1457 18.1457 21.8938 17.2041 21.9893L17 22V21C17.5523 21 18 20.5523 18 20Z" />
      <path d="M8 6H15V7H8V6Z" />
    </svg>
  );
}

/**
 * A drop zone: the same pad outline, with a marker standing in it.
 *
 * Deliberately the tee's rectangle rather than a shape of its own. A drop zone
 * *is* a teeing area — you throw from inside it under the same rules — and the
 * icons saying so is worth more than two unrelated drawings would be.
 */
export function DropzoneIcon({ size = 24 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 23 24" fill="currentColor" aria-hidden="true">
      <path d="M17 21V22H6V21H17ZM18 20V4C18 3.44772 17.5523 3 17 3H6C5.44772 3 5 3.44772 5 4V20C5 20.5523 5.44772 21 6 21V22L5.7959 21.9893C4.85435 21.8938 4.1062 21.1457 4.01074 20.2041L4 20V4C4 2.89543 4.89543 2 6 2H17C18.1046 2 19 2.89543 19 4V20L18.9893 20.2041C18.8938 21.1457 18.1457 21.8938 17.2041 21.9893L17 22V21C17.5523 21 18 20.5523 18 20Z" />
      <path d="M11.5 14C10.5779 14 9.95996 14.2303 9.5791 14.5635C9.20699 14.8891 9 15.3663 9 16L9 17H14V16C14 15.3663 13.793 14.8891 13.4209 14.5635C13.04 14.2303 12.4221 14 11.5 14ZM11.5 13C12.5778 13 13.46 13.2698 14.0791 13.8115C14.7069 14.3609 15 15.1338 15 16V18L8 18V16C8 15.1338 8.29305 14.3609 8.9209 13.8115C9.54005 13.2698 10.4222 13 11.5 13Z" />
      <path d="M8 6.5C8 6.31578 8.10137 6.14665 8.26367 6.05957C8.42625 5.97256 8.62392 5.9817 8.77734 6.08398L14 9.56543V6H15V10.5C15 10.6842 14.8986 10.8533 14.7363 10.9404C14.5737 11.0274 14.3761 11.0183 14.2227 10.916L9 7.43457V11H8L8 6.5Z" />
    </svg>
  );
}

/** A basket in side elevation: the rim, the chains, the band and the pole. */
export function BasketIcon({ size = 24 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 23 24" fill="currentColor" aria-hidden="true">
      <path d="M6 7V6.5H7V7C7 8.43159 7.36137 10.2413 7.96192 11.6826C8.26222 12.4033 8.61102 13.0034 8.98145 13.415C9.3553 13.8304 9.69919 14 10 14V15C9.30084 15 8.7072 14.607 8.23731 14.085C7.76401 13.5591 7.36276 12.8466 7.03809 12.0674C6.38866 10.5087 6 8.56839 6 7Z" />
      <path d="M17 7V6.5H16V7C16 8.43159 15.6386 10.2413 15.0381 11.6826C14.7378 12.4033 14.389 13.0034 14.0186 13.415C13.6447 13.8304 13.3008 14 13 14V15C13.6992 15 14.2928 14.607 14.7627 14.085C15.236 13.5591 15.6372 12.8466 15.9619 12.0674C16.6114 10.5087 17 8.56839 17 7Z" />
      <path d="M5 3H6V7H5V3Z" />
      <path d="M6 4V3H17V4L6 4Z" />
      <path d="M6 7V6L17 6V7H6Z" />
      <path d="M18.5 14C18.6607 14 18.8113 14.0776 18.9053 14.208C18.9992 14.3384 19.0254 14.5058 18.9746 14.6582L17.9746 17.6582C17.9066 17.8624 17.7152 18 17.5 18H5.5C5.28479 18 5.09345 17.8624 5.02539 17.6582L4.02539 14.6582C3.97458 14.5058 4.0008 14.3384 4.09473 14.208C4.1887 14.0776 4.33928 14 4.5 14H18.5ZM5.86035 17H17.1397L17.8057 15H5.19434L5.86035 17Z" />
      <path d="M17 3H18V7H17V3Z" />
      <path d="M11 7H12V21H11V7Z" />
    </svg>
  );
}

/** A mandatory: the gate you have to pass, with the arrow through it. */
export function MandoIcon({ size = 24 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M6.63574 5.63588C10.1504 2.12119 15.8495 2.12124 19.3643 5.63588C22.879 9.1506 22.879 14.8497 19.3643 18.3644L19.0283 18.6837C15.6093 21.7726 10.3906 21.7727 6.97168 18.6837L6.63574 18.3644C5.75701 17.4857 4.22356 15.894 2.90918 14.5226L0.5 12.0001C0.5 12.0001 4.87833 7.3933 6.63574 5.63588ZM18.6572 6.34291C15.5332 3.21893 10.468 3.21915 7.34375 6.34291C6.47384 7.21282 4.94656 8.79641 3.63086 10.1691C2.97459 10.8538 2.37307 11.4837 1.93555 11.9425C1.91723 11.9617 1.89859 11.9806 1.88086 11.9992C1.89883 12.018 1.91698 12.0373 1.93555 12.0568C2.3731 12.5157 2.97444 13.1463 3.63086 13.8312C4.94656 15.2039 6.47386 16.7875 7.34375 17.6574C10.468 20.7811 15.5332 20.7813 18.6572 17.6574C21.7814 14.5332 21.7814 9.4671 18.6572 6.34291Z" />
      <path d="M9.00001 8.49999C9.00001 8.28181 9.14157 8.08909 9.34962 8.02343C9.55758 7.95788 9.78398 8.03443 9.90919 8.21288L13 12.6289L16.0908 8.21288C16.216 8.03443 16.4424 7.95788 16.6504 8.02343C16.8585 8.08909 17 8.28181 17 8.49999V16H16V10.0859L13.4092 13.7871C13.3156 13.9205 13.163 14 13 14C12.837 14 12.6844 13.9205 12.5908 13.7871L10 10.0859V16H9.00001V8.49999Z" />
    </svg>
  );
}

/** Out of bounds: a dashed enclosure lettered O B. */
export function ObIcon({ size = 24 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17 13C17 12.6928 16.9366 12.5191 16.8652 12.415C16.7959 12.314 16.6845 12.2278 16.4902 12.1592C16.2883 12.0879 16.0206 12.0448 15.6748 12.0225C15.3308 12.0003 14.9418 12 14.5 12H14V14H14.5C14.9418 14 15.3308 13.9997 15.6748 13.9775C16.0206 13.9552 16.2883 13.9121 16.4902 13.8408C16.6845 13.7722 16.7959 13.686 16.8652 13.585C16.9366 13.4809 17 13.3072 17 13ZM16 10.5C16 10.3039 15.9645 10.218 15.9434 10.1836C15.9281 10.1589 15.9006 10.1266 15.8115 10.0938C15.7105 10.0564 15.5579 10.0292 15.3262 10.0146C15.0971 10.0002 14.8278 10 14.5 10H14V11H14.5C14.8674 11 15.1567 10.9998 15.3936 10.9854C15.6343 10.9706 15.7762 10.9425 15.8613 10.9092C15.9274 10.8832 15.9397 10.8628 15.9492 10.8447C15.969 10.8072 16 10.7132 16 10.5ZM17 10.5C17 10.757 16.9691 11.0093 16.8701 11.2344C17.1883 11.3545 17.4802 11.5451 17.6895 11.8506C17.9071 12.1684 18 12.5572 18 13C18 13.4428 17.9071 13.8317 17.6895 14.1494C17.4697 14.4701 17.159 14.6653 16.8223 14.7842C16.493 14.9003 16.1198 14.951 15.7393 14.9756C15.3567 15.0003 14.9332 15 14.5 15H13V9H14.5C14.8184 9 15.1226 8.99978 15.3896 9.0166C15.654 9.03327 15.9209 9.06861 16.1582 9.15625C16.4072 9.24827 16.6372 9.40376 16.7949 9.66016C16.9467 9.90698 17 10.1961 17 10.5Z" />
      <path d="M10 12.75V11.25C10 10.7884 9.9063 10.5158 9.77051 10.3594C9.6578 10.2296 9.35858 10 8.5 10C7.68665 10 7.3752 10.223 7.24707 10.3672C7.09899 10.5338 7 10.8145 7 11.25V12.75C7 13.1855 7.09899 13.4662 7.24707 13.6328C7.3752 13.777 7.68665 14 8.5 14V15C6.5 15 6 13.875 6 12.75V11.25C6 10.125 6.5 9 8.5 9C10.5683 9 11 10.125 11 11.25V12.75C11 13.875 10.5683 15 8.5 15V14C9.35858 14 9.6578 13.7704 9.77051 13.6406C9.9063 13.4842 10 13.2116 10 12.75Z" />
      <path d="M2 17V14.1426H3V17C3 17.5523 3.44772 18 4 18V19C2.96435 19 2.113 18.2128 2.01074 17.2041L2 17ZM6.28613 18V19H4V18H6.28613ZM14.2861 18V19H9.71387V18H14.2861ZM20 18V19H17.7139V18H20ZM22 17C22 18.0357 21.2128 18.887 20.2041 18.9893L20 19V18C20.5523 18 21 17.5523 21 17V14.1426H22V17ZM2 7C2 5.89543 2.89543 5 4 5H6.28613V6H4C3.44772 6 3 6.44772 3 7V9.85742H2V7ZM22 9.85742H21V7C21 6.44772 20.5523 6 20 6H17.7139V5H20L20.2041 5.01074C21.2128 5.113 22 5.96435 22 7V9.85742ZM14.2861 5V6H9.71387V5H14.2861Z" />
    </svg>
  );
}

/**
 * A hazard: the same dashed enclosure, lettered 1 X.
 *
 * Sharing OB's outline is the point — both are regulated areas, and what
 * separates them is the ruling, which is what the lettering carries. One stroke
 * and relief, versus out of bounds.
 */
export function HazardIcon({ size = 24 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M2 17V14.1426H3V17C3 17.5523 3.44772 18 4 18V19C2.96435 19 2.113 18.2128 2.01074 17.2041L2 17ZM6.28613 18V19H4V18H6.28613ZM14.2861 18V19H9.71387V18H14.2861ZM20 18V19H17.7139V18H20ZM22 17C22 18.0357 21.2128 18.887 20.2041 18.9893L20 19V18C20.5523 18 21 17.5523 21 17V14.1426H22V17ZM2 7C2 5.89543 2.89543 5 4 5H6.28613V6H4C3.44772 6 3 6.44772 3 7V9.85742H2V7ZM22 9.85742H21V7C21 6.44772 20.5523 6 20 6H17.7139V5H20L20.2041 5.01074C21.2128 5.113 22 5.96435 22 7V9.85742ZM14.2861 5V6H9.71387V5H14.2861Z" />
      <path d="M6 9H7V15H6V9Z" />
      <path d="M10 9H11V15H10V9Z" />
      <path d="M7 11H10V12H7V11Z" />
      <path d="M17.5 9C17.6921 9 17.8669 9.11017 17.9502 9.2832C18.0335 9.45644 18.0107 9.66241 17.8906 9.8125L14.541 14H18V15H13.5C13.3079 15 13.1331 14.8898 13.0498 14.7168C12.9665 14.5436 12.9893 14.3376 13.1094 14.1875L16.459 10H13V9H17.5Z" />
    </svg>
  );
}

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

/** A path: the walk between two points, bending. */
export function PathIcon({ size = 24 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 23 24" fill="currentColor" aria-hidden="true">
      <path d="M11 11.4998C11 8.86842 11.9299 7.45262 12.959 6.71754C13.4604 6.35937 13.9614 6.18101 14.3369 6.09156C14.5251 6.04675 14.6842 6.02416 14.7988 6.01246C14.856 6.00662 14.9025 6.00334 14.9365 6.00172C14.9536 6.0009 14.9679 6.00001 14.9785 5.99976H14.999C14.9993 5.99976 14.9999 5.99976 15 6.30347L14.999 5.99976H15.5V6.99976H15.002C14.9993 6.99982 14.993 7.00033 14.9844 7.00074C14.9672 7.00156 14.9386 7.0027 14.9004 7.0066C14.8237 7.01443 14.7091 7.03097 14.5693 7.06422C14.2887 7.13104 13.9144 7.26533 13.541 7.53199C12.8201 8.04693 12 9.13118 12 11.4998C12 14.5988 11.0923 16.2578 10.0752 17.1296C9.574 17.5592 9.06925 17.7775 8.68457 17.8875C8.49244 17.9424 8.32926 17.9696 8.21094 17.9841C8.15178 17.9914 8.10307 17.9958 8.06738 17.9978C8.04972 17.9988 8.03471 17.9994 8.02344 17.9998H7.5V16.9998H8.01074C8.02629 16.9989 8.05337 16.9964 8.08984 16.9919C8.16287 16.983 8.27348 16.9643 8.40918 16.9255C8.68069 16.848 9.05113 16.6902 9.42481 16.3699C10.1576 15.7416 11 14.4005 11 11.4998Z" />
      <path d="M19 6.5C19 5.67157 18.3284 5 17.5 5C16.6716 5 16 5.67157 16 6.5C16 7.32843 16.6716 8 17.5 8V9C16.1193 9 15 7.88071 15 6.5C15 5.11929 16.1193 4 17.5 4C18.8807 4 20 5.11929 20 6.5C20 7.88071 18.8807 9 17.5 9V8C18.3284 8 19 7.32843 19 6.5Z" />
      <path d="M7 17.5C7 16.6716 6.32843 16 5.5 16C4.67157 16 4 16.6716 4 17.5C4 18.3284 4.67157 19 5.5 19V20C4.11929 20 3 18.8807 3 17.5C3 16.1193 4.11929 15 5.5 15C6.88071 15 8 16.1193 8 17.5C8 18.8807 6.88071 20 5.5 20V19C6.32843 19 7 18.3284 7 17.5Z" />
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
 */
export function FeatureIcon({ kind, size = 16 }: { kind: FeatureKind } & IconProps) {
  if (!hasIcon(kind)) return null;
  const Icon = FEATURE_ICONS[kind];
  return <Icon size={size} />;
}
