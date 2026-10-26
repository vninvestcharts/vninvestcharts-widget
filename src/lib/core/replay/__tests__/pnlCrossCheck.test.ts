import { describe, it, expect } from "vitest";
import { ReplayOrderBook } from "../ReplayOrderBook";
import { ReplayFillSimulator } from "../ReplayFillSimulator";
import { BrokerSimulator } from "../../../strategy/BrokerSimulator";
import type { ReplayOHLCBar } from "../replayTradingTypes";
import { computePnl } from "../pnlUtils";

// F7 cross-check: cả paper-trade path (ReplayPositionManager) và backtest path
// (BrokerSimulator) đều phải tính PnL qua computePnl từ pnlUtils — không duplicate
// formula. Test assert mỗi trade của mỗi path === computePnl(side, entry, exit, qty).
function makeBar(close: number, date: number): ReplayOHLCBar {
	return { open: close, high: close, low: close, close, date };
}

describe("pnlCrossCheck", () => {
	it("paper-trade long round-trip PnL = computePnl (shared formula)", () => {
		const ob = new ReplayOrderBook(new ReplayFillSimulator({ slippageBps: 0 }));
		ob.addOrder({ type: "market", side: "buy", quantity: 2, timestamp: 0, symbol: "X" });
		ob.processBar(makeBar(100, 0), 0, 0);
		ob.addOrder({ type: "market", side: "sell", quantity: 2, timestamp: 1, symbol: "X", reduceOnly: true });
		ob.processBar(makeBar(110, 1), 1, 1);

		const trade = ob.getPositionManager().getClosedTrades()[0];
		expect(trade).toBeDefined();
		expect(trade.pnl).toBe(computePnl("long", trade.entryPrice, trade.exitPrice, trade.quantity));
		// (110-100)*2 = 20
		expect(trade.pnl).toBe(20);
	});

	it("paper-trade short round-trip PnL = computePnl (shared formula)", () => {
		const ob = new ReplayOrderBook(new ReplayFillSimulator({ slippageBps: 0 }));
		ob.addOrder({ type: "market", side: "sell", quantity: 3, timestamp: 0, symbol: "X" });
		ob.processBar(makeBar(200, 0), 0, 0);
		ob.addOrder({ type: "market", side: "buy", quantity: 3, timestamp: 1, symbol: "X", reduceOnly: true });
		ob.processBar(makeBar(180, 1), 1, 1);

		const trade = ob.getPositionManager().getClosedTrades()[0];
		expect(trade).toBeDefined();
		expect(trade.pnl).toBe(computePnl("short", trade.entryPrice, trade.exitPrice, trade.quantity));
		// (200-180)*3 = 60
		expect(trade.pnl).toBe(60);
	});

	it("true cross-check: cùng sequence + cùng qty qua 2 path → PnL khớp tuyệt đối", () => {
		// Cùng 1 round-trip: long entry=100 qty=2, exit=110. PnL kỳ vọng = 20.
		const qty = 2;
		const entry = 100;
		const exit = 110;

		// Paper-trade path (qty rõ ràng).
		const ob = new ReplayOrderBook(new ReplayFillSimulator({ slippageBps: 0 }));
		ob.addOrder({ type: "market", side: "buy", quantity: qty, timestamp: 0, symbol: "X" });
		ob.processBar(makeBar(entry, 0), 0, 0);
		ob.addOrder({ type: "market", side: "sell", quantity: qty, timestamp: 1, symbol: "X", reduceOnly: true });
		ob.processBar(makeBar(exit, 1), 1, 1);
		const paperPnl = ob.getPositionManager().getClosedTrades()[0].pnl;

		// Backtest path: set initialBalance = qty*entry để Math.floor(balance/price) === qty,
		// ép 2 path dùng CÙNG qty → PnL tuyệt đối phải khớp.
		// 3 bars: entry (i=0, buy), hold (i=1), exit (i=2, sell). runBacktest bắt đầu từ i=1
		// nên entry bar phải nằm tại index 0 để được xử lý.
		const sim = new BrokerSimulator(qty * entry);
		const data = [
			{ close: entry, date: new Date(0) },
			{ close: entry, date: new Date(1) },
			{ close: exit, date: new Date(2) },
		];
		sim.runBacktest(data, (curr, _prev) =>
			curr.close === entry ? "buy" : curr.close === exit ? "sell" : null,
		);
		const backtestTrades = sim.getPerformanceReport().trades;
		// BrokerSimulator reopen vị thế trên mỗi signal → so sánh TỔNG PnL của mọi trade
		// (paper-trade chỉ có 1 trade, BrokerSimulator có thêm trade reopen 0 PnL).
		const backtestPnl = backtestTrades.reduce((s, t) => s + t.pnl, 0);

		// Cả 2 phải = computePnl("long", 100, 110, 2) = 20, và khớp nhau tuyệt đối.
		expect(paperPnl).toBe(computePnl("long", entry, exit, qty));
		expect(paperPnl).toBe(backtestPnl);
		expect(paperPnl).toBe(20);
	});

	it("backtest BrokerSimulator mỗi trade PnL = computePnl (shared formula)", () => {
		const sim = new BrokerSimulator(100000);
		const data = [
			{ close: 100, date: new Date(0) },
			{ close: 110, date: new Date(1) },
			{ close: 95, date: new Date(2) },
			{ close: 105, date: new Date(3) },
		];
		sim.runBacktest(data, (curr, _prev) => {
			if (curr.close === 100) return "buy";
			if (curr.close === 110) return "sell";
			if (curr.close === 95) return "buy";
			if (curr.close === 105) return "sell";
			return null;
		});
		const trades = sim.getPerformanceReport().trades;
		expect(trades.length).toBeGreaterThan(0);
		for (const t of trades) {
			expect(t.pnl).toBe(computePnl(t.direction, t.entryPrice, t.exitPrice, t.qty));
		}
	});

	it("computePnl covered trực tiếp (long/short)", () => {
		expect(computePnl("long", 100, 110, 2)).toBe(20);
		expect(computePnl("short", 200, 180, 3)).toBe(60);
		expect(computePnl("long", 100, 90, 2)).toBe(-20);
	});
});
