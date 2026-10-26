// @vitest-environment jsdom
// UI-D2 regression lock: Solo/Grid toggle appears for Pine/Strategy tabs.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { MultiChartsFooter } from "../MultiChartsFooter";
import type { BottomTab } from "../../BottomPanelHost";

const layout = { id: "2x2", name: "2x2", layout: { cols: 2, rows: 2, slots: [] } } as never;
const syncSettings = {
	visibleRange: false,
	crosshair: false,
	drawings: false,
	symbolLinks: false,
	timeframe: false,
	chartType: false,
	replay: false,
};

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(() => {
	if (root) act(() => { root?.unmount(); });
	root = null;
	container?.remove();
	container = null;
});

function renderFooter(extra: Record<string, unknown> = {}) {
	act(() => {
		root?.render(
			createElement(MultiChartsFooter, {
				currentLayout: layout,
				onLayoutChange: () => {},
				chartCount: 4,
				syncSettings,
				onSyncChange: () => {},
				autoHide: false,
				isChartFocused: true,
				onTabChange: () => {},
				...extra,
			} as never),
		);
	});
}

function soloToggle() {
	return container?.querySelector('[data-testid="footer-solo-toggle"]') as HTMLButtonElement | null;
}

describe("MultiChartsFooter Solo toggle (UI-D2)", () => {
	it("shows the Solo toggle when a Pine/Strategy tab is open", () => {
		renderFooter({ activeTab: "pine_editor" as BottomTab, onToggleMaximize: () => {} });
		expect(soloToggle()).not.toBeNull();
	});

	it("hides the Solo toggle for Paper Trading and when closed", () => {
		renderFooter({ activeTab: "paper_trade" as BottomTab, onToggleMaximize: () => {} });
		expect(soloToggle()).toBeNull();
		renderFooter({ activeTab: null, onToggleMaximize: () => {} });
		expect(soloToggle()).toBeNull();
	});

	it("hides the Solo toggle when no handler is provided", () => {
		renderFooter({ activeTab: "pine_editor" as BottomTab });
		expect(soloToggle()).toBeNull();
	});

	it("invokes onToggleMaximize on click and reflects maximized state", () => {
		const onToggleMaximize = vi.fn();
		renderFooter({ activeTab: "strategy_tester" as BottomTab, onToggleMaximize, isMaximized: false });
		act(() => {
			soloToggle()?.click();
		});
		expect(onToggleMaximize).toHaveBeenCalledTimes(1);
		renderFooter({ activeTab: "strategy_tester" as BottomTab, onToggleMaximize, isMaximized: true });
		expect(soloToggle()?.getAttribute("aria-pressed")).toBe("true");
	});
});
