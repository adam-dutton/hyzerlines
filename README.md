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
docs/MODEL.md      what a course document is, and how it migrates
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

Par bands, tee pad minimums, hole and course length ranges, throw distances and
the circles around a target all come from the published PDGA documents — the five
course design guides plus the Rules of Play. Every one is transcribed in
`packages/core/src/pdga.ts` against the page and sentence it came from, and the
full record — including the metric tables, the places two documents disagree, and
what is deliberately absent — is in [`docs/PDGA.md`](docs/PDGA.md).

**If a figure is not in a source document, it is not in the code.** A designer may
take a dimension from this tool to a parks department, a landowner or an insurer,
and an invented number is worse than a missing one because it cannot be told apart
from a correct one. There is no safety separation distance in here, for exactly
that reason: the PDGA does not publish one.

Where a figure is _nearly_ official, the app says so rather than rounding up. The
three rings drawn around a target have three different provenances — Circle 1 at
10 m is a rule, Circle 2 at 20 m is a real figure the rules use for pace of play
rather than as a circle, and the 3 m bullseye is league convention that appears in
no PDGA document at all. Each is labelled with which it is.

The same discipline applies to shapes. The fairway corridor drawn around a
centreline runs from the tee pad's own width to Circle 1's 10 m at the target —
two published figures — but **the taper between them is the app's, not the
PDGA's**, which publishes no fairway width at all. It is a drawing aid anchored to
real numbers, said in exactly those words in
[`docs/PDGA.md`](docs/PDGA.md#derived-geometry--what-is-sourced-and-what-is-ours),
and every width it produces is overridable.

Checks are advisory and every one is dismissible. `packages/core/src/pdga.test.ts`
restates the published figures independently of the tables the code reads, so a
typo fails the build.

Hyzerlines is not affiliated with or endorsed by the PDGA.

### The course model

A hole with three tees and three pin positions is nine different shots, so
measurement lives on the **pair** — one tee to one target — rather than on the
hole. How the course is _played_ is a **layout**: an ordered sequence that can
skip a hole or play one twice. Skill level is read from tee colours, never stored
on the course.

[`docs/MODEL.md`](docs/MODEL.md) is the full reference, including how version 1
documents migrate.

### Shapes the file does not contain

A tee is stored as a point, but a tee is a pad. A fairway is stored as a line,
but a fairway is ground you can land on. Both second shapes are computed from the
first on every render and never written back — a stored polygon stays correct
until somebody drags the point it came from.

The pad extends _backwards_ from its point, because the point is the front centre:
that is the tee line, and the tee line is where hole length is measured from.
Anchoring at the middle of the pad instead would add half a pad length to every
hole on the course, invisibly.

All of it is computed in metres on a local tangent plane rather than in degrees.
Offsetting a line in degrees gives you a corridor 40% fatter north-to-south than
east-to-west at Minneapolis latitude — the same error that makes Web Mercator
distances wrong, except this one you can see.

### Keyboard model

Every shortcut is declared once, in `packages/design/src/keymap.ts`. Tooltips,
the help overlay (`?`) and the actual key handling all read from that registry,
so a displayed shortcut cannot drift from the one that fires.

|            | Key      | Cursor                       | Drag does                          |
| ---------- | -------- | ---------------------------- | ---------------------------------- |
| **Select** | `V`      | arrow, `move` while dragging | pans                               |
| **Zoom**   | hold `Z` | zoom-in / zoom-out           | zooms to the region; `Alt` inverts |

A plain drag pans, from every tool except Zoom — there is no pan tool and no
modifier to reach for. Wheel zoom anchors to the pointer, and opening a course
frames what is drawn rather than restoring wherever you last stopped scrolling.

Tool keys (`T` tee, `B` basket, `O` out of bounds…) place features. Select a line
or an area and it grows handles: drag one to move a vertex, click a hollow one
between two vertices to insert, `Alt`-click to remove.

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
