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
| **7**   | Boundaries and acreage                                                             | ✅ done |
| **8**   | Layouts and routing: named layouts, skip, repeat, reorder                          | next    |
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
neither clear. PR 7 gives scope its own control.

---

## PR 7 — what landed

The acreage chart has been transcribed since PR 4 and unused, for exactly one
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

Also landed: the **scope control** deferred from PR 6. An OB line, a hazard or a
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
that clips a corner, and it belongs with the safety work at PR 12 where the same
containment machinery is needed anyway.

**Multiple boundaries with conflicting densities.** The largest one wins, which
is the only defensible pick without asking a question the interface has not
asked. A park split by a road is the real case and it is usually one density.

---

## PR 8a — the chrome, rearranged

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
reordering of the hole, tee, target and fairway inspectors. All of it is PR 8b.
The course panel is capped at 45% of its column and scrolls until then, which
is what stops it pushing the hole list out of reach — a stopgap the accordions
retire.

**Layouts.** The tab is there and says so in a sentence. A disabled tab is a
door that does not open and does not say why, and standing the frame up now
means the layouts PR does not also have to relitigate this panel's shape.

---

## PR 8b — the insides of the panels

The other half. PR 8a moved the panels; this rewrites what is in them.

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
the switch is in Settings next to the drawing aids, and stored per browser while
the aids beside it are in the document.

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
value. Degrees got the same treatment, and the generic number field learned
about `unit: 'degrees'` — it had been quietly showing bearings with a metre
suffix.

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

### Deliberately not in this PR

**The Features section on a hole is still one shot.** A hole with three tees and
three pins is nine shots and the panel still picks one to describe. Making that
a real list is the multi-tee work, and it wants layouts first.

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
get wrong, so PR 12 will derive it from a stated dispersion model instead — a
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
