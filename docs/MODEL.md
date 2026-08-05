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
| `fairway`      | shape                                                                    |
| `ob`, `hazard` | invert                                                                   |
| `water`        | inPlay                                                                   |

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
polygon is derived, never stored, and falls back to 3 m deep when no pad
dimensions are set.

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

## Derived, never stored

Played number · distance · effective length · par suggestion · course and layout
totals · layout skill level · layout playability · tee and drop-zone footprints ·
fairway area polygon · elevation

## Not in the document at all

|                                                 | Where it lives                    |
| ----------------------------------------------- | --------------------------------- |
| "Save as default" — surface, colour, dimensions | localStorage, keyed by tee colour |
| Target circle overlays                          | View setting                      |
| Par readout show/hide                           | View setting                      |

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
