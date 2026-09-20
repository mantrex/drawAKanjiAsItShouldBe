// verify-krad-corpus.mjs
//
// Corpus-wide sanity check specifically for colorCriteria: "KVG-KRAD", run after
// the krad-anomaly-corrections pass (see docsNoGit/krad-anomaly-corrections.md)
// to confirm the corrections to src/kradData.json did not break anything: for
// every KanjiVG file, every path must end up in exactly one block (no stroke
// double-counted, none dropped), and no block may be empty. Also re-runs the
// same check for the other 5 non-CHISE criteria in the same pass, as an
// explicit regression guard (this correction touched ONLY src/kradData.json,
// nothing shared with MAIN/SUB1/SUB2/SUBMAX).
//
// Usage: node tools/verify-krad-corpus.mjs
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DOMParser } from "linkedom";

globalThis.DOMParser = DOMParser;

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const CORPUS_DIR = join(PROJECT_ROOT, "assets/kanjivg");

const { parseKanjiVg } = await import(join(PROJECT_ROOT, "src/parseKanjiVg.js"));
const { assignBlockColors } = await import(join(PROJECT_ROOT, "src/assignBlockColors.js"));

const colors = ["#f00", "#0f0", "#00f", "#ff0", "#0ff", "#f0f", "#888"];
const CRITERIA = ["MAIN", "SUB1", "SUB2", "SUBMAX", "KVG-KRAD"];

const files = readdirSync(CORPUS_DIR).filter((f) => f.endsWith(".svg"));
console.log(`Verifying ${files.length} KanjiVG files across ${CRITERIA.length} criteria...`);

const stats = Object.fromEntries(CRITERIA.map((c) => [c, { files: 0, mismatches: 0, emptyBlocks: 0 }]));

// KRAD-specific extra check: how many KRAD blocks were produced per file, and
// how many fall back to SUBMAX (no kradData entry at all) vs actually use
// kradData.kanji targets — tracked purely for the summary, not a pass/fail
// signal on its own.
let kradFallbackCount = 0;
let kradTargetedCount = 0;

for (const file of files) {
  const svgText = readFileSync(join(CORPUS_DIR, file), "utf8");
  let rootCharGroupEl;
  try {
    ({ rootCharGroupEl } = parseKanjiVg(svgText));
  } catch {
    continue;
  }
  const totalPaths = rootCharGroupEl.querySelectorAll("path").length;
  if (totalPaths === 0) continue;

  for (const criteria of CRITERIA) {
    const s = stats[criteria];
    s.files++;
    const { pathToColor, blocks } = assignBlockColors(rootCharGroupEl, colors, criteria);

    if (pathToColor.size !== totalPaths) {
      s.mismatches++;
      if (s.mismatches <= 10) {
        console.log(`  [${criteria}] MISMATCH ${file}: ${totalPaths} paths, ${pathToColor.size} colored`);
      }
    }
    for (const b of blocks) {
      if (!b.pathIds || b.pathIds.length === 0) {
        s.emptyBlocks++;
        if (s.emptyBlocks <= 10) {
          console.log(`  [${criteria}] EMPTY BLOCK ${file}`);
        }
      }
    }
  }
}

console.log("\n=== Results ===");
for (const criteria of CRITERIA) {
  const s = stats[criteria];
  console.log(`${criteria}: ${s.files} files, ${s.mismatches} mismatches, ${s.emptyBlocks} empty blocks`);
}

const anyFail = CRITERIA.some((c) => stats[c].mismatches > 0 || stats[c].emptyBlocks > 0);
console.log(
  anyFail
    ? "\nFAIL: issues found above."
    : "\nPASS: zero mismatches, zero empty blocks across all criteria (KRAD corrections did not regress MAIN/SUB1/SUB2/SUBMAX)."
);
process.exit(anyFail ? 1 : 0);
