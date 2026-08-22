// KRAD block-assignment behavior: when a KanjiVG group is labeled but has NO
// entry of its own in a kanji's KRAD target list (e.g. 夫 in 窺/規, where
// KRADFILE only records 大/宀/穴/見 or 大/見 as targets — not 夫), that
// group's own direct stroke has no "correct" block of its own to join.
// It's attached to the nearest KRAD target actually found while descending
// through that untracked wrapper (here: the nested 大), rather than
// bubbling further up to an unrelated sibling target several strokes away —
// confirmed against real kanji: for 規 (夫+見), attaching 夫's lone stroke to
// 見 (the next sibling target at the outer level) instead of 大 (the target
// immediately nested inside 夫 itself) reads as visibly wrong, the two
// belong nowhere near each other on the character.
//
// The resulting merged block is labeled by the UNTRACKED WRAPPER (夫), not
// by the narrower target that happened to claim the strokes (大): KanjiVG
// itself tags the <g> containing all four strokes together as 夫 — that
// block visually and structurally IS 夫, and naming it "大" would be
// misleading (大 alone is only 3 of those 4 strokes; DAKAISB-TALES's "story
// of 大" for that merged block would be describing a component narrower
// than what's actually shown/clickable). See 07aba.svg (窺) for the fixture
// this test uses.
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

test("KRAD: an untracked wrapper's own stroke joins its nested target's block, labeled as the wrapper", async () => {
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
    // stroke s6 and wraps kvg:g7 (大, a real target, s7/s8/s9). The merged
    // block must contain all four strokes AND be labeled "夫" — the wrapper
    // KanjiVG itself tags as containing them all, not the narrower "大".
    assert.equal(blocksByElement.has("大"), false, "merged block must be labeled 夫, not 大");
    const fuBlock = blocksByElement.get("夫");
    assert.ok(fuBlock, "expected a 夫 block to be found");
    assert.deepEqual(
      fuBlock.pathIds,
      ["kvg:07aba-s6", "kvg:07aba-s7", "kvg:07aba-s8", "kvg:07aba-s9"],
      "夫's block must include its own stroke (s6) plus 大's own three"
    );
  });
});
