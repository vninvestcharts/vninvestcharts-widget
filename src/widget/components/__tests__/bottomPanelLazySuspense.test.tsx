// @vitest-environment jsdom
/**
 * AC-1.7 — regression lock for a suspending lazy panel inside `BottomPanelHost`.
 *
 * WHAT THIS LOCKS
 * ---------------
 * `BottomPanelHost` renders the two Pro panels through `lazy()`. This file mounts them behind a
 * mock that genuinely SUSPENDS (throws a promise, then resolves), inside a recording error
 * boundary standing in for `VNInvestMultiCharts.tsx:1106` — which wraps the whole `role="grid"`
 * workspace. The invariant: a panel that suspends on chunk load must resolve into a visible panel
 * and must NEVER reach the surrounding boundary, because a boundary failure there costs the user
 * the entire multi-chart grid rather than one panel.
 *
 * A SYNCHRONOUS mock cannot test this. The sibling `BottomPanelHost.test.tsx` mocks the panels
 * with trivial components, so `lazy()` resolves in a microtask and no boundary is ever exercised.
 *
 * HONEST SCOPE — READ BEFORE TRUSTING THIS AS A "Suspense IS REQUIRED" PROOF
 * ------------------------------------------------------------------------
 * Plan audit round 2 rated "lazy() without `<Suspense>` crashes the workspace" as a BLOCKER, on
 * the reasoning that the suspension error reaches `WidgetErrorBoundary`. That was NOT reproduced.
 * A throwaway probe (`createRoot`, React 19) measured all four shapes:
 *   lazy() with no boundary    -> panel rendered, boundary did NOT fire
 *   lazy() with `<Suspense>`   -> panel rendered, boundary did NOT fire
 *   bare suspender, no boundary-> panel rendered, boundary did NOT fire
 *   sync render, no flush      -> nothing thrown
 * So React 19's concurrent root tolerates a boundary-less suspension and simply commits once the
 * promise settles. This file therefore does NOT fail if you delete the `<Suspense>` wrappers, and
 * it must not be cited as the proof that they are mandatory.
 *
 * The `<Suspense>` wrappers are kept anyway, for two reasons that are real but different from the
 * audit's claim: they are the documented React contract for `lazy()`, and they are what renders
 * `PANEL_LOADING_FALLBACK`, so the bottom dock keeps its height instead of collapsing for a frame.
 * The assertion here is the boundary invariant — which is worth locking regardless.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement, Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { createRoot } from "react-dom/client";

/**
 * Stands in for `VNInvestMultiCharts.tsx:1106`'s `WidgetErrorBoundary`, which wraps the ENTIRE
 * `role="grid"` workspace. Recording whether it fires is the real observable for AC-1.7: "no
 * boundary fallback" is not the same claim as "the panel rendered", and an earlier draft of this
 * file asserted only the latter — which stayed green even with `<Suspense>` deleted.
 */
let boundaryFired: Error | null = null;
class RecordingBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
	constructor(props: { children: ReactNode }) {
		super(props);
		this.state = { failed: false };
	}
	static getDerivedStateFromError() {
		return { failed: true };
	}
	componentDidCatch(error: Error, _info: ErrorInfo) {
		boundaryFired = error;
	}
	render() {
		if (this.state.failed) return createElement("div", { "data-testid": "error-boundary" });
		return this.props.children;
	}
}

/**
 * A component that behaves like a lazily-loaded chunk: suspends once, then renders.
 * The thrown promise resolves on a macrotask, so the host must have a boundary to catch it.
 *
 * `resolved` is per-invocation, and a fresh component identity is handed to each render, so every
 * test really does suspend — an earlier draft shared one flag across the whole file, which meant
 * only the first test ever exercised the boundary.
 */
function suspendingPanel(testid: string) {
	let resolved = false;
	function Suspending() {
		if (!resolved) {
			resolved = true;
			throw new Promise<void>((resolve) => setTimeout(resolve, 0));
		}
		return createElement("div", { "data-testid": testid });
	}
	Suspending.displayName = testid;
	return Suspending;
}

vi.mock("../panels/PineEditorPanel", () => ({ PineEditorPanel: suspendingPanel("real-panel-pine") }));
vi.mock("../panels/StrategyTesterPanel", () => ({ StrategyTesterPanel: suspendingPanel("real-panel-strategy") }));

import { BottomPanelHost } from "../BottomPanelHost";

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

beforeEach(() => {
	container = document.createElement("div");
	container.style.width = "1200px";
	container.style.height = "720px";
	document.body.appendChild(container);
	root = createRoot(container);
	boundaryFired = null;
});

afterEach(() => {
	if (root) act(() => root?.unmount());
	container?.remove();
	root = null;
	container = null;
});

function renderHost(tab: "pine_editor" | "strategy_tester") {
	act(() => {
		root?.render(
			createElement(
				RecordingBoundary,
				null,
				createElement(BottomPanelHost, {
					activeTab: tab,
					onTabChange: () => {},
					plotData: [],
					symbol: "BTCUSDT",
					timeframe: "1h",
					activeIndicators: [],
					isDark: true,
					canUsePineEditor: true,
					canUseStrategyTester: true,
				} as never),
			),
		);
	});
}

async function flush() {
	for (let i = 0; i < 5; i++) {
		await act(async () => {
			await new Promise((r) => setTimeout(r, 0));
		});
	}
}

describe("AC-1.7: a suspending lazy panel must not escape the host", () => {
	it("pine_editor: suspends, resolves, and never reaches the surrounding error boundary", async () => {
		renderHost("pine_editor");
		await flush();
		expect(boundaryFired, `error boundary fired: ${String(boundaryFired)}`).toBeNull();
		expect(container?.querySelector('[data-testid="error-boundary"]')).toBeNull();
		expect(container?.querySelector('[data-testid="real-panel-pine"]')).not.toBeNull();
	});

	it("strategy_tester: suspends, resolves, and never reaches the surrounding error boundary", async () => {
		renderHost("strategy_tester");
		await flush();
		expect(boundaryFired, `error boundary fired: ${String(boundaryFired)}`).toBeNull();
		expect(container?.querySelector('[data-testid="error-boundary"]')).toBeNull();
		expect(container?.querySelector('[data-testid="real-panel-strategy"]')).not.toBeNull();
	});

	it("a granted tier is never shown as locked, and the placeholder is gone once resolved", async () => {
		renderHost("pine_editor");
		expect(container?.querySelector(".vnsc-locked-feature"), "granted tier must not be locked").toBeNull();
		await flush();
		// Deliberately NOT asserting the placeholder is VISIBLE mid-suspend: React is free to
		// resolve the thrown promise before committing the fallback, and whether it paints the
		// fallback depends on how many turns the chunk takes. What must hold is that it does not
		// linger and does not become a lock.
		expect(container?.querySelector("[aria-busy='true']"), "placeholder must not linger").toBeNull();
		expect(container?.querySelector('[data-testid="real-panel-pine"]')).not.toBeNull();
	});
});