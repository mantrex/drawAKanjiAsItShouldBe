// KRAD block-assignment behavior: when a KanjiVG group is labeled but has NO
// entry of its own in a kanji's KRAD target list (e.g. 夫 in 窺/規, where
// KRADFILE only records 大/宀/穴/見 or 大/見 as targets — not 夫), that
// group's own direct stroke has no "correct" block of its own to join.
// It's attached to the nearest KRAD target actually found while descending
// through that untracked wrapper (here: the nested 大), rather than
// bubbling further up to an unrelated sibling target several strokes away.
// Confirmed against real kanji: for 規 (夫+見), attaching 夫's lone stroke to
// 見 (the next sibling target at the outer level) instead of 大 (the target
// immediately nested inside 夫 itself) reads as visibly wrong — the two
// belong nowhere near each other on the character. See 07aba.svg (窺) for
// the fixture this test uses.
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

test("KRAD: an untracked wrapper's own stroke joins the nested target found while descending through it", async () => {
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

    // 窺's kvg:g6 (夫, no entry in 窺's KRAD target list) directly owns
    // stroke s6 and wraps kvg:g7 (大, a real target, s7/s8/s9) — s6 must
    // join 大's block, not bubble further up to 穴/見/宀.
    const daiBlock = blocksByElement.get("大");
    assert.ok(daiBlock, "expected a 大 block to be found");
    assert.deepEqual(
      daiBlock.pathIds,
      ["kvg:07aba-s6", "kvg:07aba-s7", "kvg:07aba-s8", "kvg:07aba-s9"],
      "大's block must include 夫's own untracked stroke (s6) alongside its own three"
    );
  });
});
