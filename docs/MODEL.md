# The course document

Format version **2**. The reference for what a course _is_; see
[PLAN.md](./PLAN.md) for why, and [PDGA.md](./PDGA.md) for the figures the
measurements are read against.

---

## Five nouns

```
Feature   a thing on the ground, with geometry
Hole      a corridor: the tees and targets that sit in it
Pair      one tee → one target. THE UNIT OF MEASUREMENT.
Layout    a named, ordered sequence of Plays
Play      one entry in a routing: (hole, tee, target)
```

### The pair is the unit of measurement, not the hole

A hole with three tees and three pin positions is **nine different shots**, with
nine lengths and potentially nine pars. A single par on the hole is true of at
most one of them.

So distance, effective length and par live on the pair. The hole becomes a
container for the tees and targets that form those pairs, and keeps only what is
genuinely about the corridor: a number, a name, notes.

### A layout is a sequence, not a selection

A layout can **skip** a hole and can **play one twice** — once to pin A, once to
pin B. Neither is expressible as "pick a tee and a pin for each hole", and both
are ordinary things real courses do.

That makes the number a player sees a property of the _routing_: it is the
position in the list. `hole.number` is the designer's name for the corridor,
which is what the map labels and what survives a layout being reordered.

---

## Schema

```ts
interface Course {
  version: 2;
  id: string;
  name: string;
  location: string; // seeded from the map, then whatever you type
  description: string; // capped at DESCRIPTION_MAX
  notes: string;
  createdAt: string;
  updatedAt: string;
  view: View;
  basemapId: string;

  features: Feature[];
  holes: Hole[];
  pairs: Pair[]; // sparse — see below
  layouts: Layout[];
  activeLayoutId: string | null;
  dismissedRules: string[];
  display: Display; // which drawing aids the map shows
}

interface Feature {
  id: string;
  kind: FeatureKind;
  geometry: Geometry; // point | line | polygon (open ring)
  label: string;
  holeId: string | null; // null = course-level
  tags: string[];
  props: Record<string, string | number | boolean>;
}

interface Hole {
  id: string;
  number: number; // the DESIGNER's corridor label
  name: string;
  notes: string;
  teeIds: string[];
  targetIds: string[];
  showFairway: boolean; // default true
}

interface Pair {
  id: string;
  teeId: string;
  targetId: string;
  parOverride: number | null;
  fairwayId: string | null; // null = not drawn; measure the straight line
}

interface Layout {
  id: string;
  name: string;
  plays: Play[]; // ordered; index + 1 is the played number
}

interface Play {
  id: string;
  holeId: string;
  teeId: string;
  targetId: string;
}
```

### One action, one undo step

`{ type: 'batch', ops: [...] }` applies several ops as one, with the inverse
being the inverses in reverse. Moving a tee between holes is two `updateHole`s;
bending a fairway for the first time is an `addFeature` plus a `setPair`. Landing
those on the undo stack separately would let one ⌘Z leave the document in a state
nobody asked for — a tee in neither hole, or a pair referencing a feature that no
longer exists.

Undo coalescing crosses that boundary too. A drag that starts by creating a
fairway continues as plain geometry edits, and `canCoalesce` folds the later ones
into the batch that created it, so the whole gesture is one entry. The redo op
stays a batch rather than being replaced by the newest edit — replaying only the
last geometry change would target a feature that undo had just removed, and the
bend would silently disappear.

The ops a drag emits carry a **`gesture`** id, and one gesture is one undo entry
however long it took. Coalescing is otherwise a 700 ms window, which is a
heuristic for "these edits felt like one action" — fine for a run of keystrokes,
wrong for a drag, which has a definite start and end that the editor already
knows. A single long frame was enough to split a bend from the fairway it
created.

### Pairs are sparse

A pair only gets a record once it carries something the geometry cannot derive:
a par the designer overrode, or a fairway they drew. Every other pair is implied
by its hole's tees and targets, measured as a straight line, and costs nothing.

A three-tee, three-pin hole would otherwise create nine records the moment you
place the third pin, most of them empty.

**Par lives on the pair, not the play.** Par is a property of the shot, not of
the routing — the same tee and target in two different layouts is the same
throw. Setting it twice would be a bug waiting to happen.

### Scope, not a second collection

`feature.holeId` is null for course-level features. An OB boundary at the course
level and one on a single hole are the same thing seen at different ranges;
modelling them as separate arrays would give every rule, renderer and exporter
two code paths that drift, and re-scoping later would mean moving between
collections rather than editing a field.

### Membership: two fields, one fact

A hole lists its `teeIds` and `targetIds`; a feature carries a `holeId`. For tees
and targets those say the same thing, and **the hole's arrays are
authoritative** — pairs, layouts, par and every design check read them. `holeId`
exists so that scoped queries work the same way for a tee as for an OB line.

Two fields that can disagree is normally a bug waiting to happen. What makes it
safe is that nothing writes one without the other: every move goes through
`assignToHole`, which emits a single batch that removes from the old hole, adds
to the new one, and sets `holeId` to match. Order matters too — removal before
addition, so a feature dragged back where it started is not listed twice.

Assignment deliberately does **not** touch pairs. A par override on a tee that
moved to another hole is still that shot's par, and the structural checks will
say if the result stops making sense. Quietly deleting a number the designer set
is the worse failure.

The **first** tee and **first** target are the hole's representative pair until a
layout routes it, so their order is meaningful rather than cosmetic. That is what
`moveToFront` is for, and why the feature panel offers it as an explicit action.

**Removing is not deleting.** Taking a tee out of a hole is `assignToHole(…,
null)`: it leaves the feature on the ground, still drawn and still selectable,
because it is still somewhere a designer put it deliberately. Deleting it is a
different action and lives on the feature itself. The hole panel lists every tee
and every basket with both — the mark that says which shot is being measured, and
the control that takes an end out of the hole.

---

## Feature kinds

Fifteen, in three groups.

| Group               | Kinds                                                        |
| ------------------- | ------------------------------------------------------------ |
| **Play**            | `tee` `target` `fairway` `mando` `dropzone`                  |
| **Regulated areas** | `ob` `hazard` `casualArea` `requiredRelief`                  |
| **Reference**       | `boundary` `notedArea` `notedPoint` `path` `water` `terrain` |

`casualArea` and `requiredRelief` are **separate kinds**, not one kind with a
flag, because the Rules of Play make them different things — 806.03 lets a
player _optionally_ relocate without penalty, 806.04 requires it. A designer
drawing one is making a specific claim about how the hole plays, and the map
styles them differently so the claim is visible.

### Props by kind

| Kind  | Props                                                                    |
| ----- | ------------------------------------------------------------------------ |
| `tee` | color (skill level), surface, width, length, bearing, status, standalone |

| `target` | pinId, type, model, color, status, standalone |
| `dropzone` | surface, width, length, bearing |
| `mando` | side, type, height, bearing, reach, dropzoneId |
| `fairway` | shape, widthStart, widthEnd |
| `boundary` | foliage |
| `ob`, `hazard` | invert |
| `water` | inPlay |

`mando.side` is the whole feature rather than a detail of it: it says which way
round the object a disc must go, and it is what decides which side the drawn
mandatory line lands on. `mando.dropzoneId` points at a _specific_ drop zone,
because `[RULES]` 804.01.C makes the lie after a missed mandatory the drop zone
**for that mandatory** — proximity is not the relationship. `mando.reach` is the
drawn length of the line, which is an app convention rather than a rule; see
"Derived geometry" in `PDGA.md`.

`boundary.foliage` is the one thing about a property the app cannot see, and the
PDGA acreage chart is indexed by it. There is deliberately no default — the chart
publishes three densities and marks none typical, so an unset value means the
area is measured and reported without a comparison. See `acreage.ts`.

**Elevation is absent everywhere on purpose.** It is sampled from terrain, not
typed in, and offering a box for it would invite a number nobody measured. A
hole's ground profile — and the `Target Elevation - Tee Elevation` term the PDGA
prices par with — is read from DEM tiles at the moment it is needed and never
written back. Storing it would mean a `.hyzer` carrying elevations from whatever
source the author happened to have, silently outliving both the survey they came
from and any correction to it.

### Tees and drop zones are points with derived footprints

Both store a **point at the front centre**, with the rectangle extending
_backwards_ along the reverse of `bearing`.

> [RULES] 802.04.A — "A teeing area, or tee, is the area bounded by the edges of
> a tee pad, if provided. Otherwise, it is the area extending three meters
> perpendicularly behind the designated tee line. The tee line is the line at
> the front of the teeing area."

The stored point is therefore also the measuring point:
[ELEMENTS] p2 measures hole length "from front of the tee". The footprint
polygon is derived, never stored.

Its defaults come from two documents, for two different reasons:

| Missing  | Falls back to              | Why that figure                                                                         |
| -------- | -------------------------- | --------------------------------------------------------------------------------------- |
| `length` | 3 m — [RULES] 802.04.A     | With no pad, that _is_ the teeing area. Not a typical value, the legal extent.          |
| `width`  | 2 m (6 ft) — [ELEMENTS] p2 | The rules never dimension a tee line's width, so the guideline's own "typical" is used. |

`bearing` has no default at all. Without one the footprint is **withheld** and
only the point renders — a rectangle at an invented angle would look deliberate.

What the app supplies is **the bearing of the fairway's first segment**, not the
bearing to the target. On a straight hole those are the same; on a dogleg they
are not, and a pad aimed at a pin the player cannot see from it is aimed at the
wrong thing. Players stand on the tee facing the gap they are throwing into. An
explicit `bearing` on the feature still wins, so this is a default that tracks
the design rather than a rule that overrides the designer.

### A fairway is not drawn — it is the line between the ends

**Every measurable pair has a fairway from the moment both ends exist.** A tee
and a target already imply the line between them, so there is no fairway tool:
tracing by hand something the document already knows was busywork, with a blank
map as the reward for skipping it.

The line is derived and straight until the designer bends it. Dragging a point on
it is what materialises `fairway` feature — the same sparseness pairs already
have, a record appearing only once it carries something the geometry cannot work
out on its own. Creating the feature and attaching it to its pair is **one batch
op**, so a single undo takes back both rather than leaving a pair pointing at
nothing.

A fairway's first and last vertices are the tee and the target, and they are
**not editable**. Only interior vertices get handles; the ends move when the
features that own them do — see `moveFeatureTo`. Handles on the ends would sit
exactly on top of every tee and basket on the course, swallowing the clicks and
drags meant for those features and offering to detach a fairway from its hole.

`courseFairways` draws **one shot per hole**, not one per pairing: a three-tee,
three-pin hole contains nine shots and nine overlapping corridors down one
corridor of land is unreadable. The shot drawn is the one the panels are
measuring — the active layout's play, or the designer's pick in the hole panel.
Any pair whose line has actually been shaped is drawn as well, so bending one
never makes it vanish when the picker moves.

### A fairway's corridor is derived from its line

The area it covers is a variable-width buffer around the centreline, recomputed
on every edit: half the width to either side of each vertex, mitred at the
corners, cut square at the tee end. The target end is rounded to its own
half-width instead — 10 m by default, the same radius as Circle 1 — so the
corridor's cap and the ring already drawn around the target are the same
curve, and the fill runs into the circle instead of stopping short of it.

The width **tapers by distance along the line** — not by vertex index, which
would balloon a dogleg's corridor to full width inside the first short leg:

| Width         | Comes from                                                               |
| ------------- | ------------------------------------------------------------------------ |
| At the tee    | The tee pad's own width. Falls back to the typical pad width, floor 1 m. |
| At the target | 20 m — Circle 1 across; its radius is 10 m, [RULES] 806.01.A.            |

**The taper is ours, not the PDGA's.** The PDGA publishes no fairway width. What
this does is draw a straight line between two figures that _are_ published, and
say so; `widthStart` and `widthEnd` override both ends per fairway.

A turn sharper than the corridor is wide makes the inside edge fold through
itself. That is reported as a structural finding rather than silently drawn — a
folded polygon has stopped describing ground.

### Status is hardware, not design

`tee.status` and `target.status` are `installed | position-only`. A course can
have five pin positions with two baskets in the ground. That decides whether a
layout can be played **today**, not whether it is a valid design — so it is
reported as information, never as an error.

`standalone` marks a tee or target that belongs to the course rather than a hole
— a practice basket — and exempts it from the "not assigned to a hole" check.

---

## Skill level is derived, never stored

The course does **not** carry one. A tee's colour _is_ its level:

> [ELEMENTS] p3 — "The designated color for each set of tees ... should match
> one of the four recognized player skill levels that set of tees was designed
> for: Gold, Blue, White or Red."

- **Per pair**, par is read from that pair's own tee colour.
- **Per layout**, the level is the one every play's tee agrees on, or **null**
  when they disagree. Every published PDGA figure is per level, so a layout
  mixing colours has no range to be inside or outside of, and null is the only
  honest answer.
- **Per course**, the active layout's level when it has been routed, and every
  tee on the course when it has not — a course being drawn has tees long before
  it has a routing.

---

---

## Which shot a hole is shown as

A hole with two tees and two pins is four throws. A panel describing "this hole"
has to pick one, and `chosenPair` is the single place that resolution happens —
the map's corridor, the card's length, the hole panel's par and the ground the
elevation chart samples all go through it, so they describe one throw by
construction rather than by four functions agreeing.

It answers in this order:

1. **The designer's pick** for that hole, when they have made one.
2. **The active layout's play for that hole** — `representativePair`. That is the
   shot a card would print and a player would throw.
3. Otherwise the hole's **first tee and first target** — the best guess available
   for a corridor nobody has routed yet.

A hole played twice in one layout resolves to its first play; the scorecard lists
both, because it is a list of plays rather than a list of holes.

### The shots not in play are still drawn

A hole draws one corridor — nine overlapping corridors down one strip of land is
not a drawing of anything — but the shots it is _not_ being shown as still have
to be visible, or a second tee is a pad on the ground with no line leaving it and
reads as something the designer forgot.

`alternativeShots` returns them, as **a cross rather than a grid**: every tee to
the pin in play, and every pin from the tee in play. Three tees and three pins is
four alternatives, not eight, and each differs from the chosen shot at exactly
one end — which is how a designer compares them, one variable at a time. The tee
half is the scorecard's row read onto the ground; the two agree because both
resolve the pin through `chosenPair`.

A shot whose fairway has been shaped is left out: `courseFairways` already
returns it in full, with the corridor and width it was given.

### The pick is per hole, session-lived, and validated

**Interface state, not document state** — like which layer is selected in an
editor. Storing it would autosave it, land it on the undo stack, and travel to
whoever the course was sent to. That also settles how long it lives: this
session, and no longer.

One pick **per hole**, not one for the editor. Comparing hole 4's long pin
against hole 5's is an ordinary thing to do, and a single choice put hole 4 back
on its representative pair the moment hole 5 was clicked.

And it is **validated on read, not trusted**. Nothing checks a pick on write, and
the document moves underneath it: delete the pin you were measuring to and the
pick names a target the hole no longer has. `chosenPair` keeps a pick only while
the hole still offers both ends, and otherwise falls back.

---

## The scorecard: a column per skill level

`representativePair` answers "one shot per hole", which is the right answer for a
panel describing a hole and the wrong one for a course with more than one tee —
the other shots are in the file and appear nowhere. `scorecard` is the other
reading: one row per hole, one column per **skill level**, every length at once.

Columns key on the level rather than on the tee feature, because that is what a
tee's colour _means_ — `skillLevelOfTee` reads it and every PDGA figure is
defined per level. It is also what lets a column span the course: hole 3's blue
tee and hole 4's blue tee are different features and the same column. Tees with
no colour set share an `Unmarked` column, listed last, so a course nobody has
classified produces exactly one column and the interface can keep showing the
plain list.

A column's total carries **how many holes it covers**, not just a sum. A red tee
on six of eighteen holes has a total that is not a course length, and printing it
under an eighteen-row card without saying so overstates the course by a factor of
three. `hasMultipleTees` is asked of the course rather than of a built card, so
the single-tee case never pays to build one.

### Length or par, one at a time

A printed card carries a length row and a par row for every hole, which needs
twice the width the panel has. So the cells hold one number and a control says
which. Par is the mode you switch to when you are filling the card in rather
than reading it, and every cell is then the editor for **that column's** pair —
the only place a three-tee hole's three pars can be set, since the hole panel
edits one shot at a time.

Which _pin_ a row measures to still comes from `representativePair`, or from the
caller's per-hole choice. The column decides the tee; something has to decide the
target, and it must be the one the map is drawing — otherwise the card and the
map are two answers to one question.

---

## Focus is not in the document

Which kind of work the editor is set up for — `play`, `land`, `routing`,
`simulate` — is a fact about the person, not about the course, so it lives in
`localStorage` beside units and chart smoothing rather than in the file. A
`.hyzer` you send somebody should not arrive with your palette.

It survives a reload for the same reason it is stored at all: somebody who spent
the afternoon tracing a tree line opens the tab again to keep tracing it.

`FOCUS_DEFINITIONS` in core is the taxonomy — every kind belongs to exactly one
focus, except `fairway`, which belongs to none because no palette draws one. A
test asserts that rather than a comment claiming it, so adding a kind without
placing it fails the build.

A focus changes three things and no more: the tools on the rail, the panel in
the left column, and which feature answers a click where two overlap. That last
one is `byFocus`, and it **reorders without filtering** — the losing feature is
still under the cursor, still selectable, still on the map.

**A focus never hides a feature.** In `land` you see every tee and can click
one; the palette simply does not offer to draw another. That single rule is the
difference between a focus and a mode you have to escape to do ordinary work,
and the browser tests assert it directly.

---

## Drawing aids are part of the document

```ts
interface Display {
  fairways: boolean; // master
  fairwayLines: boolean;
  fairwayAreas: boolean;
  circles: boolean; // master
  bullseye: boolean;
  c1: boolean;
  c2: boolean;
}
```

Every switch defaults to on, and each group is a **master and its parts** —
`fairways: false` hides both halves whatever the two below it say, which is what
makes it a master rather than a third switch beside them. The per-hole switch is
`hole.showFairway`, because the reason to hide one corridor is local: a hole
threading a tight gap reads better with the canopy visible while the rest of the
course keeps its aids.

Hiding a fairway takes its vertex handles with it. An aid you cannot see must not
be one you can edit by accident. It never deletes a routed line — the feature
stays in the document and comes back when the switch does.

This is the one place the document holds something that could be argued to be a
preference, and it is deliberate. A designer who sends someone a wooded site with
the corridors switched off meant them to see it that way, and splitting the
course-wide switches from the per-hole one would put half the answer in the file
and half in whichever browser last touched it.

Added without a version bump: the field carries defaults, so a version 2 document
written before it existed parses with everything on.

## Terrain overlays are too, and default the other way

`course.overlays` is a sibling of `basemapId`, not part of `display`:

```ts
{
  hillshade: boolean;
  contours: boolean;
}
```

The split is what each is about. `display` is the course — the fairways and
putting circles the app derives from what you drew. These are the **ground**:
readings of the land itself, from a source outside the document, sitting between
the basemap and the design. `basemapId` was already in the document for the same
reason, and a wooded site sent to a reviewer with hillshade on was sent that way
on purpose — the designer is saying "the reason hole 7 doglegs is this ridge".

**They default off, where every drawing aid defaults on.** A fairway corridor is
the app drawing something you made; a contour is the app fetching tiles from a
third party and printing lines over your imagery. Nobody's first impression of a
course should be a network request they did not ask for.

Additive with defaults, so no version bump — a document written before this
existed parses with both off, which is what it was showing.

**The adjustments live here too.** `hillshadeOpacity`, `hillshadeSoftness`,
`contourOpacity` and `contourSmoothing` are in the document for the same reason
the switches are: a course sent to a reviewer with the shading turned down was
sent that way on purpose. Each defaults to the appearance that existed before it
was adjustable, so an older document opens unchanged.

`OverlaySwitch` and `OverlayAmount` are derived from the schema rather than
listed, so a new field lands in one set or the other automatically and every
consumer that has to handle it fails to compile until it does — the same
discipline that keeps an overlay from existing with no control for it.

**What the numbers are worth is part of the model.** The elevation source is
roughly 10m over the US and 30m elsewhere. That will show a ridge, a bowl and a
fall line; it will not show a two-metre mound behind a green, and a contour drawn
through one is interpolation rather than measurement. The interval stops
tightening past z13 because the data stops improving there, and the layers panel
says so next to the switch. Everything else in this document is a measurement;
these are a reading, and the interface has to be honest about the difference.

## A site survey is metadata here and pixels elsewhere

`course.siteSurvey` is the one field that deliberately does **not** carry its own
data:

```ts
{
  name: string; // the file it came from
  bounds: [w, s, e, n]; // WGS84, after reprojection
  resolutionMeters: number; // what the tiles achieved, not what the file claims
  crs: string; // 'EPSG:26916' — shown, not used again
  minZoom: number;
  maxZoom: number;
  importedAt: string;
}
```

The tiles live in IndexedDB, in their own database, keyed by `z/x/y`. A `.hyzer`
is a document you email and forty megabytes of elevation is not.

**A survey is a set of files.** `sources` carries one entry per GeoTIFF, each
with its own name, bounds, projection and vertical unit — they genuinely can
differ, and a designer who mixed a State Plane tile with a UTM one needs to see
that rather than have it averaged away. The survey's own `bounds` is their union
and its `resolutionMeters` is the _coarsest_ of them, because that is the only
figure true of the whole thing. Older documents held one file's fields at the
top level; a `z.preprocess` wraps them as a single source, which is a widening
rather than a version bump — the tiles in IndexedDB are untouched, so such a
course opens working rather than merely parsing.

**The vertical unit is part of the record.** `verticalUnit` says what the file's
elevations were read as and `verticalUnitDeclared` says whether the file stated
it or whether it was taken from the unit its coordinates are in. Both are stored
rather than recomputed, because the tiles are already encoded in metres by the
time anything reads them — the unit is a fact about how they were built, not
something derivable from them afterwards. A survey read in the wrong vertical
unit is out by a factor of 3.28 and looks entirely plausible.

But the record still travels, because **it describes how the course was
designed**. Someone opening a file you sent is told the design was drawn against
a 1m survey and which one, even though they do not have it — that is a missing
attachment, not a corrupt document, and the interface says exactly that rather
than failing.

**`resolutionMeters` is the tiles', never the file's.** A large GeoTIFF is read
from a coarser overview level to fit a memory budget; reporting its headline
number would overstate what was actually built, which is the one thing this
document model refuses to do anywhere else.

---

## Coordinates are `[lng, lat]`, and people are not

The document stores positions lng-first because GeoJSON and MapLibre do — see
the note in `geo.ts`. Every human-facing surface is latitude-first, because
every source a designer copies from writes it that way: Google Maps, handheld
GPS units, permit drawings.

That transposition lives in exactly one module, `coordinates.ts`, so there is
one place to get it right and one place to test it. It is the classic
coordinate bug and its failure mode is uneven: a Minnesota course at
`44.9, -93.1` read backwards is not a valid latitude and fails loudly, while one
at `40, -75` read backwards lands in Kazakhstan and fails silently. The tests
use fixtures of both kinds.

Typing a position dispatches `moveFeatureTo`, the same op dragging uses — so a
line is translated whole rather than having one vertex yanked, and a tee takes
its fairways with it either way.

---

## Derived, never stored

Played number · distance · effective length · par suggestion · course and layout
totals · layout skill level · layout playability · tee and drop-zone footprints ·
tee bearing · fairway centreline and corridor polygon · putting circles · hole
label position · polygon area and course acreage · elevation and ground profiles

## Not in the document at all

|                                                | Where it lives                   |
| ---------------------------------------------- | -------------------------------- |
| "Save as default" — surface, color, dimensions | localStorage, keyed by tee color |
| Feet or meters                                 | localStorage — see below         |
| Elevation chart smoothing                      | localStorage — see `prefs.ts`    |
| Par readout show/hide                          | View setting                     |
| Which pair a hole panel is describing          | Editor state, per selection      |

Everything in the document is undoable, autosaved, and travels in the `.hyzer`
file. A preference that rode along would mean different things to different
people opening the same course.

**Units are the clearest case.** Feet or meters is a fact about the reader, not
about the land: a US club and a European one should be able to open one file and
each see it in what they think in. So the switch sits with the display
preferences in the Settings section and is stored per browser, while the drawing
aids beside it are in the document — those are decisions about how this course
is presented, and they should survive being sent to somebody.

---

## Migration

`parseCourse` steps a document forward one version at a time and never throws.

### v1 → v2

| Change                      | What happens to existing work                                                                                                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `basket` → `target`         | Rename only; geometry and props survive.                                                                                                                                                         |
| Par moves hole → pair       | Carried onto the pair formed by the hole's first tee and first target — the pair the v1 app was measuring when the designer set it.                                                              |
| Fairway moves hole → pair   | Same pair.                                                                                                                                                                                       |
| `course.skillLevel` removed | Written onto every tee that has no colour of its own, so the pars the designer was seeing do not silently re-band.                                                                               |
| One default layout created  | Plays every hole in number order, using its first tee and target.                                                                                                                                |
| v1 tee points               | Become front-centre **by definition**. They were placed with no defined semantic and carried no bearing, so nothing is reinterpreted against intent — the point gains a meaning it did not have. |

**What is deliberately dropped:** a par override on a hole with no tee or no
target. That combination was unmeasurable in v1 too, so no number a designer
could ever see is lost.

**What is deliberately kept:** dangling references. A hole pointing at a deleted
feature keeps pointing at it, so the structural check can still report it rather
than the migration quietly tidying away evidence of a problem.

Holes that cannot form a pair are left **out of the layout** but kept as holes.
A layout is what gets played; a hole with no basket is not.
