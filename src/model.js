// model.js
// Renders a static, fully-drawn "model" copy of the kanji behind the
// animated strokes — a faint reference trace the animation draws over.
// Built from a second parse of the same SVG source so it's fully independent
// of the animated stroke elements (own <path>/<text> nodes, own styling).
import { SVG_NS, parseKanjiVg } from "./parseKanjiVg.js";

export function buildModel(svgText, svgEl, { modelColor, strokeWidth, showStrokeNumbers }) {
  const { rootCharGroupEl, strokeNumbersGroup, strokePathEls, strokeNumberEls } = parseKanjiVg(svgText);

  const modelGroup = document.createElementNS(SVG_NS, "g");
  modelGroup.setAttribute("class", "dakaisb-model");
  // rootCharGroupEl belongs to this freshly parsed, detached doc, so it can
  // be adopted directly — no need to clone.
  modelGroup.appendChild(rootCharGroupEl);

  for (const path of strokePathEls) {
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", modelColor);
    path.setAttribute("stroke-width", String(strokeWidth));
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    path.removeAttribute("style");
  }

  // strokeNumbersGroup is a sibling of rootCharGroupEl in the parsed doc, not
  // one of its descendants — it has to be adopted separately, or its <text>
  // labels stay behind in the discarded doc and never reach the real DOM.
  if (showStrokeNumbers && strokeNumbersGroup) {
    strokeNumberEls.forEach((el) => {
      el.setAttribute("fill", modelColor);
      el.style.opacity = "1";
    });
    modelGroup.appendChild(strokeNumbersGroup);
  }

  svgEl.insertBefore(modelGroup, svgEl.firstChild);

  return modelGroup;
}
