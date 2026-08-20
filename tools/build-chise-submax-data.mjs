// build-chise-submax-data.mjs
//
// CHISE_SUBMAX's own final step — mirrors tools/build-chise-data.mjs
// (CHISE_MAIN's version) exactly, over CHISE_SUBMAX's own mapping.
// Consolidates chisedata/chise-submax-kanjivg-mapping-final.json (the
// granular per-pair mapping with resolution/note metadata) into the compact
// per-kanji JSON the CHISE_SUBMAX colorCriteria actually reads at runtime:
// chisedata/chise-submax.json.
//
// Only 'direct'/'variant'/'agent-semantic' resolutions are included
// (same convention as src/kradData.json and CHISE_MAIN's chise.json) —
// 'absent'/'structural-mismatch'/'no-kanjivg-file' entries are dropped,
// since they have no usable kanjivgElement to color.
//
// chise-submax.json is NEVER bundled with the DAKAISB npm package (it
// lives in chisedata/, gitignored) — CC BY-SA doesn't apply here, this
// data is GPLv2 (derived from CHISE via cjkvi/cjkvi-ids). See README.md's
// colorCriteria: "CHISE_SUBMAX" section for how to load this file yourself
// and pass it to createKanjiAnimation as the chiseData option. NOT
// interchangeable with CHISE_MAIN's chise.json — the two encode different
// component granularities for the same kanji.
//
// Usage: node tools/build-chise-submax-data.mjs
// Writes: chisedata/chise-submax.json
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const OUT_DIR = join(PROJECT_ROOT, "chisedata");
mkdirSync(OUT_DIR, { recursive: true });

const mapping = JSON.parse(readFileSync(join(OUT_DIR, "chise-submax-kanjivg-mapping-final.json"), "utf8"));

const byKanji = new Map(); // kanji -> Set of kvg:element names
for (const e of mapping.entries) {
  if (!["direct", "variant", "agent-semantic"].includes(e.resolution)) continue;
  if (!e.kanjivgElement) continue;
  if (!byKanji.has(e.kanji)) byKanji.set(e.kanji, new Set());
  byKanji.get(e.kanji).add(e.kanjivgElement);
}

const kanji = {};
for (const [k, set] of byKanji) {
  kanji[k] = [...set].sort();
}

const output = {
  _attribution:
    "Component data derived from CHISE/IDS (via cjkvi/cjkvi-ids, based on CHISE IDS Database, chise.org), licensed under GPLv2 (https://github.com/cjkvi/cjkvi-ids). This file maps each kanji to the set of KanjiVG kvg:element names its CHISE/IDS components resolve to, using components expanded to CHISE/IDS's own true leaves (never gated by KanjiVG's tagging depth — see tools/fetch-chise-submax.mjs), produced by a CHISE<->KanjiVG matching and AI-assisted disambiguation process. This file is GENERATED LOCALLY by tools/fetch-chise-submax.mjs + tools/prepare-chise-submax-phase3.mjs + tools/build-chise-submax-mapping.mjs + this script, and is NEVER bundled with the DAKAISB npm package (see README.md's colorCriteria: \"CHISE_SUBMAX\" section for setup and usage). If you generate and use this file, you are subject to CHISE/IDS's GPLv2 licensing terms for your own use of it. NOT interchangeable with CHISE_MAIN's chise.json.",
  _generatedAt: new Date().toISOString(),
  kanji,
};

writeFileSync(join(OUT_DIR, "chise-submax.json"), JSON.stringify(output));
console.log(`Wrote ${join(OUT_DIR, "chise-submax.json")} (${Object.keys(kanji).length} kanji).`);
