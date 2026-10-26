import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { PaneRuntimeSnapshot } from "@vninvestcharts/engine-core";
import { TradingOverlaysHost } from "../TradingOverlaysHost";
import { roundToTick } from "../priceTicks";
import type { TradingOrder, TradingPosition } from "../../../../lib/core/trading/types";

// Task 08: projector engine THẬT (không mock) + jsdom pointer guard.
const snapshot = {
	plotBounds: { left: 0, top: 0, width: 800, height: 400 },
	scaleSlotStates: { "price-right": { domain: [120000, 140000] } },
} as unknown as PaneRuntimeSnapshot;
const visibleRange = { from: 0, to: 100 };

const position: TradingPosition = {
	id: "pos_1",
	symbol: "FPT",
	side: "long",
	quantity: 100,
	availableQuantity: 100,
	entryPrice: 128500,
	currentPrice: 135000,
	unrealizedPnl: 650000,
	realizedPnl: 0,
	createdAt: 0,
	updatedAt: 0,
};

function host(extra?: object) {
	const handlers = {
		onClosePosition: vi.fn(),
		onReversePosition: vi.fn(),
		onModifyOrder: vi.fn(),
		onCancelOrder: vi.fn(),
	};
	render(
		<TradingOverlaysHost
			snapshot={snapshot}
			visibleRange={visibleRange}
			scaleSlotId="price-right"
			positions={[
				{
					position,
					stopLossPrice: 122000,
					stopOrderId: "ord_sl",
					takeProfitPrice: 135000,
					takeProfitOrderId: "ord_tp",
				},
			]}
			pendingOrders={[]}
			accountEquity={100_000_000}
			tickSize={100}
			{...handlers}
			{...extra}
		/>,
	);
	return handlers;
}

describe("TradingOverlaysHost", () => {
	it("vẽ đường vị thế + badge PnL đúng tọa độ projector", () => {
		host();
		expect(screen.getByTestId("position-line-pos_1")).toBeDefined();
		const badge = screen.getByTestId("position-badge-pos_1").textContent ?? "";
		expect(badge).toContain("128,500");
		expect(badge).toContain("+650,000");
		expect(badge).toContain("5.06%");
	});

	it("kéo SL 360 -> 300: tooltip snap tick + commit 125000", () => {
		const { onModifyOrder } = host();
		const grip = screen.getByTestId("handle-grip-SL");
		fireEvent.pointerDown(grip, { pointerId: 1, button: 0, clientX: 790, clientY: 360 });
		fireEvent.pointerMove(grip, { pointerId: 1, clientX: 790, clientY: 300 });
		expect(screen.getByTestId("handle-tooltip-SL").textContent).toContain("125,000");
		fireEvent.pointerUp(grip, { pointerId: 1, clientX: 790, clientY: 300 });
		expect(onModifyOrder).toHaveBeenCalledTimes(1);
		expect(onModifyOrder).toHaveBeenCalledWith("ord_sl", { stopPrice: 125000 });
	});

	it("kéo TP -> commit price, không ghi stopPrice", () => {
		const { onModifyOrder } = host();
		const grip = screen.getByTestId("handle-grip-TP");
		fireEvent.pointerDown(grip, { pointerId: 1, button: 0, clientX: 790, clientY: 100 });
		fireEvent.pointerMove(grip, { pointerId: 1, clientX: 790, clientY: 60 });
		fireEvent.pointerUp(grip, { pointerId: 1, clientX: 790, clientY: 60 });
		expect(onModifyOrder).toHaveBeenCalledWith("ord_tp", { price: 137000 });
	});

	it("trừ host offset: clientY viewport -> pane-local trước khi đổi giá", () => {
		const { onModifyOrder } = host();
		const hostEl = screen.getByTestId("trading-overlays-host");
		vi.spyOn(hostEl, "getBoundingClientRect").mockReturnValue({
			x: 0,
			y: 100,
			top: 100,
			left: 0,
			right: 800,
			bottom: 500,
			width: 800,
			height: 400,
			toJSON: () => ({}),
		} as DOMRect);
		const grip = screen.getByTestId("handle-grip-SL");
		fireEvent.pointerDown(grip, { pointerId: 1, button: 0, clientX: 790, clientY: 460 });
		fireEvent.pointerMove(grip, { pointerId: 1, clientX: 790, clientY: 400 });
		fireEvent.pointerUp(grip, { pointerId: 1, clientX: 790, clientY: 400 });
		expect(onModifyOrder).toHaveBeenCalledWith("ord_sl", { stopPrice: 125000 });
	});

	it("thả không đổi giá -> không commit", () => {
		const { onModifyOrder } = host();
		const grip = screen.getByTestId("handle-grip-SL");
		fireEvent.pointerDown(grip, { pointerId: 1, button: 0, clientX: 790, clientY: 360 });
		fireEvent.pointerUp(grip, { pointerId: 1, clientX: 790, clientY: 360 });
		expect(onModifyOrder).not.toHaveBeenCalled();
	});

	it("nút đóng/đảo chiều bắn đúng positionId", () => {
		const { onClosePosition, onReversePosition } = host();
		fireEvent.click(screen.getByTestId("position-close-pos_1"));
		fireEvent.click(screen.getByTestId("position-reverse-pos_1"));
		expect(onClosePosition).toHaveBeenCalledWith("pos_1");
		expect(onReversePosition).toHaveBeenCalledWith("pos_1");
	});

	it("giá ngoài viewport -> sticky badge kèm mũi tên", () => {
		host({
			positions: [{ position: { ...position, entryPrice: 150000 } }],
		});
		expect(screen.getByTestId("position-badge-pos_1").textContent).toContain("▲");
	});

	it("domain null -> ẩn (không vẽ giá stale, không crash)", () => {
		const empty = {
			plotBounds: { left: 0, top: 0, width: 800, height: 400 },
			scaleSlotStates: {},
		} as unknown as PaneRuntimeSnapshot;
		render(
			<TradingOverlaysHost
				snapshot={empty}
				visibleRange={visibleRange}
				scaleSlotId="price-right"
				positions={[{ position }]}
				pendingOrders={[]}
				accountEquity={100_000_000}
				tickSize={100}
			/>,
		);
		expect(screen.queryByTestId("position-line-pos_1")).toBeNull();
	});

	it("drawingActive -> nút/handle disabled", () => {
		host({ drawingActive: true });
		expect((screen.getByTestId("position-close-pos_1") as HTMLButtonElement).disabled).toBe(true);
	});

	it("lệnh chờ vẽ nét đứt + hủy được", () => {
		const order: TradingOrder = {
			id: "ord_9",
			clientOrderId: "c9",
			symbol: "FPT",
			side: "buy",
			type: "limit",
			status: "working",
			quantity: 100,
			filledQuantity: 0,
			price: 127000,
			timeInForce: "GTC",
			createdAt: 0,
			updatedAt: 0,
		};
		const { onCancelOrder } = host({ positions: [], pendingOrders: [order] });
		expect(screen.getByTestId("pending-line-ord_9")).toBeDefined();
		fireEvent.click(screen.getByTestId("pending-cancel-ord_9"));
		expect(onCancelOrder).toHaveBeenCalledWith("ord_9");
	});
});

describe("roundToTick", () => {
	it("làm tròn theo tick, passthrough khi tick invalid", () => {
		expect(roundToTick(128432.17, 100)).toBe(128400);
		expect(roundToTick(128450, 100)).toBe(128500);
		expect(roundToTick(5, 0)).toBe(5);
	});
});

describe("TVP-A1 pill strip + axis tags + connectors", () => {
	const axisSnapshot = {
		plotBounds: { left: 0, top: 0, width: 800, height: 400 },
		scaleSlotStates: { "price-right": { domain: [120000, 140000] } },
		axisBounds: { right: { left: 752, top: 0, width: 48, height: 400 } },
	} as unknown as PaneRuntimeSnapshot;

	function axisHost() {
		const handlers = {
			onClosePosition: vi.fn(),
			onReversePosition: vi.fn(),
			onModifyOrder: vi.fn(),
			onCancelOrder: vi.fn(),
		};
		render(
			<TradingOverlaysHost
				snapshot={axisSnapshot}
				visibleRange={visibleRange}
				scaleSlotId="price-right"
				positions={[
					{
						position,
						stopLossPrice: 122000,
						stopOrderId: "ord_sl",
						takeProfitPrice: 135000,
						takeProfitOrderId: "ord_tp",
					},
				]}
				pendingOrders={[]}
				accountEquity={100_000_000}
				tickSize={100}
				{...handlers}
			/>,
		);
		return handlers;
	}

	it("pill strip gom side/qty/entry/PnL + nút trong cùng dải", () => {
		const { onClosePosition } = axisHost();
		const badge = screen.getByTestId("position-badge-pos_1");
		expect(badge.textContent).toContain("Long");
		expect(badge.textContent).toContain("128,500");
		expect(badge.textContent).toContain("+650,000");
		expect(badge.querySelector('[data-testid="position-close-pos_1"]')).not.toBeNull();
		expect(badge.querySelector('[data-testid="position-reverse-pos_1"]')).not.toBeNull();
		fireEvent.click(screen.getByTestId("position-close-pos_1"));
		expect(onClosePosition).toHaveBeenCalledWith("pos_1");
	});

	it("axis tag vị thế đúng tọa độ axisBounds.right + màu long", () => {
		axisHost();
		const tag = screen.getByTestId("position-axis-pos_1") as HTMLElement;
		expect(tag.style.left).toBe("752px");
		expect(tag.style.maxWidth).toBe("48px");
		expect(tag.textContent).toContain("128,500");
	});

	it("fallback mép pane khi thiếu axisBounds (không crash)", () => {
		host();
		const tag = screen.getByTestId("position-axis-pos_1") as HTMLElement;
		expect(tag.style.left).toBe("800px");
		expect(tag.style.maxWidth).toBe("48px");
	});

	it("connectors nối entry↔SL/TP đúng chiều cao", () => {
		axisHost();
		// entry 128500 -> y230; SL 122000 -> y360; TP 135000 -> y100.
		const sl = screen.getByTestId("bracket-sl-pos_1") as HTMLElement;
		expect(Number.parseFloat(sl.style.top)).toBeCloseTo(230, 5);
		expect(Number.parseFloat(sl.style.height)).toBeCloseTo(130, 5);
		const tp = screen.getByTestId("bracket-tp-pos_1") as HTMLElement;
		expect(Number.parseFloat(tp.style.top)).toBeCloseTo(100, 5);
		expect(Number.parseFloat(tp.style.height)).toBeCloseTo(130, 5);
	});

	it("click nền strip không kích hoạt đóng (passthrough gesture)", () => {
		const { onClosePosition } = axisHost();
		fireEvent.click(screen.getByTestId("position-badge-pos_1"));
		expect(onClosePosition).not.toHaveBeenCalled();
	});
});
