#!/usr/bin/env node
// Agent supervisor: stall detection + salvage reporting.
//
// WHY THIS EXISTS
// Agents in this repo failed three ways that instruction alone did not prevent:
//   1. one wrote 40+ scratch debug files and never committed anything
//   2. one wrote a 56-line-gutted file straight into the MAIN checkout
//   3. several were killed by model quota with work uncommitted
// The skill's own lesson applies: rules alone prevented none of them, only a
// gate that exits non-zero did. This script is the gate.
//
// Usage:
//   node scripts/agent-supervisor.cjs --worktree <path> --agent <name> [--status]
//   node scripts/agent-supervisor.cjs --self-test
//
// Default is READ-ONLY reporting. It never deletes. `--execute` only kills
// processes belonging to that worktree, and refuses on a dirty main checkout.

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

// Blocklists miss. This one did: 8 `__audit_probe_*` files, then 11 more under names
// like `__s6_envprobe` and `vitest.s6probe2.config.ts`, and no pattern caught them.
// So scratch detection is ALSO allowlist-based and default-deny: an untracked file that
// is not under a source root, or a test, or a config the repo actually tracks, is
// scratch by definition. New scratch names cannot slip past without editing this file,
// which is a reviewable act.
const ALLOWED_UNTRACKED = [
	/^src\//,
	/^scripts\/[a-z0-9-]+\.(cjs|mjs|js|ts)$/,
	/^docs\//,
	/^tests?\//,
	// EXACT filenames, not prefixes. A prefix like `vitest\.[\w.]+` accepted
	// `vitest.s6probe2.config.ts`, which is exactly the scratch it was meant to catch.
	/^(package|package-lock)\.json$/,
	/^tsconfig(\.engine-paths)?\.json$/,
	/^(vite|vitest|jest)\.config\.[cm]?[jt]s$/,
	/^config\//,
	/^public\//,
	/\.test\.[cm]?[jt]sx?$/,
];

/**
 * Default-deny. The allowlist is the ONLY thing that decides; `SCRATCH_PATTERNS` exists
 * purely so a hit can be labelled in the report, and is deliberately not OR-ed in here.
 * An earlier version had `|| SCRATCH_PATTERNS.every(...)` as a third clause, which
 * quietly turned the whole allowlist back into a blocklist — exactly the bug this was
 * written to remove, reintroduced one line away.
 */
function looksLikeRealWork(file) {
	const rel = file.split(path.sep).join("/");
	if (ALLOWED_UNTRACKED.some((re) => re.test(rel))) return true;
	return /\.(test|spec)\.[cm]?[jt]sx?$/.test(rel);
}

const SCRATCH_PATTERNS = [
	/^tmp-/i,
	/-debug\d*\.cjs$/i,
	/^g\d+-/i,
	/^probe\d*\./i,
	/\.bak$/i,
	/-cases\.json$/i,
	/^debug\.cjs$/i,
	/\.tmp\./i,
	/-self-test-tmp/i,
	// Added after a real miss: an agent wrote eight `__audit_probe_*` files into the MAIN
	// checkout, and the gate stayed silent because neither the worktree check nor the
	// pattern list covered that name or that location.
	/^__.*probe/i,
	/^__audit/i,
	/^scratch[-_]/i,
	/^thru[0-9]/i,
];

function sh(cmd, args, cwd) {
	try {
		return execFileSync(cmd, args, { cwd, encoding: "utf8", timeout: 30000, stdio: ["ignore", "pipe", "pipe"] });
	} catch (e) {
		return (e.stdout || "") + (e.stderr || "");
	}
}

function porcelain(root, args) {
	// `.trim()` here used to strip git's status COLUMN, so ` M config/x` became
	// `M config/x` and slicing 3 chars off the front ate the first letter of the path.
	// Strip only the line ending; the two leading status columns are load-bearing.
	return sh("git", ["-C", root, ...args], root)
		.split("\n")
		.map((l) => l.replace(/[\r\n]+$/, ""))
		.filter((l) => l.length > 0);
}

/** A commit count of 0 with a dirty tree is the exact "killed mid-run" shape. */
function inspect(worktree, agent, mainRoot) {
	const untracked = porcelain(worktree, ["status", "--porcelain"])
		.filter((l) => l.startsWith("??"))
		.map((l) => l.slice(3));

	const scratch = untracked.filter((f) => SCRATCH_PATTERNS.some((re) => re.test(path.basename(f))));
	const realWork = untracked.filter((f) => !SCRATCH_PATTERNS.some((re) => re.test(path.basename(f))));

	const modified = porcelain(worktree, ["status", "--porcelain"]).filter((l) => !l.startsWith("??"));
	const commits = porcelain(worktree, ["log", "--oneline", "dev..HEAD"]).length;
	const lastCommitAt = fs.existsSync(path.join(worktree, ".git"))
		? sh("git", ["-C", worktree, "log", "-1", "--format=%ct"], worktree).trim()
		: "";

	// The main checkout is the thing isolation is supposed to protect, so it gets its
	// own check rather than being assumed clean. It cannot be derived from the worktree
	// path — the worktree lives in a temp dir and the main checkout does not — so it is
	// passed in explicitly. `generated` is excluded: the pretype-check hook rewrites it
	// on every run, in every worktree, by design.
	let mainScratch = [];
	let mainTrackedDirty = [];
	if (mainRoot && fs.existsSync(mainRoot)) {
		const GENERATED = /tsconfig\.engine-paths\.json$/;
		for (const line of porcelain(mainRoot, ["status", "--porcelain"])) {
			const rel = line.slice(3).trim();
			if (GENERATED.test(rel)) continue;
			if (line.startsWith("??")) {
				if (!looksLikeRealWork(rel)) mainScratch.push(rel);
			} else {
				mainTrackedDirty.push(rel);
			}
		}
	}

	return { agent, worktree, untracked, scratch, realWork, modified, commits, lastCommitAt, mainScratch, mainTrackedDirty };
}

function report(s) {
	const findings = [];
	if (s.commits === 0 && (s.modified.length > 0 || s.realWork.length > 0)) {
		findings.push({
			level: "blocker",
			code: "UNCOMMITTED_WORK",
			why: "modified or new files with zero commits — this is what a cancelled agent leaves behind",
			salvage: s.realWork,
		});
	}
	if (s.scratch.length > 3) {
		findings.push({
			level: "blocker",
			code: "SCRATCH_EXPLOSION",
			why: `${s.scratch.length} scratch/debug files untracked — the pattern that preceded an agent looping`,
			salvage: [],
			noise: s.scratch,
		});
	}
	if (s.modified.length === 0 && s.realWork.length === 0 && s.commits > 0) {
		findings.push({ level: "ok", code: "CLEAN", why: "committed, nothing outstanding" });
	}
	// The main checkout check exists because the worktree check missed it twice: one
	// agent gutted a file in the main checkout, another left eight probe files in its
	// root. Isolation is only real if somebody looks at the place isolation was meant
	// to keep agents out of.
	if (s.mainScratch && s.mainScratch.length) {
		findings.push({
			level: "blocker",
			code: "MAIN_CHECKOUT_SCRATCH",
			why: `${s.mainScratch.length} scratch file(s) in the MAIN checkout root — agents must not write there at all`,
			salvage: [],
			noise: s.mainScratch,
		});
	}
	if (s.mainTrackedDirty && s.mainTrackedDirty.length) {
		findings.push({
			level: "blocker",
			code: "MAIN_CHECKOUT_DIRTY",
			why: `tracked file(s) modified in the MAIN checkout by this agent: ${s.mainTrackedDirty.join(", ")}`,
			salvage: [],
		});
	}
	return findings;
}

function selfTest() {
	const checks = [];
	const expectFail = (name, fn) => {
		try {
			fn();
			checks.push({ name, ok: false, why: "did NOT fail — the check is vacuous" });
		} catch {
			checks.push({ name, ok: true });
		}
	};
	const assert = (name, fn) => {
		try {
			fn();
			checks.push({ name, ok: true });
		} catch (e) {
			checks.push({ name, ok: false, why: e.message });
		}
	};

	// Each scratch pattern must actually match something that looks like scratch.
	for (const [label, sample] of [
		["tmp-", "tmp-watch.log.err"],
		["numbered debug", "g1-debug12.cjs"],
		["agent-prefixed", "g2-patterns.cjs"],
		["backup", "g1-mut-a.bak"],
		["cases json", "g1-cases.json"],
	]) {
		assert(`pattern catches ${label}`, () => {
			if (!SCRATCH_PATTERNS.some((re) => re.test(sample))) throw new Error(`missed ${sample}`);
		});
	}
	// A real source file must NOT be flagged, or the gate is useless.
	assert("does not flag a real test file", () => {
		if (SCRATCH_PATTERNS.some((re) => re.test("AlertsModal.buildAlert.test.ts"))) throw new Error("false positive");
	});
	assert("does not flag a real source file", () => {
		if (SCRATCH_PATTERNS.some((re) => re.test("patternDetector.ts"))) throw new Error("false positive");
	});
	// The zero-commit-with-dirty-tree shape must be detected.
	assert("detects killed-mid-run shape", () => {
		const fake = { commits: 0, modified: [" M src/a.ts"], realWork: ["src/b.test.ts"], scratch: [] };
		const codes = report(fake).map((f) => f.code);
		if (!codes.includes("UNCOMMITTED_WORK")) throw new Error("missed uncommitted work");
	});
	assert("detects scratch explosion", () => {
		const fake = { commits: 2, modified: [], realWork: [], scratch: ["a", "b", "c", "d", "e"] };
		const codes = report(fake).map((f) => f.code);
		if (!codes.includes("SCRATCH_EXPLOSION")) throw new Error("missed scratch");
	});
	assert("committed work is CLEAN", () => {
		const fake = { commits: 3, modified: [], realWork: [], scratch: [] };
		if (report(fake)[0].code !== "CLEAN") throw new Error("should be clean");
	});
	// `expectFail` needs positive coverage: a violation it must catch. Injected rather
	// than written by hand, because hand-writing it is how the previous version of this
	// file ended up with an inverted check that reported its own helper as vacuous.
	expectFail("expectFail reports an injected violation", () => {
		throw new Error("injected violation");
	});
	// And the inverse: a non-violation must NOT be reported as caught.
	assert("a clean tree is not reported as a violation", () => {
		if (report({ commits: 2, modified: [], realWork: [], scratch: [] })[0].code !== "CLEAN") {
			throw new Error("should be CLEAN");
		}
	});
	assert("a scratch name is flagged, so expectFail above is not the only coverage", () => {
		if (!SCRATCH_PATTERNS.some((re) => re.test("g1-debug12.cjs"))) throw new Error("missed");
	});

	assert("detects scratch in the main checkout", () => {
		const fake = { commits: 1, modified: [], realWork: [], scratch: [], mainScratch: ["__audit_probe_s3.ts"], mainTrackedDirty: [] };
		if (!report(fake).some((f) => f.code === "MAIN_CHECKOUT_SCRATCH")) throw new Error("missed");
	});
	assert("detects a tracked file dirtied in the main checkout", () => {
		const fake = { commits: 1, modified: [], realWork: [], scratch: [], mainScratch: [], mainTrackedDirty: ["src/a.tsx"] };
		if (!report(fake).some((f) => f.code === "MAIN_CHECKOUT_DIRTY")) throw new Error("missed");
	});
	assert("the new patterns catch the real miss", () => {
		if (!SCRATCH_PATTERNS.some((re) => re.test("__audit_probe_s3.ts"))) throw new Error("pattern misses the real file");
	});

	assert("allowlist catches a miss-named scratch file in the root", () => {
		if (looksLikeRealWork("__s6_envprobe.ts")) throw new Error("should be scratch");
	});
	assert("allowlist catches a stray vitest config in the root", () => {
		if (looksLikeRealWork("vitest.s6probe2.config.ts")) throw new Error("should be scratch");
	});
	assert("allowlist still accepts real work", () => {
		if (!looksLikeRealWork("src/widget/foo.test.ts")) throw new Error("false positive");
		if (!looksLikeRealWork("scripts/verify-x.cjs")) throw new Error("false positive");
		if (!looksLikeRealWork("docs/NOTES.md")) throw new Error("false positive");
	});

	const failed = checks.filter((c) => !c.ok);
	for (const c of checks) console.log(`${c.ok ? "PASS" : "FAIL"} ${c.name}${c.why ? ` (${c.why})` : ""}`);
	console.log(`RESULT: ${checks.length - failed.length}/${checks.length} ${failed.length ? "FAIL" : "PASS"}`);
	process.exitCode = failed.length ? 1 : 0;
}

function main() {
	const args = process.argv.slice(2);
	if (args.includes("--self-test")) return selfTest();
	const get = (flag) => {
		const i = args.indexOf(flag);
		return i >= 0 ? args[i + 1] : undefined;
	};
	const worktree = get("--worktree");
	const agent = get("--agent") || path.basename(worktree || "unknown");
	if (!worktree) {
		console.error("usage: agent-supervisor.cjs --worktree <path> --agent <name> [--main <path>] [--execute] | --self-test");
		process.exit(2);
	}
	if (!fs.existsSync(worktree)) {
		console.error(`agent-supervisor: no such worktree ${worktree}`);
		process.exit(2);
	}

	const s = inspect(worktree, agent, get("--main"));
	const findings = report(s);

	console.log(`agent   : ${s.agent}`);
	console.log(`worktree: ${s.worktree}`);
	console.log(`commits : ${s.commits} ahead of dev`);
	console.log(`modified: ${s.modified.length}   untracked real: ${s.realWork.length}   scratch: ${s.scratch.length}`);
	if (s.scratch.length) console.log(`  scratch: ${s.scratch.join(", ")}`);
	if (s.realWork.length) console.log(`  real   : ${s.realWork.join(", ")}`);

	let blocking = 0;
	for (const f of findings) {
		console.log(`  [${f.level.toUpperCase()}] ${f.code}: ${f.why}`);
		if (f.level === "blocker") blocking += 1;
	}
	console.log(blocking ? `VERDICT: NOT CLEAN (${blocking} blocking)` : "VERDICT: CLEAN");

	if (args.includes("--execute") && blocking) {
		// Deliberately conservative: only report what to remove. Deleting a worktree
		// with unmerged work in it is the exact hazard this script exists to prevent.
		console.log("--execute: refusing to delete a worktree with unmerged work. Salvage with: git -C <wt> add -A <paths> && git commit");
	}
	process.exitCode = blocking ? 1 : 0;
}

main();
