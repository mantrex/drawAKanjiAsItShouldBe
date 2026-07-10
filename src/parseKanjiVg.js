// parseKanjiVg.js
// Parses a raw KanjiVG SVG string and locates its structural landmarks:
// the stroke-paths root group, the character's own root <g>, and the
// (optional) stroke-numbers group. KanjiVG always nests exactly
// <g id="kvg:StrokePaths_XXXXX"> > <g id="kvg:XXXXX" kvg:element="...">
// as the two outermost levels — every real block lives as a descendant
// of that second <g>.
const SVG_NS = "http://www.w3.org/2000/svg";

export function parseKanjiVg(svgText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, "image/svg+xml");

  const parserError = doc.querySelector("parsererror");
  if (parserError) {
    throw new Error("dakaisb: failed to parse SVG — " + parserError.textContent);
  }

  const svgEl = doc.querySelector("svg");
  if (!svgEl) {
    throw new Error("dakaisb: no <svg> root element found");
  }

  const strokePathsGroup = doc.querySelector('g[id^="kvg:StrokePaths_"]');
  if (!strokePathsGroup) {
    throw new Error("dakaisb: no kvg:StrokePaths_ group found — is this a KanjiVG SVG?");
  }

  // The character's own root group is StrokePaths_'s single <g> child
  // (id="kvg:<code>", kvg:element="<char>").
  const rootCharGroupEl = Array.from(strokePathsGroup.children).find(
    (el) => el.tagName.toLowerCase() === "g"
  );
  if (!rootCharGroupEl) {
    throw new Error("dakaisb: kvg:StrokePaths_ group has no root character <g>");
  }

  const strokeNumbersGroup = doc.querySelector('g[id^="kvg:StrokeNumbers_"]') || null;

  // Strokes in document order == KanjiVG stroke order.
  const strokePathEls = Array.from(rootCharGroupEl.querySelectorAll("path"));
  const strokeNumberEls = strokeNumbersGroup
    ? Array.from(strokeNumbersGroup.querySelectorAll("text"))
    : [];

  return { doc, svgEl, strokePathsGroup, rootCharGroupEl, strokeNumbersGroup, strokePathEls, strokeNumberEls };
}

export { SVG_NS };