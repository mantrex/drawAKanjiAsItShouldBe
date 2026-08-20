// build-chise-submax-mapping.mjs
//
// CHISE_SUBMAX's own Phase 4 (consolidation) — mirrors
// tools/build-chise-mapping.mjs (CHISE_MAIN's version) exactly, over
// CHISE_SUBMAX's own true-IDS-leaf component set instead. Merges Phase 2's
// deterministic matches (chisedata/chise-submax-kanjivg-match-pass1.json —
// resolved-direct / resolved-variant / unresolved) with Phase 3's
// per-component judgments
// (chisedata/chise-submax-phase3-components-resolved.json) into a single,
// complete mapping: chisedata/chise-submax-kanjivg-mapping-final.json.
//
// Every (kanji, CHISE component) pair ends up with exactly one final
// resolution. This script verifies that invariant explicitly — no pair
// should be left without one.
//
// Usage: node tools/build-chise-submax-mapping.mjs
// Writes: chisedata/chise-submax-kanjivg-mapping-final.json,
//         chisedata/chise-submax-final-mapping-log.md
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const OUT_DIR = join(PROJECT_ROOT, "chisedata");
mkdirSync(OUT_DIR, { recursive: true });

const log = [];
function say(line) {
  log.push(line);
  console.log(line);
}

say(`# Final CHISE_SUBMAX ↔ KanjiVG mapping — consolidation log\n`);
say(`Run at: ${new Date().toISOString()}\n`);

const pass1 = JSON.parse(readFileSync(join(OUT_DIR, "chise-submax-kanjivg-match-pass1.json"), "utf8"));
const phase3 = JSON.parse(readFileSync(join(OUT_DIR, "chise-submax-phase3-components-resolved.json"), "utf8"));

say(`Loaded Phase 2 results: ${pass1.results.length} kanji.`);
say(`Loaded Phase 3 results: ${phase3.components.length} distinct components judged.\n`);

const phase3ByComponent = new Map(phase3.components.map((c) => [c.component, c]));

const finalEntries = [];
const stats = { direct: 0, variant: 0, "agent-semantic": 0, absent: 0, "structural-mismatch": 0, "no-kanjivg-file": 0 };
const stillMissing = [];

for (const kanjiRecord of pass1.results) {
  for (const c of kanjiRecord.components) {
    let finalResolution;
    let kanjivgElement = c.kanjivgElement;
    let note = null;

    if (c.resolution === "resolved-direct") {
      finalResolution = "direct";
      stats.direct++;
    } else if (c.resolution === "resolved-variant") {
      finalResolution = "variant";
      stats.variant++;
    } else if (c.resolution === "no-kanjivg-file") {
      finalResolution = "no-kanjivg-file";
      stats["no-kanjivg-file"]++;
    } else if (c.resolution === "unresolved") {
      const phase3Decision = phase3ByComponent.get(c.component);
      if (!phase3Decision) {
        stillMissing.push({ kanji: kanjiRecord.literal, component: c.component });
        continue;
      }
      finalResolution = phase3Decision.resolution;
      kanjivgElement = phase3Decision.resolvedTo;
      note = phase3Decision.note;
      stats[finalResolution] = (stats[finalResolution] || 0) + 1;
    } else {
      stillMissing.push({ kanji: kanjiRecord.literal, component: c.component, unexpectedResolution: c.resolution });
      continue;
    }

    finalEntries.push({
      kanji: kanjiRecord.literal,
      chiseComponent: c.component,
      kanjivgElement: kanjivgElement || null,
      resolution: finalResolution,
      note,
    });
  }
}

say(`## Final resolution counts (${finalEntries.length} total kanji-component pairs)\n`);
for (const [key, count] of Object.entries(stats)) {
  say(`  ${key}: ${count} (${((count / finalEntries.length) * 100).toFixed(1)}%)`);
}

say(`\n## Verification\n`);
if (stillMissing.length === 0) {
  say(`PASS: every (kanji, component) pair from Phase 2 has a final resolution. Zero pairs left`);
  say(`in an unresolved/unknown state.`);
} else {
  say(`FAIL: ${stillMissing.length} pairs still have no final resolution:`);
  for (const m of stillMissing.slice(0, 30)) {
    say(`  ${m.kanji} / ${m.component}${m.unexpectedResolution ? ` (unexpected Phase 2 resolution: ${m.unexpectedResolution})` : " (no Phase 3 decision found for this component)"}`);
  }
}

const unresolvedComponentsInPass1 = new Set();
for (const r of pass1.results) {
  for (const c of r.components) {
    if (c.resolution === "unresolved") unresolvedComponentsInPass1.add(c.component);
  }
}
const missingFromPhase3 = [...unresolvedComponentsInPass1].filter((comp) => !phase3ByComponent.has(comp));
say(`\nDistinct components Phase 2 left unresolved: ${unresolvedComponentsInPass1.size}`);
say(`Distinct components Phase 3 judged: ${phase3ByComponent.size}`);
if (missingFromPhase3.length) {
  say(`\nWARNING: ${missingFromPhase3.length} components appear unresolved in this Phase 2 run but have`);
  say(`no Phase 3 judgment:`);
  say(`  ${missingFromPhase3.join(", ")}`);
} else {
  say(`No drift: every component Phase 2 currently leaves unresolved was covered by Phase 3.`);
}

const kanjiWithGaps = new Set(stillMissing.map((m) => m.kanji));
say(`\nKanji with at least one still-unmapped component: ${kanjiWithGaps.size} / ${pass1.results.length}`);

writeFileSync(
  join(OUT_DIR, "chise-submax-kanjivg-mapping-final.json"),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      description:
        "Complete CHISE_SUBMAX-to-KanjiVG component mapping. Components here are CHISE/IDS's own true leaves (expansion never stopped early for a KanjiVG match — see tools/fetch-chise-submax.mjs), NOT the same component set as CHISE_MAIN's chise-kanjivg-mapping-final.json. Each entry is one (kanji, CHISE component) pair with its final resolution: 'direct' (exact string match), 'variant' (matched via KanjiVG's own kvg:original attribute), 'agent-semantic' (matched by AI judgment in Phase 3, see note), 'absent' (CHISE component genuinely has no corresponding named node in this kanji's KanjiVG file), 'structural-mismatch' (CHISE and KanjiVG segment this kanji fundamentally differently, see note), or 'no-kanjivg-file' (no KanjiVG SVG exists for this kanji at all). This file is derived from GPLv2-licensed CHISE/IDS data — never bundled with the DAKAISB npm package.",
      sourceAttribution:
        "CHISE/IDS data: derived from the CHISE project (https://www.chise.org/) via cjkvi/cjkvi-ids (https://github.com/cjkvi/cjkvi-ids), GPLv2. KanjiVG data: Copyright Ulrich Apel, CC BY-SA 3.0 (https://kanjivg.tagaini.net/).",
      counts: stats,
      totalPairs: finalEntries.length,
      unmappedPairCount: stillMissing.length,
      entries: finalEntries,
    },
    null,
    2
  )
);
say(`\nWrote ${join(OUT_DIR, "chise-submax-kanjivg-mapping-final.json")} (${finalEntries.length} entries).`);

writeFileSync(join(OUT_DIR, "chise-submax-final-mapping-log.md"), log.join("\n") + "\n");
say(`Wrote ${join(OUT_DIR, "chise-submax-final-mapping-log.md")}.`);
