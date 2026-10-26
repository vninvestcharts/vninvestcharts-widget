import { describe, it, expect } from "vitest";
import { MarketDataPort, computeSyntheticQuote } from "../MarketDataPort";
import type { ReplayOHLCBar } from "../../replay/replayTradingTypes";

// Task 00: MarketDataPort — cổng cấp giá duy nhất (Live last-close / Replay bars).
// Acceptance: feed nến OHLC -> MarketQuote đầy đủ Last/Bid/Ask/Spread;
// logic cấp giá tách biệt 100% khỏi UI.
function makeBar(close: number, date: number): ReplayOHLCBar {
	return { open: close, high: close, low: close, close, date };
}

describe("MarketDataPort", () => {
	it("feedBar OHLC -> quote đầy đủ Last/Bid/Ask/Spread (default 2bps)", () => {
		const port = new MarketDataPort();
		port.feedBar("FPT", makeBar(128500, 1000));
		const q = port.getLatestQuote("FPT");
		expect(q).toBeDefined();
		expect(q!.symbol).toBe("FPT");
		expect(q!.lastPrice).toBe(128500);
		expect(q!.isSyntheticSpread).toBe(true);
		expect(q!.timestamp).toBe(1000);
		// spread = 128500 * 2 / 10000 = 25.7
		expect(q!.spread).toBeCloseTo(25.7, 10);
		expect(q!.askPrice).toBeCloseTo(128500 + 12.85, 10);
		expect(q!.bidPrice).toBeCloseTo(128500 - 12.85, 10);
		expect(q!.spreadBps).toBeCloseTo(2, 10);
	});

	it("tick provider -> spread = 1 tick, bid/ask làm tròn theo tick", () => {
		const port = new MarketDataPort({ tickSizeProvider: () => 100 });
		port.feedBar("FPT", makeBar(128540, 0));
		const q = port.getLatestQuote("FPT")!;
		expect(q.spread).toBe(100);
		expect(q.askPrice).toBe(128600);
		expect(q.bidPrice).toBe(128500);
	});

	it("subscribe nhận quote mỗi feedBar; unsubscribe dừng hẳn", () => {
		const port = new MarketDataPort();
		const seen: number[] = [];
		const unsub = port.subscribeQuote("VNM", (q) => seen.push(q.lastPrice));
		port.feedBar("VNM", makeBar(50, 1));
		port.feedBar("VNM", makeBar(52, 2));
		unsub();
		port.feedBar("VNM", makeBar(55, 3));
		expect(seen).toEqual([50, 52]);
	});

	it("cô lập theo symbol; chưa feed -> undefined", () => {
		const port = new MarketDataPort();
		expect(port.getLatestQuote("CHUA_CO")).toBeUndefined();
		port.feedBar("A", makeBar(10, 0));
		expect(port.getLatestQuote("B")).toBeUndefined();
		expect(port.getLatestQuote("A")!.lastPrice).toBe(10);
	});

	it("timestamp lấy từ bar.date (số và Date)", () => {
		const port = new MarketDataPort();
		port.feedBar("X", { open: 1, high: 1, low: 1, close: 1, date: new Date("2026-01-02T00:00:00Z") });
		expect(port.getLatestQuote("X")!.timestamp).toBe(Date.parse("2026-01-02T00:00:00Z"));
	});

	it("spreadBps tùy chỉnh thắng default", () => {
		const port = new MarketDataPort({ spreadBps: 2 });
		port.feedBar("FPT", makeBar(100000, 0));
		const q = port.getLatestQuote("FPT")!;
		expect(q.spread).toBeCloseTo(20, 10);
		expect(q.spreadBps).toBeCloseTo(2, 10);
	});

	it("nhiều subscriber cùng symbol đều nhận; khác symbol không nhận", () => {
		const port = new MarketDataPort();
		const a: number[] = [];
		const b: number[] = [];
		port.subscribeQuote("FPT", (q) => a.push(q.lastPrice));
		port.subscribeQuote("FPT", (q) => b.push(q.lastPrice));
		port.subscribeQuote("VNM", (q) => b.push(q.lastPrice * -1));
		port.feedBar("FPT", makeBar(10, 0));
		expect(a).toEqual([10]);
		expect(b).toEqual([10]);
	});

	it("giá không hợp lệ (0/âm) -> spread 0, bid=ask=last, không NaN", () => {
		expect(computeSyntheticQuote("Z", 0, 0).spread).toBe(0);
		const q = computeSyntheticQuote("Z", -5, 0);
		expect(q.bidPrice).toBe(-5);
		expect(q.askPrice).toBe(-5);
		expect(Number.isNaN(q.spreadBps)).toBe(false);
	});
});
