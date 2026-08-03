# Hyzerlines — plan

A public, open-source web app for designing disc golf courses on real terrain.
Free to use, no account required, funded by donations.

This document is the roadmap and the record of decisions behind it. It is kept
current as PRs land.

---

## Principles

1. **The canvas is the product.** Chrome floats over the map and never displaces
   it. Opening a panel must not reflow the map — losing your place mid-measurement
   is the difference between a tool and a toy.
2. **Numbers must be true.** All geometry is metric internally; unit conversion
   happens only at the display boundary. Precision is never overstated.
3. **Design system before features.** Tokens are the single source of truth, and
   Tailwind's theme is generated from them. There is no untokenized value.
4. **Dark first.** The map is dark; the interface is designed for that, and light
   is an explicit opt-in.
5. **Keyboard first.** One registry declares every shortcut. Displayed keys and
   fired keys cannot diverge.
6. **Anonymous first.** Land on the URL and start working within seconds. Accounts
   exist only for sync, sharing and publishing.
7. **Advisory, never prescriptive.** PDGA checks and par suggestions inform the
   designer. Every one of them is overridable, and overrides are never
   silently reverted.

---

## Roadmap

| PR     | Scope                                                                              | Status  |
| ------ | ---------------------------------------------------------------------------------- | ------- |
| **0**  | Monorepo, design tokens + theming, app shell, MapLibre, keyboard registry, CI      | ✅ done |
| **1**  | Design system: Radix primitives, panel/inspector/tool patterns, component library  | next    |
| **2**  | Document model, zod schemas, `applyOp` store, undo/redo, IndexedDB, `.hyzer` files |         |
| **3**  | Drawing engine, full feature palette, schema-driven inspector                      |         |
| **4**  | Hole workflow, layouts, distances, auto-par, PDGA advisory checks                  |         |
| **5**  | Terrain: DEM sampling, elevation profiles, hillshade                               |         |
| **6**  | Parametric flight model, shot editor, disc database                                |         |
| **7**  | Safety: dispersion envelopes, overlap and proximity rules                          |         |
| **8**  | Accounts, share links, published course pages (backend begins here)                |         |
| **9**  | Exports: PDF/PNG maps, tee signs, punch lists                                      |         |
| **10** | KML/KMZ interop                                                                    |         |
| **11** | Terrain 2: contours, slope analysis, LiDAR, custom DEM upload                      |         |
| **12** | Offline/PWA, tile caching                                                          |         |
| **13** | Field mode: touch targets, GPS, geotagged photos                                   |         |
| **14** | Donations, public gallery, self-host via docker-compose                            |         |

Sharing sits at PR 8 rather than the end because a published, linkable course
page is the growth loop — it is how a designer shows a parks department and how a
club shows its players.

---

## PR 0 — what landed

**Monorepo.** pnpm workspaces, TypeScript strict (including
`noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`), ESLint, Prettier,
GitHub Actions running format → lint → typecheck → build.

**Design tokens** (`packages/design`). Authored in TypeScript, compiled to CSS by
`pnpm tokens`. Three tiers — primitive, semantic, feature. Tailwind's default
palette is reset to `initial`, so the only colors, spacing, type, shadows and
motion values that exist are the ones in the token files.

Notable decisions encoded there:

- **Feature casings.** Every map vector carries a dark outline beneath its
  stroke. No single stroke color survives the range from tree canopy to snow;
  the casing gives a guaranteed contrast floor. Dropping it makes features
  disappear over roughly a third of real basemaps.
- **Tabular numerals** on all measurements. Distance readouts update continuously
  while dragging, and proportional digits make them jitter.
- **Reduced motion at the token level.** `prefers-reduced-motion` collapses every
  duration token to `0ms`, so animations comply without opting in.
- **Shadows carry a ring.** A pure blur vanishes against a busy satellite tile.

**App shell.** MapLibre with Esri imagery (default), Esri topo, and OSM — all
keyless, so the app works on first load with no signup and no billing
relationship. The map instance is created once and never torn down; basemap
switches swap the style in place so the camera and future editing state survive.

**Chrome.** Inline-editable course name, theme toggle, basemap segmented control,
zoom and bearing controls, an adaptive scale bar, live coordinates, a units
toggle, and attribution.

The tool rail is deliberately absent until PR 3. Shipping a palette of disabled
buttons communicates a roadmap at the cost of making the product look broken; the
tool _keys_ are reserved in the registry instead.

**Keyboard registry.** All shortcuts declared in one file. The help overlay (`?`)
is generated from it, so it cannot go stale.

**Onboarding.** The entire first-run experience is one search box: find your
land, the map flies there. Geocoding is Photon (keyless, CORS-enabled), and
pasted coordinates work without any network call, so search failure never
blocks.

---

## Licensing

**AGPL-3.0-or-later.** The project is donation-funded and publicly hosted, and
the AGPL's section 13 is the specific reason for the choice: anyone may
self-host, fork or modify, but running a modified version as a network service
obliges you to offer users the source. That keeps a company from taking
donor-funded work closed and reselling it as a hosted product.

Section 13 also imposes an obligation on _us_: the running app must offer its
source to users. That is the "Source" link in the status bar — compliance, not
decoration. Do not remove it.

---

## Design system (PR 1)

```
packages/design/
├─ tokens/        ✅ color, space, type, radius, elevation, motion, z-index
├─ primitives/    Radix-wrapped: Dialog, Popover, Menu, Slider, Tooltip,
│                 Toggle, Select, Tabs, Toast — accessible behavior, no styling
├─ components/    Panel, Inspector, ToolButton, Field, NumericInput, Swatch,
│                 Segmented, MeasureBadge, EmptyState
└─ patterns/      map-specific: floating panels, the tool rail, measurement
                  readouts, snap indicators
```

Radix supplies focus traps, roving tabindex and ARIA wiring — the parts that are
tedious to get right and unacceptable to get wrong. It ships no visual opinion,
so there is nothing to fight.

The `ShortcutsOverlay` in PR 0 hand-rolls focus and Escape handling; it moves to
Radix `Dialog` in PR 1.

### Delight, specifically

Not generic polish — the things that make _this_ tool feel alive:

- Distance and elevation update live on the badge while dragging a basket, not
  after the drop.
- Flight paths draw on with an easing curve. You see the shot happen.
- Magnetic snapping to centerlines, tee headings and existing geometry, with a
  visible snap indicator.
- The inspector is one surface generated from the property schema — never a
  different layout per feature type.

### Accessibility

Non-negotiable, treated as requirements rather than cleanup: WCAG AA contrast,
full keyboard operability of the map editor itself, visible focus everywhere,
and `prefers-reduced-motion` respected throughout.

Performance is part of this: 60 fps pan and zoom with a few thousand features,
sub-100 ms tool switches. A map that stutters feels broken regardless of how it
looks.

---

## PDGA standards (PR 4)

Encoded as a **versioned ruleset file**, not hardcoded conditionals, so standards
can be updated without a code change and clubs can layer on local rules.

```jsonc
// rulesets/pdga-course-design.json
{
  "id": "...",
  "title": "...",
  "source": "...",
  "appliesTo": "...",
  "severity": "...",
  "check": "...",
  "message": "...",
  "docUrl": "...",
}
```

Checks run live against the document and surface alongside safety warnings: hole
length ranges by par, tee pad dimensions and surface, fairway corridor width,
target specifications, tee sign content, safety separation, multi-tee and
multi-pin recommendations.

Every violation cites its source and links to the PDGA document, and every one is
dismissible per-course with a reason. Designers break guidelines deliberately and
the tool should not nag.

The current PDGA course design documents will be sourced when this ships — the
ruleset carries a `source` and revision date so it stays auditable rather than
depending on anyone's recollection of the numbers.

## Auto-par (PR 4)

`suggestPar(hole)` returns a value **with its reasoning**, which is what makes it
trustworthy rather than magic.

Effective distance — actual, adjusted for elevation change and prevailing wind —
is the base. Modifiers: fairway technicality (corridor width against length),
obstacle density along the line, required shot shape, green difficulty and
approach angle, OB proximity, and forced-layup geometry from mandos.

Output is a suggested par, a difficulty rating, and a plain-language breakdown:
_"565 ft, +18 ft elevation, tight corridor → par 4."_

Stored as `parSuggested` and `parOverride` separately. A designer's override
survives every future improvement to the model, and each layout carries its own
par.

---

## Public app concerns

**Cost.** Static hosting is free; tile requests are the real bill. Aggressive
client-side tile caching, a thin tile proxy behind a CDN, and rate limiting.
This is what donations fund, and Open Collective's public ledger is why it fits.

**Trust.** Privacy policy, terms, an attribution page crediting every data
source, privacy-respecting analytics (self-hosted Umami — no cookie banner), and
Sentry for errors.

**Sharing.** Published course pages are server-rendered for SEO and link
previews.

---

## Open questions

- **Yjs for collaboration.** Revisit at PR 8, when accounts and sharing make it
  concrete. The narrow `applyOp()` API in PR 2 exists to keep that swap cheap.
- **Tile provider at scale.** Esri's imagery terms need review before the app is
  promoted widely; a self-hosted or commercially licensed source may be required.
