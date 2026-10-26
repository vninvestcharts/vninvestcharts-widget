// @vitest-environment node
/**
 * Unit tests for the agent-harness coordination layer.
 *
 * These are the tests that would catch a silent regression in the RULE ("is this slice
 * finished?"), not just in the plumbing. The rule is shared by the plugin and the CLI gates, so
 * it is tested once, here, and both sides consume it.
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const core = require("../lib/agent-harness-core.cjs");

const PLAN = [
	"**Goal:** ship the thing",
	"**Status:** in_progress",
	"",
	"## Phases",
	"### Phase 1 - first",
	"**Status:** in_progress",
	"**Next Step:** write the test",
	"detail line",
	"### Phase 2 - second",
	"**Status:** pending",
	"**Next Step:** later",
	"",
].join("\n");

function makeSlice(root: string, id = "S1", plan = PLAN, ledger: string[] = []) {
	const dir = path.join(root, core.PLANNING_DIR, id);
	fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(path.join(dir, core.TASK_PLAN), plan, "utf8");
	fs.writeFileSync(
		path.join(dir, core.LEDGER),
		ledger.map((l, i) => JSON.stringify({ ts: i, note: l })).join("\n") + (ledger.length ? "\n" : ""),
		"utf8",
	);
	return dir;
}

describe("agent-harness core: plan parsing", () => {
	it("reads goal, status and every phase", () => {
		const plan = core.parsePlan(PLAN);
		expect(plan.goal).toBe("ship the thing");
		expect(plan.status).toBe("in_progress");
		expect(plan.phases).toHaveLength(2);
		expect(plan.phases[0].name).toBe("Phase 1 - first");
		expect(plan.phases[0].status).toBe("in_progress");
		expect(plan.phases[0].nextStep).toBe("write the test");
		expect(plan.phases[1].status).toBe("pending");
	});

	it("picks the in_progress phase, not the first phase", () => {
		const plan = core.parsePlan(PLAN);
		expect(core.currentPhase(plan)?.name).toBe("Phase 1 - first");
		const done = core.parsePlan(PLAN.replace("**Status:** in_progress\n**Next Step:** write the test", "**Status:** done\n**Next Step:** write the test"));
		expect(core.currentPhase(done)).toBeNull();
	});

	it("survives a plan with no phases", () => {
		const plan = core.parsePlan("**Goal:** x\n**Status:** in_progress\n");
		expect(plan.phases).toHaveLength(0);
		expect(core.currentPhase(plan)).toBeNull();
	});
});

describe("agent-harness core: the gate rule", () => {
	it("blocks when a phase is in_progress and the ledger has not moved", () => {
		const d = core.decideGate({ plan: core.parsePlan(PLAN), ledger: [], state: { blockCount: 0, lastLedgerCount: 0 } });
		expect(d.block).toBe(true);
	});

	it("names the phase in the reason and keeps plan prose OUT of it", () => {
		const d = core.decideGate({ plan: core.parsePlan(PLAN), ledger: [], state: { blockCount: 0, lastLedgerCount: 0 } });
		expect(d.reason).toContain("Phase 1 - first");
		expect(d.reason).not.toContain("write the test");
	});

	it("stops blocking once the ledger advanced", () => {
		const d = core.decideGate({
			plan: core.parsePlan(PLAN),
			ledger: [{ ts: 1 }],
			state: { blockCount: 1, lastLedgerCount: 0 },
		});
		expect(d.block).toBe(false);
	});

	it("releases a wedged slice at the cap instead of deadlocking forever", () => {
		const d = core.decideGate({
			plan: core.parsePlan(PLAN),
			ledger: [],
			state: { blockCount: core.DEFAULT_BLOCK_CAP, lastLedgerCount: 0 },
		});
		expect(d.block).toBe(false);
		expect(d.capped).toBe(true);
	});

	it("never blocks a finished plan", () => {
		// NOTE: the plan-level `**Status:**` and the phase-level one are DIFFERENT lines. Replacing
		// the first occurrence only would leave the phase `in_progress` and the gate would (rightly)
		// still block - so target the phase line by its surrounding text.
		const finished = PLAN.replace(
			"**Status:** in_progress\n**Next Step:** write the test",
			"**Status:** done\n**Next Step:** write the test",
		).replace("**Status:** pending", "**Status:** done");
		expect(core.currentPhase(core.parsePlan(finished))).toBeNull();
		const d = core.decideGate({ plan: core.parsePlan(finished), ledger: [], state: { blockCount: 0, lastLedgerCount: 0 } });
		expect(d.block).toBe(false);
	});
});

describe("agent-harness core: attestation", () => {
	let root = "";
	beforeEach(() => {
		root = fs.mkdtempSync(path.join(os.tmpdir(), "ah-attest-"));
	});
	afterEach(() => {
		fs.rmSync(root, { recursive: true, force: true });
	});

	it("fails before attestation and passes after", () => {
		const dir = makeSlice(root);
		expect(core.verifyAttestation(dir).ok).toBe(false);
		const hash = core.writeAttestation(dir);
		expect(hash).toMatch(/^[0-9a-f]{64}$/);
		expect(core.verifyAttestation(dir).ok).toBe(true);
	});

	it("detects a plan edited after attestation", () => {
		const dir = makeSlice(root);
		core.writeAttestation(dir);
		fs.appendFileSync(path.join(dir, core.TASK_PLAN), "\ntampered\n", "utf8");
		const res = core.verifyAttestation(dir);
		expect(res.ok).toBe(false);
		expect(res.expected).not.toBe(res.actual);
	});
});

describe("agent-harness core: slice resolution", () => {
	let root = "";
	beforeEach(() => {
		root = fs.mkdtempSync(path.join(os.tmpdir(), "ah-slice-"));
	});
	afterEach(() => {
		fs.rmSync(root, { recursive: true, force: true });
	});

	it("finds the only slice on disk", () => {
		makeSlice(root, "ONLY");
		expect(core.resolveSlice(root, {})).toBe("ONLY");
	});

	it("returns null when several slices exist and none is selected", () => {
		makeSlice(root, "A");
		makeSlice(root, "B");
		expect(core.resolveSlice(root, {})).toBeNull();
	});

	it("lets the environment pick the slice", () => {
		makeSlice(root, "A");
		makeSlice(root, "B");
		expect(core.resolveSlice(root, { VNSC_SLICE: "B" })).toBe("B");
	});
});

describe("agent-harness core: the offload stub", () => {
	it("keeps head and tail and names the file", () => {
		const lines = Array.from({ length: 300 }, (_, i) => `line ${i + 1}`);
		const original = lines.join("\n");
		const { stub, kept, originalLines, headLines, tailLines } = core.buildOffloadStub({
			tool: "bash",
			callID: "c1",
			original,
			path: "/tmp/out.txt",
		});
		expect(kept).toBe(true);
		expect(originalLines).toBe(300);
		expect(headLines).toBe(5);
		expect(tailLines).toBe(5);
		expect(stub).toContain("line 1");
		expect(stub).toContain("line 300");
		expect(stub).not.toContain("line 150"); // the middle is what we are dropping
		expect(stub).toContain("/tmp/out.txt");
		expect(stub.length).toBeLessThan(original.length / 4);
	});

	it("does not truncate a short output", () => {
		const { kept, stub } = core.buildOffloadStub({ tool: "bash", callID: "c2", original: "a\nb\nc", path: "/tmp/x" });
		expect(kept).toBe(false);
		expect(stub).toContain("a\nb\nc");
	});
});

describe("agent-harness core: the injected context block", () => {
	it("carries goal, phase, next step and the nonce framing", () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "ah-ctx-"));
		try {
			const dir = makeSlice(root);
			const slice = core.readSlice(root, "S1");
			const block = core.buildContextBlock({ slice, plan: slice.plan, nonce: "N7" });
			expect(block).toContain("===BEGIN-PLAN-N7===");
			expect(block).toContain("===END-PLAN-N7===");
			expect(block).toContain("Goal: ship the thing");
			expect(block).toContain("Phase: 1/2");
			expect(block).toContain("Next Step: write the test");
			// the CURRENT phase body is included in full - a truncated phase is how an agent
			// loses the one line it needed
			expect(block).toContain("detail line");
			expect(dir).toBeTruthy();
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});
});
