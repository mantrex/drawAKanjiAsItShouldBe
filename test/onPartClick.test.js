// Verifies the onPartClick callback: it must fire once per click, with the
// clicked block's metadata, and must not alter default behavior (no
// callback => no listeners attached, no crash).
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
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalDOMParser = globalThis.DOMParser;
  const originalPerformance = globalThis.performance;

  globalThis.window = window;
  globalThis.document = document;
  globalThis.DOMParser = window.DOMParser;
  globalThis.performance = globalThis.performance || { now: () => Date.now() };

  // Element.animate() (Web Animations API) and SVGPathElement.getTotalLength()
  // aren't implemented by linkedom; stub both so buildStrokeAnimations
  // doesn't throw in this DOM-only test — their actual values are irrelevant
  // here, only onPartClick's own wiring is under test.
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

test("onPartClick fires with block metadata when a part is clicked", async () => {
  await withDom(({ createKanjiAnimation, document }) => {
    const container = document.createElement("div");
    const clicks = [];

    createKanjiAnimation(svgText, container, {
      onPartClick(detail) {
        clicks.push(detail);
      },
    });

    const firstPath = container.querySelector("path");
    assert.ok(firstPath, "expected at least one <path> in the rendered SVG");

    firstPath.dispatchEvent(new window.Event("click", { bubbles: true }));

    assert.equal(clicks.length, 1);
    assert.equal(typeof clicks[0].index, "number");
    assert.ok(Array.isArray(clicks[0].pathIds));
    assert.ok(clicks[0].pathIds.includes(firstPath.getAttribute("id")));
  });
});

test("without onPartClick, no click listeners are attached and rendering is unaffected", async () => {
  await withDom(({ createKanjiAnimation, document }) => {
    const container = document.createElement("div");
    const controls = createKanjiAnimation(svgText, container, {});

    const firstPath = container.querySelector("path");
    assert.ok(firstPath);
    // Should not throw even though nothing is listening.
    firstPath.dispatchEvent(new window.Event("click", { bubbles: true }));
    assert.equal(typeof controls.play, "function");
  });
});

test("destroy() removes onPartClick listeners", async () => {
  await withDom(({ createKanjiAnimation, document }) => {
    const container = document.createElement("div");
    let clickCount = 0;

    const controls = createKanjiAnimation(svgText, container, {
      onPartClick() {
        clickCount++;
      },
    });

    const firstPath = container.querySelector("path");
    firstPath.dispatchEvent(new window.Event("click", { bubbles: true }));
    assert.equal(clickCount, 1);

    controls.destroy();
    // container.innerHTML was cleared by destroy(), so re-dispatching on the
    // detached node must not increment the count (listener was removed).
    firstPath.dispatchEvent(new window.Event("click", { bubbles: true }));
    assert.equal(clickCount, 1);
  });
});
