import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import type { PaneRuntimeSnapshot } from "@vninvestcharts/engine-react";
import { VN_DERIVATIVES_RULES, resolveMarketProfile } from "../../../lib/core/trading/MarketRules";
import { TradingProvider } from "../context/TradingContext";
import { TradingChartSurface } from "../chart/TradingChartSurface";
import { ConnectedTradingPanel } from "../panel/ConnectedTradingPanel";
import { paperConfigKey } from "../hooks/usePaperRuntimeConfig";

// Task 12 E2E: full stack provider + surface + panel, projector engine THẬT.
// P1.1: live broker khớp market NGAY tại mark (không qua working treo);
// replay/backtest giữ quy ước fill-open-nến-kế (OMS test khóa).
const snapshot = {
	plotBounds: { left: 0, top: 0, width: 800, height: 400 },
	scaleSlotStates: { "price-right": { domain: [120000, 140000] } },
} as unknown as PaneRuntimeSnapshot;
const visibleRange = { from: 0, to: 100 };

const bars12 = [
	{ open: 128000, high: 128400, low: 127800, close: 128200, volume: 0, date: new Date(1000) },
	{ open: 128500, high: 129000, low: 128000, close: 128800, volume: 0, date: new Date(2000) },
];
const bar3 = { open: 128500, high: 129000, low: 128000, close: 128800, volume: 0, date: new Date(3000) };

function harness(extraBars?: typeof bars12, providerProps?: object) {
	return render(
		<TradingProvider symbol="FPT" bars={extraBars ?? bars12} {...providerProps}>
			<TradingChartSurface snapshot={snapshot} visibleRange={visibleRange} />
			<ConnectedTradingPanel />
		</TradingProvider>,
	);
}

function switchTab(tab: string) {
	fireEvent.click(screen.getByTestId(`panel-tab-${tab}`));
}

/**
 * A4 (QUICKTRADE_PILLS): one-click nay là config persist — seed profile-key TRƯỚC render
 * thay vì bấm ⚡ trên strip (đã bỏ). Seed trước cả `harness()` lẫn các feed trực tiếp.
 */
function seedOneClick(symbol: string) {
	window.localStorage.setItem(
		paperConfigKey(resolveMarketProfile(symbol).profile),
		JSON.stringify({ oneClickTrading: true, effectiveFrom: 1 }),
	);
}

beforeEach(() => {
	for (let i = window.localStorage.length - 1; i >= 0; i--) {
		const key = window.localStorage.key(i);
		if (key?.startsWith("vnsc_paper_cfg_")) window.localStorage.removeItem(key);
	}
});

describe("PaperTradingE2E", () => {
	it("S1 quick buy: one-click từ config -> BUY khớp ngay tại mark (P1.1 live-fill)", () => {
		seedOneClick("FPT");
		const { rerender } = harness();
		fireEvent.click(screen.getByTestId("buy-btn"));
		switchTab("positions");
		expect(screen.getByTestId("position-row-pos_1").textContent).toContain("128,800");
		switchTab("log");
		expect(screen.getByTestId("log-row-0").textContent).toContain("Fill buy 100 FPT @ 128800");
		// Nến sau không double-fill (guard hồi quy synthetic tick-bar).
		rerender(
			<TradingProvider symbol="FPT" bars={[...bars12, bar3]}>
				<TradingChartSurface snapshot={snapshot} visibleRange={visibleRange} />
				<ConnectedTradingPanel />
			</TradingProvider>,
		);
		switchTab("positions");
		expect(screen.getByTestId("position-row-pos_1").textContent).toContain("128,800");
	});
	it("S2 ticket bracket: limit + TP/SL -> fill -> 2 con -> TP khớp, SL hủy", () => {
		const { rerender } = harness();
		fireEvent.click(screen.getByTestId("buy-btn"));
		expect(screen.getByTestId("order-ticket-overlay")).toBeDefined();
		fireEvent.click(screen.getByTestId("type-limit"));
		fireEvent.change(screen.getByTestId("limit-price"), { target: { value: "127000" } });
		fireEvent.click(screen.getByTestId("tp-check"));
		fireEvent.change(screen.getByTestId("tp-price"), { target: { value: "135000" } });
		fireEvent.click(screen.getByTestId("sl-check"));
		fireEvent.change(screen.getByTestId("sl-price"), { target: { value: "122000" } });
		fireEvent.click(screen.getByTestId("ticket-submit"));
		// Pha 1: lệnh mới đi qua bước XÁC NHẬN.
		fireEvent.click(screen.getByTestId("order-review-confirm"));
		switchTab("orders");
		expect(screen.getByTestId("orders-table")).toBeDefined();
		const touchBar = { open: 128200, high: 128400, low: 126900, close: 127500, volume: 0, date: new Date(3000) };
		rerender(
			<TradingProvider symbol="FPT" bars={[...bars12, touchBar]}>
				<TradingChartSurface snapshot={snapshot} visibleRange={visibleRange} />
				<ConnectedTradingPanel />
			</TradingProvider>,
		);
		switchTab("positions");
		expect(screen.getByTestId("position-row-pos_1").textContent).toContain("127,000");
		const tpBar = { open: 134000, high: 136000, low: 133000, close: 135500, volume: 0, date: new Date(4000) };
		rerender(
			<TradingProvider symbol="FPT" bars={[...bars12, touchBar, tpBar]}>
				<TradingChartSurface snapshot={snapshot} visibleRange={visibleRange} />
				<ConnectedTradingPanel />
			</TradingProvider>,
		);
		switchTab("positions");
		expect(screen.queryByTestId("position-row-pos_1")).toBeNull();
		switchTab("history");
		expect(screen.getByTestId("history-table").textContent).toContain("135,000");
		switchTab("trades");
		expect(screen.getByTestId("trade-row-0").textContent).toContain("+800,000");
	});

	it("S3 drag SL trên chart: 360 -> 300px = 125000, overlay cập nhật", () => {
		const { rerender } = harness();
		fireEvent.click(screen.getByTestId("buy-btn"));
		fireEvent.click(screen.getByTestId("type-limit"));
		fireEvent.change(screen.getByTestId("limit-price"), { target: { value: "127000" } });
		fireEvent.click(screen.getByTestId("sl-check"));
		fireEvent.change(screen.getByTestId("sl-price"), { target: { value: "122000" } });
		fireEvent.click(screen.getByTestId("ticket-submit"));
		// Pha 1: lệnh mới đi qua bước XÁC NHẬN.
		fireEvent.click(screen.getByTestId("order-review-confirm"));
		const touchBar = { open: 128200, high: 128400, low: 126900, close: 127500, volume: 0, date: new Date(3000) };
		rerender(
			<TradingProvider symbol="FPT" bars={[...bars12, touchBar]}>
				<TradingChartSurface snapshot={snapshot} visibleRange={visibleRange} />
				<ConnectedTradingPanel />
			</TradingProvider>,
		);
		const grip = screen.getByTestId("handle-grip-SL");
		fireEvent.pointerDown(grip, { pointerId: 1, button: 0, clientX: 790, clientY: 360 });
		fireEvent.pointerMove(grip, { pointerId: 1, clientX: 790, clientY: 300 });
		fireEvent.pointerUp(grip, { pointerId: 1, clientX: 790, clientY: 300 });
		switchTab("positions");
		expect(screen.getByTestId("position-row-pos_1").textContent).toContain("125,000");
	});

	it("S4 sandbox: live giữ nguyên qua replay on/off", () => {
		seedOneClick("FPT");
		const { rerender } = harness();
		fireEvent.click(screen.getByTestId("buy-btn"));
		const liveBar = { open: 128500, high: 129000, low: 128000, close: 128800, volume: 0, date: new Date(3000) };
		const withLive = [...bars12, liveBar];
		rerender(
			<TradingProvider symbol="FPT" bars={withLive}>
				<TradingChartSurface snapshot={snapshot} visibleRange={visibleRange} />
				<ConnectedTradingPanel />
			</TradingProvider>,
		);
		switchTab("positions");
		expect(screen.getByTestId("position-row-pos_1")).toBeDefined();
		const replayBar = { open: 120000, high: 121000, low: 119000, close: 120500, date: 9000 };
		rerender(
			<TradingProvider symbol="FPT" bars={withLive} replayActive replayPlaying replayBar={replayBar}>
				<TradingChartSurface snapshot={snapshot} visibleRange={visibleRange} />
				<ConnectedTradingPanel />
			</TradingProvider>,
		);
		switchTab("positions");
		expect(screen.queryByTestId("position-row-pos_1")).toBeNull();
		rerender(
			<TradingProvider symbol="FPT" bars={withLive}>
				<TradingChartSurface snapshot={snapshot} visibleRange={visibleRange} />
				<ConnectedTradingPanel />
			</TradingProvider>,
		);
		switchTab("positions");
		expect(screen.getByTestId("position-row-pos_1")).toBeDefined();
	});

	it("S5 reverse 2 nhịp: ⇄ đóng ngay + lệnh ngược working -> feed -> long", () => {
		// Futures (cho short 2 chiều; spot retail không được short nên đảo sang short bị từ chối đúng luật).
		const f1 = { open: 1300, high: 1305, low: 1295, close: 1300, volume: 0, date: new Date(1000) };
		const f2 = { open: 1300, high: 1310, low: 1295, close: 1310, volume: 0, date: new Date(2000) };
		const f3 = { open: 1310, high: 1315, low: 1300, close: 1305, volume: 0, date: new Date(3000) };
		const f4 = { open: 1305, high: 1312, low: 1302, close: 1310, volume: 0, date: new Date(4000) };
		const feedFut = (feedBars: typeof f1[]) => (
			<TradingProvider symbol="VN30F1M" bars={feedBars} rules={VN_DERIVATIVES_RULES} initialBalance={80_000_000}>
				<TradingChartSurface snapshot={snapshot} visibleRange={visibleRange} />
				<ConnectedTradingPanel />
			</TradingProvider>
		);
		seedOneClick("VN30F1M");
		const { rerender } = render(feedFut([f1, f2]));
		fireEvent.click(screen.getByTestId("sell-btn"));
		rerender(feedFut([f1, f2, f3]));
		switchTab("positions");
		expect(screen.getByTestId("position-row-pos_1").textContent).toContain("Short");
		const panel = within(screen.getByTestId("trading-bottom-panel"));
		fireEvent.click(panel.getByTestId("position-reverse-pos_1"));
		expect(screen.queryByTestId("position-row-pos_1")).toBeNull();
		// P1.1: chiều ngược (market) khớp ngay thành long, không qua working treo.
		const row = screen.getByTestId("position-row-pos_2");
		expect(row.textContent).toContain("Long");
		rerender(feedFut([f1, f2, f3, f4]));
		switchTab("positions");
		expect(screen.getByTestId("position-row-pos_2").textContent).toContain("Long");
	});

	it("S6 crypto: one-click mua 1 BTC khớp (lot 1, không bị luật spot chặn)", () => {
		const btcBars = [
			{ open: 77000, high: 77200, low: 76800, close: 77100, volume: 0, date: new Date(1000) },
			{ open: 77100, high: 77300, low: 77000, close: 77200, volume: 0, date: new Date(2000) },
		];
		const btcBar3 = { open: 77200, high: 77400, low: 77100, close: 77300, volume: 0, date: new Date(3000) };
		const feedBtc = (feedBars: typeof btcBars) => (
			<TradingProvider symbol="BTCUSDT" bars={feedBars}>
				<TradingChartSurface snapshot={snapshot} visibleRange={visibleRange} />
				<ConnectedTradingPanel />
			</TradingProvider>
		);
		seedOneClick("BTCUSDT");
		const { rerender } = render(feedBtc(btcBars));
		fireEvent.click(screen.getByTestId("buy-btn"));
		// P1.1: khớp ngay tại mark nến cuối (77200), không đợi btcBar3.
		switchTab("positions");
		expect(screen.getByTestId("position-row-pos_1").textContent).toContain("77,200");
		rerender(feedBtc([...btcBars, btcBar3]));
		switchTab("positions");
		expect(screen.getByTestId("position-row-pos_1").textContent).toContain("77,200");
	});
});
