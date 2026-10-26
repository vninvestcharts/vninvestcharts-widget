// @vitest-environment jsdom
// DOCK_SSOT_B2 — regression locks tại slot workspace (RD-07 replay sub-gate +
// RD-08 orderTicket disabled đúng khi thiếu binding). Slot là nơi multi cấp dữ
// liệu cho host dock; test ở đây giữ slot-level contracts:
//   RD-07: KHÔNG blanket-disable order form trong replay — quyền quyết định bởi
//          capability `replay_trading` (TradingDockPanel tự fail-closed 1 chiều).
//   RD-08: không binding → tradingDockNode undefined → host tự disable tab +
//          tooltip (usePaperPanelBinding reactive, late-register không remount).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { WorkspaceRightDockSlot } from "../WorkspaceRightDockSlot";
import { CapabilityProvider } from "../../CapabilityGate";
import type { Capability } from "@vninvestcharts/engine-core";
import {
	clearAllPaperPanelBindingsForTesting,
	registerPaperPanelBinding,
} from "../../../trading/context/PaperPanelRegistry";
import { dockMessagesVi } from "../../../i18n/dock.messages.vi";
import type { ActiveChartReplaySource } from "../../../trading/panel/ActiveChartPaperPanel";

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

beforeEach(() => {
	window.localStorage.clear();
	clearAllPaperPanelBindingsForTesting();
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(() => {
	if (root) {
		act(() => {
			root?.unmount();
		});
	}
	root = null;
	container?.remove();
	container = null;
	window.localStorage.clear();
	clearAllPaperPanelBindingsForTesting();
});

async function waitFor(fn: () => boolean, label: string, tries = 200) {
	for (let i = 0; i < tries; i += 1) {
		if (fn()) return;
		await act(async () => {
			await new Promise((r) => setTimeout(r, 50));
		});
	}
	throw new Error(`timeout waiting: ${label}`);
}

// Binding fake theo pattern RegistryTradingDockPanel.test.tsx (module singleton —
// cleanup ở afterEach chống rò chéo test).
function fakeBinding() {
	return {
		chartId: "c1",
		symbol: "FPT",
		shared: false,
		getSnapshot: () => ({
			account: { accountId: "t", balance: 1000000000, equity: 1000000000, marginUsed: 0, freeMargin: 1000000000, buyingPower: 1000000000, currency: "USD", pnl: 0, pnlPercent: 0 },
			positions: [],
			orders: [],
			orderHistory: [],
			ordersMargin: 0,
			analytics: { totalTrades: 0, winningTrades: 0, losingTrades: 0, winRate: 0, grossProfit: 0, grossLoss: 0, netProfit: 0, profitFactor: 0, maxDrawdown: 0, maxDrawdownPercent: 0, equityCurve: [], closedTrades: [], sharpeRatio: 0 },
			log: [],
			// tradingEnabled:true để fallback `disabled ?? !snapshot.tradingEnabled`
			// không che kết quả các case RD-07 (chỉ sub-gate replay được đo).
			tradingEnabled: true,
			onEnableTrading: () => {},
		}),
		closePosition: () => false,
		closeAllPositions: () => 0,
		reversePosition: () => {},
		cancelOrder: () => false,
		getOrders: () => [],
		resetAccount: () => {},
		placeOrder: () => ({ status: "working" }),
		subscribe: () => () => {},
	};
}

// Chỉ dùng như cờ truthy ở slot (`replaySource != null` → isReplayMode).
const FAKE_REPLAY_SOURCE = {} as ActiveChartReplaySource;

function renderSlot(opts: {
	tier?: "pro" | "free";
	narrowing?: readonly Capability[];
	replaySource?: ActiveChartReplaySource;
} = {}) {
	const chartRefs = { current: new Map() };
	const syncContextRef = { current: null };
	act(() => {
		root?.render(
			<CapabilityProvider tier={opts.tier ?? "pro"} narrowing={opts.narrowing}>
				<WorkspaceRightDockSlot
					showRightDock
					dockTierGate={false}
					tier={opts.tier ?? "pro"}
					activeChartId="c1"
					symbol="FPT"
					timeframe="1D"
					// lastPrice thật — nếu 0, TradingDockPanel tính error sẵn làm
					// dock-submit disabled, che mất kết quả sub-gate (đo RED lần 1).
					datum={{ close: 128500 } as never}
					drawingRevision={0}
					chartRefs={chartRefs as never}
					charts={[{ id: "c1", symbol: "FPT" }]}
					syncContextRef={syncContextRef as never}
					onChartConfigChange={() => {}}
					activeChartHandle={null}
					replaySource={opts.replaySource}
				/>
			</CapabilityProvider>,
		);
	});
}

function orderTicketTab(): HTMLButtonElement | null {
	return container?.querySelector('[data-testid="dock-tab-orderTicket"]') as HTMLButtonElement | null;
}

async function openTicketPanel() {
	await waitFor(() => orderTicketTab() != null, "dock strip (lazy host)");
	const tab = orderTicketTab();
	await act(async () => {
		tab?.click();
		await new Promise((r) => setTimeout(r, 0));
	});
	await waitFor(() => container?.querySelector('[data-testid="trading-dock-panel"]') != null, "order form");
}

describe("RD-07 slot replay sub-gate (multi)", () => {
	it("pro + replay: dock-submit ENABLED (trước fix: blanket disabled={replaySource != null})", { timeout: 30000 }, async () => {
		registerPaperPanelBinding(fakeBinding() as never);
		renderSlot({ tier: "pro", replaySource: FAKE_REPLAY_SOURCE });
		await openTicketPanel();
		const submit = container?.querySelector('[data-testid="dock-submit"]') as HTMLButtonElement | null;
		expect(submit).not.toBeNull();
		expect(submit?.disabled).toBe(false);
	});

	it("replay_trading locked (pro + narrowing paper_advanced): dock-submit disabled (fail-closed)", { timeout: 30000 }, async () => {
		registerPaperPanelBinding(fakeBinding() as never);
		renderSlot({ tier: "pro", narrowing: ["paper_advanced"], replaySource: FAKE_REPLAY_SOURCE });
		await openTicketPanel();
		const submit = container?.querySelector('[data-testid="dock-submit"]') as HTMLButtonElement | null;
		expect(submit).not.toBeNull();
		expect(submit?.disabled).toBe(true);
	});

	it("live (không replaySource): dock-submit ENABLED (no-regression)", { timeout: 30000 }, async () => {
		registerPaperPanelBinding(fakeBinding() as never);
		renderSlot({ tier: "pro" });
		await openTicketPanel();
		const submit = container?.querySelector('[data-testid="dock-submit"]') as HTMLButtonElement | null;
		expect(submit).not.toBeNull();
		expect(submit?.disabled).toBe(false);
	});
});

describe("RD-08 slot orderTicket tab disable (multi)", () => {
	it("không binding: tab aria-disabled=true + tooltip requiresPaperTrading (trước fix: enabled)", { timeout: 30000 }, async () => {
		renderSlot({ tier: "pro" });
		await waitFor(() => orderTicketTab() != null, "dock strip (lazy host)");
		const tab = orderTicketTab();
		expect(tab?.getAttribute("aria-disabled")).toBe("true");
		expect(tab?.title).toContain(dockMessagesVi["dock.requiresPaperTrading"]);
	});

	it("late-register 2 pha: reactive không remount (pha a đỏ trước fix, b chống vacuous)", { timeout: 30000 }, async () => {
		renderSlot({ tier: "pro" });
		await waitFor(() => orderTicketTab() != null, "dock strip (lazy host)");
		// Pha (a): chưa binding → disabled.
		expect(orderTicketTab()?.getAttribute("aria-disabled")).toBe("true");
		// Pha (b): binding đến sau mount → slot re-render (usePaperPanelBinding).
		await act(async () => {
			registerPaperPanelBinding(fakeBinding() as never);
		});
		const tab = orderTicketTab();
		expect(tab?.getAttribute("aria-disabled")).not.toBe("true");
		await act(async () => {
			tab?.click();
			await new Promise((r) => setTimeout(r, 0));
		});
		await waitFor(() => container?.querySelector('[data-testid="trading-dock-panel"]') != null, "order form after late-register");
	});

	it("positive: binding trước mount → mở tab thấy trading-dock-panel (SSOT form)", { timeout: 30000 }, async () => {
		registerPaperPanelBinding(fakeBinding() as never);
		renderSlot({ tier: "pro" });
		await waitFor(() => orderTicketTab() != null, "dock strip (lazy host)");
		const tab = orderTicketTab();
		expect(tab?.getAttribute("aria-disabled")).not.toBe("true");
		await act(async () => {
			tab?.click();
			await new Promise((r) => setTimeout(r, 0));
		});
		await waitFor(() => container?.querySelector('[data-testid="trading-dock-panel"]') != null, "order form");
	});
});


