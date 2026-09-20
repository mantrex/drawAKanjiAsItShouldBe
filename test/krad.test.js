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
const zhangSvgText = readFileSync(path.join(dir, "04e08.svg"), "utf-8");

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
      colorCriteria: "KVG-KRAD",
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

    // 窺's kvg:g2 (宀, a REAL KRAD target) contains kvg:g3 (冖, no entry in
    // 窺's KRAD target list, owns strokes s2/s3) nested inside it, followed
    // by kvg:g4 (八, ALSO a real KRAD target, s4/s5) as 冖's own sibling —
    // both 冖 and 八 sit inside 宀, but 八 is not nested inside 冖 itself.
    // 冖's strokes correctly bubble up into the enclosing 宀 target's own
    // block (宀 is 冖's nearest actual target ancestor). 八, being its own
    // independent target found as 冖's sibling, must keep its own name —
    // inheriting "冖" here would silently hide a genuine KRAD target's name
    // behind an unrelated sibling wrapper's (a bug found and fixed in this
    // same corpus after the 夫/大 fix above shipped: any untracked wrapper's
    // owned-label must never survive past its own subtree to relabel an
    // unrelated sibling's target).
    const miBlock = blocksByElement.get("宀");
    assert.ok(miBlock, "expected a 宀 block");
    assert.deepEqual(
      miBlock.pathIds,
      ["kvg:07aba-s1", "kvg:07aba-s2", "kvg:07aba-s3"],
      "宀's block must include its own stroke (s1) plus 冖's own two, since 冖 nests inside 宀 with no target of its own"
    );
    const baBlock = blocksByElement.get("八");
    assert.ok(baBlock, "expected a genuinely-named 八 block, not hidden behind 冖's name");
    assert.deepEqual(baBlock.pathIds, ["kvg:07aba-s4", "kvg:07aba-s5"], "八's block must be exactly its own two strokes, not merged with 冖's");
  });
});

test("KRAD: an untracked wrapper's own TRAILING stroke (after its nested target) must not relabel that target", async () => {
  await withDom(({ createKanjiAnimation, document }) => {
    const container = document.createElement("div");
    const blocksByElement = new Map();

    createKanjiAnimation(zhangSvgText, container, {
      colorCriteria: "KVG-KRAD",
      onPartClick(detail) {
        blocksByElement.set(detail.element, detail);
      },
    });

    for (const p of container.querySelectorAll("path")) {
      p.dispatchEvent(new window.Event("click", { bubbles: true }));
    }

    // 丈's kvg:g2 (乂, no entry in 丈's KRAD target list) contains a nested
    // target 丿 (s2) FIRST, then owns its own direct stroke (s3) AFTER it —
    // the reverse document order from 夫/大 above (夫 owns its stroke BEFORE
    // its nested target). Since 乂's own stroke hasn't been "drawn yet" by
    // the time 丿 is reached, 丿's block must keep its own name — labeling
    // it "乂" here would be wrong for the same reason as the 冖/八 case
    // above (found via the same corpus-wide audit).
    assert.equal(blocksByElement.has("乂"), false, "no strokes should end up under 乂's own name for this kanji");
    const pieBlock = blocksByElement.get("丿");
    assert.ok(pieBlock, "expected a genuinely-named 丿 block");
    assert.deepEqual(pieBlock.pathIds, ["kvg:04e08-s2"], "丿's block must be exactly its own single stroke");
  });
});
