// @vitest-environment jsdom
// UI-D1/D2 regression lock: panel collapse + focus-first maximize.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import {
	useSingleChartPanelCollapse,
	useMultiChartPanelFocus,
	type MultiBottomTab,
} from "../useBottomPanelBehavior";

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

function CollapseProbe({ panelOpen, height }: { panelOpen: boolean; height: number }) {
	const [ids, setIds] = useState<string[]>(["price", "volume", "rsi"]);
	const toggle = (id: string) =>
		setIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
	useSingleChartPanelCollapse({
		panelOpen,
		chartAreaHeight: height,
		visiblePaneIds: ids,
		onTogglePaneVisible: toggle,
	});
	return createElement("div", { "data-ids": [...ids].sort().join(",") });
}

function renderProbe(el: React.ReactElement) {
	act(() => {
		root?.render(el);
	});
}

function ids() {
	return container?.querySelector("[data-ids]")?.getAttribute("data-ids");
}

describe("useSingleChartPanelCollapse (UI-D1)", () => {
	it("hides non-price panes when the panel squeezes the chart area", () => {
		renderProbe(createElement(CollapseProbe, { panelOpen: true, height: 200 }));
		expect(ids()).toBe("price");
	});

	it("keeps all panes when the chart area stays tall", () => {
		renderProbe(createElement(CollapseProbe, { panelOpen: true, height: 800 }));
		expect(ids()).toBe("price,rsi,volume");
	});

	it("restores exactly the collapsed panes when the panel closes", () => {
		renderProbe(createElement(CollapseProbe, { panelOpen: true, height: 200 }));
		expect(ids()).toBe("price");
		renderProbe(createElement(CollapseProbe, { panelOpen: false, height: 800 }));
		expect(ids()).toBe("price,rsi,volume");
	});
});

function FocusProbe({ tab, chartId }: { tab: MultiBottomTab; chartId: string | null }) {
	const focus = useMultiChartPanelFocus({ activeTab: tab, activeChartId: chartId });
	return createElement("div", {
		"data-maximized": focus.maximizedChartId ?? "",
		onClick: () => focus.setMaximizedChartId(null),
	});
}

describe("useMultiChartPanelFocus (UI-D2)", () => {
	it("auto-maximizes the active chart when Pine/Strategy opens", () => {
		renderProbe(createElement(FocusProbe, { tab: null, chartId: "c1" }));
		expect(container?.querySelector("[data-maximized]")?.getAttribute("data-maximized")).toBe("");
		renderProbe(createElement(FocusProbe, { tab: "pine_editor", chartId: "c1" }));
		expect(container?.querySelector("[data-maximized]")?.getAttribute("data-maximized")).toBe("c1");
	});

	it("keeps the grid for Paper Trading", () => {
		renderProbe(createElement(FocusProbe, { tab: "paper_trade", chartId: "c1" }));
		expect(container?.querySelector("[data-maximized]")?.getAttribute("data-maximized")).toBe("");
	});

	it("restores the grid when the tab closes", () => {
		renderProbe(createElement(FocusProbe, { tab: "strategy_tester", chartId: "c2" }));
		expect(container?.querySelector("[data-maximized]")?.getAttribute("data-maximized")).toBe("c2");
		renderProbe(createElement(FocusProbe, { tab: null, chartId: "c2" }));
		expect(container?.querySelector("[data-maximized]")?.getAttribute("data-maximized")).toBe("");
	});

	it("respects a manual Solo/Grid override until the tab changes", () => {
		renderProbe(createElement(FocusProbe, { tab: "pine_editor", chartId: "c1" }));
		const node = container?.querySelector("[data-maximized]") as HTMLElement | null;
		act(() => {
			node?.click();
		});
		expect(container?.querySelector("[data-maximized]")?.getAttribute("data-maximized")).toBe("");
	});
});
