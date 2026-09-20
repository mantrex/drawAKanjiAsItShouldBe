// index.js — DAKAISB public entry point.
// Draw A Kanji As It Should Be: dependency-free stroke-order animation for
// KanjiVG-format SVGs, with per-block coloring. No Vue/Nuxt/Quasar
// dependency — plain DOM APIs only, usable from any frontend.
import { parseKanjiVg, SVG_NS } from "./parseKanjiVg.js";
import { assignBlockColors } from "./assignBlockColors.js";
import {
  buildStrokeAnimations,
  buildStrokeNumberAnimations,
  playAnimations,
  pauseAnimations,
  resetAnimations,
  resetNumberAnimations,
} from "./strokeAnimation.js";
import { resolveConfig } from "./config.js";
import { buildGrid, buildBorder } from "./grid.js";
import { buildModel } from "./model.js";
import criteriaInfo from "./criteriaInfo.json" with { type: "json" };

/**
 * Renders an animated, per-block-colored kanji into `containerEl` from a raw
 * KanjiVG SVG string, and returns playback controls.
 *
 * @param {string} svgText - raw KanjiVG SVG file contents
 * @param {HTMLElement} containerEl - element to render the SVG into
 * @param {object} [overrides] - per-instance config overrides (see defaultConfig.json)
 */
export function createKanjiAnimation(svgText, containerEl, overrides = {}) {
  const config = resolveConfig(overrides);
  const { svgEl, rootCharGroupEl, strokePathEls, strokeNumberEls } = parseKanjiVg(svgText);

  const { pathToColor, blocks } = assignBlockColors(rootCharGroupEl, config.colors, config.colorCriteria, config.chiseData);

  if (!config.showStrokeNumbers) {
    strokeNumberEls.forEach((el) => el.remove());
  } else {
    strokeNumberEls.forEach((el) => {
      el.setAttribute("fill", config.strokeNumberColor);
    });
  }

  // size is optional: if unset, leave the SVG's own width/height alone (the
  // original behavior — it fills whatever space containerEl's CSS gives it).
  if (config.size != null) {
    svgEl.setAttribute("width", String(config.size));
    svgEl.setAttribute("height", String(config.size));
  }

  if (config.showGrid) {
    buildGrid(svgEl, {
      color: config.gridColor,
      style: config.gridStyle,
      width: config.gridWidth,
      dimension: config.borderGridDimension,
    });
  }

  if (config.showModel) {
    buildModel(svgText, svgEl, {
      modelColor: config.modelColor,
      strokeWidth: config.strokeWidth,
      showStrokeNumbers: config.showStrokeNumbers,
    });
  }

  // Border is drawn last (among the canvas overlays) so it sits on top of
  // the grid/model, framing the whole canvas.
  if (config.border) {
    buildBorder(svgEl, {
      color: config.borderColor,
      style: config.borderStyle,
      width: config.borderWidth,
      dimension: config.borderGridDimension,
    });
  }

  containerEl.innerHTML = "";
  containerEl.appendChild(svgEl);

  const animations = buildStrokeAnimations(strokePathEls, {
    speed: config.speed,
    strokeWidth: config.strokeWidth,
    pathToColor,
    defaultColor: config.colors[0],
    strokeAnimationColor: config.strokeAnimationColor,
    strokeAnimationColorFade: config.strokeAnimationColorFade,
  });

  // onPartClick wiring: click listeners attach directly to each block's own
  // <path> elements, so they're driven by the same WAAPI-animated <path>s
  // buildStrokeAnimations above colors/animates — the two mechanisms are
  // independent (DOM event listeners vs. Web Animations API) and don't
  // interfere with each other. Must run AFTER buildStrokeAnimations: that
  // function does path.removeAttribute("style") to reset each path before
  // building its animation, which would wipe out pointerEvents/cursor set
  // here if this ran first. `pointer-events: stroke` widens the click target
  // to the full visible stroke width rather than the hairline default
  // browsers use for fill="none" paths, without changing anything visual.
  const partClickCleanups = [];
  if (typeof config.onPartClick === "function") {
    const pathById = new Map(strokePathEls.map((p) => [p.getAttribute("id"), p]));
    for (const block of blocks) {
      const blockPathEls = block.pathIds.map((id) => pathById.get(id)).filter(Boolean);
      if (blockPathEls.length === 0) continue;

      const detail = {
        index: block.index,
        element: block.element,
        radical: block.radical ?? null,
        color: block.color,
        pathIds: block.pathIds,
      };
      const handleClick = (event) => config.onPartClick(detail, event);

      blockPathEls.forEach((pathEl) => {
        pathEl.style.pointerEvents = "stroke";
        pathEl.style.cursor = "pointer";
        pathEl.addEventListener("click", handleClick);
      });
      partClickCleanups.push(() => {
        blockPathEls.forEach((pathEl) => pathEl.removeEventListener("click", handleClick));
      });
    }
  }

  const numberAnimations = config.showStrokeNumbers
    ? buildStrokeNumberAnimations(strokeNumberEls, { speed: config.speed })
    : [];

  let destroyed = false;

  return {
    element: svgEl,
    // Total time (ms) the stroke animation takes from a fresh play() to
    // fully drawn — last stroke's delay (index * speed) plus its own
    // duration (speed). Used by createKanjiAnimationFromText to know when
    // it's safe to start the next kanji.
    duration: strokePathEls.length * config.speed,
    play() {
      if (destroyed) return;
      playAnimations(animations);
      playAnimations(numberAnimations);
    },
    pause() {
      if (destroyed) return;
      pauseAnimations(animations);
      pauseAnimations(numberAnimations);
    },
    stop() {
      if (destroyed) return;
      resetAnimations(animations, strokePathEls);
      resetNumberAnimations(numberAnimations, strokeNumberEls);
    },
    destroy() {
      if (destroyed) return;
      animations.forEach((a) => a.cancel());
      numberAnimations.forEach((a) => a.cancel());
      partClickCleanups.forEach((cleanup) => cleanup());
      containerEl.innerHTML = "";
      destroyed = true;
    },
  };
}

// KanjiVG filenames are the character's Unicode codepoint, lowercase hex,
// zero-padded to 5 digits (e.g. 早 U+65E9 -> "065e9.svg").
function codepointToKanjiVgFilename(char) {
  const codepoint = char.codePointAt(0);
  return codepoint.toString(16).padStart(5, "0") + ".svg";
}

async function fetchSvgForChar(char, svgPath) {
  const base = svgPath.endsWith("/") ? svgPath : svgPath + "/";
  const url = base + codepointToKanjiVgFilename(char);
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.text();
}

/**
 * Renders a sequence of animated kanji (one per character of `text`) into
 * `containerEl`, laid out left-to-right, each in its own `size`x`size` box.
 * Characters with no matching KanjiVG SVG under `svgPath` (kana, punctuation,
 * spaces, ...) are silently skipped — no box is created for them.
 *
 * @param {string} text - one or more kanji (and, harmlessly, non-kanji chars)
 * @param {HTMLElement} containerEl - element to render the sequence into
 * @param {object} [overrides] - per-instance config overrides, plus `svgPath`
 *   (base URL/path of a KanjiVG SVG repository, e.g. "/kanjivg/" — required)
 */
export async function createKanjiAnimationFromText(text, containerEl, overrides = {}) {
  const config = resolveConfig(overrides);
  if (!config.svgPath) {
    throw new Error("dakaisb: createKanjiAnimationFromText requires a `svgPath` option pointing to a KanjiVG SVG repository");
  }
  const interval = config.interval || 0;
  // Unlike createKanjiAnimation (where an unset size just leaves sizing to
  // the caller's own CSS), a multi-kanji sequence needs a concrete box size
  // to lay characters out side by side — fall back to a sensible default
  // only for that layout, without changing the library-wide default.
  const boxSize = config.size != null ? config.size : 220;

  const chars = Array.from(text);
  const svgTexts = await Promise.all(
    chars.map((char) => fetchSvgForChar(char, config.svgPath).catch(() => null))
  );

  containerEl.innerHTML = "";
  containerEl.style.display = "flex";
  containerEl.style.flexWrap = "wrap";
  // gap (px) between adjacent kanji boxes. 0 (default) means boxes sit
  // flush against each other — with a border on, adjacent borders share the
  // same edge and read as a single line (like collapsed CSS borders), not a
  // double one, since buildBorder always draws the exact same stroke-width/
  // color/dash pattern for a given config. Always set (not just when
  // non-zero) since containerEl's inline style otherwise carries over a
  // stale gap from a previous call.
  containerEl.style.gap = (config.gap || 0) + "px";

  const instances = [];

  chars.forEach((char, i) => {
    const svgText = svgTexts[i];
    if (!svgText) return; // not a kanji we have an SVG for — skip, no box

    const box = document.createElement("div");
    box.setAttribute("class", "dakaisb-char");
    box.style.width = boxSize + "px";
    box.style.height = boxSize + "px";
    box.style.flex = "0 0 auto";
    containerEl.appendChild(box);

    instances.push(createKanjiAnimation(svgText, box, { ...overrides, size: boxSize }));
  });

  // Kanji are animated one at a time, not in parallel: instance N only
  // starts playing `interval` ms after instance N-1 has fully finished
  // drawing. The pending start is a cancellable setTimeout so pause/stop
  // mid-sequence don't let a later kanji jump in unannounced. `remaining`
  // tracks how much of the current instance's wait is still left when
  // paused, so resuming doesn't re-arm the timer for its full duration.
  let destroyed = false;
  let pendingTimeout = null;
  let nextIndex = 0;
  let remaining = 0; // ms left to wait (current instance's draw + interval) before starting nextIndex

  function clearPending() {
    if (pendingTimeout !== null) {
      clearTimeout(pendingTimeout);
      pendingTimeout = null;
    }
  }

  function scheduleNext(index, waitMs) {
    const startedAt = performance.now();
    remaining = waitMs;
    pendingTimeout = setTimeout(() => {
      pendingTimeout = null;
      nextIndex = index + 1;
      remaining = 0;
      playFrom(nextIndex);
    }, waitMs);
    return startedAt;
  }

  let currentStartedAt = 0;

  function playFrom(index) {
    if (index >= instances.length) return;
    nextIndex = index;
    instances[index].play();
    currentStartedAt = scheduleNext(index, instances[index].duration + interval);
  }

  return {
    instances,
    play() {
      if (destroyed) return;
      clearPending();
      if (nextIndex < instances.length && remaining > 0) {
        // Resuming mid-wait: only wait out what was left, not the full
        // duration, so the current instance's own play() (which resumes its
        // WAAPI animation from where it paused) and this timer land at the
        // same moment.
        instances[nextIndex].play();
        currentStartedAt = scheduleNext(nextIndex, remaining);
      } else {
        playFrom(nextIndex);
      }
    },
    pause() {
      if (destroyed) return;
      if (pendingTimeout !== null) {
        remaining = Math.max(0, remaining - (performance.now() - currentStartedAt));
      }
      clearPending();
      instances.forEach((a) => a.pause());
    },
    stop() {
      if (destroyed) return;
      clearPending();
      nextIndex = 0;
      remaining = 0;
      instances.forEach((a) => a.stop());
    },
    destroy() {
      if (destroyed) return;
      clearPending();
      instances.forEach((a) => a.destroy());
      containerEl.innerHTML = "";
      destroyed = true;
    },
  };
}

/**
 * Returns plain-English information about a `colorCriteria` mode, sourced
 * from criteriaInfo.json (kept as data, not inline strings, specifically so
 * it can be edited without touching code). By default returns just the
 * criterion's name and a one-paragraph summary; pass `details: true` for
 * structured metadata (data source, whether it needs the bundled KRAD
 * mapping, its fallback behavior, license attribution where relevant, and
 * an `academic` field aimed at educators/researchers evaluating the
 * criterion for teaching use — corpus-wide statistics, known limitations,
 * and how it relates to traditional radical systems, sourced from this
 * project's own corpus analysis rather than general claims).
 *
 * @param {object} [options]
 * @param {string} [options.criteria] - one of "MAIN"/"SUB1"/"SUB2"/"SUBMAX"/"KVG-KRAD"/"CHISE_MAIN"/"CHISE_SUBMAX" (default "MAIN")
 * @param {boolean} [options.details] - include the extra structured metadata block (default false)
 * @returns {{ criteria: string, summary: string, details?: object }}
 */
export function kanjiAnimationInfo({ criteria = "MAIN", details = false } = {}) {
  const info = criteriaInfo[criteria];
  if (!info) {
    throw new Error(
      `dakaisb: unknown colorCriteria "${criteria}" — expected one of: ${Object.keys(criteriaInfo).join(", ")}`
    );
  }
  const result = { criteria, summary: info.summary };
  if (details) {
    result.details = info.details;
  }
  return result;
}

export { SVG_NS };
