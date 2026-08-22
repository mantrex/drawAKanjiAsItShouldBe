// Regression test for a KRAD block-assignment bug: when a KRAD target (e.g.
// 大) is nested inside a KanjiVG group that is itself labeled but NOT a KRAD
// target (e.g. 夫, which owns one direct stroke of its own plus the nested
// 大), that outer group's own stroke was wrongly absorbed into the nested
// target's block instead of staying separate. See 窺 (07aba.svg): kvg:g6
// (夫, not a KRAD target for 窺) directly owns stroke s6, and wraps kvg:g7
// (大, a KRAD target) containing only s7/s8/s9 — the 大 block must be
// exactly those three, never four.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parseHTML } from "linkedom";

const dir = path.dirname(fileURLToPath(import.meta.url));
const svgText = readFileSync(path.join(dir, "07aba.svg"), "utf-8");

async function withDom(run) {
  const { window, document } = parseHTML("<!doctype html><html><body></body></html>");
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalDOMParser = globalThis.DOMParser;
  const originalPerformance = globalThis.performance;

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
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
    globalThis.DOMParser = originalDOMParser;
    globalThis.performance = originalPerformance;
  }
}

test("KRAD: a target nested inside a non-target group doesn't absorb that group's own stroke", async () => {
  await withDom(({ createKanjiAnimation, document }) => {
    const container = document.createElement("div");
    const blocksByElement = new Map();

    createKanjiAnimation(svgText, container, {
      colorCriteria: "KRAD",
      onPartClick(detail) {
        blocksByElement.set(detail.element, detail);
      },
    });

    for (const p of container.querySelectorAll("path")) {
      p.dispatchEvent(new window.Event("click", { bubbles: true }));
    }

    const daiBlock = blocksByElement.get("大");
    assert.ok(daiBlock, "expected a 大 block to be found");
    assert.deepEqual(
      daiBlock.pathIds,
      ["kvg:07aba-s7", "kvg:07aba-s8", "kvg:07aba-s9"],
      "大's block must be exactly its own three strokes, not 夫's s6 too"
    );
  });
});
