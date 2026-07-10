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
| `colors` | Array of up to 10 colors, one per top-level KanjiVG block, assigned in document order |
| `defaultColor` | Color for strokes with no wrapping block-level `<g>` (a real KanjiVG edge case) |
| `speed` | Milliseconds per stroke |
| `showStrokeNumbers` | Whether to keep the `kvg:StrokeNumbers_*` labels |
| `strokeWidth` | SVG stroke-width for animated paths |
| `strokeNumberColor` | Color for stroke-order number labels (only used if `showStrokeNumbers` is true) |

## How block coloring works

Every direct `<g>` child of the KanjiVG root character group (`<g id="kvg:StrokePaths_XXXXX"><g id="kvg:XXXXX" kvg:element="...">`) is one "block" — all descendant `<path>` elements under it get that block's color, regardless of further nesting. A bare `<path>` with no wrapping block-level `<g>` gets `defaultColor` instead of silently reusing block 1's color.

## License

MIT. KanjiVG data itself is CC BY-SA 3.0 — see https://kanjivg.tagaini.net/ for attribution requirements when distributing KanjiVG SVG files.