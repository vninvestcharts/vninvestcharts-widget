/**
 * WE2 P2-09: useWorkspaceReplayTrading (Task 11 rewired)
 *
 * Singleton replay-trading session cho toàn bộ workspace (H3 = workspace-level).
 * Ruột tính toán chạy bằng VirtualBrokerEngine (REPLAY_SPOT_RULES: T+0, cho short);
 * shapes legacy (positions/closedTrades/analytics) giữ nguyên cho consumers
 * (markers, panel, interaction). Legacy ReplayOrderBook không còn chạy ở đây.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { MarketDataPort } from "../../lib/core/trading/MarketDataPort";
import { VirtualBrokerEngine } from "../../lib/core/trading/VirtualBrokerEngine";
import { ReplaySessionAnalytics, type ReplayAnalyticsStats } from "../../lib/core/replay/ReplaySessionAnalytics";
import {
	REPLAY_SPOT_RULES,
	mapPositionToReplay,
	mapReplayOrderToBrokerInput,
	mapTicketToReplayTrade,
	matchCloseLeg,
	type ReplayEntryInfo,
} from "../../lib/core/replay/replayBrokerAdapters";
import type {
	ReplayExecutedTrade,
	ReplayOHLCBar,
	ReplayOrder,
	ReplayPosition,
} from "../../lib/core/replay/replayTradingTypes";
import type { WorkspaceReplayTradingValue } from "../context/WorkspaceReplayTradingContext";

export interface UseWorkspaceReplayTradingOptions {
	slippageBps?: number;
	fillOnNextBar?: boolean;
	realisticSlTpFill?: boolean;
	onTradeExecuted?: (trade: ReplayExecutedTrade) => void;
}

const LOG_CAP = 200;

export interface ReplayLogEntry {
	timestamp: number;
	message: string;
}

export function useWorkspaceReplayTrading(
	options: UseWorkspaceReplayTradingOptions,
): WorkspaceReplayTradingValue {
	const { onTradeExecuted } = options;

	const [enabled, setEnabled] = useState(false);
	const enabledRef = useRef(false);
	const [sessionOwnerId, setSessionOwnerId] = useState<string | null>(null);

	const brokerRef = useRef<VirtualBrokerEngine | null>(null);
	const portRef = useRef<MarketDataPort | null>(null);
	const analyticsRef = useRef<ReplaySessionAnalytics | null>(null);
	const prevBarRef = useRef(-1);
	const prevBarBySymbolRef = useRef(new Map<string, number>());
	const activeSymbolRef = useRef<string | undefined>(undefined);
	const onTradeRef = useRef(onTradeExecuted);
	onTradeRef.current = onTradeExecuted;
	const markRef = useRef(new Map<string, number>());
	const ledgerRef = useRef(new Map<string, ReplayEntryInfo>());
	const childRef = useRef(new Map<string, { sl?: string; tp?: string }>());
	const historyLenRef = useRef(0);
	const preBatchRef = useRef<Array<{ id: string; symbol: string; side: "long" | "short"; quantity: number }> | null>(null);
	const closedTradesRef = useRef<ReplayExecutedTrade[]>([]);

	const [positions, setPositions] = useState<ReplayPosition[]>([]);
	const [closedTrades, setClosedTrades] = useState<ReplayExecutedTrade[]>([]);
	const [totalPnl, setTotalPnl] = useState(0);
	const [orderCount, setOrderCount] = useState(0);
	const [analytics, setAnalytics] = useState<ReplayAnalyticsStats>(() => new ReplaySessionAnalytics().getStats());
	const [log, setLog] = useState<ReplayLogEntry[]>([]);

	let broker = brokerRef.current;
	if (!broker) {
		broker = new VirtualBrokerEngine({ rules: REPLAY_SPOT_RULES });
		brokerRef.current = broker;
	}
	if (!portRef.current) {
		portRef.current = new MarketDataPort();
	}
	if (!analyticsRef.current) {
		analyticsRef.current = new ReplaySessionAnalytics();
	}

	const pushLog = useCallback((message: string) => {
		setLog((prev) => [...prev.slice(-(LOG_CAP - 1)), { timestamp: Date.now(), message }]);
	}, []);

	const syncState = useCallback(
		(currentBar: number): { newTrades: ReplayExecutedTrade[]; total: number } => {
			const broker = brokerRef.current;
			const analytics = analyticsRef.current;
			if (!broker || !analytics) return { newTrades: [], total: 0 };
			for (const p of broker.getPositions()) {
				if (!ledgerRef.current.has(p.id)) {
					ledgerRef.current.set(p.id, { entryPrice: p.entryPrice, entryTimestamp: p.createdAt, entryBarIndex: currentBar });
				}
			}
			for (const [symbol, kids] of childRef.current) {
				const alive = broker.getPositions().some((p) => p.symbol === symbol);
				if (!alive) {
					if (kids.sl) broker.cancelOrder(kids.sl);
					if (kids.tp) broker.cancelOrder(kids.tp);
					childRef.current.delete(symbol);
				}
			}
			const history = broker.getHistory();
			const fresh = history.slice(historyLenRef.current);
			historyLenRef.current = history.length;
			const preBatch = preBatchRef.current;
			preBatchRef.current = null;
			const newTrades: ReplayExecutedTrade[] = [];
			for (const ticket of fresh) {
				const match = matchCloseLeg(ticket, preBatch, ledgerRef.current, currentBar);
				if (!match) continue;
				const dir = match.entry.positionSide === "long" ? 1 : -1;
				const gross = (ticket.fillPrice - match.entry.entryPrice) * dir * match.closeQuantity;
				newTrades.push(
					mapTicketToReplayTrade({ ...ticket, fillQuantity: match.closeQuantity, pnl: gross }, match.entry, currentBar),
				);
			}
			for (const id of [...ledgerRef.current.keys()]) {
				if (!broker.getPositionById(id)) ledgerRef.current.delete(id);
			}
			const mapped = broker.getPositions().map((p) => {
				const kids = childRef.current.get(p.symbol);
				const orders = broker.getOrders();
				const sl = kids?.sl ? orders.find((o) => o.id === kids.sl && o.status === "working") : undefined;
				const tp = kids?.tp ? orders.find((o) => o.id === kids.tp && o.status === "working") : undefined;
				return mapPositionToReplay(p, {
					mark: markRef.current.get(p.symbol) ?? p.currentPrice,
					stopLoss: sl?.stopPrice,
					takeProfit: tp?.price,
					entryBarIndex: ledgerRef.current.get(p.id)?.entryBarIndex ?? currentBar,
				});
			});
			const allClosed = [...closedTradesRef.current, ...newTrades];
			closedTradesRef.current = allClosed;
			if (newTrades.length > 0) {
				const lines = newTrades.map(
					(t) => `Fill ${t.side} ${t.quantity} ${t.symbol} @ ${t.exitPrice} (${t.exitReason})`,
				);
				setLog((prev) => [...prev.slice(-(LOG_CAP - lines.length)), ...lines.map((message) => ({ timestamp: Date.now(), message }))]);
			}
			setClosedTrades(allClosed);
			setPositions(mapped);
			const total = mapped.reduce((sum, p) => sum + p.unrealizedPnl, 0) + allClosed.reduce((sum, t) => sum + t.pnl, 0);
			setTotalPnl(total);
			setOrderCount(broker.getOrders().filter((o) => o.status === "working" || o.status === "filled").length);
			setAnalytics(analytics.getStats(allClosed));
			return { newTrades, total };
		},
		[],
	);

	const feedBar = useCallback(
		(bar: ReplayOHLCBar, currentBar: number, timestamp?: number, symbol?: string, bars?: readonly ReplayOHLCBar[]) => {
			if (!enabledRef.current) return;
			const broker = brokerRef.current;
			const analytics = analyticsRef.current;
			if (!broker || !analytics) return;
			if (symbol) activeSymbolRef.current = symbol;
			if (currentBar < 0) return;
			const feedSymbol = symbol ?? activeSymbolRef.current ?? "";
			if (!feedSymbol) return;

			const lastProcessed = prevBarBySymbolRef.current.get(feedSymbol) ?? currentBar - 1;
			if (currentBar === lastProcessed) {
				prevBarBySymbolRef.current.set(feedSymbol, currentBar);
				return;
			}

			const forward = currentBar > lastProcessed;
			const order: number[] = [];
			if (forward) {
				for (let i = lastProcessed + 1; i <= currentBar; i++) order.push(i);
			} else {
				for (let i = currentBar; i < lastProcessed; i++) order.push(i);
			}

			let barDuration = 0;
			if (bars && bars.length > 1 && typeof bars[1].date === "number" && typeof bars[0].date === "number") {
				barDuration = (bars[1].date as number) - (bars[0].date as number);
			}
			const baseTime = timestamp ?? Date.now();

			preBatchRef.current = broker.getPositions().map((p) => ({ id: p.id, symbol: p.symbol, side: p.side, quantity: p.quantity }));
			for (const idx of order) {
				const b = bars && bars[idx] ? bars[idx] : bar;
				if (!b) continue;
				const barTime = typeof b.date === "number" ? b.date : baseTime + (idx - currentBar) * barDuration;
				markRef.current.set(feedSymbol, b.close);
				portRef.current?.feedBar(feedSymbol, b);
				broker.onBar(feedSymbol, b, barTime);
			}
			prevBarBySymbolRef.current.set(feedSymbol, currentBar);
			prevBarRef.current = currentBar;
			const { total } = syncState(currentBar);
			analytics.recordEquity(currentBar, total);
			setAnalytics(analyticsRef.current!.getStats(closedTradesRef.current));
		},
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[enabled],
	);

	const placeOrder = useCallback(
		(partial: Omit<ReplayOrder, "id" | "timestamp">) => {
			const broker = brokerRef.current;
			if (!broker) return;
			const input = mapReplayOrderToBrokerInput(partial);
			if (!input.symbol) input.symbol = activeSymbolRef.current ?? "";
			if (partial.reduceOnly) {
				const opp = broker
					.getPositions()
					.find((p) => p.symbol === input.symbol && ((p.side === "long") === (input.side === "sell")));
				if (!opp) return;
				input.quantity = Math.min(input.quantity, opp.quantity);
			}
			broker.placeOrder(input, { skipValidation: true });
			setOrderCount(broker.getOrders().filter((o) => o.status === "working" || o.status === "filled").length);
		},
		[],
	);

	const closePosition = useCallback(
		(positionId: string) => {
			const broker = brokerRef.current;
			if (!broker) return;
			const pos = broker.getPositionById(positionId);
			if (!pos) return;
			preBatchRef.current = [{ id: pos.id, symbol: pos.symbol, side: pos.side, quantity: pos.quantity }];
			const barIndex = prevBarRef.current;
			try {
				broker.closePosition(positionId);
			} catch {
				return;
			}
			const { newTrades } = syncState(barIndex);
			for (const trade of newTrades) onTradeRef.current?.(trade);
		},
		[syncState],
	);

	const trackChildOrder = useCallback((symbol: string, kind: "sl" | "tp", orderId: string) => {
		const kids = childRef.current.get(symbol) ?? {};
		kids[kind] = orderId;
		childRef.current.set(symbol, kids);
	}, []);

	const setStopLoss = useCallback(
		(positionId: string, price: number): boolean => {
			const broker = brokerRef.current;
			if (!broker) return false;
			const pos = broker.getPositionById(positionId);
			if (!pos) return false;
			const kids = childRef.current.get(pos.symbol);
			if (kids?.sl) broker.cancelOrder(kids.sl);
			const order = broker.placeOrder(
				{
					symbol: pos.symbol,
					side: pos.side === "long" ? "sell" : "buy",
					type: "stop",
					quantity: pos.quantity,
					stopPrice: price,
					isClosingPosition: true,
				},
				{ skipValidation: true },
			);
			if (order.status === "rejected") return false;
			trackChildOrder(pos.symbol, "sl", order.id);
			setOrderCount(broker.getOrders().filter((o) => o.status === "working" || o.status === "filled").length);
			return true;
		},
		[trackChildOrder],
	);

	const setTakeProfit = useCallback(
		(positionId: string, price: number): boolean => {
			const broker = brokerRef.current;
			if (!broker) return false;
			const pos = broker.getPositionById(positionId);
			if (!pos) return false;
			const kids = childRef.current.get(pos.symbol);
			if (kids?.tp) broker.cancelOrder(kids.tp);
			const order = broker.placeOrder(
				{
					symbol: pos.symbol,
					side: pos.side === "long" ? "sell" : "buy",
					type: "limit",
					quantity: pos.quantity,
					price,
					isClosingPosition: true,
				},
				{ skipValidation: true },
			);
			if (order.status === "rejected") return false;
			trackChildOrder(pos.symbol, "tp", order.id);
			setOrderCount(broker.getOrders().filter((o) => o.status === "working" || o.status === "filled").length);
			return true;
		},
		[trackChildOrder],
	);

	const closeAllPositions = useCallback(() => {
		const broker = brokerRef.current;
		if (!broker) return;
		preBatchRef.current = broker.getPositions().map((p) => ({ id: p.id, symbol: p.symbol, side: p.side, quantity: p.quantity }));
		broker.closeAllPositions("manual");
		const { newTrades } = syncState(prevBarRef.current);
		for (const trade of newTrades) onTradeRef.current?.(trade);
	}, [syncState]);

	const cancelOrder = useCallback((orderId: string): boolean => {
		const broker = brokerRef.current;
		if (!broker) return false;
		const ok = broker.cancelOrder(orderId);
		if (ok) setOrderCount(broker.getOrders().filter((o) => o.status === "working" || o.status === "filled").length);
		return ok;
	}, []);

	const reversePosition = useCallback((positionId: string): void => {
		const broker = brokerRef.current;
		if (!broker) return;
		const pos = broker.getPositionById(positionId);
		if (!pos) return;
		const { symbol, side, quantity } = pos;
		try {
			preBatchRef.current = [{ id: pos.id, symbol, side, quantity }];
			broker.closePosition(positionId);
			const reversed = broker.placeOrder(
				{ symbol, side: side === "long" ? "sell" : "buy", type: "market", quantity },
				{ skipValidation: true },
			);
			if (reversed.status === "rejected") {
				pushLog(`Reverse rejected: ${reversed.rejectCode ?? "unknown"}`);
			}
		} catch (error) {
			pushLog(`Reverse failed: ${error instanceof Error ? error.message : "unknown"}`);
		}
		syncState(prevBarRef.current);
	}, [syncState]);

	const reset = useCallback(() => {
		brokerRef.current?.resetAccount();
		analyticsRef.current?.reset();
		ledgerRef.current.clear();
		childRef.current.clear();
		historyLenRef.current = 0;
		preBatchRef.current = null;
		markRef.current.clear();
		prevBarBySymbolRef.current.clear();
		activeSymbolRef.current = undefined;
		setPositions([]);
		setClosedTrades([]);
		closedTradesRef.current = [];
		setTotalPnl(0);
		setOrderCount(0);
		setAnalytics(new ReplaySessionAnalytics().getStats());
		setLog([]);
		prevBarRef.current = -1;
	}, []);

	const claimSessionOwner = useCallback((chartId: string) => {
		enabledRef.current = true;
		setEnabled(true);
		setSessionOwnerId(chartId);
	}, []);

	const clearSessionOwner = useCallback(() => {
		enabledRef.current = false;
		setEnabled(false);
		setSessionOwnerId(null);
	}, []);

	const resetForNewMaster = useCallback(
		(_masterId: string | null) => {
			reset();
			activeSymbolRef.current = undefined;
		},
		[reset],
	);

	useEffect(() => {
		if (!enabled) reset();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [enabled]);

	const getBroker = useCallback(() => brokerRef.current, []);

	return {
		positions,
		closedTrades,
		totalPnl,
		orderCount,
		analytics,
		placeOrder,
		closePosition,
		setStopLoss,
		setTakeProfit,
		closeAllPositions,
		reset,
		resetForNewMaster,
		feedBar,
		sessionOwnerId,
		claimSessionOwner,
		clearSessionOwner,
		isReplayActive: enabled,
		broker,
		port: portRef.current,
		log,
		cancelOrder,
		reversePosition,
	};
}
