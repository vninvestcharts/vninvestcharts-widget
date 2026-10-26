// Task 06: VirtualBrokerEngine — orchestrate OMS/PMS/Risk/ExecSim + persist + events.
// SYNC IBrokerAPI (core in-process, deterministic). Persist fire-and-forget.
// Quy tắc khả dụng: gate ở ORDER PLACEMENT (voluntary sell); bracket fills là
// lệnh conditional pre-authorized nên bypass (enforceAvailable: false) — đúng
// semantics sàn (validate lúc nhập lệnh, clearing lo phần còn lại).
import type { AsyncStorageAdapter } from "@vninvestcharts/engine-react";
import type {
	BrokerAccount,
	ExecutionTicket,
	ExitReason,
	OrderRejectCode,
	OrderValidationInput,
	TradingOrder,
	TradingPosition,
} from "./types";
import type {
	ClosePositionOptions,
	IBrokerAPI,
	PlaceOrderOptions,
	TradingEventCallback,
	TradingEventKey,
} from "./BrokerAPI";
import type { MarketRules } from "./MarketRules";
import { DEFAULT_PAPER_BALANCE_USD, DEFAULT_PAPER_BALANCE_VND } from "./MarketRules";
import type { ReplayOHLCBar } from "../replay/replayTradingTypes";
import type { IMarketDataPort } from "./MarketDataPort";
import { OrderManagementSystem, isMarketLikeOrderType } from "./OrderManagementSystem";
import { PositionManager } from "./PositionManager";
import { RiskEngine } from "./RiskEngine";
import { ExecutionSimulator, type ExecutionSimulatorOptions } from "./ExecutionSimulator";
import { FillSettlement, type SettlementBooks } from "./FillSettlement";
import { TradingEventBus } from "./BrokerAPI";
import { TradingStorage } from "./storage/TradingStorage";
import { AnalyticsEngine, type TradingAnalytics } from "./AnalyticsEngine";

/**
 * F-TRADE-01 (điểm A): bar mà mọi số đều **hữu hạn và > 0**.
 *
 * Đo bằng cách chạy thật `onBar` với từng dạng: giá 0, giá âm và NaN đều làm
 * `PositionManager.openPosition` (`:143-148`) ném. `0` bị loại có chủ đích vì thị trường
 * không có giá 0, và `openPosition` đã **từ chối** nó bằng guard — tức loại 0 giữ đúng
 * hành vi sẵn có thay vì mới thêm một quy tắc.
 */
function isUsableBar(bar: ReplayOHLCBar): boolean {
	return [bar.open, bar.high, bar.low, bar.close].every(
		(v) => Number.isFinite(v) && v > 0,
	);
}

export interface VirtualBrokerOptions {
	rules: MarketRules;
	marketDataPort?: IMarketDataPort;
	storageAdapter?: AsyncStorageAdapter;
	storageNamespace?: string;
	initialBalance?: number;
	simulatorOptions?: ExecutionSimulatorOptions;
	hedgingMode?: boolean;
	/**
	 * P1.1 (D-01 live-fill, verdict-scoped): khi true, lệnh market khớp ngay
	 * tại mark price hiện tại qua synthetic tick-bar (tái dùng toàn bộ pipeline
	 * onBar: matching/settlement/analytics/events — 0 logic khớp mới, 0 đụng OMS).
	 * CHỈ bật cho live paper broker. Default false: backtest/replay/standalone
	 * giữ quy ước fill-open-nến-kế chống lookahead (OMS test khóa).
	 */
	fillMarketOnPlace?: boolean;
}

export interface BrokerRuntimePatch {
	/** Merged rules copy (never a shared frozen constant — see applyRuntimeConfig). */
	rules?: MarketRules;
	simulatorOptions?: ExecutionSimulatorOptions;
}

export interface BrokerRuntimeSummary {
	appliedAt: number;
	profile: string;
	simulator: Required<ExecutionSimulatorOptions>;
}

export class VirtualBrokerEngine implements IBrokerAPI {
	private rules: MarketRules;
	private readonly fillMarketOnPlace: boolean;
	private readonly port?: IMarketDataPort;
	private readonly oms: OrderManagementSystem;
	private readonly pms: PositionManager;
	private readonly risk = new RiskEngine();
	private readonly sim: ExecutionSimulator;
	private readonly settlement: FillSettlement;
	private readonly analytics = new AnalyticsEngine();
	private readonly bus = new TradingEventBus();
	private readonly storage: TradingStorage | null;
	private account: BrokerAccount;
	private history: ExecutionTicket[] = [];
	private readonly lastClose = new Map<string, number>();
	private rejSeq = 0;

	constructor(options: VirtualBrokerOptions) {
		this.rules = options.rules;
		this.fillMarketOnPlace = options.fillMarketOnPlace ?? false;
		this.port = options.marketDataPort;
		this.oms = new OrderManagementSystem({
			tickSizeProvider: (symbol) => this.rules.getTickSize(this.lastClose.get(symbol) ?? 0),
		});
		this.pms = new PositionManager({
			hedgingMode: options.hedgingMode,
			contractMultiplier: options.rules.contractMultiplier ?? 1,
		});
		this.sim = new ExecutionSimulator(options.simulatorOptions);
		this.settlement = new FillSettlement(this.oms, this.pms, this.sim, options.rules);
		this.storage = options.storageAdapter
			? new TradingStorage(options.storageAdapter, options.storageNamespace)
			: null;
		const initialBalance =
			options.initialBalance ?? (options.rules.baseCurrency === "USD" ? DEFAULT_PAPER_BALANCE_USD : DEFAULT_PAPER_BALANCE_VND);
		this.account = VirtualBrokerEngine.freshAccount(options.rules, initialBalance);
	}

	private static freshAccount(rules: MarketRules, balance: number): BrokerAccount {
		return {
			accountId: `paper-${rules.profile}`,
			balance,
			equity: balance,
			marginUsed: 0,
			freeMargin: balance,
			buyingPower: balance,
			currency: rules.baseCurrency,
			pnl: 0,
			pnlPercent: 0,
		};
	}

	getAccount(): BrokerAccount {
		return { ...this.account };
	}

	getPositions(): TradingPosition[] {
		return this.pms.listPositions();
	}

	/** Task 11: lookup trực tiếp cho rewired hooks (markers/panel join). */
	getPositionById(positionId: string): TradingPosition | undefined {
		return this.pms.getPositionById(positionId);
	}

	getOrders(): TradingOrder[] {
		return this.oms.listOrders();
	}

	getHistory(): ExecutionTicket[] {
		return [...this.history];
	}

	getAnalytics(): TradingAnalytics {
		return this.analytics.getAnalytics();
	}

	on<K extends TradingEventKey>(event: K, callback: TradingEventCallback<K>): () => void {
		return this.bus.on(event, callback);
	}

	private markPrice(symbol: string): number | undefined {
		return this.port?.getLatestQuote(symbol)?.lastPrice ?? this.lastClose.get(symbol);
	}

	private books(): SettlementBooks {
		return { account: this.account, history: this.history, analytics: this.analytics };
	}

	placeOrder(input: OrderValidationInput, options?: PlaceOrderOptions): TradingOrder {
		// Task 11 replay-compat: bỏ qua toàn bộ validation, đi thẳng vào OMS
		// (legacy accept-everything: không lot-size, không funds, không settlement).
		if (options?.skipValidation) {
			const order = this.oms.placeOrder(input);
			this.afterMutation();
			return order;
		}
		// Spot sell: availability gate TRƯỚC rules-check; lệnh có hàng chuyển thành
		// closing để qua cổng SHORT_NOT_ALLOWED (T+2 chốt ở đây, không chờ fill).
		// S2: khi allowShortSelling bật, short không hàng đi tiếp như lệnh mở mới.
		let effective = input;
		if (input.side === "sell" && this.rules.profile === "VN_SPOT") {
			const held = this.pms.getPosition(input.symbol);
			const covered = input.quantity <= (held?.availableQuantity ?? 0);
			if (!covered && !this.rules.allowShortSelling) {
				return this.rejected(input, "INVALID_QUANTITY", "Không đủ số lượng khả dụng (T+2)");
			}
			effective = covered ? { ...input, isClosingPosition: true } : input;
		}
		const ruleCheck = this.rules.validateOrder(effective);
		if (!ruleCheck.valid) {
			return this.rejected(input, ruleCheck.code ?? "INVALID_QUANTITY", ruleCheck.reason);
		}
		const mark = input.price ?? input.stopPrice ?? this.markPrice(input.symbol);
		const risk = this.risk.validateOrderRisk(effective, this.account, this.rules, mark, this.pms.getPosition(input.symbol));
		if (!risk.valid) {
			return this.rejected(input, risk.rejectCode ?? "INSUFFICIENT_BUYING_POWER", risk.reason);
		}
		const order = this.oms.placeOrder(input);
		this.afterMutation();
		// P1.1 live-fill: market khớp ngay tại mark qua synthetic tick-bar khi
		// policy bật. Không mark → giữ working (như cũ). Không đụng OMS.
		if (
			this.fillMarketOnPlace &&
			order.status === "working" &&
			isMarketLikeOrderType(order.type)
		) {
			const mark = this.markPrice(input.symbol);
			if (mark != null && Number.isFinite(mark)) {
				const now = Date.now();
				this.onBar(input.symbol, { open: mark, high: mark, low: mark, close: mark, date: now }, now);
				return this.oms.getOrder(order.id) ?? order;
			}
		}
		// P1.2b IOC/FOK (mọi broker — ý đồ per-order rõ ràng, đúng cả backtest):
		// đánh ngay tại mark; phần còn lại processBar sweep hủy (full-or-nothing
		// nên không có partial — IOC≡FOK hành vi, đã khóa bằng test).
		if (
			order.status === "working" &&
			(order.timeInForce === "IOC" || order.timeInForce === "FOK")
		) {
			const mark = this.markPrice(input.symbol);
			if (mark != null && Number.isFinite(mark)) {
				const now = Date.now();
				this.onBar(input.symbol, { open: mark, high: mark, low: mark, close: mark, date: now }, now);
				return this.oms.getOrder(order.id) ?? order;
			}
		}
		return order;
	}

	cancelOrder(orderId: string): boolean {
		const ok = this.oms.cancelOrder(orderId);
		if (ok) this.afterMutation();
		return ok;
	}

	modifyOrder(orderId: string, patch: { price?: number; stopPrice?: number; quantity?: number }): TradingOrder {
		if (patch.quantity != null) {
			throw new Error("Quantity change requires cancel + replace (order id identity)");
		}
		const order = this.oms.modifyOrder(orderId, patch);
		this.afterMutation();
		return order;
	}

	closePosition(positionId: string, options?: ClosePositionOptions): boolean {
		const position = this.pms.getPositionById(positionId);
		if (!position) throw new Error(`Position not found: ${positionId}`);
		const quantity = options?.quantity ?? position.availableQuantity;
		if (!(quantity > 0)) throw new Error("Nothing available to close (T+2 settlement?)");
		const mark = this.markPrice(position.symbol);
		if (mark == null) throw new Error(`No market price for ${position.symbol}`);
		this.settlement.settle(this.books(), {
			symbol: position.symbol,
			side: position.side === "long" ? "sell" : "buy",
			quantity,
			price: mark,
			timestamp: Date.now(),
			exitReason: "manual",
		});
		this.afterMutation();
		return true;
	}

	closeAllPositions(reason = "manual", symbol?: string): number {
		let closed = 0;
		for (const position of [...this.pms.listPositions()]) {
			if (symbol !== undefined && position.symbol !== symbol) continue;
			try {
				if (this.closePosition(position.id, { reason })) closed += 1;
			} catch {
				continue;
			}
		}
		return closed;
	}

	private rejected(input: OrderValidationInput, code: OrderRejectCode, reason?: string): TradingOrder {
		const now = Date.now();
		this.rejSeq += 1;
		return {
			id: `rej_${this.rejSeq}`,
			clientOrderId: `rej-cli-${this.rejSeq}`,
			symbol: input.symbol,
			side: input.side,
			type: input.type,
			status: "rejected",
			quantity: input.quantity,
			filledQuantity: 0,
			price: input.price,
			stopPrice: input.stopPrice,
			timeInForce: input.timeInForce ?? "GTC",
			rejectCode: code,
			createdAt: now,
			updatedAt: now,
		};
	}

	onBar(symbol: string, bar: ReplayOHLCBar, now: number = Date.now()): void {
		// F-TRADE-01 (điểm A) — chặn bar không dùng được TRƯỚC khi chạm OMS.
		//
		// Đo 2026-10-15 (`pointA.probe2`, đã xoá sau khi chốt kết luận): với `bar(0,0,0,0)`,
		// `onBar` ném `"Position price must be positive"` **sau khi** `oms.processBar()` đã
		// đánh dấu lệnh `filled` với `filledQuantity = 100`, còn PMS **không** có vị thế nào.
		// Tức là OMS/PMS **lệch nhau thật**, và bar hợp lệ sau đó **không** tự sửa được:
		// đo tiếp cho thấy order vẫn `filled` và vị thế vẫn 0.
		//
		// Vì sao chặn ở đây thay vì làm rollback:
		//  * `PositionManager.restoreState()` (`:121`) gọi `clear()` (`:79`) — mà `clear()`
		//    xoá cả `this.lots`. `restoreState` **không** phục hồi `lots`, nên rollback đi
		//    qua đường đó sẽ **mất FIFO cost basis** ⇒ lãi/lỗ sai. Đó là lỗi tệ hơn lỗi
		//    đang sửa.
		//  * Rollback đúng phải mở rộng `restoreState` để (de)serialize `lots` + `lotSeq` —
		//    thay đổi schema lưu trữ, rộng và rủi ro hơn nhiều so với chặn tại nguồn.
		//  * Chặn tại nguồn giữ **đúng bất biến** ta cần: "OMS và PMS luôn đồng bộ" — vì
		//    bước duy nhất biến OMS là `processBar()`, và nó không bao giờ chạy nữa.
		if (!isUsableBar(bar)) {
			this.barRejected += 1;
			this.lastBarRejected = { symbol, reason: "bar khong dung duoc (gia/am/NaN)" };
			// Phát sự kiện ngay tại đây thay vì để tầng UI tự poll `getBarRejectionCount()`:
			// polling sẽ kéo `setInterval` vào widget và làm đỏ cổng `audit:dom-access`.
			this.bus.emit("barRejected", {
				symbol,
				reason: this.lastBarRejected.reason,
				count: this.barRejected,
			});
			return;
		}
		this.lastClose.set(symbol, bar.close);
		const fills = this.oms.processBar(symbol, bar, now);
		const tickets: ExecutionTicket[] = [];
		for (const fill of fills) {
			tickets.push(
				this.settlement.settle(this.books(), {
					symbol: fill.symbol,
					side: fill.side,
					quantity: fill.filledQuantity,
					price: fill.fillPrice,
					timestamp: fill.timestamp,
					orderId: fill.orderId,
					exitReason: this.exitReasonOf(fill.orderId),
					bar: { high: bar.high, low: bar.low },
				}),
			);
		}
		this.pms.updateMarkPrice(symbol, bar.close, now);
		this.pms.applySettlement(now);
		this.syncAccount();
		this.analytics.recordEquityPoint(now, this.account.equity);
		this.persist();
		this.emitAll();
		for (const ticket of tickets) this.bus.emit("fill", ticket);
	}

	private exitReasonOf(orderId: string): ExitReason | undefined {
		const order = this.oms.getOrder(orderId);
		if (!order?.parentOrderId) return undefined;
		if (order.type === "limit") return "tp";
		if (order.type === "stop" || order.type === "trailing_stop") return "sl";
		return "manual";
	}

	updateMarkPrice(symbol: string, price: number): void {
		this.pms.updateMarkPrice(symbol, price, Date.now());
		this.syncAccount();
		this.emitAll();
	}

	resetAccount(initialBalance?: number): void {
		// Explicit user intent = readiness (tránh hydrate sau đó hồi sinh state cũ).
		this.hydrated = true;
		this.oms.clear();
		this.pms.clear();
		this.history = [];
		this.analytics.clear();
		this.account = VirtualBrokerEngine.freshAccount(
			this.rules,
			initialBalance ?? (this.rules.baseCurrency === "USD" ? DEFAULT_PAPER_BALANCE_USD : DEFAULT_PAPER_BALANCE_VND),
		);
		this.analytics.recordEquityPoint(Date.now(), this.account.equity);
		if (this.storage) {
			this.storage
				.clearState()
				.then(() => this.persist())
				.catch(() => undefined);
		}
		this.emitAll();
	}

	/**
	 * S2: apply runtime config without recreating the broker. Positions,
	 * orders, WS subscriptions and booked history survive; only NEW fills use
	 * the updated pricing/rules (prospective-only, §10 Q2). The rules object
	 * must be a private merged copy — never a shared frozen constant.
	 */
	applyRuntimeConfig(patch: BrokerRuntimePatch): BrokerRuntimeSummary {
		if (patch.rules) {
			this.rules = patch.rules;
			this.settlement.updateRules(patch.rules);
		}
		const simulator = this.sim.updateOptions(patch.simulatorOptions ?? {});
		return {
			appliedAt: Date.now(),
			profile: this.rules.profile,
			simulator,
		};
	}

	async flush(): Promise<void> {
		this.hydrated = true;
		await this.persist();
	}

	async hydrate(): Promise<boolean> {
		if (!this.storage) return false;
		const state = await this.storage.loadState();
		if (!state) {
			// Không có gì để phục hồi nhưng đã sẵn sàng — mở cổng persist.
			this.hydrated = true;
			return false;
		}
		// Bật cờ SAU KHI restore xong: parse lỗi giữa chừng mà cờ đã mở thì
		// persist sau sẽ ghi đè state lỗi/nửa vời lên đĩa (audit M1+M2).
		this.oms.restoreState(state.orders, state.trailingPeaks);
		this.pms.restoreState(state.positions);
		this.account = { ...state.account };
		this.history = state.history.map((t) => ({ ...t }));
		this.analytics.restoreClosedTrades(state.closedTrades);
		this.analytics.restoreEquityCurve(state.equityCurve);
		this.hydrated = true;
		this.syncAccount();
		return true;
	}

	private hydrated = false;

	/** F-TRADE-01 (điểm B): lỗi lưu gần nhất — `null` nghĩa là lần lưu cuối thành công. */
	private lastPersistError: Error | null = null;

	/** F-TRADE-01 (điểm A): số bar rác bị chặn, và bar gần nhất. */
	private barRejected = 0;
	private lastBarRejected: { symbol: string; reason: string } | null = null;

	/**
	 * Số bar không dùng được đã bị chặn, và bar gần nhất bị chặn. Xem `onBar` — trước khi
	 * có chặn này, bar rác làm OMS đánh dấu `filled` rồi PMS ném, để lại vị thế lệch vĩnh viễn.
	 */
	getBarRejectionCount(): number {
		return this.barRejected;
	}

	getLastBarRejected(): { symbol: string; reason: string } | null {
		return this.lastBarRejected;
	}

	private syncAccount(): void {
		const marks: Record<string, number> = {};
		for (const [symbol, close] of this.lastClose) marks[symbol] = close;
		this.account = this.risk.recalculateAccount(this.account, this.pms.listPositions(), this.rules, marks);
	}

	private persist(): Promise<void> {
		// Hydrate-gate (data-loss race): auto-persist (onBar/placeOrder/...) KHÔNG
		// được ghi đè state đã lưu trước khi hydrate lần đầu hoàn tất. flush() và
		// resetAccount() là explicit intent nên luôn qua (chúng tự set hydrated).
		if (!this.storage || !this.hydrated) return Promise.resolve();
		// F-TRADE-01 (điểm B): trước đây chuỗi này kết thúc bằng `.catch(() => undefined)`
		// — lỗi lưu bị NUỐT. Vì `afterMutation()` (:422) và `onBar()` (:307) gọi mà không
		// await, một lần quota đầy nghĩa là giao dịch biến mất lúc hydrate lại mà
		// không ai được báo. Nay: ghi nhận + phát event, không nuốt.
		return this.storage
			.saveState({
				version: 1,
				savedAt: Date.now(),
				account: { ...this.account },
				orders: this.oms.listOrders().map((o) => ({ ...o })),
				positions: this.pms.listPositions().map((p) => ({ ...p })),
				trailingPeaks: this.oms.getTrailingPeaks(),
				history: this.history.map((t) => ({ ...t })),
				closedTrades: this.analytics.getClosedTrades(),
				equityCurve: this.analytics.getEquityCurve(),
			})
			.then(() => {
				this.lastPersistError = null;
			})
			.catch((error: unknown) => {
				const err = error instanceof Error ? error : new Error(String(error));
				this.lastPersistError = err;
				this.bus.emit("persistError", err);
			});
	}

	/**
	 * Lỗi lưu trạng thái gần nhất, hoặc `null` nếu lần lưu cuối thành công / không có
	 * storage. Xem `getLastPersistError` ở `IBrokerAPI`-side docs — dùng để hiển thị
	 * cảnh báo thay vì để người dùng phát hiện bằng cách mất dữ liệu.
	 */
	getLastPersistError(): Error | null {
		return this.lastPersistError;
	}

	private afterMutation(): void {
		this.syncAccount();
		this.persist();
		this.emitAll();
	}

	private emitAll(): void {
		this.bus.emit("orderChange", this.oms.listOrders());
		this.bus.emit("positionChange", this.pms.listPositions());
		this.bus.emit("accountChange", this.getAccount());
	}
}

