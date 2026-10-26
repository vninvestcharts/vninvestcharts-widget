// Task 06: FillSettlement — áp fill vào PMS + cashflow + ticket flags.
// Tách khỏi VirtualBrokerEngine để mỗi file ≤ 400 dòng (Rule 9 + rubric Cổng 5).
// Quy tắc tiền mặt: spot phản ánh qua cost/proceeds (KHÔNG cộng realized riêng,
// tránh double-count); cash-settled quyết toán realized vào balance.
import type {
	BrokerAccount,
	ExecutionTicket,
	ExitReason,
	OrderSide,
	PositionSide,
	TradingOrder,
} from "./types";
import type { MarketRules } from "./MarketRules";
import type { OrderManagementSystem } from "./OrderManagementSystem";
import type { PositionManager } from "./PositionManager";
import type { ExecutionSimulator } from "./ExecutionSimulator";
import type { AnalyticsEngine } from "./AnalyticsEngine";
import { SettlementCalendar } from "./SettlementCalendar";

export interface SettlementBooks {
	account: BrokerAccount;
	history: ExecutionTicket[];
	analytics: AnalyticsEngine;
}

export interface SettleFillArgs {
	symbol: string;
	side: OrderSide;
	quantity: number;
	price: number;
	timestamp: number;
	orderId?: string;
	exitReason?: ExitReason;
	bar?: { high: number; low: number };
}

function roundMoney(value: number, currency: string): number {
	return currency === "VND" ? Math.round(value) : value;
}

export class FillSettlement {
	private mktSeq = 0;

	constructor(
		private readonly oms: OrderManagementSystem,
		private readonly pms: PositionManager,
		private readonly sim: ExecutionSimulator,
		private rules: MarketRules,
	) {}

	/** S2: swap the rules reference (prospective fills only; booked history untouched). */
	updateRules(rules: MarketRules): void {
		this.rules = rules;
	}

	settle(books: SettlementBooks, args: SettleFillArgs): ExecutionTicket {
		const { symbol, side, quantity, price, timestamp } = args;
		const stored = args.orderId ? this.oms.getOrder(args.orderId) : undefined;
		const pseudo: TradingOrder = stored ?? {
			id: `mkt_${++this.mktSeq}`,
			clientOrderId: `mkt-cli-${this.mktSeq}`,
			symbol,
			side,
			type: "market",
			status: "filled",
			quantity,
			filledQuantity: quantity,
			timeInForce: "GTC",
			createdAt: timestamp,
			updatedAt: timestamp,
		};
		const net = this.pms.getPosition(symbol);
		const opposite = net && ((net.side === "long") === (side === "sell")) ? net : undefined;
		const ticket = this.sim.executeFill(
			{
				order: pseudo,
				basePrice: price,
				quantity,
				timestamp,
				positionBasis: opposite ? { entryPrice: opposite.entryPrice, side: opposite.side } : undefined,
				exitReason: args.exitReason,
			},
			this.rules,
		);
		this.flagAmbiguity(ticket, pseudo, args.bar);
		if (opposite) {
			const closeQty = Math.min(quantity, opposite.quantity);
			const res = this.pms.closePosition(opposite.id, closeQty, ticket.fillPrice, timestamp, args.exitReason, {
				enforceAvailable: false,
			});
			if (this.rules.profile !== "VN_SPOT") {
				books.account.balance = roundMoney(books.account.balance + res.realizedPnl, books.account.currency);
			}
			books.analytics.recordClosedTrade({
				timestamp,
				// S5: `realizedPnl` is the price difference only (gross). The trade's NET
				// figure needs BOTH legs' fees: this exit's, plus the entry fee already
				// taken from cash when the position opened. Before S5 the entry fee was in
				// neither place, so a per-trade net could never reconcile with the cash
				// balance - the gap was exactly the entry commission.
				realizedPnl: res.realizedPnl,
				commission: roundMoney(
					res.entryFees + (ticket.commission * closeQty) / quantity,
					books.account.currency,
				),
				tax: roundMoney((ticket.tax * closeQty) / quantity, books.account.currency),
				symbol,
				side: opposite.side,
				quantity: closeQty,
				entryPrice: opposite.entryPrice,
				exitPrice: ticket.fillPrice,
				exitReason: args.exitReason,
			});
			const remainder = quantity - closeQty;
			if (remainder > 0) {
				this.openFresh(symbol, side, remainder, ticket.fillPrice, timestamp, ticket.commission, ticket.tax);
			}
		} else {
			this.openFresh(symbol, side, quantity, ticket.fillPrice, timestamp, ticket.commission, ticket.tax);
		}
		this.applyCashflow(books, side, quantity, ticket);
		books.history.push(ticket);
		return ticket;
	}

	private openFresh(
		symbol: string,
		side: OrderSide,
		quantity: number,
		price: number,
		timestamp: number,
		commission: number,
		tax: number,
	): void {
		this.pms.openPosition({
			symbol,
			side: side === "buy" ? "long" : "short",
			quantity,
			price,
			timestamp,
			// S5: these fees are charged to cash right now, so they belong to the round
			// trip that will close this position - not lost between the two.
			entryFees: commission + tax,
			settlementDate:
				this.rules.settlementDays > 0
					? SettlementCalendar.calculateSettlementTimestamp(timestamp, this.rules.settlementDays)
					: undefined,
		});
	}

	private applyCashflow(books: SettlementBooks, side: OrderSide, quantity: number, ticket: ExecutionTicket): void {
		const { currency } = books.account;
		if (this.rules.profile === "VN_SPOT") {
			if (side === "buy") {
				books.account.balance = roundMoney(
					books.account.balance - quantity * ticket.fillPrice - ticket.commission,
					currency,
				);
			} else {
				books.account.balance = roundMoney(
					books.account.balance + quantity * ticket.fillPrice - ticket.commission - ticket.tax,
					currency,
				);
			}
		} else {
			books.account.balance = roundMoney(books.account.balance - ticket.commission - ticket.tax, currency);
		}
	}

	private flagAmbiguity(
		ticket: ExecutionTicket,
		order: TradingOrder,
		bar: { high: number; low: number } | undefined,
	): void {
		if (!order.parentOrderId || !bar) return;
		const siblings = this.oms.listOrders().filter((o) => o.parentOrderId === order.parentOrderId);
		const tp = siblings.find((o) => o.type === "limit");
		const sl = siblings.find((o) => o.type === "stop" || o.type === "trailing_stop");
		if (tp?.price == null || sl?.stopPrice == null) return;
		const closedSide: PositionSide = ticket.side === "buy" ? "short" : "long";
		if (this.sim.checkIntrabarAmbiguity(tp.price, sl.stopPrice, bar, closedSide)) {
			ticket.ambiguousIntrabarFill = true;
			ticket.tieBreakReason = "CONSERVATIVE_SL_PRIORITY";
		}
	}
}
