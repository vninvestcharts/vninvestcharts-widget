/**
 * agent-harness-core.cjs — logic THUẦN của tầng điều phối agent (không I/O ngoài FS).
 *
 * WHY A SHARED CORE.
 * The plugin (`.opencode/plugins/agent-harness.js`, ESM, chạy trong tiến trình opencode) and the
 * CLI gates (`scripts/gate-slice.cjs`, `scripts/attest-plan.cjs`, CommonJS) must agree on ONE
 * definition of "is this slice finished?". Two copies of that rule is how a gate ends up green
 * while the agent sees a different world. So the rule lives here, and both sides import it.
 *
 * WHAT IT MODELS (ported from planning-with-files + ralph-orchestrator backpressure, adapted):
 *  - plan on disk:  .planning/<SLICE_ID>/task_plan.md
 *  - progress:      .planning/<SLICE_ID>/ledger.jsonl   (append-only, one JSON object per line)
 *  - findings:      .planning/<SLICE_ID>/findings.md     (NOT auto-read: it is untrusted)
 *  - attestation:   .planning/<SLICE_ID>/.attestation    (sha256 of task_plan.md)
 *  - gate state:    .planning/<SLICE_ID>/.gate-state.json
 *
 * THE COMPLETION SIGNAL IS AN ARTIFACT, NOT PROSE.
 * A report that says "PASS" is not evidence. The gate reads the plan + ledger on disk, so the
 * thing the agent claims and the thing the gate checks are the same object.
 */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const PLANNING_DIR = ".planning";
const TASK_PLAN = "task_plan.md";
const LEDGER = "ledger.jsonl";
const ATTESTATION = ".attestation";
const GATE_STATE = ".gate-state.json";
const INJECT_LOG = ".inject-log.jsonl";
const OFFLOAD_DIR = "tool-output";
const OFFLOAD_MIN_LINES = 200;
const DEFAULT_BLOCK_CAP = 20;

const STATUS_IN_PROGRESS = "in_progress";

/** Parse `task_plan.md` into { goal, status, phases[] }. */
function parsePlan(text) {
	const lines = String(text || "").split(/\r?\n/);
	const plan = { goal: "", status: "", phases: [] };
	let current = null;
	for (const raw of lines) {
		const line = raw.replace(/\r$/, "");
		const goal = /^\*\*Goal:\*\*\s*(.+)$/.exec(line);
		if (goal && !plan.goal) plan.goal = goal[1].trim();
		const status = /^\*\*Status:\*\*\s*([A-Za-z_]+)/.exec(line);
		if (status && !current) plan.status = status[1].trim();
		const head = /^###\s+(.+)$/.exec(line);
		if (head) {
			current = { name: head[1].trim(), status: "", nextStep: "", body: [] };
			plan.phases.push(current);
			continue;
		}
		if (!current) continue;
		current.body.push(line);
		const s = /^\*\*Status:\*\*\s*([A-Za-z_]+)/.exec(line);
		if (s && !current.status) current.status = s[1].trim();
		const n = /^\*\*Next Step:\*\*\s*(.+)$/.exec(line);
		if (n && !current.nextStep) current.nextStep = n[1].trim();
	}
	return plan;
}

/** The phase the agent is supposed to be working on. */
function currentPhase(plan) {
	if (!plan || !Array.isArray(plan.phases)) return null;
	return plan.phases.find((p) => p.status === STATUS_IN_PROGRESS) || null;
}

/** sha256 of a string. */
function sha256(text) {
	return crypto.createHash("sha256").update(String(text), "utf8").digest("hex");
}

/** Read one slice directory. Returns null when the slice does not exist. */
function readSlice(root, sliceId) {
	const dir = path.join(root, PLANNING_DIR, sliceId);
	if (!fs.existsSync(path.join(dir, TASK_PLAN))) return null;
	const planText = fs.readFileSync(path.join(dir, TASK_PLAN), "utf8");
	const plan = parsePlan(planText);
	let ledger = [];
	const ledgerPath = path.join(dir, LEDGER);
	if (fs.existsSync(ledgerPath)) {
		ledger = fs
			.readFileSync(ledgerPath, "utf8")
			.split(/\r?\n/)
			.filter((l) => l.trim())
			.map((l) => {
				try {
					return JSON.parse(l);
				} catch {
					return { raw: l };
				}
			});
	}
	return {
		id: sliceId,
		dir,
		planText,
		plan,
		ledger,
		attestation: readAttestation(dir),
		state: readGateState(dir),
	};
}

/** All slice ids on disk. */
function listSlices(root) {
	const base = path.join(root, PLANNING_DIR);
	if (!fs.existsSync(base)) return [];
	return fs
		.readdirSync(base, { withFileTypes: true })
		.filter((e) => e.isDirectory() && fs.existsSync(path.join(base, e.name, TASK_PLAN)))
		.map((e) => e.name)
		.sort();
}

/**
 * Which slice is "current"?
 *  1. `VNSC_SLICE` env (explicit, wins)
 *  2. `.planning/current` file containing a slice id
 *  3. the only slice on disk
 *  4. otherwise null (the plugin then stays silent - fail-open, never invent a slice)
 */
function resolveSlice(root, env = process.env) {
	if (env.VNSC_SLICE) return env.VNSC_SLICE;
	const pointer = path.join(root, PLANNING_DIR, "current");
	if (fs.existsSync(pointer)) {
		const id = fs.readFileSync(pointer, "utf8").trim();
		if (id) return id;
	}
	const all = listSlices(root);
	return all.length === 1 ? all[0] : null;
}

/** Read the stored attestation (sha256 hex) or null. */
function readAttestation(dir) {
	const p = path.join(dir, ATTESTATION);
	if (!fs.existsSync(p)) return null;
	return fs.readFileSync(p, "utf8").trim().split(/\s+/)[0] || null;
}

/** Write the attestation for the current task_plan.md. */
function writeAttestation(dir) {
	const text = fs.readFileSync(path.join(dir, TASK_PLAN), "utf8");
	const hash = sha256(text);
	fs.writeFileSync(path.join(dir, ATTESTATION), `${hash}  ${TASK_PLAN}\n`, "utf8");
	return hash;
}

/** Compare the stored attestation with the plan on disk. */
function verifyAttestation(dir) {
	const expected = readAttestation(dir);
	if (!expected) return { ok: false, reason: "chua co attestation" };
	const actual = sha256(fs.readFileSync(path.join(dir, TASK_PLAN), "utf8"));
	return { ok: expected === actual, expected, actual, reason: expected === actual ? "ok" : "plan da bi sua sau khi attest" };
}

/** Read the gate state (how many times we already blocked, last ledger count). */
function readGateState(dir) {
	const p = path.join(dir, GATE_STATE);
	if (!fs.existsSync(p)) return { blockCount: 0, lastLedgerCount: null };
	try {
		return JSON.parse(fs.readFileSync(p, "utf8"));
	} catch {
		return { blockCount: 0, lastLedgerCount: null };
	}
}

/** Persist the gate state. */
function writeGateState(dir, state) {
	fs.writeFileSync(path.join(dir, GATE_STATE), `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

/**
 * THE GATE DECISION.
 * Block only when all three hold:
 *   (a) the plan has a phase still `in_progress`
 *   (b) the ledger has NOT advanced since the previous block  (no progress = no new attempt)
 *   (c) the block counter is below the cap (a cap is deliberate: a wedged slice must not deadlock
 *       the agent forever - the cap turns "blocked" into "blocked N times, then loud")
 * The reason is a FIXED template plus the phase NAME. Plan prose never enters the reason: the
 * reason is shown to a human deciding whether to unblock, and a self-written excuse would be
 * exactly the wrong thing to put there.
 */
function decideGate({ plan, ledger, state, cap = DEFAULT_BLOCK_CAP, sliceId, root }) {
	const phase = currentPhase(plan);
	if (!phase) {
		// Slice đã xong (không còn phase in_progress) + plan ghi `**Status:** done`
		// ⇒ bắt buộc có bằng chứng staging (Rule 17). Luật nằm ở core vì plugin
		// `.opencode/plugins/agent-harness.js` gọi `decideGate` TRỰC TIẾP — luật đặt ở CLI
		// sẽ bị bypass bởi người chỉ gõ `git commit`.
		const sliceDone = String(plan.status || "").toLowerCase() === "done";
		if (sliceDone && sliceId && root) {
			const { checkStagingEvidence } = require("./staging-evidence.cjs");
			const ev = checkStagingEvidence({ root, sliceId });
			if (ev.required && !ev.ok) {
				// Cap như luật phase: không kẹt vô hạn (M-5) — nhưng phải KÊU to.
				const blockCount = (state && state.blockCount) || 0;
				if (blockCount >= cap) {
					return { block: false, reason: `staging evidence: ${ev.reason} (dat chan ${blockCount} lan - cap ${cap}, de sang)`, phase: null, capped: true, warn: ev.reason };
				}
				return { block: true, phase: null, reason: ev.reason, stagingEvidence: true };
			}
			if (ev.warn) {
				return { block: false, reason: ev.reason, phase: null, warn: ev.warn };
			}
		}
		return { block: false, reason: "khong co phase in_progress", phase: null };
	}
	const count = Array.isArray(ledger) ? ledger.length : 0;
	const prev = state && typeof state.lastLedgerCount === "number" ? state.lastLedgerCount : count;
	if (count > prev) {
		return { block: false, reason: `ledger da tien (${prev} -> ${count})`, phase: phase.name };
	}
	const blockCount = (state && state.blockCount) || 0;
	if (blockCount >= cap) {
		return { block: false, reason: `dat chan ${blockCount} lan (cap ${cap}) - de sang`, phase: phase.name, capped: true };
	}
	return {
		block: true,
		phase: phase.name,
		reason: `Phase "${phase.name}" van in_progress va ledger khong tien (${count}/${prev}). Hoan tat phase truoc khi commit.`,
	};
}

/** Build the context block injected into the system prompt. */
function buildContextBlock({ slice, plan, nonce }) {
	const phase = currentPhase(plan);
	const idx = plan.phases.indexOf(phase);
	const total = plan.phases.length;
	const lines = [];
	lines.push(`===BEGIN-PLAN-${nonce}===`);
	lines.push(`# Slice ${slice.id}`);
	lines.push(`Goal: ${plan.goal || "(chua co goal)"}`);
	if (phase) {
		lines.push(`Phase: ${idx + 1}/${total} - ${phase.name}`);
		lines.push(`Status: ${phase.status}`);
		lines.push(`Next Step: ${phase.nextStep || "(chua khai bao)"}`);
		lines.push("");
		lines.push(phase.body.join("\n").trim());
	} else {
		lines.push(`Phase: (khong co phase in_progress / ${total} phase)`);
	}
	lines.push(`===END-PLAN-${nonce}===`);
	return lines.join("\n");
}

/** Append one line to the inject log (proof that the hook really fired). */
function appendInjectLog(dir, entry) {
	try {
		fs.appendFileSync(path.join(dir, INJECT_LOG), `${JSON.stringify(entry)}\n`, "utf8");
	} catch {
		/* fail-open: logging must never break the session */
	}
}

/**
 * Build the stub that replaces a huge tool output.
 *
 * WHY. A 3.000-line gate dump in the context is a 3.000-line tax on every following turn, and the
 * interesting parts of a long log are its head and its tail. The full text still exists - on disk,
 * at a path the agent is told to read - so nothing is lost, only the middle is not carried in the
 * context window.
 *
 * The head/tail are kept because a stub that drops BOTH ends is a stub the model cannot use: the
 * first line usually carries the command that ran, the last line usually carries the verdict.
 */
function buildOffloadStub({ tool, callID, original, head = 5, tail = 5, path }) {
	const text = String(original ?? "");
	const lines = text.split(/\r?\n/);
	const kept = lines.length > head + tail;
	const headPart = lines.slice(0, head);
	const tailPart = kept ? lines.slice(lines.length - tail) : [];
	const body = [
		`[${tool} output offloaded] ${lines.length} dong -> con ${headPart.length + tailPart.length} dong trong context.`,
		`File day du: ${path}`,
		`Doc lai bang: read ${path} (offset/limit) hoac grep tren file do.`,
		"",
		"--- head ---",
		...headPart,
	];
	if (kept) {
		body.push(`... [${lines.length - headPart.length - tailPart.length} dong bi cat] ...`, "--- tail ---", ...tailPart);
	}
	return { stub: body.join("\n"), kept, originalLines: lines.length, headLines: headPart.length, tailLines: tailPart.length };
}

module.exports = {
	PLANNING_DIR,
	TASK_PLAN,
	LEDGER,
	ATTESTATION,
	GATE_STATE,
	INJECT_LOG,
	DEFAULT_BLOCK_CAP,
	OFFLOAD_DIR,
	OFFLOAD_MIN_LINES,
	parsePlan,
	currentPhase,
	sha256,
	readSlice,
	listSlices,
	resolveSlice,
	readAttestation,
	writeAttestation,
	verifyAttestation,
	readGateState,
	writeGateState,
	decideGate,
	buildContextBlock,
	appendInjectLog,
	buildOffloadStub,
};
