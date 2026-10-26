// Task M3: workspace live broker dùng chung cho multi-chart (singleton).
// Mirror useWorkspaceReplayTrading nhưng cho LIVE: không reset theo symbol,
// namespace riêng cấp workspace, broadcast state best-effort (không apply từ xa).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { VirtualBrokerEngine } from "../../lib/core/trading/VirtualBrokerEngine";
import { MarketDataPort } from "../../lib/core/trading/MarketDataPort";
import { VN_SPOT_RULES, resolveMarketProfile, type MarketRules } from "../../lib/core/trading/MarketRules";
import type { AsyncStorageAdapter, BroadcastChannelAdapter } from "@vninvestcharts/engine-react";
import { WorkspaceTradingSync } from "../trading/context/WorkspaceTradingSync";

export interface UseWorkspaceLiveTradingOptions {
	storageAdapter?: AsyncStorageAdapter;
	workspaceId?: string;
	rules?: MarketRules;
	syncAdapter?: BroadcastChannelAdapter | null;
}

export interface WorkspaceLivePair {
	broker: VirtualBrokerEngine;
	port: MarketDataPort;
}

const LOG_CAP = 200;

export interface WorkspaceLiveLogEntry {
	timestamp: number;
	message: string;
}

export function useWorkspaceLiveTrading(options: UseWorkspaceLiveTradingOptions = {}): {
	broker: VirtualBrokerEngine;
	port: MarketDataPort;
	log: WorkspaceLiveLogEntry[];
	closePosition: (positionId: string) => boolean;
	reversePosition: (positionId: string) => void;
	cancelOrder: (orderId: string) => boolean;
	reset: () => void;
	brokerFor: (symbol: string) => WorkspaceLivePair | undefined;
} {
	const { storageAdapter, workspaceId, rules = VN_SPOT_RULES, syncAdapter } = options;
	const pairRef = useRef<WorkspaceLivePair | null>(null);
	if (!pairRef.current) {
		const port = new MarketDataPort({
			tickSizeProvider: (sym, price) => resolveMarketProfile(sym).getTickSize(price),
		});
		const broker = new VirtualBrokerEngine({
			rules,
			marketDataPort: port,
			storageAdapter,
			storageNamespace: `vnsc_paper_ws_${workspaceId ?? "default"}_${rules.profile}`,
			// P1.1: workspace LIVE broker khớp market ngay (replay broker giữ nến-kế).
			fillMarketOnPlace: true,
		});
		pairRef.current = { broker, port };
	}
	const syncRef = useRef<WorkspaceTradingSync | null>(null);
	if (!syncRef.current) {
		syncRef.current = new WorkspaceTradingSync(workspaceId ?? "default", "workspace-live", syncAdapter);
	}
	const [, setTick] = useState(0);
	const [log, setLog] = useState<WorkspaceLiveLogEntry[]>([]);

	const pushLog = useCallback((message: string) => {
		setLog((prev) => [...prev.slice(-(LOG_CAP - 1)), { timestamp: Date.now(), message }]);
	}, []);

	const broadcast = useCallback(() => {
		const pair = pairRef.current;
		const sync = syncRef.current;
		if (!pair || !sync) return;
		try {
			sync.broadcastState({
				account: pair.broker.getAccount(),
				positions: pair.broker.getPositions(),
				orders: pair.broker.getOrders(),
			});
		} catch {
			// Best-effort: sync không bao giờ chặn luồng chính.
		}
	}, []);

	useEffect(() => {
		const pair = pairRef.current;
		if (!pair) return;
		const offs = [
			pair.broker.on("fill", (t) => {
				pushLog(`Fill ${t.side} ${t.fillQuantity} ${t.symbol} @ ${t.fillPrice}`);
				broadcast();
				setTick((v) => v + 1);
			}),
			pair.broker.on("orderChange", () => {
				broadcast();
				setTick((v) => v + 1);
			}),
			pair.broker.on("positionChange", () => {
				broadcast();
				setTick((v) => v + 1);
			}),
			pair.broker.on("accountChange", () => {
				broadcast();
				setTick((v) => v + 1);
			}),
		];
		return () => {
			offs.forEach((off) => off());
		};
	}, [pushLog, broadcast]);

	useEffect(() => {
		void pairRef.current?.broker.hydrate().then(() => setTick((v) => v + 1));
	}, []);

	const closePosition = useCallback((positionId: string): boolean => {
		const pair = pairRef.current;
		if (!pair) return false;
		try {
			const ok = pair.broker.closePosition(positionId);
			setTick((v) => v + 1);
			return ok;
		} catch (error) {
			pushLog(`Close failed: ${error instanceof Error ? error.message : "unknown"}`);
			setTick((v) => v + 1);
			return false;
		}
	}, [pushLog]);

	const reversePosition = useCallback(
		(positionId: string): void => {
			const pair = pairRef.current;
			if (!pair) return;
			const position = pair.broker.getPositions().find((p) => p.id === positionId);
			if (!position) return;
			const { symbol, side, quantity } = position;
			try {
				pair.broker.closePosition(positionId);
				const reversed = pair.broker.placeOrder({
					symbol,
					side: side === "long" ? "sell" : "buy",
					type: "market",
					quantity,
				});
				if (reversed.status === "rejected") {
					pushLog(`Reverse rejected: ${reversed.rejectCode ?? "unknown"}`);
				}
			} catch (error) {
				pushLog(`Reverse failed: ${error instanceof Error ? error.message : "unknown"}`);
			}
			setTick((v) => v + 1);
		},
		[pushLog],
	);

	const cancelOrder = useCallback((orderId: string): boolean => {
		const pair = pairRef.current;
		if (!pair) return false;
		const ok = pair.broker.cancelOrder(orderId);
		if (ok) setTick((v) => v + 1);
		return ok;
	}, []);

	const reset = useCallback(() => {
		pairRef.current?.broker.resetAccount();
		setLog([]);
		setTick((v) => v + 1);
	}, []);

	const brokerFor = useCallback((symbol: string): WorkspaceLivePair | undefined => {
		// Chỉ share book VN-spot; crypto/derivatives giữ broker cục bộ per-chart
		// để đúng lot/tick (tránh regression M3). Mở rộng multi-profile ở TVP-C.
		if (resolveMarketProfile(symbol).profile !== "VN_SPOT") return undefined;
		return pairRef.current ?? undefined;
	}, []);

	return useMemo(
		() => ({
			broker: pairRef.current!.broker,
			port: pairRef.current!.port,
			log,
			closePosition,
			reversePosition,
			cancelOrder,
			reset,
			brokerFor,
		}),
		[log, closePosition, reversePosition, cancelOrder, reset, brokerFor],
	);
}
