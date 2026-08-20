// prepare-chise-phase3.mjs
//
// Same purpose as docsNoGit/prepare-phase3-components.mjs, adapted for the
// CHISE/IDS pipeline: groups chisedata/chise-kanjivg-match-pass1.json's
// unresolved (kanji, CHISE-component) pairs by distinct component (not per
// pair — same ~N-fold reduction in judgment work already proven for KRAD),
// and prepares a candidate-elements record per component for an agent to
// judge.
//
// Usage: node tools/prepare-chise-phase3.mjs
// Writes: chisedata/chise-phase3-components.json (input for agent judgment)
//         chisedata/chise-phase3-prep-log.md
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { DOMParser } from "linkedom";

globalThis.DOMParser = DOMParser;

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const OUT_DIR = join(PROJECT_ROOT, "chisedata");
const CORPUS_DIR = join(PROJECT_ROOT, "assets/kanjivg");

mkdirSync(OUT_DIR, { recursive: true });

const log = [];
function say(line) {
  log.push(line);
  console.log(line);
}

say(`# CHISE Phase 3 preparation log\n`);
say(`Run at: ${new Date().toISOString()}\n`);

const pass1 = JSON.parse(readFileSync(join(OUT_DIR, "chise-kanjivg-match-pass1.json"), "utf8"));

const componentMap = new Map(); // component -> { count, hosts: [literal] }

for (const r of pass1.results) {
  if (!r.kanjivgFile) continue;
  const unresolvedHere = r.components.filter((c) => c.resolution === "unresolved");
  if (unresolvedHere.length === 0) continue;
  for (const c of unresolvedHere) {
    if (!componentMap.has(c.component)) componentMap.set(c.component, { count: 0, hosts: [] });
    const entry = componentMap.get(c.component);
    entry.count++;
    entry.hosts.push(r.literal);
  }
}

say(`Distinct unresolved CHISE components: ${componentMap.size}`);
say(`Total unresolved (kanji, component) occurrences: ${[...componentMap.values()].reduce((s, e) => s + e.count, 0)}\n`);

const { parseKanjiVg } = await import(join(PROJECT_ROOT, "src/parseKanjiVg.js"));

function codepointToKanjiVgFilename(char) {
  return char.codePointAt(0).toString(16).padStart(5, "0") + ".svg";
}
function collectAllLabeledNames(rootEl) {
  const out = new Set();
  function walk(el) {
    for (const child of el.children) {
      if (child.tagName.toLowerCase() !== "g") continue;
      const element = child.getAttribute("kvg:element");
      if (element) out.add(element);
      walk(child);
    }
  }
  walk(rootEl);
  return out;
}

const elementUniverseCache = new Map();
function getElementUniverse(literal) {
  if (elementUniverseCache.has(literal)) return elementUniverseCache.get(literal);
  const filePath = join(CORPUS_DIR, codepointToKanjiVgFilename(literal));
  let universe = new Set();
  try {
    const svgText = readFileSync(filePath, "utf8");
    const { rootCharGroupEl } = parseKanjiVg(svgText);
    universe = collectAllLabeledNames(rootCharGroupEl);
  } catch {
    // leave empty
  }
  elementUniverseCache.set(literal, universe);
  return universe;
}

const components = [];
for (const [component, { count, hosts }] of componentMap) {
  const candidatePool = new Map();
  const uniqueHosts = [...new Set(hosts)];
  for (const host of uniqueHosts) {
    const universe = getElementUniverse(host);
    for (const el of universe) {
      candidatePool.set(el, (candidatePool.get(el) || 0) + 1);
    }
  }
  const sortedCandidates = [...candidatePool.entries()].sort((a, b) => b[1] - a[1]);

  components.push({
    component,
    occurrenceCount: count,
    distinctHostCount: uniqueHosts.length,
    hostSample: uniqueHosts.slice(0, 10),
    candidateElements: sortedCandidates.slice(0, 15).map(([el, hostCount]) => ({
      element: el,
      hostCoverageCount: hostCount,
      hostCoveragePct: ((hostCount / uniqueHosts.length) * 100).toFixed(1),
    })),
    resolution: null,
    resolvedTo: null,
    note: null,
  });
}

components.sort((a, b) => b.occurrenceCount - a.occurrenceCount);

say(`## All components by occurrence count (with strongest candidate)\n`);
say("```");
for (const c of components) {
  const top = c.candidateElements[0];
  say(
    `${c.component} (${c.occurrenceCount}x, ${c.distinctHostCount} distinct hosts) — strongest candidate: ${
      top ? `${top.element} (${top.hostCoveragePct}% host coverage)` : "NONE FOUND"
    }`
  );
}
say("```");

const noCandidatesAtAll = components.filter((c) => c.candidateElements.length === 0);
say(`\nComponents with ZERO candidate elements found across ANY host (${noCandidatesAtAll.length}):`);
say(noCandidatesAtAll.length ? noCandidatesAtAll.map((c) => c.component).join(", ") : "(none)");

writeFileSync(
  join(OUT_DIR, "chise-phase3-components.json"),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      distinctComponentCount: components.length,
      totalOccurrences: components.reduce((s, c) => s + c.occurrenceCount, 0),
      components,
    },
    null,
    2
  )
);
say(`\nWrote chisedata/chise-phase3-components.json (${components.length} component records).`);

writeFileSync(join(OUT_DIR, "chise-phase3-prep-log.md"), log.join("\n") + "\n");
say(`Wrote chisedata/chise-phase3-prep-log.md.`);
