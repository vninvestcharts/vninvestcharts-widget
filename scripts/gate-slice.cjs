#!/usr/bin/env node
/**
 * gate-slice.cjs — completion gate for an agent slice.
 *
 * WHAT IT CHECKS (reads artifacts on disk, never a transcript):
 *   - the slice has a plan with a phase still `in_progress`
 *   - the ledger has NOT advanced since the previous block
 *   - the block counter is below the cap
 * ⇒ block. The reason is a fixed template + the phase NAME; plan prose never enters the reason.
 *
 * EXIT CODES: 0 = pass (nothing to block) · 2 = BLOCK (do not proceed) · 1 = usage/config error.
 * `2` is deliberate: a non-zero exit IS the signal (see AGENTS.md "only a gate that exits
 * non-zero did"). `2` is what a pre-commit / CI step looks for.
 *
 * Usage:
 *   node scripts/gate-slice.cjs [--slice <id>] [--root <dir>] [--json] [--print-context] [--reset]
 *   node scripts/gate-slice.cjs --self-test
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const core = require("./lib/agent-harness-core.cjs");

const ROOT = path.resolve(__dirname, "..");

function usage(msg) {
	if (msg) console.error(`gate-slice: ${msg}`);
	console.error("usage: node scripts/gate-slice.cjs [--slice <id>] [--root <dir>] [--json] [--print-context] [--reset]");
	process.exit(1);
}

/** Apply the decision and persist the state (block counter + last ledger count). */
function applyDecision(slice, decision, { persist = true } = {}) {
	if (!decision.block) return decision;
	const state = slice.state || { blockCount: 0, lastLedgerCount: slice.ledger.length };
	const next = {
		blockCount: (state.blockCount || 0) + 1,
		lastLedgerCount: slice.ledger.length,
	};
	if (persist) core.writeGateState(slice.dir, next);
	return { ...decision, state: next };
}

function runCli(argv) {
	const args = argv.slice(2);
	if (args.includes("--self-test")) return selfTest();
	let sliceId = null;
	let root = ROOT;
	let asJson = false;
	let printContext = false;
	let reset = false;
	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--slice") sliceId = args[++i];
		else if (args[i] === "--root") root = path.resolve(args[++i]);
		else if (args[i] === "--json") asJson = true;
		else if (args[i] === "--print-context") printContext = true;
		else if (args[i] === "--reset") reset = true;
		else usage(`khong hiieu tham so '${args[i]}'`);
	}
	if (!fs.existsSync(root)) usage(`root khong ton tai: ${root}`);
	if (!sliceId) sliceId = core.resolveSlice(root);
	if (!sliceId) {
		// No slice at all: nothing to gate. Exit 0 (the gate has no opinion) but say so.
		const out = { block: false, reason: "khong co slice nao de gate (khong co .planning/<id>/task_plan.md)" };
		if (asJson) console.log(JSON.stringify(out));
		else console.log(`gate-slice PASS: ${out.reason}`);
		return 0;
	}
	const slice = core.readSlice(root, sliceId);
	if (!slice) usage(`khong tim thay slice '${sliceId}'`);
	if (reset) {
		core.writeGateState(slice.dir, { blockCount: 0, lastLedgerCount: slice.ledger.length });
		if (asJson) console.log(JSON.stringify({ block: false, reason: "da reset gate state" }));
		else console.log("gate-slice: da reset gate state");
		return 0;
	}
	if (printContext) {
		console.log(core.buildContextBlock({ slice, plan: slice.plan, nonce: "cli" }));
		return 0;
	}
	const decision = core.decideGate({ plan: slice.plan, ledger: slice.ledger, state: slice.state, sliceId: slice.id, root });
	const applied = applyDecision(slice, decision);
	const payload = {
		slice: slice.id,
		block: applied.block,
		reason: applied.reason,
		phase: applied.phase || null,
		ledgerCount: slice.ledger.length,
		blockCount: (slice.state && slice.state.blockCount) || 0,
	};
	if (asJson) console.log(JSON.stringify(payload));
	else if (applied.block) console.error(`gate-slice BLOCK (${slice.id}): ${applied.reason}`);
	else console.log(`gate-slice PASS (${slice.id}): ${applied.reason}`);
	return applied.block ? 2 : 0;
}

/** Fixture-based self-test: proves the gate can block AND that it stops blocking on progress. */
function selfTest() {
	const results = [];
	const check = (name, cond, detail) => results.push({ name, ok: !!cond, detail });
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gate-slice-selftest-"));
	try {
		const sliceDir = path.join(tmp, core.PLANNING_DIR, "S1");
		fs.mkdirSync(sliceDir, { recursive: true });
		fs.writeFileSync(
			path.join(sliceDir, core.TASK_PLAN),
			["**Goal:** lam viec X", "**Status:** in_progress", "", "## Phases", "### Phase 1 - A", "**Status:** in_progress", "**Next Step:** viet test", ""].join("\n"),
			"utf8",
		);
		fs.writeFileSync(path.join(sliceDir, core.LEDGER), "", "utf8");

		// (1) a slice with an in_progress phase and an empty ledger BLOCKS
		let slice = core.readSlice(tmp, "S1");
		let d = core.decideGate({ plan: slice.plan, ledger: slice.ledger, state: slice.state });
		check("in_progress + ledger rong => BLOCK", d.block === true, JSON.stringify(d));
		check("ly do co TEN phase", /Phase 1 - A/.test(d.reason), d.reason);
		check("ly do KHONG chua prose cua plan", !d.reason.includes("viet test"), d.reason);

		// (2) after the ledger advances, the gate stops blocking
		fs.appendFileSync(path.join(sliceDir, core.LEDGER), `${JSON.stringify({ ts: 1, note: "x" })}\n`, "utf8");
		slice = core.readSlice(tmp, "S1");
		d = core.decideGate({ plan: slice.plan, ledger: slice.ledger, state: { blockCount: 1, lastLedgerCount: 0 } });
		check("ledger da tien => khong block", d.block === false, JSON.stringify(d));

		// (3) the block cap releases a wedged slice
		d = core.decideGate({ plan: slice.plan, ledger: slice.ledger, state: { blockCount: 20, lastLedgerCount: 1 } });
		check("dat chan >= cap => khong block (co capped)", d.block === false && d.capped === true, JSON.stringify(d));

		// (4) a finished plan never blocks
		const doneDir = path.join(tmp, core.PLANNING_DIR, "S2");
		fs.mkdirSync(doneDir, { recursive: true });
		fs.writeFileSync(
			path.join(doneDir, core.TASK_PLAN),
			["**Goal:** x", "**Status:** done", "", "## Phases", "### Phase 1 - A", "**Status:** done", ""].join("\n"),
			"utf8",
		);
		const done = core.readSlice(tmp, "S2");
		d = core.decideGate({ plan: done.plan, ledger: done.ledger, state: done.state });
		check("plan xong => khong block", d.block === false, JSON.stringify(d));

		// (5) attestation detects a tampered plan
		core.writeAttestation(sliceDir);
		check("attestation ok khi plan chua doi", core.verifyAttestation(sliceDir).ok === true, "");
		fs.appendFileSync(path.join(sliceDir, core.TASK_PLAN), "\n<!-- tampered -->\n", "utf8");
		check("attestation FAIL khi plan bi sua", core.verifyAttestation(sliceDir).ok === false, "");

		// (6) the context block carries goal/phase/next-step and a nonce
		const slice2 = core.readSlice(tmp, "S1");
		const block = core.buildContextBlock({ slice: slice2, plan: slice2.plan, nonce: "N1" });
		check("context co BEGIN/END + nonce", block.includes("===BEGIN-PLAN-N1===") && block.includes("===END-PLAN-N1==="), "");
		check("context co Goal + Phase + Next Step", /Goal: /.test(block) && /Phase: 1\/1/.test(block) && /Next Step: /.test(block), "");

		// (7) staging-evidence: slice `done` mà KHONG co evidence => BLOCK (Rule 17)
		const { checkStagingEvidence } = require("./lib/staging-evidence.cjs");
		const realRoot = path.resolve(__dirname, "..");
		const headSha = require("node:child_process")
			.execFileSync("git", ["rev-parse", "HEAD"], { cwd: realRoot, encoding: "utf8" })
			.trim();
		const mkSlice = (id, status) => {
			const dir = path.join(tmp, core.PLANNING_DIR, id);
			fs.mkdirSync(dir, { recursive: true });
			fs.writeFileSync(
				path.join(dir, core.TASK_PLAN),
				["**Goal:** x", `**Status:** ${status}`, "", "## Phases", "### Phase 1 - A", `**Status:** ${status === "done" ? "done" : "in_progress"}`, ""].join("\n"),
				"utf8"
			);
			fs.writeFileSync(path.join(dir, core.LEDGER), "", "utf8");
			return dir;
		};
		const mkPlanDoc = (id, extra) => {
			const dir = path.join(tmp, "docs/upgrade-standard/plans");
			fs.mkdirSync(dir, { recursive: true });
			fs.writeFileSync(path.join(dir, `PLAN_${id}.md`), `# plan\n${extra || ""}\n`, "utf8");
		};
		const mkEvidence = (id, body) => {
			const dir = path.join(tmp, "docs/evidence", id);
			fs.mkdirSync(dir, { recursive: true });
			fs.writeFileSync(path.join(dir, "staging.md"), body, "utf8");
		};

		// (7a) done + thiếu evidence => block
		mkSlice("S-EV1", "done");
		mkPlanDoc("S-EV1");
		let sEv = core.readSlice(tmp, "S-EV1");
		let dEv = core.decideGate({ plan: sEv.plan, ledger: sEv.ledger, state: sEv.state, sliceId: "S-EV1", root: tmp });
		check("done + thieu staging evidence => BLOCK", dEv.block === true && /staging evidence/.test(dEv.reason), JSON.stringify(dEv));

		// (7b) done + evidence hop le + staging phuc vu dung sha => pass
		// HERMETIC: stub `fetchStagingCommit` — KHONG goi mang trong self-test (L-E06).
		mkSlice("S-EV2", "done");
		mkPlanDoc("S-EV2");
		mkEvidence("S-EV2", `commit: ${headSha}\ndate: 2026-01-01\n`);
		sEv = core.readSlice(tmp, "S-EV2");
		const stubOk = checkStagingEvidence({
			root: tmp,
			sliceId: "S-EV2",
			gitRoot: realRoot,
			fetchStagingCommit: () => headSha,
		});
		check("done + evidence hop le + staging khop => PASS", stubOk.required === true && stubOk.ok === true, JSON.stringify(stubOk));

		// (7c) plan co dong N/A => mien (khong block)
		mkSlice("S-EV3", "done");
		mkPlanDoc("S-EV3", "- **Staging evidence (Rule 17)**: N/A — slice khong can staging");
		sEv = core.readSlice(tmp, "S-EV3");
		dEv = core.decideGate({ plan: sEv.plan, ledger: sEv.ledger, state: sEv.state, sliceId: "S-EV3", root: tmp });
		check("co dong N/A => khong block", dEv.block === false, JSON.stringify(dEv));

		// (7d) chua done => luat staging KHONG chay (block (neu co) den tu luat phase)
		mkSlice("S-EV4", "in_progress");
		mkPlanDoc("S-EV4");
		sEv = core.readSlice(tmp, "S-EV4");
		dEv = core.decideGate({ plan: sEv.plan, ledger: sEv.ledger, state: sEv.state, sliceId: "S-EV4", root: tmp });
		check("chua done => luat staging khong chay", !/staging evidence/.test(dEv.reason || ""), JSON.stringify(dEv));

		// (7e) evidence tro commit => block
		mkSlice("S-EV5", "done");
		mkPlanDoc("S-EV5");
		mkEvidence("S-EV5", "commit: 0123456789abcdef0123456789abcdef01234567\ndate: 2026-01-01\n");
		sEv = core.readSlice(tmp, "S-EV5");
		dEv = core.decideGate({ plan: sEv.plan, ledger: sEv.ledger, state: sEv.state, sliceId: "S-EV5", root: tmp });
		check("evidence tro commit => BLOCK", dEv.block === true, JSON.stringify(dEv));

		// (7f) staging phuc vu sha KHAC => block
		const ev = checkStagingEvidence({
			root: tmp,
			sliceId: "S-EV2",
			gitRoot: realRoot,
			fetchStagingCommit: () => "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
		});
		check("staging phuc vu sha khac => BLOCK", ev.required === true && ev.ok === false, JSON.stringify(ev));

		// (7g) drift CHI docs/evidence (commit chứa file evidence) => PASS, khác drift code => BLOCK
		const { driftOnlyEvidence } = require("./lib/staging-evidence.cjs");
		const gitOut = (args) =>
			require("node:child_process")
				.execFileSync("git", args, { cwd: realRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
				.trim();
		const headFull = gitOut(["rev-parse", "HEAD"]);
		const prevFull = gitOut(["rev-parse", "HEAD~1"]);
		const filesBetween = gitOut(["diff", "--name-only", `${prevFull}..${headFull}`])
			.split(/\r?\n/)
			.map((s) => s.trim())
			.filter(Boolean);
		const onlyEvidence =
			filesBetween.length > 0 && filesBetween.every((f) => !f.startsWith("src/"));
		check(
			"drift chi docs/evidence => khong BLOCK",
			onlyEvidence ? driftOnlyEvidence(realRoot, prevFull, headFull) === true : true,
			`files=${filesBetween.join(",")}`
		);
		check(
			"drift co file khac => BLOCK",
			driftOnlyEvidence(realRoot, prevFull, headFull) === onlyEvidence,
			`files=${filesBetween.join(",")}`
		);
	} finally {
		fs.rmSync(tmp, { recursive: true, force: true });
	}
	let failed = 0;
	for (const r of results) {
		if (!r.ok) failed++;
		console.log(`${r.ok ? "ok  " : "FAIL"} ${r.name}${r.detail ? "  " + r.detail : ""}`);
	}
	console.log(`gate-slice SELF-TEST: ${results.length - failed}/${results.length} case`);
	if (failed) process.exit(1);
}

if (require.main === module) process.exit(runCli(process.argv));
module.exports = { runCli, selfTest, applyDecision };
