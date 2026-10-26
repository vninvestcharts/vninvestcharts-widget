// @vitest-environment jsdom
// L0 baseline: selecting an authoringBeta drawing under engineRuntime="auto"
// flips the whole runtime (contentRuntimeKey fork->legacy = content remount).
// Pre-L1 this FAILS-by-design documentation (flip happens); L1 must turn it green.
import { act, createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { useWidgetRuntime } from "../useWidgetRuntime";

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

describe("L0 runtime flip baseline (pre-L1)", () => {
	it("auto + select arc keeps a STABLE fork runtime (no content remount)", () => {
		const container = document.createElement("div");
		document.body.appendChild(container);
		const root = createRoot(container);
		const seen: string[] = [];
		function Probe() {
			const [sel, setSel] = useState<string | null>(null);
			const rt = useWidgetRuntime({
				engineRuntime: "auto",
				drawingUiEnabled: true,
				drawingActiveTool: "cursor",
				selectedDrawingType: sel,
			});
			(seen as string[]).push(rt.contentRuntimeKey);
			(Probe as any).select = setSel;
			return null;
		}
		act(() => { root.render(createElement(Probe)); });
		expect(seen[seen.length - 1].startsWith("fork")).toBe(true);
		act(() => { (Probe as any).select("arc"); });
		// Post-L1 expectation: still fork (no remount). Pre-L1 this FAILS (legacy).
		expect(seen[seen.length - 1].startsWith("fork")).toBe(true);
		act(() => { root.unmount(); });
		container.remove();
	});
});
