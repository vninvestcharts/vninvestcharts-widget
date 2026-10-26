#!/usr/bin/env node
/**
 * new-slice.cjs — tao mot slice moi cho tang dieu phoi agent.
 *
 * WHY. The plugin (`.opencode/plugins/agent-harness.js`) re-injects the plan of the CURRENT slice on
 * every model call, and the gate denies a `git commit` while that plan still has an `in_progress`
 * phase. Both need a slice to exist. Without a one-command way to create one, the whole layer is
 * dead weight sitting in the repo.
 *
 * USAGE:
 *   node scripts/new-slice.cjs <SLICE_ID> "<goal>" [--root <dir>]
 *   npm run slice:new -- <SLICE_ID> "<goal>"
 *
 * It creates `.planning/<SLICE_ID>/`:
 *   task_plan.md   the plan the plugin injects (Goal / Status / Phases / Next Step)
 *   progress.md    append-only progress notes
 *   findings.md    scratch space - NOT auto-read by the plugin (it is untrusted input)
 *   ledger.jsonl   append-only progress ledger - the gate watches THIS to decide "did it move?"
 *   .attestation   sha256 of task_plan.md - a changed plan is reported, not silently accepted
 * and points `.planning/current` at the new slice.
 *
 * The plan is attested AT CREATION, so the first thing the agent does cannot be "rewrite the plan
 * to make itself look done".
 */
const fs = require("node:fs");
const path = require("node:path");
const core = require("./lib/agent-harness-core.cjs");

const ROOT = path.resolve(__dirname, "..");

function usage(msg) {
	if (msg) console.error(`new-slice: ${msg}`);
	console.error('usage: node scripts/new-slice.cjs <SLICE_ID> "<goal>" [--root <dir>]');
	process.exit(1);
}

function main(argv) {
	const args = argv.slice(2);
	let id = null;
	let goal = "";
	let root = ROOT;
	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--root") root = path.resolve(args[++i]);
		else if (!id) id = args[i];
		else if (!goal) goal = args[i];
		else usage("thu so du thua");
	}
	if (!id) usage("thieu SLICE_ID");
	if (!goal) usage('thieu goal (nhac: "muc tieu cua slice")');
	if (!/^[A-Za-z0-9._-]+$/.test(id)) usage(`SLICE_ID khong hop le: ${id}`);

	const dir = path.join(root, core.PLANNING_DIR, id);
	if (fs.existsSync(dir)) usage(`slice da ton tai: ${dir}`);

	const plan = [
		`**Goal:** ${goal}`,
		"**Status:** in_progress",
		"",
		"## Phases",
		"",
		"### Phase 1 — <ten phase>",
		"**Status:** in_progress",
		"**Next Step:** <một hành động kế tiếp duy nhất>",
		"",
	].join("\n");

	fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(path.join(dir, core.TASK_PLAN), plan, "utf8");
	fs.writeFileSync(path.join(dir, "progress.md"), `# ${id} — progress\n\n`, "utf8");
	fs.writeFileSync(path.join(dir, "findings.md"), `# ${id} — findings (KHONG duoc plugin auto-read)\n\n`, "utf8");
	fs.writeFileSync(path.join(dir, core.LEDGER), "", "utf8");
	const hash = core.writeAttestation(dir);
	fs.writeFileSync(path.join(root, core.PLANNING_DIR, "current"), `${id}\n`, "utf8");

	console.log(`new-slice: ${id}`);
	console.log(`  plan      : ${path.join(core.PLANNING_DIR, id, core.TASK_PLAN)}`);
	console.log(`  attested  : ${hash}`);
	console.log(`  pointer   : ${path.join(core.PLANNING_DIR, "current")} -> ${id}`);
	console.log("");
	console.log("Buoc tiep theo:");
	console.log(`  1. sua task_plan.md: Goal + ten phase + Next Step`);
	console.log(`  2. node scripts/attest-plan.cjs --slice ${id}   (re-attest sau khi sua plan)`);
	console.log(`  3. ghi moc tien bo vao ledger: node scripts/ledger.cjs --slice ${id} --note "..."`);
	console.log(`  4. node scripts/gate-slice.cjs --slice ${id}     (exit 2 = dang chua xong)`);
	console.log("");
	console.log("Plugin se re-inject plan nay moi model call (opencode phai restart de load plugin).");
}

if (require.main === module) main(process.argv);
module.exports = { main };
