// fetch-chise-submax.mjs — CHISE_SUBMAX: Fase 1+2 combined (download + pure IDS-leaf expansion)
//
// Downloads the CHISE-derived IDS (Ideographic Description Sequence) data
// used by colorCriteria: "CHISE_SUBMAX" from the cjkvi/cjkvi-ids GitHub
// mirror, and recursively expands each kanji's decomposition all the way to
// CHISE/IDS's own true leaves (self-decomposition, or no further IDS
// entry) — WITHOUT ever stopping early just because some intermediate
// component already happens to match a real KanjiVG kvg:element.
//
// This is CHISE_SUBMAX's own expansion policy, and the whole reason it
// exists as a separate criterion from "CHISE_MAIN" (tools/fetch-chise.mjs):
// CHISE and KRADFILE are independently-compiled decomposition sources in
// their own right, not derivatives of KanjiVG's own tagging. CHISE_MAIN
// deliberately lets KanjiVG's tagging depth gate how far its IDS expansion
// goes (see its own header comment for why — briefly, an earlier attempt at
// unconstrained IDS expansion over-decomposed components like 土, which
// have their own IDS entry into raw strokes despite being genuine KanjiVG
// teaching units). CHISE_SUBMAX takes the opposite position: let CHISE/IDS
// decide its own decomposition depth entirely on its own terms, and only
// bring KanjiVG into the picture AFTERWARD, purely to find which group to
// color for each resulting leaf — matching CHISE_SUBMAX's own leaf set
// against KanjiVG happens as a genuinely separate step (Step D below),
// exactly the way KRADFILE's already-flat component list is matched for
// KRAD, rather than being fused into the expansion itself the way
// CHISE_MAIN's Step C is. The result: CHISE_SUBMAX and CHISE_MAIN encode
// two different, both legitimate, component granularities for the same
// kanji — neither is "more correct," they answer different questions
// ("what does IDS says on its own?" vs. "what does IDS say, capped at
// what KanjiVG already agrees is a real component?").
//
// ATTRIBUTION / LICENSE (read before using this data):
// ids.txt is derived from the CHISE project (https://www.chise.org/) and is
// licensed under GPLv2, per cjkvi/cjkvi-ids's own README ("'ids.txt' is
// derived from CHISE project. License follows their terms... All other data
// are distributed under GPLv2." — https://github.com/cjkvi/cjkvi-ids).
// THIS IS WHY THE OUTPUT OF THIS SCRIPT (chisedata/) IS GITIGNORED AND NEVER
// BUNDLED WITH THE DAKAISB NPM PACKAGE. If you run this script, the
// resulting data is subject to GPLv2 for your own use — see README.md's
// colorCriteria: "CHISE_SUBMAX" section.
//
// Usage: node tools/fetch-chise-submax.mjs
// Requires assets/kanjivg/ (the vendored KanjiVG corpus, gitignored — see
// project README) — NOT to gate expansion depth (unlike CHISE_MAIN, this
// script's expansion never consults it), only for Step D's per-kanji
// matching pass against each kanji's own KanjiVG file.
// Writes: chisedata/ids-raw-submax.json (component lists BEFORE KanjiVG
//         matching — here these ARE the true IDS leaves, not an
//         intermediate the script "no longer trusts" the way CHISE_MAIN's
//         ids-raw.json is)
//         chisedata/chise-submax-kanjivg-match-pass1.json (per-kanji,
//         per-component match data against KanjiVG — direct/variant/
//         unresolved, same shape as chise-kanjivg-match-pass1.json, ready
//         for a Phase-3-style AI judgment pass on whatever's unresolved)
//         chisedata/fetch-chise-submax-log.md (readable log)
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { DOMParser } from "linkedom";

globalThis.DOMParser = DOMParser;

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const OUT_DIR = join(PROJECT_ROOT, "chisedata");
const CORPUS_DIR = join(PROJECT_ROOT, "assets/kanjivg");
const IDS_URL = "https://raw.githubusercontent.com/cjkvi/cjkvi-ids/master/ids.txt";
const MAX_EXPANSION_DEPTH = 6; // safety limit against malformed/cyclic IDS data

mkdirSync(OUT_DIR, { recursive: true });

const log = [];
function say(line) {
  log.push(line);
  console.log(line);
}

say(`# CHISE_SUBMAX: CHISE/IDS download + pure IDS-leaf expansion log\n`);
say(`Run at: ${new Date().toISOString()}\n`);

if (!existsSync(CORPUS_DIR)) {
  throw new Error(`${CORPUS_DIR} not found — this script needs the vendored KanjiVG corpus (see project README) to know where to stop expanding IDS decompositions.`);
}

const { parseKanjiVg } = await import(join(PROJECT_ROOT, "src/parseKanjiVg.js"));

// ---------------------------------------------------------------------
// Step A: build the corpus-wide set of every kvg:element/kvg:original name
// KanjiVG uses anywhere (any depth, any file). UNLIKE fetch-chise.mjs
// (CHISE_MAIN), this set does NOT gate IDS expansion here — Step C below
// expands every branch to true IDS leaves regardless of what's in this
// set. It's still needed for two things: the NOISE_STROKE_LABELS blacklist
// definition just below still relies on knowing which labels are
// real-but-noisy KanjiVG elements, and Step D's per-kanji matching pass
// needs it as the candidate pool CHISE_SUBMAX's own leaves are matched
// against.
// ---------------------------------------------------------------------
say(`## Building corpus-wide KanjiVG element set\n`);

function isBlockGroup(el) {
  return el.hasAttribute("kvg:radical") || el.hasAttribute("kvg:element");
}

// Same walk as docsNoGit/match-krad-kanjivg.mjs's collectAllLabeledElements
// — includes the root itself (a single-glyph character's own
// kvg:original pair can sit directly on the root, not just its children).
// Also records each labeled group's own direct+nested <path> count, needed
// below to separate genuine structural components from bare-stroke labels.
function collectAllLabeledElements(rootEl) {
  const out = []; // { element, original, radical, pathCount }
  const rootElement = rootEl.getAttribute("kvg:element");
  const rootOriginal = rootEl.getAttribute("kvg:original");
  const rootRadical = rootEl.getAttribute("kvg:radical");
  if (rootElement || rootRadical) {
    out.push({ element: rootElement, original: rootOriginal, radical: rootRadical, pathCount: rootEl.querySelectorAll("path").length });
  }
  function walk(el) {
    for (const child of el.children) {
      if (child.tagName.toLowerCase() !== "g") continue;
      const element = child.getAttribute("kvg:element");
      const original = child.getAttribute("kvg:original");
      const radical = child.getAttribute("kvg:radical");
      if (element || radical) {
        out.push({ element, original, radical, pathCount: child.querySelectorAll("path").length });
      }
      walk(child);
    }
  }
  walk(rootEl);
  return out;
}

const kanjivgElementSet = new Set(); // every kvg:element/kvg:original name seen anywhere
const strokeCountsByElement = new Map(); // element -> array of pathCount values, for the noise-detection pass below
const kanjivgFiles = readdirSync(CORPUS_DIR).filter((f) => f.endsWith(".svg"));
let corpusParseFailures = 0;

for (const file of kanjivgFiles) {
  try {
    const svgText = readFileSync(join(CORPUS_DIR, file), "utf8");
    const { rootCharGroupEl } = parseKanjiVg(svgText);
    for (const e of collectAllLabeledElements(rootCharGroupEl)) {
      if (e.element) {
        kanjivgElementSet.add(e.element);
        if (!strokeCountsByElement.has(e.element)) strokeCountsByElement.set(e.element, []);
        strokeCountsByElement.get(e.element).push(e.pathCount);
      }
      if (e.original) kanjivgElementSet.add(e.original);
    }
  } catch {
    corpusParseFailures++;
  }
}
say(`Scanned ${kanjivgFiles.length} KanjiVG files (${corpusParseFailures} parse failures).`);
say(`Found ${kanjivgElementSet.size} distinct kvg:element/kvg:original names corpus-wide.\n`);

// NOISE_STROKE_LABELS: real KanjiVG kvg:element values that only ever tag
// isolated single strokes (KanjiVG tags these surprisingly broadly), not
// genuine teaching-relevant components — verified against real data before
// hardcoding this list (not guessed): every element with ≥50 corpus-wide
// occurrences and an average own-<path>-count ≤1.3 turned out to be one of
// this small, stable set of well-known single CJK strokes (Kangxi Radicals
// / CJK Strokes blocks), re-verifiable by rerunning this script's own
// stroke-count aggregation above. These are always skipped as expansion
// results, whether reached directly or via a transparently-traversed
// intermediate (see expandToLeaves below).
const NOISE_STROKE_LABELS = new Set(["丿", "一", "丶", "丨", "亅", "匚", "乙", "匸"]);

// ---------------------------------------------------------------------
// Step B: download and parse ids.txt.
// ---------------------------------------------------------------------
say(`## Download\n`);
say(`Fetching ${IDS_URL} ...`);
const res = await fetch(IDS_URL);
if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);
const text = await res.text();
say(`Downloaded ${text.length} characters (already UTF-8 — no decoding needed, confirmed by inspection).`);

const lines = text.split("\n");
say(`${lines.length} lines total.\n`);

say(`## Parsing\n`);
say(`Format: comment lines start with "#"; data lines are tab-separated:`);
say(`\`U+XXXX<TAB>char<TAB>decomposition1<TAB>decomposition2...\`. Some entries carry`);
say(`several alternative decompositions, each optionally tagged with a bracketed region`);
say(`code — [G]/[T]/[K]/[V]/[J] for China/Taiwan/Korea/Vietnam/Japan variants. This project`);
say(`targets Japanese kanji, so the [J]-tagged decomposition is preferred whenever present;`);
say(`otherwise the first (usually untagged, region-independent) decomposition is used.`);

const IDS_OPERATORS = new Set([
  "⿰", "⿱", "⿲", "⿳", "⿴", "⿵", "⿶", "⿷", "⿸", "⿹", "⿺", "⿻",
  "⿼", "⿽", "⿾", "⿿",
]);

const rawEntries = new Map(); // char -> { decompositions: [{ tags: [], text: string }] }
let commentLines = 0;
let parsedLines = 0;

for (const line of lines) {
  if (line.startsWith("#")) {
    commentLines++;
    continue;
  }
  if (line.trim() === "") continue;
  const fields = line.split("\t");
  if (fields.length < 2) continue;
  const [, char, ...decompFields] = fields;
  if (!char) continue;

  const decompositions = decompFields
    .map((f) => f.trim())
    .filter(Boolean)
    .map((f) => {
      const tagMatch = f.match(/\[([A-Z]+)\]$/);
      const tags = tagMatch ? tagMatch[1].split("") : [];
      const decompText = tagMatch ? f.slice(0, tagMatch.index) : f;
      return { tags, text: decompText };
    });

  rawEntries.set(char, { decompositions });
  parsedLines++;
}
say(`\nParsed ${parsedLines} character entries (${commentLines} comment lines skipped).`);

function pickDecomposition(char) {
  const entry = rawEntries.get(char);
  if (!entry || entry.decompositions.length === 0) return null;
  const jTagged = entry.decompositions.find((d) => d.tags.includes("J"));
  return jTagged || entry.decompositions[0];
}

// U+2460-U+2473 (Circled Digit One through Circled Number Twenty) are IDS's
// own convention for placeholder components with no dedicated Unicode
// codepoint — found by inspection while triaging unresolved components
// (e.g. 下's IDS decomposition contains no digits literally, but other
// entries genuinely use ① ② ③... as stand-in operands). These can never
// have a KanjiVG counterpart by construction, so they're stripped here
// alongside the structural operators rather than surfaced as unresolved
// components needing (impossible) judgment.
function isCircledNumberPlaceholder(ch) {
  const cp = ch.codePointAt(0);
  return cp >= 0x2460 && cp <= 0x2473;
}

function extractOperands(idsText) {
  const operands = [];
  for (const ch of idsText) {
    if (IDS_OPERATORS.has(ch)) continue;
    if (isCircledNumberPlaceholder(ch)) continue;
    operands.push(ch);
  }
  return operands;
}

// ---------------------------------------------------------------------
// Step C: pure IDS-leaf recursive expansion — KanjiVG-UNAWARE. Every
// branch is followed all the way down to a true IDS leaf: either a
// self-decomposing (atomic) character, or a character with no IDS entry at
// all. Unlike fetch-chise.mjs (CHISE_MAIN), this NEVER stops early just
// because some intermediate component already matches a recognized
// KanjiVG kvg:element — CHISE/IDS's own decomposition depth is treated as
// authoritative on its own terms, not capped by what KanjiVG happens to
// tag. The only exception is NOISE_STROKE_LABELS: even here, a leaf that
// is a known single-CJK-stroke label (see its own comment above) is
// dropped rather than surfaced, since it never carries teaching-relevant
// meaning regardless of which source produced it.
//
// This is the deliberate mirror image of CHISE_MAIN's own Step C (see
// fetch-chise.mjs's header and Step C comments for the full rationale of
// why CHISE_MAIN stops early instead) — see also this script's own header
// comment for why the two criteria exist side by side rather than one
// replacing the other.
// ---------------------------------------------------------------------
say(`\n## Pure IDS-leaf expansion (KanjiVG-unaware)\n`);
say(`Expanding each character's IDS decomposition recursively (max depth ${MAX_EXPANSION_DEPTH})`);
say(`all the way to true IDS leaves — self-decomposing/atomic characters, or characters with`);
say(`no IDS entry at all. Unlike CHISE_MAIN (tools/fetch-chise.mjs), this expansion never`);
say(`consults KanjiVG's own tagging to decide where to stop; only the noise-stroke blacklist`);
say(`is still applied, to drop leaves that are known single-CJK-stroke labels regardless of`);
say(`source. Matching this leaf set against KanjiVG happens afterward, as a separate step (D).`);

function expandToLeaves(char, depth, seen, isTopLevel) {
  if (!isTopLevel && NOISE_STROKE_LABELS.has(char)) return []; // noise label — drop, don't surface a stroke-bookkeeping artifact
  if (depth > MAX_EXPANSION_DEPTH) return [char];
  if (seen.has(char)) return [char];
  const decomp = pickDecomposition(char);
  if (!decomp) return [char]; // true IDS leaf — no further decomposition exists
  const operands = extractOperands(decomp.text);
  if (operands.length === 1 && operands[0] === char) return [char]; // self-decomposition — atomic
  if (operands.length === 0) return [char];

  const nextSeen = new Set(seen);
  nextSeen.add(char);
  const leaves = [];
  for (const op of operands) {
    leaves.push(...expandToLeaves(op, depth + 1, nextSeen, false));
  }
  return leaves;
}

const rawEntriesOut = []; // pre-KanjiVG-matching component lists, for reference
let selfReferenceOnly = 0;

for (const [char] of rawEntries) {
  // isTopLevel: true for the very first call, so a kanji that IS ITSELF a
  // recognized KanjiVG element (e.g. 屋 itself, if some other character
  // used it as a sub-component) still gets expanded rather than trivially
  // returning itself — the KanjiVG-membership stopping rule only applies
  // to components found DURING expansion, not to the kanji being expanded.
  const leaves = expandToLeaves(char, 0, new Set(), true);
  const uniqueLeaves = [...new Set(leaves)].filter((l) => l !== char);
  if (uniqueLeaves.length === 0) {
    selfReferenceOnly++;
    continue;
  }
  rawEntriesOut.push({ literal: char, items: uniqueLeaves });
}

say(`\nProduced ${rawEntriesOut.length} kanji entries with ≥1 component (${selfReferenceOnly}`);
say(`characters were atomic/self-referential and produced no entry).`);

writeFileSync(
  join(OUT_DIR, "ids-raw-submax.json"),
  JSON.stringify(
    {
      source: IDS_URL,
      fetchedAt: new Date().toISOString(),
      attribution:
        "ids.txt is derived from the CHISE project (https://www.chise.org/) via the cjkvi/cjkvi-ids mirror (https://github.com/cjkvi/cjkvi-ids). Licensed under GPLv2, per cjkvi/cjkvi-ids's own README: \"'ids.txt' is derived from CHISE project. License follows their terms... All other data are distributed under GPLv2.\" This data is GENERATED LOCALLY by this script and is NEVER bundled with the DAKAISB npm package. Components here are true IDS leaves (self-decomposing, or no further IDS entry) — expansion NEVER stopped early for a KanjiVG match, unlike CHISE_MAIN's ids-raw.json (see this script's header comment).",
      kanjivgElementSetSize: kanjivgElementSet.size,
      entryCount: rawEntriesOut.length,
      entries: rawEntriesOut,
    },
    null,
    2
  )
);
say(`\nWrote ${join(OUT_DIR, "ids-raw-submax.json")} (${rawEntriesOut.length} entries).`);

// ---------------------------------------------------------------------
// Step D: match each kanji's expanded true-IDS-leaf components against ITS
// OWN KanjiVG file specifically. Unlike CHISE_MAIN, Step C above never
// consulted KanjiVG at all, so this is the FIRST point KanjiVG enters the
// pipeline — exactly the KRADFILE pattern (an already-independent component
// list matched against KanjiVG afterward), mirroring
// match-krad-kanjivg.mjs's resolved-direct/resolved-variant/unresolved
// classification exactly.
// ---------------------------------------------------------------------
say(`\n## Per-kanji matching against each character's own KanjiVG file\n`);

function codepointToKanjiVgFilename(char) {
  return char.codePointAt(0).toString(16).padStart(5, "0") + ".svg";
}

let totalKanji = 0;
let noKanjiVgFile = 0;
let totalComponents = 0;
let resolvedDirect = 0;
let resolvedVariant = 0;
let unresolved = 0;
const results = [];
const missingFiles = [];

for (const { literal, items } of rawEntriesOut) {
  totalKanji++;
  const filename = codepointToKanjiVgFilename(literal);
  const filePath = join(CORPUS_DIR, filename);

  if (!existsSync(filePath)) {
    noKanjiVgFile++;
    missingFiles.push({ literal, filename });
    results.push({
      literal,
      kanjivgFile: null,
      components: items.map((component) => ({ component, kanjivgElement: null, resolution: "no-kanjivg-file" })),
    });
    continue;
  }

  let rootCharGroupEl;
  try {
    const svgText = readFileSync(filePath, "utf8");
    ({ rootCharGroupEl } = parseKanjiVg(svgText));
  } catch {
    continue;
  }

  const allLabeled = collectAllLabeledElements(rootCharGroupEl);
  const directNames = new Set(allLabeled.map((e) => e.element).filter(Boolean));
  const variantEquivalents = new Set();
  for (const e of allLabeled) {
    if (e.element && e.original) {
      variantEquivalents.add(e.element);
      variantEquivalents.add(e.original);
    }
  }

  const componentResults = [];
  for (const component of items) {
    totalComponents++;
    let resolution;
    let kanjivgElement = null;
    if (directNames.has(component)) {
      resolution = "resolved-direct";
      kanjivgElement = component;
      resolvedDirect++;
    } else if (variantEquivalents.has(component)) {
      const match = allLabeled.find((e) => e.element === component || e.original === component);
      resolution = "resolved-variant";
      kanjivgElement = match.element;
      resolvedVariant++;
    } else {
      resolution = "unresolved";
      unresolved++;
    }
    componentResults.push({ component, kanjivgElement, resolution });
  }
  results.push({ literal, kanjivgFile: filename, components: componentResults });
}

say(`Total CHISE kanji processed: ${totalKanji}`);
say(`KanjiVG file not found for: ${noKanjiVgFile}`);
say(`Total (kanji, CHISE component) pairs: ${totalComponents}`);
say(`  resolved-direct: ${resolvedDirect} (${((resolvedDirect / totalComponents) * 100).toFixed(1)}%)`);
say(`  resolved-variant: ${resolvedVariant} (${((resolvedVariant / totalComponents) * 100).toFixed(1)}%)`);
say(`  unresolved: ${unresolved} (${((unresolved / totalComponents) * 100).toFixed(1)}%)`);

say(`\n## Spot-check against hand-verified cases\n`);
for (const literal of ["屋", "導", "探"]) {
  const r = results.find((x) => x.literal === literal);
  if (!r) {
    say(`${literal}: NOT FOUND in results`);
    continue;
  }
  say(`${literal}:`);
  for (const c of r.components) {
    say(`  ${c.component} → ${c.resolution}${c.kanjivgElement ? ` (matched: ${c.kanjivgElement})` : ""}`);
  }
}

writeFileSync(
  join(OUT_DIR, "chise-submax-kanjivg-match-pass1.json"),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      idsSource: IDS_URL,
      summary: { totalKanji, noKanjiVgFile, totalComponents, resolvedDirect, resolvedVariant, unresolved },
      results,
    },
    null,
    2
  )
);
say(`\nWrote ${join(OUT_DIR, "chise-submax-kanjivg-match-pass1.json")} (${results.length} kanji records).`);

say(`\n## Next steps\n`);
say(`This script covers download + pure IDS-leaf expansion + deterministic KanjiVG matching only`);
say(`(${resolvedDirect + resolvedVariant} of ${totalComponents} component occurrences,`);
say(`${(((resolvedDirect + resolvedVariant) / totalComponents) * 100).toFixed(1)}%).`);
say(`The remaining unresolved components need AI-assisted judgment, which this script cannot run`);
say(`unattended:`);
say(`  1. node tools/prepare-chise-submax-phase3.mjs`);
say(`     -> writes chisedata/chise-submax-phase3-components.json, grouped by distinct component`);
say(`  2. Have an AI agent judge every component in that file (absent / agent-semantic /`);
say(`     structural-mismatch), saving chisedata/chise-submax-phase3-components-resolved.json`);
say(`     incrementally as it goes.`);
say(`  3. node tools/build-chise-submax-mapping.mjs`);
say(`     -> merges this file's results with the Phase 3 judgments into`);
say(`     chisedata/chise-submax-kanjivg-mapping-final.json`);
say(`  4. node tools/build-chise-submax-data.mjs`);
say(`     -> writes chisedata/chise-submax.json, the file colorCriteria: "CHISE_SUBMAX" actually reads.`);
say(`\nIf you only need approximate coverage quickly, running just step 4 against the raw`);
say(`Phase 2 output (skipping Phase 3) is possible but yields only the ${(((resolvedDirect + resolvedVariant) / totalComponents) * 100).toFixed(1)}% deterministic`);
say(`coverage above, since build-chise-submax-mapping.mjs currently expects a Phase 3 file to exist.`);
say(`See README.md's colorCriteria: "CHISE_SUBMAX" section for the full setup walkthrough.`);

writeFileSync(join(OUT_DIR, "fetch-chise-submax-log.md"), log.join("\n") + "\n");
say(`Wrote ${join(OUT_DIR, "fetch-chise-submax-log.md")}.`);
