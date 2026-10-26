#!/usr/bin/env node
/**
 * check-vitest-config.self-test.cjs — negative proof for the B18 gate.
 *
 * The rule this repo keeps re-learning: "a gate you have only seen pass is an untested
 * gate". `check-vitest-config.cjs` was written to catch dead config keys, so the proof it
 * needs is that it CATCHES one. Four cases, each injecting a violation into a THROWAWAY
 * copy of the real config — never the real one.
 *
 * Case 4 matters most: the gate has a self-check that exits 2 when its type parse breaks.
 * A gate that cannot distinguish "config is clean" from "I cannot see anything" is exactly
 * the hazard, so breaking the parse deliberately must be visible as a distinct exit code,
 * not swallowed into a pass.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const CONFIG = path.join(ROOT, "vitest.config.ts");
const GATE = path.join(__dirname, "check-vitest-config.cjs");

const original = fs.readFileSync(CONFIG, "utf8");
const tmp = path.join(os.tmpdir(), `vitest-config-selftest-${process.pid}.ts`);

// Each case: mutate the config, expect an exit code and a substring in the output.
const CASES = [
	{
		name: "top-level dead key: `projects` (the B18 bug itself)",
		mutate: (t) => t.replace("export default defineConfig({", "export default defineConfig({\n\tprojects: [],"),
		expectCode: 1,
		expect: "projects",
	},
	{
		name: "nested dead key: `test.esbuild` (also silently ignored)",
		mutate: (t) => t.replace("\ttest: {", "\ttest: {\n\t\tesbuild: {},"),
		expectCode: 1,
		expect: "test.esbuild",
	},
	{
		name: "a key Vitest does not know at all",
		mutate: (t) => t.replace("export default defineConfig({", "export default defineConfig({\n\ttotallyNotAVitestOption: true,"),
		expectCode: 1,
		expect: "totallyNotAVitestOption",
	},
	{
		// The audit's M3: the first gate implementation matched ONE key per line, so a dead key
		// placed SECOND on a line passed unnoticed - the exact bug class escaping the gate built
		// for it. Object literals get compacted onto single lines by every formatter, so this
		// case is not hypothetical.
		name: "two keys on one line: the dead one must still be caught",
		mutate: (t) =>
			t.replace("\ttest: {", '\ttest: { environment: "jsdom", esbuild: {},'),
		expectCode: 1,
		expect: "test.esbuild",
	},
	{
		name: "control: the real config is clean",
		mutate: (t) => t,
		expectCode: 0,
		expect: "PASS",
	},
];

// The gate takes a ROOT as argv[2] and reads ROOT/vitest.config.ts, so it must be pointed
// at the staging directory - NOT at the real repo. Passing the real ROOT here made all three
// violation cases read the already-clean file and "pass" with nothing injected, which is
// precisely the failure this file is supposed to prevent.
function runGate(rootToCheck) {
	const r = spawnSync(process.execPath, [GATE, rootToCheck], { encoding: "utf8" });
	return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

// The gate reads ROOT/vitest.config.ts. To test a mutated copy without touching the real
// one, stage a throwaway ROOT that symlinks node_modules and carries the mutated config.
const stageRoot = path.join(os.tmpdir(), `vitest-root-${process.pid}`);
fs.mkdirSync(stageRoot, { recursive: true });
try {
	fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(stageRoot, "node_modules"), "junction");

	let failures = 0;
	for (const c of CASES) {
		const mutated = c.mutate(original);
		fs.writeFileSync(path.join(stageRoot, "vitest.config.ts"), mutated, "utf8");
		const r = runGate(stageRoot);
		const good = r.code === c.expectCode && r.out.includes(c.expect);
		if (good) {
			console.log(`ok    ${c.name} -> exit ${r.code}, saw "${c.expect}"`);
		} else {
			console.error(`FAIL  ${c.name} -> exit ${r.code} (expected ${c.expectCode} + "${c.expect}")`);
			console.error(r.out.split("\n").slice(0, 14).join("\n"));
			failures += 1;
		}
	}

	// Case: break the gate's own type read and require exit 2, not 0 or 1. Without this the
	// gate could pass by failing to see anything - the exact failure this repo keeps meeting.
	// Point it at a bridge file that does not exist, which is the first thing it needs.
	const brokenGate = path.join(stageRoot, "broken-gate.cjs");
	const gateSrc = fs.readFileSync(GATE, "utf8");
	fs.writeFileSync(
		brokenGate,
		gateSrc.replace(
			'"node_modules/vitest/dist/config.d.ts"',
			'"node_modules/vitest/dist/does-not-exist.d.ts"',
		),
		"utf8",
	);
	fs.writeFileSync(path.join(stageRoot, "vitest.config.ts"), original, "utf8");
	const b = spawnSync(process.execPath, [brokenGate, stageRoot], { encoding: "utf8" });
	const bout = `${b.stdout}${b.stderr}`;
	if (b.status === 2 && bout.includes("bridge type file missing")) {
		console.log("ok    gate refuses to report clean when it cannot read the types -> exit 2");
	} else {
		console.error(`FAIL  gate unreadable-types case -> exit ${b.status} (expected 2)`);
		console.error(bout.split("\n").slice(0, 10).join("\n"));
		failures += 1;
	}

	if (failures > 0) {
		console.error(`\ncheck-vitest-config SELF-TEST FAILED: ${failures} case(s). The gate is not trusted.`);
		process.exit(1);
	}
	console.log("\ncheck-vitest-config SELF-TEST PASS: all cases as specified.");
} finally {
	fs.rmSync(tmp, { force: true });
	try {
		fs.rmSync(path.join(stageRoot, "node_modules"), { force: true });
	} catch { /* junction: removing the link must not touch the target */ }
	fs.rmSync(stageRoot, { recursive: true, force: true });
}
