/**
 * Task M3: WorkspaceLiveTradingContext — shared LIVE broker cho multi-chart.
 *
 * Mirror WorkspaceReplayTradingContext nhưng cho LIVE (không reset theo symbol,
 * namespace riêng cấp workspace). Single-chart không bị ảnh hưởng (dùng optional hook).
 */
import { createContext, useContext, type ReactNode } from "react";
import type { VirtualBrokerEngine } from "../../lib/core/trading/VirtualBrokerEngine";
import type { MarketDataPort } from "../../lib/core/trading/MarketDataPort";
import type { WorkspaceLiveLogEntry } from "../hooks/useWorkspaceLiveTrading";

export interface WorkspaceLiveTradingValue {
	broker: VirtualBrokerEngine;
	port: MarketDataPort;
	log: WorkspaceLiveLogEntry[];
	closePosition: (positionId: string) => boolean;
	reversePosition: (positionId: string) => void;
	cancelOrder: (orderId: string) => boolean;
	reset: () => void;
	brokerFor: (symbol: string) => { broker: VirtualBrokerEngine; port: MarketDataPort } | undefined;
}

const defaultValue: WorkspaceLiveTradingValue = undefined as unknown as WorkspaceLiveTradingValue;

export const WorkspaceLiveTradingContext = createContext<WorkspaceLiveTradingValue>(defaultValue);

export function WorkspaceLiveTradingProvider({
	value,
	children,
}: {
	value: WorkspaceLiveTradingValue;
	children: ReactNode;
}) {
	return <WorkspaceLiveTradingContext.Provider value={value}>{children}</WorkspaceLiveTradingContext.Provider>;
}

export function useWorkspaceLiveTradingContext(): WorkspaceLiveTradingValue {
	const ctx = useContext(WorkspaceLiveTradingContext);
	if (ctx === defaultValue) {
		throw new Error("useWorkspaceLiveTradingContext must be used within WorkspaceLiveTradingProvider");
	}
	return ctx;
}

export function useOptionalWorkspaceLiveTrading(): WorkspaceLiveTradingValue | undefined {
	const ctx = useContext(WorkspaceLiveTradingContext);
	return ctx === defaultValue ? undefined : ctx;
}
