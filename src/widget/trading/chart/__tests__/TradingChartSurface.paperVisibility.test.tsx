// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen, act } from "@testing-library/react";
import type { PaneRuntimeSnapshot } from "@vninvestcharts/engine-react";
import { TradingProvider, useTradingContext, type TradingContextValue } from "../../context/TradingContext";
import { TradingChartSurface } from "../TradingChartSurface";

/**
 * Batch B / B5 — the trading tab writes `showPaperOrders` and
 * `showPaperPositions` into the settings composite, but the chart surface
 * always rendered the position lines and the pending order lines, so both
 * controls were dead.
 */
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

function tree(props: { showPaperOrders?: boolean; showPaperPositions?: boolean }) {
	return (
		<TradingProvider symbol="FPT" bars={[bars(128000, 128400, 127800, 128200, 1000)]}>
			<Probe />
			<TradingChartSurface
				snapshot={snapshot}
				visibleRange={visibleRange}
				showPaperOrders={props.showPaperOrders}
				showPaperPositions={props.showPaperPositions}
			/>
		</TradingProvider>
	);
}

/** One open position + one working limit order. */
function seedPositionAndOrder() {
	act(() => {
		latest.placeOrder({ symbol: "FPT", side: "buy", type: "market", quantity: 100, price: 128000 });
		latest.broker.placeOrder(
			{ symbol: "FPT", side: "sell", type: "limit", quantity: 100, price: 140000 },
			{ skipValidation: true },
		);
	});
	const limit = latest.broker.getOrders().find((o) => o.type === "limit");
	return limit;
}

describe("TradingChartSurface paper visibility (B5)", () => {
	it("renders the position line and the pending order by default", () => {
		render(tree({}));
		const limit = seedPositionAndOrder();
		expect(screen.getAllByTestId(/position-line-/)).toHaveLength(1);
		expect(screen.queryByTestId(`pending-line-${limit?.id}`)).not.toBeNull();
	});

	it("hides the pending order lines when showPaperOrders is false", () => {
		render(tree({ showPaperOrders: false }));
		const limit = seedPositionAndOrder();
		expect(screen.queryByTestId(`pending-line-${limit?.id}`)).toBeNull();
		// the position line itself stays visible
		expect(screen.getAllByTestId(/position-line-/)).toHaveLength(1);
	});

	it("hides the position lines when showPaperPositions is false", () => {
		render(tree({ showPaperPositions: false }));
		const limit = seedPositionAndOrder();
		expect(screen.queryAllByTestId(/position-line-/)).toHaveLength(0);
		// the pending order stays visible
		expect(screen.queryByTestId(`pending-line-${limit?.id}`)).not.toBeNull();
	});

	it("hides the stop loss / take profit handles when showPaperOrders is false", () => {
		render(tree({ showPaperOrders: false }));
		act(() => {
			latest.placeOrder({
				symbol: "FPT",
				side: "buy",
				type: "market",
				quantity: 100,
				bracket: { takeProfitPrice: 135000, stopLossPrice: 122000 },
			});
		});
		expect(screen.queryByTestId("handle-grip-TP")).toBeNull();
		expect(screen.queryByTestId("handle-grip-SL")).toBeNull();
	});
});
