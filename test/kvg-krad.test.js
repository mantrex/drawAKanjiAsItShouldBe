// KVG-KRAD: KRADFILE names atomic components (丿, 一) that KanjiVG leaves as
// ungrouped strokes in 右. Plain KRAD folded both into 口's block; KVG-KRAD
// carves them out into blocks of their own, named after the component.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parseHTML } from "linkedom";

const dir = path.dirname(fileURLToPath(import.meta.url));
const svgText = readFileSync(path.join(dir, "053f3.svg"), "utf-8");

test("KVG-KRAD names the untagged strokes of 右 instead of folding them into 口", async () => {
  const { window } = parseHTML("<html><body></body></html>");
  globalThis.DOMParser = window.DOMParser;
  const { parseKanjiVg } = await import("../src/parseKanjiVg.js");
  const { assignBlockColors, assignBlockColorsKradBase } = await import("../src/assignBlockColors.js");
  const { rootCharGroupEl } = parseKanjiVg(svgText);
  const colors = ["a", "b", "c", "d"];

  const base = assignBlockColorsKradBase(rootCharGroupEl, colors);
  assert.equal(base.blocks.length, 1, "plain KRAD absorbs everything into 口");

  const { blocks, pathToColor } = assignBlockColors(rootCharGroupEl, colors, "KVG-KRAD");
  assert.deepEqual(blocks.map((b) => b.element), ["丿", "一", "口"]);
  assert.deepEqual(blocks.map((b) => b.pathIds.length), [1, 1, 3]);
  assert.equal(pathToColor.size, 5, "every stroke is coloured exactly once");
  assert.equal(new Set(blocks.map((b) => b.color)).size, 3, "three distinct colours");
});
