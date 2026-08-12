import { useRef } from 'react';
import { cn } from '@hyzerlines/design';
import {
  FEATURE_KINDS,
  KIND_DEFINITIONS,
  TARGET_CIRCLES,
  featureStyleOf,
  isDefaultStyle,
  resetStyle,
  type FeatureKind,
  type MapStyle,
  type Op,
} from '@hyzerlines/core';

import { DEFAULT_FEATURE_STYLES } from '../map/mapStyle';
import { glyphFromSvg } from '../style/glyphFromSvg';
import { subjectKey, type StyleSubject } from './StyleProperties';

/**
 * Everything on the map that can be restyled, as a list.
 *
 * The same shape as the feature list one focus over, and deliberately: this is
 * the left column doing the job it always does — listing what is in scope so the
 * right panel can describe one of them. Picking a kind here is the same gesture
 * as picking a feature there.
 *
 * ## It lists kinds, not features
 *
 * A stylesheet is about how *every* out-of-bounds area is drawn, not about one
 * of them. Per-feature overrides are a real thing to want later and would go
 * on the feature, beside its label and its tags — but they would be exceptions
 * to this, and a list that mixed the rule with its exceptions would make
 * neither legible.
 *
 * Each row previews what it is describing rather than naming a colour, because
 * a swatch answers "which one is the OB line" in a way `#ff6b64` does not.
 */

/** The sheet `setStyle` carries: everything but the glyph library. */
const resetSheet = (style: MapStyle) => {
  const { glyphs: _keep, ...sheet } = resetStyle(style);
  return sheet;
};

/** A line of the drawing, at the weight and colour it is drawn at. */
function Swatch({ kind, style }: { kind: FeatureKind; style: MapStyle }) {
  const base = DEFAULT_FEATURE_STYLES[kind];
  const over = featureStyleOf(style, kind);
  const stroke = over.stroke ?? base.stroke;
  const width = Math.min(over.strokeWidth ?? base.strokeWidth, 6);
  const dash = over.dash ?? base.dash;
  const fill = over.fill ?? base.fill;
  const fillOpacity = over.fillOpacity ?? base.fillOpacity;
  const isArea = KIND_DEFINITIONS[kind].geometry === 'polygon';

  return (
    <svg width="22" height="14" viewBox="0 0 22 14" aria-hidden="true" className="shrink-0">
      {/* A dark ground, because these colours are drawn over imagery and a
          white line on the panel's own surface would read as invisible. */}
      <rect x="0" y="0" width="22" height="14" rx="2" fill="#11161a" />
      {isArea && (
        <rect
          x="2.5"
          y="2.5"
          width="17"
          height="9"
          fill={fill}
          fillOpacity={fillOpacity}
          stroke={stroke}
          strokeWidth={width}
          strokeDasharray={dash === 'solid' ? undefined : dash === 'dashed' ? '3 1.5' : '1 2'}
        />
      )}
      {!isArea && (
        <path
          d="M2.5 10.5 L 9 4 L 13 10 L 19.5 3.5"
          fill="none"
          stroke={stroke}
          strokeWidth={width}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={dash === 'solid' ? undefined : dash === 'dashed' ? '3 1.5' : '1 2'}
        />
      )}
    </svg>
  );
}

function SubjectRow({
  label,
  selected,
  overridden,
  onSelect,
  children,
}: {
  label: string;
  selected: boolean;
  /** Whether the designer has said anything about it, rather than inherited. */
  overridden: boolean;
  onSelect: () => void;
  children?: React.ReactNode;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className={cn(
          'flex w-full items-center gap-2 rounded px-2 py-1 text-left',
          'transition-colors duration-fast',
          selected ? 'bg-surface-selected text-text-primary' : 'hover:bg-surface-hover',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
        )}
      >
        {children}
        <span className="min-w-0 flex-1 truncate text-xs text-text-primary">{label}</span>
        {/*
          A dot, not the word "custom". The list is scanned to find the one
          thing you changed, and a column of words is harder to scan than a
          column with one mark in it.
        */}
        {overridden && (
          <span
            className="size-1.5 shrink-0 rounded-full bg-accent-solid"
            aria-label="Customised"
          />
        )}
      </button>
    </li>
  );
}

export function StyleList({
  style,
  subject,
  onSelectSubject,
  onOp,
}: {
  style: MapStyle;
  subject: StyleSubject | null;
  onSelectSubject: (subject: StyleSubject) => void;
  onOp: (op: Op) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const selectedKey = subject ? subjectKey(subject) : null;

  const upload = async (file: File) => {
    const result = glyphFromSvg(file.name, await file.text());
    if (!result.ok) {
      /*
       * A native alert, and deliberately the crudest thing here.
       *
       * A bad upload is rare, always the designer's own file, and always fixed
       * outside this app — so what it needs is the reason, immediately, in a
       * place that cannot be missed. A toast system built for this one message
       * would be a component nobody else uses.
       */
      window.alert(result.error);
      return;
    }
    onOp({ type: 'addGlyph', glyph: result.glyph });
  };

  const touched = !isDefaultStyle(style);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2.5">
      {/*
        Everything back to the defaults, at once.
        
        The uploaded glyphs and the palette survive it, and that is deliberate:
        they are the designer's *materials* rather than their decisions. "Put
        this course back to how it arrived" should not throw away the drawings
        they imported and the colours they collected on the way — and it is one
        undo, so the cost of being wrong about it is a keystroke.
      */}
      {touched && (
        <div className="px-2 pt-1">
          <button
            type="button"
            onClick={() => onOp({ type: 'setStyle', style: resetSheet(style) })}
            className={cn(
              'w-full rounded-md px-2 py-1 text-left text-2xs text-text-muted',
              'transition-colors duration-fast hover:bg-surface-hover hover:text-text-primary',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
            )}
          >
            Reset the whole style
          </button>
        </div>
      )}

      <section className="mt-1">
        <h3 className="px-2 pb-0.5 pt-1 text-[10px] text-text-muted">Features</h3>
        <ul>
          {FEATURE_KINDS.map((kind) => (
            <SubjectRow
              key={kind}
              label={KIND_DEFINITIONS[kind].label}
              selected={selectedKey === `kind:${kind}`}
              overridden={Object.keys(featureStyleOf(style, kind)).length > 0}
              onSelect={() => onSelectSubject({ type: 'kind', kind })}
            >
              <Swatch kind={kind} style={style} />
            </SubjectRow>
          ))}
        </ul>
      </section>

      <section className="mt-2">
        <h3 className="px-2 pb-0.5 pt-1 text-[10px] text-text-muted">Annotation</h3>
        <ul>
          <SubjectRow
            label="Hole numbers"
            selected={selectedKey === 'holeNumber'}
            overridden={Object.keys(style.holeNumber).length > 0}
            onSelect={() => onSelectSubject({ type: 'holeNumber' })}
          />
          {TARGET_CIRCLES.map((circle) => (
            <SubjectRow
              key={circle.id}
              label={circle.label}
              selected={selectedKey === `circle:${circle.id}`}
              overridden={Object.keys(style.circles[circle.id] ?? {}).length > 0}
              onSelect={() => onSelectSubject({ type: 'circle', id: circle.id })}
            />
          ))}
        </ul>
      </section>

      {/*
        The glyph library is a list of things rather than a subject with
        properties, so it sits here rather than in the right panel. Uploading
        one adds it to every marker picker at once — a drawing is a drawing,
        and deciding in advance that it is "a basket glyph" would be the app
        choosing for the designer.
      */}
      <section className="mt-2">
        <h3 className="flex items-center justify-between px-2 pb-0.5 pt-1 text-[10px] text-text-muted">
          Your glyphs
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="rounded px-1 text-[10px] text-text-muted transition-colors duration-fast hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            Upload SVG
          </button>
        </h3>
        <input
          ref={fileRef}
          type="file"
          accept=".svg,image/svg+xml"
          aria-label="Upload a glyph"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            // Cleared so choosing the same file twice fires again — a designer
            // fixing their artwork and re-uploading it is the common case.
            e.target.value = '';
            if (file) void upload(file);
          }}
        />
        {style.glyphs.length === 0 ? (
          <p className="px-2 pb-1 pt-0.5 text-2xs leading-4 text-text-muted">
            Nothing uploaded. An SVG&rsquo;s paths are kept and everything else in the file is
            discarded, so what arrives is the drawing and only the drawing.
          </p>
        ) : (
          <ul>
            {style.glyphs.map((glyph) => (
              <li key={glyph.id} className="flex items-center gap-2 px-2 py-1">
                <svg
                  width="16"
                  height="16"
                  viewBox={glyph.viewBox.join(' ')}
                  fill="currentColor"
                  aria-hidden="true"
                  className="shrink-0 text-text-secondary"
                >
                  {glyph.paths.map((d) => (
                    <path key={d} d={d} />
                  ))}
                </svg>
                <span className="min-w-0 flex-1 truncate text-xs text-text-primary">
                  {glyph.name}
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${glyph.name}`}
                  onClick={() => onOp({ type: 'removeGlyph', id: glyph.id })}
                  className="rounded px-1 text-2xs text-text-muted transition-colors duration-fast hover:text-status-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
