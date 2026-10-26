// @vitest-environment jsdom
// S2 (P5 parity F1-A): workspace order form qua binding — submit vào đúng broker.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { fireEvent, screen } from "@testing-library/react";
import {
	clearAllPaperPanelBindingsForTesting,
	registerPaperPanelBinding,
} from "../../context/PaperPanelRegistry";
import { RegistryTradingDockPanel } from "../RegistryTradingDockPanel";

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
	if (root) act(() => { root?.unmount(); });
	root = null;
	container?.remove();
	container = null;
	clearAllPaperPanelBindingsForTesting();
});

function fakeBinding(placeOrder = vi.fn()) {
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
			tradingEnabled: true,
			onEnableTrading: () => {},
		}),
		closePosition: () => false,
		reversePosition: () => {},
		cancelOrder: () => false,
		resetAccount: () => {},
		placeOrder,
		subscribe: () => () => {},
	};
}

function renderForm() {
	act(() => {
		root?.render(<RegistryTradingDockPanel chartId="c1" lastPrice={128200} />);
	});
}

describe("RegistryTradingDockPanel (S2)", () => {
	it("no binding -> null (host disables tab)", () => {
		renderForm();
		expect(container?.querySelector('[data-testid="trading-dock-panel"]')).toBeNull();
	});

	it("binding -> renders shared TradingDockPanel form", () => {
		registerPaperPanelBinding(fakeBinding() as never);
		renderForm();
		expect(container?.querySelector('[data-testid="trading-dock-panel"]')).not.toBeNull();
	});

	it("limit submit routes through binding.placeOrder with binding symbol", () => {
		let payload: unknown = null;
		const placeOrder = vi.fn((input: unknown) => {
			payload = input;
			return { status: "working" };
		});
		registerPaperPanelBinding(fakeBinding(placeOrder) as never);
		renderForm();
		fireEvent.click(screen.getByTestId("dock-type-limit"));
		fireEvent.change(screen.getByTestId("dock-price"), { target: { value: "127000" } });
		fireEvent.click(screen.getByTestId("dock-submit"));
		fireEvent.click(screen.getByTestId("order-review-confirm"));
		expect(placeOrder).toHaveBeenCalledTimes(1);
		expect(payload).toMatchObject({ symbol: "FPT", type: "limit", price: 127000 });
	});

	it("disabled prop disables submit", () => {
		registerPaperPanelBinding(fakeBinding() as never);
		act(() => {
			root?.render(<RegistryTradingDockPanel chartId="c1" lastPrice={128200} disabled />);
		});
		const submit = screen.getByTestId("dock-submit") as HTMLButtonElement;
		expect(submit.disabled).toBe(true);
	});
});
