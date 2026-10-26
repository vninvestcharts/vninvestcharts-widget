// Task 01: IBrokerAPI contract + type-safe in-process event bus.
// VirtualBrokerEngine (Task 06) hiện thực interface này; UI/consumers chỉ code
// qua contract, không chạm OMS/PMS trực tiếp.
import type {
	BrokerAccount,
	ExecutionTicket,
	OrderValidationInput,
	TradingOrder,
	TradingPosition,
} from "./types";

export interface TradingEventMap {
	positionChange: TradingPosition[];
	orderChange: TradingOrder[];
	accountChange: BrokerAccount;
	fill: ExecutionTicket;
	/**
	 * F-TRADE-01 (điểm B): lưu trạng thái thất bại. Trước đây `persist()` kết thúc bằng
	 * `.catch(() => undefined)` nên lỗi lưu **biến mất im lặng** — người dùng thấy giao
	 * dịch trên màn hình, đóng tab, mở lại thì mất, không có thông báo nào.
	 *
	 * Key mới là **additive**: consumer cũ không nghe event này thì không đổi hành vi.
	 */
	persistError: Error;
	/**
	 * F-TRADE-01 (điểm A): một bar không dùng được đã bị chặn. Phát **khi** xảy ra (thay vì
	 * để UI tự poll) — poll theo chu kỳ sẽ kéo hẹn giờ của trình duyệt vào tầng widget và
	 * làm đỏ cổng `audit:dom-access`.
	 */
	barRejected: { symbol: string; reason: string; count: number };
}

export type TradingEventKey = keyof TradingEventMap;
export type TradingEventCallback<K extends TradingEventKey> = (payload: TradingEventMap[K]) => void;

export class TradingEventBus {
	private readonly listeners = new Map<TradingEventKey, Set<(payload: never) => void>>();
	/** Hook báo lỗi listener. Mặc định `undefined` ⇒ im lặng, giữ nguyên hành vi cũ. */
	private listenerError?: (event: TradingEventKey, error: unknown) => void;

	/**
	 * F-TRADE-01 (điểm C): trước đây `emit` là `forEach((fn) => fn(...))` — **không**
	 * try/catch. Một listener ném lỗi làm các listener còn lại của cùng event **không
	 * chạy**, và lỗi nổi lên `VirtualBrokerEngine.emitAll()` (:426) rồi lên `onBar`.
	 * `emitAll` phát 4 event theo thứ tự, nên người dùng có thể thấy "lệnh đã đặt" mà
	 * vị thế không bao giờ được cập nhật.
	 *
	 * Sửa: bọc từng listener, giữ nguyên thứ tự, gom lỗi qua `onListenerError` nếu có.
	 */
	onListenerError(hook?: (event: TradingEventKey, error: unknown) => void): void {
		this.listenerError = hook;
	}

	on<K extends TradingEventKey>(event: K, callback: TradingEventCallback<K>): () => void {
		let set = this.listeners.get(event);
		if (!set) {
			set = new Set();
			this.listeners.set(event, set);
		}
		const fn = callback as (payload: never) => void;
		set.add(fn);
		return () => {
			set?.delete(fn);
		};
	}

	emit<K extends TradingEventKey>(event: K, payload: TradingEventMap[K]): void {
		const set = this.listeners.get(event);
		if (!set) return;
		for (const fn of [...set]) {
			try {
				fn(payload as never);
			} catch (error) {
				this.listenerError?.(event, error);
			}
		}
	}
}

export interface ClosePositionOptions {
	quantity?: number;
	reason?: string;
}

export interface PlaceOrderOptions {
	/** Bỏ qua rules/availability/risk — chỉ dùng cho replay-compat (legacy accept-everything). */
	skipValidation?: boolean;
}

export interface IBrokerAPI {
	getAccount(): BrokerAccount;
	getPositions(): TradingPosition[];
	getOrders(): TradingOrder[];
	placeOrder(request: OrderValidationInput & { clientOrderId?: string }, options?: PlaceOrderOptions): TradingOrder;
	cancelOrder(orderId: string): boolean;
	modifyOrder(orderId: string, patch: { price?: number; stopPrice?: number; quantity?: number }): TradingOrder;
	closePosition(positionId: string, options?: ClosePositionOptions): boolean;
	closeAllPositions(reason?: string, symbol?: string): number;
	resetAccount(initialBalance: number): void;
	on<K extends TradingEventKey>(event: K, callback: TradingEventCallback<K>): () => void;
}
