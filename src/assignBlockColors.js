// assignBlockColors.js
//
// KRADFILE component data (kradData.json) used by "KRAD" below is derived
// from KRADFILE, Copyright 2001/2007 Michael Raine, James Breen and the
// Electronic Dictionary Research & Development Group (EDRDG), licensed
// under CC BY-SA 4.0 (https://www.edrdg.org/edrdg/licence.html). See
// https://www.edrdg.org/wiki/index.php/KANJIDIC_Project.
import kradData from "./kradData.json" with { type: "json" };
//
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
//
// - "KRAD": uses KRADFILE (an independent, EDRDG-maintained kanji-component
//   dataset — see the file header above) as an external source of which
//   named sub-components are teaching-relevant for a given kanji, instead
//   of relying on KanjiVG's own tagging depth the way SUB1/SUB2/SUBMAX do.
//   For a kanji present in kradData.json, every labeled <g> whose
//   kvg:element (or kvg:original) is in that kanji's KRAD component set
//   becomes its own block, using only that group's OWN direct <path>
//   children — unlike SUB1/SUB2/SUBMAX, a KRAD target does NOT stop the
//   walk: a target nested inside another target (e.g. 土 inside 至, both in
//   屋's KRAD component set) still becomes its own separate block, since
//   KRADFILE's flat component list treats them as peer components, not one
//   containing the other. A labeled <g> NOT in the target set is
//   transparent (descend looking for a target further down), same as
//   SUB1/SUB2/SUBMAX treat a non-labeled wrapper. Any stroke not claimed by
//   a target this way — a run of direct <path>s under a non-target group,
//   or a target whose own direct strokes are empty because all its content
//   is delegated to nested targets (e.g. 髟 in 鬘, entirely covered by its
//   nested 長) — bubbles up to the nearest enclosing target's block rather
//   than ever being left uncolored or forming a spurious empty block. A
//   kanji absent from kradData.json — or every one of whose KRAD components
//   turned out, per the mapping this data was built from, to have no
//   KanjiVG counterpart in the general case — falls back to SUBMAX for that
//   kanji.
//
// - "CHISE_MAIN": like KRAD, uses an external kanji-component source instead
//   of KanjiVG's own tagging depth — here, CHISE (Character Information
//   Service Environment, chise.org), via its IDS (Ideographic Description
//   Sequence) data. UNLIKE KRAD, this data is NEVER bundled with DAKAISB:
//   CHISE/IDS is GPLv2-licensed (via the cjkvi/cjkvi-ids mirror this
//   project's tools/fetch-chise.mjs downloads from), and DAKAISB's own
//   PolyForm Noncommercial license can't safely absorb GPLv2 data into the
//   same distributed package. So there is no chiseData.json import here —
//   the caller must generate chisedata/chise.json locally (see
//   README.md's colorCriteria: "CHISE_MAIN" section — run `npm run
//   fetch-chise`, which chains tools/fetch-chise.mjs,
//   tools/prepare-chise-phase3.mjs, and tools/build-chise-data.mjs) and
//   pass the loaded JSON in explicitly as the `chiseData` argument below.
//   Algorithmically CHISE_MAIN mirrors KRAD's own target-set walk exactly
//   (same nested-target-is-a-peer-not-a-child rule, same loose-path
//   bubbling) — only the data source, how it's supplied, and what happens
//   when it's missing differ. "_MAIN" names this variant's own component
//   granularity, not KanjiVG's MAIN criterion: it's CHISE stopped at the
//   first KanjiVG-recognized component per IDS branch (SUB1-style), as
//   opposed to "CHISE_SUBMAX" below, which expands each branch all the way
//   to CHISE/IDS's own true leaves regardless of what KanjiVG already
//   tags at some intermediate depth — see tools/fetch-chise.mjs's own
//   comments for why CHISE_MAIN stops early (matching KRAD's granularity)
//   and tools/fetch-chise-submax.mjs for why CHISE_SUBMAX deliberately
//   does not. UNLIKE KRAD, neither CHISE variant falls back to SUBMAX for
//   missing coverage — since chiseData is opt-in and easy to simply not
//   pass, a silent SUBMAX substitution would be too easy to mistake for
//   genuine CHISE output. Instead, both throw if their data option is not
//   supplied at all, or if the specific kanji has no entry in it — callers
//   who want a fallback must catch this and choose one explicitly.
//
// - "CHISE_SUBMAX": same data source and licensing/never-bundled situation
//   as CHISE_MAIN (see above), same runtime walk algorithm, but built from
//   a deeper, independently-expanded component set: each IDS branch is
//   followed all the way to CHISE/IDS's own true leaves (self-decomposition
//   or no further entry), WITHOUT stopping early just because some
//   intermediate component already happens to be a recognized KanjiVG
//   kvg:element. This means CHISE_SUBMAX's decomposition depth is decided
//   entirely by CHISE/IDS as a source in its own right, then matched onto
//   KanjiVG afterwards purely to find which group to color — never the
//   other way around (KanjiVG's own tagging depth never gates how far
//   CHISE_SUBMAX's expansion goes, unlike CHISE_MAIN, unlike SUBMAX, and
//   unlike the first implementation attempt at CHISE_MAIN itself, which
//   this project already tried and reverted for being KanjiVG-gated in a
//   way that turned out to defeat the point of using a second, independent
//   source at all). Requires its own separately-generated chiseData
//   (`chisedata/chise-submax.json`, via `npm run fetch-chise-submax` and
//   the same Phase 3/4 follow-up scripts) — CHISE_MAIN's chiseData is not
//   interchangeable with it, since the two encode different component
//   granularities for the same kanji.
export function assignBlockColors(rootCharGroupEl, colors, colorCriteria = "MAIN", chiseData) {
  if (colorCriteria === "SUB1") {
    return assignBlockColorsSub1(rootCharGroupEl, colors);
  }
  if (colorCriteria === "SUB2") {
    return assignBlockColorsSub2(rootCharGroupEl, colors);
  }
  if (colorCriteria === "SUBMAX") {
    return assignBlockColorsSubMax(rootCharGroupEl, colors);
  }
  if (colorCriteria === "KRAD") {
    return assignBlockColorsKrad(rootCharGroupEl, colors);
  }
  if (colorCriteria === "CHISE_MAIN") {
    return assignBlockColorsChiseMain(rootCharGroupEl, colors, chiseData);
  }
  if (colorCriteria === "CHISE_SUBMAX") {
    return assignBlockColorsChiseSubmax(rootCharGroupEl, colors, chiseData);
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

  function assignBlock(groupEl, extraPathEls) {
    const color = nextColor();
    const pathIds = [];
    // extraPathEls: direct <path> children of a swallowed ancestor that
    // aren't inside groupEl itself (see assignBlockOneLevelDeeper) — merged
    // into this block rather than left uncolored. Added first so a leading
    // run's paths lead the block's own pathIds, same convention as SUBMAX.
    if (extraPathEls) {
      for (const path of extraPathEls) {
        pathToColor.set(path, color);
        pathIds.push(path.getAttribute("id"));
      }
    }
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
  // Also collects any direct <path> children encountered along the way
  // (of `groupEl` itself or of a purely structural wrapper between it and a
  // found <g>) — these belong to no single sub-component, so they're
  // returned separately to be merged into whichever block gets assigned
  // first, rather than silently left uncolored.
  function findNextLabeled(el, out, strayPaths) {
    for (const child of el.children) {
      const tag = child.tagName.toLowerCase();
      if (tag === "g") {
        if (isBlockGroup(child)) {
          out.push(child);
        } else {
          findNextLabeled(child, out, strayPaths);
        }
      } else if (tag === "path") {
        strayPaths.push(child);
      }
    }
  }

  function assignBlockOneLevelDeeper(firstHitEl) {
    const nextLevel = [];
    const strayPaths = [];
    findNextLabeled(firstHitEl, nextLevel, strayPaths);
    if (nextLevel.length === 0) {
      assignBlock(firstHitEl);
    } else {
      nextLevel.forEach((groupEl, i) => {
        // Stray paths (firstHitEl's own direct strokes, found before/between
        // its labeled sub-components) all merge into the FIRST sub-block —
        // there's no way to tell, structurally, which specific sub-component
        // they precede/belong to, so they consistently join the earliest one.
        assignBlock(groupEl, i === 0 ? strayPaths : null);
      });
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


function assignBlockColorsKrad(rootCharGroupEl, colors) {
  const rootElement = rootCharGroupEl.getAttribute("kvg:element");
  const kradTargets = rootElement ? kradData.kanji[rootElement] : undefined;

  if (!kradTargets || kradTargets.length === 0) {
    return assignBlockColorsSubMax(rootCharGroupEl, colors);
  }
  const targetSet = new Set(kradTargets);

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

  // Matches on kvg:element directly, or on kvg:original when present — the
  // mapping this data was built from (match-krad-kanjivg.mjs) resolves a
  // KRAD component to whichever of a variant pair's two names actually
  // appears as the "canonical" one (e.g. 辶, not the ⻌ variant KanjiVG
  // sometimes tags a group with instead, kvg:original="辶") — so a group
  // must be checked against both its own name and its declared original to
  // find the match kradData.json actually recorded.
  function isTarget(el) {
    const name = el.getAttribute("kvg:element");
    const original = el.getAttribute("kvg:original");
    return Boolean((name && targetSet.has(name)) || (original && targetSet.has(original)));
  }

  function newBlock(pathEls, element, radical) {
    const color = nextColor();
    const pathIds = pathEls.map((p) => p.getAttribute("id"));
    // pathEls (the actual DOM elements, not just their id strings) is kept
    // on the block record too — needed below to rebuild pathToColor after
    // blocks are re-sorted into document order and re-colored to match.
    blocks.push({ index: blocks.length, color, pathIds, pathEls, element, radical });
    return color;
  }

  // Recursively walks `el`'s children in document order, creating one block
  // per KRAD target <g> found (using only that target's OWN direct <path>
  // children — a target nested inside another target, e.g. 土 inside 至 in
  // 屋, is a separate block, since KRADFILE lists them as peer components,
  // not one containing the other). Any <path> not claimed by a target
  // becomes part of "loose" output for the CALLER to place — the caller is
  // exactly the right place to decide where loose strokes belong, since it
  // knows whether IT is a target (loose strokes join its own block) or not
  // (loose strokes keep bubbling up further).
  //
  // Returns an array of loose <path> elements found in `el`'s subtree that
  // no target block has claimed — empty once everything found has a home.
  function walk(el, skipDirectPaths) {
    let loose = [];

    for (const child of el.children) {
      const tag = child.tagName.toLowerCase();

      if (tag === "path") {
        if (!skipDirectPaths) loose.push(child);
        continue;
      }
      if (tag !== "g") continue;

      if (isBlockGroup(child) && isTarget(child)) {
        // child is a target: its own direct <path>s form its block's base.
        const ownPathEls = [...child.children].filter((c) => c.tagName.toLowerCase() === "path");
        // Any loose strokes accumulated so far AT THIS LEVEL (siblings
        // before this target, not yet claimed by an earlier target sibling)
        // join this target's block too — same "leading run merges into the
        // next block found" rule as SUBMAX, but scoped to this level only.
        const claimed = [...loose, ...ownPathEls];
        loose = [];
        // Recurse into the target's own children for further nested
        // targets BEFORE deciding whether this target itself gets a block
        // — a target with no direct <path>s of its own (e.g. 髟 in 鬘,
        // whose only content is a further nested target 長) must not
        // produce an empty block; its "own" content might be entirely
        // delegated to nested targets, discovered only by walking further.
        const innerLoose = walk(child, true);
        const finalPathEls = [...claimed, ...innerLoose];
        if (finalPathEls.length === 0) continue; // nothing to color for this target at all
        // Label the block with whichever of kvg:element/kvg:original is the
        // actual KRAD target name (see isTarget's own comment) — usually
        // kvg:element, but kvg:original when this group is a KanjiVG
        // variant-tagged form of the name kradData.json recorded.
        const rawName = child.getAttribute("kvg:element");
        const original = child.getAttribute("kvg:original");
        const label = rawName && targetSet.has(rawName) ? rawName : original;
        newBlock(finalPathEls, label || null, child.getAttribute("kvg:radical") || null);
      } else if (isBlockGroup(child)) {
        // Labeled but not a target: transparent — descend for nested
        // targets, but child's OWN direct <path>s (skipDirectPaths=true)
        // must not enter that recursive call's loose accumulator, or a
        // target found deeper in the same call wrongly absorbs them via the
        // `claimed = [...loose, ...ownPathEls]` line above. E.g. 窺's 夫 (not
        // a KRAD target) directly owns one stroke AND wraps a nested target
        // 大 (which is one) — that stroke belongs to 夫, not to 大, so a
        // nested target must only ever claim ITS OWN direct paths and
        // further-nested targets, never strokes belonging to this
        // (non-target) wrapper itself. child's own direct paths are instead
        // collected separately here and appended to `loose` for THIS level
        // afterwards, same as if child had never been entered.
        const ownDirectPathEls = [...child.children].filter((c) => c.tagName.toLowerCase() === "path");
        loose.push(...walk(child, true), ...ownDirectPathEls);
      } else {
        // Purely structural wrapper: same, transparent.
        loose.push(...walk(child));
      }
    }

    return loose;
  }

  const rootLoose = walk(rootCharGroupEl);
  if (rootLoose.length) {
    newBlock(rootLoose, null, null);
  }

  // Blocks were created in the order targets were RESOLVED (a nested target
  // like 長 inside 髟 is created before its own containing target's block,
  // since walk() recurses into a target's children before that target's
  // block is finalized) — not necessarily document order. Re-sort both each
  // block's own pathIds AND the blocks array itself into true document
  // order (by each block's first stroke), then reassign index accordingly,
  // so callers see the same "blocks in reading order" convention every
  // other colorCriteria already provides.
  const documentOrder = new Map();
  [...rootCharGroupEl.querySelectorAll("path")].forEach((p, i) => documentOrder.set(p.getAttribute("id"), i));
  for (const block of blocks) {
    block.pathIds.sort((a, b) => documentOrder.get(a) - documentOrder.get(b));
  }
  blocks.sort((a, b) => documentOrder.get(a.pathIds[0]) - documentOrder.get(b.pathIds[0]));
  // Reassign both index AND color in this final document order — every
  // other colorCriteria assigns colors while walking in document order by
  // construction, so KRAD's blocks (created in target-RESOLUTION order,
  // which can differ — a nested target like 長 inside 髟 is resolved before
  // its containing target's own block) need this explicit re-pass to match
  // that same "colors progress in reading order" convention. pathToColor
  // (keyed by DOM element, not id string) is rebuilt from each block's own
  // pathEls to stay consistent with the newly (re)assigned color.
  pathToColor.clear();
  blocks.forEach((block, i) => {
    block.index = i;
    block.color = colors[i % colors.length];
    for (const p of block.pathEls) pathToColor.set(p, block.color);
    delete block.pathEls; // internal bookkeeping only, not part of the public block shape
  });

  return { pathToColor, blocks };
}

function assignBlockColorsChiseMain(rootCharGroupEl, colors, chiseData) {
  return assignBlockColorsChiseFromTargetSet(rootCharGroupEl, colors, chiseData, "CHISE_MAIN");
}

function assignBlockColorsChiseSubmax(rootCharGroupEl, colors, chiseData) {
  return assignBlockColorsChiseFromTargetSet(rootCharGroupEl, colors, chiseData, "CHISE_SUBMAX");
}

// Shared walk for both CHISE variants — they differ only in which chiseData
// they're handed (CHISE_MAIN: components stopped at the first
// KanjiVG-recognized name per IDS branch; CHISE_SUBMAX: components expanded
// to CHISE/IDS's own true leaves, independent of KanjiVG's tagging depth —
// see the "CHISE_MAIN"/"CHISE_SUBMAX" comments above assignBlockColors) and
// in this criterionName used for their error messages.
function assignBlockColorsChiseFromTargetSet(rootCharGroupEl, colors, chiseData, criterionName) {
  const rootElement = rootCharGroupEl.getAttribute("kvg:element");

  if (!chiseData) {
    throw new Error(
      `dakaisb: colorCriteria "${criterionName}" requires the chiseData option (see README.md's colorCriteria: "${criterionName}" section for how to generate and pass it in) — unlike "KRAD", it never falls back to "SUBMAX" silently, since chiseData is expected to be either fully present or intentionally not used at all.`
    );
  }
  const chiseTargets = rootElement ? chiseData.kanji?.[rootElement] : undefined;
  if (!chiseTargets || chiseTargets.length === 0) {
    throw new Error(
      `dakaisb: colorCriteria "${criterionName}" has no mapping for "${rootElement ?? "(unknown root element)"}" in the supplied chiseData — this kanji is outside its coverage. Catch this and fall back to another colorCriteria (e.g. "SUBMAX") explicitly if you want that behavior; DAKAISB does not do it silently.`
    );
  }
  const targetSet = new Set(chiseTargets);

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

  // Same variant-aware matching as assignBlockColorsKrad's isTarget — see
  // its own comment for why both kvg:element and kvg:original are checked.
  function isTarget(el) {
    const name = el.getAttribute("kvg:element");
    const original = el.getAttribute("kvg:original");
    return Boolean((name && targetSet.has(name)) || (original && targetSet.has(original)));
  }

  function newBlock(pathEls, element, radical) {
    const color = nextColor();
    const pathIds = pathEls.map((p) => p.getAttribute("id"));
    blocks.push({ index: blocks.length, color, pathIds, pathEls, element, radical });
    return color;
  }

  // Identical walk/merge strategy to assignBlockColorsKrad (see its own
  // extensive comment for the full rationale) — a target nested inside
  // another target is still its own separate block, loose strokes bubble
  // up to the nearest enclosing target, everything ends up colored.
  function walk(el, skipDirectPaths) {
    let loose = [];

    for (const child of el.children) {
      const tag = child.tagName.toLowerCase();

      if (tag === "path") {
        if (!skipDirectPaths) loose.push(child);
        continue;
      }
      if (tag !== "g") continue;

      if (isBlockGroup(child) && isTarget(child)) {
        const ownPathEls = [...child.children].filter((c) => c.tagName.toLowerCase() === "path");
        const claimed = [...loose, ...ownPathEls];
        loose = [];
        const innerLoose = walk(child, true);
        const finalPathEls = [...claimed, ...innerLoose];
        if (finalPathEls.length === 0) continue;
        const rawName = child.getAttribute("kvg:element");
        const original = child.getAttribute("kvg:original");
        const label = rawName && targetSet.has(rawName) ? rawName : original;
        newBlock(finalPathEls, label || null, child.getAttribute("kvg:radical") || null);
      } else if (isBlockGroup(child)) {
        loose.push(...walk(child));
      } else {
        loose.push(...walk(child));
      }
    }

    return loose;
  }

  const rootLoose = walk(rootCharGroupEl);
  if (rootLoose.length) {
    newBlock(rootLoose, null, null);
  }

  // Same document-order re-pass as assignBlockColorsKrad — see its comment
  // for why blocks need re-sorting/re-coloring after resolution order.
  const documentOrder = new Map();
  [...rootCharGroupEl.querySelectorAll("path")].forEach((p, i) => documentOrder.set(p.getAttribute("id"), i));
  for (const block of blocks) {
    block.pathIds.sort((a, b) => documentOrder.get(a) - documentOrder.get(b));
  }
  blocks.sort((a, b) => documentOrder.get(a.pathIds[0]) - documentOrder.get(b.pathIds[0]));
  pathToColor.clear();
  blocks.forEach((block, i) => {
    block.index = i;
    block.color = colors[i % colors.length];
    for (const p of block.pathEls) pathToColor.set(p, block.color);
    delete block.pathEls;
  });

  return { pathToColor, blocks };
}
