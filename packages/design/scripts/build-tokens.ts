/**
 * Emits the token layer as CSS.
 *
 * This is the seam that keeps design and code from drifting: tokens are authored
 * once in TypeScript, and everything downstream is generated. Tailwind's theme is
 * built *from* these tokens rather than alongside them, so there is no default
 * palette to accidentally reach for — `bg-slate-800` simply does not exist in
 * this app. If a value isn't a token, it isn't available.
 *
 * Output: dist/theme.css
 *
 *   :root                      dark semantic values (the default)
 *   :root[data-theme=light]    light overrides
 *   @theme                     primitives + dimensional scales -> utilities
 *   @theme inline              semantic aliases -> theme-reactive utilities
 *
 * Run: pnpm --filter @hyzerlines/design build
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { tokens } from '../src/tokens/index.js';
import { semantic, feature, primitive } from '../src/tokens/color.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../dist/theme.css');

/** `surface.raised` -> `surface-raised` */
const flat = (key: string): string => key.replace(/\./g, '-');

const lines: string[] = [];
const push = (s = ''): void => void lines.push(s);

push('/*');
push(' * GENERATED FILE - do not edit.');
push(' * Source: packages/design/src/tokens/*.ts');
push(' * Regenerate: pnpm tokens');
push(' */');
push();

// ---------------------------------------------------------------------------
// Semantic colors as raw custom properties, so they can flip per theme.
// ---------------------------------------------------------------------------
push('/* Semantic roles. Dark is the default theme, not a fallback: Hyzerlines is');
push('   designed dark-first because the map underneath it is dark. Light is opt-in');
push('   via the toggle (useful in direct sun) and is never applied automatically. */');
push(':root {');
for (const [key, value] of Object.entries(semantic.dark)) {
  push(`  --hz-${flat(key)}: ${value};`);
}
push('}');
push();

push(':root[data-theme="light"] {');
for (const [key, value] of Object.entries(semantic.light)) {
  push(`  --hz-${flat(key)}: ${value};`);
}
push('}');
push();

// ---------------------------------------------------------------------------
// Feature colors. Theme-independent by design - see color.ts.
// ---------------------------------------------------------------------------
push('/* Map feature colors. Identical across themes: these sit on imagery, not chrome. */');
push(':root {');
for (const [kind, colors] of Object.entries(feature)) {
  for (const [role, value] of Object.entries(colors)) {
    push(`  --hz-feature-${kind}-${role}: ${value};`);
  }
}
push('}');
push();

// ---------------------------------------------------------------------------
// Z-index scale.
// ---------------------------------------------------------------------------
push(':root {');
for (const [name, value] of Object.entries(tokens.zIndex)) {
  push(`  --hz-z-${name}: ${value};`);
}
push('}');
push();

// ---------------------------------------------------------------------------
// Tailwind theme: primitives and dimensional scales generate utilities.
// ---------------------------------------------------------------------------
push('@theme {');
push("  /* Reset Tailwind's stock palette. Only Hyzerlines tokens exist. */");
push('  --color-*: initial;');
push('  --font-*: initial;');
push('  --text-*: initial;');
push('  --radius-*: initial;');
push('  --shadow-*: initial;');
push('  --ease-*: initial;');
push();

push('  /* Primitive color scales */');
for (const [family, scale] of Object.entries(primitive)) {
  for (const [step, value] of Object.entries(scale)) {
    push(`  --color-${family}-${step}: ${value};`);
  }
}
push('  --color-transparent: transparent;');
push('  --color-current: currentColor;');
push();

push('  /* Spacing */');
for (const [name, value] of Object.entries(tokens.space)) {
  push(`  --spacing-${name.replace('.', '_')}: ${value};`);
}
push();

push('  /* Radius */');
for (const [name, value] of Object.entries(tokens.radius)) {
  push(`  --radius-${name}: ${value};`);
}
push();

push('  /* Type */');
for (const [name, value] of Object.entries(tokens.font)) {
  push(`  --font-${name}: ${value};`);
}
for (const [name, entry] of Object.entries(tokens.fontSize)) {
  const [size, meta] = entry as [string, { lineHeight: string; letterSpacing?: string }];
  push(`  --text-${name}: ${size};`);
  push(`  --text-${name}--line-height: ${meta.lineHeight};`);
  if (meta.letterSpacing) push(`  --text-${name}--letter-spacing: ${meta.letterSpacing};`);
}
for (const [name, value] of Object.entries(tokens.fontWeight)) {
  push(`  --font-weight-${name}: ${value};`);
}
push();

push('  /* Elevation */');
for (const [name, value] of Object.entries(tokens.shadow)) {
  push(`  --shadow-${name}: ${value};`);
}
push();

push('  /* Motion */');
for (const [name, value] of Object.entries(tokens.duration)) {
  push(`  --duration-${name}: ${value};`);
}
for (const [name, value] of Object.entries(tokens.easing)) {
  push(`  --ease-${name}: ${value};`);
}
push('}');
push();

// ---------------------------------------------------------------------------
// `inline` matters here: it makes utilities resolve the var at use time rather
// than baking the value in, which is what lets one class react to the theme.
// ---------------------------------------------------------------------------
push('@theme inline {');
push('  /* Semantic roles -> theme-reactive utilities (bg-surface-raised, text-muted, ...) */');
for (const key of Object.keys(semantic.dark)) {
  push(`  --color-${flat(key)}: var(--hz-${flat(key)});`);
}
push();
push('  /* Map features -> feature-tee-stroke, feature-ob-fill, ... */');
for (const [kind, colors] of Object.entries(feature)) {
  for (const role of Object.keys(colors)) {
    push(`  --color-feature-${kind}-${role}: var(--hz-feature-${kind}-${role});`);
  }
}
push('}');
push();

// ---------------------------------------------------------------------------
// Motion accessibility. Enforced centrally so no component can forget it.
// ---------------------------------------------------------------------------
push('/* Reduced motion is enforced at the token level: durations collapse to zero,');
push('   so every animation built on motion tokens complies without opting in. */');
push('@media (prefers-reduced-motion: reduce) {');
push('  :root {');
for (const name of Object.keys(tokens.duration)) {
  push(`    --duration-${name}: 0ms;`);
}
push('  }');
push('}');
push();

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, lines.join('\n'), 'utf8');

const bytes = Buffer.byteLength(lines.join('\n'));
console.log(`tokens -> ${OUT} (${lines.length} lines, ${bytes} bytes)`);
