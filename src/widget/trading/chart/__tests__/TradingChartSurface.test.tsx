import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import type { PaneRuntimeSnapshot } from "@vninvestcharts/engine-react";
import { TradingProvider, useTradingContext, type TradingContextValue } from "../../context/TradingContext";
import { TradingChartSurface } from "../TradingChartSurface";
import { paperConfigKey } from "../../hooks/usePaperRuntimeConfig";
import { resolveMarketProfile } from "../../../../lib/core/trading/MarketRules";

// Task M3: shared broker nhiều mã — Surface chart nào chỉ vẽ vị thế mã đó.
const snapshot = {
	plotBounds: { left: 0, top: 0, width: 800, height: 400 },
	scaleSlotStates: { "price-right": { domain: [50000, 140000] } },
} as unknown as PaneRuntimeSnapshot;
const visibleRange = { from: 0, to: 100 };

function bars(o: number, h: number, l: number, c: number, time: number) {
	return { open: o, high: h, low: l, close: c, volume: 0, date: new Date(time) };
}

let latest!: TradingContextValue;

function Probe() {
	latest = useTradingContext();
	return null;
}

function tree(feed: ReturnType<typeof bars>[]) {
	return (
		<TradingProvider symbol="FPT" bars={feed}>
			<Probe />
			<TradingChartSurface snapshot={snapshot} visibleRange={visibleRange} />
		</TradingProvider>
	);
}

describe("TradingChartSurface symbol filter", () => {
	it("broker giữ 2 mã nhưng Surface FPT chỉ vẽ 1 đường", () => {
		const initial = [bars(128000, 128400, 127800, 128200, 1000)];
		render(tree(initial));
		act(() => {
			// P1.1: FPT khớp ngay tại mark nến cuối (128200). VNM feed riêng qua
			// broker (mô phỏng multi-chart feed per-chart) rồi khớp tại 60200.
			latest.placeOrder({ symbol: "FPT", side: "buy", type: "market", quantity: 100, price: 128000 });
			latest.broker.onBar("VNM", { open: 60200, high: 60600, low: 60000, close: 60400, date: 2000 }, 2000);
			latest.placeOrder({ symbol: "VNM", side: "buy", type: "market", quantity: 100, price: 60000 });
			latest.broker.onBar("FPT", { open: 128500, high: 129000, low: 128000, close: 128800, date: 2000 }, 2000);
		});
		expect(latest.broker.getPositions()).toHaveLength(2);
		const lines = screen.getAllByTestId(/position-line-/);
		expect(lines).toHaveLength(1);
		expect(screen.getByTestId("position-badge-pos_1").textContent).toContain("128,200");
	});
});

describe("TradingChartSurface bracket ownership", () => {
	function bracketTree() {
		const initial = [bars(128000, 128400, 127800, 128200, 1000)];
		render(tree(initial));
		act(() => {
			latest.placeOrder({
				symbol: "FPT",
				side: "buy",
				type: "market",
				quantity: 100,
				bracket: { takeProfitPrice: 135000, stopLossPrice: 122000 },
			});
		});
		const orders = latest.broker.getOrders();
		const tp = orders.find((o) => o.parentOrderId != null && o.type === "limit");
		const sl = orders.find((o) => o.parentOrderId != null && o.type === "stop");
		return { tp, sl };
	}

	it("kéo TP sửa limit.price, không sửa stopPrice", () => {
		const { tp, sl } = bracketTree();
		expect(tp?.price).toBe(135000);
		expect(sl?.stopPrice).toBe(122000);
		expect(screen.getByTestId("handle-grip-TP")).toBeDefined();
		expect(screen.getByTestId("handle-grip-SL")).toBeDefined();
		expect(screen.queryByTestId(`pending-line-${tp?.id}`)).toBeNull();
		expect(screen.queryByTestId(`pending-line-${sl?.id}`)).toBeNull();
		const grip = screen.getByTestId("handle-grip-TP");
		fireEvent.pointerDown(grip, { pointerId: 1, button: 0, clientX: 790, clientY: 20 });
		fireEvent.pointerMove(grip, { pointerId: 1, clientX: 790, clientY: 40 });
		fireEvent.pointerUp(grip, { pointerId: 1, clientX: 790, clientY: 40 });
		const nextTp = latest.broker.getOrders().find((o) => o.id === tp?.id);
		const nextSl = latest.broker.getOrders().find((o) => o.id === sl?.id);
		expect(nextTp?.price).toBe(131000);
		expect(nextTp?.stopPrice).toBeUndefined();
		expect(nextSl?.stopPrice).toBe(122000);
	});

	it("limit thường cùng symbol không bị nhận thành TP", () => {
		render(tree([bars(128000, 128400, 127800, 128200, 1000)]));
		act(() => {
			latest.placeOrder({ symbol: "FPT", side: "buy", type: "market", quantity: 100 });
			latest.broker.placeOrder(
				{ symbol: "FPT", side: "sell", type: "limit", quantity: 100, price: 140000 },
				{ skipValidation: true },
			);
		});
		expect(latest.broker.getPositions()).toHaveLength(1);
		expect(screen.queryByTestId("handle-grip-TP")).toBeNull();
	});
});

// QUICKTRADE_PILLS S1 (A6) + A4: dock góc dưới-phải (style bottom từ pos âm) và
// oneClickTrading đọc từ paper config. jsdom bỏ clamp-mount (rect=0) nên ở đây khóa
// CÔNG THỨC style; bounds-thật là runtime proof (probe staging check 7).
describe("TradingChartSurface — corner dock + one-click từ config (QUICKTRADE_PILLS)", () => {
	beforeEach(() => {
		for (let i = window.localStorage.length - 1; i >= 0; i--) {
			const key = window.localStorage.key(i);
			if (key?.startsWith("vnsc_paper_cfg_")) window.localStorage.removeItem(key);
		}
		window.localStorage.removeItem("vnsc.paperHeader.pos");
	});

	it("default dock nửa-DƯỚI: style bottom: 40px (y=-40), không còn top; oneClick mặc định false", () => {
		render(tree([bars(128000, 128400, 127800, 128200, 1000)]));
		const surface = screen.getByTestId("paper-header-surface");
		expect(surface.style.bottom).toBe("40px");
		expect(surface.style.top).toBe("");
		expect(latest.oneClickTrading).toBe(false);
	});

	it("vị trí cũ y dương vẫn top-anchor (backward compat); seed config → oneClickTrading true", () => {
		window.localStorage.setItem("vnsc.paperHeader.pos", JSON.stringify({ x: -72, y: 96 }));
		window.localStorage.setItem(
			paperConfigKey(resolveMarketProfile("FPT").profile),
			JSON.stringify({ oneClickTrading: true, effectiveFrom: 1 }),
		);
		render(tree([bars(128000, 128400, 127800, 128200, 1000)]));
		const surface = screen.getByTestId("paper-header-surface");
		expect(surface.style.top).toBe("96px");
		expect(surface.style.bottom).toBe("");
		expect(latest.oneClickTrading).toBe(true);
	});
});
