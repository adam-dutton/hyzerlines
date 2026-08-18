import { cn } from '../cn.js';

/**
 * A continuous setting, taking effect as it moves.
 *
 * Native `input[type="range"]` for the same reason `selectClass` uses a native
 * `<select>`: keyboard stepping, Home/End, page keys, touch dragging and the
 * platform's own pointer handling all arrive for free, and every one of them is
 * worse in a hand-rolled replacement. What is styled here is only the track and
 * the thumb.
 *
 * ## The value is shown, always
 *
 * A slider with no readout is a control you can only set by eye, which is fine
 * for volume and wrong for anything a designer might want to reproduce. The
 * caller supplies `format`, because only it knows whether the number is a
 * percentage, a count of levels, or metres.
 *
 * ## Disabled rather than hidden
 *
 * These sit under the switch that governs them and stay in place when it is
 * off, so the group keeps its shape and you can see what turning it back on
 * would restore — the same rule `ToggleRow`'s `indent` follows.
 */
export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  disabled = false,
  format,
  onChange,
}: {
  /** Accessible name. The visible label is the caller's business. */
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  /** The value as the reader should see it, e.g. `60%` or `Off`. */
  format: (value: number) => string;
  onChange: (next: number) => void;
}) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <input
        type="range"
        aria-label={label}
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className={cn(
          // A 3px track with an 11px thumb, per the kit. The track is a hairline
          // the value sits on rather than a groove the value fills.
          'h-[3px] w-20 cursor-pointer appearance-none rounded-full bg-surface-active',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
          disabled && 'pointer-events-none opacity-40',
          /*
           * The thumb needs both vendor pseudo-elements: they cannot be
           * combined into one selector, because a rule listing a pseudo-element
           * a browser does not recognise is dropped whole — so `-webkit-` and
           * `-moz-` in the same block would leave Firefox with no thumb at all.
           */
          '[&::-webkit-slider-thumb]:h-[11px] [&::-webkit-slider-thumb]:w-[11px]',
          '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full',
          '[&::-webkit-slider-thumb]:bg-accent-solid',
          '[&::-moz-range-thumb]:h-[11px] [&::-moz-range-thumb]:w-[11px]',
          '[&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:rounded-full',
          '[&::-moz-range-thumb]:bg-accent-solid',
        )}
      />
      {/*
        Fixed width and tabular figures, so the track does not shift sideways as
        the number under it changes width mid-drag.

        Not `font-mono`, though. These readouts are as often a word as a number
        — "Off", "Sharp" — and in a monospaced face a capital O is barely
        distinguishable from a zero, so "Off" reads as "0ff". `tabular-nums`
        alone gives the fixed digit widths that stop the shifting, without
        making the words worse.
      */}
      <span
        className={cn(
          'w-12 shrink-0 text-right text-2xs tabular-nums',
          disabled ? 'text-text-disabled' : 'text-text-secondary',
        )}
      >
        {format(value)}
      </span>
    </span>
  );
}
