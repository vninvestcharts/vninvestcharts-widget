// @vitest-environment jsdom
// BL-03B S5 regression lock: the bottom-panel block moved verbatim out of
// VNInvestCharts.tsx into ForkBottomPanel. These tests pin the behaviors the
// block owns — tier gate, pine dedupe, PANE_MAX_VISIBLE guard, overlay routing,
// tab routing — none of which any existing test rendered directly before.
// Mocks: the three panels are `lazy(() => import(...))`; vi.mock must name the
// DIRECT module specifiers as resolved from THIS file (../../panels/... from
// __tests__/, NOT ../panels/... which is the component's own relative path).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";

vi.mock("../../panels/StrategyTesterPanel", () => ({
	StrategyTesterPanel: (p: { symbol?: string; timeframe?: string; plotData?: unknown[]; activeIndicators?: unknown[] }) =>
		createElement("div", {
			"data-testid": "panel-strategy",
			"data-symbol": p.symbol ?? "",
			"data-timeframe": p.timeframe ?? "",
			"data-plot": String((p.plotData ?? []).length),
			"data-indicators": String((p.activeIndicators ?? []).length),
		}),
}));
vi.mock("../../panels/PineEditorPanel", () => ({
	PineEditorPanel: (p: { onAddIndicator?: (config: unknown) => void }) =>
		createElement(
			"div",
			{ "data-testid": "panel-pine" },
			createElement("button", { "data-testid": "pine-add-overlay", onClick: () => p.onAddIndicator?.({ type: "RSI" }) }),
			createElement("button", { "data-testid": "pine-add-pane", onClick: () => p.onAddIndicator?.({ type: "RSI", overlay: false }) }),
		),
}));
vi.mock("../../../trading/panel/ConnectedTradingPanel", () => ({
	ConnectedTradingPanel: (p: { onClose?: () => void }) =>
		createElement(
			"div",
			{ "data-testid": "panel-trading" },
			createElement("button", { "data-testid": "trading-close", onClick: () => p.onClose?.() }),
		),
}));

import { ForkBottomPanel, type ForkBottomPanelProps } from "../ForkBottomPanel";
import { PANE_MAX_VISIBLE } from "../../../../lib/core";

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

const PINE_GRANTED = { canUseStrategyTester: false, canUsePineEditor: true } as unknown as ForkBottomPanelProps["tierGated"];
const STRATEGY_GRANTED = { canUseStrategyTester: true, canUsePineEditor: false } as unknown as ForkBottomPanelProps["tierGated"];

function makeProps(overrides: Partial<ForkBottomPanelProps> = {}): ForkBottomPanelProps {
	return {
		activeBottomTab: null,
		setActiveBottomTab: vi.fn(),
		bottomPanelHeight: {
			heightPx: 260,
			resizeBy: vi.fn(),
			resizeTo: vi.fn(),
			nudge: vi.fn(),
			reset: vi.fn(),
		} as unknown as ForkBottomPanelProps["bottomPanelHeight"],
		tierGated: { canUseStrategyTester: false, canUsePineEditor: false } as unknown as ForkBottomPanelProps["tierGated"],
		dataResult: {
			plotData: [],
			activeSymbol: "BTCUSDT",
			activeTimeframe: "1h",
		} as unknown as ForkBottomPanelProps["dataResult"],
		activeIndicatorConfigs: [] as unknown as ForkBottomPanelProps["activeIndicatorConfigs"],
		pineCompileBars: [] as unknown as ForkBottomPanelProps["pineCompileBars"],
		restorableSeriesTypes: [],
		paneState: { panes: [], dispatch: vi.fn() } as unknown as ForkBottomPanelProps["paneState"],
		pushToast: vi.fn(),
		t: ((key: string) => key) as unknown as ForkBottomPanelProps["t"],
		...overrides,
	};
}

async function renderPanel(props: ForkBottomPanelProps) {
	await act(async () => {
		root?.render(createElement(ForkBottomPanel, props));
	});
}

function click(testId: string) {
	act(() => {
		(container?.querySelector(`[data-testid="${testId}"]`) as HTMLButtonElement | null)?.click();
	});
}

function paneStateWith(panes: unknown[], dispatch = vi.fn()) {
	return { paneState: { panes, dispatch } as unknown as ForkBottomPanelProps["paneState"], dispatch };
}

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

describe("ForkBottomPanel (BL-03B S5)", () => {
	it("renders nothing when no tab is active", () => {
		act(() => {
			root?.render(createElement(ForkBottomPanel, makeProps()));
		});
		expect(container?.innerHTML).toBe("");
	});

	it("strategy_tester granted: lazily resolves panel with wired props + splitter", async () => {
		await renderPanel(
			makeProps({
				activeBottomTab: "strategy_tester",
				tierGated: STRATEGY_GRANTED,
				dataResult: {
					plotData: [{}, {}, {}],
					activeSymbol: "BTCUSDT",
					activeTimeframe: "1h",
				} as unknown as ForkBottomPanelProps["dataResult"],
				activeIndicatorConfigs: [{ type: "RSI" }, { type: "MACD" }] as unknown as ForkBottomPanelProps["activeIndicatorConfigs"],
			}),
		);
		const panel = container?.querySelector('[data-testid="panel-strategy"]');
		expect(panel).not.toBeNull();
		expect(panel?.getAttribute("data-symbol")).toBe("BTCUSDT");
		expect(panel?.getAttribute("data-timeframe")).toBe("1h");
		expect(panel?.getAttribute("data-plot")).toBe("3");
		expect(panel?.getAttribute("data-indicators")).toBe("2");
		expect(container?.querySelector('[data-testid="bottom-panel-splitter"]')).not.toBeNull();
	});

	it("strategy_tester without grant: fail-closed lock, no panel", () => {
		act(() => {
			root?.render(createElement(ForkBottomPanel, makeProps({ activeBottomTab: "strategy_tester" })));
		});
		expect(container?.querySelector('[data-testid="panel-strategy"]')).toBeNull();
		const lock = container?.querySelector(".vnsc-locked-feature");
		expect(lock?.getAttribute("data-capability")).toBe("strategy_tester");
	});

	it("duplicate pine series -> alreadyOnChart toast, no dispatch", async () => {
		const { paneState, dispatch } = paneStateWith([{ visible: true, series: [{ type: "RSI" }] }]);
		const pushToast = vi.fn();
		await renderPanel(
			makeProps({
				activeBottomTab: "pine_editor",
				tierGated: PINE_GRANTED,
				paneState,
				pushToast,
			}),
		);
		click("pine-add-overlay");
		expect(pushToast).toHaveBeenCalledWith("ui.pinescript.alreadyOnChart", "info");
		expect(dispatch).not.toHaveBeenCalled();
	});

	it("overlay=false at PANE_MAX_VISIBLE -> paneLimitReached toast, no dispatch", async () => {
		const panes = Array.from({ length: PANE_MAX_VISIBLE }, () => ({ visible: true, series: [] }));
		const { paneState, dispatch } = paneStateWith(panes);
		const pushToast = vi.fn();
		await renderPanel(
			makeProps({
				activeBottomTab: "pine_editor",
				tierGated: PINE_GRANTED,
				paneState,
				pushToast,
			}),
		);
		click("pine-add-pane");
		expect(pushToast).toHaveBeenCalledWith("ui.pinescript.paneLimitReached", "error");
		expect(dispatch).not.toHaveBeenCalled();
	});

	it("overlay=false below cap -> addPane with the series inside the action", async () => {
		const { paneState, dispatch } = paneStateWith([{ visible: true, series: [] }]);
		await renderPanel(
			makeProps({
				activeBottomTab: "pine_editor",
				tierGated: PINE_GRANTED,
				paneState,
			}),
		);
		click("pine-add-pane");
		expect(dispatch).toHaveBeenCalledWith({
			type: "addPane",
			pane: { label: "Pine", series: [{ type: "RSI", overlay: false }], visible: true },
		});
	});

	it("overlay default -> addSeries into the price pane", async () => {
		const { paneState, dispatch } = paneStateWith([]);
		await renderPanel(
			makeProps({
				activeBottomTab: "pine_editor",
				tierGated: PINE_GRANTED,
				paneState,
			}),
		);
		click("pine-add-overlay");
		expect(dispatch).toHaveBeenCalledWith({ type: "addSeries", paneId: "price", series: { type: "RSI" } });
	});

	it("paper_trade: close callback clears the tab", async () => {
		const setActiveBottomTab = vi.fn();
		await renderPanel(makeProps({ activeBottomTab: "paper_trade", setActiveBottomTab }));
		expect(container?.querySelector('[data-testid="panel-trading"]')).not.toBeNull();
		click("trading-close");
		expect(setActiveBottomTab).toHaveBeenCalledWith(null);
	});
});
