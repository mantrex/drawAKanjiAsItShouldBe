# DAKAISB — Draw A Kanji As It Should Be

This project was born out of frustration with constantly managing npm package updates just to keep the various kanji stroke animation libraries working. In particular, one of them (which I won't name) — a library I've used in many projects — stopped working with the latest Chrome updates. I'm not sure whether the issue lies in the library's core or in its dependencies (Raphael or others).

For this reason, I decided to build a dependency-free JavaScript library that provides all the features I need — features I often had to hack together myself. For example: the ability to display the kanji's model in the background while the actual kanji is drawn on top of it, or the ability to color different parts of a kanji based on their classification, following the schema provided by KanjiVG — the SVG kanji library that virtually every other library in this space relies on.

Dependency-free stroke-order animation for [KanjiVG](https://kanjivg.tagaini.net/)-format SVGs, with per-block (radical/component) coloring.

No Vue/Nuxt/Quasar/Snap.svg/Raphael dependency — plain DOM APIs only (`DOMParser`, `SVGGeometryElement.getTotalLength()`, Web Animations API), usable from any frontend.

## Usage

```js
import { createKanjiAnimation, createKanjiAnimationFromText } from 'dakaisb'

const svgText = await fetch('/path/to/kanjivg/063a2.svg').then(r => r.text())
const anim = createKanjiAnimation(svgText, containerEl, {
  colors: ['#f0708a', '#f0a860', /* ... up to 10 */],
  speed: 350,
  showStrokeNumbers: false,
  strokeWidth: 3,
  strokeNumberColor: '#f0708a',
  strokeAnimationColor: null,       // e.g. 'red' — momentary color while a stroke is drawing
  strokeAnimationColorFade: 0,      // 0-100, % of the stroke's own duration spent crossfading to its final color
  colorCriteria: 'MAIN', // or 'SUB1', 'SUB2', 'SUBMAX', 'KRAD', 'CHISE_MAIN', 'CHISE_SUBMAX'
  chiseData: null,       // only for colorCriteria: 'CHISE_MAIN'/'CHISE_SUBMAX' — see below, never bundled with DAKAISB
  size: 220,             // px, size of the square the kanji is drawn into. Unset/null = fill containerEl's own CSS size instead
  showGrid: true,        // cross behind the kanji, splitting it into 4 quadrants
  gridColor: '#aaaaaa',
  gridStyle: 'dashed',   // 'solid' | 'dashed' | 'dotted'
  gridWidth: 1,
  showModel: false,      // faint fully-drawn reference copy behind the animated strokes
  modelColor: '#dddddd',
  border: false,         // rectangle framing the kanji's own canvas
  borderColor: '#aaaaaa',
  borderStyle: 'solid',  // 'solid' | 'dashed' | 'dotted'
  borderWidth: 1,
  borderGridDimension: 'pixel', // 'pixel' (grid/border width stays constant on screen at any size) | 'unit' (scales with size)
})

anim.play()
anim.pause()
anim.stop()     // resets to the undrawn state
anim.destroy()  // cancels animations, clears the container
```

To animate a whole word/sentence, one kanji box after another, use `createKanjiAnimationFromText` instead. It needs `svgPath`, the base URL/path of a KanjiVG SVG repository, since it fetches one SVG per character itself:

```js
import { createKanjiAnimationFromText } from 'dakaisb'

const text = '早速' // or 'じゅう', '天照大神', mixed text, etc.
const anim = await createKanjiAnimationFromText(text, containerEl, {
  svgPath: '/path/to/kanjivg/', // required — base path/URL the library fetches "<codepoint>.svg" from
  colors: ['#f0708a', '#f0a860', /* ... up to 10 */],
  speed: 350,
  showStrokeNumbers: false,
  strokeWidth: 3,
  showGrid: true,
  gridColor: '#aaaaaa',
  gridStyle: 'dashed',
  gridWidth: 1,
  size: 48,       // px, size of *each* kanji's square box (defaults to 220 here if unset — a text sequence always needs a concrete box size to lay characters out)
  interval: 500,  // ms of pause after one kanji finishes drawing before the next starts
  border: false,
  borderColor: '#aaaaaa',
  borderStyle: 'solid',
  borderWidth: 1,
  borderGridDimension: 'pixel',
  gap: 0,         // px between adjacent kanji boxes. 0 (default) means boxes sit flush — with a border on, adjacent borders share a single line instead of doubling up
})

anim.play()
anim.pause()
anim.stop()
anim.destroy()
```

Every character of `text` is looked up as `<svgPath>/<codepoint>.svg`, where `<codepoint>` is that character's Unicode codepoint as lowercase hex, zero-padded to 5 digits — KanjiVG's own filename convention (e.g. 早, U+65E9, is `065e9.svg`). Characters with no matching file (kana, punctuation, spaces, Latin letters, ...) are silently skipped: no box is created for them, and the rest of the text still renders. `createKanjiAnimationFromText` is async (it needs to fetch every character's SVG before rendering) and returns `{ instances, play, pause, stop, destroy }`, where `instances` is the array of per-kanji `createKanjiAnimation` results, in text order.

Kanji are animated **one at a time**, not simultaneously: `play()` starts the first kanji, waits for it to finish drawing (its stroke count × `speed`) plus `interval` ms, then starts the next, and so on. `pause()` mid-sequence freezes whichever kanji is currently drawing and cancels the pending start of the next one; calling `play()` again resumes exactly where it left off — the next kanji in line does not jump ahead. `stop()` resets every kanji and rewinds the sequence back to the first one.

Both functions are plain DOM/fetch — no framework dependency, so they work the same from Vue, React/Next, Svelte, or anywhere else with a `document`.

### `kanjiAnimationInfo`

Returns plain-English information about a `colorCriteria` mode, useful for building UI (a criteria picker with tooltips, documentation generated at build time, etc.) without hardcoding descriptions that can drift out of sync with the library itself. The text lives in `src/criteriaInfo.json`, not inline in code, so it can be edited independently.

```js
import { kanjiAnimationInfo } from 'dakaisb'

kanjiAnimationInfo({ criteria: 'KRAD' })
// => { criteria: 'KRAD', summary: 'Uses KRADFILE, an independent EDRDG-maintained...' }

kanjiAnimationInfo({ criteria: 'KRAD', details: true })
// => { criteria: 'KRAD', summary: '...', details: { depth, dataSource, requiresExternalData, fallback, attribution } }
```

`criteria` defaults to `"MAIN"` if omitted. `details: true` adds a structured metadata object (data source, whether the criterion needs external data, its fallback behavior, and license attribution where relevant — populated for `"KRAD"`, `"CHISE_MAIN"`, and `"CHISE_SUBMAX"`, `null`/absent for the other four, which need no external data). Throws if `criteria` isn't one of `"MAIN"`/`"SUB1"`/`"SUB2"`/`"SUBMAX"`/`"KRAD"`/`"CHISE_MAIN"`/`"CHISE_SUBMAX"`.

## Config

See `src/defaultConfig.json` for defaults. Every field can be overridden per call to `createKanjiAnimation` or `createKanjiAnimationFromText`.

| Field | Meaning |
|---|---|
| `colors` | Array of up to 10 colors, one per block, assigned in document order. Accepts any valid SVG `stroke` value, including `var(--css-custom-property)` |
| `speed` | Milliseconds per stroke |
| `showStrokeNumbers` | Whether to keep the `kvg:StrokeNumbers_*` labels, revealed one at a time in sync with each stroke |
| `strokeWidth` | SVG stroke-width for animated paths |
| `strokeNumberColor` | Color for stroke-order number labels (only used if `showStrokeNumbers` is true) |
| `strokeAnimationColor` | If set, the momentary color a stroke is drawn in while animating, before settling to its final block color. `null`/unset means strokes are always their final color, even while drawing |
| `strokeAnimationColorFade` | `0`–`100`. Percent of each stroke's own duration spent crossfading from `strokeAnimationColor` to its final block color. `0` = hard switch right as the stroke finishes; higher values start the crossfade earlier in that stroke's animation. Ignored if `strokeAnimationColor` is unset |
| `colorCriteria` | `"MAIN"` (default), `"SUB1"`, `"SUB2"`, `"SUBMAX"`, `"KRAD"`, `"CHISE_MAIN"`, or `"CHISE_SUBMAX"` — see below |
| `chiseData` | Only used by `colorCriteria: "CHISE_MAIN"`/`"CHISE_SUBMAX"`. The parsed contents of a locally-generated `chisedata/chise.json` (for `"CHISE_MAIN"`) or `chisedata/chise-submax.json` (for `"CHISE_SUBMAX"`) — the two are NOT interchangeable, each criterion needs its own file (see below). DAKAISB never loads either itself, you must import/fetch it yourself and pass it in. `null`/unset (the default), or a kanji not covered by it, makes either criterion **throw** — unlike `"KRAD"`, neither ever falls back to `"SUBMAX"` silently |
| `size` | Px size of the square each kanji is rendered into. In `createKanjiAnimation`, `null`/unset (the default) leaves the SVG's own sizing alone, so it just fills whatever space `containerEl`'s own CSS gives it. In `createKanjiAnimationFromText` a concrete size is always needed to lay characters out side by side, so it falls back to `220` if unset — this is the size of *each* kanji's own box, not the whole container |
| `showGrid` | Whether to draw a cross behind the kanji, splitting its box into 4 quadrants (the traditional 田-style writing guide) |
| `gridColor` | Color of the grid lines (only used if `showGrid` is true) |
| `gridStyle` | `"solid"`, `"dashed"` (default), or `"dotted"` — line style for the grid |
| `gridWidth` | Thickness of the grid lines. `1` by default. Interpreted per `borderGridDimension` |
| `showModel` | Whether to show a faint, fully-drawn copy of the kanji behind the animated strokes, as a reference model. If `showStrokeNumbers` is also true, the model shows stroke numbers too |
| `modelColor` | Color of the model kanji (only used if `showModel` is true) |
| `border` | Whether to draw a rectangle framing the kanji's own canvas (its SVG viewBox) — a real SVG `<rect>`, drawn the same way as the grid/model, so it's part of the kanji's own drawing and not just a CSS border on a wrapper `<div>`. Uses the exact same line-drawing code as the grid, so a border given the same color/style/width as the grid is visually indistinguishable from it — same thickness, same dash pattern |
| `borderColor` | Color of the border (only used if `border` is true) |
| `borderStyle` | `"solid"` (default), `"dashed"`, or `"dotted"` — line style for the border |
| `borderWidth` | Thickness of the border. `1` by default. Interpreted per `borderGridDimension` |
| `borderGridDimension` | `"pixel"` (default) or `"unit"`. `"pixel"`: `gridWidth`/`borderWidth` are a constant on-screen thickness in CSS px, unaffected by `size` (uses `vector-effect="non-scaling-stroke"`) — a grid/border 1px thick looks 1px thick whether the kanji is 48px or 500px. `"unit"`: they're raw KanjiVG viewBox units instead, so the line visually scales up/down together with the kanji as `size` changes |
| `svgPath` | `createKanjiAnimationFromText` only, required. Base path/URL of a KanjiVG SVG repository — each character is fetched as `<svgPath>/<codepoint-hex>.svg` |
| `interval` | `createKanjiAnimationFromText` only. Milliseconds to wait after one kanji finishes drawing before the next one starts (kanji are sequenced, never animated simultaneously) |
| `gap` | `createKanjiAnimationFromText` only. Pixels of space between adjacent kanji boxes. `0` (default) means boxes sit flush against each other — if `border` is also on, two adjacent borders then share a single line (like collapsed CSS borders) instead of reading as a doubled-up line |

## How block coloring works

In both modes, a direct `<path>` child with no wrapping block-level `<g>` never gets dumped into a generic gray — it happens constantly in real KanjiVG data, sometimes as a lone stray stroke but often as a whole unwrapped component (e.g. 言 itself in `08a00.svg` has its top 4 strokes as direct `<path>`s, with only its 口 sub-part wrapped in a `<g>`; simple characters like 一/十/木 have *all* their strokes as direct `<path>`s, no `<g>` at all). Each maximal run of consecutive direct `<path>` children — wherever it's found — becomes its own block and gets the next color in the palette, interleaved in document order with the real `<g>` blocks.

### `colorCriteria: "MAIN"` (default)

Every direct `<g>` child of the KanjiVG root character group (`<g id="kvg:StrokePaths_XXXXX"><g id="kvg:XXXXX" kvg:element="...">`) is one "block" — all descendant `<path>` elements under it get that block's color, regardless of further nesting.

### `colorCriteria: "SUB1"`

Descends the whole tree recursively from the root character group. The first `<g>` found along a branch carrying `kvg:radical` or `kvg:element` is a block — its descendants are not searched further and inherit its color. A `<g>` with neither attribute is a pure structural wrapper (KanjiVG uses these for `kvg:position`/`kvg:phon`-only groupings) and its children are searched instead.

This surfaces the radical plus each top-level semantic component instead of just the two outermost groups. For example, in 探 (`063a2.svg`): `MAIN` yields 2 blocks (扌 and the rest), while `SUB1` yields 3 blocks (扌 radical, 㓁, and 木), because the `kvg:position="right"`/`kvg:phon="㓁+木"` wrapper `<g>`s in between carry neither attribute and are transparently skipped.

### `colorCriteria: "SUB2"`

Like `SUB1`, but allows one extra level of labeled descent past the first labeled `<g>` found along a branch. After that first hit, its descendants are searched (through any purely structural wrappers) for a further `<g>` carrying `kvg:radical`/`kvg:element`. If one or more are found, those become the blocks instead of the first hit; if none are found, the first hit itself is the block (same as `SUB1`).

For example, in 導 (`05c0e.svg`), whose structure is:

```
導
├─ 道 (top)         <- SUB1 stops here
│  ├─ 首
│  │  └─ 自 → 目
│  └─ ⻌
└─ 寸 (radical, bottom)
```

`SUB1` yields 2 blocks (道, 寸) — it stops at the first hit. `SUB2` yields 3 blocks (首, ⻌, 寸) — one level past 道's first hit, without descending all the way to 自/目. `MAIN` also yields 2 blocks (道, 寸), same as `SUB1` here, since 道 and 寸 are already the two direct `<g>` children of the root.

### `colorCriteria: "SUBMAX"`

The unbounded version of `SUB2`: keeps descending through a labeled `<g>` — at any depth, not just one level — as long as it has further nested `<g>`s carrying `kvg:element`/`kvg:radical`. A branch only stops, and becomes a block, at a labeled `<g>` with no further labeled descendants left (a true semantic leaf).

A labeled `<g>` being descended through this way (rather than stopped at) can have its own direct `<path>` children — strokes belonging to that group itself, before or between its sub-components. Unlike `MAIN`/`SUB1`, such a run does **not** get a block/color of its own: it merges into a neighboring sub-component's block instead (the nearest one already found earlier in that group's own order if there is one, otherwise the next one found afterward, however deeply nested). `SUB2` handles the same situation the same way, just simpler — since it only ever replaces a group with children exactly one level down, any such stray strokes always merge into the first of those children. Without this handling, a group's own lead-in strokes would either fragment into extra unlabeled micro-blocks (consuming palette colors for what's usually just one or two strokes) or, worse, be left completely uncolored.

In 導: `SUBMAX` yields 3 blocks (目, ⻌, 寸) — 首's 3 lead-in strokes merge into 目 (found via 自→目, its own first sub-component), rather than becoming a 4th unlabeled block. In 探: `SUBMAX` yields 4 blocks (扌, 冖, 丿, 木) — identical to `SUB2` here, since 探's nested structure is only one level deeper than `SUB1` at every branch.

`SUBMAX` never swallows further structure by construction (every block it produces is, by definition, a semantic leaf) — it is the deepest decomposition KanjiVG's own tagging supports for a given character. This can mean many small blocks for structurally complex/rare characters; `SUB1`/`SUB2` exist as shallower, more conservative alternatives for exactly that reason.

### `colorCriteria: "KRAD"`

Unlike `MAIN`/`SUB1`/`SUB2`/`SUBMAX` — all of which derive their blocks purely from how deep KanjiVG's own `kvg:element`/`kvg:radical` tagging happens to go for a given character — `KRAD` uses **KRADFILE**, an independent kanji-component dataset maintained by the [Electronic Dictionary Research and Development Group (EDRDG)](https://www.edrdg.org/wiki/index.php/KANJIDIC_Project), as an external source of which sub-components are teaching-relevant for each kanji. KRADFILE is a flat (non-hierarchical) per-kanji component list, built independently of KanjiVG with a deliberately finer-grained component vocabulary than the 214 classical Kangxi radicals.

For a kanji covered by DAKAISB's bundled KRADFILE-to-KanjiVG mapping (`src/kradData.json`), every labeled `<g>` whose `kvg:element` (or `kvg:original`) is in that kanji's KRAD component set becomes its own block — using only that group's own direct `<path>` children, so a target nested inside another target (e.g. `土` inside `至`, both listed as separate components of 屋) still becomes its own separate block rather than being absorbed into its parent's, matching KRADFILE's flat, non-nesting view of the character. A labeled `<g>` not in the target set is transparent (the walk descends through it looking for a target further down). A kanji not covered by the bundled mapping — or one where the mapping process found no usable correspondence at all — falls back to `SUBMAX` for that character.

In 屋: `KRAD` yields 3 blocks (`尸`, `至`, `土`) — note `至` and `土` are two *separate* blocks here, unlike `SUBMAX` (which would give only 2, since `至` swallows `土` by SUBMAX's own semantic-leaf rule). In 導: `KRAD` yields 4 blocks (`首`, `自`, `辶`, `寸`) — `自` absorbs its nested `目` (not itself a KRAD component of 導), while `辶` is correctly matched even though the actual KanjiVG group is tagged `⻌` (`kvg:original="辶"`).

`src/kradData.json`'s mapping was produced by an automated matching pass (exact `kvg:element`/`kvg:original` matches) followed by AI-assisted judgment for the remainder, informed by cross-kanji statistical co-occurrence and, where needed, direct inspection of KanjiVG source files — see the project's `docsNoGit/` research notes for full methodology. It necessarily inherits both sources' own limits: a small number of complex traditional (kyūjitai) characters have KRADFILE and KanjiVG structures that are fundamentally incompatible rather than just differently named, and are excluded from the mapping for that character rather than forced into a wrong match.

KRADFILE component data is Copyright 2001/2007 Michael Raine, James Breen and the Electronic Dictionary Research & Development Group, licensed under [CC BY-SA 4.0](https://www.edrdg.org/edrdg/licence.html). See the [KANJIDIC Project page](https://www.edrdg.org/wiki/index.php/KANJIDIC_Project) for more. This is separate from DAKAISB's own license below and from KanjiVG's license (see "License" further down) — using `colorCriteria: "KRAD"` means your usage is also subject to KRADFILE's CC BY-SA 4.0 attribution requirement.

### `colorCriteria: "CHISE_MAIN"`

Like `KRAD`, `CHISE_MAIN` uses an external, independently-compiled kanji-component source instead of relying on how deep KanjiVG's own tagging happens to go — but from a different project, with a **critical packaging difference from every other criterion**: its data is **never bundled with the DAKAISB npm package**, and DAKAISB never loads it on its own. You must generate it locally and pass it in yourself as the `chiseData` config option.

**Why CHISE, in addition to KRAD (not instead of it)**: KRADFILE is a flat, empirically-compiled component list; some readers consider it less rigorously documented than [CHISE](https://www.chise.org/) (Character Information Service Environment), which expresses each character's composition as an **IDS** (Ideographic Description Sequence) — e.g. 導 is `⿱道寸` ("道 above 寸"), 探 is `⿰扌罙` ("扌 beside 罙"). CHISE gives an alternative, differently-sourced decomposition for the same purpose, useful for cross-checking or for contexts that specifically call for IDS-based rather than KRADFILE-based grouping. There are two CHISE-based criteria (`CHISE_MAIN` here, `CHISE_SUBMAX` below), differing only in how deep the IDS decomposition is allowed to go — see `CHISE_SUBMAX`'s own section for that distinction. Both stay available side by side with KRAD — none of the three replaces another.

**Why it's never bundled**: the IDS data used here is sourced via the [cjkvi/cjkvi-ids](https://github.com/cjkvi/cjkvi-ids) mirror of the CHISE IDS Database, and is licensed under **GPLv2** — a different license family from DAKAISB itself ([PolyForm Noncommercial](LICENSE.md)), KanjiVG (CC BY-SA 3.0), or KRADFILE (CC BY-SA 4.0). Statically bundling GPLv2 data into a PolyForm Noncommercial npm package risks being read as a "combined work" under the GPL rather than mere aggregation. To avoid that risk entirely, the generated data file is kept physically outside the published package: it lives in a `chisedata/` folder at the project root that is gitignored and never published to npm, produced by scripts in `tools/` that anyone can run locally.

**Algorithmically**, `CHISE_MAIN` mirrors `KRAD`'s walk exactly (same target-set walk: a labeled `<g>` whose `kvg:element`/`kvg:original` is in the kanji's CHISE component set becomes its own block using only its own direct paths, nested targets are peers not parent/child, unclaimed strokes bubble up to the nearest enclosing target). What differs is the source/granularity of the target set — CHISE's IDS decomposition is recursively expanded, but each branch stops at the first KanjiVG-recognized component it reaches (comparable in spirit to `SUB1`'s "first hit and stop" rule), rather than pursuing KRADFILE's own as-given granularity — **and what happens when there's no usable mapping**: unlike `KRAD`, which falls back to `SUBMAX` automatically, `CHISE_MAIN` **throws** if `chiseData` isn't passed at all, or if the specific kanji has no entry in it. This is deliberate: `chiseData` is opt-in and trivially easy to simply forget to pass, so a silent SUBMAX substitution would be too easy to mistake for genuine CHISE_MAIN output. If you want a fallback, catch the error and choose one yourself.

In 屋: `CHISE_MAIN` yields 2 blocks (`尸`, `至`) from the IDS decomposition `⿸尸至` expanded one level (both operands are already recognized KanjiVG elements, so neither branch expands further, even though 至 itself has its own further IDS entry — CHISE_MAIN's KanjiVG-gated stopping rule, below, is exactly why it doesn't follow it). In 導: `CHISE_MAIN` yields 2 blocks (`道`, `寸`) directly from `⿱道寸` (道 is already a recognized KanjiVG element, so that branch doesn't expand further). In 探: `CHISE_MAIN` yields 3 blocks (`扌`, `㓁`, `木`) from `⿰扌罙` recursively expanded, since 罙 itself has no KanjiVG counterpart and further decomposes to 罒/㓁 above 木.

#### Setup

Generating `chisedata/chise.json` is a multi-step pipeline (only the first step is a single command — the rest need either a completed mapping already in hand or a judgment step over a small number of leftover cases):

```bash
npm run fetch-chise                    # 1. downloads IDS data, matches ~90% of components against KanjiVG deterministically
npm run fetch-chise:prepare-phase3     # 2. groups the remaining unresolved components for judgment
#    (judge the resulting chisedata/chise-phase3-components.json entries, saving
#    resolutions into chisedata/chise-phase3-components-resolved.json — this step
#    needs case-by-case judgment and isn't a single script)
npm run fetch-chise:build-mapping      # 3. merges deterministic + judged results
npm run fetch-chise:build-data         # 4. writes chisedata/chise.json, the file you actually load
```

Step 1 alone already gets you the ~90% of components KanjiVG matches exactly or via its own declared `kvg:original` variants — sufficient for many kanji on its own. Steps 2–4 close the remaining gap. Each script prints what it did and where it wrote its output; `npm run fetch-chise`'s own log also restates these next steps at the end of its run.

#### Importing it into your own project

DAKAISB itself never reads `chisedata/chise.json` — you import it in **your own project**, the same way you'd import any other local JSON asset, and pass it in explicitly:

```js
import { createKanjiAnimation } from 'dakaisb'
import chiseData from '../path/to/DAKAISB/chisedata/chise.json' with { type: 'json' }
// or, if you'd rather not rely on a JSON import assertion:
// import { readFileSync } from 'node:fs'
// const chiseData = JSON.parse(readFileSync('../path/to/DAKAISB/chisedata/chise.json', 'utf8'))

const anim = createKanjiAnimation(svgText, containerEl, {
  colorCriteria: 'CHISE_MAIN',
  chiseData, // <- required; "CHISE_MAIN" throws without it
})
```

If you don't pass `chiseData` at all, or the specific kanji isn't covered by it, `colorCriteria: "CHISE_MAIN"` **throws an `Error`** — it does not silently fall back to `"SUBMAX"` the way `"KRAD"` does. This is deliberate: `chiseData` is opt-in and easy to simply forget to pass, so a silent substitution would be too easy to mistake for genuine CHISE_MAIN output — if a call to `createKanjiAnimation`/`assignBlockColors` with `colorCriteria: "CHISE_MAIN"` succeeds, its result is guaranteed to be real CHISE_MAIN-derived coloring. If you want a fallback for uncovered kanji, catch the error yourself and retry with another `colorCriteria` (e.g. `"SUBMAX"`). The bundled demo (`test/test-page.html`) sidesteps this by only adding "CHISE_MAIN" to its criteria picker if a local `fetch('../chisedata/chise.json')` succeeds in the first place; if you haven't run the setup steps above, the option simply doesn't appear, so the demo never hits the error path.

If you generate and use `chisedata/chise.json`, you are subject to CHISE/IDS's own GPLv2 licensing terms for your use of that specific data — see License below.

### `colorCriteria: "CHISE_SUBMAX"`

Same CHISE/IDS source, same never-bundled data policy, and the exact same runtime walk algorithm as `CHISE_MAIN` above — but built from a **deeper, independently-expanded component set**. The difference is entirely in how the target-set data is generated, not in how it's used at runtime.

**The distinction, precisely**: `CHISE_MAIN` deliberately lets KanjiVG's own tagging depth gate how far its IDS expansion goes — each branch stops at the first component that's already a recognized KanjiVG element (see its own section above for why: an earlier attempt at unconstrained expansion over-decomposed components like 土, which have their own IDS entry into raw strokes despite being genuine KanjiVG teaching units). `CHISE_SUBMAX` takes the opposite position: **CHISE/IDS is treated as authoritative in its own right**, not a derivative of KanjiVG's tagging — every branch is followed all the way to CHISE/IDS's own true leaves (a self-decomposing/atomic character, or one with no further IDS entry) regardless of what KanjiVG already tags at some intermediate depth. KanjiVG only enters the picture afterward, purely to find which group to color for each resulting leaf — never to decide how far the decomposition itself goes. This mirrors exactly how KRADFILE's already-flat component list is matched against KanjiVG for `KRAD`, rather than CHISE_MAIN's KanjiVG-gated expansion.

Continuing the 屋 example from `CHISE_MAIN` above: 屋's IDS is `⿸尸至`, and while 尸 is already an IDS leaf (self-decomposing), 至 has its own further entry (`⿱𠫔土`, itself expanding further). `CHISE_MAIN` stops at 至 because it's already a recognized KanjiVG element; `CHISE_SUBMAX` keeps going, past 至, all the way down to its own true leaves. Neither result is "more correct" — they answer different questions (see the two criteria's own `academic` notes via `kanjiAnimationInfo({ criteria: 'CHISE_SUBMAX', details: true })` for the full methodological rationale and corpus-wide statistics once generated).

#### Setup

Same shape as `CHISE_MAIN`'s pipeline, entirely separate scripts and output files — `CHISE_SUBMAX`'s data is **not interchangeable** with `CHISE_MAIN`'s:

```bash
npm run fetch-chise-submax                    # 1. downloads IDS data, expands to true IDS leaves, matches deterministically against KanjiVG
npm run fetch-chise-submax:prepare-phase3     # 2. groups the remaining unresolved components for judgment
#    (judge the resulting chisedata/chise-submax-phase3-components.json entries, saving
#    resolutions into chisedata/chise-submax-phase3-components-resolved.json — this step
#    needs case-by-case judgment and isn't a single script)
npm run fetch-chise-submax:build-mapping      # 3. merges deterministic + judged results
npm run fetch-chise-submax:build-data         # 4. writes chisedata/chise-submax.json, the file you actually load
```

#### Importing it into your own project

Same pattern as `CHISE_MAIN`, pointing at the other file:

```js
import { createKanjiAnimation } from 'dakaisb'
import chiseData from '../path/to/DAKAISB/chisedata/chise-submax.json' with { type: 'json' }

const anim = createKanjiAnimation(svgText, containerEl, {
  colorCriteria: 'CHISE_SUBMAX',
  chiseData, // <- required; "CHISE_SUBMAX" throws without it, same policy as CHISE_MAIN
})
```

Same throw-not-fallback policy as `CHISE_MAIN`: no silent `"SUBMAX"` substitution if `chiseData` is missing or the kanji isn't covered. If you generate and use `chisedata/chise-submax.json`, you are subject to CHISE/IDS's own GPLv2 licensing terms for your use of that specific data — see License below.

## License

Copyright 2026 Alessandro Mantelli

DAKAISB's own code is licensed under the [PolyForm Noncommercial License 1.0.0](LICENSE.md) — free for noncommercial use (personal, research, education, nonprofits); commercial use requires a separate license (contact in [LICENSE.md](LICENSE.md)).

This is separate from the KanjiVG *data* (the SVG files themselves, e.g. in `assets/kanjivg/` or any KanjiVG repository you point `svgPath`/`createKanjiAnimation` at), which is CC BY-SA 3.0 — see https://kanjivg.tagaini.net/ for attribution requirements when distributing KanjiVG SVG files. DAKAISB's license does not apply to that data, and using DAKAISB does not change KanjiVG's own licensing obligations.

Likewise, `src/kradData.json` (used only by `colorCriteria: "KRAD"`) is derived from KRADFILE, Copyright 2001/2007 Michael Raine, James Breen and the Electronic Dictionary Research & Development Group (EDRDG), CC BY-SA 4.0 — see https://www.edrdg.org/edrdg/licence.html and https://www.edrdg.org/wiki/index.php/KANJIDIC_Project for attribution requirements. DAKAISB's own license does not apply to this data either, and using `colorCriteria: "KRAD"` does not change KRADFILE's own licensing obligations.

`colorCriteria: "CHISE_MAIN"` and `"CHISE_SUBMAX"` are different from every other criterion in one important way: their data is **not distributed with DAKAISB at all**. The IDS data both are derived from comes from the [CHISE project](https://www.chise.org/) via the [cjkvi/cjkvi-ids](https://github.com/cjkvi/cjkvi-ids) mirror, and is licensed under **GPLv2** — incompatible with bundling into a PolyForm Noncommercial-licensed npm package. Because of this, neither `chisedata/chise.json` (`CHISE_MAIN`) nor `chisedata/chise-submax.json` (`CHISE_SUBMAX`) is ever generated as part of installing or building DAKAISB, published to npm, or read by DAKAISB's own code; each exists only if you run its own pipeline (`tools/fetch-chise.mjs` for `CHISE_MAIN`, `tools/fetch-chise-submax.mjs` for `CHISE_SUBMAX`, plus the rest of the corresponding pipeline described above) yourself, and only then do you load and pass it in as the `chiseData` config option. If you do generate and use either file, **you** — not DAKAISB — are responsible for complying with GPLv2 for your own use of that specific data. DAKAISB's own license is unaffected either way, since it never includes or depends on this data.