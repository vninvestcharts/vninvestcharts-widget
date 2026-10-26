#!/usr/bin/env node
/**
 * attest-plan.cjs — hash-attestation for a slice plan.
 *
 * WHY. An agent that can rewrite its own plan can also "prove" it did the work. The attestation
 * pins the plan with a SHA-256 at the moment the work started; after that, a changed plan is
 * detected instead of silently accepted. It is NOT a security boundary: the same filesystem holds
 * both the plan and the hash, so an attacker who can edit one can edit the other. It is a
 * *drift detector* - it turns "the plan changed and nobody said so" into a loud event.
 *
 * EXIT CODES: 0 = ok · 1 = mismatch / no attestation · 2 = usage error.
 *
 * Usage:
 *   node scripts/attest-plan.cjs --slice <id> [--root <dir>]     # write/refresh the attestation
 *   node scripts/attest-plan.cjs --slice <id> --check [--root]   # verify only
 *   node scripts/attest-plan.cjs --self-test
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const core = require("./lib/agent-harness-core.cjs");

const ROOT = path.resolve(__dirname, "..");

function usage(msg) {
	if (msg) console.error(`attest-plan: ${msg}`);
	console.error("usage: node scripts/attest-plan.cjs [--slice <id>] [--root <dir>] [--check] [--self-test]");
	process.exit(2);
}

function runCli(argv) {
	const args = argv.slice(2);
	if (args.includes("--self-test")) return selfTest();
	let sliceId = null;
	let root = ROOT;
	let check = false;
	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--slice") sliceId = args[++i];
		else if (args[i] === "--root") root = path.resolve(args[++i]);
		else if (args[i] === "--check") check = true;
		else usage(`khong hiieu tham so '${args[i]}'`);
	}
	if (!fs.existsSync(root)) usage(`root khong ton tai: ${root}`);
	if (!sliceId) sliceId = core.resolveSlice(root);
	if (!sliceId) usage("khong co slice nao (dat VNSC_SLICE hoac tao .planning/<id>/task_plan.md)");
	const slice = core.readSlice(root, sliceId);
	if (!slice) usage(`khong tim thay slice '${sliceId}'`);
	if (check) {
		const res = core.verifyAttestation(slice.dir);
		if (res.ok) {
			console.log(`attest-plan OK (${sliceId}): ${res.expected}`);
			return 0;
		}
		console.error(`attest-plan FAIL (${sliceId}): ${res.reason}${res.actual ? ` (expected ${res.expected}, actual ${res.actual})` : ""}`);
		return 1;
	}
	const hash = core.writeAttestation(slice.dir);
	console.log(`attest-plan: ${sliceId} -> ${hash}`);
	return 0;
}

function selfTest() {
	const results = [];
	const check = (name, cond, detail) => results.push({ name, ok: !!cond, detail });
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "attest-selftest-"));
	try {
		const dir = path.join(tmp, core.PLANNING_DIR, "S1");
		fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(path.join(dir, core.TASK_PLAN), "**Goal:** x\n**Status:** in_progress\n", "utf8");
		check("chua attest => verify fail", core.verifyAttestation(dir).ok === false, "");
		const hash = core.writeAttestation(dir);
		check("attest ghi sha256 64 hex", /^[0-9a-f]{64}$/.test(hash), hash);
		check("verify ok sau khi attest", core.verifyAttestation(dir).ok === true, "");
		fs.appendFileSync(path.join(dir, core.TASK_PLAN), "tampered\n", "utf8");
		const res = core.verifyAttestation(dir);
		check("verify fail sau khi sua plan", res.ok === false && res.expected !== res.actual, JSON.stringify(res));
	} finally {
		fs.rmSync(tmp, { recursive: true, force: true });
	}
	let failed = 0;
	for (const r of results) {
		if (!r.ok) failed++;
		console.log(`${r.ok ? "ok  " : "FAIL"} ${r.name}${r.detail ? "  " + r.detail : ""}`);
	}
	console.log(`attest-plan SELF-TEST: ${results.length - failed}/${results.length} case`);
	if (failed) process.exit(1);
}

if (require.main === module) process.exit(runCli(process.argv));
module.exports = { runCli, selfTest };
