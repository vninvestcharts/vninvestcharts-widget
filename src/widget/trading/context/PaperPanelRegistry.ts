/**
 * PaperPanelRegistry (P1-S1) — cầu nối panel đáy multi tới broker của ô active.
 * Mỗi TradingProvider có chartId tự đăng ký binding; panel đọc theo activeChartId.
 * Có subscribe cấp registry (D8) chống kẹt rỗng khi lệch mount.
 */
import { useSyncExternalStore } from "react";
import type {
	BrokerAccount,
	OrderValidationInput,
	TradingOrder,
	TradingPosition,
} from "../../../lib/core/trading/types";
import type { TradingAnalytics } from "../../../lib/core/trading/AnalyticsEngine";
import type {
	BrokerRuntimePatch,
	BrokerRuntimeSummary,
} from "../../../lib/core/trading/VirtualBrokerEngine";

export interface PaperPanelSnapshot {
	account: BrokerAccount;
	positions: TradingPosition[];
	orders: TradingOrder[];
	orderHistory: TradingOrder[];
	ordersMargin: number;
	analytics: TradingAnalytics;
	log: { timestamp: number; message: string }[];
	/** Thống nhất single/multi: ô active bị ẩn trading bar → panel hiện CTA bật lại. */
	tradingEnabled: boolean;
	onEnableTrading: () => void;
}

export interface PaperPanelBinding {
	chartId: string;
	symbol: string;
	shared: boolean;
	getSnapshot(): PaperPanelSnapshot;
	closePosition(positionId: string): boolean;
	/** P1.3: đóng tất cả vị thế của ô. */
	closeAllPositions(reason?: string): number;
	reversePosition(positionId: string): void;
	cancelOrder(orderId: string): boolean;
	/** P1.3: lấy snapshot orders để bulk-cancel (working filter ở caller). */
	getOrders(): TradingOrder[];
	resetAccount(initialBalance?: number): void;
	/** S2 (P5 parity F1-A): đặt lệnh qua broker của cell (cho dock form workspace). */
	placeOrder(input: OrderValidationInput): TradingOrder;
	subscribe(listener: () => void): () => void;
	/** S6: apply runtime pricing/rules without recreating the broker. */
	applyRuntimeConfig?: (patch: BrokerRuntimePatch) => BrokerRuntimeSummary;
}

const bindings = new Map<string, PaperPanelBinding>();
const registryListeners = new Map<string, Set<() => void>>();
const registryVersion = new Map<string, number>();

function notifyRegistry(chartId: string): void {
	registryVersion.set(chartId, (registryVersion.get(chartId) ?? 0) + 1);
	registryListeners.get(chartId)?.forEach((fn) => {
		try {
			fn();
		} catch {
			// Listener lỗi không chặn các listener khác.
		}
	});
}

export function registerPaperPanelBinding(binding: PaperPanelBinding): void {
	bindings.set(binding.chartId, binding);
	notifyRegistry(binding.chartId);
}

export function unregisterPaperPanelBinding(chartId: string): void {
	if (bindings.delete(chartId)) notifyRegistry(chartId);
}

export function getPaperPanelBinding(chartId: string | null): PaperPanelBinding | undefined {
	if (!chartId) return undefined;
	return bindings.get(chartId);
}

export function subscribePaperPanelRegistry(chartId: string | null, listener: () => void): () => void {
	if (!chartId) return () => {};
	let set = registryListeners.get(chartId);
	if (!set) {
		set = new Set();
		registryListeners.set(chartId, set);
	}
	set.add(listener);
	return () => {
		set.delete(listener);
	};
}

/** Re-render khi binding đến/mất (late registration) — D8, không bao giờ kẹt rỗng. */
export function usePaperPanelBinding(chartId: string | null): PaperPanelBinding | undefined {
	useSyncExternalStore(
		(fn) => subscribePaperPanelRegistry(chartId, fn),
		() => registryVersion.get(chartId ?? "") ?? 0,
		() => 0,
	);
	return getPaperPanelBinding(chartId);
}

/** Xóa toàn bộ binding giữa các test (chống rò Map — Finding-06). */
export function clearAllPaperPanelBindingsForTesting(): void {
	bindings.clear();
	registryListeners.clear();
	registryVersion.clear();
}
