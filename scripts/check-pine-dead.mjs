#!/usr/bin/env node
/**
 * check-pine-dead — Phase 0 gate for PRO-EXTRACT-2026-10-15.
 *
 * WHY THIS EXISTS
 * ---------------
 * `src/lib/pinescript/pineStrategy.ts` and `pineStrategyTypes.ts` are the Pine Stage 5.1
 * `strategy.*` evaluator. They are deliberately KEPT in the repo: the PM decision (2026-10-15)
 * is to WIRE `runStrategy` into the Strategy Tester during Phase 2, not to delete it.
 *
 * Dead code that is intentionally kept needs a mechanical guard, otherwise Phase 2 has to
 * re-derive the fact and — far worse — a stray import silently ships a second strategy engine
 * into the Pro bundle.
 *
 * WHAT IT CHECKS (and why not something simpler)
 * ----------------------------------------------
 * The obvious invariant ("no file imports them") is WRONG here: `pineStrategyTypes.ts` is
 * legitimately imported by `pineStrategy.ts` (`:57`, `:66`, `:76-77`). What actually matters is
 * ENTRY REACHABILITY — neither module may be pulled into any shipped graph. So this gate walks
 * FORWARD from the build entry points and fails if either target is reachable.
 *
 * Edge detection uses the same `IMPORT_RE` shape as `scripts/import-graph.mjs:41` (static AND
 * dynamic edges), so this gate and the existing graph tool cannot disagree about what counts as
 * an edge.
 *
 * Test classification is explicit, no guessing:
 *   test  ⇔  basename matches /\.(test|spec)\.[cm]?[jt]sx?$/  OR  a `__tests__` / `__mocks__`
 *              path segment. Test files are real edges too, which is exactly why the guard is
 *              stated over the shipped graph rather than over the source tree.
 *
 * EXIT CODES
 * ----------
 *   0  not reachable from any entry  (expected state)
 *   1  reachable ⇒ intentionally-dead code is now shipping  (the regression to catch)
 *   2  usage / self-test misuse
 *
 * SELF-TEST
 * ---------
 * `--self-test` builds throwaway fixtures on disk and proves both directions: reachable ⇒ red,
 * unreachable ⇒ green. This is the fail-before proof required by lesson L-E01 — an assertion
 * that cannot go red is vacuous.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
const { publishedEntries } = require_("./build-entries.cjs");

const ROOT = path.resolve(import.meta.dirname, "..");

/**
 * Behaviourally identical to scripts/import-graph.mjs:41 (static + dynamic edges).
 *
 * The negated class MUST be `[^'"]`. Writing `[^'']` silently breaks the gate: the capture can
 * then consume a double quote, so in a file with two imports
 *   `import … from "d3-format";`  `import … from "./compile";`
 * the first match runs greedily across BOTH statements and yields the bogus specifier
 * `d3-format";\n\nimport { compile } from `, which fails the `startsWith(".")` filter and —
 * far worse — leaves `lastIndex` past every real specifier that followed. The gate then reports
 * "0 importers" for a file that plainly has some. Found by the fail-before mutation on
 * 2026-10-15; `--self-test` did NOT catch it at first because every fixture had one import, so
 * two multi-import regressions now exist in the self-test below.
 */
const IMPORT_RE = /(?:^|[\s;{}()])(?:import|export)\s+(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;

/** The modules that must stay out of every shipped graph. */
const TARGETS = ["src/lib/pinescript/pineStrategy.ts", "src/lib/pinescript/pineStrategyTypes.ts"];

/**
 * Roots of the shipped graphs. Verified on disk 2026-10-15 — note the demo entry is
 * `index.tsx`, not `index.ts`; guessing `.ts` made this gate fail with MISSING_ENTRY, which is
 * the gate correctly refusing to run on a graph it could not see.
 */
const ENTRIES = [
	// Published entries are derived from the build config, never hand-written. This list used to
	// name `src/index.ts` as "package exports -> dist/index.js", which is false: `dist/index.*` is
	// built from `src/public-api.ts` (build-esm-cjs.js:130,:174). Rooting the traversal at a file
	// that is never shipped made this gate measure the wrong graph while still printing PASS.
	...publishedEntries().map((e) => e.source),
	"src/demo/index.tsx", // demo app (npm run watch) — config/webpack.config.js, not a tsup bundle
];

const SCAN_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".cjs", ".mjs"]);
const SKIP_DIR = new Set(["node_modules", ".git", "dist", "build", "coverage", ".next"]);

function isTestPath(rel) {
	if (/(^|\/)(__tests__|__mocks__)(\/|$)/.test(rel)) return true;
	return /\.(test|spec)\.[cm]?[jt]sx?$/.test(rel);
}

function walk(dir, acc) {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (entry.isDirectory()) {
			if (SKIP_DIR.has(entry.name)) continue;
			walk(path.join(dir, entry.name), acc);
		} else if (SCAN_EXT.has(path.extname(entry.name))) {
			acc.push(path.join(dir, entry.name));
		}
	}
	return acc;
}

function resolveSpec(fromFile, spec) {
	if (!spec.startsWith(".")) return null;
	const base = path.resolve(path.dirname(fromFile), spec);
	for (const cand of [base, base + ".ts", base + ".tsx", base + ".js", base + ".jsx", base + ".mjs", path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
		if (fs.existsSync(cand) && fs.statSync(cand).isFile()) return cand;
	}
	return null;
}

/** file(rel) -> Set(dep rel paths), following static and dynamic edges. */
function buildGraph(rootDir, files) {
	const deps = new Map();
	const rel = (f) => path.relative(rootDir, f).split(path.sep).join("/");

	for (const file of files) {
		const src = fs.readFileSync(file, "utf8");
		const stripped = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
		const out = new Set();
		IMPORT_RE.lastIndex = 0;
		let m;
		while ((m = IMPORT_RE.exec(stripped)) !== null) {
			const target = resolveSpec(file, m[1] ?? m[2]);
			if (target) out.add(rel(target));
		}
		deps.set(rel(file), out);
	}
	return deps;
}

/** Every file reachable by following edges FORWARD from `roots`. */
function reachableFrom(deps, roots) {
	const seen = new Set();
	const queue = [...roots];
	while (queue.length) {
		const cur = queue.pop();
		if (seen.has(cur)) continue;
		seen.add(cur);
		for (const dep of deps.get(cur) ?? []) queue.push(dep);
	}
	return seen;
}

/** First entry path that reaches `target`, or null. */
function pathFrom(deps, entries, target) {
	const prev = new Map();
	const seen = new Set();
	const queue = [...entries];
	for (const e of entries) seen.add(e);
	while (queue.length) {
		const cur = queue.pop();
		if (cur === target) {
			const chain = [cur];
			let c = cur;
			while (prev.has(c)) {
				c = prev.get(c);
				chain.unshift(c);
			}
			return chain;
		}
		for (const dep of deps.get(cur) ?? []) {
			if (seen.has(dep)) continue;
			seen.add(dep);
			prev.set(dep, cur);
			queue.push(dep);
		}
	}
	return null;
}

function check(rootDir) {
	const files = walk(rootDir, []);
	const deps = buildGraph(rootDir, files);

	const missing = ENTRIES.filter((e) => !fs.existsSync(path.join(rootDir, e)));
	if (missing.length > 0) {
		return { violations: [{ target: ENTRIES.join(","), reason: "MISSING_ENTRY", detail: missing.join(", ") }], scanned: files.length };
	}

	const reachable = reachableFrom(deps, ENTRIES);
	const violations = [];
	for (const target of TARGETS) {
		if (!fs.existsSync(path.join(rootDir, target))) {
			violations.push({ target, reason: "MISSING_TARGET", detail: "target file does not exist" });
			continue;
		}
		if (reachable.has(target)) {
			const chain = pathFrom(deps, ENTRIES, target);
			violations.push({ target, reason: "REACHABLE_FROM_ENTRY", detail: chain ? chain.join(" → ") : "reachable" });
		}
	}
	return { violations, scanned: files.length };
}

function selfTest() {
	let passed = 0;
	let total = 0;
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "check-pine-dead-"));
	try {
		const write = (rel, body) => {
			const p = path.join(dir, rel);
			fs.mkdirSync(path.dirname(p), { recursive: true });
			fs.writeFileSync(p, body, "utf8");
		};
		const ok = (cond, msg) => {
			total++;
			if (cond) passed++;
			else console.log(`  [FAIL] ${msg}`);
		};

		write("src/entry.ts", 'import { dead } from "./dead";\nexport const e = dead;\n');
		write("src/dead.ts", "export const dead = 1;\n");
		write("src/orphan.ts", 'import { dead2 } from "./dead2";\nexport const o = dead2;\n');
		write("src/dead2.ts", "export const dead2 = 2;\n");
		write("src/c.ts", "export const c = 3;\n");

		// 1. GREEN — a module nothing reaches stays out.
		const g = reachableFrom(buildGraph(dir, walk(dir, [])), ["src/entry.ts"]);
		ok(g.has("src/dead.ts"), "entry-reachable module must be found");
		ok(!g.has("src/dead2.ts"), "orphan module must NOT be reported reachable");
		ok(!g.has("src/orphan.ts"), "orphan importer must NOT be reported reachable");

		// 2. RED — wire the orphan in and it must become reachable.
		write("src/entry2.ts", 'import { dead2 } from "./dead2";\nexport const e2 = dead2;\n');
		const r = reachableFrom(buildGraph(dir, walk(dir, [])), ["src/entry2.ts"]);
		ok(r.has("src/dead2.ts"), "wired-in orphan MUST become reachable (red state is real)");

		// 3. Transitivity.
		write("src/mid.ts", 'import { deep } from "./deep";\nexport const mid = deep;\n');
		write("src/deep.ts", "export const deep = 4;\n");
		const t = reachableFrom(buildGraph(dir, walk(dir, [])), ["src/entry2.ts"]);
		write("src/entry3.ts", 'import { mid } from "./mid";\nexport const e3 = mid;\n');
		const t3 = reachableFrom(buildGraph(dir, walk(dir, [])), ["src/entry3.ts"]);
		ok(t3.has("src/deep.ts"), "transitive reach must be followed");

		// 4. Dynamic import() is an edge.
		write("src/dyn.ts", 'const p = import("./c");\nexport const d = p;\n');
		const dr = reachableFrom(buildGraph(dir, walk(dir, [])), ["src/dyn.ts"]);
		ok(dr.has("src/c.ts"), "dynamic import() must count as an edge");

		// 5. Comments are not edges.
		write("src/cmt.ts", '// import { c } from "./c";\n/* import { c } from "./c"; */\nexport const cm = 5;\n');
		const cr = reachableFrom(buildGraph(dir, walk(dir, [])), ["src/cmt.ts"]);
		ok(!cr.has("src/c.ts"), "commented-out import must NOT be an edge");

		// 6. REGRESSION (2026-10-15): several imports in one file. The original `[^'']` class
		//    swallowed the closing quote and matched greedily across statements, so the second
		//    and later specifiers were never seen.
		write("src/multi.ts", 'import { one } from "./c";\nimport { two } from "pkg";\nexport const m = [one, two];\n');
		const mr = reachableFrom(buildGraph(dir, walk(dir, [])), ["src/multi.ts"]);
		ok(mr.has("src/c.ts"), "multi-import file: first specifier found");

		write("src/multi2.ts", 'import { one } from "d3-format";\nimport { two } from "./c";\nexport const m2 = [one, two];\n');
		const mr2 = reachableFrom(buildGraph(dir, walk(dir, [])), ["src/multi2.ts"]);
		ok(mr2.has("src/c.ts"), "multi-import file: bare specifier must not eat the next statement");

		// 7. pathFrom must name the entry.
		const chain = pathFrom(buildGraph(dir, walk(dir, [])), ["src/entry.ts"], "src/dead.ts");
		ok(Array.isArray(chain) && chain[0] === "src/entry.ts" && chain.includes("src/dead.ts"), "pathFrom must start at an entry");

		// 8. isTestPath classification.
		ok(isTestPath("src/__tests__/a.ts"), "__tests__ is a test path");
		ok(isTestPath("src/a.test.tsx"), ".test.tsx is a test path");
		ok(!isTestPath("src/a.tsx"), "plain source is not a test path");

		console.log(`Self-test: ${passed}/${total} DETECTED & PASSED.`);
		process.exitCode = passed === total ? 0 : 1;
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
}

if (process.argv.includes("--self-test")) {
	selfTest();
} else if (process.argv.includes("--help") || process.argv.length <= 1) {
	console.log("usage: node scripts/check-pine-dead.mjs [--self-test]");
	process.exitCode = 2;
} else {
	const { violations, scanned } = check(ROOT);
	console.log(`check-pine-dead: scanned ${scanned} file(s), ${ENTRIES.length} entry point(s).`);
	if (violations.length === 0) {
		console.log(`PASS: ${TARGETS.length} intentionally-dead module(s) are NOT reachable from any entry (will be wired in Phase 2).`);
		process.exitCode = 0;
	} else {
		console.error("check-pine-dead FAIL:");
		for (const v of violations) console.error(`  * ${v.target}: ${v.reason} — ${v.detail}`);
		process.exitCode = 1;
	}
}