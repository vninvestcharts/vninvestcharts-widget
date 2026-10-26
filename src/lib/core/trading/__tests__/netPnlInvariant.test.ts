/**
 * S5 - the invariant that makes P&L trustworthy, and the regression that proves it
 * was broken.
 *
 * ## What was wrong
 *
 * Three numbers for one closed trade came from three different places, and they
 * disagreed about fees:
 *
 *   FillSettlement.ts:92    books.account.balance += res.realizedPnl
 *                           `realizedPnl` is GROSS (PositionManager.offsetOpposite
 *                           computes (exit-entry)*dir*qty, no fee term)
 *
 *   ExecutionSimulator.ts:93 ticket.pnl = grossPnl - commission - tax
 *                           ALREADY NET
 *
 *   FillSettlement.ts:94-105  recordClosedTrade({ realizedPnl: <gross>,
 *                                                   commission: <fee>,
 *                                                   tax:      <fee> })
 *                           stores GROSS plus the fees as separate fields
 *
 * So a consumer that adds `realizedPnl - commission - tax` (the obvious reading of
 * that record) subtracts the fees TWICE, while `balance` - which took the gross and
 * was then charged the fee by applyCashflow - has subtracted them ONCE. The two paths
 * disagree by exactly the fee, and the disagreement grows with every round trip.
 *
 * `AnalyticsEngine.getAnalytics()` compounds it: grossProfit/grossLoss are built from
 * the GROSS `realizedPnl`, so `netProfit` and `profitFactor` are gross too, while the
 * field is called `netProfit`.
 *
 * ## The invariant
 *
 *     sum(net PnL over closed trades) === balance - initialBalance
 *
 * holds exactly when fees are charged once and once only. It is the single check
 * that catches double-counting, wrong-sign fee handling, and a partial close that
 * leaks its fee.
 *
 * ## Why this test is written against the ENGINE, not against a formula
 *
 * A test that recomputes the expected number with the same expression the
 * implementation uses proves nothing - it fails and passes together with the bug.
 * So the expected side here is `balance - initialBalance`, a number produced by the
 * cash path, which the P&L path does not touch. The two are independent by
 * construction, which is what makes a disagreement informative.
 */
import { describe, it, expect } from "vitest";
import { VirtualBrokerEngine } from "../VirtualBrokerEngine";
import { InMemoryStorageAdapter } from "../storage/InMemoryStorageAdapter";
import { VN_SPOT_RULES, VN_DERIVATIVES_RULES } from "../MarketRules";
import type { ReplayOHLCBar } from "../../replay/replayTradingTypes";
import type { ClosedTradeRecord } from "../AnalyticsEngine";

function bar(o: number, h: number, l: number, c: number): ReplayOHLCBar {
	return { open: o, high: h, low: l, close: c, date: 0 };
}

const INITIAL = 100_000_000;

function spotBroker(initialBalance = INITIAL) {
	const broker = new VirtualBrokerEngine({
		rules: VN_SPOT_RULES,
		storageAdapter: new InMemoryStorageAdapter(),
		initialBalance,
	});
	return broker;
}

function futuresBroker(initialBalance = INITIAL) {
	const broker = new VirtualBrokerEngine({
		rules: VN_DERIVATIVES_RULES,
		storageAdapter: new InMemoryStorageAdapter(),
		initialBalance,
	});
	return broker;
}

/**
 * The one definition of "net" for a closed trade, per S5.
 *
 * `realizedPnl` in a ClosedTradeRecord is GROSS. Net is gross minus that trade's own
 * fees. Centralised here so the analytics, the API and the tests cannot each invent a
 * slightly different subtraction - which is how the double count survived.
 */
export function netOf(trade: ClosedTradeRecord): number {
	return trade.realizedPnl - trade.commission - trade.tax;
}

/** Sum of net P&L over every closed trade, and how many there were. */
function netTotal(broker: VirtualBrokerEngine): { net: number; count: number } {
	const trades = broker.getAnalytics().closedTrades;
	return { net: trades.reduce((sum, t) => sum + netOf(t), 0), count: trades.length };
}

/**
 * Drive one complete round trip: entry on the next bar, exit when the bracket is hit.
 *
 * A plain market order alone never closes anything - the position just sits there -
 * which is exactly the mistake the first draft of this file made and the reason its
 * `count` came back 0. The bracket is what produces a ClosedTradeRecord.
 */
function roundTrip(
	broker: VirtualBrokerEngine,
	symbol: string,
	quantity: number,
	exitBar: ReplayOHLCBar,
	startTs: number,
) {
	broker.onBar(symbol, bar(128000, 128400, 127800, 128200), startTs);
	broker.placeOrder({
		symbol,
		side: "buy",
		type: "market",
		quantity,
		bracket: {
			takeProfitPrice: exitBar.close,
			stopLossPrice: 100000,
		},
	});
	broker.onBar(symbol, bar(128500, 129000, 128000, 128800), startTs + 1);
	broker.onBar(symbol, exitBar, startTs + 2);
}

describe("S5 - sum(netPnl) === balance - initialBalance", () => {
	it("SPOT: one round trip books its fee exactly once", () => {
		const broker = spotBroker();
		roundTrip(broker, "FPT", 100, bar(134000, 136000, 133000, 135500), 1);

		const { net, count } = netTotal(broker);
		expect(count).toBe(1);
		expect(net).toBe(broker.getAccount().balance - INITIAL);
	});

	it("SPOT: fees are charged ONCE - the sum matches cash to the dong", () => {
		const broker = spotBroker();
		roundTrip(broker, "FPT", 100, bar(134000, 136000, 133000, 135500), 1);

		const [trade] = broker.getAnalytics().closedTrades;
		const fees = trade.commission + trade.tax;

		// Non-zero, otherwise this test would pass for the wrong reason: a zero-fee
		// instrument cannot detect double counting.
		expect(fees).toBeGreaterThan(0);

		const balance = broker.getAccount().balance - INITIAL;
		expect(balance).toBe(trade.realizedPnl - fees);
		expect(netTotal(broker).net).toBe(trade.realizedPnl - fees);
		// The double-counted figure is a DIFFERENT number, so this test can tell the
		// two apart instead of tolerating either.
		expect(trade.realizedPnl - 2 * fees).not.toBe(balance);
	});

	it("SPOT: a LOSS round trip holds the invariant too (sign handling)", () => {
		const broker = spotBroker();
		broker.onBar("FPT", bar(128000, 128400, 127800, 128200), 1);
		broker.placeOrder({
			symbol: "FPT",
			side: "buy",
			type: "market",
			quantity: 100,
			bracket: { takeProfitPrice: 130000, stopLossPrice: 120000 },
		});
		broker.onBar("FPT", bar(128500, 129000, 128000, 128800), 2);
		broker.onBar("FPT", bar(121000, 122000, 120000, 120500), 3);

		const { net, count } = netTotal(broker);
		expect(count).toBe(1);
		expect(net).toBeLessThan(0);
		expect(net).toBe(broker.getAccount().balance - INITIAL);
	});

	it("SPOT: several round trips accumulate without drift", () => {
		const broker = spotBroker();
		for (const [i, exit] of [135500, 134500, 137500].entries()) {
			roundTrip(broker, "FPT", 100, bar(exit - 500, exit + 500, exit - 1000, exit), 1 + i * 10);
		}
		const { net, count } = netTotal(broker);
		expect(count).toBe(3);
		// Per-round-trip drift would accumulate; exact equality forbids it.
		expect(net).toBe(broker.getAccount().balance - INITIAL);
	});

	it("DERIVATIVES: the profile that credits realized PnL separately also holds", () => {
		// VN30 futures sit near 1300, not 128000 - the spot price is not a valid tick for
		// this profile, so the order never fills and the trade list stays empty. The
		// first draft of this test used the spot prices and therefore asserted nothing.
		const broker = futuresBroker();
		broker.onBar("VN30F1M", bar(1300, 1305, 1295, 1300), 1);
		broker.placeOrder({
			symbol: "VN30F1M",
			side: "buy",
			type: "market",
			quantity: 1,
			bracket: { takeProfitPrice: 1350, stopLossPrice: 1250 },
		});
		broker.onBar("VN30F1M", bar(1300, 1310, 1295, 1310), 2);
		broker.onBar("VN30F1M", bar(1340, 1360, 1330, 1350), 3);

		const { net, count } = netTotal(broker);
		expect(count).toBe(1);
		expect(net).toBe(broker.getAccount().balance - INITIAL);
	});
});

describe("S5 - getAnalytics().netProfit is NET, not gross", () => {
	it("netProfit is computed from net, not from gross", () => {
		const broker = spotBroker();
		roundTrip(broker, "FPT", 100, bar(134000, 136000, 133000, 135500), 1);

		const analytics = broker.getAnalytics();
		const [trade] = analytics.closedTrades;

		// grossProfit is summed from the GROSS realizedPnl, so netProfit is really
		// gross. Naming a gross number "net" is the second half of S5.
		expect(analytics.netProfit).toBe(netOf(trade));
		expect(analytics.netProfit).not.toBe(trade.realizedPnl);
		expect(analytics.grossProfit).toBe(trade.realizedPnl);
	});
});

// The equity-curve duplication guard is deliberately NOT asserted here. It is the
// same class of defect - an append with no idempotency check - but a different
// surface (AnalyticsEngine.recordEquityPoint, replay path). It is filed as its own
// slice W-9 so that fixing it cannot be mistaken for part of the P&L fix, and it has
// its own test file. Asserting it here would have made this file pass only after an
// unrelated change, and a slice that needs two fixes to go green is a slice nobody
// can review.
//
// Known and still open, with the measurement that shows it:
//   AnalyticsEngine.recordEquityPoint is `this.curve.push(...)` with no timestamp
//   check, called once per bar from VirtualBrokerEngine.ts:306. Re-delivering a bar
//   at the same timestamp appends a duplicate point, which shifts maxDrawdown and
//   Sharpe. See docs/upgrade-standard/plans/PLAN_BACKLOG_SPLIT_2026-10-07.md W-9.
