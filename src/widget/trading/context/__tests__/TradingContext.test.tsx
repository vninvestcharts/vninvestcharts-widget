import { describe, it, expect, vi } from "vitest";
import { render, waitFor, act, fireEvent } from "@testing-library/react";
import { TradingProvider, useTradingContext, type TradingContextValue } from "../TradingContext";
import { TradingStorage } from "../../../../lib/core/trading/storage/TradingStorage";
import { TradingChartSurface } from "../../chart/TradingChartSurface";
import { InMemoryStorageAdapter } from "../../../../lib/core/trading/storage/InMemoryStorageAdapter";
import { VN_DERIVATIVES_RULES, VN_SPOT_RULES } from "../../../../lib/core/trading/MarketRules";
import { VirtualBrokerEngine } from "../../../../lib/core/trading/VirtualBrokerEngine";
import { MarketDataPort } from "../../../../lib/core/trading/MarketDataPort";

// Task 10: provider dual-broker + sandbox + persist + audio + ticket/edit/close.
function bars(timeA: number, timeB: number) {
	return [
		{ open: 128000, high: 128400, low: 127800, close: 128200, volume: 0, date: new Date(timeA) },
		{ open: 128500, high: 129000, low: 128000, close: 128800, volume: 0, date: new Date(timeB) },
	];
}

function probe(onValue: (value: TradingContextValue) => void) {
	return function Probe() {
		onValue(useTradingContext());
		return null;
	};
}

describe("TradingContext live", () => {
	it("feed bars -> đặt lệnh -> vị thế trong panelProps (migrate hook case)", () => {
		let latest!: TradingContextValue;
		const Probe = probe((value) => {
			latest = value;
		});
		render(
			<TradingProvider symbol="FPT" bars={bars(1000, 2000)}>
				<Probe />
			</TradingProvider>,
		);
		expect(latest.mode).toBe("live");
		expect(latest.panelProps.positions).toHaveLength(0);
		act(() => {
			latest.broker.placeOrder({ symbol: "FPT", side: "buy", type: "market", quantity: 100 });
		});
		// P1.1: live market khớp ngay tại mark 128800 (không treo working chờ nến).
		expect(latest.panelProps.positions).toHaveLength(1);
		expect(latest.panelProps.positions[0].entryPrice).toBe(128800);
		expect(latest.panelProps.orders).toHaveLength(0);
	});

	it("P1.1: live broker khớp market ngay tại mark, không cần onBar sau", () => {
		let latest!: TradingContextValue;
		const Probe = probe((value) => {
			latest = value;
		});
		render(
			<TradingProvider symbol="FPT" bars={bars(1000, 2000)}>
				<Probe />
			</TradingProvider>,
		);
		expect(latest.mode).toBe("live");
		act(() => {
			latest.broker.placeOrder({ symbol: "FPT", side: "buy", type: "market", quantity: 100 });
		});
		expect(latest.panelProps.positions).toHaveLength(1);
		expect(latest.panelProps.positions[0].entryPrice).toBe(128800);
		expect(latest.panelProps.orders).toHaveLength(0);
	});

	it("reverse + log buffer (migrate hook case, futures T+0)", () => {
		let latest!: TradingContextValue;
		const Probe = probe((value) => {
			latest = value;
		});
		const futBars = [
			{ open: 1300, high: 1305, low: 1295, close: 1300, volume: 0, date: new Date(1000) },
			{ open: 1300, high: 1310, low: 1295, close: 1310, volume: 0, date: new Date(2000) },
		];
		const bar3 = { open: 1300, high: 1310, low: 1295, close: 1305, volume: 0, date: new Date(3000) };
		const { rerender } = render(
			<TradingProvider symbol="VN30F1M" bars={futBars} rules={VN_DERIVATIVES_RULES} initialBalance={80_000_000}>
				<Probe />
			</TradingProvider>,
		);
		act(() => {
			latest.broker.placeOrder({ symbol: "VN30F1M", side: "sell", type: "market", quantity: 1 });
		});
		rerender(
			<TradingProvider symbol="VN30F1M" bars={[...futBars, bar3]} rules={VN_DERIVATIVES_RULES} initialBalance={80_000_000}>
				<Probe />
			</TradingProvider>,
		);
		expect(latest.panelProps.positions).toHaveLength(1);
		act(() => {
			latest.panelProps.onReversePosition(latest.panelProps.positions[0].id);
		});
		// P1.1: chiều ngược khớp ngay thành vị thế long (không qua working treo).
		expect(latest.panelProps.positions).toHaveLength(1);
		expect(latest.panelProps.positions[0].side).toBe("long");
		expect(latest.panelProps.orders).toHaveLength(0);
		expect(latest.panelProps.log.length).toBeGreaterThan(0);
	});

	it("ticket open/close + edit target + close-request flow", () => {
		let latest!: TradingContextValue;
		const Probe = probe((value) => {
			latest = value;
		});
		render(
			<TradingProvider symbol="FPT" bars={bars(1000, 2000)}>
				<Probe />
			</TradingProvider>,
		);
		act(() => {
			latest.openTicket("sell");
		});
		expect(latest.ticket).toMatchObject({ open: true, side: "sell" });
		act(() => {
			latest.openTicket("buy", undefined, 250);
		});
		expect(latest.ticket).toMatchObject({ open: true, side: "buy", quantity: 250 });
		act(() => {
			latest.closeTicket();
		});
		expect(latest.ticket.open).toBe(false);
		act(() => {
			latest.broker.placeOrder({ symbol: "FPT", side: "buy", type: "limit", quantity: 100, price: 127000 });
			const id = latest.broker.getOrders()[0].id;
			latest.startEditOrder(id);
		});
		expect(latest.editTarget?.orderId).toBeDefined();
		expect(latest.ticket.open).toBe(true);
		act(() => {
			latest.setOneKeyClose(true);
			latest.requestClose();
		});
		expect(latest.closeRequested).toBe(false);
	});
});

describe("TradingContext sandbox + persist + audio", () => {
	it("replay active -> broker replay độc lập; thoát replay -> live nguyên vẹn", () => {
		let latest!: TradingContextValue;
		const Probe = probe((value) => {
			latest = value;
		});
		const base = { symbol: "FPT", bars: bars(1000, 2000) };
		const { rerender } = render(
			<TradingProvider {...base}>
				<Probe />
			</TradingProvider>,
		);
		act(() => {
			latest.broker.placeOrder({ symbol: "FPT", side: "buy", type: "market", quantity: 100 });
		});
		expect(latest.mode).toBe("live");
		const replayBar = { open: 128000, high: 128500, low: 127500, close: 128200, date: 5000 };
		rerender(
			<TradingProvider {...base} replayActive replayPlaying replayBar={replayBar}>
				<Probe />
			</TradingProvider>,
		);
		expect(latest.mode).toBe("replay");
		expect(latest.panelProps.positions).toHaveLength(0);
		act(() => {
			latest.broker.placeOrder({ symbol: "FPT", side: "buy", type: "market", quantity: 100 });
		});
		rerender(
			<TradingProvider
				{...base}
				replayActive
				replayPlaying
				replayBar={{ ...replayBar, open: 128200, close: 128600, date: 6000 }}
			>
				<Probe />
			</TradingProvider>,
		);
		expect(latest.panelProps.positions).toHaveLength(1);
		rerender(
			<TradingProvider {...base}>
				<Probe />
			</TradingProvider>,
		);
		expect(latest.mode).toBe("live");
		// P1.1: vị thế live đã khớp được bảo toàn qua excursion replay (mạnh hơn cũ).
		expect(latest.panelProps.positions).toHaveLength(1);
		expect(latest.panelProps.orders).toHaveLength(0);
	});

	it("A6: Pause at the last bar stays in replay mode and keeps the replay book", () => {
		let latest!: TradingContextValue;
		const Probe = probe((value) => {
			latest = value;
		});
		const base = { symbol: "FPT", bars: bars(1000, 2000) };
		const replayBar = { open: 128000, high: 128500, low: 127500, close: 128200, date: 5000 };
		const { rerender } = render(
			<TradingProvider {...base} replayActive replayPlaying replayBar={replayBar}>
				<Probe />
			</TradingProvider>,
		);
		act(() => {
			latest.broker.placeOrder({ symbol: "FPT", side: "buy", type: "market", quantity: 100 });
		});
		rerender(
			<TradingProvider
				{...base}
				replayActive
				replayPlaying
				replayBar={{ ...replayBar, open: 128200, close: 128600, date: 6000 }}
			>
				<Probe />
			</TradingProvider>,
		);
		expect(latest.panelProps.positions).toHaveLength(1);

		rerender(
			<TradingProvider
				{...base}
				replayActive
				replayPlaying={false}
				replayBar={{ ...replayBar, open: 128200, close: 128600, date: 6000 }}
			>
				<Probe />
			</TradingProvider>,
		);

		expect(latest.mode).toBe("replay");
		expect(latest.panelProps.positions).toHaveLength(1);
	});

	it("A6: external replay broker/port is authoritative and not reset by Pause/Stop/epoch", () => {
		const externalBroker = new VirtualBrokerEngine({ rules: VN_SPOT_RULES });
		const externalPort = new MarketDataPort();
		let latest!: TradingContextValue;
		const Probe = probe((value) => {
			latest = value;
		});
		const base = {
			symbol: "FPT",
			bars: bars(1000, 2000),
			externalReplayBroker: externalBroker,
			externalReplayPort: externalPort,
		};
		const replayBar = { open: 128000, high: 128500, low: 127500, close: 128200, date: 5000 };
		const { rerender } = render(
			<TradingProvider {...base} replayActive replayPlaying replayBar={replayBar}>
				<Probe />
			</TradingProvider>,
		);
		expect(latest.broker).toBe(externalBroker);
		expect(latest.port).toBe(externalPort);

		const nextBar = { ...replayBar, open: 128200, close: 128600, date: 6000 };
		act(() => {
			externalPort.feedBar("FPT", replayBar);
			externalBroker.onBar("FPT", replayBar, replayBar.date);
			latest.broker.placeOrder({ symbol: "FPT", side: "buy", type: "market", quantity: 100 });
			externalPort.feedBar("FPT", nextBar);
			externalBroker.onBar("FPT", nextBar, nextBar.date);
		});
		rerender(
			<TradingProvider {...base} replayActive replayPlaying replayBar={nextBar}>
				<Probe />
			</TradingProvider>,
		);
		expect(latest.panelProps.positions).toHaveLength(1);

		rerender(
			<TradingProvider {...base} replayActive replayPlaying={false} replayBar={replayBar}>
				<Probe />
			</TradingProvider>,
		);
		expect(latest.mode).toBe("replay");
		expect(latest.broker).toBe(externalBroker);
		expect(latest.panelProps.positions).toHaveLength(1);

		rerender(
			<TradingProvider {...base} replayEpoch={1}>
				<Probe />
			</TradingProvider>,
		);
		expect(latest.mode).toBe("live");
		expect(latest.broker).not.toBe(externalBroker);
		expect(externalBroker.getPositions()).toHaveLength(1);
	});

	it("hydrate từ storage chung khôi phục vị thế (persistence)", async () => {
		const adapter = new InMemoryStorageAdapter();
		let latest!: TradingContextValue;
		const Probe = probe((value) => {
			latest = value;
		});
		const { unmount } = render(
			<TradingProvider symbol="FPT" bars={bars(1000, 2000)} storageAdapter={adapter}>
				<Probe />
			</TradingProvider>,
		);
		act(() => {
			latest.broker.placeOrder({ symbol: "FPT", side: "buy", type: "market", quantity: 100 });
		});
		await act(async () => {
			await latest.broker.flush();
		});
		unmount();
		let latest2!: TradingContextValue;
		const Probe2 = probe((value) => {
			latest2 = value;
		});
		render(
			<TradingProvider symbol="FPT" bars={bars(1000, 2000)} storageAdapter={adapter}>
				<Probe2 />
			</TradingProvider>,
		);
		await waitFor(() => {
			// P1.1: vị thế đã khớp được persist, không còn treo working.
			expect(latest2.panelProps.positions).toHaveLength(1);
		});
	});

	it("fill bắn audio chime qua adapter inject", () => {
		const playAlertSound = vi.fn();
		let latest!: TradingContextValue;
		const Probe = probe((value) => {
			latest = value;
		});
		render(
			<TradingProvider symbol="FPT" bars={bars(1000, 2000)} audioAdapter={{ playAlertSound } as never}>
				<Probe />
			</TradingProvider>,
		);
		act(() => {
			latest.broker.placeOrder({ symbol: "FPT", side: "buy", type: "market", quantity: 100 });
			latest.broker.onBar("FPT", { open: 128500, high: 129000, low: 128000, close: 128800, date: 3000 }, 3000);
		});
		expect(playAlertSound).toHaveBeenCalledTimes(1);
	});
});

describe("TradingContext market profiles (TVP-B3)", () => {
	const btcBars = [
		{ open: 77000, high: 77200, low: 76800, close: 77100, volume: 0, date: new Date(1000) },
		{ open: 77100, high: 77300, low: 77000, close: 77200, volume: 0, date: new Date(2000) },
	];

	it("BTCUSDT resolve crypto: mua 1 BTC khớp (spot VN sẽ reject lô lẻ)", () => {
		let latest!: TradingContextValue;
		const Probe = probe((value) => {
			latest = value;
		});
		render(
			<TradingProvider symbol="BTCUSDT" bars={btcBars}>
				<Probe />
			</TradingProvider>,
		);
		expect(latest.rules.profile).toBe("GLOBAL_MARGIN");
		expect(latest.rules.lotSize).toBe(1);
		let placed: { status: string } | undefined;
		act(() => {
			placed = latest.placeOrder({ symbol: "BTCUSDT", side: "buy", type: "market", quantity: 1 });
		});
		// P1.1: live broker khớp market ngay (không treo working chờ nến).
		expect(placed!.status).toBe("filled");
	});

	it("đổi market FPT -> BTCUSDT: recreate broker + ghi log (positions cũ không lẫn)", () => {
		let latest!: TradingContextValue;
		const Probe = probe((value) => {
			latest = value;
		});
		const { rerender } = render(
			<TradingProvider symbol="FPT" bars={bars(1000, 2000)}>
				<Probe />
			</TradingProvider>,
		);
		act(() => {
			latest.broker.placeOrder({ symbol: "FPT", side: "buy", type: "market", quantity: 100 });
		});
		rerender(
			<TradingProvider symbol="BTCUSDT" bars={btcBars}>
				<Probe />
			</TradingProvider>,
		);
		expect(latest.panelProps.positions).toHaveLength(0);
		expect(latest.panelProps.log.some((entry) => entry.message.includes("Switched market profile"))).toBe(true);
	});

	it("placeOrder qua context log rejection thay vì im lặng", () => {
		let latest!: TradingContextValue;
		const Probe = probe((value) => {
			latest = value;
		});
		render(
			<TradingProvider symbol="FPT" bars={bars(1000, 2000)}>
				<Probe />
			</TradingProvider>,
		);
		let placed: { status: string } | undefined;
		act(() => {
			placed = latest.placeOrder({ symbol: "FPT", side: "buy", type: "market", quantity: 50 });
		});
		expect(placed!.status).toBe("rejected");
		expect(latest.panelProps.log.some((entry) => entry.message.includes("bị từ chối"))).toBe(true);
	});
});

describe("TradingContext multichart isolation (M1+M2)", () => {
	it("M1: 2 charts cùng profile + chung adapter -> sổ lệnh độc lập", async () => {
		const adapter = new InMemoryStorageAdapter();
		let latestA!: TradingContextValue;
		let latestB!: TradingContextValue;
		const ProbeA = probe((value) => {
			latestA = value;
		});
		const ProbeB = probe((value) => {
			latestB = value;
		});
		render(
			<TradingProvider symbol="FPT" bars={bars(1000, 2000)} chartId="chart-a" storageAdapter={adapter}>
				<ProbeA />
			</TradingProvider>,
		);
		render(
			<TradingProvider symbol="FPT" bars={bars(1000, 2000)} chartId="chart-b" storageAdapter={adapter}>
				<ProbeB />
			</TradingProvider>,
		);
		act(() => {
			latestA.broker.placeOrder({ symbol: "FPT", side: "buy", type: "market", quantity: 100 });
		});
		expect(latestA.broker.getOrders()).toHaveLength(1);
		expect(latestB.broker.getOrders()).toHaveLength(0);
		await act(async () => {
			await latestA.broker.flush();
			await latestB.broker.flush();
		});
		let latestA2!: TradingContextValue;
		const ProbeA2 = probe((value) => {
			latestA2 = value;
		});
		render(
			<TradingProvider symbol="FPT" bars={bars(1000, 2000)} chartId="chart-a" storageAdapter={adapter}>
				<ProbeA2 />
			</TradingProvider>,
		);
		await waitFor(() => {
			// P1.1: chart-a khôi phục vị thế đã khớp (isolation mạnh hơn orders treo).
			expect(latestA2.panelProps.positions).toHaveLength(1);
		});
	});

	it("M2: Shift+B chỉ mở ticket ở chart active (inactive im lặng tuyệt đối)", () => {
		let latestOn!: TradingContextValue;
		let latestOff!: TradingContextValue;
		const ProbeOn = probe((value) => {
			latestOn = value;
		});
		const ProbeOff = probe((value) => {
			latestOff = value;
		});
		const snapshot = {
			plotBounds: { left: 0, top: 0, width: 800, height: 400 },
			scaleSlotStates: { "price-right": { domain: [120000, 140000] } },
		} as never;
		const visibleRange = { from: 0, to: 100 } as never;
		const { unmount: unmountOn } = render(
			<TradingProvider symbol="FPT" bars={bars(1000, 2000)} chartId="chart-a" isActiveChart>
				<ProbeOn />
				<TradingChartSurface snapshot={snapshot} visibleRange={visibleRange} />
			</TradingProvider>,
		);
		render(
			<TradingProvider symbol="FPT" bars={bars(1000, 2000)} chartId="chart-b" isActiveChart={false}>
				<ProbeOff />
				<TradingChartSurface snapshot={snapshot} visibleRange={visibleRange} />
			</TradingProvider>,
		);
		expect(latestOn.isActiveChart).toBe(true);
		expect(latestOff.isActiveChart).toBe(false);
		fireEvent.keyDown(window, { key: "B", shiftKey: true });
		expect(latestOn.ticket.open).toBe(true);
		expect(latestOff.ticket.open).toBe(false);
		unmountOn();
	});

	it("M1 migration: key legacy được adopt ngay ở mount đầu (không cần reload)", async () => {
		const adapter = new InMemoryStorageAdapter();
		await new TradingStorage(adapter, "vnsc_paper_live_VN_SPOT").saveState({
			version: 1,
			savedAt: 1,
			account: {
				accountId: "paper",
				balance: 100_000_000,
				equity: 100_000_000,
				marginUsed: 0,
				freeMargin: 100_000_000,
				buyingPower: 100_000_000,
				currency: "VND",
				pnl: 0,
				pnlPercent: 0,
			},
			orders: [],
			positions: [
				{
					id: "pos_legacy",
					symbol: "FPT",
					side: "long",
					quantity: 100,
					availableQuantity: 100,
					entryPrice: 128500,
					currentPrice: 128500,
					unrealizedPnl: 0,
					realizedPnl: 0,
					createdAt: 1,
					updatedAt: 1,
				},
			],
			trailingPeaks: {},
			history: [],
			closedTrades: [],
			equityCurve: [],
		});
		let latest!: TradingContextValue;
		const Probe = probe((value) => {
			latest = value;
		});
		render(
			<TradingProvider symbol="FPT" bars={bars(1000, 2000)} chartId="chart-a" storageAdapter={adapter}>
				<Probe />
			</TradingProvider>,
		);
		await waitFor(() => {
			expect(latest.panelProps.positions.map((p) => p.id)).toContain("pos_legacy");
		});
		const migrated = await new TradingStorage(adapter, "vnsc_paper_live_VN_SPOT_chart-a").loadState();
		expect(migrated?.positions.map((p) => p.id)).toContain("pos_legacy");
	});
});
