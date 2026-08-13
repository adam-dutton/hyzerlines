# Hyzerlines — plan

A web app for designing disc golf courses on real terrain. Free to start, no
account required to draw.

This document is the roadmap and the record of decisions behind it. It is kept
current as PRs land.

**Licensing is changing.** The project shipped under AGPL-3.0 through #15 and is
moving to a proprietary licence for future versions. See
[Licence and business model](#licence-and-business-model) — including what that
change cannot undo.

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
   exist only for sync, sharing and publishing. This survives the move to a paid
   product: a designer standing in a field with no signal is a real user, and the
   local-first document is an advantage to keep rather than a gap to close.
7. **Advisory, never prescriptive.** PDGA checks and par suggestions inform the
   designer. Every one of them is overridable, and overrides are never
   silently reverted.

---

## Roadmap

| Milestone                            | Scope                                                                         | Shipped in                                               |
| ------------------------------------ | ----------------------------------------------------------------------------- | -------------------------------------------------------- |
| **Foundations**                      | Monorepo, design tokens + theming, app shell, MapLibre, keyboard registry, CI | [#1](https://github.com/adam-dutton/hyzerlines/pull/1)   |
| **Design system**                    | Radix primitives, panel/inspector/tool patterns, component library            | [#2](https://github.com/adam-dutton/hyzerlines/pull/2)   |
| **Document model**                   | zod schemas, `applyOp` store, undo/redo, IndexedDB, `.hyzer` files            | [#4](https://github.com/adam-dutton/hyzerlines/pull/4)   |
| **Drawing**                          | Drawing engine, full feature palette, schema-driven inspector                 | [#5](https://github.com/adam-dutton/hyzerlines/pull/5)   |
| **Holes and par**                    | Hole workflow, distances, PDGA par and advisory checks                        | [#6](https://github.com/adam-dutton/hyzerlines/pull/6)   |
| **Navigation and panels**            | Navigation tools, docked panels, layout, camera framing                       | [#7](https://github.com/adam-dutton/hyzerlines/pull/7)   |
| **Model v2**                         | Pairs, layouts, migration                                                     | [#8](https://github.com/adam-dutton/hyzerlines/pull/8)   |
| **Derived geometry**                 | Tee footprints, pair picker, fairway corridors, vertex editing                | [#9](https://github.com/adam-dutton/hyzerlines/pull/9)   |
| **Boundaries and acreage**           | Property boundary, PDGA acreage comparison                                    | [#10](https://github.com/adam-dutton/hyzerlines/pull/10) |
| **Chrome, rearranged**               | The outside of the panels                                                     | [#11](https://github.com/adam-dutton/hyzerlines/pull/11) |
| **Panel insides**                    | The inside of them                                                            | [#12](https://github.com/adam-dutton/hyzerlines/pull/12) |
| **Terrain overlays**                 | One style, hillshade, contours                                                | [#13](https://github.com/adam-dutton/hyzerlines/pull/13) |
| **Site surveys**                     | Import LiDAR GeoTIFFs, reproject and tile in-browser                          | [#13](https://github.com/adam-dutton/hyzerlines/pull/13) |
| **Elevation profiles**               | Per-hole ground profile, and the PDGA elevation term in par                   | [#13](https://github.com/adam-dutton/hyzerlines/pull/13) |
| **Feature coordinates**              | Shown on every feature, and typed in                                          | [#14](https://github.com/adam-dutton/hyzerlines/pull/14) |
| **Multiple tees, pins and fairways** | The shot matrix as a first-class idea                                         | [#15](https://github.com/adam-dutton/hyzerlines/pull/15) |
| **Layouts and routing**              | Named layouts, skip, repeat, reorder                                          | **next**                                                 |
| **Workspaces and focuses**           | Four focuses inside Design; workspaces wait for Produce                       |                                                          |
| **Expanded palette**                 | The Land focus: trees, water, paths, roads, buildings, ground types           |                                                          |
| **Terrain 2**                        | 3D tilt, canopy height, slope shading                                         |                                                          |
| **Styles**                           | Named styles in the document; features reference them                         |                                                          |
| **Produce: maps and signs**          | Course maps, tee signs, print and export                                      |                                                          |
| **Flight model**                     | The Simulate focus: parametric flight, shot editor, disc database             |                                                          |
| **Safety**                           | Dispersion envelopes, overlap and proximity rules                             |                                                          |
| **KML/KMZ interop**                  | Import and export                                                             |                                                          |
| **Offline and PWA**                  | Installable; tile caching needs a supplier that permits it                    |                                                          |
| **Field mode**                       | Touch targets, GPS, geotagged photos                                          |                                                          |
| **Accounts and subscription**        | Accounts, sync, sharing, billing (backend begins here)                        |                                                          |
| **Engineering packages**             | Deliverables for parks departments and contractors                            | **blocked** — see below                                  |

### Why these are named rather than numbered

They used to be "PR 0" through "PR 21", and the numbers were wrong in both
directions.

**They never matched the pull requests they were named for.** Roadmap "PR 1"
shipped as [#2](https://github.com/adam-dutton/hyzerlines/pull/2), and it was
off by one from there on, because [#1](https://github.com/adam-dutton/hyzerlines/pull/1)
and [#3](https://github.com/adam-dutton/hyzerlines/pull/3) were fixes that no
roadmap row predicted. By the end, three rows — overlays, surveys and elevation
profiles — had all shipped inside
[#13](https://github.com/adam-dutton/hyzerlines/pull/13), so the label "PR"
identified nothing at all.

**One row is not one pull request, and the scheme kept admitting it.** "4.5",
"8a", "8b", "10b", "10c" were each invented at the moment reality refused to fit
— a half number, two splits, two appendices. That is a naming scheme reporting
its own failure five times.

**Numbers that encode order break when the order changes.** Inserting the
multi-tee work ahead of layouts renumbered ten rows and silently invalidated two
cross-references in this document's own prose. A name has no position to
invalidate.

So: milestones have names, order is the order of this table, and the **Shipped
in** column carries the real pull request — which is the number that was
actually wanted whenever somebody went looking for one.

Sharing sits mid-roadmap rather than at the end because a published, linkable
course page is the growth loop — it is how a designer shows a parks department
and how a club shows its players.

**Model v2** through **Panel insides** are one piece of work split for
reviewability: the document model the app should have had from the start. It
came out of a design session with the hand-drawn model in `docs/MODEL.md`, and
the model settled before any of it was written. That five-milestone run is also
the clearest case of why one row was never one pull request.

**11 and 12 were one row until an audit split them.** "Layouts and routing" was
next, and it assumed multiple tees and pins already worked because the _model_
supports them and has since **Model v2**. The interface did not: it presented a
course as one tee and one pin with a picker bolted on, and a layout is a sequence
of choices among shots the designer could not see or compare. Building the
routing on top of that would have been building the second storey first. See
**Multiple tees, pins and fairways** below for what the audit found and what
shipped in answer to it.

---

## Foundations — what landed

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
switches swapped the style in place so the camera and future editing state
survived. (**Terrain overlays** went further and stopped swapping the style at all — every
basemap is a source in one style now, and switching is a visibility change.)

**Chrome.** Inline-editable course name, theme toggle, basemap segmented control,
zoom and bearing controls, an adaptive scale bar, live coordinates, a units
toggle, and attribution.

The tool rail is deliberately absent until **Drawing**. Shipping a palette of disabled
buttons communicates a roadmap at the cost of making the product look broken; the
tool _keys_ are reserved in the registry instead.

**Keyboard registry.** All shortcuts declared in one file. The help overlay (`?`)
is generated from it, so it cannot go stale.

**Onboarding.** The entire first-run experience is one search box: find your
land, the map flies there. Geocoding is Photon (keyless, CORS-enabled), and
pasted coordinates work without any network call, so search failure never
blocks.

---

## Navigation and panels — what landed

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
since **Foundations** and run the same helper, so they are implemented now rather than
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

## Model v2 — what landed

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

## Derived geometry — what landed

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

**The pair picker replaced a lie.** Since **Model v2** the panels had been answering every
question with the hole's first tee and first pin — correct for one of a two-pin
hole's four throws and silently wrong for the rest. `representativePair` now takes
the active layout's play when there is one, the hole panel lets the designer pick
another, and the panel says out loud when the shot on screen is not the one the
routing plays. `apps/web/src/document/holeView.ts`, the shim that held this
together, is deleted.

**Lines and areas can be reshaped.** Drag a vertex, click a midpoint to insert
one, Alt-click to remove — refused below two points for a line and three for an
area. Edits go straight into the document, one op per pointer move, so the length
in the panel and the corridor under the cursor track the vertex live.

A drag is one undo entry, and that turned out to need saying explicitly rather
than being inferred. Coalescing was a 700 ms window; a browser test running under
load exceeded it mid-drag and split a bend in two, so one ⌘Z took back the shape
and left behind the fairway that same gesture had created. Ops emitted by a drag
now carry a `gesture` id, and one gesture is one entry however long it took. The
redo op stays a batch rather than being replaced by the newest edit — replaying
only the last geometry change would target a feature undo had just removed, and
the bend would silently vanish.

The browser tests grew a `geometry.spec.ts` for the parts only a browser can
answer, and the five near-identical PNG encoders across the e2e files collapsed
into one `fixtures.ts`. Two of the new tests were confirmed by reverting the fix
they guard and watching them fail: without `preventDefault` on a handle's
mousedown MapLibre pans the ground instead of moving the vertex, and without the
handle guard a click five pixels off a line's centre deselects the feature you are
editing and takes every handle with it.

### Then the fairway tool went away

Reviewing the above on the preview turned up four things, and the second is a
model change rather than a fix.

**Tees and baskets can be assigned to holes.** There was no control for it at
all: `addHole` guessed once at the nearest unassigned pair and nothing could
change its mind, so a second pin was stranded outside every hole, reported
forever as unassigned. Now the feature panel has a hole picker and the hole panel
can claim a loose one — both directions, because naming a basket you just placed
is feature-first and filling out hole 5 is hole-first. `assignToHole` emits one
batch, so a move between holes is one undo step rather than two half-moves.

**Fairways are not drawn any more.** A tee and a target imply the line between
them, so every measurable pair has a fairway the moment both ends exist. The tool
is gone; the feature is materialised only when somebody bends the line, which is
the same sparseness pairs already had. One shot is drawn per hole — the one the
panels are measuring — because nine overlapping corridors on a three-tee,
three-pin hole is unreadable.

`path` took the rail slot. It is the other line a course has and, unlike a
fairway, genuinely has to be drawn; without it there would be no line tool at all
and the drawing engine's line branch would be unreachable code.

**The tee pad is the tee.** The point marker is suppressed where the pad stands
for it — but by fading between z17 and z18.5 rather than disappearing outright,
because a two-metre pad is a fraction of a pixel at the zoom you use to look at a
whole course, and a tee that vanishes exactly when you step back is worse than a
redundant dot.

**Baskets are drawn as baskets.** A ring, chains and a band, in a glyph generated
from the design tokens at load rather than shipped as a PNG. Two images, not one
recoloured: MapLibre can only tint an SDF, and an SDF cannot carry both the
casing and the stroke.

Three MapLibre constraints cost real time and are worth recording. `feature-state`
is rejected in **layout** properties, so selection cannot switch `icon-image` —
hence two symbol layers cross-faded by `icon-opacity`, which is paint. `zoom` is
only allowed as the direct input to a **top-level** `step` or `interpolate`, so
the per-feature test has to live in the interpolate's output stops rather than
wrapping it. And `querySourceFeatures` returns one copy of a feature **per
rendered tile** and clips geometry at tile boundaries, so it can answer "did this
reach the map" but never "what does the document contain" — three browser tests
were written against it and were wrong until they read the store instead.

### Then a second review pass

**Everything drawn can be dragged.** Moving a basket meant deleting it and
placing another, which lost its name, its properties and its place in a hole.
Points move directly, lines and areas translate, and moving a tee or target
drags the end of its **stored** fairway along — a derived one needs no help
because it is recomputed from both ends anyway.

That surfaced a conflict worth recording. A fairway's first and last vertices
sit exactly on the tee and the target, so their edit handles were sitting on top
of every tee and basket on the course, swallowing the clicks and drags meant for
those features. **The ends are not editable.** A fairway runs from its tee to its
target by definition; only interior vertices get handles, and the ends move when
the features that own them do.

**Holes are clickable and numbered.** A number on a disc at the midpoint of the
shot — the midpoint rather than the centroid of everything the hole owns, which
drifts towards whichever end has more features and lands on top of the corridor
it is labelling. Clicking any of a hole's features selects the **hole**, and
clicking again drills into the feature: the grouping idiom every vector editor
uses. Selecting a hole highlights all of it — label, tee, target, corridor — so a
click tells you which land the hole occupies.

**Putting circles.** All three, at their real size on the ground, with their
provenance carried into the styling: Circle 1 is solid because it is a rule,
Circle 2 and the bullseye are dashed because one is a figure the rules use for
something else and the other is league convention. Outline only — three filled
rings around every basket would bury the imagery.

**Everything is white.** Fifteen saturated hues over tree canopy, sand, water and
grass was a lot of noise for information that shape and position already carry.
That cost the old selection treatment, which inverted the casing to white: a
white halo around a white feature is invisible. Selection is now the one place
colour is spent.

**The tee pad locks to the fairway's first segment.** On a straight hole that is
the same as facing the target; on a dogleg it is not, and a pad aimed at a pin
the player cannot see from it is aimed at the wrong thing. An explicit `bearing`
still wins — this is a default that tracks the design, not a rule that overrides
the designer.

### Deliberately not in this PR

**Per-vertex widths.** A fairway carries two widths, not one per point. The
document's `props` map holds scalars, so an array would need a schema change and a
migration — and the shape people actually want, a corridor that opens up from tee
to green, is already what the taper does. Worth revisiting when someone hits the
case it does not cover.

**Re-scoping an OB line to a hole.** The hole picker is for tees and targets
only. Other kinds carry a `holeId` too, but for them it is scope rather than
membership — an OB line belonging to hole 4 is a different claim from a tee being
one of hole 4's tees — and overloading one control with both meanings would make
neither clear. **Boundaries and acreage** gives scope its own control.

---

## Boundaries and acreage — what landed

The acreage chart has been transcribed since **Holes and par** and unused, for exactly one
reason: it compares against the size of a property, and nothing in the document
described a property. A drawn **boundary** is that thing, so this PR is mostly
about making one drawable and then honestly comparable.

**Area is measured with the spherical excess formula**, not the shoelace formula
on a projected plane. That distinction does not matter for a fairway corridor —
a few hundred metres of drawing aid — and matters a great deal here: this number
goes on a page shown to a parks department or a landowner, and a property can
span kilometres, where the tangent-plane approximation `geometry.ts` uses starts
to drift. Same cost, no approximation.

**The boundary gets a tool** (`Y`), and every polygon now reports its area and
perimeter in the feature panel. Areas are quoted in **acres**, because that is
the unit every land registry, parks department and the PDGA's own chart uses;
metric gets hectares. Small areas fall back to square feet or metres, since "0.01
acres" for a tee apron is a number nobody can picture.

**Two decisions about reading the chart**, both of the do-not-invent kind:

The comparison is a **range, not a number**. Every row publishes three course
scales — Minimum at par ~56, Average ~61, Championship ~67 — and all three are
legitimate. The app cannot know which one is being built, so it reports whether
the site falls inside the span rather than picking a column and calling the rest
wrong. The finding names the mix the relevant column assumes, because "too small"
really means "too small for eighteen holes at that mix".

**Foliage density has no default.** The chart is indexed by it; it is the one
thing about a property that cannot be seen from imagery or inferred from the
drawing; and none of the three columns is marked typical. So it is a property of
the boundary the designer sets, and with it unset the area is still measured and
reported — only the comparison is withheld. Green has no row at all, so
`acreageRange` returns null for it rather than a plausible set of zeroes.

Also landed: the **scope control** deferred from **Derived geometry**. An OB line, a hazard or a
path can now say which hole it is about — scope, a different claim from a tee
being one of hole 4's tees, which is why it is a separate control rather than the
same one overloaded.

And a **lost-edit bug in the autosave**, found by a browser test that kept
insisting a par override did not survive a reload. It did not. `markClean()` took
no argument, so a write that started before an edit and finished after it marked
the document clean anyway — and since the autosave is driven by `dirty`, nothing
ever rescheduled. The edit was real in memory and gone on refresh, which is the
worst shape a persistence bug can take. `markClean` now names the document that
was written and declines to clean anything newer.

### What the map draws, and how much of it

A pass over the drawing, from looking at a real site rather than at a test
fixture.

**A boundary has no fill and the thinnest dotted line on the map.** It is a note
about the land, not a thing on it, and it is routinely the largest shape on
screen — a translucent wash over the whole site dims the imagery every other
judgement is made from. `line-dasharray` takes no data-driven expression in
MapLibre, so "dashed for one kind, solid for the rest" is two filtered layers
rather than one paint expression. The casing is the click target, because a
1.25 px dotted line is not one.

**Out of bounds is red.** The only exception to the monochrome pass, and it earns
it: red for OB is what a player has seen on every course map, every tournament
handout and every rulebook diagram. Drawing it in the same white as a path
withholds the one thing the map can say without a label about the only area that
costs a throw. The other regulated areas stay white — they are penalties too, but
they have no established colour, and inventing three more puts the map back where
the monochrome pass started.

**Fairways are always dashed**, routed or not. They used to go solid once shaped,
which put the two most similar-looking marks on the map — a routed fairway and a
drawn path — one keystroke apart. It also never worked: a selected fairway's
casing is a near-identical blue, so it filled the gaps and the dashes vanished.
Dash patterns are measured in line widths, so the casing now carries the same
pattern divided by the width ratio, which is the only way two stacked lines break
in the same places.

**The corridor arrives at Circle 1, not at half of it.** The published figure is
a 10 m radius and the code was reading it as a width, so the corridor's edge
landed halfway to a ring drawn on the same map. Which of the two to use is not a
question the PDGA answers — it publishes no fairway width at all — so it is the
app's, and it is written down in `docs/PDGA.md` as such.

**A selected basket now reads as selected.** Its selected glyph kept the feature
colour and inverted the casing to white, which was right while baskets were red
and became a white glyph cased in white the moment everything went monochrome.
Selecting a hole lit up its tee, its corridor and its number, and left the basket
looking untouched.

**And all of it switches off**, per hole and course-wide, lines and corridors
separately, circles individually. Those switches are in the document rather than
in the browser — see `docs/MODEL.md` for why.

### A second pass, after actually looking at a drawn hole

Every one of the above landed and was still wrong in some way once a real
course sat on screen next to it.

**The corridor's target end is rounded, not cut square, and has no stroke at
all.** Its radius is the same half-width the taper already arrives at — 10 m by
default — so the cap and Circle 1's own ring are the same curve, and the fill
runs into the circle instead of stopping short of it with a visible seam. The
stroke came off the whole corridor for the same reason: it is a drawing aid,
not a boundary anyone drew, and a line around it claimed a precision the app
does not have.

**A tee pad is a solid fill and nothing else** — no coloured outline, full
opacity whether selected or not. It is concrete, not an annotation, and
looking like one drops the borrowed "translucent drawing aid" language the
corridor and the circles still use on purpose.

**The point marker for a tee is now a line, not a dot, and it is the pad's own
front edge** — front-left corner to front-right, the tee line itself — rather
than an arbitrary circle. It fades in below z18 as the pad itself stops being
legible, and out above it, taking over the job the point used to do at z17–18.5.

**The default fairway line is three equal segments, not one.** A single
straight segment has exactly one vertex handle, sitting at the line's own
midpoint — which is also where the hole's number sits, so the two competed for
the same pixel and the handle usually lost, hidden under the label. Splitting
the derived line into thirds gives every hole two solid handles a third of the
way in from each end, nowhere near the label, so there is always an obvious
point to grab. Bending the middle segment now produces five stored points
rather than three — the two thirds-points plus the tee, the target and the
one just inserted — which is a deliberate trade of a slightly busier stored
line for a fairway that was never hard to grab in the first place.

**Ctrl+drag no longer orbits one way from the top of the map and the other way
from the bottom.** MapLibre's own drag-to-rotate computes bearing from the
angle between the pointer and the map's centre once a drag starts far enough
from it — a "turn a dial" gesture — and a horizontal-only pixel delta close to
centre that still flips sign depending on which half of the screen the cursor
is on. Both meant the same leftward drag could rotate opposite ways depending
on where the course happened to sit on screen. `useOrbit` replaces it with
bearing bound to horizontal pixel movement alone: left is always clockwise,
regardless of where the drag starts.

**Copy is American English.** `packages/design` and every comment in this repo
have used British spelling throughout — that stays, it is house style for
prose written by and for the people working on the code. What actually reaches
a user's screen is a different contract, and the two strings that had drifted
into it now read "color" rather than "colour".

### Deliberately not in this PR

**Whether the course actually fits inside its boundary.** Geometrically easy, and
a different question from acreage: a 30-acre site can be the wrong 30 acres. It
needs point-in-polygon and a decision about what "outside" means for a corridor
that clips a corner, and it belongs with **Safety**, where the same
containment machinery is needed anyway.

**Multiple boundaries with conflicting densities.** The largest one wins, which
is the only defensible pick without asking a question the interface has not
asked. A park split by a road is the real case and it is usually one density.

---

## Chrome, rearranged — what landed

A layout pass, from using the thing on a real nine-hole course rather than on a
two-feature fixture. Split from the panel-internals work that follows it,
because a diff that moves every panel _and_ rewrites the inside of each one is
one nobody can review.

### Where things went

**The course panel is top left, where its name already was.** The name used to
sit alone in a card at the top of the screen while everything else about the
course lived in the right-hand inspector — one thing described in two places, a
screen apart, the second only visible when nothing was selected. Now the
inspector's course view _is_ the top-left panel and the name is its heading: an
input that looks like a title, which is what it always was. The holes list
keeps its column beneath it, both the same width.

**The properties panel is top right and shows only a selection.** It had three
modes and now has two — a feature, or a hole. The course was never something
you selected, and with it gone there is nothing to show when nothing is
selected, so the panel goes away rather than sitting there empty. The old
argument for keeping it always-present was about a workspace where it was the
only inspector; the course column is now the constant.

**The top bar is gone entirely.** Four cards spanning the top of the map, each
holding something used a few times a session: the theme toggle, the shortcuts
overlay, open, save, and the basemap switcher. Everything folded into one menu
on the course header, except the two things that did not belong there.

**Undo and redo went the other way, into the tool rail.** They are used
constantly and mid-gesture; the hand is already at the rail when a placement
goes wrong. **The basemap switcher went to the camera controls** — flipping to
topographic to read a slope and back to satellite to read canopy is a camera
gesture, made repeatedly, not a statement about the document.

**The status bar is gone, except what it was obliged to carry.** The scale bar
and the coordinate readout are reference numbers glanced at once an hour, and
they cost a permanent card in the corner; the units toggle moved into the
course menu. Provider attribution and the AGPL source link stayed, as a bare
credit line — both are conditions on shipping this at all, and both now have a
test rather than a comment asking people to remember.

**The camera controls stack vertically**: layers, then north, then zoom. The
`z16.4` readout is gone — a number about the tile pyramid, not about the land,
and the scale bar it sat beside said the same thing in feet.

**The tool rail is half again as large**, with `lg` added to `IconButton` for
it. A tool is a target you hit dozens of times an hour without looking, which
is a different job from the incidental chrome `md` is sized for.

### A hole can be built from the hole down

Holes could only ever be made the other way round: draw both ends, press Add
hole, and let it guess which loose pair you meant. That is backwards for anyone
who already knows what hole 4 is, and it left the empty hole this panel can
create with no way to be filled. Now a tee or basket drawn while a hole is
selected joins that hole — and the hole _keeps_ the selection, which is the
part that makes it work. Selecting the tee just placed would deselect the hole,
so the basket placed next would land loose: one end of hole 4, then silently a
different job.

### Three bugs, all invisible to the type checker

**The basket tool icon never drew, in either theme.** It asked for
`--hz-feature-basket-stroke`; the kind is called `target`, so the generated
variable is `--hz-feature-target-stroke`. An undefined custom property paints
nothing. The wordmark's basket dot had the same bug.

**The whole rail was invisible in the light theme.** Its icons painted from
feature tokens, which are deliberately theme-independent because they sit on
imagery — and every one of them went white in the monochrome pass. White on a
light panel. They are `currentColor` now, inheriting the button's own text
colour, which also gets the active state for free. The old rationale (a gold
square in the rail is a gold pad on the map) died with the monochrome pass.

**Switching the basemap emptied the map until you reloaded.** `setStyle`
discards every source and layer the app added, so `FeatureLayer` reinstalls
them on `styledata` — but that handler is bound once and closed over the
props from first render, which is an empty document. It re-added the sources
with mount-time data, and the `setData` effects never fired because `features`
had not changed. The install now reads current data from a ref. Two tests
cover it: the choice surviving a reload, and the course surviving the switch.

### Deliberately not in this PR

**The inside of every panel.** Accordions in the course panel, the location and
description fields, the parent-hole breadcrumb in the feature panel, and the
reordering of the hole, tee, target and fairway inspectors. All of it is
**Panel insides**.
The course panel is capped at 45% of its column and scrolls until then, which
is what stops it pushing the hole list out of reach — a stopgap the accordions
retire.

**Layouts.** The tab is there and says so in a sentence. A disabled tab is a
door that does not open and does not say why, and standing the frame up now
means the layouts PR does not also have to relitigate this panel's shape.

---

## Panel insides — what landed

The other half. **Chrome, rearranged** moved the panels; this rewrites what is
in them.

### Everything in the course panel folds

The panel was a stack of six sections that only ever grew, and it had reached
the point where it filled its column and squeezed the hole list out — which is
why 8a had to cap it at a fraction of the column and let it scroll. That cap is
gone. Sections fold now, and a folded section still says what it is holding:
the acreage, the first line of the notes. **A collapsed section that says only
its own name makes you open it to find out whether there is anything in there**,
which is worse than leaving it open.

Three sections became one. Skill level, site and features were three headings
describing one thing — what the app has read off the drawing, none of it typed
in — so they are **Analysis**. "Show on map" became **Settings**, because the
drawing aids were the first thing to go in it and will not be the last, and a
section named after its current contents has to be renamed when anything else
arrives. **Totals is gone**: `9 · Par 28 · 2545 ft` is the course header's
subheading now, beside the name it describes.

**Notes is a textarea.** It is the one genuinely open-ended field in there and
it had a one-line input.

### Location and description

Two new fields on the course, both additive with defaults, so no migration.

`location` is **seeded once from the map and then left alone**. The document
already knows exactly where the course is — `view.center` is two numbers good to
a metre — but a name is the only form of "where" that is any use to a parks
department or to yourself in six months. It fills in on the first drawn feature,
via the same keyless Photon service the location search already uses, and never
writes again: anything typed afterwards stands, including clearing it back to
empty.

`description` is capped at 280 characters and **truncates rather than refusing**.
The op arrives a keystroke at a time; dropping the whole edit on the character
that goes over reads as the field having died, and letting it through would
produce a document the schema then refuses to parse back.

### Units left the document's orbit

They were in the course menu after 8a, which was a holding position. Feet or
meters is a fact about the reader, not about the land — a US club and a European
one should be able to open one file and each see it in what they think in — so
the control is in Settings next to the drawing aids, and stored per browser while
the aids beside it are in the document. It is a **picker**, not a switch:
everything else in that section is a thing the map either draws or does not, and
"Feet and acres: off" does not name what you get instead.

### The name is the heading, everywhere

Every panel opened with a Name row underneath a title that was the same name
read back: one value, twice, three pixels apart. The title is the input now, as
the course panel's already was. An unnamed feature shows its kind as the
placeholder — and then the subtitle underneath is suppressed, because it would
be putting "Tee pad" above "Tee pad".

**A selected feature says which hole it belongs to, and gets you back.**
Selecting a tee inside a hole used to be a one-way door: the panel swapped and
the hole vanished from the interface with nothing to click. There is a
breadcrumb now.

### The four inspectors, reordered

One shape for all of them: **what it belongs to, what was measured, what was
typed in, delete.** Belongs-to used to sit below whatever kind-specific fields
happened to exist, so where it appeared depended on how many properties a tee
had.

- **Hole** — number, par and the measurements par came from, in one block with
  no headings between them. That is the answer to "what is this hole"; the rest
  of the panel is how it is assembled. "Shot" is now **Features**, which is what
  it becomes when a hole can hold several tees and pins.
- **Tee** — belongs-to, skill color, surface, status, then a **Layout** section:
  width and length side by side under one heading because that is how a pad is
  quoted, and facing under another because size and direction are different
  questions.
- **Target** and **fairway** — belongs-to first, measurements next, every select
  the same width as every text field.

**Every control in an inspector is one width.** The panels had grown a width per
field, so a column of controls stepped in and out down its right-hand edge.

**Units moved inside the fields.** A unit floating outside the box reads as a
separate thing on the row, drifts out of alignment the moment two fields sit
side by side, and leaves the field claiming to be a bare number. `12 ft` is one
value. The generic number field learned about `unit: 'degrees'` too — it had
been quietly showing bearings with a metre suffix — but degrees get the sign
_inside_ the value rather than in the suffix slot: feet are a unit **of** a
value, degrees are part of how the value is written, and `240 °` is not how
anybody writes a bearing. Which means an angle cannot be `type="number"` and
cannot reformat while you are typing in it, so `DegreeField` holds a plain draft
while focused and formats on blur.

### Two rearrangements that changed behaviour

**"Not part of a hole" is now an option in the belongs-to picker**, not a
checkbox beside it. `standalone` is still a real property — `rules.ts` reads it
to stop reporting a practice basket as unassigned forever — but as a separate
checkbox it could contradict the picker next to it. As the third option in that
picker it cannot. "Not assigned" and "not part of a hole" sound alike and are
different claims: one is waiting to be given to a hole, the other never will be.

**"Align to fairway" is the absence of a stored bearing, not a flag.**
`footprintOf` already prefers a stored `bearing` and falls back to the fairway's,
so the behaviour existed — what was missing was any way to see or set it. A
second boolean saying which mode you are in could disagree with the geometry;
this cannot, because it is the geometry. Unticking writes the angle the pad was
already facing, so the field opens on a real number: you are taking over a
value, not inventing one.

### The corrections round

Everything above was drawn, looked at, and then corrected. What changed:

**Selection is a colour change and nothing else.** It used to also thicken the
stroke and add a casing, which moves every edge of the thing you just clicked —
so the shape appears to grow at the moment you are trying to judge where it
sits. Geometry stays put; it turns blue. `derived-corridor` joined
`INTERACTIVE_LAYERS` last, so **clicking a corridor selects its hole** (via a
`selectAs` property on the corridor's GeoJSON) while a tee drawn on top of it
still wins the click. The corridor also went from 0.5 to a flat 0.75 opacity —
at 0.5 over satellite imagery it was more or less invisible over grass.

**All the checkboxes became switches.** None of them wait for a Save — the
corridor leaves the map as the thumb slides — and a checkbox is the control that
promises one. The new `Switch` renders as `role="switch"`, which is why the
browser tests grew a `setSwitch` fixture: Playwright's `check`/`uncheck` refuse
anything that is not an input.

**The accordions animate, and only one opens at a time.** `AccordionGroup`, for
the reason the sections fold in the first place: they share a bounded column
with the hole list, and two open sections is enough to start squeezing it.

**Analysis lost its sub-headings.** Three titled groups of one or two rows each,
inside a section that itself folds — a heading over a single row says the same
word twice in two type sizes. The heading is the row's label now: `Plays as`
became `Skill level`, `Drawn` became `Features drawn`.

**A missing site is an action, not an absence.** With no boundary the site row
used to disappear entirely, which was right about not printing "0 acres" — that
reads as a measurement rather than the absence of one — and wrong about
everything else: acreage is one of the two numbers the section's preview
promises, and a row that is not there leaves no trace of what is missing or how
to get it. It now offers **Draw a property boundary**, which arms the tool. That
made `coursePanel` a render prop: tool state belongs in the editor next to the
map, so the editor hands the panel the actions it needs rather than the shell
reaching in for them.

**The course description grows downwards.** As a single-line input it truncated
at the panel's width, so a sentence became unreadable the moment you left the
field — the field was hiding its own contents. `TextArea` sizes itself with a
grid cell and a hidden pseudo-element carrying the same string: no ref, no
resize observer, no frame where the box is the wrong height.

**Disabled looks disabled.** A greyed value alone reads as low contrast rather
than as locked, which matters now that "Align to fairway" disables the facing
field beside it rather than leaving it editable and ignored. `TextField`'s
disabled state is dashed and dimmed.

**The tool rail moved to top centre**, level with the two panel columns it sits
between, and the holes panel now hugs its content instead of taking every pixel
the course panel left — a one-hole course had a card of empty space under its
single row.

**Two ways to find the course again.** Selecting a hole in the list frames it,
so an eighteen-hole list is navigation rather than a list of names; and
`courseIsAdrift` watches for the course being panned off the edge or zoomed down
to a speck, which puts a **Recenter on course** button under the rail at exactly
the moment it is useful and nowhere the rest of the time.

That last one broke a browser test in a way worth recording: `geometry.spec.ts`
placed a basket at a canvas pixel, selected a hole twenty lines later, and
clicked that same pixel — which the camera had since flown away from. Fixed
detection is `clickFeature`, which projects the feature's own position at the
moment of the click.

### Deliberately not in this PR

**The Features section on a hole is still one shot.** A hole with three tees and
three pins is nine shots and the panel still picks one to describe. Making that
a real list is the multi-tee work, and it wants layouts first.

---

## Terrain overlays — what landed

Imagery answers what is growing there and where the paths already run. It cannot
answer the question that decides half a course's routing: **which way does this
fall, and by how much.** A hole that plays flat in a photograph and drops fifteen
metres in its last eighty is a different hole.

### One style, switched rather than swapped

The enabling change, and it is not about terrain at all. Changing the basemap
called `setStyle`, which throws away every source and layer the app added and
re-parses the document — a large hammer for "show a different picture", and one
that had already cost a real bug: `FeatureLayer` had to reinstall its whole scene
on `styledata`, that handler was bound once, so it closed over first-render props
and re-added the sources with an empty document. Switching the basemap emptied
the map until you reloaded.

So **every basemap is a source in one style from the start**, and switching is a
`visibility` change. MapLibre does not request tiles for a source no visible
layer uses, so the two unused basemaps cost a few lines of JSON and nothing else
— there is a test for exactly that claim, because the whole design rests on it.
Nothing is ever removed, so the course, the handles and the preview are never
disturbed. `setStyle` is gone from the app entirely.

Once layers are switched rather than swapped, **an overlay is not a new concept**
— it is another layer that starts hidden. That is the entire architecture.

### The readiness trap

`map.isStyleLoaded()` looks like the right gate for "can I change a layer yet"
and is not. It means every _source_ has loaded too, and it stays false while any
of them is still fetching — on a bad network, forever. Gating a visibility change
on it means a switch that silently does nothing.

What has to be true is that the **layers exist**, which happens as soon as the
style JSON parses. `styleReady` checks that directly. The effect applies
immediately if it can and waits on `styledata` if it cannot, dropping the
listener the moment it succeeds — that last part matters, because applying
visibility itself fires `styledata`.

This is not hypothetical. Restoring the autosave is asynchronous: the map is
built from a default document and the real one, which may have had hillshade on,
lands a beat later. The first version of this used `once('load')`, which never
fires if load has already happened, and every overlay toggle did nothing.

### Hillshade and contours, from one fetch

[AWS Open Data terrain tiles](https://registry.opendata.aws/terrain-tiles/):
keyless, no signup, no billing relationship — the same bar every basemap has to
clear. Terrarium encoding, which MapLibre decodes natively.

**Contours are computed in the browser**, not fetched. `maplibre-contour` runs
isolines over the elevation tiles in a worker and hands MapLibre a vector tile.
So the hillshade source points at that library's shared DEM protocol rather than
at S3: with both overlays on, a tile is downloaded and decoded **once** and
serves the shading and the lines.

**Igor hillshade, not the default.** The standard method darkens by slope in both
directions, which over aerial imagery reads as grime — flat ground goes muddy and
the photograph stops being legible. Igor shades only the shadowed side, so canopy
still looks like canopy and relief arrives as a separate signal. Over imagery the
highlight is fully transparent for the same reason; over a dark canvas the two
inks swap, which is the next section.

**Contours are quoted in the reader's units.** The interval and the
metres-to-feet multiplier are encoded in the tile url, so switching units
re-points the source with `setTiles` rather than rebuilding anything — and it
compares before writing, because re-pointing throws away every contour tile
already computed.

**Warm tan is the fourth channel.** The drawing is white, selection is blue, OB is
red. Terrain is not part of the design and not the interface talking about the
design — it is a reading of the ground both sit on — so it needs a hue that
cannot be mistaken for any of the three. It is also what a topographic sheet has
used for a century.

### Dark basemaps, and which way round the shading is inked

Dark is the default theme, and the topographic and street maps were bright white
rectangles inside it. **A dark basemap has to be different tiles, not a filter.**
MapLibre's raster paint offers brightness, contrast, saturation and hue — and no
invert. Darkening a light map without inverting it drags the paper to mid-grey
while the labels stay black, so the result is *less* readable than what it
replaced. Only tiles a provider drew dark are actually dark.

Esri's Dark Gray Canvas stands in for both, because keyless dark tiles are what
exists. That is the better half of the trade here: a canvas is deliberately
drained of terrain colouring so whatever is drawn over it reads, and this app
draws hillshade and contours from a real DEM — so the dark Topographic is *our*
terrain on a neutral ground rather than Esri's tinting fighting ours. It ships
its labels as a second service, so it is the one basemap drawn as two layers; a
street map with no street names is a picture of roads.

**Imagery has no dark twin.** A photograph of the ground has no light mode to
invert — it is whatever colour that ground is.

**The shading's ink follows the ground, not the interface.** Igor splits every
slope into a lit half and a shaded half and paints them with two separate
colours, so relief can be drawn with *either* ink alone. Over a light or
photographic base, black on the shaded side; over a dark canvas black is
invisible — a shadow on near-black ground is nothing at all — so the relief has
to come from light on the lit side instead.

The first version of this keyed the ink off the theme, which is a different
question and was wrong on the app's most common screen: dark theme over
satellite is a photograph underneath, and inking it white washed out the detail
the imagery was chosen for. `groundIsDark` answers the real question — *did the
tiles that actually resulted come out dark* — and the attribution line reads
from the same place, so the app can never credit tiles nobody is looking at.

**Unverified when shipped.** The sandbox this was built in blocks every tile
host, so the dark canvas endpoints could not be exercised before merging. The
max zoom is deliberately under-claimed at 16: past a source's real limit the
provider returns nothing and the map goes blank, short of it MapLibre overzooms
the last good tile. Blurry beats blank. The credit is `Tiles © Esri` and no
contributor list, because the real list is the service's own `copyrightText` and
nobody has read it — inventing one to sit beside a true credit would be worse
than the short version.

### MapTiler, behind a key, with the keyless path kept

There is no dark map from OpenStreetMap: the openstreetmap-carto maintainers
declined to make one and asked for colour variants to live in separate projects.
That is what sent the Street map to Esri's canvas in dark mode — a change of
*data*, not only of colour — and it is what made a keyed provider worth the
trade at last.

**Two registries, chosen at build time.** With `VITE_MAPTILER_KEY` set, all
three basemaps and all three dark twins come from MapTiler; without it the app
draws the keyless sources it always did. The fallback is not a stopgap. A
missing key would otherwise mean a blank map, and three things depend on the app
working with no account: the browser suite, which stubs tile hosts rather than
buying quota; anyone self-hosting; and the first thirty seconds of a new
visitor's session, which is the entire argument for a tool that opens and works.
Both registries share ids, labels and roles, so nothing downstream can tell
which one it got.

**Raster, not vector, and that is a real trade.** MapTiler's styles are vector
and vector would be crisper. But a vector basemap is a whole style document —
its own sources, glyphs, sprite and a hundred layers — and three of those cannot
coexist as hidden layers. Switching would mean `setStyle` again, the call this
app removed because it emptied the map. 512px tiles narrow the gap and cut the
request count to a quarter, which matters because MapTiler bills per tile
request.

**Satellite finally has a dark twin.** `satellite-v4-dark` is night imagery
rather than a filter over the day pass, so on the MapTiler path every map has a
dark version and the "no dark twin" branch never fires. `groundIsDark` still
earns its place: it is what the keyless path needs, and what keeps the shading
correct on either.

**The ids name the role now, not the provider.** `esri-imagery` stopped being
true the moment a second provider could serve the same role. `basemapId` is a
document field that outlives the registry that wrote it, so `LEGACY_IDS` maps
the old spellings forward — without it every course saved on the topographic map
would silently reopen on satellite, which is the kind of quiet data damage a
migration exists to prevent.

**Two obligations to settle before launch.** MapTiler's free tier is
non-commercial and requires their logo as a linked image, which no attribution
string satisfies; a paid plan removes both problems. And the satellite credit is
`© MapTiler` alone, because that aerial is not OpenStreetMap data and the actual
imagery partners are listed by MapTiler rather than known here — the same
honesty the Esri canvas line is held to.

### Saying what the data is worth

Roughly 10m over the US and 30m elsewhere. That shows a ridge, a bowl and a fall
line; it does not show the two-metre mound behind a green, and a contour through
one is interpolation rather than measurement. The interval **stops tightening
past z13** because the data stops improving there — drawing foot contours off a
30m grid would be inventing precision — and the layers panel says so next to the
switch. Everything else in this app is a measurement; this is a reading, and the
interface has to be honest about the difference.

### A popover, because the layers control became a panel

It was a menu with a radio group, which was right while picking one of three was
all it did. Now there are two groups and you _work_ in it — flip hillshade, look
at the map, flip contours, look again — and a menu that closes on select is
fighting that. `Popover` is Radix, for the reasons `Menu` and `Dialog` are.

**Attribution composes**, because the map does. Turning on an overlay adds a
second provider's data to what is on screen, so it adds that provider's credit —
and turning it off takes it away again, since crediting a source that is not
being drawn is its own kind of wrong.

### Testing something computed in a worker

The browser tests stub a **synthetic terrarium tile**: a hillside falling across
the diagonal, 0m to about 510m corner to corner. A flat tile would satisfy "the
layer is visible" and prove nothing about whether the isoline generator ever ran,
which is the only interesting question. Verified by flattening it and watching
the test fail.

### Deliberately not in this PR

**3D terrain.** The same DEM would drive `setTerrain` in a few lines, but it
changes how every drawing tool converts a screen point to a ground point while
the map is tilted — placement, dragging and vertex editing all need re-testing
under pitch. Hillshade and contours carry the elevation information and are inert
at pitch 0, which is where all the drawing happens. Tilt gets its own PR.

**Slope shading.** Arguably more useful than contours for disc golf — where a
disc rolls, where water runs — but MapLibre has no native slope layer, so it
means computing a raster ourselves through a custom protocol. That is a
subsystem, not a layer.

**Parcels, and higher-resolution imagery.** There is no free nationwide parcel
source; only about ten US states publish a statewide layer. Both wait for a
per-jurisdiction registry or a keyed provider behind a tile proxy, and neither is
free.

---

## Site surveys — what landed

The global overlay reads roughly 10m data and says so. At 10m you get a ridge
and a fall line; you do not get the two-metre mound behind a green. **1m LiDAR
exists, free and public domain, for most of the United States and all of
England** — and the reason no app offers it as a basemap is that a global 1m
tileset is petabytes.

But **a course is about a square kilometre**, and a square kilometre of 1m
elevation is a few megabytes. That reframing is the whole PR: you do not need
global 1m, you need 1m _here_. So the designer brings a GeoTIFF for their own
site and the browser turns it into tiles. No backend, no API key, no
per-request cost, and it works anywhere LiDAR is published rather than only
where we built an integration.

### It was spiked before it was planned

Against a real USGS 3DEP tile, over the real internet, before any of this was
designed: ranged reads work, the projection comes out of the GeoKeys cleanly,
proj4 round-trips it, and the file carries six overview levels so the pyramid is
free. The one thing that would have killed the approach — `maplibre-cog-protocol`
refuses anything that is not already EPSG:3857 and does not reproject — is why
we resample ourselves rather than pointing a plugin at the bucket.

### Metadata in the document, pixels in IndexedDB

`course.siteSurvey` records the file's name, bounds, CRS, zoom range and the
resolution **actually achieved**. The tiles do not travel with it.

That split is deliberate rather than merely pragmatic. A `.hyzer` is a document
you email; forty megabytes of elevation is not. But someone opening a course you
sent should still be told the design was drawn against a 1m survey and which one
— that is a fact about how the course was designed. A missing survey is a
missing attachment, not a corrupt document, and the panel says so in those
words.

**The resolution reported is the tiles', never the file's.** A large file is
read from a coarser overview to fit a memory budget; claiming its headline
number would be the same overstatement of precision this app exists to avoid.

### Three things that only showed up in a browser

**Alpha is not an escape hatch.** The obvious way to mark "no data" is a
transparent pixel, and MapLibre's DEM decoder ignores alpha entirely — it reads
RGB regardless. A transparent pixel carrying zeroes decodes as −32768 and
hillshades as a thirty-kilometre pit. Edges are handled by **clamping to the
nearest edge sample** instead, the way every texture sampler does, so a tile
straddling the survey's border continues the last real elevation outward
instead of falling off a cliff to sea level.

**`maplibre-contour` fetches its own tiles.** `DemSource` takes a URL and calls
`fetch` on it in its worker, so a MapLibre custom protocol like `survey://` is
invisible to it — MapLibre resolves those, `fetch` does not. The failure was
silent in the worst way: hillshade drew, because MapLibre loaded that source,
and contours simply never appeared. `LocalDemManager` is the seam — same isoline
machinery, exported separately, and it accepts a `getTile` we can point at
IndexedDB.

**Contours need a 3×3 neighbourhood, and reject the tile if any of the nine is
missing.** A course-sized survey is narrower than three tiles, so it produced
_zero_ contours. Fixed with a one-tile skirt of edge-clamped tiles that the
generator can read and MapLibre never draws, because both survey sources carry
the survey's real bounds. Diagnosed by instrumenting the page — the import was
provably correct (right tiles, right zooms, right bounds) and the output was
still empty, which is not something types or unit tests can tell you.

### The projection table is generated, and proves itself

The importer began with a hand-written table of three projection families — UTM,
British National Grid, plain latitude/longitude — which lasted exactly until a
file arrived in **EPSG:6428, NAD83(2011) / Colorado Central (ftUS)**. US State
Plane alone is about 120 zones across several datum realizations, and every
country has a grid of its own: a curated list is a list that is always missing
the one in front of you.

So the whole EPSG registry is compiled in from `epsg-index`, a devDependency
that never ships. 7357 systems, in a chunk that loads only on import — 132 KB
gzipped, next to `geotiff`'s 114 KB.

**Two families are deliberately left out**, and for the same reason: proj4js
does not throw when it cannot do the job. It returns `NaN`, or a plausible
coordinate in the wrong county. So projections it does not implement, and
definitions needing a grid-shift file we do not ship, are excluded — and the
importer says plainly that it cannot read them. A refusal is recoverable; a
survey silently in the wrong place is not.

**The generator refuses to emit a table it cannot verify.** It checks a real
USGS tile's corner against the coordinate measured in the original spike, checks
that Colorado Central puts Denver at a plausible ftUS easting (the linear-unit
trap), and compares every trimmed definition against its original across a wide
sample. That last check earned its place immediately: stripping an all-zero
`+towgs84` looks completely safe and is not — its presence is what tells proj4js
the datum is known, and removing it silently moved every system built on a
non-WGS84 ellipsoid.

### Where the work is testable

Everything that can be wrong quietly is pure and lives in core: tile bounds,
terrarium encoding, and the resampler, tested against grids whose every value
encodes its own position. Terrain that lands mirrored, half a pixel north, or
with nodata smeared into real ground all render as _something_, and something is
much harder to notice than nothing — so the fixtures ramp with the column index
and the assertions read the position back out.

The browser tests import a real GeoTIFF, written with `geotiff`'s own writer
rather than hand-rolled: a fixture we encoded to match our own reader would
prove nothing about reading a real file.

### Deliberately not in this PR

**Canopy height.** LiDAR ships two surfaces — bare earth and top of canopy — and
subtracting them gives tree heights per square metre, which answers "can I throw
over that gap" from data. It is the most novel thing this data enables and it
wants a second import slot and a way to display a derived raster; neither exists
yet.

**Fetching surveys for the user.** OpenTopography has an API that would remove
the download step, and it needs a key that is free only for academics. A tiling
backend that subsets 3DEP for a bounding box would be better than either, and
waits for the backend that arrives with accounts and sharing.

---

## Elevation profiles — what landed, and the corrections that followed

Selecting a hole draws the ground its shot is thrown over, sampled along the
fairway that was actually routed rather than the straight line between the ends.

**It also closed a gap Holes and par left open.** `effectiveLength` has carried an
`elevationGain` term since it was written and had always been handed a zero,
with a comment reading "elevation waits on terrain". `[PAR]` p8 adds three times
the rise from tee to target, which is the difference between a par 3 and a par 4
on the same measured distance.

**Only an imported survey moves a par.** The global overlay is roughly 10m
posted with vertical error reaching ±16m, and the formula multiplies by three —
a par computed from it could be two strokes wrong from measurement error alone.
It draws the chart and stops there. `elevations` is built from the profiles
rather than filtered downstream, so "shown on a chart" and "changes a number"
cannot drift apart.

Four corrections landed on top of it, and three came from looking at the app
rather than from a failing test:

- **Chart smoothing.** Elevation is read by nearest neighbour from a raster, so
  consecutive samples inside one DEM cell come back identical and the sample
  crossing into the next carries the whole step — ground falling at 8% reported
  17%. The survey averages its elevation grid before tracing; the first attempt
  used the isoline library's `subsampleBelow`, which is quadratic in grid width
  and made tiles exceed their timeout and come back empty.
- **A vertical axis**, because a profile with no scale is a shape rather than a
  measurement.
- **Vertical units.** A Colorado survey in State Plane US survey feet, read as
  metres, reported ground at 22,000 ft. A GeoTIFF states the unit of its
  coordinates and need not state the unit of its elevations;
  `VerticalUnitsGeoKey` is used when present, and otherwise the unit the file
  states for its coordinates — which is at least a fact from the file, where
  assuming metres was not.
- **Clipping, and several GeoTIFFs.** A survey's edge tiles are half data and
  half nothing, and that half used to carry the last real elevation copied
  outward — drawn as smears off the side of the data with contour lines running
  out of them. Alpha is a real coverage mask now: the contour generator gets a
  decoder that returns `NaN` there, which `maplibre-contour` skips, so the
  clipping is exact to the pixel. A course is also routinely larger than one
  published LiDAR tile, so a survey became a set of files whose overlaps are
  composited pixel by pixel.

**The undo bug that CI had been reporting for eight pushes.** Two tests failed
on every push to that branch and were never looked at, because the suite was
green locally. `useAutoLocation` reverse-geocodes the first thing you draw, and
`setLocation` was undoable — so the stack read _your drawing, then a field you
never typed_, and one ⌘Z after drawing took back the invisible field. Seeded
values are now the same argument as camera moves, arriving later: recorded in
the document, not an edit. The geocoder was also the one request in the app that
fires without anyone asking and was never stubbed, which is exactly why local
and CI disagreed.

---

## Multiple tees, pins and fairways — built

**No schema change.** Since **Model v2** the document has held `hole.teeIds[]`
and `hole.targetIds[]`, sparse `Pair` records carrying a `fairwayId` and a
`parOverride`, and ops for every one of them. The model was ready and the
interface presented a course of one tee and one pin. This is the interface
catching up.

### The scorecard

`viewHoles` resolved every hole through `representativePair`, so a hole with
three tees reported one length and the other two existed in the file and appeared
nowhere. `scorecard` in core is the other reading: one row per hole, **one column
per skill level**, every length at once.

Columns key on the level rather than on the tee feature because that is what a
tee's colour means — and because it is what lets a column span the course: hole
3's blue tee and hole 4's blue tee are different features and the same column.
Uncoloured tees share an `Unmarked` column, listed last, so a course nobody has
classified produces exactly one column and keeps the plain list it always had.

Each column's total carries **how many holes it covers**, not just a sum. A red
tee on six of eighteen holes totals six holes' length, and printing that under an
eighteen-row card overstates the course by a factor of three; the panel says so
in words when it is true.

Cells are bare numbers with the unit stated once, the way a printed card works —
`1476 ft` wraps in a 44px column and turns an eighteen-row card into thirty-six
rows of half-numbers. A **Length/Par** control says which number the cells hold,
because a real card carries both rows per hole and this panel has room for one.

### One resolution, four consumers

`chosenPair` is now the only place a hole's shot is decided: the designer's pick,
else the active layout's play, else the first tee and first target. The map's
corridor, the card's length, the hole panel's par and the ground the elevation
chart samples all go through it, so they describe one throw by construction
rather than by four functions agreeing.

The pick is **per hole and lasts the session**. It used to be one value for the
whole editor, cleared on every hole change, so comparing hole 4's long pin
against hole 5's could not be done in the app that stores them. It is still not
in the document — that is what a layout is for.

It is also **validated on read**. Nothing checks a pick on write and the document
moves underneath it; delete the pin you were measuring to and the pick names a
target the hole no longer has.

### The shots not in play

A hole draws one corridor — nine overlapping corridors down one strip of land is
not a drawing of anything — but a second tee used to be a pad with no line
leaving it, which reads as something the designer forgot.

`alternativeShots` returns them as **a cross rather than a grid**: every tee to
the pin in play, and every pin from the tee in play. Three tees and three pins is
four alternatives instead of eight, each differing from the chosen shot at
exactly one end. They draw half the width of a centreline, uncased, with a longer
gap in the dash, and follow the same two switches as the centreline itself.

### Building a hole from the hole

The Features section lists every tee and every basket instead of showing one at a
time behind a dropdown — the hole's shape is now the panel's shape, and the mark
on each row is the picker. **Draw a tee** and **Draw a basket** arm the tool with
the hole still selected, replacing "draw it loose, then claim it from a dropdown
that only appears once a loose one exists". Removing an end takes it out of the
hole and leaves the feature on the ground; deleting it is a different action and
lives on the feature itself.

### Deliberately not in this milestone

**Choosing which shot is "the" shot in the document.** That is what a layout is,
and putting a per-hole default in the document as well would be two mechanisms
answering one question. That is **Layouts and routing**, next.

---

## Workspaces and focuses — planned

The interface has grown past what one undifferentiated map editor can hold. The
palette is fifteen kinds and will roughly double; the left panel is already three
different panels wearing one hat; and the work still to come — routing, shot
simulation, printed maps, engineering deliverables — is not more of the same
editing, it is different _kinds_ of work on one document.

The tempting answer is a mode per activity. That is the wrong shape, and the
reason is worth writing down.

### Four levels were hiding in one list

The activities that seemed like peers are not peers:

| Level            | What it does                  | Examples                          |
| ---------------- | ----------------------------- | --------------------------------- |
| **The document** | Holds everything              | The course                        |
| **Editors**      | Change the document           | Holes, terrain, layouts           |
| **Analyses**     | Read it and report            | PDGA checks, shot simulation      |
| **Outputs**      | Read it and produce artifacts | Maps, signs, engineering packages |
| **Settings**     | Change how you see it         | Basemap, styles, display options  |

"The course" is not a mode. A mode that edits a name, a location and some notes
is a properties panel, and it already exists.

Nor are "holes and features" and "terrain and environment" two editors. A tee and
a tree are both a `Feature`; only `kind` differs. The difference between them is a
filter on the palette, not a different program.

### The test is whether the work interleaves

A mode you leave and re-enter several times a minute is not a mode, it is an
obstacle. Sorting the work by that test gives a clean split:

| Pair                    | Interleaves?                                                  |
| ----------------------- | ------------------------------------------------------------- |
| Holes ↔ terrain         | Constantly — you place a basket, then draw the tree behind it |
| Holes ↔ simulation      | Constantly — simulate, move the pin, simulate again           |
| Holes ↔ layouts         | Sometimes                                                     |
| Design ↔ maps and signs | No — a separate session, at the end                           |
| Design ↔ engineering    | No                                                            |

So there are **two hard modes, not seven**.

### Two axes

**Workspace** — changed rarely, replaces the screen.

- **Design** — the map editor.
- **Produce** — maps, signs and engineering packages.

**Focus** — changed constantly, inside Design. Keeps the map, the camera and the
selection.

- **Play** — tees, baskets, fairways, mandos, drop zones, OB.
- **Land** — trees, water, paths, roads, buildings, ground types.
- **Routing** — layouts and plays.
- **Simulate** — the shot model.

A focus changes exactly three things: which tools the rail offers, which panel
the left column shows, and which map layers accept a click.

**A focus never hides a feature.** In Land you still see every tee, and you can
still click one; the palette simply does not offer to draw another. That is the
whole difference between a mode that helps and a mode that fights you, and it is
the single rule this milestone must not break.

The left panel is the strongest argument for focus, stronger than the tool rail:
a scorecard and a play list are genuinely different panels, and today they would
have to share one.

### Analysis is a switch, not a focus

PDGA checks are a spell checker. They apply to every focus, so they are an
overlay with a toggle — findings highlighting the geometry that provoked them,
rather than a list you read beside the map. Most of the machinery exists:
`checkCourse` produces the findings and `onRevealFinding` already frames them.

### Styles are the mechanism, not decoration

Per-feature styling in `props` would put two hundred copies of one style in a
course with two hundred trees. The document gets a **style sheet** instead: named
styles, referenced by features, the way CSS works.

That buys something less obvious than customisation:

> A tee sign and a construction drawing are the same geometry with a different
> style sheet.

Styles are therefore what makes the Produce workspace possible at all, which is
why they sit immediately before it in the roadmap rather than among the
nice-to-haves. It is a schema change and needs a v3 migration.

### The simulator must show what it does not know

A flight model draws a smooth curve, a smooth curve reads as exact, and a
designer moves a basket because of it. If the model is a guess, the tool has
given confident bad advice — the same failure as the survey that reported 22,000
feet of elevation, and the same principle applies: _numbers must be true_. Where
the honest answer is a wide area, the simulator draws a wide area, not a line.

### Engineering is blocked, not scheduled

Every other milestone is a view of data the document already holds. This one is
not. A parks department package needs quantities and dimensions the model has no
field for — pad thickness and material, path width and surface, the diameter of
a tree marked for removal.

Worse, nobody here knows what such a package actually contains. Designing it from
imagination would produce a plausible document that no contractor can build from,
which is precisely the class of output this project refuses to ship. It stays
blocked until a real drawing set from a built course is in hand.

---

## Licence and business model

The project shipped under AGPL-3.0 from the first commit through
[#15](https://github.com/adam-dutton/hyzerlines/pull/15). Future versions move to
a proprietary licence, with a free tier and a paid subscription.

### What the change can and cannot do

**It can** cover everything from here. The repository has two commit authors —
the owner, and Claude as co-author on his commits. There are no third-party
contributors, so there is no copyright to clear and no CLA to chase.

**Dependencies do not block it.** All 297 packages in the tree were checked: 288
are MIT, ISC, Apache-2.0, BSD, 0BSD or CC0; two are MPL-2.0 (`lightningcss`,
whose files are not modified); the only AGPL entries are this project's own three
workspaces. Their attribution notices must still ship with a proprietary build.

**It cannot un-publish what is published.** Everyone holding an AGPL copy keeps
AGPL rights to that copy, permanently, and may fork from the last AGPL commit.
Making the repository private changes nothing about that. This is the accepted
cost, not a problem to solve.

### The real constraint is the map services, not the licence

The application calls five external services:

| Service                                 | Role                                             |
| --------------------------------------- | ------------------------------------------------ |
| `server.arcgisonline.com` (Esri)        | The **default** basemap, and the topographic one |
| `tile.openstreetmap.org`                | A basemap                                        |
| `photon.komoot.io`                      | Location search                                  |
| `fonts.openmaptiles.org`                | Map label glyphs                                 |
| `s3.amazonaws.com/elevation-tiles-prod` | Terrain elevation (open data)                    |

Four of those are free community infrastructure. A free, open, donation-funded
hobby project is an ordinary user of them; a paid subscription product is a
different kind of user entirely. The Esri question was already logged as an open
item in this document — a paid product promotes it from a note to a blocker.

### What Esri's terms actually say

Read from Esri's **Master Agreement, Products and Services** (revised 1 August 2025) and the **Product-Specific Terms of Use** (13 November 2025). Two other
documents — the Master Agreement for Services and the Professional Services
Agreement — cover Esri performing consulting work and do not apply.

**Commercial use is permitted, and authentication is mandatory.** E300 footnote
89, which governs ArcGIS Location Platform:

> Customer may distribute directly, or through its sales channels,
> revenue-generating Value-Added Applications / Customer Application, that access
> ArcGIS Location Platform through Authentication, to third parties. **All
> revenue-generating Value-Added Applications / Customer Application are required
> to use Authentication when accessing ArcGIS Location Platform.**

Master Agreement 1.1 grants rights "in consideration of Customer's payment of all
applicable fees … as set forth in the Specifications and applicable Ordering
Documents". There is no subscription and no Ordering Document today, so there is
no grant today. **The current build is already outside the terms**, before any
price is charged, and 3.3.a forbids using Data "in any unauthorized service or
product". The fix is a subscription and an API key on every request.

**Exported maps are permitted — the Produce workspace survives.** Section 3.2.b
allows representations of Data "in hard-copy or static, electronic format (e.g.,
PDF, GIF, JPEG, HTML)" and allows including them in "other reports or documents
containing map images" delivered to third parties, provided an attribution
statement is affixed. Section 3.2.d restricts _geocoded_ results to
"noncommercial/non-revenue generating" use; 3.2.b carries no such limit, and the
drafters added that restriction where they wanted it.

The attribution obligation attaches to the representation, not only to the
screen. **Every exported file must carry it.** That is a rule of the Produce
workspace, not a setting in it.

**Offline caching of Esri imagery is prohibited.** Section 3.2.c permits taking
basemaps offline only through Esri Content Packages, and only "for use with
licensed ArcGIS Runtime applications and ArcGIS Desktop" — this app is neither.
It then says plainly: "Customer may not otherwise scrape, download, or store
Data." E300 footnote 10 repeats it for tiles.

**This changes the Offline and PWA milestone.** Either it ships without a
basemap, or it ships with a different supplier's imagery. It cannot cache Esri's.

**Cost is consumption-based.** E300 footnote 103 describes pre-paid units, with
suspension at 100 percent of the allocation and optional billed overages. Basemap
cost is therefore variable and scales with use, which the price model must
absorb.

Two items remain open. Section 3.4 flows down additional terms from individual
data suppliers at `esri.com/legal/third-party-data`; the aerial imagery credited
on screen — Maxar and Earthstar Geographics — has not been checked there. And
3.3.h forbids using the Data to train machine-learning systems, which is worth
knowing before anyone proposes a feature that would.

The other three services — OpenStreetMap tiles, Photon and the OpenMapTiles glyph
server — have not been read. Budget for a commercial tile host and a commercial
geocoder as a recurring cost.

### Where the free line falls

The mode architecture draws it without any special pleading:

- **Free — the Design workspace.** Play, Land, Routing, Simulate. Local-first, on
  IndexedDB and `.hyzer` files. A free user costs almost nothing to serve.
- **Paid — the Produce workspace.** Maps, tee signs, engineering packages. The
  artifact is the thing worth paying for.
- **Paid — styles**, because styles are what Produce runs on.
- **Paid — accounts, sync and sharing**, where the server begins.

Gating follows the architecture instead of fighting it.

**The consequence of keeping the backend late** — a deliberate choice — is that
the subscription cannot start until that milestone lands. Produce can ship
earlier, but selling it needs either accounts or some lighter licensing
mechanism, and that decision is still open.

---

## Layouts and routing — planned

A layout is an **ordered sequence of plays**, not a per-hole selection map,
because it can skip a hole and can play one twice — once to pin A, once to pin
B. Neither is expressible as "pick a tee and a pin for each hole". The number a
player sees is the position in that list; `hole.number` stays the designer's
name for the corridor, which is what the map labels.

`layouts.ts` has carried all of this since **Model v2** — `layoutPar`, `layoutLength`,
`layoutSkillLevel`, `isLayoutPlayable`, `measureLayout` — and the ops exist.
**Nothing in the web app dispatches one.** The Layouts tab renders a sentence
saying the feature is coming.

What it needs: create, name and delete a layout; switch the active one; build
the play list with add, remove and reorder; a per-layout scorecard numbered by
position; layout totals; and the `isLayoutPlayable` findings surfaced where the
routing is edited rather than in the general checks list.

**Skill level is read, never stored.** A layout mixing blue and red tees has no
level, and `layoutSkillLevel` returns null rather than a plausible average —
every PDGA figure is defined per level, so an averaged one would be a number
with no published basis.

---

## Licensing

**AGPL-3.0-or-later.** The project is donation-funded and publicly hosted, and
the AGPL's section 13 is the specific reason for the choice: anyone may
self-host, fork or modify, but running a modified version as a network service
obliges you to offer users the source. That keeps a company from taking
donor-funded work closed and reselling it as a hosted product.

Section 13 also imposes an obligation on _us_: the running app must offer its
source to users. That is the "Source" link in the credit line at the bottom
left, and the "Source code" item in the course menu — compliance, not
decoration. Do not remove them. `chrome.spec.ts` asserts the link is on screen,
so this survives the next person rearranging the chrome.

---

## Design system — what landed

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

The `ShortcutsOverlay` in **Foundations** hand-rolls focus and Escape handling; it
moves to Radix `Dialog` in **Design system**.

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

## PDGA standards — what landed in Holes and par

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
get wrong, so **Safety** will derive it from a stated dispersion model instead — a
number the designer can see the reasoning for, not a constant attributed to a
standard that does not contain it.

Whether to move the rules into a **versioned JSON ruleset file** — so clubs can
layer on local rules without a code change — is deferred. It was the original
plan, but the checks that exist need real geometry (segment intersection, feature
lookup), not a declarative predicate, and a data format invented before there is
a second consumer would be a guess. Revisit when local rules are actually asked
for; `Authority` already has a `'local'` case reserved.

## Par — what landed in Holes and par

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

**Elevation has since been fed into the formula** — see **Elevation profiles**.
This section read "elevation waits on terrain" for four milestones, which was
true when written and stopped being true without the sentence noticing.

The other two terms are still omitted, and still because the inputs do not exist
rather than because the model is simple: the dogleg term needs the distance to a
corner and the water term needs the detour a carry forces, neither of which the
document model represents. Omitted rather than estimated, and `effectiveLength`
is shaped to take them.

**Holes and par** removed an earlier `+10 m per mando` par penalty. It was
invented, it counted every mando on the course rather than the ones on the hole,
and the PDGA formula has no mando term. A real version needs mandos assigned to holes — then a mando is
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

- **Yjs for collaboration.** Revisit at **Accounts and sharing**, when the
  problem becomes concrete. The narrow `applyOp()` API from **Document model**
  exists to keep that swap cheap. (This named a PR number until the roadmap grew
  past it twice — the trigger was always accounts, not a number, which is part of
  why the numbers are gone.)
- **Tile provider at scale.** Esri's imagery terms need review before the app is
  promoted widely; a self-hosted or commercially licensed source may be required.
  Still unresolved: their terms page blocks automated fetches, and the only
  sources found were community threads rather than anything authoritative. It is
  the **default** basemap in a public app, so it is worth a human reading the
  real terms. USDA NAIP is public domain with no such ambiguity and would make a
  good US-only addition.
- **Where the shot picker's state belongs.** **Multiple tees, pins and fairways**
  keeps it in the editor and **Layouts and routing** gives the document a layout. If a designer wants "hole 7 is normally played
  from the long tee" _without_ building a routing, that is a third thing and
  neither PR provides it. Worth waiting to see whether anyone asks.
