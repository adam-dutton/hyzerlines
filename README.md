# Hyzerlines

Design disc golf courses on real terrain, in a browser. Free to start, and
usable without an account.

Point it at a piece of land, draw tees and baskets on satellite imagery, and get
real measurements — distances, elevation, par suggestions, safety envelopes —
instead of shapes on a screenshot.

> **Status: early.** You can draw a course on real terrain, measure it, read the
> ground it is thrown over, and get PDGA par and design checks against it —
> including elevation, from LiDAR you bring yourself. Layouts, flight modelling
> and sharing are still ahead. See [`docs/PLAN.md`](docs/PLAN.md) for what is
> built and what is coming.

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
centreline runs from the tee pad's own width to the width of Circle 1 at the
target — two published figures — but **the taper between them is the app's, not
the PDGA's**, which publishes no fairway width at all. It is a drawing aid
anchored to real numbers, said in exactly those words in
[`docs/PDGA.md`](docs/PDGA.md#derived-geometry--what-is-sourced-and-what-is-ours),
and every width it produces is overridable.

Areas work the same way. A drawn property boundary is measured with the spherical
excess formula rather than a flat approximation — the difference is invisible over
one hole and real over a whole site — and compared against the PDGA's acreage
chart as a **range**, since that chart publishes three legitimate course scales
and the app cannot know which one you are building. The comparison needs a foliage
density, which is the one thing about a property that cannot be seen from
imagery, so you set it and nothing is assumed if you do not.

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

**The model runs ahead of the interface here, and it is worth being plain about
which is which.** A hole can hold several tees and pins today, each pair
measures and gets its own par, and the panel lets you pick which shot you are
looking at. What it does not yet do is show them side by side — the scorecard
reports one shot per hole — and layouts exist in the file format and the core
library with no interface at all. Both are the next two pieces of work; see
[`docs/PLAN.md`](docs/PLAN.md).

[`docs/MODEL.md`](docs/MODEL.md) is the full reference, including how version 1
documents migrate.

### Shapes the file does not contain

A tee is stored as a point, but a tee is a pad. A tee and a target imply the
fairway between them, but nothing stores it. All of that is computed on every
render and never written back — a stored polygon stays correct until somebody
drags the point it came from.

**There is no fairway tool.** Every hole has one the moment it has both ends, and
dragging a point on it is what turns it into something the file carries. Tracing
a line the app already knows was busywork with a blank map as the reward for
skipping it.

The pad extends _backwards_ from its point, because the point is the front centre:
that is the tee line, and the tee line is where hole length is measured from.
Anchoring at the middle of the pad instead would add half a pad length to every
hole on the course, invisibly. It faces down the fairway's first segment rather
than at the pin — on a dogleg those differ, and players stand facing the gap they
are throwing into.

Every fairway is drawn **dashed**, routed or not, because none of it is on the
ground. A solid line is reserved for things somebody actually drew. And all of it
switches off — per hole, or course-wide from the inspector, lines and corridors
separately, and the same for the three rings around a basket. Those switches live
in the document, not in the browser: turning the corridors off to read the canopy
underneath is a decision about how the course is presented, and it should survive
being sent to somebody.

Colour is spent sparingly. Everything is white over imagery except **out of
bounds**, which is red — not a styling choice this project gets to make, but what
OB looks like on every course map a player has ever seen. A property boundary is
the opposite: a thin dotted outline and no fill at all, because a translucent
wash over the whole site dims the terrain you are reading it from.

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

Tool keys (`T` tee, `B` basket, `P` path, `O` out of bounds…) place features.
Points and lines can be dragged to move them, and dragging a tee or basket brings
its fairway along. Areas cannot: a property boundary can cover the whole
viewport, and a map you can no longer pan is a worse trade than an area you
reshape by its handles. Select a hole, a line or an area and it grows handles:
drag one to move a vertex, click a hollow one between two vertices to insert,
`Alt`-click to remove. Doing that to a hole's fairway is how a straight shot
becomes a routed one.

Clicking anything belonging to a hole selects the **hole**; clicking again drills
into the feature.

A hole can be built from either end. Draw a tee and a basket and press **Add
hole** and it claims the pair — or add the hole first, and anything you draw
while it is selected joins it. The hole keeps the selection through both
placements, because building one is a single task with two clicks in it.

### Where things are

The course sits top left — its name is the panel's heading, and everything else
about it is underneath, in sections that fold — one at a time, so the hole list
below never gets squeezed out. Its holes are in the column below.
The layers button in the bottom-right corner picks what is underneath —
satellite, topographic or street — and what is drawn over it. **Hillshade**
shades the slopes, and **contours** draws lines you can count. Both read public
elevation data at roughly 10m detail: enough to see which way a hole falls and
how far, not enough for spot heights, and the panel says so where the switch is.
Contours are quoted in whatever units you have set, and are computed in your
browser rather than fetched.

Both have their own adjustments, under the switch that turns them on. The
hillshade takes an **opacity** and a **softness** — the second reads the terrain
a step or two coarser, which is the useful thing over 1m LiDAR where the shading
otherwise resolves tree crowns and looks like gravel. The contours take an
opacity and a **smoothing**, which interpolates the elevation grid before
tracing so the lines curve instead of showing the facets of the grid they were
drawn on. None of it invents elevation: smoothing interpolates between measured
samples and no contour moves to a height the data does not support.

**For real detail, import a site survey.** Nobody hosts 1m elevation for the
whole world — it is petabytes — but LiDAR at 1m is published free for most of
the United States ([The National Map](https://apps.nationalmap.gov/downloader/))
and all of England ([Environment
Agency](https://environment.data.gov.uk/survey)), and a course is about a square
kilometre. Download the GeoTIFF for your site, drop it on the layers panel, and
the app reprojects and tiles it in your browser. No account, no API key, nothing
uploaded anywhere. At 1m the contours stop being a hint and start being a
measurement.

Any projection the EPSG registry defines and proj4 can compute — UTM, State
Plane in feet or metres, national grids — is read and named back to you, so you
can check the file was understood the way you meant. Anything that _cannot_ be
reprojected accurately is refused rather than placed approximately.

**Heights get the same treatment.** A GeoTIFF states the unit its coordinates
are in but need not state the unit its elevations are in, and most published
DEMs do not. Where the file declares one it is used; where it does not, the
elevations are read in the unit the file states for its coordinates — so a State
Plane survey in US survey feet is read in feet, not silently multiplied by 3.28.
The panel says which unit was used and whether the file declared it, because
that is the one thing about an import that can be wrong while everything else
looks right.

**A survey can be several files.** A course is routinely larger than one
published LiDAR tile — county downloads arrive as a grid of them — so importing
a second GeoTIFF extends the survey instead of replacing it, and the panel lists
what went in. Where two files overlap they are combined pixel by pixel, so
neither loses ground to the other's edge.

The shading and the contours stop at the edge of the data. Tiles at the boundary
are half survey and half nothing, and the part that is nothing is marked as such
rather than filled with the last real elevation copied outward — which is what
used to draw long smears off the side of a survey with contour lines running out
of them into land nobody measured.

The tiles live in your browser rather than in the `.hyzer` file, so sending
someone a course sends the design and not forty megabytes of elevation — they
are told which survey it was designed against and can import the same file.

**Every hole gets an elevation profile.** Select a hole and the panel draws the
ground its shot is thrown over, sampled along the fairway you actually routed
rather than the straight line between the ends — with the net rise or fall, the
climb and descent, and the steepest grade on the hole. The vertical is
exaggerated, because a 300 ft hole that falls four metres would otherwise be a
flat line, and the elevation range is printed underneath so the picture is read
against real numbers.

The elevations are labelled up the left edge, because a profile with no scale
is a shape rather than a measurement — the vertical is stretched to fill the
frame, so the slope you see is never the slope on the ground.

**Smoothing lives in Settings, beside units.** Elevation is read by nearest
neighbour from a raster, so consecutive samples inside one cell come back
identical and the sample that crosses into the next carries the whole step —
which reads as a grade roughly twice what the land actually does. Averaging over
the width of that staircase is what recovers the terrain: on ground truly
falling at 8%, a raw reading of 16.8% comes back to 8.6%. Light smoothing is the
default, it is named on every chart it is applied to, and it filters the climb,
descent and grade only. Net change is read from the raw ends and is never
smoothed, so the setting cannot move a par.

That profile also feeds par. The PDGA's effective-length formula adds three times
the rise from tee to target, which is the difference between a par 3 and a par 4
on the same measured distance — and it is the one term the app has been unable to
supply until now. **Only an imported survey moves a par.** The global overlay is
good to roughly 10m vertically and the formula multiplies by three, so a par
computed from it could be two strokes wrong from measurement error alone; it
draws the chart and stops there, and the panel says which source you are on.

Every feature shows its coordinates, and you can type them in. The map is the
right tool for "about here" and the wrong one for "exactly here" — a basket
surveyed with a handheld, a tee off a permit drawing. Latitude and longitude are
listed the way people write them, latitude first, and the fields accept whatever
you have: decimal degrees, degrees and decimal minutes the way a Garmin shows
them, or degrees/minutes/seconds off a permit. Pasting a whole `44.9, -93.1`
into either box fills in both, because that is what "copy coordinates" gives
you. Setting the position on a line or an area moves the whole shape.

Whatever you select opens top right. The tools are along the top, centred
between the two columns, with undo and redo on the end of the rail; the camera
controls — imagery, north, zoom — stack in the bottom right corner. Everything
floats: opening a panel never resizes the map, because a map that reflows loses
your place.

Selecting a hole in the list flies to it, so the list doubles as a way around a
course once there are eighteen of them. And if you lose the course — panned off
the edge, or zoomed out until it is a speck — a **Recenter on course** button
appears under the rail and animates you back.

Panel names are inputs. The course's name, a hole's, a feature's — each is the
heading you read and the field you edit, rather than a title with a Name row
three pixels under it saying the same thing. Select a feature inside a hole and
a breadcrumb above its name takes you back to the hole.

A course's location fills itself in the first time you draw something, from
wherever the map is pointed, and is yours to change after that. The coordinates
are already in the file; a name is the only form of "where" that is any use to a
parks department.

## Contributing

Issues and pull requests are welcome, but hold off on large ones for now: the
licence is changing (see below), and a contribution made under one licence and
shipped under another is a problem for whoever wrote it. Small fixes are fine.

CI runs format, lint, typecheck and build on every PR;
`pnpm format && pnpm lint && pnpm build` locally covers the same ground.

## License

**In transition.** Everything through
[#15](https://github.com/adam-dutton/hyzerlines/pull/15) shipped under
[AGPL-3.0-or-later](LICENSE), and those versions stay AGPL permanently — anyone
holding a copy keeps the right to use, modify, self-host, redistribute and fork
it. Future versions move to a proprietary licence, with a free tier and a paid
subscription. See [docs/PLAN.md](docs/PLAN.md#licence-and-business-model).

The `LICENSE` file still contains the AGPL text and has not been replaced yet.
Until it is, treat the current contents as authoritative for what is here.
