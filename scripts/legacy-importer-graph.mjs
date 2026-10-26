// G0.1 - importer graph for the legacy runtime lane.
//
// Why reachability and not a hand-written list: plan v1 classified modules by
// "lives under src/lib" and got it wrong (audit O-03). A hand-maintained boundary
// is the same mistake wearing a different hat, and it drifts the moment someone
// adds an import. So the lane is computed, not declared:
//
//   FORK SET   = every module transitively reachable from the fork entry points
//   LEGACY SET = everything else under src/
//   a subject is SHARED if any of its files is in FORK SET
//
// Usage: node scripts/legacy-importer-graph.mjs [--json]
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
const { publishedEntries } = require_("./build-entries.cjs");

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src");

/**
 * Entry points that must keep working. The published ones are DERIVED from the build config by
 * scripts/build-entries.cjs, not copied from here, so this list cannot drift the way the previous
 * hand-written one did (it named `src/index.ts`, a file that is never shipped, and omitted
 * nothing else by accident — it simply measured a graph no consumer runs).
 *
 * The component roots below are NOT build entries; they are extra starting points for the
 * fork-reachability question this script answers.
 */
const FORK_ENTRIES = [
	...publishedEntries().map((e) => e.source),
	"src/widget/index.ts", // internal barrel, not a published entry
	"src/widget/VNInvestCharts.tsx",
	"src/widget/VNInvestMultiCharts.tsx",
	"src/demo/index.tsx",
];

/** Modules the plan wants classified individually. */
const SUBJECTS = [
	"src/lib/core/DynamicChart.tsx",
	"src/lib/ChartCanvas.tsx",
	"src/lib/GenericChartComponent.tsx",
	"src/lib/GenericComponent.tsx",
	"src/lib/core/PaneTooltip.tsx",
	"src/lib/series",
	"src/lib/scale",
	"src/lib/axes",
	"src/lib/coordinates",
	"src/lib/interactive",
	"src/lib/tooltip",
	"src/lib/annotation",
	"src/widget/runtime/ChartScaleAdapter.ts",
];

function walk(dir, out = []) {
	for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
		const p = path.join(dir, e.name);
		if (e.isDirectory()) walk(p, out);
		else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
	}
	return out;
}

const rel = (p) => path.relative(ROOT, p).split(path.sep).join("/");
const all = walk(SRC);

const imports = new Map();
for (const file of all) {
	const text = fs.readFileSync(file, "utf8");
	const specs = new Set();
	for (const m of text.matchAll(/(?:^|\n)\s*(?:import|export)[\s\S]*?from\s*["']([^"']+)["']/g)) specs.add(m[1]);
	for (const m of text.matchAll(/(?:^|\n)\s*import\s*["']([^"']+)["']/g)) specs.add(m[1]);
	for (const m of text.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)) specs.add(m[1]);
	imports.set(rel(file), specs);
}

function resolve(fromRel, spec) {
	if (!spec.startsWith(".")) return null;
	const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromRel), spec));
	for (const cand of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
		if (fs.existsSync(path.join(ROOT, cand)) && fs.statSync(path.join(ROOT, cand)).isFile()) return cand;
	}
	return null;
}

const isTest = (f) => /__tests__|\.test\.[tj]sx?$/.test(f);

/** Transitive closure from a set of entry files. */
function reachable(entries) {
	const seen = new Set();
	const queue = entries.filter((e) => fs.existsSync(path.join(ROOT, e)));
	while (queue.length) {
		const cur = queue.pop();
		if (seen.has(cur)) continue;
		seen.add(cur);
		for (const spec of imports.get(cur) ?? []) {
			const to = resolve(cur, spec);
			if (to && !seen.has(to)) queue.push(to);
		}
	}
	return seen;
}

const FORK = reachable(FORK_ENTRIES);

/**
 * The lane actually hangs off one root: DynamicChart. Anything it transitively
 * imports is legacy surface, even when the public barrel also re-exports it.
 * That distinction matters here, because src/lib/core/index.ts is reachable from
 * the fork entries, so a naive "reachable from fork" test drags the entire legacy
 * tree in and reports axes, coordinates and tooltip as SHARED.
 *
 * So the question G4 needs answered is not "is this shared" but "what becomes
 * unreferenced once DynamicChart goes":
 *
 *   DELETABLE = FORK minus LEGACY_REACH
 *   KEPT      = FORK intersect LEGACY_REACH   (fork still needs it afterwards)
 */
const LEGACY_ROOT = "src/lib/core/DynamicChart.tsx";
const LEGACY_REACH = reachable([LEGACY_ROOT]);
const isDeletable = (f) => FORK.has(f) && !LEGACY_REACH.has(f);
const importersOf = new Map();
for (const [from, specs] of imports) {
	for (const spec of specs) {
		const to = resolve(from, spec);
		if (!to) continue;
		if (!importersOf.has(to)) importersOf.set(to, new Set());
		importersOf.get(to).add(from);
	}
}

const isForkFile = (f) => FORK.has(f);

function subjectFiles(subject) {
	const abs = path.join(ROOT, subject);
	if (!fs.existsSync(abs)) return null;
	if (fs.statSync(abs).isFile()) return [subject];
	return walk(abs).map(rel);
}

const lineCount = (files) =>
	files.reduce((n, f) => n + fs.readFileSync(path.join(ROOT, f), "utf8").split(/\r\n|\n|\r/).length, 0);

const rows = [];
for (const subject of SUBJECTS) {
	const files = subjectFiles(subject);
	if (!files) {
		rows.push({ subject, missing: true, verdict: "PATH-NOT-FOUND" });
		continue;
	}
	const inFork = files.filter(isForkFile);
	const importers = new Set();
	for (const f of files) for (const i of importersOf.get(f) ?? []) importers.add(i);
	const forkImporters = [...importers].filter((i) => isForkFile(i) && !isTest(i));
	const legacyImporters = [...importers].filter((i) => !isForkFile(i) && !isTest(i));
	const testImporters = [...importers].filter(isTest);

	rows.push({
		subject,
		files: files.length,
		lines: lineCount(files),
		forkFiles: inFork.length,
		deletableFiles: files.filter(isDeletable).length,
		keptFiles: files.filter((f) => FORK.has(f) && LEGACY_REACH.has(f)).length,
		forkImporters,
		legacyImporters,
		testImporters: testImporters.length,
		verdict: files.every(isDeletable)
			? "DELETABLE-WITH-DynamicChart"
			: files.some((f) => FORK.has(f) && LEGACY_REACH.has(f))
				? "KEPT-BY-FORK"
				: "ALREADY-UNREACHABLE",
	});
}

const allRel = all.map(rel);
const totalForkLines = lineCount(allRel.filter(isForkFile));
const totalLegacyLines = lineCount(allRel.filter((f) => !isForkFile(f)));

// "0 importers" is only a candidate list, and this repo has three ways to break that
// claim. Each one cost a round of wrong deletions before it was handled here.
//
// 1. Workers are spawned with `new Worker(new URL("./x.worker.ts", import.meta.url))`
//    and presets load through a template-literal `await import(`../styles/${name}`)`.
//    Neither is a static import edge, so pine.worker.ts, backfillPlanner.worker.ts and
//    externalBarsNormalization.worker.ts all read as unreachable even though live code
//    spawns them. Deleting them would have broken the Pine editor and the external-bars
//    path at runtime while every test still passed.
// 2. A test is an importer. MockData and the replay simulators looked orphaned and cost
//    41 TS2307 errors.
// 3. Test-reachability and dynamic holds are both transitive, and they have to be
//    propagated, because EventCapture.tsx is held yet still statically imports
//    ./utils/ChartDataUtil, and PineEditorPanel.tsx likewise imports ./PineScriptAdapter.
//    Deleting either target leaves a file that nothing can import.
//
// So: seed alive with the fork entries and every test file, iterate reverse reachability
// to a fixpoint, then seed again with anything held for a dynamic reference and iterate
// once more. Specifiers in `imports` are unresolved and must go through resolve() before
// they can be compared against rel paths; adding the raw text matches nothing and turns
// the fixpoint into a silent no-op.
//
// What this still cannot see: a test that reads a source file off disk by string path,
// which is not an import edge at all. exoticChartTypeReadiness.test.ts opens
// src/lib/series/index.ts with readFileSync(resolve(process.cwd(), ...)) to check that the
// exotic chart types are enumerated, so tsc stayed clean while that test failed ENOENT and
// the barrel had to be restored. No static analysis closes this gap, so the answer is not a
// better graph but the empirical gate: run the suite and read the failures.
const DYNAMIC_EDGE = /\bnew\s+URL\s*\(|\bimport\s*\(/;
const srcText = new Map();
function textOf(f) {
	if (!srcText.has(f)) srcText.set(f, fs.readFileSync(path.join(ROOT, f), "utf8"));
	return srcText.get(f);
}
function dynamicRefsOf(f) {
	const base = path.posix.basename(f);
	const stem = base.replace(/\.[^.]+$/, "");
	const refs = [];
	for (const g of allRel) {
		if (g === f) continue;
		for (const line of textOf(g).split(/\r\n|\n|\r/)) {
			if (!DYNAMIC_EDGE.test(line)) continue;
			if (!line.includes(base) && !line.includes(stem)) continue;
			refs.push(`${g}: ${line.trim().slice(0, 88)}`);
		}
	}
	return refs;
}
function expand(seed) {
	for (let pass = 0; pass < 50; pass++) {
		const before = seed.size;
		for (const [importer, specs] of imports) {
			if (!seed.has(importer)) continue;
			for (const spec of specs) {
				const to = resolve(importer, spec);
				if (to) seed.add(to);
			}
		}
		if (seed.size === before) break;
	}
	return seed;
}

const CANDIDATES = new Set(allRel.filter((f) => !FORK.has(f) && !isTest(f)));
const dynRefs = new Map();
for (const f of CANDIDATES) {
	const refs = dynamicRefsOf(f);
	if (refs.length) dynRefs.set(f, refs);
}
const ALIVE = expand(new Set([...FORK, ...allRel.filter(isTest), ...dynRefs.keys()]));
const dead = [...CANDIDATES].filter((f) => !ALIVE.has(f)).sort();
const held = [...CANDIDATES].filter((f) => !dead.includes(f)).sort();

// --list-dead: print the unreachable non-test files, one per line, so a deletion can
// be prepared and reviewed as an explicit list rather than a count. "0 importers" is
// a claim that needs evidence, and the evidence is the list.
if (process.argv.includes("--list-dead")) {
	for (const f of dead) console.log(f);
	if (held.length) {
		console.error(`\nHELD BACK - still named by something alive: ${held.length}`);
		for (const f of held) {
			const who = [...(importersOf.get(f) ?? [])].find((i) => isTest(i) || FORK.has(i));
			console.error(`  ${f}\n      ${dynRefs.has(f) ? `[dynamic] ${dynRefs.get(f)[0]}` : `[imported] ${who}`}`);
		}
	}
	const byDir = new Map();
	for (const f of dead) {
		const d = path.posix.dirname(f);
		byDir.set(d, (byDir.get(d) ?? 0) + 1);
	}
	console.error(`\n${dead.length} files, ${lineCount(dead)} lines`);
	for (const [d, n] of [...byDir].sort((a, b) => b[1] - a[1])) {
		console.error(`${String(n).padStart(4)}  ${d}`);
	}
	// Exit here: otherwise the summary report below lands in the same stdout stream and
	// a caller redirecting to a file gets the report mixed into the file list.
	process.exit(0);
}

if (process.argv.includes("--json")) {
	console.log(JSON.stringify({ forkEntries: FORK_ENTRIES, totalForkLines, totalLegacyLines, rows }, null, 2));
} else {
	const pad = (s, n) => String(s).padEnd(n);
	console.log("G0.1 importer graph");
	console.log(`lane computed by reachability from: ${FORK_ENTRIES.join(", ")}`);
	console.log(`src/ = ${totalForkLines} fork lines + ${totalLegacyLines} not-reachable-from-fork lines\n`);
	console.log(pad("SUBJECT", 42) + pad("FILES", 7) + pad("LINES", 8) + pad("DEL", 5) + pad("KEEP", 6) + "VERDICT");
	console.log("-".repeat(104));
	for (const r of rows) {
		if (r.missing) { console.log(pad(r.subject, 42) + "PATH NOT FOUND"); continue; }
		console.log(
			pad(r.subject, 42) + pad(r.files, 7) + pad(r.lines, 8) + pad(r.deletableFiles, 5) +
			pad(r.keptFiles, 6) + r.verdict,
		);
		for (const i of r.forkImporters) console.log(" ".repeat(68) + "fork-> " + i);
	}
	const del = rows.filter((r) => r.verdict === "DELETABLE-WITH-DynamicChart");
	console.log(`\nfully deletable once DynamicChart goes: ${del.length} subject(s), ${del.reduce((n, r) => n + r.lines, 0)} lines`);
	console.log(`src/ totals: ${totalForkLines} reachable from fork, ${totalLegacyLines} not reachable`);

/**
 * Simulation: what actually falls out when the legacy lane is switched off the
 * way G4 would do it - drop the DynamicChart re-export from the public barrel
 * and delete DynamicChart itself. This is the number the plan needs, and it is
 * much smaller than the plan assumed, because the barrel is what keeps the lane
 * reachable in the first place.
 */
const BARREL = "src/lib/core/index.ts";
if (fs.existsSync(path.join(ROOT, BARREL))) {
	const barrelText = fs.readFileSync(path.join(ROOT, BARREL), "utf8");
	const keptSpecs = new Set();
	for (const m of barrelText.matchAll(/export\s*\{[^}]*\}\s*from\s*["']([^"']+)["']/g)) {
		const exported = m[0].match(/export\s*\{([^}]*)\}/)[1];
		const names = exported.split(",").map((n) => n.trim().split(/\s+as\s+/).pop()).filter(Boolean);
		const spec = m[1];
		// A barrel line that only re-exports legacy components goes away with G4.
		if (/DynamicChart|ChartCanvas|GenericChartComponent|GenericComponent|PaneTooltip|PaneLabel|PaneHeader|SeriesPicker|IndicatorLegend/i.test(exported)) continue;
		for (const n of names) keptSpecs.add(`${n} ${spec}`);
	}
	// Rebuild the barrel with only its surviving re-exports, then re-close.
	const pruned = barrelText
		.split(/\r?\n/)
		.filter((line) => !/DynamicChart|ChartCanvas|GenericChartComponent|GenericComponent|PaneTooltip|PaneLabel|PaneHeader|SeriesPicker|IndicatorLegend/.test(line) || !/export\s*\{/.test(line))
		.join("\n");
	imports.set(BARREL, new Set([...pruned.matchAll(/(?:^|\n)\s*(?:import|export)[\s\S]*?from\s*["']([^"']+)["']/g)].map((m) => m[1])));
	imports.delete(LEGACY_ROOT);
	const AFTER = reachable(FORK_ENTRIES);
	const orphans = [...FORK].filter((f) => !AFTER.has(f) && !isTest(f));
	const orphanLines = lineCount(orphans);
	const byDir = new Map();
	for (const f of orphans) {
		const d = path.posix.dirname(f);
		byDir.set(d, (byDir.get(d) ?? 0) + 1);
	}
	console.log(`\nSIMULATION - drop legacy re-exports from ${BARREL} + delete DynamicChart:`);
	console.log(`  modules that become unreferenced from the fork: ${orphans.length} files, ${orphanLines} lines`);
	for (const [d, n] of [...byDir].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`    ${String(n).padStart(3)}  ${d}`);
	const alreadyDead = allRel.filter((f) => !FORK.has(f) && !isTest(f));
	console.log(`\n  already unreferenced today, deletable with no other change: ${alreadyDead.length} files, ${lineCount(alreadyDead)} lines`);
	const deadByDir = new Map();
	for (const f of alreadyDead) {
		const d = path.posix.dirname(f);
		deadByDir.set(d, (deadByDir.get(d) ?? 0) + 1);
	}
	for (const [d, n] of [...deadByDir].sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`    ${String(n).padStart(3)}  ${d}`);
}
}