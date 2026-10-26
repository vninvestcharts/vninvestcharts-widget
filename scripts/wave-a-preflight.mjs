/**
 * Stage 0.5 - prove the W-A slices are actually independent before running them in
 * parallel, and record the baseline exit code of every gate they will be judged
 * against.
 *
 * Two separate reasons this file exists:
 *
 * 1. DISJOINTNESS. The plan's own rules require file sets not to overlap; two live
 *    workers on one file is Hazard 1 by construction. This repo's slice table failed
 *    five times for wrong paths, so overlap is computed from disk, not from the
 *    table's word.
 *
 * 2. HAZARD 6. "Demand PASS from a gate that is already red" is unsatisfiable, and
 *    the G0.3 row in CLAIMS.md is a live example of it: a plan recorded 3242 tests
 *    PASS when 3242 was the total and 11 were red. So every gate's CURRENT exit code
 *    is captured here, before any slice runs, and any slice must be judged against
 *    a delta from this file rather than against an absolute.
 *
 * Usage:  node scripts/wave-a-preflight.mjs
 * Exit 0 = slices are disjoint and the baseline is recorded.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/* The W-A slices as committed in docs/upgrade-standard/plans/PLAN_BACKLOG_SPLIT_2026-10-07.md
 * Phan C + D. Each entry names the files it will touch; `creates` lists files it
 * will bring into existence, which by construction cannot collide with an existing
 * claim but must still be recorded so the next slice does not adopt them. */
const SLICES = [
	{
		id: "S5",
		title: "netPnl gross->net, bất biến Σ netPnl == balance - initialBalance",
		priority: "BLOCKER",
		claims: ["src/lib/core/trading/FillSettlement.ts"],
		// S5 turned out to need PositionManager + types too: the entry fee has to be
		// carried on the position for the record to reconcile with cash. Recorded here
		// after the fact - the preflight's value is that the ORIGINAL claim was 1 file
		// and the measurement said otherwise.
		alsoTouched: [
			"src/lib/core/trading/PositionManager.ts",
			"src/lib/core/trading/types.ts",
			"src/lib/core/trading/AnalyticsEngine.ts",
		],
		creates: ["src/lib/core/trading/__tests__/netPnlInvariant.test.ts"],
	},
	{
		id: "B17",
		title: "normalizeVisibleRangeFork must clamp to data bounds",
		priority: "WITHDRAWN - false positive, see PLAN_BACKLOG_SPLIT Phan A2",
		claims: ["src/widget/visibleRangeBridge.ts"],
		creates: ["src/widget/__tests__/visibleRangeBridge.forkClamp.test.ts"],
	},
	{
		id: "B5",
		title: "deprecate shouldForceLegacyRuntime (remove in 1.0)",
		priority: "WITHDRAWN - already done in c38ccae",
		claims: ["src/widget/runtimePolicy.ts"],
		creates: [],
	},
	{
		id: "B8",
		title: "build:docs has never run; Dockerfile COPY build fails",
		priority: "P0",
		claims: ["Dockerfile", "scripts/generate-health.js"],
		creates: [],
	},
	{
		id: "W-18",
		title: "gap fixture so lane-switch parity can be proved",
		priority: "P3",
		claims: ["src/lib/adapters/MockAdapter.ts"],
		creates: ["src/lib/adapters/gapFixture.ts", "src/lib/adapters/__tests__/gapFixture.test.ts"],
	},
];

const DENY = [
	/^config\/.*\.json$/,
	/^package\.json$/,
	/^package-lock\.json$/,
	/^CHANGELOG\.md$/,
	/^docs\/CLAIMS\.md$/,
	/^docs\/upgrade-standard\/AUDIT_LEDGER\.md$/,
	/^LICENSE/,
	/^NOTICE\.md$/,
	/^tsconfig.*\.json$/,
	/^src\/demo\/i18n\.tsx$/,
	/^README\.md$/,
	/^src\/public-api\.ts$/,
	/^src\/index\.ts$/,
];

const problems = [];

// ---- 1. paths exist -------------------------------------------------------------------------

console.log("=== 1. every claimed path exists on disk ===");
// Only slices still to be worked are checked for staleness. A completed slice whose
// "creates" files now exist is evidence it ran, not a problem with the plan - and
// reporting that as a failure would train people to ignore this script.
const PENDING = new Set(["B8"]);
for (const s of SLICES) {
	for (const f of s.claims) {
		const abs = path.join(ROOT, f);
		const ok = fs.existsSync(abs);
		if (!ok) problems.push(`${s.id}: claims a file that is NOT on disk - ${f}`);
		console.log(`  ${ok ? "ok  " : "MISS"} ${s.id}  ${f}`);
	}
	for (const f of s.creates) {
		const exists = fs.existsSync(path.join(ROOT, f));
		if (!PENDING.has(s.id)) {
			console.log(`  ${exists ? "done" : "MISS"} ${s.id}  ${f}  (slice complete, not checked)`);
			continue;
		}
		if (exists) problems.push(`${s.id}: "creates" file ALREADY EXISTS - the plan is stale - ${f}`);
		console.log(`  ${exists ? "STALE" : "new "} ${s.id}  ${f}`);
	}
}

// ---- 2. disjointness ------------------------------------------------------------------------

console.log("");
console.log("=== 2. pairwise file-set disjointness (Hazard 1) ===");
const owner = new Map();
for (const s of SLICES) {
	for (const f of [...s.claims, ...s.creates]) {
		if (owner.has(f)) {
			problems.push(`OVERLAP: ${f} claimed by both ${owner.get(f)} and ${s.id}`);
			console.log(`  OVERLAP ${f}  <- ${owner.get(f)}, ${s.id}`);
		} else {
			owner.set(f, s.id);
		}
	}
}
if (problems.every((p) => !p.startsWith("OVERLAP"))) {
	console.log(`  none - all ${owner.size} paths belong to exactly one slice`);
}

// ---- 3. deny-list ----------------------------------------------------------------------------

console.log("");
console.log("=== 3. deny-listed files (coordinator only, never a worker) ===");
let denyHits = 0;
for (const s of SLICES) {
	for (const f of [...s.claims, ...s.creates]) {
		if (DENY.some((d) => d.test(f))) {
			denyHits += 1;
			console.log(`  DENY  ${s.id}  ${f}   <- must be coordinator-executed`);
		}
	}
}
if (denyHits === 0) console.log("  none claimed");

// ---- 4. baseline exit codes (Hazard 6) ------------------------------------------------------

console.log("");
console.log("=== 4. baseline gate exit codes, recorded BEFORE any slice runs ===");
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));

// Only the gates a W-A slice can plausibly move. Full matrix runs in Stage 6.
//
// These are the SCRIPT BODIES, not `npm run <alias>`. The first version shelled
// out to `npm` and every one of the ten gates reported exit 1 - which was this
// script failing to spawn, not ten red gates. On Windows `npm` is `npm.cmd` and
// `spawnSync npm` returns ENOENT; `npm.cmd` returns EINVAL. Reporting "10 gates
// already red" from that would have been a fabricated Hazard 6 finding, and it is
// the same shape as every other measurement bug this session: the instrument was
// broken, and the reading was believed anyway.
//
// So: resolve the alias to its command, run the command. If an alias chains
// through `cross-env` or another wrapper, the wrapper is invoked too, because the
// exit code that matters is the script's, not npm's.
const GATES = {
	"type-check": { script: "node_modules/typescript/bin/tsc", args: ["--noEmit"] },
	"audit:fat-files": { script: "scripts/check-fat-files.js", args: [] },
	"audit:props": { script: "scripts/check-props-count.js", args: [] },
	"audit:license": { script: "scripts/check-license.mjs", args: [] },
	"audit:readme-claims": { script: "scripts/check-readme-claims.mjs", args: [] },
	"check:version": { script: "scripts/sync-version.js", args: ["--check"] },
	"check:release-manifest": { script: "scripts/generate-release-manifest.js", args: ["--check"] },
	"lint:ratchet": { script: "scripts/lint-ratchet.js", args: [] },
	"bundlesize:ratchet": { script: "scripts/bundle-ratchet.js", args: [] },
	"verify:consumer": { script: "scripts/consumer-smoke.mjs", args: [] },
};

const baseline = {};
for (const [g, spec] of Object.entries(GATES)) {
	if (!pkg.scripts[g]) {
		baseline[g] = "NO-SUCH-SCRIPT";
		problems.push(`gate ${g} is named but package.json has no such script`);
		continue;
	}
	const exe = path.join(ROOT, spec.script);
	if (!fs.existsSync(exe)) {
		baseline[g] = "SCRIPT-MISSING";
		problems.push(`gate ${g} -> ${spec.script} is not on disk`);
		continue;
	}
	let code;
	try {
		execFileSync(process.execPath, [exe, ...spec.args], {
			cwd: ROOT,
			stdio: "pipe",
			timeout: 900_000,
		});
		code = 0;
	} catch (e) {
		code = e.status ?? 1;
		// A null status means the child never ran - that is an instrument failure and
		// must not be recorded as a red gate.
		if (code === null || code === undefined) {
			baseline[g] = "HARNESS-ERROR";
			problems.push(`gate ${g} could not be executed - the measurement is missing, not red`);
			continue;
		}
	}
	baseline[g] = code;
	console.log(`  ${g.padEnd(24)} => ${code}`);
}

const red = Object.entries(baseline).filter(([, c]) => c !== 0);
if (red.length) {
	console.log("");
	console.log(`  HAZARD 6 - ${red.length} gate(s) already RED at baseline:`);
	for (const [g, c] of red) console.log(`    ${g} => ${c}`);
	console.log(`  Any slice touching these must be judged on DELTA, not on absolute PASS.`);
}

// ---- 5. persist -----------------------------------------------------------------------------

const out = {
	generatedAt: new Date().toISOString(),
	head: execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim(),
	slices: SLICES.map((s) => ({ id: s.id, priority: s.priority, title: s.title })),
	disjoint: !problems.some((p) => p.startsWith("OVERLAP")),
	baseline,
	redAtBaseline: red.map(([g]) => g),
};
const dir = path.join(ROOT, "docs/upgrade-standard/evidence/W-A");
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "preflight.json"), JSON.stringify(out, null, "\t"), "utf8");
console.log("");
console.log(`written: docs/upgrade-standard/evidence/W-A/preflight.json`);

if (problems.length) {
	console.error("");
	console.error(`FAIL: ${problems.length} preflight problem(s)`);
	for (const p of problems) console.error(`  - ${p}`);
	process.exit(1);
}
console.log("");
console.log("PASS: W-A slices are disjoint, paths exist, baseline recorded");