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

  const { pathToColor } = assignBlockColors(rootCharGroupEl, config.colors, config.defaultColor, config.colorCriteria);

  if (!config.showStrokeNumbers) {
    strokeNumberEls.forEach((el) => el.remove());
  } else {
    strokeNumberEls.forEach((el) => {
      el.setAttribute("fill", config.strokeNumberColor);
    });
  }

  containerEl.innerHTML = "";
  containerEl.appendChild(svgEl);

  const animations = buildStrokeAnimations(strokePathEls, {
    speed: config.speed,
    strokeWidth: config.strokeWidth,
    pathToColor,
    defaultColor: config.defaultColor,
    strokeAnimationColor: config.strokeAnimationColor,
    strokeAnimationColorFade: config.strokeAnimationColorFade,
  });

  const numberAnimations = config.showStrokeNumbers
    ? buildStrokeNumberAnimations(strokeNumberEls, { speed: config.speed })
    : [];

  let destroyed = false;

  return {
    element: svgEl,
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
      containerEl.innerHTML = "";
      destroyed = true;
    },
  };
}

export { SVG_NS };