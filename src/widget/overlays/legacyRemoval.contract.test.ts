// @vitest-environment node
// L5: legacy removal lock — no source imports of deleted legacy modules.
// Allowlist: docs/ledger/tests themselves (they may NAME the modules).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = "src";

function collect(dir: string, out: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		if (entry === "node_modules") continue;
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) {
			collect(full, out);
		} else if (/\.(ts|tsx)$/.test(entry)) {
			out.push(full);
		}
	}
	return out;
}

const BANNED = [
	"useLegacyRuntime",
	"LegacyOverlayRegistry",
	"ForkOverlayRegistry",
	"useRuntimeOverlays",
	"from \"./DrawingLayer\"",
	"from \"../DrawingLayer\"",
	"from \"../../lib/drawing/DrawingLayer\"",
];

const ALLOWLIST = [
	"legacyRemoval.contract.test.ts",
	"overlays/index.ts",
	"@vninvestcharts/engine-drawing",
];

describe("L5 legacy removal lock", () => {
	it("no source imports deleted legacy modules (except allowlist)", () => {
		const offenders: string[] = [];
		for (const file of collect(SRC)) {
			if (file.includes("__tests__") || file.endsWith(".test.ts") || file.endsWith(".test.tsx")) continue;
			if (ALLOWLIST.some((a) => file.replace(/\\/g, "/").endsWith(a))) continue;
			const content = readFileSync(file, "utf8");
			for (const token of BANNED) {
				if (content.includes(token)) offenders.push(`${file} :: ${token}`);
			}
		}
		expect(offenders, `legacy imports alive:\n${offenders.join("\n")}`).toEqual([]);
	});

	it("runtime policy has no tool-lane fallback (auto = fork alias)", async () => {
		const { evaluateRuntimePolicy } = await import("../runtimePolicy");
		expect(evaluateRuntimePolicy({ engineRuntime: "auto", drawingUiEnabled: true, drawingActiveTool: "arc" }))
			.toEqual({ resolvedRuntime: "fork", reasonCode: "AUTO_DEFAULT_FORK_RUNTIME" });
		expect(evaluateRuntimePolicy({ engineRuntime: "auto", drawingUiEnabled: true, drawingActiveTool: "cursor", selectedDrawingType: "eraser" }))
			.toEqual({ resolvedRuntime: "fork", reasonCode: "AUTO_DEFAULT_FORK_RUNTIME" });
	});

	// G4 2026-10-03: this assertion used to pin `legacy` as still working, which was
	// the guard that held the lane closed until parity evidence existed. The lane is
	// gone now, so the guard inverts: `legacy` must no longer be requestable at all.
	it("the legacy runtime is no longer a valid request", async () => {
		const { evaluateRuntimePolicy, resolveRequestedRuntime } = await import("../runtimePolicy");
		// Type-level, "legacy" left RequestedWidgetRuntime. Behavioural, even if a host
		// smuggles the string past the type, the policy clamps it to fork rather than
		// handing back a runtime this build can no longer render.
		expect(resolveRequestedRuntime({ engineRuntime: "legacy" as never })).toBe("fork");
		expect(evaluateRuntimePolicy({ engineRuntime: "legacy" as never }).resolvedRuntime).toBe("fork");
		expect(evaluateRuntimePolicy({ engineRuntime: "legacy" as never }).reasonCode).toBe("EXPLICIT_FORK_REQUEST");
	});
});
