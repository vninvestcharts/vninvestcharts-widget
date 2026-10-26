// @vitest-environment jsdom
import { act, createElement } from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createRoot } from "react-dom/client";

import { UnifiedDrawingToolbar } from "../UnifiedDrawingToolbar";
import { WidgetI18nProvider } from "../../../context/WidgetI18nContext";

const FAVORITES_KEY = "vninvestcharts-widget:favoriteTools";

function makeWorkspace() {
	const listeners = new Set<() => void>();
	const notify = () => {
		listeners.forEach((listener) => {
			listener();
		});
	};
	// NOTE: state is REPLACED (not mutated) on change, mirroring the real
	// controller's useMemo identity semantics that useSyncExternalStore needs.
	let state: { activeTool: string } = { activeTool: "cursor" };
	const workspace = {
		get state() {
			return state;
		},
		interaction: {
			canUndo: false,
			canRedo: false,
			undo: vi.fn(),
			redo: vi.fn(),
			dispatch: vi.fn(),
		},
		setActiveTool: (tool: string) => {
			state = { activeTool: tool };
			notify();
		},
		subscribe: (listener: () => void) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
	};
	return workspace;
}

function renderToolbar(workspace: ReturnType<typeof makeWorkspace>) {
	const container = document.createElement("div");
	document.body.appendChild(container);
	const root = createRoot(container);
	const chartRefs = new Map([["chart-1", { current: { getDrawingWorkspace: () => workspace } }]]);
	act(() => {
		root.render(
			createElement(
				WidgetI18nProvider as never,
				{ locale: "en" },
				createElement(UnifiedDrawingToolbar, {
					activeChartId: "chart-1",
					chartRefs,
				} as never),
			),
		);
	});
	return {
		container,
		cleanup: () => {
			act(() => {
				root.unmount();
			});
			container.remove();
		},
	};
}

function expandGroup(container: HTMLDivElement, groupId: string) {
	const toggle = container.querySelector(`button[aria-controls="${groupId}-tools"]`);
	expect(toggle, `expander for group ${groupId}`).not.toBeNull();
	act(() => {
		(toggle as HTMLButtonElement).click();
	});
}

describe("UnifiedDrawingToolbar P4 parity", () => {
	beforeEach(() => {
		localStorage.clear();
	});

	afterEach(() => {
		localStorage.clear();
	});

	it("renders all 14 SSOT groups (not the 8 legacy ones)", () => {
		const workspace = makeWorkspace();
		const probe = renderToolbar(workspace);
		try {
			for (const groupId of ["cursor", "lines", "channels", "fibonacci", "gann", "pitchfork", "shapes", "annotation", "measurement", "patterns", "elliott", "cycles", "orderflow", "icons"]) {
				expect(
					probe.container.querySelector(`button[aria-controls="${groupId}-tools"]`),
					`group ${groupId}`,
				).not.toBeNull();
			}
		} finally {
			probe.cleanup();
		}
	});

	it("exposes previously-missing tools (brush lived only in single-chart)", () => {
		localStorage.setItem(FAVORITES_KEY, JSON.stringify(["brush", "anchoredVwap"]));
		const workspace = makeWorkspace();
		const probe = renderToolbar(workspace);
		try {
			const switches = [...probe.container.querySelectorAll('button[role="switch"]')];
			const labels = switches.map((button) => button.getAttribute("aria-label") ?? "");
			expect(labels.some((label) => label.includes("Brush"))).toBe(true);
			expect(labels.some((label) => label.includes("Anchored VWAP"))).toBe(true);
		} finally {
			probe.cleanup();
		}
	});

	it("highlights the active tool after a workspace change (no stale state)", () => {
		const workspace = makeWorkspace();
		const probe = renderToolbar(workspace);
		try {
			expandGroup(probe.container, "lines");
			const trendLine = [...probe.container.querySelectorAll('button[role="switch"]')].find((button) =>
				(button.getAttribute("aria-label") ?? "").includes("Trend Line"),
			) as HTMLButtonElement | undefined;
			expect(trendLine).toBeTruthy();
			expect(trendLine?.getAttribute("aria-pressed")).toBe("false");

			act(() => {
				workspace.setActiveTool("trendLine");
			});

			expect(trendLine?.getAttribute("aria-pressed")).toBe("true");
		} finally {
			probe.cleanup();
		}
	});
});
