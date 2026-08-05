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

| Kind           | Props                                                                    |
| -------------- | ------------------------------------------------------------------------ |
| `tee`          | color (skill level), surface, width, length, bearing, status, standalone |
| `target`       | pinId, type, model, color, status, standalone                            |
| `dropzone`     | surface, width, length, bearing                                          |
| `mando`        | side, type, height, bearing                                              |
| `fairway`      | shape, widthStart, widthEnd                                              |
| `boundary`     | foliage                                                                  |
| `ob`, `hazard` | invert                                                                   |
| `water`        | inPlay                                                                   |

`boundary.foliage` is the one thing about a property the app cannot see, and the
PDGA acreage chart is indexed by it. There is deliberately no default — the chart
publishes three densities and marks none typical, so an unset value means the
area is measured and reported without a comparison. See `acreage.ts`.

**Elevation is absent everywhere on purpose.** It is sampled from terrain, not
typed in, and offering a box for it would invite a number nobody measured.

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
corners, cut square at both ends.

The width **tapers by distance along the line** — not by vertex index, which
would balloon a dogleg's corridor to full width inside the first short leg:

| Width         | Comes from                                                               |
| ------------- | ------------------------------------------------------------------------ |
| At the tee    | The tee pad's own width. Falls back to the typical pad width, floor 1 m. |
| At the target | 10 m — Circle 1's radius, [RULES] 806.01.A.                              |

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
has to pick one, and `representativePair` is the single place that choice is made:

1. **The active layout's play for that hole**, when it has one. That is the shot
   a card would print and a player would throw.
2. Otherwise the hole's **first tee and first target** — the best guess available
   for a corridor nobody has routed yet.

A hole played twice in one layout resolves to its first play; the scorecard lists
both, because it is a list of plays rather than a list of holes.

The designer can override the choice in the hole panel. That selection is
**interface state, not document state** — like which layer is selected in an
editor. Storing it would autosave it, land it on the undo stack, and travel to
whoever the course was sent to.

---

## Derived, never stored

Played number · distance · effective length · par suggestion · course and layout
totals · layout skill level · layout playability · tee and drop-zone footprints ·
tee bearing · fairway centreline and corridor polygon · putting circles · hole
label position · polygon area and course acreage · elevation

## Not in the document at all

|                                                 | Where it lives                    |
| ----------------------------------------------- | --------------------------------- |
| "Save as default" — surface, colour, dimensions | localStorage, keyed by tee colour |
| Target circle overlays                          | View setting                      |
| Par readout show/hide                           | View setting                      |
| Which pair a hole panel is describing           | Editor state, per selection       |

Everything in the document is undoable, autosaved, and travels in the `.hyzer`
file. A preference that rode along would mean different things to different
people opening the same course.

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
