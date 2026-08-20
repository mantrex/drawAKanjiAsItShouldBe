// fetch-chise.mjs — CHISE_MAIN: Fase 1+2 combined (download + IDS parsing + KanjiVG-aware expansion)
//
// Downloads the CHISE-derived IDS (Ideographic Description Sequence) data
// used by colorCriteria: "CHISE_MAIN" from the cjkvi/cjkvi-ids GitHub
// mirror, and recursively expands each kanji's decomposition into a set of
// components — stopping expansion at any component that already matches a
// real KanjiVG kvg:element/kvg:original SOMEWHERE in the corpus, rather
// than always descending to the raw IDS leaves.
//
// This is CHISE_MAIN's own expansion policy specifically — KanjiVG's own
// tagging depth gates how far this script's decomposition goes. See
// tools/fetch-chise-submax.mjs for the sibling "CHISE_SUBMAX" pipeline,
// which expands every branch all the way to CHISE/IDS's own true leaves
// instead, independent of what KanjiVG already tags at some intermediate
// depth — the two encode genuinely different component granularities for
// the same kanji, by design, not one being "more correct" than the other.
//
// Why Phase 1 (download/parse) and Phase 2 (match against KanjiVG) are
// fused here, unlike the KRADFILE pipeline (docsNoGit/download-krad.mjs +
// docsNoGit/match-krad-kanjivg.mjs, kept separate): KRADFILE's component
// list is already at the right granularity — matching against KanjiVG only
// needs to happen AFTER parsing. CHISE_MAIN's own expansion here is not:
// its decomposition keeps going past components KanjiVG (and KRADFILE)
// treat as meaningful units — e.g. 土 (a real KanjiVG kvg:element, and a
// KRADFILE component of 屋) has its own IDS entry (⿱十一, its own raw
// strokes), so an expansion that doesn't know about KanjiVG would wrongly
// keep descending past 土 into 十+一. CHISE_MAIN's stopping rule has to be
// KanjiVG-aware from the start, so the two phases can't be cleanly
// separated the way they were for KRADFILE (CHISE_SUBMAX, by contrast,
// keeps its own expansion phase fully KanjiVG-unaware, on purpose).
//
// ATTRIBUTION / LICENSE (read before using this data):
// ids.txt is derived from the CHISE project (https://www.chise.org/) and is
// licensed under GPLv2, per cjkvi/cjkvi-ids's own README ("'ids.txt' is
// derived from CHISE project. License follows their terms... All other data
// are distributed under GPLv2." — https://github.com/cjkvi/cjkvi-ids).
// THIS IS WHY THE OUTPUT OF THIS SCRIPT (chisedata/) IS GITIGNORED AND NEVER
// BUNDLED WITH THE DAKAISB NPM PACKAGE. If you run this script, the
// resulting data is subject to GPLv2 for your own use — see README.md's
// colorCriteria: "CHISE_MAIN" section.
//
// Usage: node tools/fetch-chise.mjs
// Requires assets/kanjivg/ (the vendored KanjiVG corpus, gitignored — see
// project README) to be present, to build the KanjiVG-element stopping set.
// Writes: chisedata/ids-raw.json (component lists BEFORE KanjiVG matching,
//         for reference/debugging — the raw expansion this script no longer
//         trusts blindly)
//         chisedata/chise-kanjivg-match-pass1.json (per-kanji, per-component
//         match data against KanjiVG — direct/variant/unresolved, same
//         shape as krad-kanjivg-match-pass1.json, ready for a Phase-3-style
//         AI judgment pass on whatever's left unresolved)
//         chisedata/fetch-chise-log.md (readable log)
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

say(`# CHISE/IDS download + KanjiVG-aware expansion log\n`);
say(`Run at: ${new Date().toISOString()}\n`);

if (!existsSync(CORPUS_DIR)) {
  throw new Error(`${CORPUS_DIR} not found — this script needs the vendored KanjiVG corpus (see project README) to know where to stop expanding IDS decompositions.`);
}

const { parseKanjiVg } = await import(join(PROJECT_ROOT, "src/parseKanjiVg.js"));

// ---------------------------------------------------------------------
// Step A: build the corpus-wide set of every kvg:element/kvg:original name
// KanjiVG uses anywhere (any depth, any file) — this is the "stop here"
// signal for IDS expansion, and doubles as the candidate pool Step C
// matches CHISE components against.
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
// Step C: KanjiVG-aware recursive expansion, SUB1-style: stop at the FIRST
// component on each branch that both (a) matches a real KanjiVG
// kvg:element somewhere in the corpus and (b) isn't a known single-stroke
// noise label. A component that fails either check is transparent — its
// own IDS decomposition is searched instead, exactly like SUB1
// (src/assignBlockColors.js) treats a non-labeled KanjiVG wrapper group as
// transparent and searches its children instead of stopping there.
//
// An earlier version of this script tried a SUBMAX-style "keep descending
// as long as there's further recognized structure below" rule instead
// (mirroring assignBlockColorsSubMax's own hasLabeledDescendant check) —
// it over-expanded past kradData.json's own already-validated results:
// kradData.json (the shipped KRAD mapping, cross-checked here as ground
// truth) gives 屋 → [土, 尸, 至], stopping exactly at 至, never descending
// into 至's own further IDS decomposition (至 → 𠫔+土 → ...厶+土...) the way
// the SUBMAX-style attempt did. CHISE/IDS and KRADFILE are simply
// different sources with different granularity conventions — matching
// KRADFILE's own depth here (first-match, not maximal-match) keeps CHISE's
// results comparable to KRAD's rather than introducing a third, deeper
// granularity that neither prior analysis in this project has validated.
// ---------------------------------------------------------------------
say(`\n## KanjiVG-aware expansion\n`);
say(`Expanding each character's IDS decomposition recursively (max depth ${MAX_EXPANSION_DEPTH}),`);
say(`SUB1-style: stop at the first component on each branch that matches a real KanjiVG`);
say(`kvg:element AND isn't a known single-stroke noise label; components that fail either`);
say(`check are transparent (searched further via their own IDS decomposition instead).`);
say(`Matches kradData.json's own depth (verified: 屋 → [尸, 至, ...] via KRAD, not further`);
say(`expanded into 至's own 厶/土 sub-decomposition) rather than a deeper SUBMAX-style`);
say(`expansion an earlier version of this script tried and found over-expanded relative to`);
say(`the already-shipped, already-validated KRAD mapping.`);

function expandToLeaves(char, depth, seen, isTopLevel) {
  if (!isTopLevel && kanjivgElementSet.has(char) && !NOISE_STROKE_LABELS.has(char)) {
    return [char]; // first recognized, non-noise KanjiVG component on this branch — stop here
  }
  if (NOISE_STROKE_LABELS.has(char)) return []; // noise label with no better option on this branch — drop, don't surface a stroke-bookkeeping artifact
  if (depth > MAX_EXPANSION_DEPTH) return [char];
  if (seen.has(char)) return [char];
  const decomp = pickDecomposition(char);
  if (!decomp) return [char]; // true IDS leaf, not KanjiVG-recognized and not noise — keep as-is
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
  join(OUT_DIR, "ids-raw.json"),
  JSON.stringify(
    {
      source: IDS_URL,
      fetchedAt: new Date().toISOString(),
      attribution:
        "ids.txt is derived from the CHISE project (https://www.chise.org/) via the cjkvi/cjkvi-ids mirror (https://github.com/cjkvi/cjkvi-ids). Licensed under GPLv2, per cjkvi/cjkvi-ids's own README: \"'ids.txt' is derived from CHISE project. License follows their terms... All other data are distributed under GPLv2.\" This data is GENERATED LOCALLY by this script and is NEVER bundled with the DAKAISB npm package. Components here are already KanjiVG-aware-expanded (see this script's header comment), not raw IDS leaves.",
      kanjivgElementSetSize: kanjivgElementSet.size,
      entryCount: rawEntriesOut.length,
      entries: rawEntriesOut,
    },
    null,
    2
  )
);
say(`\nWrote ${join(OUT_DIR, "ids-raw.json")} (${rawEntriesOut.length} entries).`);

// ---------------------------------------------------------------------
// Step D: match each kanji's expanded CHISE components against ITS OWN
// KanjiVG file specifically (not just "is this name known somewhere in the
// corpus", which Step C already used as the stopping signal — here we need
// the per-kanji match/unresolved breakdown for the mapping pipeline,
// mirroring match-krad-kanjivg.mjs's resolved-direct/resolved-variant/
// unresolved classification exactly).
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
  join(OUT_DIR, "chise-kanjivg-match-pass1.json"),
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
say(`\nWrote ${join(OUT_DIR, "chise-kanjivg-match-pass1.json")} (${results.length} kanji records).`);

say(`\n## Next steps\n`);
say(`This script covers download + deterministic KanjiVG matching only (${resolvedDirect + resolvedVariant} of`);
say(`${totalComponents} component occurrences, ${(((resolvedDirect + resolvedVariant) / totalComponents) * 100).toFixed(1)}%).`);
say(`The remaining unresolved components need AI-assisted judgment, which this script cannot run`);
say(`unattended:`);
say(`  1. node tools/prepare-chise-phase3.mjs`);
say(`     -> writes chisedata/chise-phase3-components.json, grouped by distinct component`);
say(`  2. Have an AI agent judge every component in that file (absent / agent-semantic /`);
say(`     structural-mismatch), saving chisedata/chise-phase3-components-resolved.json`);
say(`     incrementally as it goes.`);
say(`  3. node tools/build-chise-mapping.mjs`);
say(`     -> merges this file's results with the Phase 3 judgments into`);
say(`     chisedata/chise-kanjivg-mapping-final.json`);
say(`  4. node tools/build-chise-data.mjs`);
say(`     -> writes chisedata/chise.json, the file colorCriteria: "CHISE_MAIN" actually reads.`);
say(`\nIf you only need approximate coverage quickly, running just step 4 against the raw`);
say(`Phase 2 output (skipping Phase 3) is possible but yields only the ${(((resolvedDirect + resolvedVariant) / totalComponents) * 100).toFixed(1)}% deterministic`);
say(`coverage above, since build-chise-mapping.mjs currently expects a Phase 3 file to exist.`);
say(`See README.md's colorCriteria: "CHISE_MAIN" section for the full setup walkthrough.`);

writeFileSync(join(OUT_DIR, "fetch-chise-log.md"), log.join("\n") + "\n");
say(`Wrote ${join(OUT_DIR, "fetch-chise-log.md")}.`);
