import { Slider, cn } from '@hyzerlines/design';
import {
  DASHES,
  KIND_DEFINITIONS,
  TARGET_CIRCLES,
  featureStyleOf,
  withFeatureStyle,
  type Dash,
  type FeatureKind,
  type MapStyle,
  type Op,
  type TargetCircleId,
} from '@hyzerlines/core';

import { DEFAULT_FEATURE_STYLES, builtInGlyphsFor, hasGlyph } from '../map/mapStyle';
import { Row, SectionTitle, fieldWidth, rowLabelClass, sectionClass } from './propertyRow';

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

/**
 * A colour well, and the way back to the default.
 *
 * `input type="color"` rather than a picker of our own: it is the control
 * people already know, it returns the hex the schema wants, and building a
 * better one is a project rather than a control. The swatch is the input —
 * styled to the panel's metrics — so the whole thing is one target.
 */
function ColorRow({
  label,
  value,
  inherited,
  onChange,
  onReset,
}: {
  label: string;
  /** The effective colour: the override if there is one, else the default. */
  value: string;
  /** True when that value came from the default rather than from the designer. */
  inherited: boolean;
  onChange: (value: string) => void;
  onReset: () => void;
}) {
  return (
    <Row label={label}>
      <span className="flex items-center gap-1.5">
        {!inherited && <ResetButton onClick={onReset} />}
        <input
          type="color"
          aria-label={label}
          value={normalizeHex(value)}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            'h-6 w-10 cursor-pointer rounded border border-border-subtle bg-transparent p-0.5',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
          )}
        />
      </span>
    </Row>
  );
}

/**
 * `input type="color"` only accepts `#rrggbb`.
 *
 * The schema allows three digits and eight, because a document can carry either
 * and a colour with alpha in it is a real thing to want. Handing one of those to
 * the input makes it silently fall back to black — which reads as the app losing
 * the colour rather than the control refusing to show it.
 */
function normalizeHex(value: string): string {
  if (/^#[0-9a-fA-F]{3}$/.test(value)) {
    const [r, g, b] = [value[1], value[2], value[3]];
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  if (/^#[0-9a-fA-F]{8}$/.test(value)) return value.slice(0, 7);
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#ffffff';
}

function ResetButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Reset to default"
      title="Reset to default"
      className={cn(
        'rounded px-1 text-2xs text-text-muted transition-colors duration-fast',
        'hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
      )}
    >
      Reset
    </button>
  );
}

function NumberRow({
  label,
  value,
  inherited,
  min,
  max,
  step,
  suffix,
  onChange,
  onReset,
}: {
  label: string;
  value: number;
  inherited: boolean;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (value: number) => void;
  onReset: () => void;
}) {
  return (
    <div className="mt-1.5">
      <div className="flex items-center justify-between">
        <span className={rowLabelClass}>{label}</span>
        <span className="flex items-center gap-1.5">
          {!inherited && <ResetButton onClick={onReset} />}
          <span className="text-xs tabular-nums text-text-primary">
            {Math.round(value * 100) / 100}
            {suffix ?? ''}
          </span>
        </span>
      </div>
      <Slider
        label={label}
        value={value}
        min={min}
        max={max}
        step={step}
        // The readout is the row's own, above the track, so the slider's is
        // suppressed rather than printed twice three pixels apart.
        format={() => ''}
        onChange={onChange}
      />
    </div>
  );
}

const DASH_LABELS: Record<Dash, string> = {
  solid: 'Solid',
  dashed: 'Dashed',
  dotted: 'Dotted',
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
  };
  const commit = (next: typeof sheet) => onStyle({ type: 'setStyle', style: next });

  if (subject.type === 'holeNumber') {
    const set = (changes: Partial<typeof style.holeNumber>) =>
      commit({ ...sheet, holeNumber: { ...style.holeNumber, ...changes } });
    const clear = (key: keyof typeof style.holeNumber) => {
      const { [key]: _gone, ...rest } = style.holeNumber;
      commit({ ...sheet, holeNumber: rest });
    };

    return (
      <div className={sectionClass}>
        <SectionTitle>The number, and the disc under it</SectionTitle>
        <ColorRow
          label="Numeral"
          value={style.holeNumber.text ?? '#ffffff'}
          inherited={style.holeNumber.text === undefined}
          onChange={(text) => set({ text })}
          onReset={() => clear('text')}
        />
        <ColorRow
          label="Disc"
          value={style.holeNumber.disc ?? '#0e1013'}
          inherited={style.holeNumber.disc === undefined}
          onChange={(disc) => set({ disc })}
          onReset={() => clear('disc')}
        />
        <NumberRow
          label="Size"
          value={style.holeNumber.size ?? 13}
          inherited={style.holeNumber.size === undefined}
          min={8}
          max={48}
          step={1}
          suffix="px"
          onChange={(size) => set({ size })}
          onReset={() => clear('size')}
        />
        <p className="mt-2 text-2xs leading-4 text-text-muted">
          The disc grows with the numeral, so a bigger number does not outgrow the shape that
          makes it readable.
        </p>
      </div>
    );
  }

  if (subject.type === 'circle') {
    const current = style.circles[subject.id] ?? {};
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
      <div className={sectionClass}>
        <SectionTitle>The ring</SectionTitle>
        <ColorRow
          label="Line"
          value={current.stroke ?? '#ffffff'}
          inherited={current.stroke === undefined}
          onChange={(stroke) => set({ stroke })}
          onReset={() => clear('stroke')}
        />
        <NumberRow
          label="Width"
          value={current.strokeWidth ?? (subject.id === 'c1' ? 1.5 : 1)}
          inherited={current.strokeWidth === undefined}
          min={0}
          max={12}
          step={0.25}
          suffix="px"
          onChange={(strokeWidth) => set({ strokeWidth })}
          onReset={() => clear('strokeWidth')}
        />
        <DashRow
          value={current.dash ?? 'dotted'}
          inherited={current.dash === undefined}
          onChange={(dash) => set({ dash })}
          onReset={() => clear('dash')}
        />
        {circle && (
          <p className="mt-2 text-2xs leading-4 text-text-muted">
            {circle.radiusM} m
            {circle.authority === 'rules'
              ? ' — a figure the rules publish.'
              : ' — league convention, in no PDGA document.'}
          </p>
        )}
      </div>
    );
  }

  const kind = subject.kind;
  const current = featureStyleOf(style, kind);
  const base = DEFAULT_FEATURE_STYLES[kind];
  const geometry = KIND_DEFINITIONS[kind].geometry;

  const set = (changes: Partial<typeof current>) =>
    commit({
      ...sheet,
      features: withFeatureStyle(style, kind, { ...current, ...changes }).features,
    });
  const clear = (key: keyof typeof current) => {
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
          inherited={current.stroke === undefined}
          onChange={(stroke) => set({ stroke })}
          onReset={() => clear('stroke')}
        />
        <ColorRow
          label="Casing"
          value={current.casing ?? base.casing}
          inherited={current.casing === undefined}
          onChange={(casing) => set({ casing })}
          onReset={() => clear('casing')}
        />
        <NumberRow
          label="Width"
          value={current.strokeWidth ?? base.strokeWidth}
          inherited={current.strokeWidth === undefined}
          min={0}
          max={24}
          step={0.25}
          suffix="px"
          onChange={(strokeWidth) => set({ strokeWidth })}
          onReset={() => clear('strokeWidth')}
        />
        <DashRow
          value={current.dash ?? base.dash}
          inherited={current.dash === undefined}
          onChange={(dash) => set({ dash })}
          onReset={() => clear('dash')}
        />
        <p className="mt-2 text-2xs leading-4 text-text-muted">
          The casing is the dark line under the stroke — the contrast floor that keeps a feature
          readable over both canopy and sand. It is the one setting here that can make a map
          unreadable, and the one that makes a light basemap work.
        </p>
      </div>

      {geometry === 'polygon' && (
        <div className={sectionClass}>
          <SectionTitle>Fill</SectionTitle>
          <ColorRow
            label="Colour"
            value={current.fill ?? base.fill}
            inherited={current.fill === undefined}
            onChange={(fill) => set({ fill })}
            onReset={() => clear('fill')}
          />
          <NumberRow
            label="Opacity"
            value={current.fillOpacity ?? base.fillOpacity}
            inherited={current.fillOpacity === undefined}
            min={0}
            max={1}
            step={0.05}
            onChange={(fillOpacity) => set({ fillOpacity })}
            onReset={() => clear('fillOpacity')}
          />
        </div>
      )}

      {hasGlyph(kind) && (
        <div className={sectionClass}>
          <SectionTitle>Marker</SectionTitle>
          <Row label="Drawing">
            <span className="flex items-center gap-1.5">
              {current.glyph !== undefined && <ResetButton onClick={() => clear('glyph')} />}
              <select
                aria-label="Marker drawing"
                value={current.glyph ?? base.glyph}
                onChange={(e) => set({ glyph: e.target.value })}
                className={cn(
                  'h-6 rounded border border-border-subtle bg-surface-sunken px-1 text-xs text-text-primary',
                  fieldWidth,
                  'truncate',
                )}
              >
                {builtInGlyphsFor(kind).map((name) => (
                  <option key={name} value={name}>
                    {glyphLabel(name)}
                  </option>
                ))}
                {style.glyphs.map((glyph) => (
                  <option key={glyph.id} value={glyph.id}>
                    {glyph.name}
                  </option>
                ))}
              </select>
            </span>
          </Row>
          <NumberRow
            label="Size"
            value={current.glyphSize ?? base.glyphSize}
            inherited={current.glyphSize === undefined}
            min={8}
            max={96}
            step={1}
            suffix="px"
            onChange={(glyphSize) => set({ glyphSize })}
            onReset={() => clear('glyphSize')}
          />
          {kind === 'mando' && (
            <p className="mt-2 text-2xs leading-4 text-text-muted">
              A mandatory has a drawing for each side. Picking one of the built-in pair picks
              both; an uploaded drawing is used for both sides, and the line says which side you
              must pass.
            </p>
          )}
        </div>
      )}
    </>
  );
}

/** Built-in glyph names, as something a person would say. */
function glyphLabel(name: string): string {
  const labels: Record<string, string> = {
    basketFill: 'Basket, solid',
    basket: 'Basket, outline',
    teePad: 'Pad',
    tee: 'Pad, lettered',
    dropzone: 'Drop zone',
    mandoLeft: 'Mandatory, pointing',
    mandoRight: 'Mandatory, pointing',
  };
  return labels[name] ?? name;
}

function DashRow({
  value,
  inherited,
  onChange,
  onReset,
}: {
  value: Dash;
  inherited: boolean;
  onChange: (dash: Dash) => void;
  onReset: () => void;
}) {
  return (
    <Row label="Dash">
      <span className="flex items-center gap-1.5">
        {!inherited && <ResetButton onClick={onReset} />}
        <select
          aria-label="Dash"
          value={value}
          onChange={(e) => onChange(e.target.value as Dash)}
          className={cn(
            'h-6 rounded border border-border-subtle bg-surface-sunken px-1 text-xs text-text-primary',
            fieldWidth,
          )}
        >
          {DASHES.map((dash) => (
            <option key={dash} value={dash}>
              {DASH_LABELS[dash]}
            </option>
          ))}
        </select>
      </span>
    </Row>
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
