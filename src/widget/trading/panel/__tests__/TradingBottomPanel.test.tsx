import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TradingBottomPanel } from "../TradingBottomPanel";
import type { BrokerAccount, TradingOrder, TradingPosition } from "../../../../lib/core/trading/types";
import type { TradingAnalytics } from "../../../../lib/core/trading/AnalyticsEngine";

// Task 09: panel render bằng fixture props (không cần broker thật).
const account: BrokerAccount = {
	accountId: "paper-VN_SPOT",
	balance: 87_137_150,
	equity: 87_787_150,
	marginUsed: 0,
	freeMargin: 87_787_150,
	buyingPower: 87_787_150,
	currency: "VND",
	pnl: 0,
	pnlPercent: 0,
};

const position: TradingPosition = {
	id: "pos_1",
	symbol: "FPT",
	side: "long",
	quantity: 100,
	availableQuantity: 0,
	entryPrice: 128500,
	currentPrice: 135000,
	unrealizedPnl: 650000,
	realizedPnl: 0,
	createdAt: 0,
	updatedAt: 0,
};

const slOrder: TradingOrder = {
	id: "ord_sl",
	clientOrderId: "c-sl",
	symbol: "FPT",
	side: "sell",
	type: "stop",
	status: "working",
	quantity: 100,
	filledQuantity: 0,
	stopPrice: 122000,
	timeInForce: "GTC",
	parentOrderId: "ord_1",
	createdAt: 0,
	updatedAt: 0,
};

const filledBuy: TradingOrder = {
	id: "ord_1",
	clientOrderId: "c1",
	symbol: "FPT",
	side: "buy",
	type: "market",
	status: "filled",
	quantity: 100,
	filledQuantity: 100,
	timeInForce: "GTC",
	createdAt: 1000,
	updatedAt: 2000,
};

const rejectedSell: TradingOrder = {
	id: "ord_r",
	clientOrderId: "cr",
	symbol: "FPT",
	side: "sell",
	type: "stop_limit",
	status: "rejected",
	quantity: 100,
	filledQuantity: 0,
	timeInForce: "GTC",
	rejectCode: "UNSUPPORTED_ORDER_TYPE",
	createdAt: 1500,
	updatedAt: 1500,
};

const analytics: TradingAnalytics = {
	totalTrades: 1,
	winningTrades: 1,
	losingTrades: 0,
	winRate: 1,
	grossProfit: 650000,
	grossLoss: 0,
	netProfit: 650000,
	profitFactor: 650000,
	maxDrawdown: 50000,
	maxDrawdownPercent: 0.05,
	sharpeRatio: 1.25,
	equityCurve: [
		{ timestamp: 1, equity: 100_000_000 },
		{ timestamp: 2, equity: 99_950_000 },
		{ timestamp: 3, equity: 100_610_150 },
	],
	closedTrades: [
		{
			timestamp: 3,
			realizedPnl: 650000,
			commission: 13500,
			tax: 13500,
			symbol: "FPT",
			side: "long",
			quantity: 100,
			entryPrice: 128500,
			exitPrice: 135000,
		},
	],
};

function props(over?: object) {
	return {
		account,
		positions: [position],
		orders: [slOrder],
		orderHistory: [slOrder, filledBuy, rejectedSell],
		ordersMargin: 0,
		analytics,
		log: [{ timestamp: 2000, message: "Fill buy 100 FPT @ 128500" }],
		onClosePosition: vi.fn(),
		onReversePosition: vi.fn(),
		onCancelOrder: vi.fn(),
		onResetAccount: vi.fn(),
		...over,
	};
}

describe("TradingBottomPanel", () => {
	it("mặc định tab positions: badge T+2 + SL join + nút đóng/đảo", () => {
		const p = props();
		render(<TradingBottomPanel {...p} />);
		expect(screen.getByTestId("header-realized").textContent).toContain("+650,000");
		expect(screen.getByTestId("header-orders-margin").textContent).toContain("0");
		expect(screen.getByTestId("panel-export")).toBeDefined();
		fireEvent.click(screen.getByTestId("panel-export"));
		expect(screen.getByTestId("position-row-pos_1").textContent).toContain("Chờ về (T+2)");
		expect(screen.getByTestId("position-row-pos_1").textContent).toContain("122,000");
		fireEvent.click(screen.getByTestId("position-close-pos_1"));
		expect(p.onClosePosition).toHaveBeenCalledWith("pos_1");
		fireEvent.click(screen.getByTestId("position-reverse-pos_1"));
		expect(p.onReversePosition).toHaveBeenCalledWith("pos_1");
	});

	it("chuyển tabs orders/history/trades/summary/log (lệnh rejected lưu sổ)", () => {
		render(<TradingBottomPanel {...props()} />);
		fireEvent.click(screen.getByTestId("panel-tab-orders"));
		expect(screen.getByTestId("order-row-ord_sl")).toBeDefined();
		fireEvent.click(screen.getByTestId("panel-tab-history"));
		expect(screen.getByTestId("history-row-ord_1")).toBeDefined();
		// A rejected order shows the TRANSLATED reason, not the raw enum. This
		// line used to assert `toContain("UNSUPPORTED_ORDER_TYPE")` — it locked
		// in the exact defect that was fixed: a technical enum reaching the
		// screen, untranslatable, in every locale.
		const rejectedCell = screen.getByTestId("history-row-ord_r").textContent ?? "";
		expect(rejectedCell).toContain("Loại lệnh chưa hỗ trợ");
		expect(rejectedCell).not.toContain("UNSUPPORTED_ORDER_TYPE");
		fireEvent.click(screen.getByTestId("panel-tab-trades"));
		expect(screen.getByTestId("trade-row-0").textContent).toContain("+650,000");
		fireEvent.click(screen.getByTestId("panel-tab-summary"));
		expect(screen.getByTestId("kpi-winrate").textContent).toContain("100.0%");
		expect(screen.getByTestId("kpi-sharpe").textContent).toContain("1.25");
		expect(screen.getByTestId("equity-curve")).toBeDefined();
		fireEvent.click(screen.getByTestId("panel-tab-log"));
		expect(screen.getByTestId("log-row-0").textContent).toContain("Fill buy 100 FPT @ 128500");
	});

	it("empty states khi không dữ liệu", () => {
		render(
			<TradingBottomPanel
				{...props({
					positions: [],
					orders: [],
					orderHistory: [],
					log: [],
					analytics: { ...analytics, totalTrades: 0, closedTrades: [], equityCurve: [] },
				})}
			/>,
		);
		expect(screen.getByTestId("positions-empty")).toBeDefined();
		fireEvent.click(screen.getByTestId("panel-tab-orders"));
		expect(screen.getByTestId("orders-empty")).toBeDefined();
		fireEvent.click(screen.getByTestId("panel-tab-history"));
		expect(screen.getByTestId("history-empty")).toBeDefined();
		fireEvent.click(screen.getByTestId("panel-tab-trades"));
		expect(screen.getByTestId("trades-empty")).toBeDefined();
	});

	it("reset mở dialog nạp vốn, nhập số -> onResetAccount kèm số", () => {
		const p = props();
		render(<TradingBottomPanel {...p} />);
		fireEvent.click(screen.getByTestId("header-reset"));
		expect(p.onResetAccount).not.toHaveBeenCalled();
		const dialog = screen.getByTestId("capital-dialog");
		const input = screen.getByTestId("capital-input") as HTMLInputElement;
		fireEvent.change(input, { target: { value: "" } });
		fireEvent.change(input, { target: { value: "500000" } });
		fireEvent.click(screen.getByTestId("capital-confirm"));
		expect(p.onResetAccount).toHaveBeenCalledTimes(1);
		expect(p.onResetAccount).toHaveBeenCalledWith(500000);
	});

	it("dialog nạp vốn chặn số 0 / rỗng", () => {
		const p = props();
		render(<TradingBottomPanel {...p} />);
		fireEvent.click(screen.getByTestId("header-reset"));
		const input = screen.getByTestId("capital-input") as HTMLInputElement;
		fireEvent.change(input, { target: { value: "" } });
		expect((screen.getByTestId("capital-confirm") as HTMLButtonElement).disabled).toBe(true);
		expect(screen.getByTestId("capital-error")).toBeDefined();
		fireEvent.change(input, { target: { value: "0" } });
		expect((screen.getByTestId("capital-confirm") as HTMLButtonElement).disabled).toBe(true);
		expect(p.onResetAccount).not.toHaveBeenCalled();
	});

	it("paper tắt -> CTA theo theme (không nút native), bấm gọi onEnableTrading", () => {
		const onEnableTrading = vi.fn();
		render(
			<TradingBottomPanel {...props({ positions: [], orders: [] })} tradingEnabled={false} onEnableTrading={onEnableTrading} />,
		);
		expect(screen.getByTestId("trading-disabled-cta")).toBeDefined();
		const btn = screen.getByTestId("trading-enable-btn") as HTMLButtonElement;
		expect(btn.className).toContain("ctaButton");
		expect(screen.getByTestId("trading-disabled-cta").textContent).toContain("giao dịch mô phỏng");
		fireEvent.click(btn);
		expect(onEnableTrading).toHaveBeenCalledTimes(1);
	});
});
