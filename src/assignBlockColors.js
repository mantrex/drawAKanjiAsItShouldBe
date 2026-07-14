// assignBlockColors.js
// Walks the KanjiVG root character group and assigns one color per "block",
// in document order. Which <g> elements count as a block depends on
// colorCriteria. In both modes, a direct <path> child with no wrapping
// block-level <g> is never dumped into a "default" gray — it happens
// constantly in real KanjiVG data, sometimes as a lone stray stroke but
// often as a whole unwrapped component (e.g. 言 itself in 08a00.svg has its
// top 4 strokes as direct <path>s, with only its 口 sub-part wrapped in a
// <g>; simple characters like 一/十/木 have ALL their strokes as direct
// <path>s under the root, with no <g> at all). Each maximal run of
// consecutive direct <path> children — at whatever level of the walk it's
// found — becomes its own block and gets the next color in the palette, in
// document order interleaved with the real <g> blocks.
//
// - "MAIN" (default): every DIRECT <g> child of the root character group is
//   a block (all descendant <path> elements inherit its color, regardless of
//   further nesting underneath).
//
// - "SUB1": descends the whole tree recursively from the root character
//   group. The first <g> found along a branch that carries kvg:radical or
//   kvg:element is a block; its descendants are not searched further (they
//   inherit its color). A <g> with neither attribute is a pure structural
//   wrapper (e.g. kvg:position/kvg:phon-only groups) and its children are
//   searched instead. This surfaces the radical plus each top-level
//   semantic component, skipping wrapper groups in between.
export function assignBlockColors(rootCharGroupEl, colors, colorCriteria = "MAIN") {
  if (colorCriteria === "SUB1") {
    return assignBlockColorsSub1(rootCharGroupEl, colors);
  }
  return assignBlockColorsMain(rootCharGroupEl, colors);
}

function assignBlockColorsMain(rootCharGroupEl, colors) {
  const pathToColor = new Map();
  const blocks = [];
  let blockIndex = 0;

  function nextColor() {
    const color = colors[blockIndex % colors.length];
    blockIndex += 1;
    return color;
  }

  let pendingPathRun = null; // { color, pathIds } for the run of direct <path>s currently being collected

  function flushPathRun() {
    if (pendingPathRun) {
      blocks.push({ index: blocks.length, color: pendingPathRun.color, pathIds: pendingPathRun.pathIds, element: null });
      pendingPathRun = null;
    }
  }

  for (const child of rootCharGroupEl.children) {
    const tag = child.tagName.toLowerCase();

    if (tag === "g") {
      flushPathRun();
      const color = nextColor();
      const pathIds = [];
      for (const path of child.querySelectorAll("path")) {
        pathToColor.set(path, color);
        pathIds.push(path.getAttribute("id"));
      }
      blocks.push({ index: blocks.length, color, pathIds, element: child.getAttribute("kvg:element") || null });
    } else if (tag === "path") {
      // Start (or continue) a run of consecutive direct <path> children —
      // they all share one block/color, whether the run is a single stray
      // stroke or a whole unwrapped component like 言's top part.
      if (!pendingPathRun) {
        pendingPathRun = { color: nextColor(), pathIds: [] };
      }
      pathToColor.set(child, pendingPathRun.color);
      pendingPathRun.pathIds.push(child.getAttribute("id"));
    }
    // Any other tag under the root group is not expected in real KanjiVG data
    // and is intentionally ignored rather than guessed at.
  }
  flushPathRun();

  return { pathToColor, blocks };
}

function assignBlockColorsSub1(rootCharGroupEl, colors) {
  const pathToColor = new Map();
  const blocks = [];
  let blockIndex = 0;

  function nextColor() {
    const color = colors[blockIndex % colors.length];
    blockIndex += 1;
    return color;
  }

  function isBlockGroup(el) {
    return el.hasAttribute("kvg:radical") || el.hasAttribute("kvg:element");
  }

  function assignBlock(groupEl) {
    const color = nextColor();
    const pathIds = [];
    for (const path of groupEl.querySelectorAll("path")) {
      pathToColor.set(path, color);
      pathIds.push(path.getAttribute("id"));
    }
    blocks.push({
      index: blocks.length,
      color,
      pathIds,
      element: groupEl.getAttribute("kvg:element") || null,
      radical: groupEl.getAttribute("kvg:radical") || null,
    });
  }

  // Like assignBlockColorsMain, a direct <path> child with no wrapping
  // block-level <g> gets its own palette color instead of a generic gray —
  // each maximal run of consecutive direct <path> children (at any level of
  // the walk, e.g. 言's own top 4 strokes, or all of a simple character's
  // strokes as direct children of the root itself) becomes its own block
  // with the next palette color. This is walked per `walk(el)` call so a run
  // is scoped to one <g>'s direct children, same as MAIN.
  function walk(el) {
    let pendingPathRun = null;

    function flushPathRun() {
      if (pendingPathRun) {
        blocks.push({
          index: blocks.length,
          color: pendingPathRun.color,
          pathIds: pendingPathRun.pathIds,
          element: null,
          radical: null,
        });
        pendingPathRun = null;
      }
    }

    for (const child of el.children) {
      const tag = child.tagName.toLowerCase();

      if (tag === "g") {
        flushPathRun();
        if (isBlockGroup(child)) {
          assignBlock(child);
        } else {
          walk(child);
        }
      } else if (tag === "path") {
        if (!pendingPathRun) {
          pendingPathRun = { color: nextColor(), pathIds: [] };
        }
        pathToColor.set(child, pendingPathRun.color);
        pendingPathRun.pathIds.push(child.getAttribute("id"));
      }
    }
    flushPathRun();
  }

  walk(rootCharGroupEl);

  return { pathToColor, blocks };
}
