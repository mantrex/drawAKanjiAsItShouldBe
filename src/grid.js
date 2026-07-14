// grid.js
// Draws the traditional "田"-style guide grid (a cross splitting the
// kanji's canvas into 4 quadrants) and/or a border framing that same
// canvas. Both are pure SVG, inserted as the first children of the root
// <svg> so strokes/model paint over them, and both go through the exact
// same line-styling code — a border in the same color/style/width as the
// grid must look like the same pen, never thicker, thinner, or differently
// dashed.
import { SVG_NS } from "./parseKanjiVg.js";

// viewBox.baseVal is null when the source SVG has no viewBox attribute at
// all (e.g. only width/height) — fall back to those, or to a plain 0..100
// square as a last resort, instead of throwing.
function readBox(svgEl) {
  const viewBox = svgEl.viewBox.baseVal;
  return {
    x0: viewBox ? viewBox.x : 0,
    y0: viewBox ? viewBox.y : 0,
    w: viewBox ? viewBox.width : Number(svgEl.getAttribute("width")) || 100,
    h: viewBox ? viewBox.height : Number(svgEl.getAttribute("height")) || 100,
  };
}

// `width` (gridWidth/borderWidth) is either:
// - "pixel" (default): a constant on-screen thickness in CSS px, regardless
//   of how much the SVG is scaled up/down by `size` — achieved with
//   vector-effect="non-scaling-stroke", which tells the renderer to apply
//   the stroke-width in screen space instead of the (scaled) user space.
// - "unit": raw viewBox units, so the stroke visually scales together with
//   the kanji itself as `size` changes (the old behavior).
function applyLineStyle(el, { color, width, style, dimension, unit }) {
  el.setAttribute("stroke", color);
  el.setAttribute("stroke-width", String(width));

  if (dimension !== "unit") {
    el.setAttribute("vector-effect", "non-scaling-stroke");
  }

  // Dash/gap lengths are expressed in the same space as stroke-width (screen
  // px for "pixel", viewBox units for "unit"), scaled off `unit` only for
  // the "unit" dimension so dashes stay proportional to the canvas size.
  const dashUnit = dimension === "unit" ? unit * 0.03 : width * 3;

  if (style === "dashed") {
    el.setAttribute("stroke-dasharray", String(dashUnit));
  } else if (style === "dotted") {
    // Round caps + a dash shorter than the gap turns each dash into a dot.
    el.setAttribute("stroke-linecap", "round");
    el.setAttribute("stroke-dasharray", `${width * 0.01} ${dashUnit * 0.75}`);
  }
  // "solid" (default): no stroke-dasharray, plain unbroken line.
}

export function buildGrid(svgEl, { color, style = "dashed", width = 1, dimension = "pixel" }) {
  const { x0, y0, w, h } = readBox(svgEl);
  const unit = Math.max(w, h);
  const cx = x0 + w / 2;
  const cy = y0 + h / 2;

  const gridGroup = document.createElementNS(SVG_NS, "g");
  gridGroup.setAttribute("class", "dakaisb-grid");

  const hLine = document.createElementNS(SVG_NS, "line");
  hLine.setAttribute("x1", String(x0));
  hLine.setAttribute("y1", String(cy));
  hLine.setAttribute("x2", String(x0 + w));
  hLine.setAttribute("y2", String(cy));

  const vLine = document.createElementNS(SVG_NS, "line");
  vLine.setAttribute("x1", String(cx));
  vLine.setAttribute("y1", String(y0));
  vLine.setAttribute("x2", String(cx));
  vLine.setAttribute("y2", String(y0 + h));

  for (const line of [hLine, vLine]) {
    applyLineStyle(line, { color, width, style, dimension, unit });
    gridGroup.appendChild(line);
  }

  svgEl.insertBefore(gridGroup, svgEl.firstChild);

  return gridGroup;
}

// Draws a rectangle around the kanji's own canvas (its viewBox), as a
// stroked <rect> inset by half its stroke-width so the border sits flush
// with the visible edge instead of being clipped by the viewBox boundary.
// Takes the exact same { color, style, width, dimension } shape as
// buildGrid and runs through the same applyLineStyle, so passing it the
// grid's own color/style/width produces an indistinguishable line.
export function buildBorder(svgEl, { color, style = "solid", width = 1, dimension = "pixel" }) {
  const { x0, y0, w, h } = readBox(svgEl);
  const unit = Math.max(w, h);
  // The inset (half the visual stroke-width) only matters in viewBox-unit
  // space, since that's where x/y/width/height are expressed; a
  // non-scaling-stroke's screen-space width doesn't affect layout.
  const inset = dimension === "unit" ? width / 2 : 0;

  const rect = document.createElementNS(SVG_NS, "rect");
  rect.setAttribute("class", "dakaisb-border");
  rect.setAttribute("fill", "none");
  rect.setAttribute("x", String(x0 + inset));
  rect.setAttribute("y", String(y0 + inset));
  rect.setAttribute("width", String(w - inset * 2));
  rect.setAttribute("height", String(h - inset * 2));

  applyLineStyle(rect, { color, width, style, dimension, unit });

  svgEl.insertBefore(rect, svgEl.firstChild);

  return rect;
}
