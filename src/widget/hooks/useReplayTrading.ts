import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { MarketDataPort } from "../../lib/core/trading/MarketDataPort";
import { VirtualBrokerEngine } from "../../lib/core/trading/VirtualBrokerEngine";
import { ReplaySessionAnalytics } from "../../lib/core/replay/ReplaySessionAnalytics";
import type {
	ReplayAnalyticsStats,
} from "../../lib/core/replay/ReplaySessionAnalytics";
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

export interface UseReplayTradingOptions {
  currentBar: number;
  currentBarTimestamp?: number;
  bars: readonly ReplayOHLCBar[];
  enabled: boolean;
  /** A6: symbol owned by this replay book; defaults to symbols seen in orders. */
  symbol?: string;
  /** A6: owner epoch — changing it resets the book before the next bar is fed. */
  sessionEpoch?: number;
  slippageBps?: number;
  fillOnNextBar?: boolean;
  realisticSlTpFill?: boolean;
  onTradeExecuted?: (trade: ReplayExecutedTrade) => void;
}

export interface UseReplayTradingResult {
  /** A6: the single replay book + quote source owned by this session. */
  broker: VirtualBrokerEngine;
  port: MarketDataPort;
  positions: ReplayPosition[];
  closedTrades: ReplayExecutedTrade[];
  totalPnl: number;
  orderCount: number;
  analytics: ReplayAnalyticsStats;
  placeOrder: (order: Omit<ReplayOrder, "id" | "timestamp">) => void;
  closePosition: (positionId: string) => void;
  setStopLoss: (positionId: string, price: number) => boolean;
  setTakeProfit: (positionId: string, price: number) => boolean;
  closeAllPositions: () => void;
  reset: () => void;
}

export function useReplayTrading(options: UseReplayTradingOptions): UseReplayTradingResult {
	const { currentBar, currentBarTimestamp, bars, enabled, symbol, sessionEpoch = 0, onTradeExecuted } = options;

	const brokerRef = useRef<VirtualBrokerEngine | null>(null);
	const portRef = useRef<MarketDataPort | null>(null);
	const analyticsRef = useRef<ReplaySessionAnalytics | null>(null);
	const prevBarRef = useRef(currentBar);
	const currentBarRef = useRef(currentBar);
	currentBarRef.current = currentBar;
	const onTradeRef = useRef(onTradeExecuted);
	onTradeRef.current = onTradeExecuted;
	const markRef = useRef(new Map<string, number>());
	const ledgerRef = useRef(new Map<string, ReplayEntryInfo>());
	const childRef = useRef(new Map<string, { sl?: string; tp?: string }>());
	const historyLenRef = useRef(0);
	const symbolsRef = useRef(new Set<string>());
	const closedTradesRef = useRef<ReplayExecutedTrade[]>([]);
	const preBatchRef = useRef<Array<{ id: string; symbol: string; side: "long" | "short"; quantity: number }> | null>(null);

	const [positions, setPositions] = useState<ReplayPosition[]>([]);
	const [closedTrades, setClosedTrades] = useState<ReplayExecutedTrade[]>([]);
	const [totalPnl, setTotalPnl] = useState(0);
	const [orderCount, setOrderCount] = useState(0);
	const [analytics, setAnalytics] = useState<ReplayAnalyticsStats>(() => new ReplaySessionAnalytics().getStats());

	if (!brokerRef.current) {
		brokerRef.current = new VirtualBrokerEngine({ rules: REPLAY_SPOT_RULES });
	}
	if (!portRef.current) {
		portRef.current = new MarketDataPort();
	}
	if (!analyticsRef.current) {
		analyticsRef.current = new ReplaySessionAnalytics();
	}

	const resetRef = useRef<() => void>(() => undefined);
	const wasEnabledRef = useRef(enabled);
	const epochRef = useRef(sessionEpoch);

	useLayoutEffect(() => {
		const wasEnabled = wasEnabledRef.current;
		wasEnabledRef.current = enabled;
		if (!enabled) {
			resetRef.current();
			return;
		}
		if (!wasEnabled) {
			prevBarRef.current = currentBarRef.current - 1;
		}
	}, [enabled]);

	useLayoutEffect(() => {
		if (epochRef.current === sessionEpoch) return;
		epochRef.current = sessionEpoch;
		if (enabled) resetRef.current();
	}, [sessionEpoch, enabled]);

	const syncState = useCallback(
		(currentBarIndex: number): ReplayExecutedTrade[] => {
			const broker = brokerRef.current;
			const analytics = analyticsRef.current;
			if (!broker || !analytics) return [];
			for (const p of broker.getPositions()) {
				if (!ledgerRef.current.has(p.id)) {
					ledgerRef.current.set(p.id, { entryPrice: p.entryPrice, entryTimestamp: p.createdAt, entryBarIndex: currentBarIndex });
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
			const fresh = broker.getHistory().slice(historyLenRef.current);
			historyLenRef.current = broker.getHistory().length;
			const preBatch = preBatchRef.current;
			preBatchRef.current = null;
			const newTrades: ReplayExecutedTrade[] = [];
			for (const ticket of fresh) {
				const match = matchCloseLeg(ticket, preBatch, ledgerRef.current, currentBarIndex);
				if (!match) continue;
				const dir = match.entry.positionSide === "long" ? 1 : -1;
				const gross = (ticket.fillPrice - match.entry.entryPrice) * dir * match.closeQuantity;
				newTrades.push(
					mapTicketToReplayTrade({ ...ticket, fillQuantity: match.closeQuantity, pnl: gross }, match.entry, currentBarIndex),
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
					entryBarIndex: ledgerRef.current.get(p.id)?.entryBarIndex ?? currentBarIndex,
				});
			});
			const allClosed = [...closedTradesRef.current, ...newTrades];
			closedTradesRef.current = allClosed;
			setClosedTrades(allClosed);
			setPositions(mapped);
			const total = mapped.reduce((sum, p) => sum + p.unrealizedPnl, 0) + allClosed.reduce((sum, t) => sum + t.pnl, 0);
			setTotalPnl(total);
			setOrderCount(broker.getOrders().filter((o) => o.status === "working" || o.status === "filled").length);
			setAnalytics(analytics.getStats(allClosed));
			return newTrades;
		},
		[],
	);

	useEffect(() => {
		if (!enabled || !brokerRef.current) return;
		const broker = brokerRef.current;
		const analytics = analyticsRef.current;
		if (currentBar < 0 || bars.length === 0) return;

		const lastProcessed = prevBarRef.current;
		if (currentBar === lastProcessed) return;

		const forward = currentBar > lastProcessed;
		const order: number[] = [];
		if (forward) {
			for (let i = lastProcessed + 1; i <= currentBar; i++) order.push(i);
		} else {
			for (let i = currentBar; i < lastProcessed; i++) order.push(i);
		}

		const baseTime = currentBarTimestamp ?? Date.now();
		let barDuration = 0;
		if (bars.length > 1 && typeof bars[1].date === "number" && typeof bars[0].date === "number") {
			barDuration = (bars[1].date as number) - (bars[0].date as number);
		}

		preBatchRef.current = broker.getPositions().map((p) => ({ id: p.id, symbol: p.symbol, side: p.side, quantity: p.quantity }));
		const feedSymbols = symbol ? [symbol] : symbolsRef.current.size > 0 ? [...symbolsRef.current] : [];
		for (const idx of order) {
			const bar = bars[idx];
			if (!bar) continue;
			const barTime = typeof bar.date === "number" ? bar.date : baseTime + (idx - currentBar) * barDuration;
			for (const feedSymbol of feedSymbols) {
				markRef.current.set(feedSymbol, bar.close);
				portRef.current?.feedBar(feedSymbol, bar);
				broker.onBar(feedSymbol, bar, barTime);
			}
		}
		prevBarRef.current = currentBar;

		syncState(currentBar);
		analytics!.recordEquity(currentBar, broker.getPositions().reduce((s, p) => s + p.unrealizedPnl, 0));
		setAnalytics(analytics!.getStats(closedTradesRef.current));
	}, [currentBar, bars, enabled, currentBarTimestamp, syncState]);

	const placeOrder = useCallback(
		(partial: Omit<ReplayOrder, "id" | "timestamp">) => {
			const broker = brokerRef.current;
			if (!broker) return;
			const input = mapReplayOrderToBrokerInput(partial);
			if (!input.symbol) input.symbol = "";
			if (partial.reduceOnly) {
				const opp = broker
					.getPositions()
					.find((p) => p.symbol === input.symbol && ((p.side === "long") === (input.side === "sell")));
				if (!opp) return;
				input.quantity = Math.min(input.quantity, opp.quantity);
			}
			symbolsRef.current.add(input.symbol);
			broker.placeOrder(input, { skipValidation: true });
			setOrderCount(broker.getOrders().filter((o) => o.status === "working" || o.status === "filled").length);
		},
		[],
	);

	const trackChild = useCallback((symbol: string, kind: "sl" | "tp", orderId: string) => {
		const kids = childRef.current.get(symbol) ?? {};
		kids[kind] = orderId;
		childRef.current.set(symbol, kids);
	}, []);

	const closePosition = useCallback(
		(positionId: string) => {
			const broker = brokerRef.current;
			if (!broker) return;
			const pos = broker.getPositionById(positionId);
			if (!pos) return;
			preBatchRef.current = [{ id: pos.id, symbol: pos.symbol, side: pos.side, quantity: pos.quantity }];
			try {
				broker.closePosition(positionId);
			} catch {
				return;
			}
			const newTrades = syncState(currentBarRef.current);
			for (const trade of newTrades) onTradeRef.current?.(trade);
		},
		[syncState],
	);

	const setStopLoss = useCallback(
		(positionId: string, price: number): boolean => {
			const broker = brokerRef.current;
			if (!broker) return false;
			const pos = broker.getPositionById(positionId);
			if (!pos) return false;
			const kids = childRef.current.get(pos.symbol);
			if (kids?.sl) broker.cancelOrder(kids.sl);
			const order = broker.placeOrder(
				{ symbol: pos.symbol, side: pos.side === "long" ? "sell" : "buy", type: "stop", quantity: pos.quantity, stopPrice: price, isClosingPosition: true },
				{ skipValidation: true },
			);
			if (order.status === "rejected") return false;
			trackChild(pos.symbol, "sl", order.id);
			setOrderCount(broker.getOrders().filter((o) => o.status === "working" || o.status === "filled").length);
			return true;
		},
		[trackChild],
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
				{ symbol: pos.symbol, side: pos.side === "long" ? "sell" : "buy", type: "limit", quantity: pos.quantity, price, isClosingPosition: true },
				{ skipValidation: true },
			);
			if (order.status === "rejected") return false;
			trackChild(pos.symbol, "tp", order.id);
			setOrderCount(broker.getOrders().filter((o) => o.status === "working" || o.status === "filled").length);
			return true;
		},
		[trackChild],
	);

	const closeAllPositions = useCallback(() => {
		const broker = brokerRef.current;
		if (!broker) return;
		preBatchRef.current = broker.getPositions().map((p) => ({ id: p.id, symbol: p.symbol, side: p.side, quantity: p.quantity }));
		broker.closeAllPositions("manual");
		const newTrades = syncState(currentBarRef.current);
		for (const trade of newTrades) {
			onTradeRef.current?.(trade);
		}
	}, [syncState]);

	const reset = useCallback(() => {
		brokerRef.current?.resetAccount();
		analyticsRef.current?.reset();
		ledgerRef.current.clear();
		childRef.current.clear();
		historyLenRef.current = 0;
		preBatchRef.current = null;
		markRef.current.clear();
		symbolsRef.current.clear();
		setPositions([]);
		setClosedTrades([]);
		closedTradesRef.current = [];
		setTotalPnl(0);
		setOrderCount(0);
		setAnalytics(new ReplaySessionAnalytics().getStats());
		prevBarRef.current = Math.max(-1, currentBarRef.current - 1);
	}, []);
	resetRef.current = reset;

	return {
		broker: brokerRef.current,
		port: portRef.current,
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
	};
}