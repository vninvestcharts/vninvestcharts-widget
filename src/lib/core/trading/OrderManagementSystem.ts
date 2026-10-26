// Task 02: OMS — sổ lệnh, Bracket OCO, Trailing Stop, Phase-A reject guard.
// Ngữ nghĩa fill (kế thừa tinh thần ReplayOrderBook, độc lập implement):
// market khớp open nến kế; limit khớp đúng giá; stop gap-through khớp open.
// Không look-ahead: mọi quyết định chỉ dùng bar đã đóng.
import type {
	OrderRejectCode,
	OrderSide,
	OrderType,
	TimeInForce,
	TradingOrder,
	OrderValidationInput,
} from "./types";
import type { ReplayOHLCBar } from "../replay/replayTradingTypes";

const PHASE_A_ORDER_TYPES: readonly OrderType[] = [
	"market",
	"limit",
	"stop",
	"trailing_stop",
	// P1.2c VN: ATO/ATC/MP/MTL/PLO (matching đơn giản hóa, xem resolveFill).
	"ato",
	"atc",
	"mp",
	"mtl",
	"plo",
];

/**
 * Thứ tự duyệt khớp trong một nến (R6 Conservative-First): market (+VN market-like)
 * trước, stop/trailing_stop trước limit — nến nuốt cả SL lẫn TP thì SL thắng.
 */
function fillPriority(type: OrderType): number {
	if (type === "market" || type === "mp" || type === "mtl" || type === "ato" || type === "atc" || type === "plo") return 0;
	if (type === "stop" || type === "trailing_stop") return 1;
	return 2;
}

/**
 * P1.2c: nhóm market-like VN (đơn giản hóa có chủ ý, engine full-or-nothing
 * không depth/phiên đấu giá nên MP/MTL/ATO ≡ market, ATC ≡ close — đã khóa test).
 */
export function isMarketLikeOrderType(type: OrderType): boolean {
	return type === "market" || type === "mp" || type === "mtl" || type === "ato" || type === "atc";
}

export interface OrderManagementSystemOptions {
	tickSizeProvider?: (symbol: string) => number;
}

export interface OrderFill {
	orderId: string;
	symbol: string;
	side: OrderSide;
	fillPrice: number;
	filledQuantity: number;
	timestamp: number;
}

export type PlaceOrderRequest = OrderValidationInput & { clientOrderId?: string };

export class OrderManagementSystem {
	private readonly tickSizeProvider: (symbol: string) => number;
	private readonly orders = new Map<string, TradingOrder>();
	private readonly trailingPeak = new Map<string, number>();
	private seq = 0;

	constructor(options: OrderManagementSystemOptions = {}) {
		this.tickSizeProvider = options.tickSizeProvider ?? (() => 1);
	}

	listOrders(): TradingOrder[] {
		return [...this.orders.values()];
	}

	getOrder(orderId: string): TradingOrder | undefined {
		return this.orders.get(orderId);
	}

	getTrailingPeaks(): Record<string, number> {
		return Object.fromEntries(this.trailingPeak);
	}

	cancelOrder(orderId: string): boolean {
		const order = this.orders.get(orderId);
		if (!order || (order.status !== "working" && order.status !== "pending")) return false;
		order.status = "cancelled";
		order.updatedAt = Date.now();
		return true;
	}

	/**
	 * Sửa giá lệnh working (drag SL/TP — Task 08). Đổi quantity phải
	 * cancel + đặt lại (giữ nguyên id cho đường vẽ trên chart).
	 */
	modifyOrder(orderId: string, patch: { price?: number; stopPrice?: number }): TradingOrder {
		const order = this.orders.get(orderId);
		if (!order) throw new Error(`Order not found: ${orderId}`);
		if (order.status !== "working") throw new Error(`Only working orders can be modified: ${orderId}`);
		if (patch.price != null) order.price = patch.price;
		if (patch.stopPrice != null) order.stopPrice = patch.stopPrice;
		order.updatedAt = Date.now();
		return order;
	}

	clear(): void {
		this.orders.clear();
		this.trailingPeak.clear();
		this.seq = 0;
	}

	/** Hydrate từ storage (Task 06). trailingPeaks persist kèm để SL đã ratchet không tụt sau refresh. */
	restoreState(orders: TradingOrder[], trailingPeaks?: Record<string, number>): void {
		this.clear();
		for (const order of orders) {
			this.orders.set(order.id, { ...order });
			const n = Number(/^ord_(\d+)$/.exec(order.id)?.[1]);
			if (Number.isInteger(n) && n >= this.seq) this.seq = n + 1;
		}
		if (trailingPeaks) {
			for (const [id, peak] of Object.entries(trailingPeaks)) {
				if (this.orders.has(id)) this.trailingPeak.set(id, peak);
			}
		}
	}

	placeOrder(request: PlaceOrderRequest): TradingOrder {
		const now = Date.now();
		const base = {
			id: `ord_${++this.seq}`,
			clientOrderId: request.clientOrderId ?? `cli_${this.seq}`,
			symbol: request.symbol,
			side: request.side,
			type: request.type,
			quantity: request.quantity,
			createdAt: now,
			updatedAt: now,
		};
		// TVP-A3: rejected lưu sổ để lịch sử lệnh đầy đủ (TV Order history).
		// processBar chỉ duyệt status working nên rejected không bao giờ khớp.
		const reject = (code: OrderRejectCode, timeInForce: TradingOrder["timeInForce"] = "GTC"): TradingOrder => {
			const order: TradingOrder = { ...base, status: "rejected", filledQuantity: 0, timeInForce, rejectCode: code };
			this.orders.set(order.id, order);
			return order;
		};
		if (!PHASE_A_ORDER_TYPES.includes(request.type)) {
			return reject("UNSUPPORTED_ORDER_TYPE");
		}
		// P1.2b: DAY/IOC/FOK có hiệu lực (GTC giữ nguyên). Chuỗi lạ ngoài union
		// types (JS callers) vẫn reject giữ lưới an toàn.
		if (!["GTC", "DAY", "IOC", "FOK"].includes(request.timeInForce ?? "GTC")) {
			return reject("UNSUPPORTED_TIF", (request.timeInForce ?? "GTC") as TimeInForce);
		}
		if (!Number.isFinite(request.quantity) || request.quantity <= 0) {
			return reject("INVALID_QUANTITY");
		}
		if (request.type === "limit" && (request.price == null || !Number.isFinite(request.price))) {
			return reject("INVALID_PRICE");
		}
		if (
			(request.type === "stop" || request.type === "trailing_stop") &&
			(request.stopPrice == null || !Number.isFinite(request.stopPrice))
		) {
			return reject("INVALID_PRICE");
		}
		const order: TradingOrder = {
			...base,
			status: "working",
			filledQuantity: 0,
			price: request.price,
			stopPrice: request.stopPrice,
			bracket: request.bracket,
			timeInForce: request.timeInForce ?? "GTC",
		};
		this.orders.set(order.id, order);
		return order;
	}

	/**
	 * P1.2b: khóa ngày UTC (yyyy-mm-dd) của nến — deterministic, không phụ thuộc
	 * timezone runtime. Phiên VN (02:00–08:00 UTC) không bao giờ cắt nửa đêm UTC
	 * nên so sánh UTC đúng cho cả HOSE/HNX/UPCOM lẫn crypto 24/7 (ngày UTC).
	 */
	static utcDayKey(date: Date | number): string {
		const d = date instanceof Date ? date : new Date(date);
		const y = d.getUTCFullYear();
		const m = String(d.getUTCMonth() + 1).padStart(2, "0");
		const day = String(d.getUTCDate()).padStart(2, "0");
		return `${y}-${m}-${day}`;
	}

	processBar(symbol: string, bar: ReplayOHLCBar, now?: number): OrderFill[] {
		const ts = now ?? Date.now();
		const fills: OrderFill[] = [];
		// Snapshot đầu pass: lệnh con sinh ra trong pass này chờ nến sau (fill-on-next-bar).
		// sort ổn định: giữ nguyên thứ tự tạo trong cùng mức ưu tiên.
		const candidates = [...this.orders.values()]
			.filter((o) => o.symbol === symbol && o.status === "working")
			.sort((a, b) => fillPriority(a.type) - fillPriority(b.type));
		for (const order of candidates) {
			if (order.status !== "working") continue; // Bị OCO hủy giữa pass — chống double-fill.
			// P1.2b DAY: nến đầu tiên đặt dayKey; nến khác ngày → hết hiệu lực.
			// (Bracket children luôn GTC nên không bao giờ rơi vào nhánh này.)
			if (order.timeInForce === "DAY" && !order.parentOrderId) {
				const day = OrderManagementSystem.utcDayKey(bar.date);
				if (order.dayKey == null) {
					order.dayKey = day;
				} else if (order.dayKey !== day) {
					order.status = "expired";
					order.updatedAt = ts;
					continue;
				}
			}
			this.ratchetTrailing(order, bar);
			const fillPrice = this.resolveFill(order, bar);
			if (fillPrice == null) continue;
			this.fillOrder(order, fillPrice, ts, fills);
		}
		// P1.2b IOC/FOK: hết pass mà còn working (không bracket-children) → hủy ngay.
		// Engine khớp full-or-nothing nên IOC≡FOK hành vi (đã khóa bằng test).
		for (const order of candidates) {
			if (order.status !== "working") continue;
			if (order.parentOrderId) continue;
			if (order.timeInForce === "IOC" || order.timeInForce === "FOK") {
				order.status = "cancelled";
				order.updatedAt = ts;
			}
		}
		return fills;
	}

	private tickDelta(order: TradingOrder): number {
		const ticks = order.bracket?.trailingStopDeltaTicks ?? 0;
		return ticks * this.tickSizeProvider(order.symbol);
	}

	private ratchetTrailing(order: TradingOrder, bar: ReplayOHLCBar): void {
		if (order.type !== "trailing_stop") return;
		const delta = this.tickDelta(order);
		if (delta <= 0 || order.stopPrice == null) return;
		if (order.side === "sell") {
			const peak = Math.max(this.trailingPeak.get(order.id) ?? Number.NEGATIVE_INFINITY, bar.high);
			this.trailingPeak.set(order.id, peak);
			order.stopPrice = Math.max(order.stopPrice, peak - delta);
		} else {
			const trough = Math.min(this.trailingPeak.get(order.id) ?? Number.POSITIVE_INFINITY, bar.low);
			this.trailingPeak.set(order.id, trough);
			order.stopPrice = Math.min(order.stopPrice, trough + delta);
		}
	}

	private resolveFill(order: TradingOrder, bar: ReplayOHLCBar): number | null {
		switch (order.type) {
			case "market":
			case "mp":
			case "mtl":
			case "ato":
				return bar.open;
			case "atc":
				return bar.close;
			case "plo":
			case "limit":
				if (order.price == null) return null;
				if (order.side === "buy") return bar.low <= order.price ? order.price : null;
				return bar.high >= order.price ? order.price : null;
			case "stop":
			case "trailing_stop": {
				if (order.stopPrice == null) return null;
				if (order.side === "buy") {
					if (bar.high < order.stopPrice) return null;
					return bar.open > order.stopPrice ? bar.open : order.stopPrice;
				}
				if (bar.low > order.stopPrice) return null;
				return bar.open < order.stopPrice ? bar.open : order.stopPrice;
			}
			default:
				return null;
		}
	}

	private fillOrder(order: TradingOrder, fillPrice: number, ts: number, fills: OrderFill[]): void {
		order.status = "filled";
		order.filledQuantity = order.quantity;
		order.updatedAt = ts;
		fills.push({
			orderId: order.id,
			symbol: order.symbol,
			side: order.side,
			fillPrice,
			filledQuantity: order.quantity,
			timestamp: ts,
		});
		if (!order.parentOrderId && order.bracket) {
			this.spawnBracketChildren(order, fillPrice, ts);
		}
		if (order.parentOrderId) {
			// OCO: hủy anh em cùng cha ngay trong pass này (zero-delay).
			for (const sibling of this.orders.values()) {
				if (sibling.parentOrderId === order.parentOrderId && sibling.id !== order.id && sibling.status === "working") {
					sibling.status = "cancelled";
					sibling.updatedAt = ts;
				}
			}
		}
	}

	private spawnBracketChildren(parent: TradingOrder, fillPrice: number, ts: number): void {
		const bracket = parent.bracket;
		if (!bracket) return;
		const side: OrderSide = parent.side === "buy" ? "sell" : "buy";
		const dir = parent.side === "buy" ? 1 : -1;
		if (bracket.takeProfitPrice != null) {
			this.addChild(parent, { type: "limit", side, price: bracket.takeProfitPrice }, ts);
		}
		if (bracket.stopLossPrice != null) {
			this.addChild(parent, { type: "stop", side, stopPrice: bracket.stopLossPrice }, ts);
		} else if (bracket.trailingStopDeltaTicks != null && bracket.trailingStopDeltaTicks > 0) {
			const tick = this.tickSizeProvider(parent.symbol);
			const child = this.addChild(
				parent,
				{ type: "trailing_stop", side, stopPrice: fillPrice - dir * bracket.trailingStopDeltaTicks * tick },
				ts,
			);
			this.trailingPeak.set(child.id, fillPrice);
		}
	}

	private addChild(
		parent: TradingOrder,
		kind: { type: "limit" | "stop" | "trailing_stop"; side: OrderSide; price?: number; stopPrice?: number },
		ts: number,
	): TradingOrder {
		const child: TradingOrder = {
			id: `ord_${++this.seq}`,
			clientOrderId: `${parent.clientOrderId}-c${this.seq}`,
			symbol: parent.symbol,
			side: kind.side,
			type: kind.type,
			status: "working",
			quantity: parent.quantity,
			filledQuantity: 0,
			price: kind.price,
			stopPrice: kind.stopPrice,
			bracket: parent.bracket,
			timeInForce: "GTC",
			parentOrderId: parent.id,
			createdAt: ts,
			updatedAt: ts,
		};
		this.orders.set(child.id, child);
		return child;
	}
}
