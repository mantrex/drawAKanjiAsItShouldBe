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
//
// - "SUB2": like SUB1, but allows one extra level of labeled descent past
//   the first labeled <g> found along a branch. After that first hit,
//   instead of stopping immediately, its descendants are searched (through
//   any purely structural wrappers) for a further labeled <g>. If one or
//   more are found, those become the blocks instead of the first hit; if
//   none are found, the first hit itself is the block (same as SUB1). This
//   surfaces one layer of semantic detail below SUB1's first hit, without
//   descending all the way to maximal depth.
//
// - "SUBMAX": descends as deep as possible along every branch. At a labeled
//   <g> (kvg:element or kvg:radical present), keep descending through it —
//   not just one level, unboundedly — as long as it has any further labeled
//   <g> descendant at any depth beneath it; a branch only stops, and becomes
//   a block, at a labeled <g> with no further labeled descendants left (a
//   true semantic leaf). Unlike SUB1/SUB2's fixed stopping depth, SUBMAX has
//   no depth cap at all — it surfaces every named sub-component KanjiVG's
//   own tree encodes, all the way down to the finest-grained named parts.
//   Unlike MAIN/SUB1/SUB2, a run of direct <path> children found under a
//   labeled <g> that SUBMAX descends through (rather than stopping at) does
//   NOT get a fresh color of its own: visually those strokes belong to a
//   neighboring named sub-component's block instead — the nearest one
//   already found earlier in that group's own document order if there is
//   one, otherwise the next one found afterward (possibly nested several
//   levels deeper, e.g. 儿's own trailing stray stroke in 探 merges into 丿,
//   the sub-component found just before it, while 首's 3 lead-in strokes in
//   導 merge into 目, the sub-component found after them via 自). Without
//   this, such runs — usually just one or two strokes, sitting alongside or
//   between real sub-components rather than being one themselves — would
//   each claim a fresh palette color, needlessly inflating the block count
//   and, past a handful of blocks, making adjacent palette colors hard to
//   tell apart.
export function assignBlockColors(rootCharGroupEl, colors, colorCriteria = "MAIN") {
  if (colorCriteria === "SUB1") {
    return assignBlockColorsSub1(rootCharGroupEl, colors);
  }
  if (colorCriteria === "SUB2") {
    return assignBlockColorsSub2(rootCharGroupEl, colors);
  }
  if (colorCriteria === "SUBMAX") {
    return assignBlockColorsSubMax(rootCharGroupEl, colors);
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

function assignBlockColorsSub2(rootCharGroupEl, colors) {
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

  // Finds the labeled <g> children of `groupEl` one level down, passing
  // transparently through purely structural wrappers (same rule used to
  // find the first hit in the first place). Does not recurse past that
  // level — a labeled descendant's own labeled descendants are left alone.
  function findNextLabeled(el, out) {
    for (const child of el.children) {
      if (child.tagName.toLowerCase() !== "g") continue;
      if (isBlockGroup(child)) {
        out.push(child);
      } else {
        findNextLabeled(child, out);
      }
    }
  }

  function assignBlockOneLevelDeeper(firstHitEl) {
    const nextLevel = [];
    findNextLabeled(firstHitEl, nextLevel);
    if (nextLevel.length === 0) {
      assignBlock(firstHitEl);
    } else {
      for (const groupEl of nextLevel) {
        assignBlock(groupEl);
      }
    }
  }

  // Same direct-<path>-run handling as SUB1/MAIN.
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
          assignBlockOneLevelDeeper(child);
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

function assignBlockColorsSubMax(rootCharGroupEl, colors) {
  const pathToColor = new Map();
  const blocks = [];
  const blockByColor = new Map(); // color -> block record, for merge-backward
  let blockIndex = 0;

  function nextColor() {
    const color = colors[blockIndex % colors.length];
    blockIndex += 1;
    return color;
  }

  function isBlockGroup(el) {
    return el.hasAttribute("kvg:radical") || el.hasAttribute("kvg:element");
  }

  function hasLabeledDescendant(el) {
    for (const child of el.children) {
      if (child.tagName.toLowerCase() !== "g") continue;
      if (isBlockGroup(child)) return true;
      if (hasLabeledDescendant(child)) return true;
    }
    return false;
  }

  function newBlock(color, pathEls, element, radical) {
    const pathIds = [];
    for (const p of pathEls) {
      pathToColor.set(p, color);
      pathIds.push(p.getAttribute("id"));
    }
    const block = { index: blocks.length, color, pathIds, element, radical };
    blocks.push(block);
    blockByColor.set(color, block);
    return block;
  }

  function mergeInto(color, pathEls) {
    const block = blockByColor.get(color);
    for (const p of pathEls) {
      pathToColor.set(p, color);
      block.pathIds.push(p.getAttribute("id"));
    }
  }

  // Walks `el`'s children in document order, emitting one block per labeled
  // leaf (a labeled <g> with no further labeled descendants) or, outside
  // swallowed territory, per bare-<path> run.
  //
  // `inSwallowed`: true whenever `el` is inside a labeled <g> that SUBMAX
  // descended through rather than stopped at (as opposed to a purely
  // structural kvg:position/kvg:phon-only wrapper, which passes its
  // caller's inSwallowed through unchanged, carrying no semantic weight of
  // its own either way). Inside swallowed territory, a bare <path> run
  // never gets a palette color of its own: it merges into the nearest
  // labeled-leaf block — the most recent one emitted anywhere earlier in
  // this subtree's document order if one exists yet, otherwise the first
  // one found later (possibly several levels of nesting away, or even
  // outside this subtree entirely, resolved by the caller once it finds
  // one — see `pending` below).
  //
  // Returns { pending, lastColor }:
  //   - pending: <path>[] collected in this subtree with no block resolved
  //     for them yet (empty once `lastColor` becomes non-null, since any
  //     further run after that point resolves immediately).
  //   - lastColor: color of the most recent block emitted anywhere in this
  //     subtree's document order so far (null if none yet) — lets the
  //     caller merge a later sibling run backward into it, and lets a
  //     caller-of-the-caller keep propagating it further up/along.
  function walk(el, inSwallowed) {
    let lastColor = null;
    let pending = [];
    let currentRun = null;

    function flushCurrentRun() {
      if (!currentRun) return;
      const run = currentRun;
      currentRun = null;
      if (!inSwallowed) {
        const color = nextColor();
        newBlock(color, run, null, null);
        lastColor = color;
        return;
      }
      if (lastColor !== null) {
        mergeInto(lastColor, run);
      } else {
        pending.push(...run);
      }
    }

    for (const child of el.children) {
      const tag = child.tagName.toLowerCase();

      if (tag === "g") {
        flushCurrentRun();
        if (isBlockGroup(child)) {
          if (hasLabeledDescendant(child)) {
            const result = walk(child, true);
            if (result.lastColor !== null) {
              // child's subtree resolved at least one block; any of ITS OWN
              // still-pending paths already got merged into that block by
              // its own walk() before it could return them here — result.
              // pending will be empty in that case. But if child's subtree
              // resolved a block only partway through (pending was merged
              // once lastColor became available inside), pending is empty
              // by construction. Only forward what's left.
              if (result.pending.length) mergeInto(result.lastColor, result.pending);
              lastColor = result.lastColor;
            } else if (result.pending.length) {
              pending.push(...result.pending);
            }
          } else {
            const color = nextColor();
            newBlock(
              color,
              [...child.querySelectorAll("path")],
              child.getAttribute("kvg:element") || null,
              child.getAttribute("kvg:radical") || null
            );
            if (pending.length) {
              mergeInto(color, pending);
              pending = [];
            }
            lastColor = color;
          }
        } else {
          const result = walk(child, inSwallowed);
          if (result.lastColor !== null) {
            if (result.pending.length) mergeInto(result.lastColor, result.pending);
            lastColor = result.lastColor;
          } else if (result.pending.length) {
            pending.push(...result.pending);
          }
        }
      } else if (tag === "path") {
        if (!currentRun) currentRun = [];
        currentRun.push(child);
      }
    }
    flushCurrentRun();

    return { pending: inSwallowed ? pending : [], lastColor };
  }

  const rootResult = walk(rootCharGroupEl, false);
  // Defensive only: walk() with inSwallowed=false never actually leaves a
  // non-empty `pending` (a bare <path> run outside swallowed territory
  // always resolves to its own block immediately in flushCurrentRun).
  if (rootResult.pending.length) {
    const color = nextColor();
    newBlock(color, rootResult.pending, null, null);
  }

  // A merged block's pathIds were appended in merge-resolution order, not
  // document order (e.g. a swallowed group's leading strokes are appended
  // to a sub-block found deeper inside it, after that sub-block's own
  // paths). Re-sort each block's pathIds into true document order — cosmetic
  // only (pathToColor, the map animation code actually keys off, is already
  // correct at every step above), but keeps a block's own metadata legible.
  const documentOrder = new Map();
  [...rootCharGroupEl.querySelectorAll("path")].forEach((p, i) => documentOrder.set(p.getAttribute("id"), i));
  for (const block of blocks) {
    block.pathIds.sort((a, b) => documentOrder.get(a) - documentOrder.get(b));
  }

  return { pathToColor, blocks };
}
