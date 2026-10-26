#!/usr/bin/env node
/**
 * run-gates.cjs — Stage 6 gate runner for vninvestcharts-widget.
 *
 * Runs every gate in docs/upgrade-standard/AGENT_PROTOCOL.md's matrix and prints one
 * line per gate with its REAL exit code. No gate is summarised from memory.
 *
 * Rules this file enforces on itself:
 *  - `npm run build` runs FIRST; three gates read dist/ and are meaningless without it.
 *  - A gate is Pass only on exit 0. Anything else is reported verbatim.
 *  - A gate that is SKIPPED is not a Pass and is not a FAIL. It gets its own bucket.
 *  - `npm run bundlesize` is advisory and is reported separately, never as Pass.
 *  - `verify-dist` is reported with its file count because an EMPTY dist/ used to make it
 *    exit 0 - a green gate that verified nothing (hazard 4). It now exits 1 on an empty
 *    dist/; that change lives in verify-dist.js, and this file re-reports the count.
 *
 * Most of those rules have a self-test below, because a harness that reports failures it did
 * not measure is worse than no harness. Two earlier versions claimed 12 phantom failures and
 * then 4; neither was caught, because nothing tested the runner.
 *
 * WHAT THE SELF-TESTS DO **NOT** COVER - read before trusting a green run. A self-test can only
 * check what it executes, so an adversarial edit to this file, to `package.json`'s `test`
 * script, or to `vitest.config.ts` can still make this runner report a suite it did not run.
 * That is not a bug in the assertions below; it is the limit of any self-check: a gate that can
 * be rewritten to lie is not a security boundary, and code review plus CI are the controls that
 * remain. Two rounds of audit found exactly this and each time the finding was real.
 *
 * HOW MANY OF THE 23 CASES RUN: `Select-String -Path scripts/run-gates.cjs -Pattern "^\s*check\("`
 * gives 23. Measured 2026-10-15; the previous "22" had drifted as cases were added, and nothing
 * had re-measured it — the same failure as the doc claims this repo keeps finding in Markdown.
 * The second number this block used to quote ("counting emitted verdict lines gives 24") is
 * DELETED on purpose: no method reproduces it, it could not be re-derived when asked, and a
 * number nobody can reproduce is worse than no number. Only the first figure is claimed.
 *
 * The MATRIX size is a different number and is also reproducible:
 * `Select-String -Path scripts/run-gates.cjs -Pattern 'results\.push\(gate\('` = 62
 * (measured 2026-10-25; was 52 before the agent-config pair, 54 after it, 57 after the
 * agent-harness pair, 58 after hardcoded-text, 60 after the lib-to-widget gate + self-test pair,
 * 62 after the widget-pro leak gate + self-test pair).
 * Do not confuse the two: 23 = self-test
 * assertions, 62 = gates the matrix runs.
 *
 * Usage:
 *   node scripts/run-gates.cjs              # build + the full matrix
 *   node scripts/run-gates.cjs --self-test  # seconds, not a build: proves the runner works
 */
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");

/**
 * Rule 17 (2026-10-16): E2E runs against the VPS staging environment, not a dev server.
 *
 * Declared here, at the top, on purpose. The self-test drives `runMatrix` at line ~269 - before
 * the E2E section - so a constant declared down there is still in its temporal dead zone when the
 * matrix reaches `e2eGate`, and the self-test dies with a ReferenceError instead of testing
 * anything. It caught exactly that.
 */
const STAGING_WATCH_URL = process.env.WATCH_URL || "";
const SELF_TEST = process.argv.includes("--self-test");

/** Bookkeeping for one gate. `error` is recorded separately from `status` on purpose —
 *  on a spawn failure (ENOENT, bad path) `status` is null, which `!== 0`, so a typo'd
 *  command would otherwise be indistinguishable from a gate that genuinely failed.
 *  `code` is not a parameter: the caller has no code yet, and `record()` is only ever used
 *  for the not-yet-run entry (Stage 5 finding F-10). */
/** The command line this runner will actually execute, reconstructed from `cmd` + `args`.
 *  Printed whenever it differs from the hand-written label. A label that names one command while
 *  the runner executes another is a report nobody can reproduce: `run-gates.cjs` labelled
 *  `node gen-inventory.mjs --check` while running `docs/system-design/_meta/tools/gen-inventory.mjs`,
 *  so typing the label at the repo root gave `Cannot find module` (exit 1) against a printed exit=0. */
function reconstructCommand(cmd, args) {
	const name = path.basename(cmd).toLowerCase().startsWith("npm") ? "npm" : "node";
	const quote = (a) => (/\s/.test(a) ? `"${a}"` : a);
	return [name, ...args].map(quote).join(" ");
}

function record(label, extra = {}) {
	return { label, code: null, error: null, last: undefined, advisory: false, skipped: false, ...extra };
}

function run(label, cmd, args, { advisory = false, skip = false, env } = {}) {
	const entry = record(label, { advisory, skipped: skip });
	if (skip) {
		entry.last = "skipped by request";
		console.log(`SKIP  ${label}  (not a Pass, not a Fail)`);
		return entry;
	}
	// `shell: true` is REQUIRED for npm on win32 (npm ships as npm.cmd) and MUST NOT be
	// used for node itself: process.execPath contains a space ("C:\Program Files\nodejs\..."),
	// which a shell mangles into "operable program or batch file". The first version of this
	// runner used a non-existent node_modules/npm/bin/npm-cli.js and reported 12 phantom
	// failures; the second used shell:true everywhere and reported 4 phantom failures.
	const useShell = path.basename(cmd).toLowerCase().startsWith("npm");
	// `env` is merged over the inherited environment rather than replacing it. Without it a gate
	// could verify one URL and execute against another: e2eGate probes `url` while the script it
	// spawns reads its OWN WATCH_URL default. The two disagreeing is exactly the class of bug the
	// "[label != command]" line above exists to expose.
	const r = spawnSync(cmd, args, {
		cwd: ROOT,
		encoding: "utf8",
		shell: useShell,
		env: env ? { ...process.env, ...env } : process.env,
	});
	entry.code = r.status;
	entry.error = r.error ? String(r.error.message ?? r.error) : null;
	const out = `${r.stdout || ""}${r.stderr || ""}`;
	const last = out
		.split(/\r?\n/)
		.map((l) => l.trim())
		.filter(Boolean)
		.pop();
	entry.last = last;
	const verdict = entry.skipped
		? "SKIP "
		: entry.code === 0
			? "PASS "
			: advisory
				? "ADVIS"
				: "FAIL ";
	console.log(`${verdict} ${label}  exit=${entry.code}${entry.error ? `  spawnError=${entry.error}` : ""}`);
	const realCmd = reconstructCommand(cmd, args);
	if (realCmd !== label) console.log(`        [label != command] actually ran: ${realCmd}`);
	if (last) console.log(`        ${last.slice(0, 150)}`);
	return entry;
}

/** Pure accounting, so the self-test can exercise it without spawning anything. */
function summarize(results) {
	return {
		pass: results.filter((r) => !r.skipped && !r.advisory && r.code === 0).length,
		fail: results.filter((r) => !r.skipped && !r.advisory && r.code !== 0).length,
		advisory: results.filter((r) => r.advisory && !r.skipped).length,
		skipped: results.filter((r) => r.skipped).length,
	};
}

function printSummary(results) {
	const s = summarize(results);
	console.log(`\n================ SUMMARY ================`);
	console.log(`total: ${results.length}   pass: ${s.pass}   fail: ${s.fail}   advisory: ${s.advisory}   skipped: ${s.skipped}`);
	const failed = results.filter((r) => !r.skipped && !r.advisory && r.code !== 0);
	if (failed.length) {
		console.log("\nNOT PASS:");
		for (const f of failed) {
			const why = f.error ? `spawn error: ${f.error}` : `exit ${f.code}`;
			console.log(`  - ${f.label} (${why})`);
		}
	}
	if (s.skipped) {
		console.log("\nSKIPPED (neither Pass nor Fail):");
		for (const r of results.filter((x) => x.skipped)) console.log(`  - ${r.label}`);
	}
	// Only a genuine failure is non-zero. A skipped gate must never turn the run red, which
	// is the defect that made this runner lie: `code: "SKIP"` failed `!== 0` and landed in
	// NOT PASS with no indication that anything had been skipped.
	return s.fail === 0 ? 0 : 1;
}

/** Runs `fn` with console.log captured, returning the emitted lines. Used by the AC-10 probe so
 *  the banner/gate ordering is checked on REAL output rather than on this file's source text. */
function captureStdout(fn) {
	const original = console.log;
	const lines = [];
	console.log = (...args) => {
		lines.push(args.map((a) => String(a)).join(" "));
	};
	try {
		fn();
	} finally {
		console.log = original;
	}
	return lines;
}

// ---- self-test ------------------------------------------------------------------
// Every case names the failure it rejects. The control runs FIRST, because a suite whose
// fixtures are not load-bearing proves nothing - the same shape as
// scripts/check-slice-overlap.self-test.cjs, whose control is "the real plan must PASS".
function selfTest() {
	const src = fs.readFileSync(__filename, "utf8");
	const srcLines = src.split(/\r?\n/);
	let bad = 0;
	// Everything below this line is DELIBERATE: gates named `selftest/...` are injected, and
	// some of them are supposed to fail. A PASS/FAIL/SKIP line here is the subject under test,
	// not a result. The verdict is the last line, and the exit code.
	console.log("--- SELF-TEST: injected gates below fail on purpose; the verdict is the last line ---");
	const check = (name, ok, detail = "") => {
		console.log(`${ok ? "ok   " : "FAIL "} ${name}${detail ? `  ${detail}` : ""}`);
		if (!ok) bad += 1;
	};

	// control: a gate that exits 0 is a Pass.
	const control = run("selftest/control (injected: must pass)", process.execPath, ["-e", "process.stdout.write('ok')"]);
	const cs = summarize([control]);
	check("control: an injected gate exiting 0 is a Pass", control.code === 0 && cs.pass === 1 && cs.fail === 0, `exit=${control.code}`);
	check("control: no spawn error on a good command", control.error === null, String(control.error));

	// negative: a gate that exits non-zero is a Fail, and the runner's exit code follows.
	const failing = run("selftest/failing (injected: must be a Fail)", process.execPath, ["-e", "process.exit(3)"]);
	const fs2 = summarize([failing]);
	check("negative: an injected gate exiting 3 is a Fail", failing.code === 3 && fs2.fail === 1, `exit=${failing.code}`);
	check("negative: a failing gate reports NO spawn error", failing.error === null, String(failing.error));

	// negative: an advisory non-zero is neither Pass nor Fail.
	const advis = run("selftest/advisory (injected: must not be a Fail)", process.execPath, ["-e", "process.exit(1)"], { advisory: true });
	const as = summarize([advis]);
	check("negative: an advisory exit 1 is not counted as a Fail", advis.code === 1 && as.fail === 0 && as.advisory === 1, `exit=${advis.code}`);

	// the defect this slice exists to fix: a skipped gate must not read as a failure.
	const skipped = run("selftest/skipped (injected: must be neither)", process.execPath, ["-e", "process.exit(0)"], { skip: true });
	const ss = summarize([skipped]);
	check(
		"a skipped gate is neither Pass nor Fail",
		skipped.skipped === true && ss.skipped === 1 && ss.fail === 0 && ss.pass === 0,
		`fail=${ss.fail} pass=${ss.pass} skipped=${ss.skipped}`,
	);
	check("a skipped gate alone still yields runner exit 0", printSummary([skipped]) === 0);
	const mixed = summarize([control, failing, advis, skipped]);
	check("mixed accounting", mixed.pass === 1 && mixed.fail === 1 && mixed.advisory === 1 && mixed.skipped === 1, JSON.stringify(mixed));
	check("mixed run is red because of the real failure", printSummary([control, failing, advis, skipped]) === 1);

	// a spawn error must be distinguishable from a genuine failure.
	const bogus = run("selftest/spawn-error (injected: expected to not spawn)", "definitely-not-a-real-command-xyz", []);
	check("a spawn error is recorded and does not masquerade as exit 0", bogus.code === null && bogus.error !== null, `exit=${bogus.code}`);

	// AC-10, checked by RUNNING the shipped function rather than by reading this file.
	//
	// This assertion has now failed to fail five times, and every failure was the same mistake:
	// it inspected source text. It searched for a literal only the check itself contained; then
	// the explanatory comment quoted the banner and it matched the comment; then it counted call
	// sites, which a `nextTick`, an early `return`, a decoy inside dead code or a rename all
	// defeat without changing behaviour. Round 2 proved five such mutations left the suite green.
	//
	// So this captures real output. `announceAndRun` is called exactly as the matrix calls it,
	// with a stub gate that prints a marker, and the ORDER OF THE EMITTED LINES is asserted.
	// Deferring the banner moves its line after the gate's; removing it loses the line; a decoy
	// in dead code is irrelevant because the probe executes the real path.
	//
	// A RESIDUAL note used to sit here claiming this probe "locks the order inside
	// announceAndRun, not the wiring" and that proving the wiring "needs the full matrix, which
	// needs a build". All three claims were false and were deleted: this probe does execute the
	// shipped `runMatrix` below, and it does so without a build, because the gate runner is an
	// injected parameter. A comment that describes a weaker guarantee than the code provides is
	// worse than no comment - it tells the next reader to stop looking.
	const ORDER_BANNER = "AC10-BANNER-PROBE";
	const ORDER_GATE = "AC10-GATE-PROBE";
	const captured = captureStdout(() =>
		announceAndRun(ORDER_BANNER, "selftest/order-probe (injected)", process.execPath, [
			"-e",
			`process.stdout.write("${ORDER_GATE}\\n")`,
		]),
	);
	const bannerLine = captured.findIndex((l) => l.includes(ORDER_BANNER));
	const gateLine = captured.findIndex((l) => l.includes(ORDER_GATE));
	check(
		"AC-10: the banner is actually emitted, exactly once, by the shipped path",
		bannerLine >= 0 && captured.filter((l) => l.includes(ORDER_BANNER)).length === 1,
		`banner occurrences=${captured.filter((l) => l.includes(ORDER_BANNER)).length}`,
	);
	check(
		"AC-10: in the REAL emitted output the banner precedes the gate",
		bannerLine >= 0 && gateLine >= 0 && bannerLine < gateLine,
		`banner@${bannerLine} gate@${gateLine}`,
	);

	// AC-10, the WIRING. The probe above calls announceAndRun directly, which left the hole a
	// Stage 5 round found: leave that function perfect and neuter the matrix's npm-test entry, and
	// the probe still passed while the shipped runner stopped running the test suite at all.
	//
	// Two ways that happened, both now closed:
	//   1. The recorder used to be `(label) => {...}`, which DISCARDS `cmd`, `args` and
	//      `options`. Wrapping the injected gate as `(l, c, a) => gate(l, c, a, { skip: true })`
	//      therefore looked identical to the probe, while the real runner recorded npm test as
	//      SKIPPED - the merge gate silently stopped running the suite and still exited 0. The
	//      recorder now takes every argument and the probe asserts the npm-test entry was not
	//      skipped and names the right command.
	//   2. The order check used `findIndex`, so hoisting the banner to the top of `runMatrix`
	//      - 1800 characters before its own gate - satisfied it. It now requires ADJACENCY: the
	//      announcement must be the line immediately before the gate it announces.
	const MATRIX_GATE_MARK = "MATRIX-GATE-PROBE";
	const order = [];
	const invocations = [];
	const matrixLines = captureStdout(() =>
		runMatrix((label, cmd, args, options) => {
			order.push(label);
			invocations.push({
				label,
				cmd,
				args,
				options,
				advisory: Boolean(options && options.advisory),
				skipped: Boolean(options && options.skip),
			});
			console.log(`${MATRIX_GATE_MARK} ${label}`);
			return record(label, { code: 0, skipped: Boolean(options && options.skip), advisory: Boolean(options && options.advisory) });
		}),
	);
	const matrixBanner = matrixLines.findIndex((l) => l.includes(npmTestBannerText()));
	const matrixTestGate = matrixLines.findIndex((l) => l.includes(`${MATRIX_GATE_MARK} npm test`));
	const npmTestCall = invocations.find((i) => i.label === "npm test");
	check(
		"AC-10: the real matrix announces npm test at all",
		matrixBanner >= 0,
		`banner@${matrixBanner} of ${matrixLines.length} emitted lines`,
	);
	check(
		"AC-10: the announcement is IMMEDIATELY before the gate it announces",
		matrixBanner >= 0 && matrixTestGate >= 0 && matrixTestGate - matrixBanner === 1,
		`banner@${matrixBanner} gate@${matrixTestGate} (gap must be 1)`,
	);
	check(
		"AC-10: the npm test gate is invoked exactly once and is NOT skipped",
		invocations.filter((i) => i.label === "npm test").length === 1 &&
			npmTestCall !== undefined &&
			Boolean(npmTestCall.options && npmTestCall.options.skip) !== true,
		`occurrences=${invocations.filter((i) => i.label === "npm test").length} skip=${npmTestCall && npmTestCall.options ? JSON.stringify(npmTestCall.options.skip) : "none"}`,
	);
	// `npm test` must run the WHOLE suite, so any extra argument is out of contract for this
	// runner - it never wants --coverage or --reporter - and some of them are ways to make
	// `npm test` exit 0 having executed nothing: `npm test -- --testNamePattern <no-such-test>`
	// reports "Test Files 1 skipped, Tests 5 skipped" and exits 0. Asserting only
	// `args[0] === "test"` let exactly that through (Stage 5 F-26).
	//
	// SCOPE, precisely, because an earlier version of this comment over-claimed it as "the
	// contract is the whole argv" and that was wrong in a way an auditor demonstrated: this is
	// ONE of three points that decide whether the suite runs. `run()` can rebind argv after this
	// check, and `package.json`'s `test` script or `vitest.config.ts` can be narrowed with argv
	// untouched. This case pins the MATRIX ENTRY; it does not pin the other two, and no
	// assertion in a self-test can. See the "WHAT THE SELF-TESTS DO NOT COVER" note at the top.
	check(
		"AC-10: the matrix entry for the suite is exactly `npm test` with no extra arguments",
		npmTestCall !== undefined &&
			npmTestCall.cmd === "npm" &&
			Array.isArray(npmTestCall.args) &&
			npmTestCall.args.length === 1 &&
			npmTestCall.args[0] === "test",
		npmTestCall ? `${String(npmTestCall.cmd)} ${JSON.stringify(npmTestCall.args)}` : "not invoked",
	);
	check(
		"AC-10: the matrix's recorded result for npm test is not skipped",
		order.indexOf("npm test") >= 0 && order.indexOf("npm test") === order.length - 2,
		`npm test at position ${order.indexOf("npm test") + 1} of ${order.length}`,
	);
	// Not AC-10, but found by the same harness and the same class of defect: a gate silently
	// turned into a skip. Skipping is legitimate (that is what MINOR-2a made safe), so this does
	// not forbid it - it forbids it being invisible, which is what makes a runner report a green
	// matrix it did not run.
	//
	// The E2E entry is EXPECTED to skip when no dev server answers, so it is
	// excluded here and asserted separately below. It used to be absent from the
	// matrix entirely; leaving it out of both lists would restore that.
	const skippedLabels = invocations.filter((i) => i.options && i.options.skip).map((i) => i.label);
	// Only this clause is load-bearing. An earlier version also had
	// `filter(i => !i.options.skip).every(i => !i.options.skip)`, which is true by
	// construction — it cannot fail, and a self-test whose purpose is to not be
	// dead should not carry a dead clause that reads like coverage.
	// PINE-05: the rule is "only E2E gates may skip", expressed as a PROPERTY of
	// the label (`E2E ...`), not as a hardcoded name. Pinning the literal
	// "E2E verify:p3" would mean every future E2E gate breaks this assertion, and
	// the tempting fix is to delete the assertion - which is how an invariant
	// dies. Writing it over the consequence keeps it able to fail.
	check(
		"every skipped matrix gate is an E2E gate, which skips by design",
		skippedLabels.every((l) => l.startsWith("E2E ")),
		`skipped: ${JSON.stringify(skippedLabels)}`,
	);
	// The E2E gate must be RECORDED. It is dispatched through the injected
	// `gate`, so it shows up in `invocations`; if a future edit closes over
	// `run` instead, this assertion catches the entry vanishing from the matrix.
	check(
		"the E2E gates are present in the matrix, not absent (hazard 9)",
		invocations.some((i) => i.label.includes("E2E verify:p3")) &&
			invocations.some((i) => i.label.includes("E2E verify:pine")) &&
			invocations.some((i) => i.label.includes("E2E verify:demo-mode")),
	);
	check(
		"the advisory entry keeps its advisory flag and is counted as neither Pass nor Fail",
		invocations.filter((i) => i.advisory).length === 1 &&
			invocations.filter((i) => i.advisory)[0].label.includes("ADVISORY"),
		`advisory entries=${invocations.filter((i) => i.advisory).length}`,
	);

	// AC-9: this file's own name must be right in its own usage text.
	// Asserted against the file's own NAME and its usage block, not against the whole source:
	// `src.includes("run-gates.cjs")` is trivially true (the string is this very sentence's
	// subject) and would pass whatever the header said. Stage 5 finding F-02.
	const header = src.slice(0, src.indexOf("const ROOT"));
	const usage = (src.match(/node scripts\/run-gates\.[a-z]+/g) || []);
	check("AC-9: the header names this file run-gates.cjs", /run-gates\.cjs/.test(header), "header checked");
	check(
		"AC-9: every node invocation of this file uses the .cjs name",
		usage.length > 0 && usage.every((s) => s === "node scripts/run-gates.cjs"),
		JSON.stringify(usage),
	);
	check("AC-9: no .mjs invocation survives anywhere", !/node scripts\/run-gates\.mjs/.test(src));

	console.log(`\nrun-gates SELF-TEST ${bad === 0 ? "PASS" : "FAIL"}: ${bad === 0 ? "all cases passed" : `${bad} case(s) failed`}`);
	return bad;
}

if (SELF_TEST) {
	process.exit(selfTest() === 0 ? 0 : 1);
}

/** Emits a section marker. */
function banner(text) {
	console.log(`\n--- ${text} ---`);
}

/** The announcement text for the long gate. A function, not a `const`: `selfTest()` runs from the
 *  `--self-test` branch ABOVE this point in the file, so a module-level `const` would still be in
 *  its temporal dead zone when the AC-10 matrix probe calls `runMatrix`. A declaration hoists. */
function npmTestBannerText() {
	return "npm test (long; only its last line is shown, output is captured not inherited)";
}

/** Announces a long gate, then runs it. The announcement and the call live in ONE function on
 *  purpose, and `gate` is injectable so the self-test can drive this exact path with a stub
 *  instead of spawning anything.
 *
 *  Six earlier versions of AC-10 asserted source order, and every one could be defeated without
 *  changing behaviour: by deleting the banner, deferring it to nextTick, making it a decoy in
 *  dead code, renaming it, or - the version that survived longest - leaving this function
 *  perfectly intact while changing the one call site in the matrix that used it. Asserting on
 *  text cannot distinguish "the banner is printed before the gate" from "these words appear in
 *  that order somewhere in the file", and that difference is the entire property.
 */
function announceAndRun(text, label, cmd, args, gate = run) {
	banner(text);
	return gate(label, cmd, args);
}

/**
 * Is a dev server answering on the watch URL?
 *
 * Synchronous on purpose: `runMatrix` is synchronous, and the obvious
 * `fetch(...).then(r => r.ok)` returns a Promise, so the comparison to `true` is
 * always false and the gate skips on every run, including when a server IS up.
 * That mistake is silent — the entry still appears, just always as SKIP.
 *
 * A child `node -e` does the async work and reports through the exit code.
 */
function devServerIsUp(url) {
	try {
		// Set `exitCode`, never call `process.exit()` from inside the fetch callback. On win32 a
		// pending socket makes Node abort with `Assertion failed: !(handle->flags &
		// UV_HANDLE_CLOSING)` and exit -1073740791, so a server that answered 200 was reported
		// down. It only showed up once Rule 17 pointed this at a remote HTTPS origin; against
		// localhost the crash never fired, and the gate had been reporting "no server" the whole
		// time without anyone noticing it was a false negative rather than an absent server.
		const probe = spawnSync(
			process.execPath,
			[
				"-e",
				`fetch(${JSON.stringify(new URL(url).origin)},{signal:AbortSignal.timeout(3000)}).then(r=>{process.exitCode=r.ok?0:1},()=>{process.exitCode=1})`,
			],
			{ encoding: "utf8", timeout: 8000, shell: false },
		);
		return probe.status === 0;
	} catch {
		return false;
	}
}

/**
 * The E2E suites, listed but not silently absent.
 *
 * Runs a Playwright script when a dev server answers on the watch URL, and
 * SKIPs otherwise. The choice is made by PROBING, not by an env var: an
 * unreachable server and a server serving the wrong build are different
 * situations, and only the probe tells them apart.
 *
 * `gate` is passed through rather than closed over `run`, for the reason AC-10
 * exists: a matrix entry that bypasses the injected runner is invisible to the
 * self-test, so "no matrix gate is skipped" would keep passing while this gate
 * skipped on every run.
 *
 * PINE-05 (2026-10-12): parameterised so the Pine runtime proof is in the matrix
 * too. `verify-pine-add-to-chart.cjs` (450 lines, 14 checks) is the ONLY evidence
 * that a Pine line reaches the canvas - the whole evaluator pipeline up to
 * `KernelEngine` can be correct while the series never draws. It was written,
 * run by hand, reported as a number in handoffs, and never called by any runner:
 * hazard 9 in reverse, "script runs but nobody runs the script". Same shape as
 * the P3 E2E gap the comment below describes.
 *
 * Rule 17 (2026-10-16): the default target is the VPS staging environment, not a dev server.
 * Measured: `verify-p3` scores 12/12 on staging with NO licence seeded, so it was never a
 * Pro-tier gate and the old "needs the dev licence anchor" belief was wrong. Skipping it
 * whenever no dev server happened to be up was hiding that. `verify-pine` is different: it
 * measures 5/13 on a free-tier staging page and needs a licence signed by the production key
 * (VNI_E2E_LICENSE) to reach its Pro rows - so it stays conditional, on the environment, not
 * on localhost.
 */

function e2eGate(gate = run, { label, script, url, env } = {}) {
	const watchUrl = url || process.env.WATCH_URL || STAGING_WATCH_URL;
	const scriptPath = script || "scripts/verify-p3.cjs";
	const gateLabel = label || "E2E verify:p3";
	if (!devServerIsUp(watchUrl)) {
		// Not a Pass and not a Fail, but the reason must name the URL it wanted: "no dev server"
		// was the old text and it mislabelled a staging outage as a missing local server.
		return gate(
			`${gateLabel} (unreachable: ${watchUrl})`,
			process.execPath,
			["-e", ""],
			{ skip: true },
		);
	}
	return gate(gateLabel, process.execPath, [scriptPath], { env: { ...env, WATCH_URL: watchUrl } });
}

/** The whole matrix. `gate` defaults to the real runner; the self-test passes a recorder so the
 *  matrix can be executed end to end - including the npm-test announcement - in milliseconds and
 *  without a build. Returns the result entries; the caller prints the summary. */
function runMatrix(gate = run) {
	// ---- order matters: build first ---------------------------------------------
	console.log("--- build (produces dist/; three gates below are meaningless without it) ---");
	const results = [];
	results.push(gate("npm run build", "npm", ["run", "build"]));

	// ---- the matrix --------------------------------------------------------------
	results.push(gate("npm run type-check", "npm", ["run", "type-check"]));
	results.push(gate("npm run audit:fat-files", "npm", ["run", "audit:fat-files"]));
	// D-03: the DOM-access debt cap. Separate from lint:ratchet on purpose — that one is
	// gated by the ESLint baseline (688 of its 711 errors are ONE rule, so it reports green
	// while the architecture it protects was never applied). This one counts production
	// files only and ratchets DOWN. Its self-test has a real negative control.
	results.push(gate("npm run audit:dom-access", "npm", ["run", "audit:dom-access"]));
	results.push(gate("npm run audit:dom-access:self-test", "npm", ["run", "audit:dom-access:self-test"]));
	// A gate's negative proof must itself be in the matrix, or nobody ever
	// checks that the gate can still fail (L-E06). This one renames a root in
	// config/fat-file-budget.json and asserts the missing-root warning appears;
	// it restores the config in a `finally` and asserts it is byte-identical.
	results.push(gate("node scripts/check-fat-files.js --self-test", process.execPath, ["scripts/check-fat-files.js", "--self-test"]));
	// 2026-10-16: the published entry points used to be hand-listed by four tools, and one of
	// them rooted its traversal at `src/index.ts` — a file that is not a build entry and is never
	// published. It measured the wrong graph and still printed PASS. The entry list is now derived
	// from the build config; this gate keeps it derived. Its self-test is in the matrix too.
	results.push(gate("node scripts/check-build-entries.cjs", process.execPath, ["scripts/check-build-entries.cjs"]));
	results.push(gate("node scripts/check-build-entries.cjs --self-test", process.execPath, ["scripts/check-build-entries.cjs", "--self-test"]));
	// Rule 17 mandates that testing happens on the VPS staging environment. This is the mechanical
	// half of that rule: ask staging from OUTSIDE whether it is serving the commit under test.
	// While writing the rule, staging turned out to be 65 commits stale and the runbook named a
	// third sha — with `docker ps` reporting "Up (healthy)" throughout. Both the gate and its
	// negative proof live here, because a gate nobody has seen fail is a gate nobody should trust.
	// It reaches the network, so it runs AFTER the offline gates and before the E2E pair.
	results.push(gate("node scripts/check-staging.cjs --self-test", process.execPath, ["scripts/check-staging.cjs", "--self-test"]));
	results.push(gate("node scripts/check-staging.cjs", process.execPath, ["scripts/check-staging.cjs"]));
	// The entitlement helper decides whether a Pro E2E row can run at all. If it silently
	// downgraded to "no licence" a Pro assertion would pass on a free-tier page, so its refusal
	// cases belong in the matrix next to the gate that consumes it.
	results.push(gate("node scripts/e2e-license.cjs --self-test", process.execPath, ["scripts/e2e-license.cjs", "--self-test"]));
	// A runbook is a program written in prose, and prose is not compiled. This one caught a
	// section of deploy/CHARTS-TEST.md that told the operator to run scripts/verify-env.cjs - a
	// script that has never existed - because check-doc-links was scoped to docs/system-design/ by
	// its own docblock and deploy/ sat outside every doc gate for three days. (2026-10-18:
	// check-doc-links now scans deploy/ too - ledger DEPLOY_DOC_LINKS_SCOPE_2026-10-18 - but its
	// citation matcher only sees backticked spans, and commands in ``` fences carry no backticks,
	// so the fenced-block half of the gap stays THIS gate's job. Two gates, two mechanisms.)
	results.push(gate("node scripts/check-runbook-commands.cjs --self-test", process.execPath, ["scripts/check-runbook-commands.cjs", "--self-test"]));
	results.push(gate("node scripts/check-runbook-commands.cjs", process.execPath, ["scripts/check-runbook-commands.cjs"]));
	results.push(gate("npm run audit:props", "npm", ["run", "audit:props"]));
	results.push(gate("npm run audit:any", "npm", ["run", "audit:any"]));
	results.push(gate("npm run audit:drawing-boundary", "npm", ["run", "audit:drawing-boundary"]));
	results.push(gate("npm run audit:hardcoded-text", "npm", ["run", "audit:hardcoded-text"]));
	results.push(gate("node scripts/check-lib-to-widget-import.js", process.execPath, ["scripts/check-lib-to-widget-import.js"]));
	results.push(gate("node scripts/check-lib-to-widget-import.js --self-test", process.execPath, ["scripts/check-lib-to-widget-import.js", "--self-test"]));
	results.push(gate("node scripts/check-widget-pro-leak.mjs", process.execPath, ["scripts/check-widget-pro-leak.mjs"]));
	results.push(gate("node scripts/check-widget-pro-leak.mjs --self-test", process.execPath, ["scripts/check-widget-pro-leak.mjs", "--self-test"]));
	// G2-5/A4 (2026-10-26): the three public-sync gates. They self-detect scope:
	// on this private tree they report SKIPPED-ON-PRIVATE (exit 0) with the
	// would-be hits listed; on a public tree the same hits exit 1 with codes
	// A4-PUBLIC-TREE-01 / A4-BLOB-SECRETS-01 / A4-NO-INTERNAL-HOST-01. Gate and
	// self-test both in the matrix, same rule as every other gate (L-E06).
	results.push(gate("node scripts/check-public-tree.mjs", process.execPath, ["scripts/check-public-tree.mjs"]));
	results.push(gate("node scripts/check-public-tree.mjs --self-test", process.execPath, ["scripts/check-public-tree.mjs", "--self-test"]));
	results.push(gate("node scripts/check-blob-secrets.mjs", process.execPath, ["scripts/check-blob-secrets.mjs"]));
	results.push(gate("node scripts/check-blob-secrets.mjs --self-test", process.execPath, ["scripts/check-blob-secrets.mjs", "--self-test"]));
	results.push(gate("node scripts/check-no-internal-host.mjs", process.execPath, ["scripts/check-no-internal-host.mjs"]));
	results.push(gate("node scripts/check-no-internal-host.mjs --self-test", process.execPath, ["scripts/check-no-internal-host.mjs", "--self-test"]));
	// Rule 15 public-tree gate. It existed in CI (.github/workflows/ci.yml) but was absent from this
	// matrix, so a local "all gates pass" run could not see the 7 engine-pro imports P0.1 fixed.
	results.push(gate("node scripts/check-engine-pro-leak.mjs", process.execPath, ["scripts/check-engine-pro-leak.mjs"]));
	results.push(gate("npm run lint:ratchet", "npm", ["run", "lint:ratchet"]));
	results.push(gate("npm run check:release-manifest", "npm", ["run", "check:release-manifest"]));
	// 2026-10-15: `check:version` chạy ở .github/workflows/ci.yml:243-246 (bước
	// `version-sync (R1-05)`; lệnh `npm run check:version` nằm ở dòng 246) nhưng KHÔNG có
	// trong ma trận này. Hệ quả đo được: 5 chuỗi version hard-code trong source + README
	// đứng ở 0.2.0 trong khi package.json là 0.2.1 (bản đã publish), cổng CI đỏ — còn ma
	// trận Stage 6 cục bộ báo "42 pass / 1 fail" và không hề nhắc tới nó. Đây là hazard 9
	// theo chiều ngược lại: không phải cổng chết, mà là **cổng chạy ở CI mà runner không gọi**.
	// Đo lại bằng `npm run check:version` (không phải bằng grep package.json).
	results.push(gate("npm run check:version", "npm", ["run", "check:version"]));
	results.push(gate("npm run bundlesize:ratchet", "npm", ["run", "bundlesize:ratchet"]));
	results.push(gate("npm run verify-dist", "npm", ["run", "verify-dist"]));
	results.push(gate("node scripts/check-slice-overlap.cjs", process.execPath, ["scripts/check-slice-overlap.cjs"]));
	results.push(gate("node scripts/check-slice-overlap.self-test.cjs", process.execPath, ["scripts/check-slice-overlap.self-test.cjs"]));
	// B18: vitest.config.ts used to declare three keys the installed Vitest 1.6.1 does not
	// accept (`projects`, `transformMode`, `test.esbuild`). Unknown keys are ignored
	// WITHOUT a warning, so 113 lines sat in the config doing nothing. Both the gate and its
	// self-test are in the matrix: a gate whose negative proof is not itself run by CI is a
	// gate nobody has checked.
	results.push(gate("node scripts/check-vitest-config.cjs", process.execPath, ["scripts/check-vitest-config.cjs"]));
	results.push(gate("node scripts/check-vitest-config.self-test.cjs", process.execPath, ["scripts/check-vitest-config.self-test.cjs"]));
	// 2026-10-20 (agent harness P1): the agent-config gate was MISSING from this matrix, so the
	// agent layer could drift (skills in two layouts, `AGENTS.md`/`CLAUDE.md` duplicating each
	// other, `opencode.jsonc` pointing at a dead agent) with nothing failing. The gate AND its
	// self-test are both in the matrix, same rule as check-vitest-config above: a gate whose
	// negative proof is not itself run is a gate nobody has checked.
	results.push(gate("node scripts/check-agent-config.cjs", process.execPath, ["scripts/check-agent-config.cjs"]));
	results.push(gate("node scripts/check-agent-config.cjs --self-test", process.execPath, ["scripts/check-agent-config.cjs", "--self-test"]));
	// Agent harness P2 (2026-10-20): the slice gate, the plan attestation and the plugin probe.
	// Only the SELF-TESTS are in the matrix - `gate:slice` itself is deliberately NOT, because
	// its verdict depends on the slice that happens to be open right now, and a matrix whose
	// result depends on uncommitted working state is a matrix nobody can reproduce.
	results.push(gate("node scripts/gate-slice.cjs --self-test", process.execPath, ["scripts/gate-slice.cjs", "--self-test"]));
	results.push(gate("node scripts/attest-plan.cjs --self-test", process.execPath, ["scripts/attest-plan.cjs", "--self-test"]));
	results.push(gate("node scripts/ledger.cjs --self-test", process.execPath, ["scripts/ledger.cjs", "--self-test"]));
	results.push(gate("node scripts/verify-agent-plugin.cjs", process.execPath, ["scripts/verify-agent-plugin.cjs"]));
	// Twin-repo gates (Rule 12/13). Both were absent from this matrix, which is
	// hazard 9 in reverse: `check:engine-dist` is wired into package.json and
	// exits non-zero on drift, yet no runner called it — so a stale engine
	// `dist/` in node_modules could not turn the run red.
	//
	// `check-engine-published-version` (B1, 2026-11) is the sibling of that one
	// and guards the failure the overlay HIDES: the local build is green because
	// `sync-engine-dist.js` copies a freshly built engine over node_modules, so
	// nothing local can tell that the API being compiled against was never
	// published. It compares engine source version vs the lockfile pin. Its
	// self-test is in the matrix for the same reason as every other one.
	results.push(gate("npm run check:engine-dist", "npm", ["run", "check:engine-dist"]));
	results.push(gate("node scripts/check-engine-published-version.js", process.execPath, ["scripts/check-engine-published-version.js"]));
	results.push(gate("node scripts/check-engine-published-version.js --self-test", process.execPath, ["scripts/check-engine-published-version.js", "--self-test"]));
	// This package registers ~64 indicators/series at import time, so a false
	// "sideEffects": false is the regression this gate exists to catch. It was added to
	// the matrix only after the gate learned to inspect THIS package, not just the
	// engine's - previously a false claim here would have passed untouched.
	results.push(gate("npm run audit:package-side-effects", "npm", ["run", "audit:package-side-effects"]));
	// Self-test chạy trước cổng thật trong thứ tự này: một glob hỏng làm gate LUÔN
	// xanh, nên phải chứng minh bảng case chạy được trước khi tin kết quả gate.
	results.push(gate("node check-package-side-effects.js --self-test", process.execPath, ["scripts/check-package-side-effects.js", "--self-test"]));
	// F-TIER-02: a paid capability with no call site is not a gate, it is an absent
	// feature. The gate is only meaningful if its own decision core is exercised first.
	results.push(gate("npm run audit:paid-capability", "npm", ["run", "audit:paid-capability"]));
	results.push(gate("npm run audit:paid-capability:self-test", "npm", ["run", "audit:paid-capability:self-test"]));
	// 2026-10-13: the doubled-"l" scope was written into 11 live files five times
	// without anything failing, including the GENERATED 07.03 matrix and the token
	// setup guide. Wired here for the same reason as the note below — a gate no
	// runner calls is a file, not a gate.
	results.push(gate("npm run audit:scope-spelling", "npm", ["run", "audit:scope-spelling"]));
	// W-00 (PINE Stage 4): this gate was live, wired into package.json, and RED
	// (exit 2, `MISSING: export function callFunction anchor`) from Stage 3 W-02
	// until 2026-10-10 — because it was not in THIS matrix. A gate that no runner
	// calls is not a gate; it is a file. That is hazard 9 in its purest form, and
	// it hid a real Pine regression for a whole stage.
	//
	// Its self-test writes to a TRACKED file (`src/widget/i18n/capability.messages.en.ts`)
	// and restores it in a `finally`. It is therefore ordered AFTER nothing else
	// touches that file, and Stage 6 asserts `git status --porcelain` is empty
	// after the whole run (hazard 15: the harness that fails exactly when it works).
	results.push(gate("npm run audit:capability-copy", "npm", ["run", "audit:capability-copy"]));
	results.push(gate("npm run audit:capability-copy:self-test", "npm", ["run", "audit:capability-copy:self-test"]));
	results.push(gate("node scripts/scan-legacy-union.mjs", process.execPath, ["scripts/scan-legacy-union.mjs"]));
	// The lesson handbook's own structure. Its self-test is in the matrix for the same
	// reason check-slice-overlap's is: a gate whose negative proof is never itself run is
	// a gate nobody has checked (2026-10-07, L-E06).
	results.push(gate("npm run check:lessons", "npm", ["run", "check:lessons"]));
	results.push(gate("npm run check:lessons:self-test", "npm", ["run", "check:lessons:self-test"]));
	// Three more gates for docs/system-design/. Distinct jobs: the two --check scripts
	// verify NUMBERS match the source, this one verifies PATHS resolve. The first pass
	// of that handbook shipped 53 dead links and 15 broken citations.
	results.push(gate("node gen-inventory.mjs --check", process.execPath, ["docs/system-design/_meta/tools/gen-inventory.mjs", "--check"]));
	results.push(gate("node gen-findings.mjs --check", process.execPath, ["docs/system-design/_meta/tools/gen-findings.mjs", "--check"]));
	// 2026-10-15: `--check` bảo vệ file sinh tự động, nhưng **không** bảo vệ logic sinh ra nó.
	// Nhánh regex trạng thái đã hỏng 8 tháng trong CI xanh; nay có self-test 7 case (**4 âm tính**:
	// CASE 2/3/4/6) chạy trên cây tài liệu tạm trong `%TEMP%`. Cùng lý do `check-vitest-config` có mục riêng.
	results.push(gate("node gen-findings.mjs --self-test", process.execPath, ["docs/system-design/_meta/tools/gen-findings.mjs", "--self-test"]));
	results.push(gate("node check-doc-links.mjs", process.execPath, ["docs/system-design/_meta/tools/check-doc-links.mjs"]));
	results.push(gate("node check-doc-links.mjs --self-test", process.execPath, ["docs/system-design/_meta/tools/check-doc-links.mjs", "--self-test"]));
	results.push(gate("node check-duplicate-topics.mjs", process.execPath, ["docs/system-design/_meta/tools/check-duplicate-topics.mjs"]));
	results.push(gate("node check-duplicate-topics.mjs --self-test", process.execPath, ["docs/system-design/_meta/tools/check-duplicate-topics.mjs", "--self-test"]));
	// The two `--check` gates above compared raw strings, so they reported "stale" purely because
	// core.autocrlf rewrote LF as CRLF on disk. A gate whose verdict tracks the checkout style
	// instead of the content is worse than no gate: it trains people to re-run the generator
	// until it goes green. This self-test mutates the generated files into the OTHER line-ending
	// form (and a BOM) and asserts the verdict does not move.
	results.push(gate("node scripts/gen-inventory.self-test.cjs", process.execPath, ["scripts/gen-inventory.self-test.cjs"]));
	results.push(gate("node scripts/runtime-lane-smoke.cjs (phase A)", process.execPath, ["scripts/runtime-lane-smoke.cjs"]));

	// ---- Pine Stage 3/4 probes + the mutation harness (S5, 2026-10-10) -------------
	//
	// Cả ba script ĐÃ TỒN TẠI và đều chạy exit 0 khi gọi tay, nhưng trước đây KHÔNG có
	// mục nào trong ma trận này gọi tới, và cũng không có npm script nào trỏ tới. Nghĩa là
	// "probe S3 27 case / S4 18 case / mutation 19/19" trong báo cáo phiên trước là số
	// đo bằng tay — không ai chạy lại được khi cổng đỏ, và không ai thấy nó đỏ.
	// Đây đúng là hazard 9 ("script tồn tại ≠ script chạy", và ngược lại là "script chạy
	// ≠ script được gọi"). Ba dòng này đóng lỗ đó.
	results.push(gate("node scripts/probe-pine-stage3.mjs --assert", process.execPath, ["scripts/probe-pine-stage3.mjs", "--assert"]));
	results.push(gate("node scripts/probe-pine-stage4.mjs --assert", process.execPath, ["scripts/probe-pine-stage4.mjs", "--assert"]));
	results.push(gate("node scripts/verify-pine-mutation.cjs", process.execPath, ["scripts/verify-pine-mutation.cjs"]));

	// E2E needs a dev server, which the matrix does not and cannot start: the
	// gates themselves must not depend on a long-lived background process, and
	// `npm run watch` begins with `rimraf ./build ./dist`, which would delete the
	// `dist/` the three gates above just verified.
	//
	// It used to be absent from the matrix entirely, which is hazard 9 in reverse:
	// reports said "E2E 12/12" and no runner called it, so nobody could see it go
	// red. It is listed here as SKIP when no server answers — a SKIP is neither
	// Pass nor Fail (`summarize()`), so this cannot turn the run red, and it
	// cannot be misread as coverage either.
	results.push(e2eGate(gate));
	// Staging, like every other E2E under Rule 17. `&uncontrolled=1` is what the Pine script has
	// always needed; it is part of the URL the reachability probe checks AND the one the script
	// is handed through WATCH_URL, so probe and execution cannot diverge.
	results.push(e2eGate(gate, {
		label: "E2E verify:pine (add-to-chart)",
		script: "scripts/verify-pine-add-to-chart.cjs",
		url: `${STAGING_WATCH_URL}&uncontrolled=1`,
	}));

	// DEMO-MODE (2026-10-17): trang demo staging tự cài licence pro demo
	// (src/demo/demoLicense.ts, define VNI_DEMO_LICENSE lúc build:docs). Gate này
	// chấm 4 bước trên bundle đang phục vụ, gồm CẢ đối chứng FREE qua tombstone
	// `vnsc_demo_license_off` — không có đối chứng thì "PRO observable" là vacuous.
	// Chạy trên bản build thiếu VNI_DEMO_LICENSE sẽ đỏ ngay DEMO-01, đúng ý đồ.
	results.push(e2eGate(gate, {
		label: "E2E verify:demo-mode",
		script: "scripts/verify-demo-mode.cjs",
		url: STAGING_WATCH_URL,
	}));

	// The long one, announced BEFORE it runs. Its stdout is captured, not inherited, so only
	// the last line is shown - a known, deliberately out-of-scope limitation (MINOR-2c(b)).
	results.push(announceAndRun(npmTestBannerText(), "npm test", "npm", ["test"], gate));

	// advisory, never a Pass
	results.push(gate("npm run bundlesize (ADVISORY)", "npm", ["run", "bundlesize"], { advisory: true }));
	return results;
}

const results = runMatrix();

// ---- the vacuity check nobody else does -------------------------------------------
const distDir = path.join(ROOT, "dist");
const jsCount = fs.existsSync(distDir)
	? fs.readdirSync(distDir).filter((f) => /\.(js|cjs|mjs)$/.test(f)).length
	: 0;
console.log(`\n--- dist/ sanity: ${jsCount} top-level js|cjs|mjs bundle(s) present ---`);
if (jsCount === 0) {
	console.log("WARNING: verify-dist would have exited 0 on an empty dist/ - that is a vacuous Pass.");
}

process.exit(printSummary(results));
