// assignBlockColors.js
// Walks the KanjiVG root character group and assigns one color per "block",
// in document order. Which <g> elements count as a block depends on
// colorCriteria:
//
// - "MAIN" (default): every DIRECT <g> child of the root character group is
//   a block (all descendant <path> elements inherit its color, regardless of
//   further nesting underneath). A direct <path> child with no wrapping
//   block-level <g> (a real, confirmed edge case in the KanjiVG corpus) gets
//   a dedicated "default" color instead of silently reusing block 1's color.
//
// - "SUB1": descends the whole tree recursively from the root character
//   group. The first <g> found along a branch that carries kvg:radical or
//   kvg:element is a block; its descendants are not searched further (they
//   inherit its color). A <g> with neither attribute is a pure structural
//   wrapper (e.g. kvg:position/kvg:phon-only groups) and its children are
//   searched instead. This surfaces the radical plus each top-level
//   semantic component, skipping wrapper groups in between.
export function assignBlockColors(rootCharGroupEl, colors, defaultColor, colorCriteria = "MAIN") {
  if (colorCriteria === "SUB1") {
    return assignBlockColorsSub1(rootCharGroupEl, colors, defaultColor);
  }
  return assignBlockColorsMain(rootCharGroupEl, colors, defaultColor);
}

function assignBlockColorsMain(rootCharGroupEl, colors, defaultColor) {
  const pathToColor = new Map();
  const blocks = [];
  let blockIndex = 0;

  for (const child of rootCharGroupEl.children) {
    const tag = child.tagName.toLowerCase();

    if (tag === "g") {
      const color = colors[blockIndex % colors.length];
      const pathIds = [];
      for (const path of child.querySelectorAll("path")) {
        pathToColor.set(path, color);
        pathIds.push(path.getAttribute("id"));
      }
      blocks.push({ index: blockIndex, color, pathIds, element: child.getAttribute("kvg:element") || null });
      blockIndex += 1;
    } else if (tag === "path") {
      pathToColor.set(child, defaultColor);
    }
    // Any other tag under the root group is not expected in real KanjiVG data
    // and is intentionally ignored rather than guessed at.
  }

  return { pathToColor, blocks };
}

function assignBlockColorsSub1(rootCharGroupEl, colors, defaultColor) {
  const pathToColor = new Map();
  const blocks = [];
  let blockIndex = 0;

  function isBlockGroup(el) {
    return el.hasAttribute("kvg:radical") || el.hasAttribute("kvg:element");
  }

  function assignBlock(groupEl) {
    const color = colors[blockIndex % colors.length];
    const pathIds = [];
    for (const path of groupEl.querySelectorAll("path")) {
      pathToColor.set(path, color);
      pathIds.push(path.getAttribute("id"));
    }
    blocks.push({
      index: blockIndex,
      color,
      pathIds,
      element: groupEl.getAttribute("kvg:element") || null,
      radical: groupEl.getAttribute("kvg:radical") || null,
    });
    blockIndex += 1;
  }

  function walk(el) {
    for (const child of el.children) {
      const tag = child.tagName.toLowerCase();

      if (tag === "g") {
        if (isBlockGroup(child)) {
          assignBlock(child);
        } else {
          walk(child);
        }
      } else if (tag === "path") {
        pathToColor.set(child, defaultColor);
      }
    }
  }

  walk(rootCharGroupEl);

  return { pathToColor, blocks };
}
