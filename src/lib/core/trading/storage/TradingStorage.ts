// Task 06: TradingStorage — persist JSON có version qua AsyncStorageAdapter.
// Tuyệt đối không chạm window.indexedDB/localStorage trực tiếp (.eslintrc:136-137).
import type { AsyncStorageAdapter } from "@vninvestcharts/engine-react";
import type { ClosedTradeRecord, EquityPoint } from "../AnalyticsEngine";
import type { BrokerAccount, ExecutionTicket, TradingOrder, TradingPosition } from "../types";

export const TRADING_STORAGE_VERSION = 2;

export interface SerializedTradingState {
	version: number;
	savedAt: number;
	account: BrokerAccount;
	orders: TradingOrder[];
	positions: TradingPosition[];
	trailingPeaks: Record<string, number>;
	history: ExecutionTicket[];
	closedTrades: ClosedTradeRecord[];
	equityCurve: EquityPoint[];
}

/**
 * S6: version-2 state. `config` carries the user runtime config snapshot
 * (fee/tax/slippage/leverage/method/display, see PaperRuntimeConfig —
 * Record-typed here to keep lib/ independent of widget/ imports).
 * `isChartOverride` marks per-chart override ledgers (Tier 3).
 */
export interface TradingStateV2 extends SerializedTradingState {
	version: 2;
	config?: Record<string, unknown>;
	isChartOverride?: boolean;
}

export class TradingStorage {
	constructor(
		private readonly adapter: AsyncStorageAdapter,
		private readonly storageKey: string = "vnsc_paper_trading_v1",
	) {}

	async saveState(state: SerializedTradingState): Promise<void> {
		await this.adapter.setItem(this.storageKey, JSON.stringify({ ...state, version: TRADING_STORAGE_VERSION }));
	}

	async loadState(): Promise<TradingStateV2 | null> {
		try {
			const raw = await this.adapter.getItem(this.storageKey);
			if (raw == null) return null;
			const parsed = JSON.parse(raw) as Partial<TradingStateV2>;
			if (parsed == null) return null;
			const version = parsed.version as number | undefined;
			// S6 migration: version-1 ledgers load intact, config stays empty
			// (defaults apply) and the next save upgrades the envelope to v2.
			if (version === 1) {
				return { ...(parsed as SerializedTradingState), version: 2 };
			}
			if (version !== TRADING_STORAGE_VERSION) return null;
			return parsed as TradingStateV2;
		} catch {
			return null;
		}
	}

	async clearState(): Promise<void> {
		await this.adapter.removeItem(this.storageKey);
	}
}
