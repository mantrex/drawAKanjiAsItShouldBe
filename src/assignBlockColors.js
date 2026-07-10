// assignBlockColors.js
// Walks the DIRECT children of the KanjiVG root character group and assigns
// one color per block, in document order. Every direct <g> child is a block
// (all descendant <path> elements inherit its color, regardless of further
// nesting underneath). A direct <path> child with no wrapping block-level <g>
// (a real, confirmed edge case in the KanjiVG corpus) gets a dedicated
// "default" color instead of silently reusing block 1's color.
export function assignBlockColors(rootCharGroupEl, colors, defaultColor) {
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