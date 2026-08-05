# PDGA course design reference

This is the transcription record for every PDGA figure the app uses. It exists so
that any number on screen can be traced back to a published document, a page and
a quotation — without opening the source PDFs.

**The rule this project works under:** a figure that is not in a source document
is not in the code. Not estimated, not interpolated, not remembered. A designer
may take a tee pad dimension or a length range from this tool to a parks
department, a landowner, or an insurer, and an invented number is worse than a
missing one because it cannot be told apart from a correct one.

The machine-readable form is [`packages/core/src/pdga.ts`](../packages/core/src/pdga.ts),
which carries the same citations inline. `packages/core/src/pdga.test.ts` restates
the published figures independently of the tables the code reads, so a typo fails
the build instead of quietly becoming the app's idea of a PDGA standard.

---

## Sources

| Key          | Document                                         | Revision           |
| ------------ | ------------------------------------------------ | ------------------ |
| `[PAR]`      | PDGA Par Guidelines                              | 01/01/2022 (draft) |
| `[SKILL]`    | PDGA Course Design Player Skill Level Guidelines | undated            |
| `[ELEMENTS]` | Disc Golf Course Design Elements                 | undated            |
| `[ACREAGE]`  | Disc Golf Course Acreage Guide                   | undated            |
| `[DEV]`      | Disc Golf Course Design & Development            | undated            |
| `[RULES]`    | Official Rules and Regulations of Disc Golf      | Rev. Jan 1, 2026   |

`[RULES]` and `[PAR]` carry revision dates of their own — `[PAR]` is also marked
a draft. The other three are living web documents with no version stamp, which is
a real limitation of this transcription: a silent edit upstream would not
announce itself. Page numbers refer to the PDF pagination as supplied; `[RULES]`
is cited by its own rule numbers instead, which are stable across revisions.

---

## A note on units

**Feet are canonical here.** That is how the PDGA publishes and how the sport
measures. Each document also prints a metric table, but those are rounded
independently and in places overlap at the boundaries — the Gold row of the par
table gives par 2 as `0-58 m` and par 3 as `57-180 m`, which are both true of a
57.5 m hole.

Converting from the foot figures produces one contiguous, unambiguous scale, so
that is what the code does. The published metric tables are reproduced below for
reference but are not used for any calculation.

`parForLength` rounds to the nearest whole foot before the lookup, because whole
feet is the resolution the table is printed at: par 2 runs to 55 and par 3 starts
at 56, and the document says nothing about 55.4.

---

## Player skill levels

`[SKILL]` p1:

> Skill level ranges are defined using PDGA Player Ratings as follows: Gold 970+,
> Blue 925+, White 875+, Red 825+, Green under 825.

| Level | Player rating |
| ----- | ------------- |
| Gold  | 970+          |
| Blue  | 925+          |
| White | 875+          |
| Red   | 825+          |
| Green | under 825     |

**Two rating schemes exist and they are not the same thing.** `[PAR]` p3 lists
_target_ ratings used for par-setting — Gold 1000, Blue 950, White 900, Red 850,
Green 800 — plus Pink 930 and Purple 700. `[ACREAGE]` uses the par-setting set.
One scheme describes who plays a course; the other describes the "expert" whose
score defines par. Only the five design levels are modelled. Pink and Purple
appear solely in par tables and are not offered as course skill levels.

`[ELEMENTS]` p1 notes that only four levels have full design guidelines:

> Four primary player skill levels (Gold, Blue, White and Red) have been defined
> with design guidelines for each level. Public courses are usually designed with
> a combination of Blue & Red or White & Red tees.

Green is present in the par and skill tables but absent from the acreage chart,
which is why `ACREAGE.green` is `null` rather than a set of zeroes.

---

## What par is — `[PAR]` p3

> Par is the score that an expert disc golfer would be expected to make on a given
> hole with errorless play under ordinary weather conditions.
>
> For each division, the appropriate "expert disc golfer" will represent a player
> who is better than most - but not the best - in the division.

The expert rating per level, `[PAR]` p3 — these are the _par-setting_ ratings, not
the _skill level ranges_ in `[SKILL]` p1 above:

| Level  | Expert rating | Divisions (abbreviated)                         |
| ------ | ------------- | ----------------------------------------------- |
| Gold   | 1000          | MPO, MP40, RPA                                  |
| Blue   | 950           | MP50–MP60, MA1, MA40, MJ18, RAH                 |
| Pink   | 930           | FPO (score-based methods)                       |
| White  | 900           | FPO (hole length methods), MP65, FP40, MA2, …   |
| Red    | 850           | MP70, MP75, FP50–FP65, MA3, FA1, MJ12, …        |
| Green  | 800           | MP80, FP70, MA4, FA2, FA50, FA55, MJ10, FJ18, … |
| Purple | 700           | FA3, FA4, FA60–FA70, MJ08, MJ06, FJ06–FJ15, RAG |

`[PAR]` p4 lists nine acceptable methods for setting par. This app implements
**Par by Hole Length** fed by **Effective Length**, both below. The others —
Scoring Distribution, Average Score, Effective Hole Length and Foliage, Close
Range Par, Par by Hole Length and Hole Difficulty, Par Adjusted by Round Ratings,
and Par by Expert Opinion — need tournament scores, foliage charts, or a human,
and are out of reach of a design tool working from imagery.

`[PAR]` p15 also names the ways par must _not_ be set, which is the clearest
statement of why the override in this app is a suggestion the designer takes
responsibility for:

> It is never acceptable to set pars higher to create sensational under-par scores
> […] It is also never acceptable to set pars higher or lower to make a course
> appear tougher or easier than it is.

---

## Par by hole length — `[PAR]` p10

> 1. Choose the row for the Skill Level.
> 2. Par is the column the hole length is in.
>
> This is the simplest method, but disc golf scores can vary widely for holes of a
> given length. Strictly following the table will not give appropriate pars for
> all holes.

That caveat is why par in this app is a suggestion with a visible override and
its reasoning on screen.

### Hole length ranges in feet — used by the code

| Skill Level | Par 2 | Par 3   | Par 4    | Par 5     | Par 6 |
| ----------- | ----- | ------- | -------- | --------- | ----- |
| Gold        | 0–185 | 186–585 | 586–1010 | 1011–1395 | 1396+ |
| Blue        | 0–85  | 86–480  | 481–845  | 846–1245  | 1246+ |
| White       | 0–55  | 56–430  | 431–765  | 766–1170  | 1171+ |
| Red         | 0–30  | 31–375  | 376–680  | 681–1010  | 1011+ |
| Green       | na    | 0–310   | 311–525  | 526–790   | 791+  |
| Purple      | na    | 0–220   | 221–430  | 431–680   | 681+  |

`na` means the level has no par 2 at all, not that it starts at zero — a 20 ft
hole is a par 3 for a Green course.

### Hole length ranges in meters — reference only

| Skill Level | Par 2 | Par 3  | Par 4   | Par 5   | Par 6 |
| ----------- | ----- | ------ | ------- | ------- | ----- |
| Gold        | 0–58  | 57–180 | 179–308 | 307–426 | 425+  |
| Blue        | 0–27  | 26–148 | 147–258 | 257–380 | 379+  |
| White       | 0–18  | 17–131 | 130–234 | 233–358 | 357+  |
| Red         | 0–11  | 10–115 | 114–208 | 207–309 | 308+  |
| Green       | na    | 0–95   | 94–161  | 160–242 | 241+  |
| Purple      | na    | 0–67   | 66–132  | 131–208 | 207+  |

Note the overlaps: Gold par 2 ends at 58 and par 3 begins at 57. This is the
rounding artefact described above, and the reason the code does not read this
table.

`[PAR]` p11 also describes a **Par by Hole Length and Hole Difficulty** method,
using per-skill-level charts where a hole length intersects several par bands and
the designer picks by relative difficulty. Those are images, not tables, so they
are not transcribed. The method is why par is always overridable.

---

## Effective length — `[PAR]` pp7–8

The formula, verbatim from p8:

```
Effective Length = Measured Length
  + 3 x (Target Elevation - Tee Elevation)
  + (Fairway Throw Length - Dogleg Effective Length) not less than zero
  + (Extra Length forced by Water Carries)
```

`[PAR]` p7 explains each term:

> **Elevation.** When the target is higher than the tee, the Effective Length is
> longer than the Measured Length. […] To get Effective Length start with Measured
> Length and add three times the difference in elevation from the target to the
> tee.
>
> **Doglegs.** A Dogleg is a feature which limits the maximum distance a good
> throw would travel. […] If the effective length of the Dogleg is longer than the
> length of a Fairway Throw, no adjustment is needed. If the effective length of
> the Dogleg is shorter than the length of a Fairway Throw, increase the Effective
> Length of the hole by excess of the Fairway Throw minus the dogleg.
>
> **Water Carries.** If a water carry is longer than a Fairway Throw, increase the
> Effective Length of the hole by the extra distance the player would need to
> traverse to avoid the water carry.

`[SKILL]` p2 gives the worked example:

> if a 300 ft hole measured by laser from tee to pin goes uphill 10 feet, multiply
> 10 ft x 3 (= 30 feet), add this to 300 to end up with a hole with an effective
> length roughly equivalent to a 330 ft hole on flat ground.

and the caveat on the multiplier:

> In cases where the slope is greater than 10% up or down, the multiplier is
> likely greater than 3. Only testing and experience can provide a good estimate.

The app uses 3 and does not guess beyond it.

**What the app currently supplies.** Only the measured length. Elevation waits on
terrain data (PR 5); the dogleg term needs the distance to the corner and the
water term needs the detour a carry forces, neither of which is in the document
model yet. Those inputs are omitted rather than estimated. `effectiveLength` is
already shaped to take them.

---

## Maximum throw lengths — `[PAR]` p9

Used by the effective-length dogleg term and by the Close Range Par method.

### Feet — used by the code

| Skill Level | Drive Length | Fairway Throw | Close Range |
| ----------- | ------------ | ------------- | ----------- |
| Gold        | 400          | 330           | 225         |
| Blue        | 340          | 270           | 165         |
| White       | 300          | 240           | 140         |
| Red         | 260          | 210           | 120         |
| Green       | 210          | 170           | 90          |
| Purple      | 150          | 120           | 50          |

### Meters — reference only

| Skill Level | Drive Length | Fairway Throw | Close Range |
| ----------- | ------------ | ------------- | ----------- |
| Gold        | 118          | 98            | 67          |
| Blue        | 101          | 80            | 49          |
| White       | 89           | 71            | 41          |
| Red         | 77           | 62            | 35          |
| Green       | 62           | 50            | 27          |
| Purple      | 44           | 35            | 15          |

**Close Range Par**, `[PAR]` p9, is a second par method not yet implemented:

> 1. Determine the effective length of the Drives and Fairway Throws players would
>    be attempting.
> 2. Using the maximum distances from the following table, determine the expected
>    number of throws to get within Close Range near the target.
> 3. Then add two throws to get par.

---

## Minimum length by par — `[SKILL]` p2

A second, looser framing of the same question `[PAR]` p10 answers.

| Hole length by par | Gold  | Blue | White | Red  | Green |
| ------------------ | ----- | ---- | ----- | ---- | ----- |
| Par 3 — feet       | 250+  | 200+ | 160+  | 140+ | 100+  |
| Par 3 — meters     | 75+   | 60+  | 48+   | 42+  | 30+   |
| Par 4 — feet       | 625+  | 525+ | 450+  | 375+ | 325+  |
| Par 4 — meters     | 190+  | 160+ | 138+  | 114+ | 100+  |
| Par 5 — feet       | 1000+ | 800+ | 675+  | 550+ | 475+  |
| Par 5 — meters     | 304+  | 244+ | 206+  | 168+ | 144+  |

**The two documents do not quite agree.** `[SKILL]` puts the White par-4 floor at
450 ft; `[PAR]` starts the White par-4 band at 431 ft. Both are transcribed
because both are published. `parForLength` uses `[PAR]`, because that is the
document written to assign par and `[SKILL]` p1 explicitly defers to it:

> Refer to PDGA Par Guidelines for assistance assigning values for different skill
> levels depending on foliage density of each hole.

---

## Course length range — `[SKILL]` p2

> The following course lengths for 18 holes are typical for each skill level. A
> Gold level course should be challenging enough to have a Scratch Scoring Average
> of at least 50 and greater than 54 would be preferred.

|        | Gold       | Blue      | White     | Red       | Green     |
| ------ | ---------- | --------- | --------- | --------- | --------- |
| Feet   | 7000–11000 | 5000–8500 | 4500–7500 | 3500–5500 | 2500–4000 |
| Meters | 2130–3350  | 1520–2590 | 1370–2290 | 1070–1680 | 760–1220  |

**18 holes, and only 18.** The table gives no per-hole figure, so the app's course
length check runs on an 18-hole course and stays silent otherwise. Pro-rating the
range to a 9- or 24-hole layout would be interpolation, not transcription.

`[ELEMENTS]` p2 adds compatible but differently-framed guidance:

> Most courses should have at least one configuration for beginners and casual
> recreational players that rarely averages more than 250 feet per Par 3 hole (75
> meters). This works out to a maximum of 4500 ft (1350m) for an 18-hole Par 54
> course or 2250 feet (675m) for a 9-hole Par 27 course. The shortest length range
> is 3600-4300 feet (1080-1290m) for a land constrained 18-hole Par 3 public
> course. […] Typical 18-hole course setups for amateur White level players range
> from 4500-6000 feet (1350-1800m).

and:

> There is no maximum length allowed for a hole. The longest holes in the world can
> get to 1500 feet (458m).

---

## Approach length range — `[SKILL]` p3

> The lengths in this table indicate how far a player in that skill range can be
> expected to throw with a mid-range disc or fairway driver in OPEN terrain or
> CONSTRAINED such as woods or hazards. The max length in parentheses should be
> used sparingly for when the designer requires the player to throw a hi-speed
> driver for their approach.

| Open — max | Gold          | Blue          | White         | Red          | Green        |
| ---------- | ------------- | ------------- | ------------- | ------------ | ------------ |
| Feet       | 180–290 (320) | 140–240 (275) | 110–180 (230) | 90–140 (185) | 70–100 (135) |
| Meters     | 54–88 (98)    | 42–74 (84)    | 34–56 (70)    | 28–44 (56)   | 22–30 (42)   |

| Constrained | Gold    | Blue    | White  | Red    | Green |
| ----------- | ------- | ------- | ------ | ------ | ----- |
| Feet        | 125–225 | 100–180 | 80–135 | 65–120 | 50–75 |
| Meters      | 38–70   | 30–56   | 24–42  | 20–38  | 16–24 |

No parenthesised stretch figure is published for constrained terrain, so the data
model has no field for one.

---

## Water crossings — `[SKILL]` p3

> Provide players with a route to throw around water hazards if possible. However,
> if the terrain forces a throw across water, provide a drop zone on the target
> side where players may proceed by rule without throwing across. Here's the
> maximum length across water for each skill level when forced to reach the other
> side.

| Cross water — max | Gold | Blue | White | Red | Green |
| ----------------- | ---- | ---- | ----- | --- | ----- |
| Feet              | 265  | 230  | –     | –   | –     |
| Meters            | 82   | 70   | –     | –   | –     |

**The dashes are the point.** White, Red and Green have no published figure, and
`MAX_WATER_CARRY_FT` records them as `null` rather than guessing.

`[ELEMENTS]` p2 adds a depth guideline:

> It is a best practice, but not always the case for a player throwing from the
> shortest (or only) tee on a hole to be "forced" to throw over water that is
> normally greater than 18" deep (50cm).

---

## Doglegs — `[SKILL]` pp3–4

> A player in each of these skill levels should not be required to throw farther
> than shown to reach the corner of a sharper dogleg when a shorter throw will not
> allow the player to make it around the corner to reach the basket (or next
> landing area) with a good next throw. (effective length)

| Dogleg — max | Gold | Blue | White | Red | Green |
| ------------ | ---- | ---- | ----- | --- | ----- |
| Feet         | 295  | 260  | 200   | 160 | 100   |
| Meters       | 90   | 80   | 60    | 48  | 30    |

---

## Space and fairways — `[ELEMENTS]` p1

> Ideally, a well-balanced course has a mixture of holes that go completely through
> the woods, partially through woods and mostly in the open. Fairways in the woods
> typically range from 15 ft wide pinch points up to 40 feet wide.

Typical practice, not a requirement, so no rule is built on it — and, importantly,
**this is not the source for the corridor the app draws.** A range from 15 to 40
feet describes what wooded fairways happen to measure; it says nothing about how
wide a given fairway should be at a given point, which is what a drawn corridor
has to claim. See "The fairway corridor" below for what is actually used.

> A full length Championship course can require several acres per hole depending on
> foliage density (more trees, less acreage required). However, a small
> recreational course can sometimes fit 2-3 holes per acre depending on terrain.

**Hole count**, `[ELEMENTS]` p1:

> Most courses are 9 or 18 holes. There are several with 12, 24 or 27 holes. It's
> better to install a well-designed, dual tee 12-hole course than it is to install
> a cramped 18-hole course on the same piece of land. […] if you are wanting to use
> a course for a sanctioned tournament, then 18 holes is the desired number.

---

## Minimum hole length — `[ELEMENTS]` p2

> No hole should effectively be shorter than about 100 feet (30m) even on courses
> for beginners.

"About" is the document's own hedge, which is why the app's check is a warning
rather than an error.

### How length is measured — `[ELEMENTS]` p2

> Hole length is measured from front of the tee to the target along the fairway
> route the designer intended players of that skill level to throw. For doglegs or
> water carries, the only time the straight line, crow flies, measurement should be
> used is if the designer intended players of that skill level to be able to throw
> over the treetops to shorten the dogleg or throw straight completely over the
> water.

This is the citation for `measurePair` preferring the routed length along the
fairway over the tee-to-target chord, and falling back to the chord only when the
fairway is still the straight line it starts as. The two agree exactly until the
designer bends it — which is the point at which they have stated an intended
route, and this passage says that is what to measure.

---

## Tee pads — `[ELEMENTS]` pp2–3

> Typical size for pads at the longer tee positions is 6 ft (2m) wide by 13 ft (4m)
> long. The back end might flare out to 10 feet (3m) wide. Minimum rectangular size
> is 4 feet (1.2m) wide by 10 feet (3m) long.

| Dimension          | Feet | Meters (as published) |
| ------------------ | ---- | --------------------- |
| Minimum width      | 4    | 1.2                   |
| Minimum length     | 10   | 3                     |
| Typical width      | 6    | 2                     |
| Typical length     | 13   | 4                     |
| Flared back width  | 10   | 3                     |
| Apron on all sides | 2    | —                     |

> Each tee area should have at least a two-foot apron around all sides to provide
> adequate room for follow-thru, so a player doesn't risk twisting an ankle or
> falling off a ledge.

> Tee areas should be level from left to right. They should not slope from front to
> back.

**The minimum is not absolute in the document's own text.** p3 immediately
qualifies it:

> If you need to conserve materials, make tee pads shorter on short or downhill
> holes and longer on long holes. For example, a hard surfaced tee pad at the top
> of a hill on a short hole might only need to be 8 ft long.

Eight feet is below the stated ten-foot minimum. That internal looseness is why
`pdga.tee-pad-undersized` is a warning, not an error.

**Tee colours**, p3:

> The designated color for each set of tees used for course layout identification
> on scorecards should match one of the four recognized player skill levels that
> set of tees was designed for: Gold, Blue, White or Red.

---

## Targets — `[ELEMENTS]` p3

> Manufacturers are required to produce targets so the height of the basket rim
> above the playing surface is 82 cm +/- 6 cm. Targets should be installed level
> with the ground, even though course developers may install some targets where the
> height falls outside the 76-88 cm manufacturing range. The PDGA Course Committee
> suggests that no more than 6 targets out of 18 be installed outside the
> manufactured height range with just 2 or 3 being preferred.

Recorded in `BASKET_RIM_HEIGHT_CM`, not checked. Nothing in the document model
knows how a basket is mounted, and nothing ever will from satellite imagery.

---

## Layout and safety — `[ELEMENTS]` pp4–5

> Fairways should not cross or be too close to public streets, sidewalks/paths/bike
> trails, pavilions, playgrounds, private property, or any other multi-use area
> where non-players congregate. Fairways should not cross one another and should be
> far enough apart so errant throws aren't regularly in the wrong fairway.
> Absolutely avoid designs where players might throw into blind areas where
> non-players could be walking on a well-defined park pathway.

**Only "fairways should not cross one another" is checked** (`pdga.fairways-cross`).
Crossing is a geometric fact about two lines, and since every hole now has a
fairway the moment it has a tee and a target, the check works from the first hole
rather than waiting for anyone to draw a route. "Far enough apart" and "too
close to" are separation distances the document declines to put a number on, and
this project does not supply numbers the PDGA has not published — least of all a
safety one. Dispersion-based separation is PR 12's problem, and it will be built on
a stated model rather than an invented constant.

**Mandatories**, p5:

> Mandatories should generally not be used as design elements as they can lead to
> confusion and possible controversy during both casual and sanctioned tournament
> play. […] Designers should not rely on rules that regulate routes or areas to
> eliminate interference issues. Instead, the hole should be moved or redirected.

**Routing**, p5:

> The tee for the first hole should ideally be the closest to the regular parking
> area. The target for the last hole should not be too far from the parking area
> and relatively close to the first tee.

---

## Par, as `[ELEMENTS]` p4 frames it

> Par should be set for each tee/basket position combination on a hole based on the
> player skill level they were designed for. […] The hole length used to determine
> par (not for the signs) should be adjusted up or down based on a 3-to-1 factor
> (i.e. 30 feet adjustment for every 10 feet elevation change) if the hole has a
> significant upslope or downslope.

> So, players know what standard has been used for par, it should be indicated on
> scorecards and tee signs as Blue Par or Red Par, which hopefully matches the tee
> color(s) used. […] The terms Women's, Senior's or Junior tees should not be used.

This is the citation for the course carrying a skill level at all: par is
meaningless without naming the standard it was set against.

---

## Acreage — `[ACREAGE]`

Three course scales per row. `Feet` is total course length; `Acres` is the land
required; `Factor` is the relative acreage multiplier for the foliage density.

| Skill level (rating) | Foliage   | Min ft | Min ac | Avg ft | Avg ac | Champ ft | Champ ac | Factor |
| -------------------- | --------- | ------ | ------ | ------ | ------ | -------- | -------- | ------ |
| Gold (1000)          | Scattered | 6900   | 26     | 8450   | 32     | 10350    | 39       | 165    |
| Gold (1000)          | Average   | 6400   | 18     | 7750   | 22     | 9350     | 27       | 125    |
| Gold (1000)          | Corridor  | 5900   | 14     | 7150   | 16     | 8650     | 20       | 100    |
| Blue (950)           | Scattered | 5500   | 21     | 6900   | 26     | 8600     | 33       | 165    |
| Blue (950)           | Average   | 5000   | 14     | 6250   | 18     | 7750     | 22       | 125    |
| Blue (950)           | Corridor  | 4500   | 10     | 5650   | 13     | 7050     | 16       | 100    |
| White (900)          | Scattered | 4150   | 16     | 5475   | 21     | 7025     | 27       | 165    |
| White (900)          | Average   | 3650   | 10     | 4875   | 14     | 6325     | 18       | 125    |
| White (900)          | Corridor  | 3550   | 8      | 4575   | 11     | 5825     | 13       | 100    |
| Red (<850)           | Scattered | 3200   | 12     | 4450   | 17     | 5950     | 23       | 165    |
| Red (<850)           | Average   | 3100   | 9      | 4100   | 12     | 5300     | 15       | 125    |
| Red (<850)           | Corridor  | 2600   | 6      | 3525   | 8      | 4675     | 11       | 100    |

The hole mix each column assumes:

| Column             | Est. par | Composition           |
| ------------------ | -------- | --------------------- |
| Minimum (P56)      | 56       | 16 × par 3, 2 × par 4 |
| Average (P61)      | 61       | 12 P3, 5 P4, 1 P5     |
| Championship (P67) | 67       | 8 P3, 7 P4, 3 P5      |

**There is no Green row.** `ACREAGE.green` is `null`.

---

## Design goals — `[DEV]`

No figures, but the framing the rest of the documents assume:

> 1. Satisfy the design requirements of the people and organizations who approve
>    use of the land and fund the equipment for the course. That includes meeting
>    local, state and federal construction and safety requirements.
> 2. Design the course to have sufficient visibility of players, pedestrians and
>    vehicles who may pass near or through it, without the use of mandatory
>    objects.
> 3. Design course with the potential for multiple configurations to serve all
>    skill levels and for possible tournaments; consistent with the budget and
>    design needs in goal one above.
> 4. Design a well-balanced course with a range of hole lengths, pars, and a good
>    mixture of holes requiring controlled left, right and straight throws.
> 5. Utilize elevation changes and available foliage as well as possible. Take care
>    to minimize potential damage to foliage and reduce the chances for erosion.

`[DEV]` also states plainly:

> Although the PDGA does not design or certify course installations, we are pleased
> to offer information based on best practices developed by experienced course
> designers over 4 decades of development, refinement and play.

Hyzerlines is not affiliated with or endorsed by the PDGA. These are published
guidelines, reproduced for reference; the app treats every one of them as advisory
and every check as dismissible.

---

## Rules of play — `[RULES]`

The rules govern how a hole is _played_, not how it is designed, and most of
them have nothing to say to a design tool. Four things do.

### The teeing area — 802.04.A

> A teeing area, or tee, is the area bounded by the edges of a tee pad, if
> provided. Otherwise, it is the area extending three meters perpendicularly
> behind the designated tee line. The tee line is the line at the front of the
> teeing area, or the line between the outside edges of two tee markers.

This is the citation for storing a tee as a point at the **front centre** of the
pad, with the footprint extending backwards — and for the 3 m fallback depth
when no pad dimensions are set. It agrees with `[ELEMENTS]` p2, which measures
hole length "from front of the tee".

### Circles around a target

Three figures, three different provenances. The app labels each, rather than
presenting them as a uniform set of "PDGA circles".

| Ring     | Radius | Where it comes from                                                           |
| -------- | ------ | ----------------------------------------------------------------------------- |
| Bullseye | 3 m    | **Not in the rules at all.** League and stat-tracking convention.             |
| Circle 1 | 10 m   | **806.01.A** — a real rule.                                                   |
| Circle 2 | 20 m   | **802.03.C.1** — the figure is in the rules, but as a pace-of-play threshold. |

> 806.01.A — "Any throw made from within 10 meters of the target, as measured
> from the front of the lie to the base of the target, is a putt."

That sentence also fixes the centre: circles are measured from the **base of the
target**, not from a point above it.

> 802.03.C.1 — "When making a throw from the teeing area (802.04), a drop zone
> (802.05.C), or within 20 meters of the target, the player has 30 seconds to
> throw."

Twenty metres is a real published figure. "Circle 2" is what players call the
band it describes; the rules never use the phrase. Three metres appears in the
rules only in the unit-conversion table and as the teeing area depth above —
neither is a circle — so the bullseye is recorded as community convention and
attributed to nobody else.

### Regulated areas — 806

The distinctions decide what a designer is claiming when they draw one, and two
of them are easy to conflate.

| Area                 | Penalty | Relief                       | Rule   |
| -------------------- | ------- | ---------------------------- | ------ |
| Out of bounds        | 1 throw | —                            | 806.02 |
| Casual area          | none    | **optional**                 | 806.03 |
| Required relief area | none    | **required**                 | 806.04 |
| Hazard               | 1 throw | none — the lie does not move | 806.05 |

> 806.03.A — "A casual area is an area designated by the Tournament Director
> which allows for optional relocation without penalty. A player **may** choose
> to take relief if their lie is in that area."

> 806.04.B — "A required relief area is considered and played as an
> out-of-bounds area ... The player does not receive a penalty throw."

That is why `casualArea` and `requiredRelief` are separate feature kinds rather
than one kind with a flag: one is a choice and one is not.

> 806.05.D — "A player whose disc is in a hazard receives one penalty throw. A
> hazard area has no impact on the location of the lie."

**Water is casual by default**, 806.03.B:

> By default, any body of water that is in-bounds and has not been explicitly
> declared by the Tournament Director to be in play is a casual area.

Hence the `inPlay` flag on the water kind — so a drawn pond says which it is
rather than leaving the question open.

### Mandatory routes — 804.01

> B. The restricted plane is a vertical plane marked by one or more objects or
> other markers which define the edges of the space.
>
> C. If part of a thrown disc clearly enters into a restricted plane, the player
> receives one penalty throw. The lie for the next throw is the drop zone for
> that mandatory. If no drop zone has been designated, the lie for the next
> throw is the previous lie.

The last sentence is why a mandatory owns a _specific_ drop zone rather than
merely being near one.

---

## Derived geometry — what is sourced and what is ours

The app draws two shapes the document does not contain: the rectangle a tee pad
occupies, and the corridor a fairway covers. Both are computed in
`packages/core/src/geometry.ts`. Because both put a dimension on screen that a
designer could measure off and quote, this records exactly where every number in
them comes from.

### The tee pad rectangle

| Input     | Value                   | Authority                                                                                 |
| --------- | ----------------------- | ----------------------------------------------------------------------------------------- |
| Anchor    | Front centre of the pad | `[RULES]` 802.04.A and `[ELEMENTS]` p2 — the tee line, and where length is measured from. |
| `length`  | 3 m when unset          | `[RULES]` 802.04.A. With no pad the teeing area **is** three metres behind the tee line.  |
| `width`   | 6 ft (2 m) when unset   | `[ELEMENTS]` p2, "typical size". The rules do not dimension a tee line's width.           |
| `bearing` | **No default**          | Nothing publishes one. Without a bearing the rectangle is not drawn at all.               |

Choosing the _rules_ figure for depth and the _guideline_ figure for width is
deliberate. 802.04.A defines a padless teeing area exactly — three metres, no
hedging — so it is not a typical value but the legal extent. It says nothing
about width, because a tee line is bounded by markers rather than by a dimension,
which leaves the design guideline's own word for a default as the only sourced
option.

### The fairway corridor

**The taper is ours. The PDGA publishes no fairway width.**

What the code does is join two published figures with a straight line and label
the join as an app convention:

| End           | Width                   | Authority                                               |
| ------------- | ----------------------- | ------------------------------------------------------- |
| At the tee    | The tee pad's own width | The designer's measurement, when they have entered one. |
| — unset       | 6 ft (2 m)              | `[ELEMENTS]` p2 typical pad width, as above.            |
| — floor       | 1 m                     | **Ours.** Below this a corridor stops being drawable.   |
| At the target | 20 m                    | `[RULES]` 806.01.A — Circle 1 across, radius 10 m.      |

The target figure is Circle 1's **diameter**, chosen so the corridor arrives with
its edges on the ring the map already draws around every target. Reading the
published 10 m as a width instead put the corridor's edge halfway to that ring,
which looked like the taper failing rather than like a decision. Which of the two
to use is not a question the PDGA answers — it publishes no fairway width at all
— so it is the app's, and it is written down here for that reason.

The interpolation between them, the mitre limit of 2 at doglegs, and the square
end caps are all app conventions with no PDGA basis, and none of them is
presented as a standard anywhere in the interface. Every width is overridable per
fairway (`widthStart`, `widthEnd`).

The honest framing: the corridor exists so a drawn line reads as ground rather
than as a hairline. It is a drawing aid whose defaults happen to be anchored to
real figures — not a claim about how wide a fairway ought to be. `[ELEMENTS]` p1's
15–40 ft range is the closest the documents come to that claim, and it is a
description of typical wooded fairways rather than a rule, so it is recorded above
and built on by nothing.

---

## What is transcribed but not yet used

Recorded in `pdga.ts` so the figure is available and audited, with nothing built
on it yet:

- **Approach length ranges** — needs per-throw modelling.
- **Maximum dogleg lengths** — needs a dogleg corner in the document model.
- **Maximum water carries** — needs a carry to be identifiable from geometry.
- **Basket rim height** — not derivable from imagery, and probably never will be.
- **Fairway corridor widths** (`[ELEMENTS]` p1) — descriptive of typical
  practice, not a threshold. Explicitly **not** the source for the corridor the
  app draws; see "Derived geometry" above.
- **Close Range Par and Par by Difficulty** — alternative par methods from `[PAR]`.
- **Basket rim height** and the **18" water depth** best practice — recorded,
  not checkable from imagery.

### The acreage chart, now that it is used — `[ACREAGE]`

Transcribed in PR 4 and unused until PR 7, for one reason: it compares against
the size of a property, and nothing in the document described a property. A drawn
`boundary` is that thing.

Two decisions about how it is read, both of the "do not invent" kind:

**The comparison is a range, not a number.** Every row publishes three course
scales — Minimum (par ~56), Average (~61), Championship (~67) — and all three are
legitimate. The app cannot know which one a designer is building, so it reports
whether the site falls inside the span rather than picking a column and calling
the rest wrong.

**Foliage density has no default.** The chart is indexed by it, it is the one
thing about a property that cannot be seen from imagery, and none of the three
columns is marked typical. With no density set the area is measured and reported
and the comparison is simply withheld — see `acreage.ts`.

Green has no row at all, so `ACREAGE.green` is null rather than a plausible set of
zeroes. `acreageRange` returns null for it, and the caller has to notice.

---

## What is deliberately absent

- **Safety separation distances between fairways.** No source document publishes
  one. See PR 12.
- **Par by Hole Length and Hole Difficulty charts** (`[PAR]` p11) and the
  **foliage-density par charts** (`[PAR]` p7). Both are images rather than tables
  and cannot be transcribed as figures.
- **Pink and Purple levels.** They appear in `[PAR]`'s tables but have no design
  guidelines, so they are not offered as course skill levels.
