import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

// Fail-before proof (AC-6.24 / hazard 10).
//
// Hazard 11: NEVER `git checkout -- <file>` for this — it discards uncommitted
// work. Hazard 15: the restore MUST be in `finally`, because the whole point is
// that the mutated run is EXPECTED to fail (non-zero exit -> execFileSync throws)
// and that is exactly when a naive harness skips the restore line.
//
// The test/probe files are NOT reverted - only the SOURCE under test. The new
// tests must be self-contained (that was the Stage 3 W-03 lesson: a test that
// imports a symbol introduced later breaks at COLLECT time on the old tree and
// reports "fail" without ever checking behaviour).
// `fileURLToPath`, KHÔNG dùng `import.meta.url` thô: repo path chứa khoảng trắng
// nên URL encode thành `%20` và mọi lệnh đọc file trở thành ENOENT. Đã trúng lỗi
// này một lần — probe cũng từng hỏng vì lý do tương tự.
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = "1f54767";
const SOURCES = [
	"src/lib/pinescript/grammar.ts",
	"src/lib/pinescript/compile.ts",
	"src/lib/pinescript/pineBuiltins.ts",
	"src/lib/pinescript/pineBlocks.ts",
];

const snapshot = new Map();
for (const rel of SOURCES) snapshot.set(rel, fs.readFileSync(path.join(ROOT, rel)));

function run(cmd, args) {
	try {
		const out = execFileSync(cmd, args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
		return { code: 0, out };
	} catch (err) {
		return { code: typeof err.status === "number" ? err.status : 1, out: String(err.stdout || "") + String(err.stderr || "") };
	}
}

const results = [];
try {
	for (const rel of SOURCES) {
		const old = run("git", ["show", `${BASE}:${rel}`]);
		if (old.code !== 0) {
			results.push([rel, "CANNOT-READ-BASE"]);
			continue;
		}
		fs.writeFileSync(path.join(ROOT, rel), old.out);
	}

	const probe4 = run("node", ["scripts/probe-pine-stage4.mjs", "--assert"]);
	const probe3 = run("node", ["scripts/probe-pine-stage3.mjs", "--assert"]);
	const jsonOut = path.join(ROOT, ".failbefore-tmp.json");
	const vitest = run("npx", ["vitest", "run", "src/lib/pinescript/pineStage4.test.ts", "--reporter=json", `--outputFile=${jsonOut}`]);

	const t3 = /(\d+) case\(s\) run, (\d+) guarded by --assert, (\d+) unmet expectation\(s\), (\d+) NO_EXPECTATION/.exec(probe3.out) || [];
	const t4 = /(\d+) case, (\d+) guarded, (\d+) unmet, (\d+) NO_EXPECTATION/.exec(probe4.out) || [];
	results.push(["probe-stage4", `exit=${probe4.code} run=${t4[1]} unmet=${t4[3]} noExpect=${t4[4]}`]);
	results.push(["probe-stage3", `exit=${probe3.code} run=${t3[1]} unmet=${t3[3]} noExpect=${t3[4]}`]);
	results.push(["vitest pineStage4", `exit=${vitest.code}`]);

	if (fs.existsSync(jsonOut)) {
		const j = JSON.parse(fs.readFileSync(jsonOut, "utf8"));
		const failed = j.assertionResults.filter((a) => a.status === "failed");
		results.push(["  pineStage4 on OLD tree", `${j.numTotalTests} tests, ${j.numPassedTests} passed, ${failed.length} FAILED`]);
		for (const f of failed.slice(0, 40)) results.push(["    FAIL", f.fullName]);
		fs.unlinkSync(jsonOut);
	}
} finally {
	for (const [rel, buf] of snapshot) fs.writeFileSync(path.join(ROOT, rel), buf);
}

let clean = true;
for (const [rel, buf] of snapshot) {
	if (Buffer.compare(fs.readFileSync(path.join(ROOT, rel)), buf) !== 0) {
		clean = false;
		results.push(["NOT RESTORED", rel]);
	}
}
console.log(`\n=== fail-before on BASE ${BASE} ===`);
for (const [k, v] of results) console.log(`  ${k}: ${v}`);
console.log(`\nrestored byte-identical: ${clean}`);
process.exit(clean ? 0 : 1);