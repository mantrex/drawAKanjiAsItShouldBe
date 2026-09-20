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
  const pool = new Set();
  for (const b of blocks) {
    for (const id of b.pathIds) {
      const p = pathById.get(id);
      if (!b.element || !hasNamedAncestor(p, b.element)) pool.add(id);
    }
  }
  if (pool.size === 0) continue;

  const wanted = new Map();
  for (const e of byKanji[literal] || []) {
    const name = e.kanjivgElement || KRAD_SPELLING[e.kradComponent] || e.kradComponent;
    if (named.has(name)) continue;
    wanted.set(name, (wanted.get(name) || 0) + 1);
  }

  const taken = new Set();
  const found = [];
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
        if (win.every((p, k) => pool.has(p.getAttribute("id")) && !taken.has(p.getAttribute("id")) && typeMatches(baseType(p.getAttribute("kvg:type")), sig[k]))) {
          windowMap.set(`${i}:${sig.length}`, win);
        }
      }
    }
    const windows = [...windowMap.values()];
    if (windows.length !== wanted.get(name)) {
      ambiguous.push(`${literal}:${name}(${windows.length} windows, ${wanted.get(name)} wanted)`);
      continue;
    }
    for (const win of windows) {
      win.forEach((p) => taken.add(p.getAttribute("id")));
      found.push({ name, strokes: win.map(pathNum) });
    }
  }
  if (!found.length) continue;

  // Never leave an existing block empty.
  const remaining = new Map(blocks.map((b) => [b, b.pathIds.length]));
  let ok = true;
  for (const b of blocks) {
    const left = b.pathIds.filter((id) => !taken.has(id)).length;
    if (left === 0 && b.pathIds.some((id) => taken.has(id))) ok = false;
    remaining.set(b, left);
  }
  if (!ok) {
    ambiguous.push(`${literal}:would-empty-a-block`);
    continue;
  }
  out[literal] = found.sort((a, b) => a.strokes[0] - b.strokes[0]);
}

const doc = {
  _attribution:
    "Derived from KRADFILE (Copyright 2001/2007 Michael Raine, James Breen and the EDRDG, CC BY-SA 4.0, https://www.edrdg.org/edrdg/licence.html) and KanjiVG (Ulrich Apel, CC BY-SA 3.0, https://kanjivg.tagaini.net). Stroke groups name components KanjiVG leaves as untagged strokes.",
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
