import { describe, it, expect } from "vitest";
import { ReplayFillSimulator } from "../ReplayFillSimulator";
import { ReplayPositionManager } from "../ReplayPositionManager";
import { ReplayOrderBook } from "../ReplayOrderBook";
import type { ReplayOHLCBar, ReplayOrder } from "../replayTradingTypes";

const bar: ReplayOHLCBar = { open: 100, high: 110, low: 90, close: 105, date: new Date("2026-01-01") };
const now = 1000;

// ─── ReplayFillSimulator ─────────────────────────────────────

describe("ReplayFillSimulator", () => {
	const sim = new ReplayFillSimulator();

	it("market buy fills at high", () => {
		const order: ReplayOrder = { id: "o1", type: "market", side: "buy", quantity: 10, timestamp: now };
		const result = sim.simulateFill(order, bar, now);
		expect(result.filled).toBe(true);
		expect(result.fillPrice).toBe(110);
		expect(result.fillQuantity).toBe(10);
	});

	it("market sell fills at low", () => {
		const order: ReplayOrder = { id: "o2", type: "market", side: "sell", quantity: 10, timestamp: now };
		const result = sim.simulateFill(order, bar, now);
		expect(result.filled).toBe(true);
		expect(result.fillPrice).toBe(90);
	});

	it("limit buy triggers when low <= price", () => {
		const order: ReplayOrder = { id: "o3", type: "limit", side: "buy", quantity: 10, price: 95, timestamp: now };
		const result = sim.simulateFill(order, bar, now);
		expect(result.filled).toBe(true);
		expect(result.fillPrice).toBe(95);
	});

	it("limit buy does not trigger when low > price", () => {
		const order: ReplayOrder = { id: "o4", type: "limit", side: "buy", quantity: 10, price: 85, timestamp: now };
		const result = sim.simulateFill(order, bar, now);
		expect(result.filled).toBe(false);
	});

	it("limit sell triggers when high >= price", () => {
		const order: ReplayOrder = { id: "o5", type: "limit", side: "sell", quantity: 10, price: 108, timestamp: now };
		const result = sim.simulateFill(order, bar, now);
		expect(result.filled).toBe(true);
		expect(result.fillPrice).toBe(108);
	});

	it("stop buy triggers when high >= stopPrice", () => {
		const order: ReplayOrder = { id: "o6", type: "stop", side: "buy", quantity: 10, stopPrice: 105, timestamp: now };
		const result = sim.simulateFill(order, bar, now);
		expect(result.filled).toBe(true);
		expect(result.fillPrice).toBe(110);
	});

	it("stop sell triggers when low <= stopPrice", () => {
		const order: ReplayOrder = { id: "o7", type: "stop", side: "sell", quantity: 10, stopPrice: 95, timestamp: now };
		const result = sim.simulateFill(order, bar, now);
		expect(result.filled).toBe(true);
		expect(result.fillPrice).toBe(90);
	});

	it("stop does not trigger when price not reached", () => {
		const order: ReplayOrder = { id: "o8", type: "stop", side: "buy", quantity: 10, stopPrice: 115, timestamp: now };
		const result = sim.simulateFill(order, bar, now);
		expect(result.filled).toBe(false);
	});
});

// ─── ReplayPositionManager ────────────────────────────────────

describe("ReplayPositionManager", () => {
	it("opens a long position", () => {
		const pm = new ReplayPositionManager();
		const pos = pm.openPosition("long", 10, 100, 10, now);
		expect(pos.side).toBe("long");
		expect(pos.entryPrice).toBe(100);
		expect(pos.quantity).toBe(10);
		expect(pos.entryBarIndex).toBe(10);
		expect(pm.getPositions()).toHaveLength(1);
	});

	it("closes position and returns trade with correct P&L", () => {
		const pm = new ReplayPositionManager();
		pm.openPosition("long", 10, 100, 10, now);
		const trade = pm.closePosition("pos-1", 110, 15, "manual", now + 1000);
		expect(trade).not.toBeNull();
		expect(trade!.pnl).toBe(100);
		expect(trade!.barsHeld).toBe(5);
		expect(trade!.exitReason).toBe("manual");
		expect(pm.getPositions()).toHaveLength(0);
	});

	it("long SL triggers when low <= stopLoss", () => {
		const pm = new ReplayPositionManager();
		pm.openPosition("long", 10, 100, 5, now, 95);
		const triggered = pm.checkStopLossTakeProfit({ high: 110, low: 93 });
		expect(triggered).toHaveLength(1);
		expect(triggered[0].reason).toBe("sl");
		expect(triggered[0].fillPrice).toBe(95);
	});

	it("short SL triggers when high >= stopLoss", () => {
		const pm = new ReplayPositionManager();
		pm.openPosition("short", 10, 100, 5, now, 105);
		const triggered = pm.checkStopLossTakeProfit({ high: 108, low: 95 });
		expect(triggered).toHaveLength(1);
		expect(triggered[0].reason).toBe("sl");
	});

	it("long TP triggers when high >= takeProfit", () => {
		const pm = new ReplayPositionManager();
		pm.openPosition("long", 10, 100, 5, now, undefined, 110);
		const triggered = pm.checkStopLossTakeProfit({ high: 112, low: 98 });
		expect(triggered).toHaveLength(1);
		expect(triggered[0].reason).toBe("tp");
	});

	it("short TP triggers when low <= takeProfit", () => {
		const pm = new ReplayPositionManager();
		pm.openPosition("short", 10, 100, 5, now, undefined, 90);
		const triggered = pm.checkStopLossTakeProfit({ high: 98, low: 88 });
		expect(triggered).toHaveLength(1);
		expect(triggered[0].reason).toBe("tp");
	});

	it("updateCurrentPrice updates unrealized P&L", () => {
		const pm = new ReplayPositionManager();
		pm.openPosition("long", 10, 100, 5, now);
		pm.updateCurrentPrice(bar);
		const pos = pm.getPosition("pos-1");
		expect(pos!.currentPrice).toBe(105);
		expect(pos!.unrealizedPnl).toBe(50);
	});

	it("closeAllPositions returns all trades", () => {
		const pm = new ReplayPositionManager();
		pm.openPosition("long", 10, 100, 5, now);
		pm.openPosition("short", 5, 200, 6, now);
		const trades = pm.closeAllPositions(10, "session-end", now);
		expect(trades).toHaveLength(2);
		expect(pm.getPositions()).toHaveLength(0);
	});

	it("closeAllPositions closes long+short at各自的 currentPrice, not blended avg", () => {
		const pm = new ReplayPositionManager();
		pm.openPosition("long", 10, 100, 5, now, undefined, undefined, "AAPL");
		pm.openPosition("short", 5, 200, 6, now, undefined, undefined, "AAPL");
		// Set different currentPrices via updateCurrentPrice
		pm.updateCurrentPrice({ high: 110, low: 90, close: 105 }); // long.currentPrice=105, short.currentPrice=105
		const trades = pm.closeAllPositions(10, "session-end", now);
		expect(trades).toHaveLength(2);
		// Each trade should be closed at its own currentPrice (105 each in this case)
		expect(trades[0].exitPrice).toBe(105);
		expect(trades[1].exitPrice).toBe(105);
		// PnL computed independently per position
		const longTrade = trades.find((t) => t.side === "buy");
		const shortTrade = trades.find((t) => t.side === "sell");
		expect(longTrade).toBeDefined();
		expect(shortTrade).toBeDefined();
		expect(longTrade!.pnl).toBe((105 - 100) * 10); // long: exit 105 - entry 100 = 5 * 10 = 50
		expect(shortTrade!.pnl).toBe((200 - 105) * 5); // short: entry 200 - exit 105 = 95 * 5 = 475
	});

	it("setStopLoss updates position", () => {
		const pm = new ReplayPositionManager();
		pm.openPosition("long", 10, 100, 5, now);
		expect(pm.setStopLoss("pos-1", 95)).toBe(true);
		expect(pm.getPosition("pos-1")!.stopLoss).toBe(95);
	});

	it("setTakeProfit updates position", () => {
		const pm = new ReplayPositionManager();
		pm.openPosition("long", 10, 100, 5, now);
		expect(pm.setTakeProfit("pos-1", 110)).toBe(true);
		expect(pm.getPosition("pos-1")!.takeProfit).toBe(110);
	});

	it("reset clears all state", () => {
		const pm = new ReplayPositionManager();
		pm.openPosition("long", 10, 100, 5, now);
		pm.closePosition("pos-1", 110, 10, "manual", now);
		pm.reset();
		expect(pm.getPositions()).toHaveLength(0);
		expect(pm.getClosedTrades()).toHaveLength(0);
		expect(pm.getTotalPnl()).toBe(0);
	});

	it("P&L for short position", () => {
		const pm = new ReplayPositionManager();
		pm.openPosition("short", 10, 100, 5, now);
		const trade = pm.closePosition("pos-1", 90, 10, "manual", now);
		expect(trade!.pnl).toBe(100);
	});

	it("P&L for losing short position", () => {
		const pm = new ReplayPositionManager();
		pm.openPosition("short", 10, 100, 5, now);
		const trade = pm.closePosition("pos-1", 110, 10, "sl", now);
		expect(trade!.pnl).toBe(-100);
	});

	it("returns null when closing nonexistent position", () => {
		const pm = new ReplayPositionManager();
		expect(pm.closePosition("nonexistent", 100, 10, "manual", now)).toBeNull();
	});

	it("setStopLoss returns false for nonexistent position", () => {
		const pm = new ReplayPositionManager();
		expect(pm.setStopLoss("nonexistent", 95)).toBe(false);
	});

	it("getTotalPnl includes both unrealized and realized", () => {
		const pm = new ReplayPositionManager();
		pm.openPosition("long", 10, 100, 5, now);
		pm.closePosition("pos-1", 110, 10, "manual", now);
		pm.openPosition("long", 5, 100, 11, now);
		pm.updateCurrentPrice({ high: 120, low: 100, close: 105 });
		expect(pm.getTotalPnl()).toBe(100 + 25);
	});

	it("SL and TP not triggered when price not reached", () => {
		const pm = new ReplayPositionManager();
		pm.openPosition("long", 10, 100, 5, now, 95, 110);
		const triggered = pm.checkStopLossTakeProfit({ high: 109, low: 96 });
		expect(triggered).toHaveLength(0);
	});
});

// ─── ReplayOrderBook ──────────────────────────────────────────

describe("ReplayOrderBook", () => {
	it("adds and fills a market order on processBar", () => {
		const ob = new ReplayOrderBook();
		ob.addOrder({ type: "market", side: "buy", quantity: 10, timestamp: now });
		const results = ob.processBar(bar, 5, now);
		expect(results).toHaveLength(1);
		expect(results[0].filled).toBe(true);
		expect(ob.getOpenOrders()).toHaveLength(0);
		expect(ob.getPositionManager().getPositions()).toHaveLength(1);
	});

	it("limit order does not fill if not triggered", () => {
		const ob = new ReplayOrderBook();
		ob.addOrder({ type: "limit", side: "buy", quantity: 10, price: 85, timestamp: now });
		const results = ob.processBar(bar, 5, now);
		expect(results).toHaveLength(0);
		expect(ob.getOpenOrders()).toHaveLength(1);
	});

	it("cancel order removes from open orders", () => {
		const ob = new ReplayOrderBook();
		const order = ob.addOrder({ type: "limit", side: "buy", quantity: 10, price: 85, timestamp: now });
		expect(ob.cancelOrder(order.id)).toBe(true);
		expect(ob.getOpenOrders()).toHaveLength(0);
	});

	it("cancel nonexistent order returns false", () => {
		const ob = new ReplayOrderBook();
		expect(ob.cancelOrder("nonexistent")).toBe(false);
	});

	it("reduceOnly buy closes short position", () => {
		const ob = new ReplayOrderBook();
		ob.addOrder({ type: "market", side: "sell", quantity: 5, timestamp: now });
		ob.processBar(bar, 5, now);
		expect(ob.getPositionManager().getPositions()).toHaveLength(1);
		expect(ob.getPositionManager().getPosition("pos-1")!.side).toBe("short");

		ob.addOrder({ type: "market", side: "buy", quantity: 5, timestamp: now, reduceOnly: true });
		ob.processBar(bar, 6, now);
		expect(ob.getPositionManager().getPositions()).toHaveLength(0);
	});

	it("reduceOnly sell closes long position", () => {
		const ob = new ReplayOrderBook();
		ob.addOrder({ type: "market", side: "buy", quantity: 5, timestamp: now });
		ob.processBar(bar, 5, now);
		expect(ob.getPositionManager().getPositions()).toHaveLength(1);
		expect(ob.getPositionManager().getPosition("pos-1")!.side).toBe("long");

		ob.addOrder({ type: "market", side: "sell", quantity: 5, timestamp: now, reduceOnly: true });
		ob.processBar(bar, 6, now);
		expect(ob.getPositionManager().getPositions()).toHaveLength(0);
	});

	it("processBar triggers SL and closes position", () => {
		const ob = new ReplayOrderBook();
		ob.addOrder({ type: "market", side: "buy", quantity: 10, timestamp: now });
		ob.processBar({ ...bar, high: 110, low: 90, close: 105 }, 5, now);
		const pos = ob.getPositionManager().getPosition("pos-1")!;
		ob.getPositionManager().setStopLoss(pos.id, 95);

		const results = ob.processBar({ open: 106, high: 107, low: 93, close: 100, date: new Date("2026-01-02") }, 6, now);
		expect(ob.getPositionManager().getPositions()).toHaveLength(0);
		expect(ob.getPositionManager().getClosedTrades()).toHaveLength(1);
		expect(ob.getPositionManager().getClosedTrades()[0].exitReason).toBe("sl");
	});

	it("reset clears all state", () => {
		const ob = new ReplayOrderBook();
		ob.addOrder({ type: "market", side: "buy", quantity: 10, timestamp: now });
		ob.processBar(bar, 5, now);
		ob.reset();
		expect(ob.getOpenOrders()).toHaveLength(0);
		expect(ob.getFilledOrders()).toHaveLength(0);
		expect(ob.getPositionManager().getPositions()).toHaveLength(0);
	});

	it("processBar returns multiple results for multiple orders", () => {
		const ob = new ReplayOrderBook();
		ob.addOrder({ type: "market", side: "buy", quantity: 5, timestamp: now });
		ob.addOrder({ type: "market", side: "sell", quantity: 3, timestamp: now });
		const results = ob.processBar(bar, 5, now);
		expect(results).toHaveLength(2);
		expect(ob.getPositionManager().getPositions().length).toBeGreaterThan(0);
	});

	it("fillOnNextBar: limit buy triggers on bar N, fills at bar N+1 open", () => {
		const sim = new ReplayFillSimulator({ fillOnNextBar: true, slippageBps: 0 });
		const ob = new ReplayOrderBook(sim);
		// Limit buy at 98: triggers on bar with low=95
		ob.addOrder({ type: "limit", side: "buy", quantity: 10, price: 98, timestamp: now });
		// Bar N: low=95 ≤ 98 → triggers, deferred to pendingTriggers
		const results1 = ob.processBar({ open: 100, high: 110, low: 95, close: 105, date: 0 }, 5, now);
		expect(results1).toHaveLength(0); // not filled yet
		expect(ob.getOpenOrders()).toHaveLength(0); // removed from open
		// Bar N+1: pending trigger resolves at open=102
		const results2 = ob.processBar({ open: 102, high: 108, low: 100, close: 106, date: 1 }, 6, now);
		expect(results2).toHaveLength(1);
		expect(results2[0].fillPrice).toBe(102); // nextBar.open
		expect(ob.getPositionManager().getPositions()).toHaveLength(1);
		expect(ob.getPositionManager().getPositions()[0].entryPrice).toBe(102);
	});

	it("realisticSlTpFill=false (default): SL long fills at trigger price (unchanged)", () => {
		const ob = new ReplayOrderBook();
		ob.addOrder({ type: "market", side: "buy", quantity: 10, timestamp: now });
		ob.processBar({ open: 100, high: 110, low: 100, close: 105, date: 0 }, 5, now);
		const pos = ob.getPositionManager().getPosition("pos-1")!;
		ob.getPositionManager().setStopLoss(pos.id, 100);
		// Bar gaps down: low=98 < SL=100 → default closes at trigger price 100
		ob.processBar({ open: 99, high: 101, low: 98, close: 99, date: 1 }, 6, now);
		const closed = ob.getPositionManager().getClosedTrades();
		expect(closed).toHaveLength(1);
		expect(closed[0].exitPrice).toBe(100); // trigger price, not worst-case
	});

	it("realisticSlTpFill=true: SL long fills at worst-case min(low, sl)", () => {
		const sim = new ReplayFillSimulator({ slippageBps: 0 });
		const ob = new ReplayOrderBook(sim, undefined, true);
		ob.addOrder({ type: "market", side: "buy", quantity: 10, timestamp: now });
		ob.processBar({ open: 100, high: 110, low: 100, close: 105, date: 0 }, 5, now);
		const pos = ob.getPositionManager().getPosition("pos-1")!;
		ob.getPositionManager().setStopLoss(pos.id, 100);
		// Bar gaps down: low=98 < SL=100 → realistic closes at min(98,100)=98
		ob.processBar({ open: 99, high: 101, low: 98, close: 99, date: 1 }, 6, now);
		const closed = ob.getPositionManager().getClosedTrades();
		expect(closed).toHaveLength(1);
		expect(closed[0].exitPrice).toBe(98); // worst-case gap fill
	});

	it("realisticSlTpFill=true: TP long fills at max(high, tp)", () => {
		const sim = new ReplayFillSimulator({ slippageBps: 0 });
		const ob = new ReplayOrderBook(sim, undefined, true);
		ob.addOrder({ type: "market", side: "buy", quantity: 10, timestamp: now });
		ob.processBar({ open: 100, high: 100, low: 100, close: 100, date: 0 }, 5, now);
		const pos = ob.getPositionManager().getPosition("pos-1")!;
		ob.getPositionManager().setTakeProfit(pos.id, 105);
		// Bar gaps up: high=108 > TP=105 → realistic closes at max(108,105)=108
		ob.processBar({ open: 106, high: 108, low: 104, close: 107, date: 1 }, 6, now);
		const closed = ob.getPositionManager().getClosedTrades();
		expect(closed).toHaveLength(1);
		expect(closed[0].exitPrice).toBe(108);
	});
});
