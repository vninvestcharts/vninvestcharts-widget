#!/usr/bin/env node
/**
 * ledger.cjs — append one progress entry to a slice's ledger.
 *
 * WHY. The gate asks one question: "has anything moved since the last time I blocked a commit?"
 * The ledger is the only artifact that answers it: it is append-only, machine-readable, and it is
 * written by the agent as it works. A progress note in prose does not count — a line here does.
 *
 * Usage:
 *   node scripts/ledger.cjs --slice <id> --note "<text>" [--root <dir>]
 *   node scripts/ledger.cjs --self-test
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const core = require("./lib/agent-harness-core.cjs");

const ROOT = path.resolve(__dirname, "..");

function usage(msg) {
	if (msg) console.error(`ledger: ${msg}`);
	console.error('usage: node scripts/ledger.cjs --slice <id> --note "<text>" [--root <dir>]');
	process.exit(1);
}

function main(argv) {
	const args = argv.slice(2);
	if (args.includes("--self-test")) return selfTest();
	let id = null;
	let note = "";
	let root = ROOT;
	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--slice") id = args[++i];
		else if (args[i] === "--note") note = args[++i];
		else if (args[i] === "--root") root = path.resolve(args[++i]);
		else usage(`khong hiieu tham so '${args[i]}'`);
	}
	if (!id) id = core.resolveSlice(root);
	if (!id) usage("khong co slice nao (dat VNSC_SLICE hoac --slice)");
	if (!note) usage("thieu --note");
	const dir = path.join(root, core.PLANNING_DIR, id);
	if (!fs.existsSync(path.join(dir, core.TASK_PLAN))) usage(`khong tim thay slice '${id}'`);
	const entry = { ts: Date.now(), note };
	fs.appendFileSync(path.join(dir, core.LEDGER), `${JSON.stringify(entry)}\n`, "utf8");
	const count = fs.readFileSync(path.join(dir, core.LEDGER), "utf8").split(/\r?\n/).filter(Boolean).length;
	console.log(`ledger: ${id} +1 (tong ${count}) — ${note}`);
	return 0;
}

function selfTest() {
	const results = [];
	const check = (name, ok, detail) => results.push({ name, ok: !!cond(ok), detail });
	function cond(v) {
		return v;
	}
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ledger-selftest-"));
	try {
		const dir = path.join(tmp, core.PLANNING_DIR, "S1");
		fs.mkdirSync(dir, { recursive: true });
		// The plan MUST have an in_progress phase, otherwise the gate passes for the wrong reason
		// ("no phase in_progress") and the assertion below would be vacuous.
		fs.writeFileSync(
			path.join(dir, core.TASK_PLAN),
			["**Goal:** x", "**Status:** in_progress", "", "## Phases", "### Phase 1 - a", "**Status:** in_progress", "**Next Step:** b", ""].join("\n"),
			"utf8",
		);
		fs.writeFileSync(path.join(dir, core.LEDGER), "", "utf8");
		const before = core.readSlice(tmp, "S1").ledger.length;
		fs.appendFileSync(path.join(dir, core.LEDGER), `${JSON.stringify({ ts: 1, note: "a" })}\n`, "utf8");
		const after = core.readSlice(tmp, "S1").ledger.length;
		check("append ledger tang so dong", after === before + 1, `${before} -> ${after}`);
		const slice = core.readSlice(tmp, "S1");
		check("dong ledger parse duoc thanh object", slice.ledger[0] && slice.ledger[0].note === "a", JSON.stringify(slice.ledger[0]));
		// same ledger, but the gate state says the previous block saw 0 entries -> the ledger moved
		const d = core.decideGate({ plan: slice.plan, ledger: slice.ledger, state: { blockCount: 1, lastLedgerCount: 0 } });
		check("ledger tien => gate khong block", d.block === false && /da tien/.test(d.reason), JSON.stringify(d));
		// and with the ledger back at the blocked count -> the gate blocks again
		const d2 = core.decideGate({ plan: slice.plan, ledger: slice.ledger, state: { blockCount: 1, lastLedgerCount: 1 } });
		check("ledger khong tien => gate van block", d2.block === true, JSON.stringify(d2));
	} finally {
		fs.rmSync(tmp, { recursive: true, force: true });
	}
	let failed = 0;
	for (const r of results) {
		if (!r.ok) failed++;
		console.log(`${r.ok ? "ok  " : "FAIL"} ${r.name}${r.detail ? "  " + r.detail : ""}`);
	}
	console.log(`ledger SELF-TEST: ${results.length - failed}/${results.length} case`);
	if (failed) process.exit(1);
}

if (require.main === module) process.exit(main(process.argv));
module.exports = { main, selfTest };
