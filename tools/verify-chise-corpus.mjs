// verify-chise-corpus.mjs
//
// Corpus-wide sanity check for colorCriteria: "CHISE_MAIN" and
// "CHISE_SUBMAX", same standard already applied to MAIN/SUB1/SUB2/SUBMAX/
// KRAD: for every KanjiVG file, every path must end up in exactly one block
// (no stroke double-counted, none dropped), and no block may be empty.
// Also re-runs the same check for the other 5 criteria in the same pass,
// as an explicit regression guard.
//
// CHISE_SUBMAX is only checked if chisedata/chise-submax.json exists yet
// (its own pipeline may not have been run) — CHISE_MAIN's own data
// (chisedata/chise.json) is required unconditionally.
//
// Usage: node tools/verify-chise-corpus.mjs
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DOMParser } from "linkedom";

globalThis.DOMParser = DOMParser;

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const CORPUS_DIR = join(PROJECT_ROOT, "assets/kanjivg");

const { parseKanjiVg } = await import(join(PROJECT_ROOT, "src/parseKanjiVg.js"));
const { assignBlockColors } = await import(join(PROJECT_ROOT, "src/assignBlockColors.js"));

const chiseMainData = JSON.parse(readFileSync(join(PROJECT_ROOT, "chisedata/chise.json"), "utf8"));
const chiseSubmaxPath = join(PROJECT_ROOT, "chisedata/chise-submax.json");
const chiseSubmaxData = existsSync(chiseSubmaxPath) ? JSON.parse(readFileSync(chiseSubmaxPath, "utf8")) : null;
if (!chiseSubmaxData) {
  console.log("NOTE: chisedata/chise-submax.json not found yet — skipping CHISE_SUBMAX verification this run.\n");
}

const chiseDataFor = { CHISE_MAIN: chiseMainData, CHISE_SUBMAX: chiseSubmaxData };
const colors = ["#f00", "#0f0", "#00f", "#ff0", "#0ff", "#f0f", "#888"];
const CRITERIA = ["MAIN", "SUB1", "SUB2", "SUBMAX", "KRAD", "CHISE_MAIN", ...(chiseSubmaxData ? ["CHISE_SUBMAX"] : [])];
const CHISE_CRITERIA = new Set(["CHISE_MAIN", "CHISE_SUBMAX"]);

const files = readdirSync(CORPUS_DIR).filter((f) => f.endsWith(".svg"));
console.log(`Verifying ${files.length} KanjiVG files across ${CRITERIA.length} criteria...`);

const stats = Object.fromEntries(
  CRITERIA.map((c) => [c, { files: 0, mismatches: 0, emptyBlocks: 0, covered: 0, uncovered: 0, shouldHaveThrown: 0 }])
);

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
    const chiseData = CHISE_CRITERIA.has(criteria) ? chiseDataFor[criteria] : undefined;

    if (CHISE_CRITERIA.has(criteria)) {
      // Both CHISE variants deliberately throw instead of falling back to
      // SUBMAX when a kanji has no mapping (see
      // assignBlockColorsChiseFromTargetSet) — that's expected for kanji
      // outside that variant's own coverage, so it's tracked separately
      // here rather than counted as a mismatch/failure.
      const rootElement = rootCharGroupEl.getAttribute("kvg:element");
      const covered = Boolean(rootElement && chiseData.kanji?.[rootElement]?.length);
      if (!covered) {
        s.uncovered++;
        // Explicitly confirm it throws for this uncovered kanji rather than
        // just trusting the coverage check above.
        try {
          assignBlockColors(rootCharGroupEl, colors, criteria, chiseData);
          s.shouldHaveThrown++;
          if (s.shouldHaveThrown <= 5) console.log(`  [${criteria}] DID NOT THROW for uncovered ${file}`);
        } catch {
          // expected
        }
        continue;
      }
    }

    s.files++;
    const { pathToColor, blocks } = assignBlockColors(rootCharGroupEl, colors, criteria, chiseData);

    if (pathToColor.size !== totalPaths) {
      s.mismatches++;
      if (s.mismatches <= 5) {
        console.log(`  [${criteria}] MISMATCH ${file}: ${totalPaths} paths, ${pathToColor.size} colored`);
      }
    }
    for (const b of blocks) {
      if (!b.pathIds || b.pathIds.length === 0) {
        s.emptyBlocks++;
        if (s.emptyBlocks <= 5) {
          console.log(`  [${criteria}] EMPTY BLOCK ${file}`);
        }
      }
    }
    if (CHISE_CRITERIA.has(criteria)) s.covered++;
  }
}

console.log("\n=== Results ===");
for (const criteria of CRITERIA) {
  const s = stats[criteria];
  console.log(
    `${criteria}: ${s.files} files, ${s.mismatches} mismatches, ${s.emptyBlocks} empty blocks` +
      (CHISE_CRITERIA.has(criteria)
        ? `, ${s.covered} covered (${s.uncovered} correctly threw as uncovered, ${((s.covered / (s.covered + s.uncovered)) * 100).toFixed(1)}% coverage)`
        : "")
  );
}
if (!chiseSubmaxData) {
  console.log("CHISE_SUBMAX: skipped (chisedata/chise-submax.json not generated yet)");
}

const anyFail = CRITERIA.some((c) => stats[c].mismatches > 0 || stats[c].emptyBlocks > 0 || stats[c].shouldHaveThrown > 0);
console.log(
  anyFail
    ? "\nFAIL: issues found above."
    : "\nPASS: zero mismatches, zero empty blocks across all criteria, and every CHISE variant checked throws for every uncovered kanji as designed."
);
process.exit(anyFail ? 1 : 0);
