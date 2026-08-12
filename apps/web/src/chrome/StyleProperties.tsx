import { cn } from '@hyzerlines/design';
import {
  KIND_DEFINITIONS,
  TARGET_CIRCLES,
  featureStyleOf,
  withFeatureStyle,
  type FeatureKind,
  type FeatureStyle,
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
 * ## Every control can be given back
 *
 * A value here is either the designer's or the app's, and the difference is
 * visible: an overridden row carries a `Reset` that clears it rather than
 * writing today's default into the document. That is what keeps "inherited" and
 * "chosen, and happens to match" from collapsing into one state — see the note
 * on `withFeatureStyle`.
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
  const sheet = {
    features: style.features,
    holeNumber: style.holeNumber,
    circles: style.circles,
    lettering: style.lettering,
    palette: style.palette,
  };
  const commit = (next: typeof sheet) => onStyle({ type: 'setStyle', style: next });

  /*
   * Keeping a colour is an edit to the sheet like any other, so it lands on the
   * undo stack and travels with the file. Deduplicated, and capped by the
   * schema — a palette is a shortlist, and one that grew without limit would be
   * a history of every colour anybody tried.
   */
  /* One lettering for the four regulated areas — see `letteringSchema`. */
  const setLettering = (changes: Partial<typeof style.lettering>) =>
    commit({ ...sheet, lettering: { ...style.lettering, ...changes } });
  const clearLettering = (key: keyof typeof style.lettering) => {
    const { [key]: _gone, ...rest } = style.lettering;
    commit({ ...sheet, lettering: rest });
  };

  const keep = (colour: string) => {
    if (style.palette.includes(colour)) return;
    commit({ ...sheet, palette: [...style.palette, colour].slice(-24) });
  };

  if (subject.type === 'holeNumber') {
    const current = style.holeNumber;
    const base = DEFAULT_HOLE_NUMBER;
    const set = (changes: Partial<typeof current>) =>
      commit({ ...sheet, holeNumber: { ...current, ...changes } });
    const clear = (key: keyof typeof current) => {
      const { [key]: _gone, ...rest } = current;
      commit({ ...sheet, holeNumber: rest });
    };

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
            onReset={() => clear('text')}
          />
          <NumberRow
            label="Size"
            value={current.size ?? base.size}
            inherited={current.size === undefined}
            suffix="px"
            step={1}
            onChange={(size) => set({ size })}
            onReset={() => clear('size')}
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
            onReset={() => clear('weight')}
          />
          <NumberRow
            label="Off the shot"
            value={current.offset ?? base.offset}
            inherited={current.offset === undefined}
            suffix="m"
            step={1}
            onChange={(offset) => set({ offset })}
            onReset={() => clear('offset')}
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
          <ColorRow
            label="Colour"
            value={current.disc ?? base.disc ?? '#0e1013'}
            opacity={null}
            inherited={current.disc === undefined}
            palette={style.palette}
            onColor={(disc) => set({ disc })}
            onOpacity={() => undefined}
            onKeep={keep}
            onReset={() => clear('disc')}
          />
          <p className="mt-2 text-2xs leading-4 text-text-muted">
            A number floating over satellite imagery is unreadable over a good fraction of it.
            The disc grows with the numeral, so a bigger number does not outgrow the shape that
            makes it legible.
          </p>
        </div>

        <ResetAllRow
          show={Object.keys(current).length > 0}
          onReset={() => commit({ ...sheet, holeNumber: {} })}
        />
      </>
    );
  }

  if (subject.type === 'circle') {
    const current = style.circles[subject.id] ?? {};
    const base = DEFAULT_CIRCLE_STYLES[subject.id];
    const set = (changes: Partial<typeof current>) =>
      commit({
        ...sheet,
        circles: { ...style.circles, [subject.id]: { ...current, ...changes } },
      });
    const clear = (key: keyof typeof current) => {
      const { [key]: _gone, ...rest } = current;
      commit({ ...sheet, circles: { ...style.circles, [subject.id]: rest } });
    };
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
            onReset={() => clear('stroke')}
          />
          <NumberRow
            label="Width"
            value={current.strokeWidth ?? base.strokeWidth}
            inherited={current.strokeWidth === undefined}
            suffix="px"
            step={0.25}
            onChange={(strokeWidth) => set({ strokeWidth })}
            onReset={() => clear('strokeWidth')}
          />
          <SelectRow
            label="Dash"
            value={current.dash ?? base.dash}
            options={DASH_OPTIONS}
            inherited={current.dash === undefined}
            onChange={(dash) => set({ dash })}
            onReset={() => clear('dash')}
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

        <ResetAllRow
          show={Object.keys(current).length > 0}
          onReset={() => commit({ ...sheet, circles: { ...style.circles, [subject.id]: {} } })}
        />
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
  const clear = (key: keyof FeatureStyle) => {
    const { [key]: _gone, ...rest } = current;
    commit({ ...sheet, features: withFeatureStyle(style, kind, rest).features });
  };

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
          onReset={() => {
            const { stroke: _a, strokeOpacity: _b, ...rest } = current;
            commit({ ...sheet, features: withFeatureStyle(style, kind, rest).features });
          }}
        />
        <NumberRow
          label="Width"
          value={current.strokeWidth ?? base.strokeWidth}
          inherited={current.strokeWidth === undefined}
          suffix="px"
          step={0.25}
          onChange={(strokeWidth) => set({ strokeWidth })}
          onReset={() => clear('strokeWidth')}
        />
        <SelectRow
          label="Dash"
          value={current.dash ?? base.dash}
          options={DASH_OPTIONS}
          inherited={current.dash === undefined}
          onChange={(dash) => set({ dash })}
          onReset={() => clear('dash')}
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
          onReset={() => {
            const { casing: _a, casingOpacity: _b, ...rest } = current;
            commit({ ...sheet, features: withFeatureStyle(style, kind, rest).features });
          }}
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
            onReset={() => {
              const { fill: _a, fillOpacity: _b, ...rest } = current;
              commit({ ...sheet, features: withFeatureStyle(style, kind, rest).features });
            }}
          />
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
            onReset={() => {
              const { secondFill: _a, secondFillOpacity: _b, ...rest } = current;
              commit({ ...sheet, features: withFeatureStyle(style, kind, rest).features });
            }}
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
            onReset={() => clear('lineGap')}
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
            onReset={() => clear('arrowSize')}
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
            onReset={() => clear('shadeOpacity')}
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
            onReset={() => clearLettering('size')}
          />
          <NumberRow
            label="Spacing"
            value={style.lettering.spacing ?? DEFAULT_LETTERING_STYLE.spacingM}
            inherited={style.lettering.spacing === undefined}
            suffix="m"
            step={5}
            onChange={(spacing) => setLettering({ spacing })}
            onReset={() => clearLettering('spacing')}
          />
          <NumberRow
            label="Angle"
            value={style.lettering.angle ?? DEFAULT_LETTERING_STYLE.angle}
            inherited={style.lettering.angle === undefined}
            suffix="°"
            step={5}
            onChange={(angle) => setLettering({ angle })}
            onReset={() => clearLettering('angle')}
          />
          <p className="mt-2 text-2xs leading-4 text-text-muted">
            One setting for out of bounds, hazards, casual areas and required relief — they are
            the same annotation at four different rulings, and lettering that differed between
            them would read as an inconsistency rather than a distinction. What does differ is
            what the letters say, which is the kind&rsquo;s own name, and their colour, which
            follows its line. Spacing is on the ground, so it is a density over the land; the
            grid starts at the middle of each area, so even a small one gets a set.
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
            onReset={() => clear('glyph')}
          />
          <NumberRow
            label="Size"
            value={current.glyphSize ?? base.glyphSize}
            inherited={current.glyphSize === undefined}
            suffix="px"
            step={1}
            onChange={(glyphSize) => set({ glyphSize })}
            onReset={() => clear('glyphSize')}
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

      <ResetAllRow
        show={Object.keys(current).length > 0}
        onReset={() =>
          commit({ ...sheet, features: withFeatureStyle(style, kind, {}).features })
        }
      />
    </>
  );
}

/**
 * Everything this subject has been told, undone at once.
 *
 * Shown only when there is something to undo, because an always-present Reset
 * on an untouched subject is a button that does nothing — and one that reads as
 * dangerous the first time you meet it.
 */
function ResetAllRow({ show, onReset }: { show: boolean; onReset: () => void }) {
  if (!show) return null;
  return (
    <div className={sectionClass}>
      <button
        type="button"
        onClick={onReset}
        className={cn(
          'w-full rounded-md px-2 py-1 text-left text-xs text-text-secondary',
          'transition-colors duration-fast hover:bg-surface-hover hover:text-text-primary',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
        )}
      >
        Reset everything here
      </button>
    </div>
  );
}

/**
 * The style subject, as the right panel's whole contents.
 *
 * A header plus the controls, so the panel takes one node and does not have to
 * know what a style subject is. The header names what is being described and
 * offers the way out, which is the same two jobs it does for a feature.
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
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={cn(
              'ml-auto rounded px-1 text-2xs text-text-muted transition-colors duration-fast',
              'hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
            )}
          >
            Close
          </button>
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
