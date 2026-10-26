#!/usr/bin/env node
/**
 * check-runbook-commands.cjs — every command an operator is told to run must be runnable.
 *
 * WHY THIS EXISTS. `deploy/CHARTS-TEST.md` section 6 told the operator to run
 * `node scripts/verify-env.cjs`. That script has never existed. Nobody found out for three days,
 * because the doc gate that catches citations to files that are not there matched only
 * backticked spans, the phantom command lives inside a fenced block - and `deploy/` sat outside
 * every doc gate at the time. (2026-10-18: `check-doc-links.mjs` now scans `deploy/` too, but a
 * fenced command carries no backticks, so it remains invisible to that matcher by construction.
 * The command-resolution half is THIS gate's, and both stay wired in the matrix.)
 *
 * This closes exactly that gap and nothing wider:
 *   node <path>      -> the path must exist on disk
 *   npm run <name>   -> the script must exist in package.json
 *   docker / ssh / scp / curl  -> NOT checked; they belong to the VPS, not to this repo
 *
 * A dead command in a runbook is worse than no runbook: it costs an operator a debugging session
 * and it erodes trust in every other line of the same file.
 *
 * Usage:  node scripts/check-runbook-commands.cjs [--self-test] [--root <dir>]
 * Exit:   0 every referenced command resolves · 1 at least one does not · 2 not verifiable
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(process.argv.includes("--root") ? process.argv[process.argv.indexOf("--root") + 1] : path.join(__dirname, ".."));
const SCAN_DIRS = ["deploy"];

/**
 * Pull command-looking tokens out of a markdown file.
 * ONLY fenced blocks. Inline code spans were tried and produce a false positive: prose that
 * *mentions* a command is not an instruction (the full rationale sits inside the loop below).
 */
function extractCommands(text) {
	const found = [];
	const push = (m) => {
		const trimmed = m.trim().replace(/^[`\s]+|[`\s]+$/g, "");
		if (!trimmed) return;
		// Strip a trailing comment and any line continuation so the token is the command itself.
		const line = trimmed.split(/\s{2,}#|\\\r?\n/)[0].trim();
		found.push(line);
	};
	// ONLY fenced code blocks. Inline code spans were tried and produced a false positive: prose
	// that mentions a command - "the old runbook pointed at `node scripts/verify-env.cjs`, which
	// does not exist" - is not an instruction, and flagging it would train people to ignore this
	// gate. The phantom command that motivated the gate sat inside a fenced block, so nothing real
	// is lost. Precision over recall, on purpose.
	for (const m of text.matchAll(/```[a-z]*\r?\n([\s\S]*?)```/g)) {
		for (const raw of m[1].split(/\r?\n/)) push(raw);
	}
	return found;
}

/** Resolve one command to the thing it needs, or null when it is out of scope. */
function resolveCommand(command) {
	const node = command.match(/^node\s+([A-Za-z0-9_./-]+\.(?:c|m)?js)\b/);
	if (node) return { kind: "file", value: node[1] };

	const npm = command.match(/^npm\s+run\s+([A-Za-z0-9:_-]+)/);
	if (npm) return { kind: "npm-script", value: npm[1] };

	return null;
}

/**
 * The pure verdict. The self-test drives this directly with a synthetic repo so it never measures
 * its own matching: the interesting failures are "a runbook naming a file that does not exist",
 * and a check that only ever sees a clean tree cannot prove it would have caught one.
 */
function check(root, scanDirs = SCAN_DIRS) {
	const problems = [];
	let scanned = 0;
	let checked = 0;

	let pkgScripts = new Set();
	try {
		pkgScripts = new Set(Object.keys(JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).scripts ?? {}));
	} catch {
		return { problems: [{ file: "package.json", detail: "cannot be read - nothing can be verified" }], scanned: 0, checked: 0 };
	}

	for (const dir of scanDirs) {
		const abs = path.join(root, dir);
		if (!fs.existsSync(abs)) continue;
		for (const name of fs.readdirSync(abs)) {
			if (!name.endsWith(".md")) continue;
			const rel = `${dir}/${name}`;
			scanned++;
			const text = fs.readFileSync(path.join(abs, name), "utf8");
			for (const command of extractCommands(text)) {
				const need = resolveCommand(command);
				if (!need) continue;
				checked++;
				if (need.kind === "file" && !fs.existsSync(path.join(root, need.value))) {
					problems.push({ file: rel, detail: `references ${need.value}, which does not exist` });
				}
				if (need.kind === "npm-script" && !pkgScripts.has(need.value)) {
					problems.push({ file: rel, detail: `references \`npm run ${need.value}\`, which is not a script in package.json` });
				}
			}
		}
	}
	return { problems, scanned, checked };
}

/* ------------------------------------------------------------------ self-test */

function selfTest() {
	const tmp = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "runbook-cmds-"));
	const results = [];
	const mk = (md) => {
		fs.mkdirSync(path.join(tmp, "deploy"), { recursive: true });
		fs.writeFileSync(path.join(tmp, "package.json"), JSON.stringify({ scripts: { "build:docs": "x", watch: "y" } }));
		fs.mkdirSync(path.join(tmp, "scripts"), { recursive: true });
		fs.writeFileSync(path.join(tmp, "scripts", "real.cjs"), "// exists\n");
		fs.writeFileSync(path.join(tmp, "deploy", "RUNBOOK.md"), md);
	};
	const run = (name, md, expectZero, fragment) => {
		fs.rmSync(path.join(tmp, "deploy"), { recursive: true, force: true });
		mk(md);
		const r = check(tmp);
		const zero = r.problems.length === 0;
		const matched = fragment ? r.problems.some((p) => p.detail.includes(fragment)) : true;
		const ok = zero === expectZero && matched;
		results.push({ name, expectZero, gotZero: zero, problems: r.problems.length, verdict: ok ? "OK" : "BROKEN" });
	};

	run("a missing script file", "Run:\n```bash\nnode scripts/ghost.cjs --check\n```\n", false, "does not exist");
	run("a missing npm script in a fenced block", "Run:\n```bash\nnpm run no-such-gate\n```\n", false, "not a script in package.json");
	run("valid commands", "```bash\nnpm run build:docs\nnode scripts/real.cjs\n```\n", true, null);
	run("out-of-scope commands are ignored", "```bash\ndocker compose -f docker-compose.charts-test.yml down\nssh root@host \"ls\"\ncurl -s https://x/health.json\n```\n", true, null);
	run("prose that merely mentions node is not a command", "The `node scripts/ghost.cjs` file does not exist here, as noted.", true, null);

	fs.rmSync(tmp, { recursive: true, force: true });
	console.log("check-runbook-commands SELF-TEST");
	for (const r of results) console.log(`  ${r.verdict.padEnd(7)} ${r.name}  (problems=${r.problems})`);
	const broken = results.filter((r) => r.verdict === "BROKEN").length;
	console.log(`  ${results.length} case(s), ${broken} broken`);
	console.log(broken ? "SELF-TEST FAILED" : "SELF-TEST PASS");
	process.exit(broken ? 1 : 0);
}

if (process.argv.includes("--self-test")) {
	selfTest();
} else {
	const { problems, scanned, checked } = check(ROOT);
	console.log(`check-runbook-commands: ${scanned} runbook(s) scanned, ${checked} command reference(s) resolved`);
	if (problems.length) {
		console.error(`FAIL: ${problems.length} runbook command(s) do not resolve`);
		for (const p of problems) console.error(`  ${p.file}: ${p.detail}`);
		process.exit(1);
	}
	console.log("PASS: every command a runbook tells an operator to run exists.");
}