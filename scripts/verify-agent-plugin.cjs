#!/usr/bin/env node
/**
 * verify-agent-plugin.cjs — proof that the agent-harness plugin is ALIVE.
 *
 * WHY THIS FILE EXISTS. A plugin that is never called is a very convincing piece of decoration:
 * the file exists, the API names look right, the unit tests pass against the shared core - and
 * OpenCode never invokes the hook, so the gate silently does nothing. The only way to know is to
 * CALL the hook and observe the effect.
 *
 * TWO LEVELS:
 *   L1 (default, no model, no network) — import the plugin module the way OpenCode does, call
 *      each hook with a synthetic input/output, and assert the OBSERVABLE effect:
 *        - inject pushes exactly ONE plan block (and does not stack a second copy)
 *        - a tampered plan is reported and NOT injected
 *        - `permission.ask` flips a `git commit` to "deny" and leaves other commands alone
 *        - the compaction hook leaves a pointer to the slice
 *        - an empty repo (no slice) is a no-op, not a crash
 *   L2 (--live) — run a real `opencode run` in a throwaway fixture project and prove the inject
 *      log grew, i.e. a REAL opencode process called the hook. Costs one model call.
 *
 * EXIT: 0 = all checks passed · 1 = a check failed.
 *
 * Usage:
 *   node scripts/verify-agent-plugin.cjs            # L1
 *   node scripts/verify-agent-plugin.cjs --live     # L1 + L2
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { spawnSync } = require("node:child_process");
const core = require("./lib/agent-harness-core.cjs");

const ROOT = path.resolve(__dirname, "..");
const PLUGIN = path.join(ROOT, ".opencode", "plugins", "agent-harness.js");

const results = [];
const check = (name, ok, detail) => results.push({ name, ok: !!ok, detail });

/**
 * Run opencode WITHOUT a shell.
 *
 * On Windows `opencode` is a .ps1 npm shim, and a shell mangles a prompt that contains quotes and
 * `node -e "..."` into a usage error (measured: the first L3 run printed the CLI help and exited
 * 1). Calling the real binary with an argv array removes the quoting layer entirely.
 */
function opencodeBin() {
	const exe = path.join(
		process.env.APPDATA || path.join(process.env.USERPROFILE || "", "AppData", "Roaming"),
		"npm",
		"node_modules",
		"opencode-ai",
		"bin",
		"opencode.exe",
	);
	return fs.existsSync(exe) ? exe : "opencode";
}

function runOpencode(args, timeout = 240000) {
	return spawnSync(opencodeBin(), args, { encoding: "utf8", timeout });
}

/** Build a throwaway project with one slice in progress. */
function makeFixture() {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "ah-plugin-"));
	const dir = path.join(root, core.PLANNING_DIR, "S1");
	fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(
		path.join(dir, core.TASK_PLAN),
		["**Goal:** prove the plugin", "**Status:** in_progress", "", "## Phases", "### Phase 1 - wire it", "**Status:** in_progress", "**Next Step:** call the hook", "body of the phase", ""].join("\n"),
		"utf8",
	);
	fs.writeFileSync(path.join(dir, core.LEDGER), "", "utf8");
	core.writeAttestation(dir);
	return { root, dir };
}

/**
 * Copy the plugin + its core into the fixture, mirroring a FRESH CLONE layout.
 * `opencode run --dir <fixture>` loads plugins from `<fixture>/.opencode/plugins/`, so a fixture
 * without the plugin proves nothing about the plugin. Copying also proves the layout a new
 * clone gets: the plugin finds its core at `../../scripts/lib/agent-harness-core.cjs`.
 */
function installPlugin(root) {
	const pluginDir = path.join(root, ".opencode", "plugins");
	const coreDir = path.join(root, "scripts", "lib");
	fs.mkdirSync(pluginDir, { recursive: true });
	fs.mkdirSync(coreDir, { recursive: true });
	fs.copyFileSync(PLUGIN, path.join(pluginDir, "agent-harness.js"));
	fs.copyFileSync(path.join(__dirname, "lib", "agent-harness-core.cjs"), path.join(coreDir, "agent-harness-core.cjs"));
}

async function loadHooks(fixtureRoot) {
	const mod = await import(pathToFileURL(PLUGIN).href);
	if (!mod.AgentHarness) throw new Error("plugin khong export AgentHarness");
	return mod.AgentHarness({
		directory: fixtureRoot,
		worktree: fixtureRoot,
		client: { app: { log: () => {} } },
		project: { id: "probe" },
		$: () => {},
	});
}

async function level1() {
	// (1) the plugin module must even load
	let hooks;
	const { root, dir } = makeFixture();
	try {
		hooks = await loadHooks(root);
		check("plugin module load duoc + export AgentHarness", typeof hooks === "object" && hooks !== null, "");
	} catch (e) {
		check("plugin module load duoc + export AgentHarness", false, e.message);
		return;
	}

	// (2) inject pushes ONE block with the plan
	const out1 = { system: [] };
	await hooks["experimental.chat.system.transform"]({ sessionID: "ses_probe" }, out1);
	check("inject pushes 1 block", out1.system.length === 1, `system=${out1.system.length}`);
	check("inject block co BEGIN/END nonce", /===BEGIN-PLAN-/.test(out1.system[0] || ""), (out1.system[0] || "").slice(0, 80));
	check("inject block co Goal + Phase + Next Step", /Goal: prove the plugin/.test(out1.system[0] || "") && /Next Step: call the hook/.test(out1.system[0] || ""), "");

	// (3) no stacking: a second call on the SAME output must not add a second block
	await hooks["experimental.chat.system.transform"]({ sessionID: "ses_probe" }, out1);
	check("inject khong chong block (1 request = 1 block)", out1.system.length === 1, `system=${out1.system.length}`);

	// (4) a tampered plan is REPORTED and NOT injected as a plan
	fs.appendFileSync(path.join(dir, core.TASK_PLAN), "\n<!-- tampered -->\n", "utf8");
	const out2 = { system: [] };
	await hooks["experimental.chat.system.transform"]({ sessionID: "ses_probe" }, out2);
	check("plan bi sua => bao cao KHONG KHOP ATTESTATION", /ATTESTATION/.test(out2.system[0] || ""), (out2.system[0] || "").slice(0, 80));
	check("plan bi sua => KHONG inject plan", !/Goal: prove the plugin/.test(out2.system[0] || ""), "");

	// (5) the gate denies a commit while the slice is unfinished
	const denied = { status: "ask" };
	await hooks["permission.ask"]({ id: "p1", type: "bash", pattern: "git commit -m wip" }, denied);
	check("permission.ask: git commit => DENY", denied.status === "deny", `status=${denied.status}`);

	// (6) other commands are left alone
	const other = { status: "ask" };
	await hooks["permission.ask"]({ id: "p2", type: "bash", pattern: "npm test" }, other);
	check("permission.ask: lenh khac => khong doi", other.status === "ask", `status=${other.status}`);

	// (7) the compaction hook leaves a pointer to the slice
	const ctxOut = { context: [] };
	await hooks["experimental.session.compacting"]({ sessionID: "ses_probe" }, ctxOut);
	check("compaction hook giu con tro toi slice", /Slice dang chay: S1/.test(ctxOut.context[0] || ""), (ctxOut.context[0] || "").slice(0, 80));

	// (8) an empty project is a no-op, not a crash
	const empty = fs.mkdtempSync(path.join(os.tmpdir(), "ah-empty-"));
	try {
		const emptyHooks = await loadHooks(empty);
		const out3 = { system: [] };
		await emptyHooks["experimental.chat.system.transform"]({ sessionID: "ses_x" }, out3);
		check("khong co slice => inject khong lam gi (fail-open)", out3.system.length === 0, `system=${out3.system.length}`);
	} catch (e) {
		check("khong co slice => inject khong lam gi (fail-open)", false, e.message);
	} finally {
		fs.rmSync(empty, { recursive: true, force: true });
	}

	// (9) offload: a huge tool output is replaced by a stub, the full text lands on disk
	const big = Array.from({ length: 400 }, (_, i) => `row ${i + 1}`).join("\n");
	const outBig = { title: "bash", output: big, metadata: {} };
	await hooks["tool.execute.after"]({ tool: "bash", callID: "call_big", sessionID: "ses_probe" }, outBig);
	check("offload: output lon => thay bang stub", /output offloaded/.test(outBig.output), outBig.output.slice(0, 90));
	check("offload: stub co head + tail", outBig.output.includes("row 1") && outBig.output.includes("row 400"), "");
	check("offload: stub KHONG con dong giua", !outBig.output.includes("row 200"), "");
	const offloadDir = path.join(dir, core.OFFLOAD_DIR);
	const offFiles = fs.existsSync(offloadDir) ? fs.readdirSync(offloadDir) : [];
	check("offload: file day du duoc ghi ra dia", offFiles.length === 1 && fs.readFileSync(path.join(offloadDir, offFiles[0]), "utf8").length === big.length, `files=${offFiles.join(",")}`);

	// (10) offload: a small output is left alone
	const small = "just one line";
	const outSmall = { title: "bash", output: small, metadata: {} };
	await hooks["tool.execute.after"]({ tool: "bash", callID: "call_small", sessionID: "ses_probe" }, outSmall);
	check("offload: output nho => giu nguyen", outSmall.output === small, outSmall.output.slice(0, 60));

	fs.rmSync(root, { recursive: true, force: true });
}

/** L2: a REAL opencode process calls the hook. */
function level2() {
	const { root, dir } = makeFixture();
	try {
		installPlugin(root);
		const before = fs.existsSync(path.join(dir, core.INJECT_LOG))
			? fs.readFileSync(path.join(dir, core.INJECT_LOG), "utf8").split(/\r?\n/).filter(Boolean).length
			: 0;
		const res = runOpencode(["run", "--dir", root, "reply with the single word: ok"], 180000);
		const after = fs.existsSync(path.join(dir, core.INJECT_LOG))
			? fs.readFileSync(path.join(dir, core.INJECT_LOG), "utf8").split(/\r?\n/).filter(Boolean).length
			: 0;
		check("opencode that da goi hook (inject log tang)", after > before, `before=${before} after=${after} exit=${res.status}`);
		if (after === before) {
			check(
				"opencode stderr co dong plugin",
				/agent-harness|plugin/i.test(`${res.stderr || ""}${res.stdout || ""}`),
				String(res.stderr || "").slice(0, 200),
			);
		}
	} catch (e) {
		check("opencode that da goi hook (inject log tang)", false, e.message);
	} finally {
		fs.rmSync(root, { recursive: true, force: true });
	}
}

/**
 * L3: does the mutation in `tool.execute.after` actually reach the MODEL?
 *
 * This is the question a unit test cannot answer: the hook receives `output` and mutates it,
 * but only the transcript proves the model saw the replacement. So: run a real session whose tool
 * prints 300 lines with a marker in the MIDDLE, then export the session and look at what the
 * model was given. If the transcript holds the stub and NOT the middle marker, the offload is
 * real; if the transcript still holds all 300 lines, the hook is decoration and this check goes
 * red - which is the whole point of writing it.
 */
function level3() {
	const { root, dir } = makeFixture();
	try {
		installPlugin(root);
		const marker = "MIDDLE_MARKER_XYZZY";
		const prompt = `Run exactly this command with the bash tool and then reply with the single word OK: node -e "for(let i=1;i<=300;i++){console.log(i===150?'${marker}':'row '+i)}"`;
		const res = runOpencode(["run", "--dir", root, prompt], 240000);
		check("opencode chay xong (L3)", res.status === 0, `exit=${res.status} ${String(res.stderr || "").slice(0, 160)}`);

		// the offload log tells us which session produced the big output
		const logPath = path.join(dir, core.INJECT_LOG);
		const entries = fs.existsSync(logPath)
			? fs.readFileSync(logPath, "utf8").split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return {}; } })
			: [];
		const offload = entries.find((e) => e.event === "offload");
		check("hook offload da chay tren session that", !!offload, `events=${entries.map((e) => e.event).join(",")}`);
		if (!offload) return;
		const sessionID = offload.sessionID;
		check("offload co sessionID de export", !!sessionID, String(sessionID));

		const exp = runOpencode(["export", sessionID], 120000);
		const transcript = `${exp.stdout || ""}`;
		check("export session thanh cong", exp.status === 0 && transcript.length > 0, `exit=${exp.status} len=${transcript.length}`);

		// WHAT THE MODEL ACTUALLY RECEIVED is `parts[].state.output`. OpenCode keeps the RAW
		// output in `state.metadata.output` (nothing is lost - it is still on disk and still in
		// the transcript). The first version of this check asserted "the transcript must not
		// contain the marker" and it FAILED - correctly, because the raw copy is kept on purpose.
		// The measurable claim is narrower and true: the CONTEXT the model got is the stub, and
		// it is much shorter than the raw output.
		let part = null;
		try {
			const data = JSON.parse(exp.stdout);
			for (const msg of data?.messages || []) {
				for (const p of msg?.parts || []) {
					const out = p?.state?.output;
					if (typeof out === "string" && out.includes("output offloaded")) part = p;
				}
			}
		} catch (e) {
			check("export parse duoc JSON", false, e.message);
		}
		check("co tool part chua STUB trong state.output", !!part, "");
		if (part) {
			const contextText = part.state.output;
			const rawText = part.state?.metadata?.output || "";
			check("context model = STUB (khong con dong giua)", !contextText.includes(marker), "marker con trong context => mutation khong toi model");
			check("context ngan hon raw nhieu lan", rawText.length > 0 && contextText.length < rawText.length / 2, `context=${contextText.length} raw=${rawText.length}`);
			check("opencode van giu ban GOC trong metadata.output (khong mat du lieu)", rawText.includes(marker), `raw len=${rawText.length}`);
		}
	} catch (e) {
		check("L3 khong crash", false, e.message);
	} finally {
		fs.rmSync(root, { recursive: true, force: true });
	}
}

(async () => {
	await level1();
	if (process.argv.includes("--live")) level2();
	if (process.argv.includes("--live-offload")) level3();
	let failed = 0;
	for (const r of results) {
		if (!r.ok) failed++;
		console.log(`${r.ok ? "ok  " : "FAIL"} ${r.name}${r.detail ? "  " + r.detail : ""}`);
	}
	console.log(`verify-agent-plugin: ${results.length - failed}/${results.length} case`);
	process.exit(failed ? 1 : 0);
})();
