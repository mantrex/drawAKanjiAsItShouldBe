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
  colorCriteria: 'MAIN', // or 'SUB1'
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
| `colorCriteria` | `"MAIN"` (default) or `"SUB1"` — see below |
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

## License

DAKAISB's own code is licensed under the [PolyForm Noncommercial License 1.0.0](LICENSE.md) — free for noncommercial use (personal, research, education, nonprofits); commercial use requires a separate license (contact in [LICENSE.md](LICENSE.md)).

This is separate from the KanjiVG *data* (the SVG files themselves, e.g. in `assets/kanjivg/` or any KanjiVG repository you point `svgPath`/`createKanjiAnimation` at), which is CC BY-SA 3.0 — see https://kanjivg.tagaini.net/ for attribution requirements when distributing KanjiVG SVG files. DAKAISB's license does not apply to that data, and using DAKAISB does not change KanjiVG's own licensing obligations.