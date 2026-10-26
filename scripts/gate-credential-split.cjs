#!/usr/bin/env node
/**
 * GATE — credential split (PLAN_CREDENTIAL_SPLIT_O1_2026-09-26).
 *
 * WHY THIS EXISTS: the source session for the multi-agent-workflow skill had a
 * written protocol that prevented zero of four real failures. The gate script it
 * shipped with was invoked as `node check.mjs | sed` — a pipeline's exit status
 * comes from the LAST command, so the gate printed its failure and let the commit
 * through. Only a gate that exits non-zero is a gate.
 *
 * RULES OBSERVED HERE:
 *  - exit code is the contract (`process.exit(1)`), never a printed message.
 *  - every rule has a NEGATIVE test in `--self-test`; a gate only ever seen
 *    passing is untested.
 *  - `--self-test` must be run BEFORE trusting `--check`.
 *  - shared-file deny list is enforced: a coding agent must not commit them.
 *
 * Usage:
 *   node scripts/gate-credential-split.cjs --check
 *   node scripts/gate-credential-split.cjs --self-test
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..");
const ENGINE_ROOT = path.resolve(REPO_ROOT, "..", "vninvestcharts-engine");

/**
 * The ONLY file permitted to WRITE the credential slots (R1 exemption).
 * Deliberately narrow: after CS-1, `VNInvestClient.setPAT` must DELEGATE to
 * `credentialStore.writePat`. Two writers is how `VNI1_KEY_WIPED_ON_RELOAD` happened.
 *
 * PLAN_AUDIT blocker 4: the previous version of this list named
 * `src/widget/hooks/useWidgetPatCredentials.ts`, a file the plan never creates —
 * a gate that exempts a non-existent path is not enforcing anything.
 */
const SLOT_WRITERS = [
	"src/widget/hooks/credentialStore.ts",
];

/**
 * Files that legitimately reason about credentials and are exempt from R2's
 * "no unguarded auth call" rule because guarding is expected of them.
 */
const CREDENTIAL_AWARE = [
	...SLOT_WRITERS,
	"src/widget/adapters/VNInvestClient.ts",
	"src/lib/adapters/VNStocksAdapter.ts",
];


/** Shared-file deny list — never committed by a coding agent. */
const DENY_LIST = [
	"AGENTS.md",
	"CLAUDE.md",
	"package.json",
	"package-lock.json",
	"config/fat-file-budget.json",
	"docs/upgrade-standard/AUDIT_LEDGER.md",
	"WIDGET_INTEGRATION_GUIDE.md",
	"ci.yml",
	".github/workflows/ci.yml",
];

function readIfExists(abs) {
	try {
		return fs.readFileSync(abs, "utf8");
	} catch {
		return null;
	}
}

/** Recursively collect source files under `rel` (no node_modules/dist). */
function collectFiles(rel) {
	const out = [];
	const root = path.join(REPO_ROOT, rel);
	if (!fs.existsSync(root)) return out;
	const skip = new Set(["node_modules", "dist", ".git", "coverage", "storybook-static"]);
	const walk = (dir) => {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			if (skip.has(entry.name)) continue;
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) walk(full);
			else if (/\.(ts|tsx|js|jsx|cjs|mjs)$/.test(entry.name)) out.push(full);
		}
	};
	walk(root);
	return out;
}

const rel = (abs) => path.relative(REPO_ROOT, abs).split(path.sep).join("/");

/** The gate must never scan itself: it contains every pattern it looks for. */
const GATE_SELF = "scripts/gate-credential-split.cjs";

/**
 * Files a rule may legitimately be applied to.
 * Excluded:
 *  - the gate itself (contains the patterns it hunts for — R3 self-matched this way)
 *  - `*.test.*` / `*.spec.*` / `__tests__/` — tests SEED storage on purpose, and
 *    an assertion string containing `auth/me` is not a call site
 *  - the runtime-proof harness, whose whole job is to seed real storage in a browser
 *  - generated output
 * A gate that cries wolf gets ignored, which is the same as having no gate.
 */
const SCAN_EXCLUDE = [
	GATE_SELF,
	"scripts/verify-license-persist.cjs",
];
const SCANNABLE = (abs) => {
	const r = rel(abs);
	if (SCAN_EXCLUDE.includes(r)) return false;
	if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(r)) return false;
	if (r.includes("/__tests__/")) return false;
	return true;
};

// ---------------------------------------------------------------------------
// Rules. Each returns an array of violation strings (empty = pass).
// ---------------------------------------------------------------------------

/**
 * R1 — No direct writes to the credential slots outside the storage owner.
 * A second writer is how a key gets wiped (failure mode: VNInvestClient
 * constructor migrated `vni_pat` and destroyed a signed license key).
 */
function ruleR1NoDirectSlotWrites(files) {
	const violations = [];
	const writePatterns = [
		/localStorage\.setItem\(\s*["'`]vni_pat["'`]/,
		/localStorage\.setItem\(\s*["'`]vni_license_key["'`]/,
		/localStorage\.removeItem\(\s*["'`]vni_pat["'`]/,
		/localStorage\.removeItem\(\s*["'`]vni_license_key["'`]/,
	];
	for (const file of files) {
		const r = rel(file);
		if (!SCANNABLE(file)) continue;
		if (SLOT_WRITERS.includes(r)) continue;
		const text = readIfExists(file);
		if (text === null) continue;
		text.split(/\r?\n/).forEach((line, i) => {
			if (/^\s*(\/\/|\*|\/\*)/.test(line)) return; // comment line
			for (const p of writePatterns) {
				if (p.test(line)) {
					violations.push(`R1 ${r}:${i + 1} direct credential-slot write outside credentialStore — ${line.trim().slice(0, 90)}`);
				}
			}
		});
	}
	return violations;
}

/**
 * R2 — A signed license blob must never be routed to the server auth endpoint.
 * `vni1.*` is an entitlement artifact, not an account token; `/core/v1/auth/me`
 * 401s it. Routing it there is the exact cause of
 * LICENSE_FIRST_BEATS_BACKEND_2026-09-24.
 *
 * Matches a CALL SITE, not any textual mention: a bare mention in a string
 * (log message, endpoint table entry) is not a violation.
 */
function ruleR2NoBlobToAuthEndpoint(files) {
	const violations = [];
	// Endpoint definition is not a call site.
	const CALLERS = /await\s+[A-Za-z_$.]*validateMe\s*\(|\.validateMe\s*\(\s*\)|fetch\(\s*`?\$\{[^}]*\}\/core\/v1\/auth\/me/;
	for (const file of files) {
		const r = rel(file);
		if (!SCANNABLE(file)) continue;
		if (CREDENTIAL_AWARE.includes(r)) continue;
		const text = readIfExists(file);
		if (text === null) continue;
		if (!CALLERS.test(text)) continue;
		if (/parseLicenseKey|isLicenseKey|isLicenseBlob/.test(text)) continue; // guard present
		const line = text.split(/\r?\n/).find((l) => CALLERS.test(l)) ?? "";
		violations.push(`R2 ${r} calls the auth endpoint with no parseLicenseKey guard — ${line.trim().slice(0, 90)}`);
	}
	return violations;
}

/**
 * R3 — `globalThis.crypto.subtle` absent must be diagnosable, never silent.
 * Without the guard, a plain-http page downgrades to free with no signal
 * (F-04 / E-13 of the audit).
 */
function ruleR3SecureContextDiagnosable(files) {
	const violations = [];
	const has = files.some((f) => SCANNABLE(f) && /isSecureContext|subtleAvailable|subtle-unavailable/.test(readIfExists(f) ?? ""));
	if (!has) {
		violations.push("R3 no scannable file references isSecureContext / subtle-unavailable — silent free-tier downgrade on plain http is back");
	}
	return violations;
}

/**
 * R4 — Engine: tier allowlist must be checked AFTER signature verification.
 * Checking an unverified claim is a no-op; the audit's §2.7 step 5.
 *
 * Scoped to the `verifyLicenseKey` BODY on purpose. A naive whole-file search for
 * `subtle.verify` finds the call inside the `tryVerify` helper, which always sits
 * above the tier check — that is a FALSE PASS, and a false pass is worse than no
 * rule because it reports safety that does not exist.
 */
function ruleR4EngineVerifyOrder() {
	const violations = [];
	const f = path.join(ENGINE_ROOT, "packages/vn-kline-engine-core/src/licenseValidator.ts");
	const text = readIfExists(f);
	if (text === null) return ["R4 cannot read engine licenseValidator.ts — twin-repo Rule 12"];

	const bodyStart = text.indexOf("export async function verifyLicenseKey");
	if (bodyStart === -1) return ["R4 cannot locate `export async function verifyLicenseKey` in engine validator"];
	const body = text.slice(bodyStart);

	const tierAt = body.search(/LICENSE_TIERS\.includes|LICENSE_TIERS\.indexOf/);
	const verifyAt = body.search(/tryVerify\s*\(|subtle\.verify|verifySignature/);
	if (tierAt === -1) {
		violations.push("R4 engine: no LICENSE_TIERS allowlist check found inside verifyLicenseKey");
	} else if (verifyAt === -1) {
		violations.push("R4 engine: no signature verification found inside verifyLicenseKey");
	} else if (tierAt < verifyAt) {
		violations.push(`R4 engine: LICENSE_TIERS checked at body+${tierAt} BEFORE signature verify at body+${verifyAt} (unverified input)`);
	}

	// A signature-length assertion must exist BEFORE the verify call, in the same body.
	if (!/\.length\s*(===|!==|==|>=|<=|>|<)\s*(\d{2,3})/.test(body.slice(0, verifyAt === -1 ? body.length : verifyAt))) {
		violations.push("R4 engine: no signature length assertion before verify (E-01 DER/P1363 class bug can regress silently)");
	}
	return violations;
}

/**
 * R5 — Issuance must sign IEEE-P1363 (64 raw bytes), not DER.
 * `issue-license.js` was still emitting DER while the validator had to guess.
 */
function ruleR5P1363Issuance() {
	const violations = [];
	const f = path.join(REPO_ROOT, "scripts/issue-license.js");
	const text = readIfExists(f);
	if (text === null) return ["R5 cannot read scripts/issue-license.js"];
	if (!/dsaEncoding\s*:\s*["']ieee-p1363["']/.test(text)) {
		violations.push("R5 issue-license.js does not sign with dsaEncoding:'ieee-p1363' (still DER)");
	}
	return violations;
}

/**
 * R6 — Shared-file deny list must not be committed by a coding agent.
 * An append-only ledger is ONE hunk containing every agent's entry; `git add -p`
 * cannot separate it.
 *
 * PLAN_AUDIT blocker 4: the previous version read `docs/CLAIMS.md` and looked for
 * a marker string. That is prose a gate cannot trust — it passed whenever the
 * marker was present regardless of what was actually staged. This version reads
 * the REAL staged file list from git, which is the only thing that can answer the
 * question. Escape hatch is an explicit flag, not a magic string in a file.
 */
function ruleR6DenyListClean(stagedFiles) {
	const violations = [];
	if (!stagedFiles) return violations; // not a pre-commit context
	for (const f of stagedFiles) {
		const r = f.split("\\").join("/");
		if (DENY_LIST.includes(r)) {
			violations.push(`R6 deny-listed file staged: ${r} — coordinator-consolidation only (see docs/CLAIMS.md)`);
		}
	}
	return violations;
}

/** Staged file list from git. Empty array outside a commit context. */
function stagedFiles() {
	try {
		const out = require("node:child_process")
			.execSync("git diff --cached --name-only", { cwd: REPO_ROOT, encoding: "utf8" });
		return out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
	} catch {
		return [];
	}
}


// ---------------------------------------------------------------------------
// Runner + self-test
// ---------------------------------------------------------------------------

const RULES = [
	["R1 no direct credential-slot writes", ruleR1NoDirectSlotWrites],
	["R2 no license blob to auth endpoint", ruleR2NoBlobToAuthEndpoint],
	["R3 secure-context diagnosable", ruleR3SecureContextDiagnosable],
	["R4 engine verify order + sig length", ruleR4EngineVerifyOrder],
	["R5 P1363 issuance", ruleR5P1363Issuance],
	["R6 deny-list clean", ruleR6DenyListClean],
];

function runCheck(opts = {}) {
	const files = [...collectFiles("src"), ...collectFiles("scripts")];
	const staged = opts.staged === undefined ? stagedFiles() : opts.staged;
	const results = [];
	for (const [name, fn] of RULES) {
		let violations;
		if (name.startsWith("R4") || name.startsWith("R5")) violations = fn();
		else if (name.startsWith("R6")) violations = fn(staged);
		else violations = fn(files);
		results.push({ name, violations });
	}
	const total = results.reduce((n, r) => n + r.violations.length, 0);
	return { results, total, files };
}

/**
 * Negative tests. For each rule we inject the violation into an in-memory copy
 * and assert the rule reports it. A rule with no negative test is decoration.
 */
function runSelfTest() {
	const files = [...collectFiles("src"), ...collectFiles("scripts")];
	const cases = [
		{
			name: "R1",
			mutate: (list) => {
				const p = path.join(REPO_ROOT, "src/__gate_probe__.ts");
				fs.writeFileSync(p, 'localStorage.setItem("vni_pat", "x");\n', "utf8");
				list.push(p);
				return () => fs.unlinkSync(p);
			},
			expect: (v) => v.some((x) => x.startsWith("R1")),
		},
		{
			name: "R2",
			mutate: (list) => {
				const p = path.join(REPO_ROOT, "src/__gate_probe__.ts");
				fs.writeFileSync(p, 'const x = await client.validateMe();\n', "utf8");
				list.push(p);
				return () => fs.unlinkSync(p);
			},
			expect: (v) => v.some((x) => x.startsWith("R2")),
		},
		{
			// R4's negative test must produce a REAL ordering violation, not a garbage
			// file that trips the "cannot locate" branch. PLAN_AUDIT2: the first version
			// overwrote the whole engine file with two lines, so the assertion was
			// satisfied by an error message rather than by the rule it claims to test.
			name: "R4",
			mutate: () => {
				const f = path.join(ENGINE_ROOT, "packages/vn-kline-engine-core/src/licenseValidator.ts");
				const orig = fs.readFileSync(f, "utf8");
				fs.writeFileSync(
					f,
					"export async function verifyLicenseKey(key, opts) {\n" +
						"\tif (!LICENSE_TIERS.includes(payload.t)) return null;\n" +
						"\tconst sigBytes = new Uint8Array(64);\n" +
						"\ttry { await tryVerify(subtle, cryptoKey, sigBytes, payloadBytes); } catch { return null; }\n" +
						"\treturn { tier: payload.t };\n}\n",
					"utf8",
				);
				return () => fs.writeFileSync(f, orig, "utf8");
			},
			expect: (v) => v.some((x) => x.includes("BEFORE signature verify")),
		},
		{
			// R3's negative test: remove every scannable mention and assert the rule fires.
			name: "R3",
			mutate: () => {
				const probe = path.join(REPO_ROOT, "src/__gate_probe__.ts");
				fs.writeFileSync(probe, "export const x = 1;\n", "utf8");
				return () => fs.unlinkSync(probe);
			},
			expect: (v) => v.length > 0,
			// Run against a probe list that deliberately contains no scannable match.
			extra: () => ruleR3SecureContextDiagnosable([path.join(REPO_ROOT, "src/__gate_probe__.ts")]),
		},
		{
			name: "R5",
			mutate: () => {
				const f = path.join(REPO_ROOT, "scripts/issue-license.js");
				const orig = fs.readFileSync(f, "utf8");
				fs.writeFileSync(f, 'sign(k,"sha256");\n', "utf8");
				return () => fs.writeFileSync(f, orig, "utf8");
			},
			expect: (v) => v.some((x) => x.startsWith("R5")),
		},
		{
			name: "R6",
			mutate: () => null,
			// R6 answers from the real staged list, so its negative test feeds one in.
			extra: () => ruleR6DenyListClean(["config/fat-file-budget.json"]),
			expect: (v) => v.some((x) => x.includes("config/fat-file-budget.json")),
		},
	];

	let failed = 0;
	for (const c of cases) {
		const probe = [...files];
		let restore;
		try {
			restore = c.mutate(probe);
			const violations = c.extra
				? c.extra()
				: RULES.find(([n]) => n.startsWith(c.name))[1](c.name === "R4" ? undefined : probe);
			const ok = c.expect(violations);
			console.log(`  self-test ${c.name}: ${ok ? "DETECTED (pass)" : "MISSED (FAIL)"}`);
			if (!ok) failed++;
		} catch (e) {
			console.log(`  self-test ${c.name}: ERROR ${e.message}`);
			failed++;
		} finally {
			if (restore) restore();
			const probeFile = path.join(REPO_ROOT, "src/__gate_probe__.ts");
			if (fs.existsSync(probeFile)) fs.unlinkSync(probeFile);
		}
	}
	return failed;
}

const argv = process.argv.slice(2);

if (argv.includes("--self-test")) {
	console.log("GATE self-test (negative tests — every rule must DETECT its violation):");
	const failed = runSelfTest();
	if (failed > 0) {
		console.error(`\nGATE SELF-TEST FAILED: ${failed} rule(s) did not detect an injected violation.`);
		console.error("A gate you have only seen pass is untested. Do not trust --check.");
		process.exit(1);
	}
	console.log("\nGATE self-test OK — all rules detect their violation.");
	process.exit(0);
}

/**
 * Baseline ratchet. A gate that is red on day one never gets read again, and a
 * gate that only reports what you already knew is a gate that cannot catch a
 * regression. So: record today's violations, fail only on NEW ones.
 *
 * `--write-baseline` regenerates. Deliberately a separate flag — refreshing the
 * baseline must be a conscious act, not something a commit can do by accident.
 */
const BASELINE_PATH = path.join(REPO_ROOT, "scripts/credential-split-baseline.json");

function loadBaseline() {
	const text = readIfExists(BASELINE_PATH);
	if (text === null) return [];
	try {
		const parsed = JSON.parse(text);
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

const { results, total } = runCheck({ allowDeny: argv.includes("--allow-deny") });
const allViolations = results.flatMap((r) => r.violations);

if (argv.includes("--write-baseline")) {
	fs.writeFileSync(BASELINE_PATH, JSON.stringify(allViolations.sort(), null, 2) + "\n", "utf8");
	console.log(`GATE baseline written: ${allViolations.length} known violation(s) -> scripts/credential-split-baseline.json`);
	process.exit(0);
}

if (argv.includes("--check")) {
	const baseline = new Set(loadBaseline());
	const files = [...collectFiles("src"), ...collectFiles("scripts")];
	console.log(`GATE credential-split — scanned ${files.length} source files`);
	console.log(`  baseline: ${baseline.size} known violation(s) — only NEW ones fail\n`);

	let newCount = 0;
	let knownCount = 0;
	for (const r of results) {
		const fresh = r.violations.filter((v) => !baseline.has(v));
		const known = r.violations.length - fresh.length;
		knownCount += known;
		newCount += fresh.length;
		if (r.violations.length === 0) {
			console.log(`  PASS  ${r.name}`);
			continue;
		}
		console.log(`  ${fresh.length === 0 ? "KNOWN" : "FAIL "} ${r.name} (${known} known)`);
		for (const v of fresh) console.log(`        - NEW  ${v}`);
		for (const v of r.violations.filter((x) => baseline.has(x))) {
			console.log(`        =  old ${v.slice(0, 100)}`);
		}
	}
	console.log(`\n${newCount === 0 ? `GATE PASS (${knownCount} pre-existing violation(s) still open — they map to CS-1/CS-4/CS-5/CS-6)` : `GATE FAIL (${newCount} new violation(s))`}`);
	// The contract. Never pipe this script — see the header.
	process.exit(newCount === 0 ? 0 : 1);
}

console.log("usage: node scripts/gate-credential-split.cjs --check | --self-test | --write-baseline");
process.exit(2);
