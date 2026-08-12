import { Menu, MenuItem, MenuLabel, MenuSeparator, cn } from '@hyzerlines/design';
import {
  KIND_DEFINITIONS,
  TARGET_CIRCLES,
  featureStyleOf,
  withFeatureStyle,
  type FeatureKind,
  type FeatureStyle,
  type HoleNumberStyle,
  type CircleStyle,
  type Lettering,
  type MapStyle,
  type Op,
  type TargetCircleId,
} from '@hyzerlines/core';

import {
  DEFAULT_CIRCLE_STYLES,
  DEFAULT_FEATURE_STYLES,
  DEFAULT_HOLE_NUMBER,
  DEFAULT_LETTERING_STYLE,
  builtInGlyphsFor,
  hasGlyph,
} from '../map/mapStyle';
import { hasPattern } from '../map/patterns';
import { SectionTitle, ToggleRow, sectionClass } from './propertyRow';
import { ColorRow, DASH_OPTIONS, FactRow, NumberRow, SelectRow } from './StyleControls';

/**
 * The controls for one styleable thing.
 *
 * The subject is a feature kind, the hole number, or one putting circle — the
 * three things a map is made of that are not geometry. They share this panel
 * for the same reason the feature, hole and course inspectors share theirs:
 * three bespoke forms would drift apart in spacing and labelling within a
 * month.
 *
 * ## Every control can be given back, from one place
 *
 * A value here is either the designer's or the app's, and the difference is
 * visible: an overridden row carries a dot. Undoing it is a menu in the panel's
 * header rather than a button on the row — see `Overridden` for why the buttons
 * had to go, and `styleResets` for what the menu is built from.
 *
 * Clearing an override *deletes* it rather than writing today's default into
 * the document. That is what keeps "inherited" and "chosen, and happens to
 * match" from collapsing into one state — see the note on `withFeatureStyle`.
 */

/** What is being styled. A kind, the numbers, or one of the rings. */
export type StyleSubject =
  | { type: 'kind'; kind: FeatureKind }
  | { type: 'holeNumber' }
  | { type: 'circle'; id: TargetCircleId };

export const subjectKey = (subject: StyleSubject): string =>
  subject.type === 'kind'
    ? `kind:${subject.kind}`
    : subject.type === 'circle'
      ? `circle:${subject.id}`
      : 'holeNumber';

export function subjectLabel(subject: StyleSubject): string {
  if (subject.type === 'kind') return KIND_DEFINITIONS[subject.kind].label;
  if (subject.type === 'holeNumber') return 'Hole numbers';
  return TARGET_CIRCLES.find((circle) => circle.id === subject.id)?.label ?? 'Circle';
}

/** The sheet `setStyle` carries: everything but the glyph library. */
type Sheet = Omit<MapStyle, 'glyphs'>;

const sheetOf = (style: MapStyle): Sheet => ({
  features: style.features,
  holeNumber: style.holeNumber,
  circles: style.circles,
  lettering: style.lettering,
  palette: style.palette,
});

/* ------------------------------------------------------------------ resets */

/**
 * What one entry in the reset menu undoes.
 *
 * A *group* of keys rather than a single one, because a colour and its opacity
 * are one decision made in one control, and a menu offering "OB line colour"
 * and "OB line opacity" as separate undos would be describing the schema rather
 * than the panel. The rule is one entry per control on screen.
 */
interface ResetGroup {
  id: string;
  label: string;
  keys: readonly string[];
}

const FEATURE_GROUPS: readonly ResetGroup[] = [
  { id: 'stroke', label: 'Line colour', keys: ['stroke', 'strokeOpacity'] },
  { id: 'strokeWidth', label: 'Line width', keys: ['strokeWidth'] },
  { id: 'dash', label: 'Dash', keys: ['dash'] },
  { id: 'casing', label: 'Casing', keys: ['casingOn', 'casing', 'casingOpacity'] },
  { id: 'fill', label: 'Fill', keys: ['fill', 'fillOpacity'] },
  { id: 'fillOutside', label: 'Fill outside it', keys: ['fillOutside'] },
  {
    id: 'secondCorridor',
    label: 'Approach corridor',
    keys: ['secondCorridor', 'secondFill', 'secondFillOpacity'],
  },
  { id: 'smooth', label: 'Smoothing', keys: ['smooth'] },
  { id: 'lineGap', label: 'Where the line starts', keys: ['lineGap'] },
  { id: 'arrow', label: 'Arrowhead', keys: ['arrow', 'arrowSize'] },
  { id: 'shade', label: 'Shading', keys: ['shade', 'shadeOpacity'] },
  { id: 'glyph', label: 'Drawing', keys: ['glyph'] },
  { id: 'glyphSize', label: 'Drawing size', keys: ['glyphSize'] },
];

const HOLE_NUMBER_GROUPS: readonly ResetGroup[] = [
  { id: 'text', label: 'Colour', keys: ['text'] },
  { id: 'size', label: 'Size', keys: ['size'] },
  { id: 'weight', label: 'Weight', keys: ['weight'] },
  { id: 'offset', label: 'Off the shot', keys: ['offset'] },
  { id: 'disc', label: 'The disc', keys: ['disc'] },
  { id: 'casing', label: 'Casing', keys: ['casing', 'casingOn'] },
];

const CIRCLE_GROUPS: readonly ResetGroup[] = [
  { id: 'stroke', label: 'Colour', keys: ['stroke'] },
  { id: 'strokeWidth', label: 'Width', keys: ['strokeWidth'] },
  { id: 'dash', label: 'Dash', keys: ['dash'] },
  { id: 'fill', label: 'Fill', keys: ['fillOn', 'fill', 'fillOpacity', 'hideOverCorridor'] },
];

/**
 * The lettering, as one entry.
 *
 * Split from a kind's own overrides because it is not one kind's: OB, HZ, CAS
 * and REL share it, and resetting it from the out-of-bounds panel resets it for
 * all four. That is the same fact the control itself carries, said again here so
 * the menu cannot promise something narrower than it does.
 */
const LETTERING_GROUP: ResetGroup = {
  id: 'lettering',
  label: 'Lettering (all four areas)',
  keys: ['on', 'size', 'spacing', 'angle'],
};

const overridesOf = (subject: StyleSubject, style: MapStyle): Record<string, unknown> => {
  if (subject.type === 'kind') return featureStyleOf(style, subject.kind);
  if (subject.type === 'holeNumber') return style.holeNumber;
  return style.circles[subject.id] ?? {};
};

const groupsFor = (subject: StyleSubject): readonly ResetGroup[] => {
  if (subject.type === 'holeNumber') return HOLE_NUMBER_GROUPS;
  if (subject.type === 'circle') return CIRCLE_GROUPS;
  return FEATURE_GROUPS;
};

/** Whether the lettering belongs to this panel at all. */
const lettered = (subject: StyleSubject): boolean =>
  subject.type === 'kind' && hasPattern(subject.kind);

const isSet = (values: Record<string, unknown>, keys: readonly string[]): boolean =>
  keys.some((key) => values[key] !== undefined);

/**
 * Everything this panel could give back, and nothing it could not.
 *
 * Only groups that are actually overridden, so the menu is a list of decisions
 * the designer has made rather than a catalogue of the ones available. An empty
 * result means the whole panel is inherited, and the trigger is not drawn.
 */
export function styleResets(subject: StyleSubject, style: MapStyle): ResetGroup[] {
  const values = overridesOf(subject, style);
  const groups = groupsFor(subject).filter((group) => isSet(values, group.keys));
  if (lettered(subject) && isSet(style.lettering, LETTERING_GROUP.keys)) {
    groups.push(LETTERING_GROUP);
  }
  return groups;
}

const without = <T extends Record<string, unknown>>(values: T, keys: readonly string[]): T =>
  Object.fromEntries(Object.entries(values).filter(([key]) => !keys.includes(key))) as T;

/**
 * The sheet with one group — or all of them — cleared.
 *
 * `all` is the panel's own everything, which for a lettered area includes the
 * lettering it shares with the other three. A "reset everything here" that left
 * a control on screen untouched would be the more surprising of the two, and it
 * is the one entry a designer reaches for when they have lost track.
 */
export function withStyleReset(
  subject: StyleSubject,
  style: MapStyle,
  id: string | 'all',
): Sheet {
  const sheet = sheetOf(style);
  const groups =
    id === 'all'
      ? styleResets(subject, style)
      : styleResets(subject, style).filter((group) => group.id === id);

  const ownKeys = groups.filter((group) => group !== LETTERING_GROUP).flatMap((g) => g.keys);
  const clearsLettering = groups.includes(LETTERING_GROUP);

  const next: Sheet = clearsLettering
    ? { ...sheet, lettering: without(style.lettering, LETTERING_GROUP.keys) }
    : sheet;

  if (ownKeys.length === 0) return next;

  if (subject.type === 'kind') {
    const kept = without(featureStyleOf(style, subject.kind), ownKeys);
    return { ...next, features: withFeatureStyle(style, subject.kind, kept).features };
  }
  if (subject.type === 'holeNumber') {
    return { ...next, holeNumber: without(style.holeNumber, ownKeys) };
  }
  return {
    ...next,
    circles: {
      ...style.circles,
      [subject.id]: without(style.circles[subject.id] ?? {}, ownKeys),
    },
  };
}

/**
 * The way back, as a menu rather than a button per row.
 *
 * One trigger in the header, everything the panel has been told inside it, and
 * "everything here" at the bottom where a destructive answer belongs. It is
 * absent entirely when nothing has been overridden — a Reset on an untouched
 * panel is a control that does nothing and reads as dangerous the first time
 * you meet it.
 */
function ResetMenu({
  subject,
  style,
  onOp,
}: {
  subject: StyleSubject;
  style: MapStyle;
  onOp: (op: Op) => void;
}) {
  const groups = styleResets(subject, style);
  if (groups.length === 0) return null;

  const reset = (id: string) =>
    onOp({ type: 'setStyle', style: withStyleReset(subject, style, id) });

  return (
    <Menu
      label="Reset"
      align="end"
      trigger={
        <button
          type="button"
          className={cn(
            'rounded px-1 text-2xs text-text-muted transition-colors duration-fast',
            'hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
          )}
        >
          Reset
        </button>
      }
    >
      <MenuLabel>Back to the default</MenuLabel>
      {groups.map((group) => (
        <MenuItem key={group.id} onSelect={() => reset(group.id)}>
          {group.label}
        </MenuItem>
      ))}
      <MenuSeparator />
      <MenuItem onSelect={() => reset('all')}>Everything here</MenuItem>
    </Menu>
  );
}

/* ---------------------------------------------------------------- controls */

/** Built-in glyph names, as something a person would say. */
const GLYPH_LABELS: Record<string, string> = {
  basketFill: 'Basket, solid outline',
  basketSolid: 'Basket, filled',
  basket: 'Basket, outline',
  teePad: 'Pad',
  teeFill: 'Pad, filled mark',
  tee: 'Pad, lettered',
  dropzone: 'Drop zone',
  mandoLeft: 'Mandatory, outline',
  mandoRight: 'Mandatory, outline',
  mandoLeftFill: 'Mandatory, filled',
  mandoRightFill: 'Mandatory, filled',
};

export function StyleProperties({
  subject,
  style,
  onStyle,
}: {
  subject: StyleSubject;
  style: MapStyle;
  /** The whole sheet, minus the glyph library. See the `setStyle` op. */
  onStyle: (op: Op) => void;
}) {
  const sheet = sheetOf(style);
  const commit = (next: Sheet) => onStyle({ type: 'setStyle', style: next });

  /* One lettering for the four regulated areas — see `letteringSchema`. */
  const setLettering = (changes: Lettering) =>
    commit({ ...sheet, lettering: { ...style.lettering, ...changes } });

  /*
   * Keeping a colour is an edit to the sheet like any other, so it lands on the
   * undo stack and travels with the file. Deduplicated, and capped by the
   * schema — a palette is a shortlist, and one that grew without limit would be
   * a history of every colour anybody tried.
   */
  const keep = (colour: string) => {
    if (style.palette.includes(colour)) return;
    commit({ ...sheet, palette: [...style.palette, colour].slice(-24) });
  };

  if (subject.type === 'holeNumber') {
    const current = style.holeNumber;
    const base = DEFAULT_HOLE_NUMBER;
    const set = (changes: HoleNumberStyle) =>
      commit({ ...sheet, holeNumber: { ...current, ...changes } });

    return (
      <>
        <div className={sectionClass}>
          <SectionTitle>The numeral</SectionTitle>
          <ColorRow
            label="Colour"
            value={current.text ?? base.text}
            opacity={null}
            inherited={current.text === undefined}
            palette={style.palette}
            onColor={(text) => set({ text })}
            onOpacity={() => undefined}
            onKeep={keep}
          />
          <NumberRow
            label="Size"
            value={current.size ?? base.size}
            inherited={current.size === undefined}
            suffix="px"
            step={1}
            onChange={(size) => set({ size })}
          />
          <SelectRow
            label="Weight"
            value={current.weight ?? base.weight}
            options={[
              { value: 'regular' as const, label: 'Regular' },
              { value: 'bold' as const, label: 'Bold' },
            ]}
            inherited={current.weight === undefined}
            onChange={(weight) => set({ weight })}
          />
          <NumberRow
            label="Off the shot"
            value={current.offset ?? base.offset}
            inherited={current.offset === undefined}
            suffix="m"
            step={1}
            onChange={(offset) => set({ offset })}
          />
          <p className="mt-2 text-2xs leading-4 text-text-muted">
            The number sits at the middle of the shot, which is the right place and also
            directly on the line. Metres rather than pixels, so it keeps the same relationship
            to the corridor at every zoom; positive is the player&rsquo;s right, looking down
            the hole.
          </p>
        </div>

        <div className={sectionClass}>
          <SectionTitle>The disc under it</SectionTitle>
          <ToggleRow
            label="Show the disc"
            checked={current.disc !== null}
            onChange={(on) => set({ disc: on ? base.disc : null })}
          />
          {current.disc !== null && (
            <ColorRow
              label="Colour"
              value={current.disc ?? base.disc ?? '#0e1013'}
              opacity={null}
              inherited={current.disc === undefined}
              palette={style.palette}
              onColor={(disc) => set({ disc })}
              onOpacity={() => undefined}
              onKeep={keep}
            />
          )}
          {/*
            The casing appears exactly where the disc is not.

            With a disc behind it the numeral already has a shape to be read
            against, and a halo as well would be two contrast floors thickening
            the digits for nothing. With the disc off the number is bare over
            satellite imagery, which is the case a casing exists for.
          */}
          {current.disc === null && (
            <>
              <ToggleRow
                label="Draw a casing"
                checked={current.casingOn ?? base.casingOn}
                onChange={(casingOn) => set({ casingOn })}
              />
              <ColorRow
                label="Casing"
                value={current.casing ?? base.casing}
                opacity={null}
                inherited={current.casing === undefined}
                palette={style.palette}
                onColor={(casing) => set({ casing })}
                onOpacity={() => undefined}
                onKeep={keep}
              />
            </>
          )}
          <p className="mt-2 text-2xs leading-4 text-text-muted">
            A number floating over satellite imagery is unreadable over a good fraction of it.
            The disc grows with the numeral, so a bigger number does not outgrow the shape that
            makes it legible &mdash; and with the disc off, a casing does the smaller version of
            the same job.
          </p>
        </div>
      </>
    );
  }

  if (subject.type === 'circle') {
    const current = style.circles[subject.id] ?? {};
    const base = DEFAULT_CIRCLE_STYLES[subject.id];
    const set = (changes: CircleStyle) =>
      commit({
        ...sheet,
        circles: { ...style.circles, [subject.id]: { ...current, ...changes } },
      });
    const circle = TARGET_CIRCLES.find((c) => c.id === subject.id);

    return (
      <>
        <div className={sectionClass}>
          <SectionTitle>The ring</SectionTitle>
          <ColorRow
            label="Colour"
            value={current.stroke ?? base.stroke}
            opacity={null}
            inherited={current.stroke === undefined}
            palette={style.palette}
            onColor={(stroke) => set({ stroke })}
            onOpacity={() => undefined}
            onKeep={keep}
          />
          <NumberRow
            label="Width"
            value={current.strokeWidth ?? base.strokeWidth}
            inherited={current.strokeWidth === undefined}
            suffix="px"
            step={0.25}
            onChange={(strokeWidth) => set({ strokeWidth })}
          />
          <SelectRow
            label="Dash"
            value={current.dash ?? base.dash}
            options={DASH_OPTIONS}
            inherited={current.dash === undefined}
            onChange={(dash) => set({ dash })}
          />
          {circle && <FactRow label="Radius">{circle.radiusM} m</FactRow>}
          {circle && (
            <p className="mt-2 text-2xs leading-4 text-text-muted">
              {circle.authority === 'rules'
                ? 'A figure the rules publish.'
                : 'League convention, in no PDGA document.'}
            </p>
          )}
        </div>

        <div className={sectionClass}>
          <SectionTitle>The ground inside</SectionTitle>
          <ToggleRow
            label="Fill it"
            checked={current.fillOn ?? base.fillOn}
            onChange={(fillOn) => set({ fillOn })}
          />
          <ColorRow
            label="Colour"
            value={current.fill ?? base.fill}
            opacity={current.fillOpacity ?? base.fillOpacity}
            inherited={current.fill === undefined && current.fillOpacity === undefined}
            palette={style.palette}
            onColor={(fill) => set({ fill })}
            onOpacity={(fillOpacity) => set({ fillOpacity })}
            onKeep={keep}
          />
          <ToggleRow
            label="Not under a corridor"
            checked={current.hideOverCorridor ?? base.hideOverCorridor}
            onChange={(hideOverCorridor) => set({ hideOverCorridor })}
          />
          <p className="mt-2 text-2xs leading-4 text-text-muted">
            Off by default: three filled rings around every basket sit on the imagery a designer
            reads the terrain from. A printed plan is the other job, and there a shaded circle
            is the clearest thing on it. The corridor already rounds to Circle 1 at the target,
            so where both are drawn the fill lands on ground that is shaded twice &mdash; which
            is what the last switch is for.
          </p>
        </div>
      </>
    );
  }

  const kind = subject.kind;
  const current = featureStyleOf(style, kind);
  const base = DEFAULT_FEATURE_STYLES[kind];
  const geometry = KIND_DEFINITIONS[kind].geometry;

  const set = (changes: FeatureStyle) =>
    commit({
      ...sheet,
      features: withFeatureStyle(style, kind, { ...current, ...changes }).features,
    });

  return (
    <>
      <div className={sectionClass}>
        <SectionTitle>Line</SectionTitle>
        <ColorRow
          label="Colour"
          value={current.stroke ?? base.stroke}
          opacity={current.strokeOpacity ?? base.strokeOpacity}
          inherited={current.stroke === undefined && current.strokeOpacity === undefined}
          palette={style.palette}
          onColor={(stroke) => set({ stroke })}
          onOpacity={(strokeOpacity) => set({ strokeOpacity })}
          onKeep={keep}
        />
        <NumberRow
          label="Width"
          value={current.strokeWidth ?? base.strokeWidth}
          inherited={current.strokeWidth === undefined}
          suffix="px"
          step={0.25}
          onChange={(strokeWidth) => set({ strokeWidth })}
        />
        <SelectRow
          label="Dash"
          value={current.dash ?? base.dash}
          options={DASH_OPTIONS}
          inherited={current.dash === undefined}
          onChange={(dash) => set({ dash })}
        />
      </div>

      <div className={sectionClass}>
        <SectionTitle>Casing</SectionTitle>
        <ToggleRow
          label="Draw a casing"
          checked={current.casingOn ?? base.casingOn}
          onChange={(casingOn) => set({ casingOn })}
        />
        <ColorRow
          label="Colour"
          value={current.casing ?? base.casing}
          opacity={current.casingOpacity ?? base.casingOpacity}
          inherited={current.casing === undefined && current.casingOpacity === undefined}
          palette={style.palette}
          onColor={(casing) => set({ casing })}
          onOpacity={(casingOpacity) => set({ casingOpacity })}
          onKeep={keep}
        />
        <p className="mt-2 text-2xs leading-4 text-text-muted">
          The dark line under the stroke — the contrast floor that keeps a feature readable over
          both canopy and sand. It is the one setting here that can make a map unreadable, and
          the one that makes a light basemap work.
        </p>
      </div>

      {geometry === 'polygon' && (
        <div className={sectionClass}>
          <SectionTitle>Fill</SectionTitle>
          <ToggleRow
            label="Fill outside it"
            checked={current.fillOutside ?? base.fillOutside}
            onChange={(fillOutside) => set({ fillOutside })}
          />
          <ColorRow
            label="Colour"
            value={current.fill ?? base.fill}
            opacity={current.fillOpacity ?? base.fillOpacity}
            inherited={current.fill === undefined && current.fillOpacity === undefined}
            palette={style.palette}
            onColor={(fill) => set({ fill })}
            onOpacity={(fillOpacity) => set({ fillOpacity })}
            onKeep={keep}
          />
        </div>
      )}

      {/*
        A fairway is a line in the document and two areas on the map, so its
        corridors get their own sections rather than the polygon "Fill" one it
        does not qualify for. The first one had no controls at all until now:
        the colour it draws in is the fairway's fill, which the panel was
        hiding because the kind's geometry is a line.
      */}
      {kind === 'fairway' && (
        <div className={sectionClass}>
          <SectionTitle>Corridor</SectionTitle>
          <ColorRow
            label="Colour"
            value={current.fill ?? base.fill}
            opacity={current.fillOpacity ?? base.fillOpacity}
            inherited={current.fill === undefined && current.fillOpacity === undefined}
            palette={style.palette}
            onColor={(fill) => set({ fill })}
            onOpacity={(fillOpacity) => set({ fillOpacity })}
            onKeep={keep}
          />
          <ToggleRow
            label="Smooth the line"
            checked={current.smooth ?? base.smooth}
            onChange={(smooth) => set({ smooth })}
          />
          <p className="mt-2 text-2xs leading-4 text-text-muted">
            The room this shot has, drawn from the tee pad&rsquo;s width and closing to Circle 1
            at the target. Smoothing rounds the corners off the line and both corridors on every
            hole at once &mdash; the vertices you placed stay where they are, and every length
            the panels report is still the one you drew.
          </p>
        </div>
      )}

      {kind === 'fairway' && (
        <div className={sectionClass}>
          <SectionTitle>Approach corridor</SectionTitle>
          <ToggleRow
            label="Show it"
            checked={current.secondCorridor ?? base.secondCorridor}
            onChange={(secondCorridor) => set({ secondCorridor })}
          />
          <ColorRow
            label="Colour"
            value={current.secondFill ?? base.secondFill}
            opacity={current.secondFillOpacity ?? base.secondFillOpacity}
            inherited={
              current.secondFill === undefined && current.secondFillOpacity === undefined
            }
            palette={style.palette}
            onColor={(secondFill) => set({ secondFill })}
            onOpacity={(secondFillOpacity) => set({ secondFillOpacity })}
            onKeep={keep}
          />
          <p className="mt-2 text-2xs leading-4 text-text-muted">
            A second, wider band from the front of the tee, opening out to enclose Circle 2. The
            first corridor says how much room the line has; this says how much the approach has
            — the ground a player is trying to reach rather than the line they are trying to
            hold. Off by default, because two translucent bands down one strip of land is a lot
            of ink.
          </p>
        </div>
      )}

      {kind === 'mando' && (
        <div className={sectionClass}>
          <SectionTitle>The line</SectionTitle>
          <NumberRow
            label="Starts at"
            value={current.lineGap ?? base.lineGap}
            inherited={current.lineGap === undefined}
            suffix="m"
            step={0.5}
            onChange={(lineGap) => set({ lineGap })}
          />
          <ToggleRow
            label="Arrowhead"
            checked={current.arrow ?? base.arrow}
            onChange={(arrow) => set({ arrow })}
          />
          <NumberRow
            label="Arrow size"
            value={current.arrowSize ?? base.arrowSize}
            inherited={current.arrowSize === undefined}
            suffix="px"
            step={1}
            onChange={(arrowSize) => set({ arrowSize })}
          />
          <ToggleRow
            label="Shade behind it"
            checked={current.shade ?? base.shade}
            onChange={(shade) => set({ shade })}
          />
          <NumberRow
            label="Shading"
            value={current.shadeOpacity ?? base.shadeOpacity}
            inherited={current.shadeOpacity === undefined}
            step={0.05}
            onChange={(shadeOpacity) => set({ shadeOpacity })}
          />
          <p className="mt-2 text-2xs leading-4 text-text-muted">
            The shading is a half disc with its flat edge on the line, bulging the way play goes
            — the ground you end up on if you take the wrong side and carry on to the basket.
            The line says where the plane is; the shading says what it costs you.
          </p>
          <p className="mt-2 text-2xs leading-4 text-text-muted">
            Where the wall starts, measured out from the object, so it clears the marker rather
            than running through it. Metres rather than pixels because the line is on the ground
            — the gap is right at the zoom a hole is designed at and closes as you zoom out.
          </p>
        </div>
      )}

      {hasPattern(kind) && (
        <div className={sectionClass}>
          <SectionTitle>Lettering</SectionTitle>
          <ToggleRow
            label="Repeat the letters"
            checked={style.lettering.on ?? DEFAULT_LETTERING_STYLE.on}
            onChange={(on) => setLettering({ on })}
          />
          <NumberRow
            label="Text size"
            value={style.lettering.size ?? DEFAULT_LETTERING_STYLE.size}
            inherited={style.lettering.size === undefined}
            suffix="px"
            step={1}
            onChange={(size) => setLettering({ size })}
          />
          <NumberRow
            label="Spacing"
            value={style.lettering.spacing ?? DEFAULT_LETTERING_STYLE.spacingPx}
            inherited={style.lettering.spacing === undefined}
            suffix="px"
            step={10}
            onChange={(spacing) => setLettering({ spacing })}
          />
          <NumberRow
            label="Angle"
            value={style.lettering.angle ?? DEFAULT_LETTERING_STYLE.angle}
            inherited={style.lettering.angle === undefined}
            suffix="°"
            step={5}
            onChange={(angle) => setLettering({ angle })}
          />
          <p className="mt-2 text-2xs leading-4 text-text-muted">
            One setting for out of bounds, hazards, casual areas and required relief — they are
            the same annotation at four different rulings, and lettering that differed between
            them would read as an inconsistency rather than a distinction. What does differ is
            what the letters say, which is the kind&rsquo;s own name, and their colour, which
            follows its line.
          </p>
          <p className="mt-2 text-2xs leading-4 text-text-muted">
            Size, spacing and angle are all measured on the screen, so the pattern looks the
            same however far out you zoom. The angle turns the letters themselves. A set that
            would cross the area&rsquo;s border is not drawn, which is why a narrow strip gets
            none.
          </p>
        </div>
      )}

      {hasGlyph(kind) && (
        <div className={sectionClass}>
          <SectionTitle>Marker</SectionTitle>
          <SelectRow
            label="Drawing"
            value={current.glyph ?? base.glyph}
            options={[
              ...builtInGlyphsFor(kind).map((name) => ({
                value: name,
                label: GLYPH_LABELS[name] ?? name,
              })),
              ...style.glyphs.map((glyph) => ({ value: glyph.id, label: glyph.name })),
            ]}
            inherited={current.glyph === undefined}
            onChange={(glyph) => set({ glyph })}
          />
          <NumberRow
            label="Size"
            value={current.glyphSize ?? base.glyphSize}
            inherited={current.glyphSize === undefined}
            suffix="px"
            step={1}
            onChange={(glyphSize) => set({ glyphSize })}
          />
          {kind === 'mando' && (
            <p className="mt-2 text-2xs leading-4 text-text-muted">
              A mandatory has a drawing for each side. Picking one of a built-in pair picks
              both; an uploaded drawing is used for both sides, and the line says which side you
              must pass.
            </p>
          )}
        </div>
      )}
    </>
  );
}

/**
 * The style subject, as the right panel's whole contents.
 *
 * A header plus the controls, so the panel takes one node and does not have to
 * know what a style subject is. The header names what is being described, offers
 * the way back to the defaults, and offers the way out — the same jobs it does
 * for a feature.
 */
export function StyleSubjectPanel({
  subject,
  style,
  onOp,
  onClose,
}: {
  subject: StyleSubject;
  style: MapStyle;
  onOp: (op: Op) => void;
  onClose: () => void;
}) {
  return (
    <>
      <header className="shrink-0 px-2.5 pb-1.5 pt-2">
        <div className="flex items-center gap-1">
          <span className="text-2xs text-text-muted">Style</span>
          <span className="ml-auto flex items-center gap-1">
            <ResetMenu subject={subject} style={style} onOp={onOp} />
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className={cn(
                'rounded px-1 text-2xs text-text-muted transition-colors duration-fast',
                'hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
              )}
            >
              Close
            </button>
          </span>
        </div>
        <h2 className="px-1 text-sm font-semibold text-text-primary">
          {subjectLabel(subject)}
        </h2>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <StyleProperties subject={subject} style={style} onStyle={onOp} />
      </div>
    </>
  );
}
