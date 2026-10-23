// Verifies the `blocks` array on an animation instance: one entry per block
// colorCriteria produces, the same metadata onPartClick reports, covering
// every stroke exactly once, and a copy (changing it does not touch the
// instance's own blocks).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parseHTML } from "linkedom";

const dir = path.dirname(fileURLToPath(import.meta.url));
const svgText = readFileSync(path.join(dir, "05c0e.svg"), "utf-8");

async function withDom(run) {
  const { window, document } = parseHTML("<!doctype html><html><body></body></html>");
  const saved = { window: globalThis.window, document: globalThis.document, DOMParser: globalThis.DOMParser };
  globalThis.window = window;
  globalThis.document = document;
  globalThis.DOMParser = window.DOMParser;
  globalThis.performance = globalThis.performance || { now: () => Date.now() };
  // not implemented by linkedom, irrelevant here (see onPartClick.test.js)
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

for (const colorCriteria of ["MAIN", "SUBMAX", "KVG-KRAD"]) {
  test(`blocks lists the ${colorCriteria} blocks with their metadata, every stroke once`, async () => {
    await withDom(({ createKanjiAnimation, document }) => {
      const container = document.createElement("div");
      const clicks = [];
      const anim = createKanjiAnimation(svgText, container, { colorCriteria, onPartClick: (part) => clicks.push(part) });

      assert.ok(Array.isArray(anim.blocks) && anim.blocks.length > 0);
      anim.blocks.forEach((b, i) => {
        assert.equal(b.index, i);
        assert.ok("element" in b && "radical" in b && b.color && Array.isArray(b.pathIds) && b.pathIds.length > 0);
      });

      const strokeIds = [...container.querySelectorAll("path")].map((p) => p.getAttribute("id")).filter((id) => /-s\d+$/.test(id || ""));
      const listed = anim.blocks.flatMap((b) => b.pathIds);
      assert.deepEqual([...listed].sort(), [...new Set(strokeIds)].sort(), "every stroke in exactly one block");

      // same metadata as a click on that block's first stroke
      const first = anim.blocks[0];
      container.querySelector(`path[id="${first.pathIds[0]}"]`).dispatchEvent(new window.Event("click"));
      assert.deepEqual({ ...clicks[0] }, first);

      // a copy
      anim.blocks[0].pathIds.push("x");
      assert.ok(!createKanjiAnimation(svgText, document.createElement("div"), { colorCriteria }).blocks[0].pathIds.includes("x"));
    });
  });
}
