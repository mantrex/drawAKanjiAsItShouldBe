# DAKAISB — Draw A Kanji As It Should Be

Dependency-free stroke-order animation for [KanjiVG](https://kanjivg.tagaini.net/)-format SVGs, with per-block (radical/component) coloring.

No Vue/Nuxt/Quasar/Snap.svg/Raphael dependency — plain DOM APIs only (`DOMParser`, `SVGGeometryElement.getTotalLength()`, Web Animations API), usable from any frontend.

## Usage

```js
import { createKanjiAnimation } from 'dakaisb'

const svgText = await fetch('/path/to/kanjivg/063a2.svg').then(r => r.text())
const anim = createKanjiAnimation(svgText, containerEl, {
  colors: ['#f0708a', '#f0a860', /* ... up to 10 */],
  defaultColor: '#93969f',
  speed: 350,
  showStrokeNumbers: false,
  strokeWidth: 3,
  strokeNumberColor: '#f0708a',
  strokeAnimationColor: null,       // e.g. 'red' — momentary color while a stroke is drawing
  strokeAnimationColorFade: 0,      // 0-100, % of the stroke's own duration spent crossfading to its final color
  colorCriteria: 'MAIN', // or 'SUB1'
})

anim.play()
anim.pause()
anim.stop()     // resets to the undrawn state
anim.destroy()  // cancels animations, clears the container
```

## Config

See `src/defaultConfig.json` for defaults. Every field can be overridden per call to `createKanjiAnimation`.

| Field | Meaning |
|---|---|
| `colors` | Array of up to 10 colors, one per block, assigned in document order. Accepts any valid SVG `stroke` value, including `var(--css-custom-property)` |
| `defaultColor` | Color for strokes with no wrapping block-level `<g>` (a real KanjiVG edge case) |
| `speed` | Milliseconds per stroke |
| `showStrokeNumbers` | Whether to keep the `kvg:StrokeNumbers_*` labels, revealed one at a time in sync with each stroke |
| `strokeWidth` | SVG stroke-width for animated paths |
| `strokeNumberColor` | Color for stroke-order number labels (only used if `showStrokeNumbers` is true) |
| `strokeAnimationColor` | If set, the momentary color a stroke is drawn in while animating, before settling to its final block color. `null`/unset means strokes are always their final color, even while drawing |
| `strokeAnimationColorFade` | `0`–`100`. Percent of each stroke's own duration spent crossfading from `strokeAnimationColor` to its final block color. `0` = hard switch right as the stroke finishes; higher values start the crossfade earlier in that stroke's animation. Ignored if `strokeAnimationColor` is unset |
| `colorCriteria` | `"MAIN"` (default) or `"SUB1"` — see below |

## How block coloring works

### `colorCriteria: "MAIN"` (default)

Every direct `<g>` child of the KanjiVG root character group (`<g id="kvg:StrokePaths_XXXXX"><g id="kvg:XXXXX" kvg:element="...">`) is one "block" — all descendant `<path>` elements under it get that block's color, regardless of further nesting. A bare `<path>` with no wrapping block-level `<g>` gets `defaultColor` instead of silently reusing block 1's color.

### `colorCriteria: "SUB1"`

Descends the whole tree recursively from the root character group. The first `<g>` found along a branch carrying `kvg:radical` or `kvg:element` is a block — its descendants are not searched further and inherit its color. A `<g>` with neither attribute is a pure structural wrapper (KanjiVG uses these for `kvg:position`/`kvg:phon`-only groupings) and its children are searched instead.

This surfaces the radical plus each top-level semantic component instead of just the two outermost groups. For example, in 探 (`063a2.svg`): `MAIN` yields 2 blocks (扌 and the rest), while `SUB1` yields 3 blocks (扌 radical, 㓁, and 木), because the `kvg:position="right"`/`kvg:phon="㓁+木"` wrapper `<g>`s in between carry neither attribute and are transparently skipped.

## License

MIT. KanjiVG data itself is CC BY-SA 3.0 — see https://kanjivg.tagaini.net/ for attribution requirements when distributing KanjiVG SVG files.