// A component KanjiVG splits into parts (kvg:part) is one block, one color:
// 園's 囗 is strokes 1–2 (part 1) and 13 (part 2), with 袁 in between —
// stroke 13 must take 囗's color, not the next one in the palette.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parseHTML } from "linkedom";

const dir = path.dirname(fileURLToPath(import.meta.url));
const svgText = readFileSync(path.join(dir, "05712.svg"), "utf-8");

async function withDom(run) {
  const { window, document } = parseHTML("<!doctype html><html><body></body></html>");
  const saved = { window: globalThis.window, document: globalThis.document, DOMParser: globalThis.DOMParser };
  globalThis.window = window;
  globalThis.document = document;
  globalThis.DOMParser = window.DOMParser;
  globalThis.performance = globalThis.performance || { now: () => Date.now() };
  window.Element.prototype.animate = function () {
    return { play() {}, pause() {}, cancel() {}, finish() {}, set currentTime(_) {}, get currentTime() { return 0; } };
  };
  window.Element.prototype.getTotalLength = function () {
    return 100;
  };
  try {
    const { createKanjiAnimation } = await import("../src/index.js");
    return await run({ createKanjiAnimation, document });
  } finally {
    Object.assign(globalThis, saved);
  }
}

const stroke = (n) => `kvg:05712-s${n}`;

for (const colorCriteria of ["MAIN", "SUB1", "SUBMAX", "KVG-KRAD"]) {
  test(`${colorCriteria}: the two parts of 園's 囗 are one block, one color`, async () => {
    await withDom(({ createKanjiAnimation, document }) => {
      const anim = createKanjiAnimation(svgText, document.createElement("div"), { colorCriteria });
      const enclosure = anim.blocks.find((b) => b.pathIds.includes(stroke(1)));
      assert.deepEqual(enclosure.pathIds, [stroke(1), stroke(2), stroke(13)]);
      assert.equal(enclosure.element, "囗");
      assert.ok(!anim.blocks.some((b) => b !== enclosure && b.pathIds.includes(stroke(13))));
      // indexes and colors stay consecutive, in reading order
      anim.blocks.forEach((b, i) => assert.equal(b.index, i));
      assert.equal(new Set(anim.blocks.map((b) => b.color)).size, anim.blocks.length);
      const listed = anim.blocks.flatMap((b) => b.pathIds);
      assert.equal(listed.length, 13);
      assert.equal(new Set(listed).size, 13);
    });
  });
}
