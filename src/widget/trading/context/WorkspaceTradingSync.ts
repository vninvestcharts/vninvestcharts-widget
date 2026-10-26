// Task 10: WorkspaceTradingSync — broadcast trading state cross-tab/chart.
// Dùng createBroadcastChannelAdapter (fallback BC -> localStorage -> noop),
// KHÔNG new BroadcastChannel thô (R5/R10). Kênh 'workspace' + domain tag.
import { createBroadcastChannelAdapter, type BroadcastChannelAdapter } from "@vninvestcharts/engine-react";
import type { BrokerAccount, TradingOrder, TradingPosition } from "../../../lib/core/trading/types";

export const TRADING_SYNC_DOMAIN = "paper-trading";
export const TRADING_SYNC_WORKSPACE = "vnsc_trading_sync";

export interface TradingSyncSnapshot {
	account: BrokerAccount;
	positions: TradingPosition[];
	orders: TradingOrder[];
	updatedAt: number;
}

export interface TradingSyncHandler {
	(snapshot: TradingSyncSnapshot, fromId: string): void;
}

function randomId(prefix: string): string {
	return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export class WorkspaceTradingSync {
	private readonly adapter: BroadcastChannelAdapter | null;
	private readonly chartId: string;
	private readonly workspaceId: string;
	private disposeFn: (() => void) | null = null;

	constructor(workspaceId: string = TRADING_SYNC_WORKSPACE, chartId?: string, adapter?: BroadcastChannelAdapter | null) {
		this.workspaceId = workspaceId;
		this.chartId = chartId ?? randomId("chart");
		if (adapter !== undefined) {
			this.adapter = adapter;
		} else {
			try {
				this.adapter = typeof BroadcastChannel !== "undefined" ? createBroadcastChannelAdapter(workspaceId) : null;
			} catch {
				this.adapter = null;
			}
		}
	}

	get id(): string {
		return this.chartId;
	}

	broadcastState(snapshot: Omit<TradingSyncSnapshot, "updatedAt">): void {
		if (!this.adapter) return;
		try {
			this.adapter.postMessage({
				type: "workspace",
				payload: {
					domain: TRADING_SYNC_DOMAIN,
					fromId: this.chartId,
					snapshot: { ...snapshot, updatedAt: Date.now() },
				},
				workspaceId: this.workspaceId,
				sourceTabId: this.chartId,
				timestamp: Date.now(),
			});
		} catch {
			// Sync best-effort: không bao giờ làm vỡ luồng giao dịch chính.
		}
	}

	subscribe(handler: TradingSyncHandler): () => void {
		if (!this.adapter) return () => undefined;
		return this.adapter.onMessage((message) => {
			if (message.type !== "workspace") return;
			const payload = message.payload as { domain?: string; fromId?: string; snapshot?: TradingSyncSnapshot } | null;
			if (!payload || payload.domain !== TRADING_SYNC_DOMAIN || payload.fromId === this.chartId) return;
			if (!payload.snapshot) return;
			handler(payload.snapshot, payload.fromId as string);
		});
	}

	dispose(): void {
		if (this.disposeFn) {
			this.disposeFn();
			this.disposeFn = null;
		}
		try {
			this.adapter?.close();
		} catch {
			// Bỏ qua lỗi đóng channel.
		}
	}
}
