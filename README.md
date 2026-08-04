# Hyzerlines

Design disc golf courses on real terrain, in a browser. Free, open source, and
usable without an account.

Point it at a piece of land, draw tees and baskets on satellite imagery, and get
real measurements — distances, elevation, par suggestions, safety envelopes —
instead of shapes on a screenshot.

> **Status: early.** You can draw a course, measure it, and get PDGA par and
> design checks against it. Terrain, flight modelling and sharing are still
> ahead. See [`docs/PLAN.md`](docs/PLAN.md) for what is built and what is coming.

## Running it

```bash
pnpm install
pnpm dev          # http://localhost:5173
```

Other commands:

```bash
pnpm build        # typecheck + production build
pnpm typecheck
pnpm lint
pnpm format
pnpm tokens       # regenerate the design-token CSS
```

Node 22+ and pnpm 10+.

## How the repo is laid out

```
apps/web           the application
packages/core      document model, geometry, PDGA data, rules engine
packages/design    design tokens, theming, keyboard registry
docs/PLAN.md       roadmap and design decisions
docs/PDGA.md       transcription record for every PDGA figure used
```

### The design system comes first

Everything visual derives from `packages/design/src/tokens/`. Those TypeScript
files are the single source of truth; `pnpm tokens` compiles them into the CSS
custom properties and Tailwind theme the app consumes.

Tailwind's stock palette is switched off — `bg-slate-800` does not exist here. If
a value is not a token, it is not available, which is what keeps the interface
coherent as it grows and makes a future Figma-driven restyle a token change
rather than a rewrite.

Three tiers, and the boundary between them matters:

| Tier          | Example                        | Who uses it                             |
| ------------- | ------------------------------ | --------------------------------------- |
| **primitive** | `neutral-900`, `accent-500`    | Only the semantic tier.                 |
| **semantic**  | `surface-raised`, `text-muted` | Components. Flips between themes.       |
| **feature**   | `feature-ob-stroke`            | Map geometry. Identical in both themes. |

Feature colors are deliberately theme-independent: they sit on satellite
imagery, not on chrome. Each one carries a dark `casing` drawn beneath its
stroke, which is what keeps a fairway line legible over both tree canopy and
sand.

### Dark first

The map is dark and occupies most of the viewport, so the dark theme is the
designed default rather than a fallback. Light is opt-in via the toggle
(`⇧D`) — useful in direct sunlight — and is never applied automatically from the
OS preference.

### PDGA figures are transcribed, never remembered

Par bands, tee pad minimums, hole and course length ranges and throw distances all
come from the published PDGA course design documents. Every one is transcribed in
`packages/core/src/pdga.ts` against the page and sentence it came from, and the
full record — including the metric tables, the places two documents disagree, and
what is deliberately absent — is in [`docs/PDGA.md`](docs/PDGA.md).

**If a figure is not in a source document, it is not in the code.** A designer may
take a dimension from this tool to a parks department, a landowner or an insurer,
and an invented number is worse than a missing one because it cannot be told apart
from a correct one. There is no safety separation distance in here, for exactly
that reason: the PDGA does not publish one.

Checks are advisory and every one is dismissible. `packages/core/src/pdga.test.ts`
restates the published figures independently of the tables the code reads, so a
typo fails the build.

Hyzerlines is not affiliated with or endorsed by the PDGA.

### Keyboard model

Every shortcut is declared once, in `packages/design/src/keymap.ts`. Tooltips,
the help overlay (`?`) and the actual key handling all read from that registry,
so a displayed shortcut cannot drift from the one that fires.

Navigation follows the model every design tool already uses:

|            | Key                  | Cursor             | Drag does                          |
| ---------- | -------------------- | ------------------ | ---------------------------------- |
| **Select** | `V`                  | arrow              | nothing to the camera              |
| **Move**   | `H`, or hold `Space` | grab / grabbing    | pans                               |
| **Zoom**   | hold `Z`             | zoom-in / zoom-out | zooms to the region; `Alt` inverts |

Dragging only pans with the Move tool, so the map cannot slide out from under a
tee you are placing. `Space` is always one key away, which is what makes that
affordable.

Tool keys (`T` tee, `B` basket, `O` out of bounds…) place features.

## Contributing

Issues and pull requests are welcome. CI runs format, lint, typecheck and build
on every PR; `pnpm format && pnpm lint && pnpm build` locally covers the same
ground.

## License

[AGPL-3.0-or-later](LICENSE).

You can use, modify, self-host and redistribute this freely. The one condition
that matters: if you run a modified version as a network service, you have to
offer your users its source. That is deliberate — it keeps the project from
being closed up and resold as a hosted product, while leaving self-hosting and
forking wide open.
