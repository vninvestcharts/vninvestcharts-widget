/**
 * agent-harness.js — the agent's own coordination layer for OpenCode **v1**.
 *
 * WHAT IT IS: four hooks, one job — keep a long-running slice honest.
 *   inject  (experimental.chat.system.transform)  re-inject the slice plan EVERY model call, so a
 *                                                  long task does not lose its place after a
 *                                                  compaction or a context reset.
 *   attest  (same hook)                           pin the plan with a sha256; a changed plan is
 *                                                  reported instead of silently accepted.
 *   gate    (permission.ask)                      deny a `git commit` while the plan still has an
 *                                                  `in_progress` phase and the ledger has not moved.
 *   offload (tool.execute.after)                   replace a huge tool output with a head/tail stub
 *                                                  and keep the full text on disk.
 *   compact (experimental.session.compacting)     keep a pointer to the slice through compaction.
 *
 * HONEST LIMITS (do not describe this as more than it is):
 *  - OpenCode v1 has NO "Stop" hook. The agent can still end its turn; what the plugin does is
 *    deny the COMMIT and re-state the plan on the next turn. It is a brake, not a wall.
 *  - The attestation is a DRIFT DETECTOR, not a security boundary: the plan and its hash live in
 *    the same directory.
 *  - The nonce framing is not a security boundary either; it only makes "the plan text" and
 *    "the agent's own words about the plan" distinguishable in the transcript.
 *
 * WHY THE LOGIC IS NOT IN THIS FILE: the rule ("is this slice finished?") is shared with
 * `scripts/gate-slice.cjs` and `scripts/attest-plan.cjs` through
 * `scripts/lib/agent-harness-core.cjs`. Two copies of the rule is how the gate and the agent end
 * up disagreeing about reality.
 */

/** Load the shared core. A failure here must not take the session down. */
import fs from "node:fs";
import path from "node:path";

let core = null;
try {
	core = (await import("../../scripts/lib/agent-harness-core.cjs")).default;
} catch (e) {
	console.error(`[agent-harness] core khong load duoc (plugin se khong hook gi): ${e.message}`);
}

/** Last block reason, surfaced on the next injected block so the denial is not silent. */
let lastBlockReason = null;

function projectRoot(ctx) {
	return ctx?.directory || ctx?.worktree || process.cwd();
}

function log(ctx, level, message, extra) {
	try {
		ctx?.client?.app?.log?.({
			body: { service: "agent-harness", level, message, ...(extra || {}) },
		});
	} catch {
		/* logging must never break the session */
	}
}

export const AgentHarness = async (ctx) => {
	const root = projectRoot(ctx);

	/** Resolve the current slice + decide the gate outcome. */
	const evaluate = () => {
		if (!core) return null;
		const sliceId = core.resolveSlice(root);
		if (!sliceId) return null;
		const slice = core.readSlice(root, sliceId);
		if (!slice) return null;
		const decision = core.decideGate({ plan: slice.plan, ledger: slice.ledger, state: slice.state, sliceId: slice.id, root });
		return { slice, decision };
	};

	return {
		/** Re-inject the slice plan on every model call. */
		"experimental.chat.system.transform": async (input, output) => {
			try {
				if (!core) return;
				// Already injected in this request? Do not stack a second copy.
				if (output.system.some((s) => typeof s === "string" && s.includes("===BEGIN-PLAN-"))) return;
				const evaluated = evaluate();
				if (!evaluated) return;
				const { slice, decision } = evaluated;

				// Attestation: a plan that changed after it was pinned is reported, not injected.
				const att = core.verifyAttestation(slice.dir);
				const nonce = `${slice.id}-${Date.now().toString(36)}`;
				if (!att.ok) {
					output.system.push(
						[
							`===BEGIN-PLAN-${nonce}===`,
							`# Slice ${slice.id} — PLAN KHONG KHOP ATTESTATION`,
							`Task plan đã bị sửa sau khi attest (${att.reason}).`,
							att.expected ? `expected ${att.expected}` : "",
							att.actual ? `actual   ${att.actual}` : "",
							"Re-attest bằng: node scripts/attest-plan.cjs --slice " + slice.id,
							`===END-PLAN-${nonce}===`,
						]
							.filter(Boolean)
							.join("\n"),
					);
					core.appendInjectLog(slice.dir, { ts: Date.now(), event: "tampered", slice: slice.id, expected: att.expected, actual: att.actual });
					log(ctx, "warn", "plan tampered - khong inject plan", { slice: slice.id });
					return;
				}

				const block = core.buildContextBlock({ slice, plan: slice.plan, nonce });
				const reason = lastBlockReason;
				lastBlockReason = null;
				output.system.push(reason ? `${block}\n\n> Gate truoc do da chan: ${reason}` : block);
				core.appendInjectLog(slice.dir, {
					ts: Date.now(),
					event: "inject",
					slice: slice.id,
					nonce,
					sessionID: input?.sessionID || null,
					phase: decision.phase || null,
				});
			} catch (e) {
				log(ctx, "error", `inject that bai: ${e.message}`);
			}
		},

		/** Deny a `git commit` while the slice is unfinished. */
		"permission.ask": async (input, output) => {
			try {
				if (!core) return;
				const probe = [input?.pattern, input?.metadata?.command, input?.title, input?.metadata?.commandLine]
					.filter((v) => typeof v === "string")
					.join(" ");
				if (!/(^|[\s;&|])git\s+commit\b/.test(probe)) return;
				const evaluated = evaluate();
				if (!evaluated) return;
				const { slice, decision } = evaluated;
				// Cảnh báo (ví dụ staging evidence chưa xác minh được vì offline) phải **thấy được**,
				// không được bị nuốt im lặng trên đường deny (M-3).
				if (decision.warn) {
					log(ctx, "warn", `gate canh bao - ${decision.warn}`, { slice: slice.id });
				}
				if (!decision.block) return;
				const state = slice.state || { blockCount: 0, lastLedgerCount: slice.ledger.length };
				core.writeGateState(slice.dir, {
					blockCount: (state.blockCount || 0) + 1,
					lastLedgerCount: slice.ledger.length,
				});
				lastBlockReason = decision.reason;
				core.appendInjectLog(slice.dir, { ts: Date.now(), event: "deny", slice: slice.id, reason: decision.reason, phase: decision.phase });
				log(ctx, "warn", "deny git commit - slice chua xong", { slice: slice.id, reason: decision.reason });
				output.status = "deny";
			} catch (e) {
				log(ctx, "error", `gate that bai: ${e.message}`);
			}
		},

		/**
		 * Offload a huge tool output to disk and keep only its head/tail in the context.
		 *
		 * FAIL-OPEN BY DESIGN: if anything goes wrong (unwritable directory, missing slice, an
		 * error in the stub builder) the ORIGINAL output is kept. A failed offload must never cost
		 * the agent the output it already paid for.
		 */
		"tool.execute.after": async (input, output) => {
			try {
				if (!core) return;
				const original = typeof output?.output === "string" ? output.output : "";
				const minLines = Number(process.env.VNSC_OFFLOAD_LINES || core.OFFLOAD_MIN_LINES);
				if (!original) return;
				const lineCount = original.split(/\r?\n/).length;
				if (lineCount <= minLines) return;

				const evaluated = evaluate();
				const slice = evaluated ? evaluated.slice : null;
				const dir = slice ? path.join(slice.dir, core.OFFLOAD_DIR) : path.join(root, core.PLANNING_DIR, "_offload");
				fs.mkdirSync(dir, { recursive: true });
				const safeTool = String(input?.tool || "tool").replace(/[^a-zA-Z0-9._-]/g, "_");
				const safeCall = String(input?.callID || "call").replace(/[^a-zA-Z0-9._-]/g, "_");
				const file = path.join(dir, `${safeTool}-${safeCall}.txt`);
				fs.writeFileSync(file, original, "utf8");

				const { stub, originalLines, headLines, tailLines } = core.buildOffloadStub({
					tool: input?.tool || "tool",
					callID: input?.callID || "call",
					original,
					path: file,
				});
				output.output = stub;
				if (slice) {
					core.appendInjectLog(slice.dir, {
						ts: Date.now(),
						event: "offload",
						tool: input?.tool || "tool",
						callID: input?.callID || null,
						sessionID: input?.sessionID || null,
						originalLines,
						headLines,
						tailLines,
						file,
					});
				}
			} catch (e) {
				log(ctx, "error", `offload that bai (giu nguyen output goc): ${e.message}`);
			}
		},

		/** Keep a pointer to the slice through compaction. */
		"experimental.session.compacting": async (input, output) => {
			try {
				if (!core) return;
				const evaluated = evaluate();
				if (!evaluated) return;
				const { slice } = evaluated;
				output.context.push(
					[
						`## Slice dang chay: ${slice.id}`,
						`Goal: ${slice.plan.goal || "(chua co goal)"}`,
						`Phase hien tai: ${core.currentPhase(slice.plan)?.name || "(khong co phase in_progress)"}`,
						`Ke tiep: ${core.currentPhase(slice.plan)?.nextStep || "(chua khai bao)"}`,
						`Plan: .planning/${slice.id}/task_plan.md — doc lai file nay truoc khi lam viec.`,
					].join("\n"),
				);
			} catch (e) {
				log(ctx, "error", `compaction hook that bai: ${e.message}`);
			}
		},
	};
};

export default {
	id: "agent-harness",
	setup: AgentHarness,
};
