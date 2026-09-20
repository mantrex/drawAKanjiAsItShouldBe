// build-krad-extended.mjs
//
// Generates src/kradExtendedData.json, the data behind colorCriteria
// "KVG-KRAD". Run after any change to src/kradData.json or to the
// KanjiVG corpus:  node tools/build-krad-extended.mjs
//
// Problem it addresses: KRADFILE lists atomic components (一, 丨, 丿, 二,
// 十, 土, 亠, ...) that KanjiVG leaves as raw ungrouped strokes. Plain
// "KRAD" therefore has no <g> to attach them to, and their strokes bubble
// into an unrelated neighbouring target's block (e.g. 右: the diagonal and
// the horizontal bar end up inside 口's block).
//
// Method (deliberately conservative — an ambiguous case stays absorbed
// rather than getting a wrong label):
//  1. Signatures: for every element name KanjiVG tags somewhere in the
//     corpus, take the sequences of base stroke types (kvg:type without
//     variant letters) of its tagged groups, keep the frequent ones of
//     maximal length (partial tagging is ignored) as its signatures.
//  2. For each kanji with a KRAD entry, find "pool" strokes: strokes the KRAD
//     walk put in a block although no ancestor <g> of that stroke carries
//     the block's name (absorbed), plus strokes of unnamed blocks.
//  2b. Leftover strokes are named by, in priority order: (A) the outermost
//     KanjiVG-tagged group made only of leftover strokes; (B) the single
//     component CHISE/IDS says is missing from KanjiVG's tree, when the
//     leftover run has that component's usual stroke count; (C) KRADFILE's
//     atomic components, below.
//  3. For each KRADFILE component that has no block of its own but has a
//     signature, find windows of consecutive pool strokes whose type
//     sequence equals the signature. Accept only when the number of windows
//     equals the number of times KRADFILE lists that component; otherwise
//     record the case as ambiguous and touch nothing.
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DOMParser } from "linkedom";

globalThis.DOMParser = DOMParser;

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CORPUS_DIR = join(ROOT, "assets/kanjivg");

const { parseKanjiVg } = await import(join(ROOT, "src/parseKanjiVg.js"));
const { assignBlockColorsKradBase } = await import(join(ROOT, "src/assignBlockColors.js"));

const kradData = JSON.parse(readFileSync(join(ROOT, "src/kradData.json"), "utf8"));
const mapping = JSON.parse(readFileSync(join(ROOT, "docsNoGit/krad-kanjivg-mapping-final.json"), "utf8")).entries;
const rawKrad = JSON.parse(readFileSync(join(ROOT, "docsNoGit/krad-raw.json"), "utf8")).entries;

// CHISE/IDS top-level operands per kanji (build-time use only; the data
// itself is GPLv2 and is never bundled). Only kanji with a single, consistent
// decomposition are used.
const idsByKanji = new Map();
{
  const raw = JSON.parse(readFileSync(join(ROOT, "chisedata/ids-raw.json"), "utf8"));
  const entries = Array.isArray(raw) ? raw : raw.entries;
  const seen = new Map();
  for (const e of entries) {
    if (!seen.has(e.literal)) seen.set(e.literal, new Set());
    seen.get(e.literal).add(JSON.stringify(e.items));
  }
  for (const [lit, variants] of seen) {
    if (variants.size === 1) idsByKanji.set(lit, JSON.parse([...variants][0]));
  }
}

// A block of a single stroke (一, 丨, 丿, ...) is not a component a learner
// can name, and the KRAD audit deliberately leaves such generic strokes out;
// every group this tool adds therefore has at least this many strokes.
const MIN_STROKES = 2;

const KRAD_SPELLING = { "｜": "丨", "ノ": "丿", "ハ": "八" };
const baseType = (t) => (t || "").replace(/[a-z0-9]+$/i, "");
const pathNum = (p) => Number(p.getAttribute("id").match(/-s(\d+)$/)?.[1]);

const files = readdirSync(CORPUS_DIR).filter((f) => /^[0-9a-f]{5}\.svg$/.test(f));
const parsed = new Map();
for (const f of files) {
  try {
    const { rootCharGroupEl } = parseKanjiVg(readFileSync(join(CORPUS_DIR, f), "utf8"));
    parsed.set(rootCharGroupEl.getAttribute("kvg:element"), rootCharGroupEl);
  } catch {
    /* not a standard KanjiVG file */
  }
}

// 1. Signatures from KanjiVG's own tagged groups (any nesting depth). Only
// the COMPLETE form counts: KanjiVG sometimes tags a group with just part of
// a component's strokes (e.g. a group named 十 owning only the vertical),
// and using that as a signature would label a lone stroke as the whole
// component. So per name we keep every frequent sequence of the maximal
// length seen among frequent sequences.
const seqTally = new Map();
for (const root of parsed.values()) {
  for (const g of root.querySelectorAll("g")) {
    const name = g.getAttribute("kvg:element");
    if (!name) continue;
    const ps = [...g.querySelectorAll("path")];
    if (ps.length === 0) continue;
    const key = ps.map((p) => baseType(p.getAttribute("kvg:type"))).join("|");
    if (!seqTally.has(name)) seqTally.set(name, new Map());
    const m = seqTally.get(name);
    m.set(key, (m.get(key) || 0) + 1);
  }
}
const signatures = {};
for (const [name, m] of seqTally) {
  const total = [...m.values()].reduce((a, b) => a + b, 0);
  const frequent = [...m.entries()].filter(([, c]) => c >= 5 && c / total >= 0.05).map(([k, c]) => [k.split("|"), c]);
  if (!frequent.length) continue;
  const maxLen = Math.max(...frequent.map(([seq]) => seq.length));
  const full = frequent.filter(([seq]) => seq.length === maxLen);
  const coverage = full.reduce((n, [, c]) => n + c, 0) / total;
  if (coverage >= 0.3) signatures[name] = full.map(([seq]) => seq);
}
// A stroke type may itself list alternatives ("㇀/㇐"): match on any overlap.
const typeMatches = (strokeType, sigType) => {
  const a = strokeType.split("/");
  return sigType.split("/").some((t) => a.includes(t));
};

const byKanji = {};
for (const e of mapping) (byKanji[e.kanji] ||= []).push(e);

const colors = ["a", "b", "c", "d", "e", "f", "g"];
const out = {};
const ambiguous = [];
const noSignature = {};
let kanjiExamined = 0;

// Full stroke count of a component as KanjiVG tags it: the frequent tagged
// counts of maximal length. A group named 十 that owns a single stroke is
// partial tagging, not a 十.
const taggedCounts = {};
for (const root of parsed.values()) {
  for (const g of root.querySelectorAll("g")) {
    const n = g.getAttribute("kvg:element");
    if (!n) continue;
    const c = g.querySelectorAll("path").length;
    ((taggedCounts[n] ||= {})[c] ||= 0);
    taggedCounts[n][c]++;
  }
}
const fullCount = (name) => {
  const h = taggedCounts[name];
  if (!h) return null;
  const total = Object.values(h).reduce((a, b) => a + b, 0);
  if (total < 5) return null; // too rare to judge
  const frequent = Object.entries(h).filter(([, c]) => c >= 5 && c / total >= 0.05).map(([k]) => Number(k));
  return frequent.length ? Math.max(...frequent) : null;
};
const modal = (hist, minShare) => {
  const total = Object.values(hist).reduce((a, b) => a + b, 0);
  const [len, cnt] = Object.entries(hist).sort((a, b) => b[1] - a[1])[0];
  return cnt / total >= minShare ? Number(len) : null;
};

// Pass 1. Per kanji, from the plain KRAD walk: which strokes sit in a block
// that is not their own ("leftover"), then
//  A. carve the outermost KanjiVG group made only of leftover strokes from
//     ONE source block: named after KanjiVG's tag when its stroke count is the
//     component's full count, anonymous otherwise (only out of a named block
//     and only if >= 2 strokes — a lone stroke or an anonymous block that is
//     already its own group is left alone);
//  B. CHISE composite for a bare leftover run inside a named block.
const info = new Map();
for (const { literal } of rawKrad) {
  const root = parsed.get(literal);
  if (!root || !kradData.kanji[literal]) continue;
  kanjiExamined++;
  const paths = [...root.querySelectorAll("path")];
  const { blocks } = assignBlockColorsKradBase(root, colors);
  const named = new Set(blocks.map((b) => b.element).filter(Boolean));
  const pathById = new Map(paths.map((p) => [p.getAttribute("id"), p]));
  const hasNamedAncestor = (p, name) => {
    for (let el = p.parentNode; el && el !== root.parentNode; el = el.parentNode) {
      if (el.getAttribute && (el.getAttribute("kvg:element") === name || el.getAttribute("kvg:original") === name)) return true;
    }
    return false;
  };
  const sourceOf = new Map();
  const leftover = new Set();
  for (const b of blocks) {
    for (const id of b.pathIds) {
      sourceOf.set(id, b);
      if (!b.element || !hasNamedAncestor(pathById.get(id), b.element)) leftover.add(id);
    }
  }
  if (leftover.size === 0) continue;
  const namedLeftover = new Set([...leftover].filter((id) => sourceOf.get(id).element));

  const groupIds = (g) => {
    const ids = [...g.querySelectorAll("path")].map((p) => p.getAttribute("id"));
    if (ids.length === 0 || !ids.every((id) => leftover.has(id))) return null;
    return ids.every((id) => sourceOf.get(id) === sourceOf.get(ids[0])) ? ids : null;
  };
  const takenA = new Set();
  const groupsA = [];
  for (const g of root.querySelectorAll("g")) {
    if (g === root) continue;
    const ids = groupIds(g);
    if (!ids || ids.length < MIN_STROKES) continue;
    let inner = false;
    for (let el = g.parentNode; el && el !== root; el = el.parentNode) {
      if (el.getAttribute && groupIds(el)) inner = true;
    }
    if (inner) continue;
    const src = sourceOf.get(ids[0]);
    const nm = g.getAttribute("kvg:element");
    const expected = nm ? fullCount(nm) : null;
    let name = null;
    if (nm && (expected === null || expected === ids.length)) name = nm;
    if (!name && !src.element) continue;
    groupsA.push({ name, strokes: ids.map((id) => pathNum(pathById.get(id))), via: "kvg" });
    ids.forEach((id) => takenA.add(id));
  }

  let candidate = null;
  const items = idsByKanji.get(literal);
  if (items && items.length >= 2 && items.every((it) => [...it].length === 1)) {
    const namesInTree = new Set();
    for (const g of root.querySelectorAll("g")) {
      for (const a of ["kvg:element", "kvg:original"]) if (g.getAttribute(a)) namesInTree.add(g.getAttribute(a));
    }
    const missing = items.filter((it) => !namesInTree.has(it));
    if (missing.length === 1) {
      const explained = (p) => {
        for (let el = p.parentNode; el && el !== root.parentNode; el = el.parentNode) {
          if (el.getAttribute && items.some((it) => el.getAttribute("kvg:element") === it || el.getAttribute("kvg:original") === it)) return true;
        }
        return false;
      };
      const takenNamedA = new Set(groupsA.filter((g) => g.name).flatMap((g) => g.strokes.map((n) => paths[n - 1].getAttribute("id"))));
      const rest = paths.filter((p) => namedLeftover.has(p.getAttribute("id")) && !takenNamedA.has(p.getAttribute("id")) && !explained(p));
      const idx = rest.map((p) => paths.indexOf(p));
      if (idx.length >= MIN_STROKES && idx.every((v, i) => i === 0 || v === idx[i - 1] + 1)) {
        candidate = { name: missing[0], strokes: rest.map(pathNum) };
      }
    }
  }
  info.set(literal, { root, paths, blocks, named, leftover, namedLeftover, sourceOf, candidate, groupsA });
}

// A composite is accepted only if its stroke count is what that component
// normally has: KanjiVG's own full count where it tags the component,
// otherwise the consensus of all candidates for that name (>=60%, >=3).
const candHist = {};
for (const { candidate } of info.values()) {
  if (candidate) ((candHist[candidate.name] ||= {})[candidate.strokes.length] ||= 0), candHist[candidate.name][candidate.strokes.length]++;
}
const expectedLen = (name) => {
  const tagged = fullCount(name);
  if (tagged !== null) return tagged;
  const h = candHist[name];
  const total = h ? Object.values(h).reduce((a, b) => a + b, 0) : 0;
  return total >= 3 ? modal(h, 0.6) : null;
};
let compositeRejected = 0;
let atomsDiscarded = 0;

// Pass 2: A groups, B composite, then C (KRADFILE atoms) on what is left of
// a named block's leftover — kept only when they explain ALL of it, since
// naming part of a run would split a component.
for (const [literal, { root, paths, blocks, named, namedLeftover, sourceOf, candidate, groupsA }] of info) {
  const taken = new Set();
  const found = [];
  for (const g of groupsA) {
    found.push(g);
    g.strokes.forEach((n) => taken.add(paths[n - 1].getAttribute("id")));
  }
  if (candidate) {
    const cs = candidate.strokes.join(",");
    const anon = found.find((g) => g.name === null && g.strokes.join(",") === cs);
    const overlaps = found.some((g) => g !== anon && g.strokes.some((n) => candidate.strokes.includes(n)));
    if (expectedLen(candidate.name) !== candidate.strokes.length || overlaps) {
      compositeRejected++;
    } else if (anon) {
      anon.name = candidate.name; // KanjiVG's own group, named by CHISE
      anon.via = "kvg+chise";
    } else {
      candidate.strokes.forEach((n) => taken.add(paths[n - 1].getAttribute("id")));
      found.push({ ...candidate, via: "chise" });
    }
  }

  const remaining = new Set([...namedLeftover].filter((id) => !taken.has(id)));
  if (remaining.size > 0) {
    const wanted = new Map();
    for (const e of byKanji[literal] || []) {
      const name = e.kanjivgElement || KRAD_SPELLING[e.kradComponent] || e.kradComponent;
      if (named.has(name)) continue;
      wanted.set(name, (wanted.get(name) || 0) + 1);
    }
    const atoms = [];
    const atomTaken = new Set();
    const order = [...wanted.keys()].sort((a, b) => (signatures[b]?.[0].length || 0) - (signatures[a]?.[0].length || 0));
    for (const name of order) {
      const sigs = signatures[name];
      if (!sigs) {
        noSignature[name] = (noSignature[name] || 0) + 1;
        continue;
      }
      const windowMap = new Map();
      for (const sig of sigs) {
        for (let i = 0; i + sig.length <= paths.length; i++) {
          const win = paths.slice(i, i + sig.length);
          if (win.every((p, k) => remaining.has(p.getAttribute("id")) && !atomTaken.has(p.getAttribute("id")) && typeMatches(baseType(p.getAttribute("kvg:type")), sig[k]))) {
            windowMap.set(`${i}:${sig.length}`, win);
          }
        }
      }
      const windows = [...windowMap.values()];
      if (sigs[0].length < MIN_STROKES) continue; // single-stroke atoms are never blocks
      if (windows.length !== wanted.get(name)) {
        ambiguous.push(`${literal}:${name}(${windows.length} windows, ${wanted.get(name)} wanted)`);
        continue;
      }
      for (const win of windows) {
        win.forEach((p) => atomTaken.add(p.getAttribute("id")));
        atoms.push({ name, strokes: win.map(pathNum), via: "krad" });
      }
    }
    // Accept per source block only if the atoms cover all its remaining leftover.
    const bySource = new Map();
    for (const id of remaining) (bySource.get(sourceOf.get(id)) || bySource.set(sourceOf.get(id), []).get(sourceOf.get(id))).push(id);
    for (const [, ids] of bySource) {
      const atomsHere = atoms.filter((a) => a.strokes.every((n) => ids.includes(paths[n - 1].getAttribute("id"))));
      const covered = new Set(atomsHere.flatMap((a) => a.strokes.map((n) => paths[n - 1].getAttribute("id"))));
      if (atomsHere.length && ids.every((id) => covered.has(id))) {
        for (const a of atomsHere) {
          found.push(a);
          a.strokes.forEach((n) => taken.add(paths[n - 1].getAttribute("id")));
        }
      } else if (atomsHere.length) {
        atomsDiscarded += atomsHere.length;
      }
    }
  }
  if (!found.length) continue;

  // A named block must keep at least one stroke.
  let ok = true;
  for (const b of blocks) {
    if (!b.element) continue;
    const left = b.pathIds.filter((id) => !taken.has(id)).length;
    if (left === 0 && b.pathIds.some((id) => taken.has(id))) ok = false;
  }
  if (!ok) {
    ambiguous.push(`${literal}:would-empty-a-block`);
    continue;
  }
  out[literal] = found.sort((a, b) => a.strokes[0] - b.strokes[0]);
}

const doc = {
  _attribution:
    "Entries with via:\"chise\" name a component using CHISE/IDS decomposition (GPLv2, https://www.chise.org, via cjkvi/cjkvi-ids); they can be dropped by regenerating without chisedata/ids-raw.json. Derived from KRADFILE (Copyright 2001/2007 Michael Raine, James Breen and the EDRDG, CC BY-SA 4.0, https://www.edrdg.org/edrdg/licence.html) and KanjiVG (Ulrich Apel, CC BY-SA 3.0, https://kanjivg.tagaini.net). Stroke groups name components KanjiVG leaves as untagged strokes.",
  _generatedAt: new Date().toISOString(),
  kanji: out,
};
writeFileSync(join(ROOT, "src/kradExtendedData.json"), JSON.stringify(doc));

const total = Object.values(out).reduce((n, a) => n + a.length, 0);
const nameCount = {};
for (const a of Object.values(out)) for (const g of a) nameCount[g.name] = (nameCount[g.name] || 0) + 1;
const top = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k}:${v}`).join(" ");
const log = [
  "# KVG-KRAD build log",
  `Generated: ${doc._generatedAt}`,
  `Kanji examined (KRAD entry + parsed SVG): ${kanjiExamined}`,
  `Kanji with at least one extension: ${Object.keys(out).length}`,
  `Named stroke groups added: ${total}`,
  `KRADFILE atom groups discarded (would have split a component): ${atomsDiscarded}`,
  `CHISE composites rejected (stroke count not what the component normally has): ${compositeRejected}`,
  `Signatures derived: ${Object.keys(signatures).length}`,
  `Ambiguous / skipped cases: ${ambiguous.length}`,
  `Added by component: ${top(nameCount, 40)}`,
  `Orphan components with no usable signature (kanji count): ${top(noSignature, 40)}`,
  "",
  "## Ambiguous cases (left absorbed, need manual review)",
  ambiguous.join("\n"),
].join("\n");
mkdirSync(join(ROOT, "docsNoGit"), { recursive: true });
writeFileSync(join(ROOT, "docsNoGit/krad-extended-log.md"), log);
console.log(log.split("\n").slice(0, 9).join("\n"));
