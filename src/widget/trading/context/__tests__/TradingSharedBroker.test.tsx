import { describe, it, expect } from "vitest";
import { render, act } from "@testing-library/react";
import { TradingProvider, useTradingContext, type TradingContextValue } from "../TradingContext";
import { VirtualBrokerEngine } from "../../../../lib/core/trading/VirtualBrokerEngine";
import { MarketDataPort } from "../../../../lib/core/trading/MarketDataPort";
import { VN_SPOT_RULES, VN_DERIVATIVES_RULES, resolveMarketProfile } from "../../../../lib/core/trading/MarketRules";

// Task M3: shared broker — 2 providers chung externalBroker thấy cùng sổ,
// confirmCloseAll chỉ đóng đúng symbol, nhả external rớt về broker cục bộ.

function makeShared() {
	const port = new MarketDataPort({
		tickSizeProvider: (sym, price) => resolveMarketProfile(sym).getTickSize(price),
	});
	const broker = new VirtualBrokerEngine({ rules: VN_SPOT_RULES, marketDataPort: port });
	return { broker, port };
}

function makeSharedFut() {
	const port = new MarketDataPort({
		tickSizeProvider: (sym, price) => resolveMarketProfile(sym).getTickSize(price),
	});
	const broker = new VirtualBrokerEngine({ rules: VN_DERIVATIVES_RULES, marketDataPort: port, initialBalance: 500_000_000 });
	return { broker, port };
}

function futBars(closeA: number, closeB: number) {
	return [
		{ open: closeA, high: closeA + 10, low: closeA - 10, close: closeA, volume: 0, date: new Date(1000) },
		{ open: closeA, high: closeA + 10, low: closeA - 5, close: closeB, volume: 0, date: new Date(2000) },
	];
}

function barsFor(closeA: number, closeB: number) {
	return [
		{ open: closeA, high: closeA + 400, low: closeA - 400, close: closeA, volume: 0, date: new Date(1000) },
		{ open: closeA, high: closeA + 500, low: closeA - 300, close: closeB, volume: 0, date: new Date(2000) },
	];
}

function probeInto(slot: { current: TradingContextValue | null }) {
	return function Probe() {
		slot.current = useTradingContext();
		return null;
	};
}

describe("TradingProvider shared broker (Task M3)", () => {
	it("2 providers chung externalBroker thấy cùng sổ (2 mã, 1 số dư)", () => {
		const shared = makeShared();
		const slotA: { current: TradingContextValue | null } = { current: null };
		const slotB: { current: TradingContextValue | null } = { current: null };
		const ProbeA = probeInto(slotA);
		const ProbeB = probeInto(slotB);
		render(
			<>
				<TradingProvider symbol="FPT" bars={barsFor(128200, 128800)} externalBroker={shared.broker} externalPort={shared.port} chartId="chart-a">
					<ProbeA />
				</TradingProvider>
				<TradingProvider symbol="VNM" bars={barsFor(60200, 60400)} externalBroker={shared.broker} externalPort={shared.port} chartId="chart-b">
					<ProbeB />
				</TradingProvider>
			</>,
		);
		act(() => {
			slotA.current!.placeOrder({ symbol: "FPT", side: "buy", type: "market", quantity: 100, price: 128000 });
			slotB.current!.placeOrder({ symbol: "VNM", side: "buy", type: "market", quantity: 100, price: 60000 });
			// Market fill ở bar tiếp theo (mô phỏng 2 chart cùng feed shared broker).
			shared.broker.onBar("FPT", { open: 128500, high: 129000, low: 128000, close: 128800, date: 3000 }, 3000);
			shared.broker.onBar("VNM", { open: 60200, high: 60600, low: 60000, close: 60400, date: 3000 }, 3000);
		});
		expect(slotA.current!.broker).toBe(shared.broker);
		expect(slotB.current!.broker).toBe(shared.broker);
		expect(slotA.current!.broker.getPositions()).toHaveLength(2);
		expect(slotB.current!.broker.getPositions()).toHaveLength(2);
		expect(slotA.current!.broker.getAccount().equity).toBe(slotB.current!.broker.getAccount().equity);
	});

	it("A6: two providers sharing external replay pair see one replay book through Pause", () => {
		const shared = makeShared();
		const slotA: { current: TradingContextValue | null } = { current: null };
		const slotB: { current: TradingContextValue | null } = { current: null };
		const ProbeA = probeInto(slotA);
		const ProbeB = probeInto(slotB);
		const replayBar = { open: 128200, high: 128500, low: 128000, close: 128300, date: 3000 };
		const renderPair = (playing: boolean) => (
			<>
				<TradingProvider
					symbol="FPT"
					bars={barsFor(128200, 128800)}
					chartId="chart-a"
					replayActive
					replayPlaying={playing}
					replayBar={replayBar}
					externalReplayBroker={shared.broker}
					externalReplayPort={shared.port}
				>
					<ProbeA />
				</TradingProvider>
				<TradingProvider
					symbol="VNM"
					bars={barsFor(60200, 60400)}
					chartId="chart-b"
					replayActive
					replayPlaying={playing}
					replayBar={replayBar}
					externalReplayBroker={shared.broker}
					externalReplayPort={shared.port}
				>
					<ProbeB />
				</TradingProvider>
			</>
		);
		const { rerender } = render(renderPair(true));

		expect(slotA.current!.broker).toBe(shared.broker);
		expect(slotB.current!.broker).toBe(shared.broker);
		act(() => {
			slotA.current!.placeOrder({ symbol: "FPT", side: "buy", type: "market", quantity: 100, price: 128200 });
			shared.broker.onBar("FPT", { open: 128200, high: 128900, low: 128000, close: 128800, date: 4000 }, 4000);
		});
		expect(slotA.current!.broker.getPositions()).toHaveLength(1);

		rerender(renderPair(false));
		expect(slotA.current!.mode).toBe("replay");
		expect(slotB.current!.mode).toBe("replay");
		expect(slotA.current!.broker).toBe(shared.broker);
		expect(slotB.current!.broker.getPositions()).toHaveLength(1);
	});

	it("confirmCloseAll ở chart F1M chỉ đóng F1M, giữ F2M (kể cả nhìn từ chart B)", () => {
		// T+0 phái sinh (spot T+2 khóa đóng trước hạn — semantics đã có test riêng).
		const shared = makeSharedFut();
		const slotA: { current: TradingContextValue | null } = { current: null };
		const slotB: { current: TradingContextValue | null } = { current: null };
		const ProbeA = probeInto(slotA);
		const ProbeB = probeInto(slotB);
		render(
			<>
				<TradingProvider symbol="VN30F1M" bars={futBars(1300, 1305)} rules={VN_DERIVATIVES_RULES} initialBalance={500_000_000} externalBroker={shared.broker} externalPort={shared.port} chartId="chart-a">
					<ProbeA />
				</TradingProvider>
				<TradingProvider symbol="VN30F2M" bars={futBars(1310, 1315)} rules={VN_DERIVATIVES_RULES} initialBalance={500_000_000} externalBroker={shared.broker} externalPort={shared.port} chartId="chart-b">
					<ProbeB />
				</TradingProvider>
			</>,
		);
		act(() => {
			slotA.current!.placeOrder({ symbol: "VN30F1M", side: "buy", type: "market", quantity: 1 });
			slotB.current!.placeOrder({ symbol: "VN30F2M", side: "buy", type: "market", quantity: 1 });
			shared.broker.onBar("VN30F1M", { open: 1300, high: 1310, low: 1295, close: 1305, date: 3000 }, 3000);
			shared.broker.onBar("VN30F2M", { open: 1310, high: 1320, low: 1305, close: 1315, date: 3000 }, 3000);
		});
		expect(shared.broker.getPositions()).toHaveLength(2);
		act(() => {
			slotA.current!.confirmCloseAll();
		});
		expect(shared.broker.getPositions().map((p) => p.symbol)).toEqual(["VN30F2M"]);
		expect(slotB.current!.broker.getPositions()).toHaveLength(1);
	});

	it("brokerFor nhả (crypto) → rớt về broker cục bộ, không dùng ké sổ spot", () => {
		const shared = makeShared();
		const slot: { current: TradingContextValue | null } = { current: null };
		const Probe = probeInto(slot);
		const btcBars = [
			{ open: 67000, high: 67500, low: 66800, close: 67200, volume: 0, date: new Date(1000) },
			{ open: 67200, high: 67800, low: 67000, close: 67600, volume: 0, date: new Date(2000) },
		];
		const { rerender } = render(
			<TradingProvider symbol="FPT" bars={barsFor(128200, 128800)} externalBroker={shared.broker} externalPort={shared.port} chartId="chart-a">
				<Probe />
			</TradingProvider>,
		);
		expect(slot.current!.broker).toBe(shared.broker);
		rerender(
			<TradingProvider symbol="BTCUSDT" bars={btcBars} chartId="chart-a">
				<Probe />
			</TradingProvider>,
		);
		expect(slot.current!.broker).not.toBe(shared.broker);
		expect(slot.current!.broker.getPositions()).toHaveLength(0);
	});
});
