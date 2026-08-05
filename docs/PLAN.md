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
   happens only at the display boundary. Precision is never overstated. A figure
   attributed to a published standard is transcribed from the document, with its
   citation, or it is absent — see [docs/PDGA.md](./PDGA.md).
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

| PR      | Scope                                                                              | Status  |
| ------- | ---------------------------------------------------------------------------------- | ------- |
| **0**   | Monorepo, design tokens + theming, app shell, MapLibre, keyboard registry, CI      | ✅ done |
| **1**   | Design system: Radix primitives, panel/inspector/tool patterns, component library  | ✅ done |
| **2**   | Document model, zod schemas, `applyOp` store, undo/redo, IndexedDB, `.hyzer` files | ✅ done |
| **3**   | Drawing engine, full feature palette, schema-driven inspector                      | ✅ done |
| **4**   | Hole workflow, distances, PDGA par and advisory checks                             | ✅ done |
| **4.5** | UI/UX: navigation, docked panels, layout, camera framing                           | ✅ done |
| **5**   | Document model v2: pairs, layouts, migration                                       | ✅ done |
| **6**   | Derived geometry: tee footprints, pair picker, fairway corridors, vertex editing   | ✅ done |
| **7**   | Boundaries and acreage                                                             | next    |
| **8**   | Layouts and routing: named layouts, skip, repeat, reorder                          |         |
| **9**   | Expanded palette: relief areas, noted areas, drop zones, invert, circles           |         |
| **10**  | Terrain: DEM sampling, elevation profiles, hillshade                               |         |
| **11**  | Parametric flight model, shot editor, disc database                                |         |
| **12**  | Safety: dispersion envelopes, overlap and proximity rules                          |         |
| **13**  | Accounts, share links, published course pages (backend begins here)                |         |
| **14**  | Exports: PDF/PNG maps, tee signs, punch lists                                      |         |
| **15**  | KML/KMZ interop                                                                    |         |
| **16**  | Terrain 2: contours, slope analysis, LiDAR, custom DEM upload                      |         |
| **17**  | Offline/PWA, tile caching                                                          |         |
| **18**  | Field mode: touch targets, GPS, geotagged photos                                   |         |
| **19**  | Donations, public gallery, self-host via docker-compose                            |         |

Sharing sits at PR 13 rather than the end because a published, linkable course
page is the growth loop — it is how a designer shows a parks department and how a
club shows its players.

PRs 5 through 9 are one piece of work split for reviewability: the document
model the app should have had from the start. It came out of a design session
with the hand-drawn model in `docs/MODEL.md`, and the model settled before any
of it was written.

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

## PR 4.5 — what landed

The first UI/UX pass over everything built so far.

### Navigation

| Tool   | Key        | Cursor                       | Drag does                        |
| ------ | ---------- | ---------------------------- | -------------------------------- |
| Select | `V`        | arrow, `move` while dragging | pans                             |
| Zoom   | `Z` (hold) | zoom-in / -out               | zooms to the region, Alt inverts |

**A plain drag pans, from every tool except Zoom.** That is what a map does.

An earlier version of this PR made panning its own mode — a hand tool on `H`
with a `Space`-to-pan hold, borrowed from design tools — and reverted it. On a
canvas that is a map first, requiring a modifier to do the thing every other map
on the internet does on a plain drag is friction with nothing on the other side
of it. The cursor carries the story instead: an arrow until you press, the
four-way `move` cursor while the ground is actually moving, and only then. A
hand sitting there permanently claims a mode the map is not in.

Panning is on for drawing tools too. Placing a feature is a `click`, and
MapLibre suppresses `click` once the pointer has moved past its tolerance, so a
pan mid-draw cannot drop a stray vertex.

MapLibre's own `shift+drag` box zoom is switched off. It collides with
shift-click multi-select, it is undiscoverable, and it would be a second way to
do what `Z`-drag does with different behaviour. The replacement uses one formula
for both directions, so zooming out is exactly the inverse of zooming in rather
than a separate behaviour that happens to be nearby.

**The zoom hold is not a shortcut.** The registry dispatcher only understands
keydown, and a hold needs both edges. `Z` is declared in the registry with
`hold: true` so the help overlay lists it, and skipped by the dispatcher; the
mode is owned by `useNavigation`, which binds both edges and clears on window
blur so a keyup that lands elsewhere cannot strand the map.

### The camera goes to the work

**Wheel zoom is anchored to the pointer.** It had been set to
`{ around: 'center' }`, under a comment claiming that smoothed the wheel curve.
It does not — that option only moves the anchor — and anchoring to the centre
walks a tee at the edge of the screen straight off it. Aiming with the cursor
and correcting with a pan is the whole interaction that broke.

**Loading a document frames its features** rather than restoring a stored
viewport. A saved camera is wherever you happened to stop scrolling, which is
rarely where you want to resume, and restoring an autosave used not to move the
camera at all — so a reload showed a full scorecard over the middle of Kansas.
The stored view survives as the fallback for a course with nothing drawn, which
is the only case where "where you were last looking" is the best guess
available.

`Zoom to fit` (⇧1) and `Zoom to selection` (⇧2) were reserved in the registry
since PR 0 and run the same helper, so they are implemented now rather than
left inert beside it.

The framing lives in `CourseEditor`, keyed on a document epoch from
`CourseProvider` — incremented when a whole document replaces the current one,
untouched by ordinary edits. `MapCanvas` no longer takes a `pendingViewRef`:
two components moving the camera on load is one too many, and the one that owns
the map instance is not the one that knows what is worth looking at.

### Layout

```
┌─ course name · undo/redo · file ──── basemap ──── theme · help ─┐
│                                                                 │
│  Holes                                            Properties    │
│  ├ scorecard                                      ├ feature,    │
│  └ design notes                                   │  else hole, │
│                                                   └  else course│
│                                                                 │
│  scale · units · coords    [ tools ]        zoom · bearing      │
└─────────────────────────────────────────────────────────────────┘
```

**Tools moved to bottom centre.** A vertical rail on the left competes with the
course panel for the same column; a bottom bar costs only a strip of sky.

**Basemap moved to the top bar.** It is a statement about what you are looking
at, alongside what you are working on — not a camera control like zoom or
bearing, which stay in the map's own corner.

**The right panel is always present and has three modes**: the selected feature,
else the selected hole, else the course. A column that appears and vanishes is
one the eye has to re-find each time. Deselecting is exactly when course-level
questions get asked, so that is what the empty state answers.

Hole properties are new surface: number, name, par with its full reasoning
visible rather than hidden in a tooltip, both measurements, and the assigned
features as links back to the map.

Two duplications were resolved rather than shipped. The course name is editable
only in the top bar — a second control for the same value, visible at the same
time, only raises the question of which one is authoritative. And the hole
properties' feature links are labelled `Select Tee pad` rather than `Tee pad`,
because the rail button that _draws_ a tee already owns that name.

---

## PR 5 — what landed

The document model, rewritten. Format version 2, and the project's first real
migration. Deliberately invisible: the interface is unchanged, because
everything downstream — fairway geometry, layouts, the expanded palette — churns
until the model settles.

The full reference is **[docs/MODEL.md](./MODEL.md)**. The three decisions that
drove it:

**The pair is the unit of measurement, not the hole.** A hole with three tees
and three pins is nine different shots. A single par on the hole is true of at
most one of them, so distance and par moved onto the tee-to-target pair and the
hole became a container. Pairs are stored sparsely — a record only exists once
it carries a par override or a drawn fairway.

**A layout is an ordered sequence of plays, not a per-hole selection.** It can
skip a hole and can play one twice, once to each pin. Neither is expressible as
"pick a tee and a pin for each hole". That makes the number a player sees a
property of the routing, so `hole.number` became the designer's label for the
corridor and the played number became a position in the list.

**Skill level is derived from tee colours, not stored on the course.**
[ELEMENTS] p3 says a tee's colour _is_ the level it was built for, so a
course-wide setting would be a second source of truth that could disagree with
the tees on the map. A layout mixing colours has no level — every published PDGA
figure is per level, so there is no range for it to be inside or outside of, and
null is the only honest answer.

Also landed: `casualArea` and `requiredRelief` as separate kinds (the Rules of
Play make one optional and one required); `holeId` as scope rather than a second
collection; tags as one shared mechanism; install status separating "is there a
basket in the ground" from "is this a valid design"; and the **Rules of Play**
as a sixth transcribed source, which is what finally let the target circles ship
with honest provenance — C1 is a real rule, C2 is a real figure the rules use
for something else, and the bullseye is league convention attributed to nobody.

### The migration is the risky part

It reinterprets documents rather than adding fields, so each move is tested
separately rather than through one round-trip that would pass on an average.
Sixteen tests cover it, including the degenerate documents a real autosave
actually contains: no holes, dangling references, a `holes` key that is not an
array.

Two decisions worth stating plainly. A par override on a hole with **no tee or
no target is dropped** — that combination was unmeasurable in v1 too, so no
number a designer could ever see is lost. And **dangling references are kept**,
so the structural check can still report them rather than the migration quietly
tidying away evidence of a problem.

---

## PR 6 — what landed

Geometry the document does not store. A tee is a point but a tee is a pad; a
fairway is a line but a fairway is ground you can land on. Both second shapes are
now computed on every render in `packages/core/src/geometry.ts` and never written
back — a cached polygon is a polygon that is wrong for exactly as long as it takes
someone to notice.

**Everything works in metres.** The module builds a local east/north tangent plane
and does its offsets there. Buffering a polyline in degrees would make a corridor
40% fatter north-to-south than east-to-west at this latitude — the same
1/cos(latitude) error `measure.ts` already refuses for distance, except this one
would be visible and still look plausible.

**The tee pad extends backwards from the point.** The stored coordinate is the
front centre, because that is the tee line and the tee line is what hole length is
measured from. Anchoring at the pad's centre instead would silently add half a pad
length to every hole on the course, which is exactly the kind of error this project
exists to not make. With no bearing from the feature or the caller the rectangle is
withheld rather than drawn facing north.

**The fairway corridor tapers from the tee pad's width to Circle 1's 10 m**,
interpolated by distance along the line rather than by vertex index — index would
balloon a dogleg to full width inside its first short leg. The two endpoints are
published figures; **the taper between them is ours**, and both docs say so.
Sharp doglegs get a mitre limit, and a corridor that folds through itself is
reported as a finding rather than quietly drawn, because a folded polygon has
stopped describing ground.

**The pair picker replaced a lie.** Since PR 5 the panels had been answering every
question with the hole's first tee and first pin — correct for one of a two-pin
hole's four throws and silently wrong for the rest. `representativePair` now takes
the active layout's play when there is one, the hole panel lets the designer pick
another, and the panel says out loud when the shot on screen is not the one the
routing plays. `apps/web/src/document/holeView.ts`, the shim that held this
together, is deleted.

**Lines and areas can be reshaped.** Drag a vertex, click a midpoint to insert
one, Alt-click to remove — refused below two points for a line and three for an
area. Edits go straight into the document, one op per pointer move, so the length
in the panel and the corridor under the cursor track the vertex live; `canCoalesce`
folds the run into a single undo entry.

The browser tests grew a `geometry.spec.ts` for the parts only a browser can
answer, and the five near-identical PNG encoders across the e2e files collapsed
into one `fixtures.ts`. Two of the new tests were confirmed by reverting the fix
they guard and watching them fail: without `preventDefault` on a handle's
mousedown MapLibre pans the ground instead of moving the vertex, and without the
handle guard a click five pixels off a line's centre deselects the feature you are
editing and takes every handle with it.

### Deliberately not in this PR

**Per-vertex widths.** A fairway carries two widths, not one per point. The
document's `props` map holds scalars, so an array would need a schema change and a
migration — and the shape people actually want, a corridor that opens up from tee
to green, is already what the taper does. Worth revisiting when someone hits the
case it does not cover.

**A gesture id on ops.** Undo coalescing is time-based, so a drag paused for more
than 700 ms mid-gesture splits into two entries. Rare enough not to justify
threading a gesture through the op model yet.

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

## PDGA standards — what landed in PR 4

The five published PDGA course design documents are transcribed in
[`packages/core/src/pdga.ts`](../packages/core/src/pdga.ts), with the full record —
every figure, its page, and the sentence it came from — in
[docs/PDGA.md](./PDGA.md).

**The rule this project works under: a figure that is not in a source document is
not in the code.** Not estimated, not interpolated, not remembered. A designer may
take a tee pad dimension or a length range from this tool to a parks department, a
landowner, or an insurer, and an invented number is worse than a missing one
because it cannot be told apart from a correct one. `pdga.test.ts` restates the
published figures independently of the tables the code reads, so a typo fails the
build rather than quietly becoming the app's idea of a PDGA standard.

Rules are split by authority, and the split is load-bearing:

- `STRUCTURAL_RULES` follow from the document's own geometry and self-consistency
  and claim no external authority — a hole with no tee, two holes numbered 4, a
  fairway that starts 40 m from its tee.
- `PDGA_RULES` cite a published figure. Each carries the `source` and `revision`
  of the document it came from, surfaced in the warnings panel and linked. A test
  fails the build if one claims `authority: 'pdga'` without both.

Shipping now: tee pad below the 4 ft × 10 ft minimum, hole under the 100 ft
minimum, two holes whose played lines cross, and an 18-hole course outside the
typical length range for its skill level.

Every finding is dismissible per-course, and the dismissal is stored in the
document so it travels with the file. Designers break guidelines deliberately and
the tool should not nag.

### Deliberately not shipped

**Safety separation distances between fairways.** No source document publishes
one. `[ELEMENTS]` says fairways should be "far enough apart so errant throws
aren't regularly in the wrong fairway" and puts no number on it. A plausible
invented separation distance is the single most dangerous number this app could
get wrong, so PR 7 will derive it from a stated dispersion model instead — a
number the designer can see the reasoning for, not a constant attributed to a
standard that does not contain it.

Whether to move the rules into a **versioned JSON ruleset file** — so clubs can
layer on local rules without a code change — is deferred. It was the original
plan, but the checks that exist need real geometry (segment intersection, feature
lookup), not a declarative predicate, and a data format invented before there is
a second consumer would be a guess. Revisit when local rules are actually asked
for; `Authority` already has a `'local'` case reserved.

## Par — what landed in PR 4

`suggestPar(course, hole)` returns a par **with its reasoning**, which is what
makes it trustworthy rather than magic.

It implements the PDGA's **Par by Hole Length** method (`[PAR]` p10) fed by the
PDGA's **Effective Length** formula (`[PAR]` p8), for the skill level the course
is set to. The course carries a `skillLevel` because par is meaningless without
it: a 700 ft hole is a par 4 for Gold and a par 5 for Red, and `[ELEMENTS]` p4
requires par to be labelled with the standard it was set against.

`[PAR]` p10 warns that "strictly following the table will not give appropriate
pars for all holes." That is exactly why the number is a suggestion, why the
reasoning is on screen, and why the override is one click away. Holes within 15 m
of a band boundary are marked as genuinely arguable — that margin is ours, not
the PDGA's, and is labelled as such in the code.

`parOverride` is stored separately from the computed value, so changing the skill
level — or a later revision of the PDGA tables — never silently overwrites a
deliberate decision.

**Not yet fed into the formula**, because the inputs do not exist yet rather than
because the model is simple: elevation waits on terrain (PR 5); the dogleg term
needs the distance to a corner and the water term needs the detour a carry forces,
neither of which the document model represents. Those terms are omitted rather
than estimated, and `effectiveLength` is already shaped to take them.

PR 4 removed an earlier `+10 m per mando` par penalty. It was invented, it counted
every mando on the course rather than the ones on the hole, and the PDGA formula
has no mando term. A real version needs mandos assigned to holes — then a mando is
a dogleg in the PDGA's sense and feeds the existing dogleg term with a citation.

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
