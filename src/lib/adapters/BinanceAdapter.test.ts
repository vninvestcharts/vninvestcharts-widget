import { describe, expect, it, vi, beforeEach } from "vitest";
import { BinanceAdapter } from "./BinanceAdapter";

const mockKlines = [
	[1_700_000_000_000, "40000.0", "41000.0", "39000.0", "40500.0", "150.5"],
	[1_700_003_600_000, "40500.0", "42000.0", "40200.0", "41800.0", "200.0"],
];

describe("CE20-02: BinanceAdapter", () => {
	let adapter: BinanceAdapter;

	beforeEach(() => {
		adapter = new BinanceAdapter();
	});

	it("maps Binance kline response to KLineBar correctly", async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(mockKlines),
		} as Response);

		const result = await adapter.getBars({
			type: "init",
			symbol: "BTCUSDT",
			interval: "1h",
			timestamp: null,
			limit: 2,
		});

		expect(result.bars).toHaveLength(2);
		expect(result.bars[0]).toMatchObject({
			timestamp: 1_700_000_000_000,
			open: 40000.0,
			high: 41000.0,
			low: 39000.0,
			close: 40500.0,
			volume: 150.5,
		});
		expect(result.bars[1].open).toBe(40500.0);
	});

	it("sets hasMore=true when returned bars equal limit", async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(mockKlines),
		} as Response);

		const result = await adapter.getBars({
			type: "init",
			symbol: "BTCUSDT",
			interval: "1h",
			timestamp: null,
			limit: 2,
		});

		expect(result.hasMore).toBe(true);
	});

	it("sets hasMore=false when returned bars are fewer than limit", async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(mockKlines),
		} as Response);

		const result = await adapter.getBars({
			type: "init",
			symbol: "BTCUSDT",
			interval: "1h",
			timestamp: null,
			limit: 10,
		});

		expect(result.hasMore).toBe(false);
	});

	it("adds endTime param for backward fetch", async () => {
		let capturedUrl = "";
		global.fetch = vi.fn().mockImplementation((url: string) => {
			capturedUrl = url;
			return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
		});

		await adapter.getBars({
			type: "backward",
			symbol: "BTCUSDT",
			interval: "1h",
			timestamp: 1_700_000_000_000,
			limit: 100,
		});

		expect(capturedUrl).toContain("endTime=1699999999999");
	});

	it("fetches exact range with startTime and endTime params", async () => {
		let capturedUrl = "";
		global.fetch = vi.fn().mockImplementation((url: string) => {
			capturedUrl = url;
			return Promise.resolve({ ok: true, json: () => Promise.resolve(mockKlines) });
		});

		const result = await adapter.fetchBarsInRange(
			"BTCUSDT",
			"1h",
			new Date(1_700_000_000_000),
			new Date(1_700_003_600_000),
		);

		expect(capturedUrl).toContain("startTime=1700000000000");
		expect(capturedUrl).toContain("endTime=1700003600000");
		expect(result).toHaveLength(2);
	});

	it("paginates exact-range fetches beyond the 1000-bar page cap", async () => {
		const firstPage = Array.from({ length: 1000 }, (_, index) => [
			1_700_000_000_000 + index * 60_000,
			"100.0",
			"101.0",
			"99.0",
			"100.5",
			"10.0",
		]);
		const secondPage = [
			[1_700_060_000_000, "101.0", "102.0", "100.0", "101.5", "11.0"],
			[1_700_060_060_000, "102.0", "103.0", "101.0", "102.5", "12.0"],
		];
		const fetchSpy = vi.fn()
			.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(firstPage) })
			.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(secondPage) });
		global.fetch = fetchSpy as unknown as typeof fetch;

		const result = await adapter.fetchBarsInRange(
			"BTCUSDT",
			"1m",
			new Date(1_700_000_000_000),
			new Date(1_700_060_060_000),
		);

		expect(fetchSpy).toHaveBeenCalledTimes(2);
		expect(String(fetchSpy.mock.calls[1]?.[0])).toContain("startTime=1700059940001");
		expect(result).toHaveLength(1002);
		expect(result[0]?.timestamp).toBe(1_700_000_000_000);
		expect(result[result.length - 1]?.timestamp).toBe(1_700_060_060_000);
	});

	it("rejects invalid symbol", async () => {
		await expect(
			adapter.getBars({ type: "init", symbol: "../../etc/passwd", interval: "1h", timestamp: null, limit: 10 }),
		).rejects.toThrow("symbol không hợp lệ");
	});

	it("rejects invalid interval", async () => {
		await expect(
			adapter.getBars({ type: "init", symbol: "BTCUSDT", interval: "invalid", timestamp: null, limit: 10 }),
		).rejects.toThrow("Interval không hợp lệ");
	});

	it("throws on non-ok HTTP response", async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 429,
			json: () => Promise.resolve({}),
		} as Response);

		await expect(
			adapter.getBars({ type: "init", symbol: "BTCUSDT", interval: "1h", timestamp: null, limit: 10 }),
		).rejects.toThrow("429");
	});

	it("retries against the public data mirror when the primary origin is geo-blocked (451)", async () => {
		const fetchSpy = vi.fn()
			.mockResolvedValueOnce({ ok: false, status: 451, json: () => Promise.resolve({}) })
			.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockKlines) });
		global.fetch = fetchSpy as unknown as typeof fetch;

		const result = await adapter.getBars({
			type: "init",
			symbol: "BTCUSDT",
			interval: "1h",
			timestamp: null,
			limit: 2,
		});

		expect(fetchSpy).toHaveBeenCalledTimes(2);
		expect(String(fetchSpy.mock.calls[1]?.[0])).toContain("data-api.binance.vision");
		expect(result.bars).toHaveLength(2);
	});

	it("getBars returns empty result when both primary and mirror are geo-blocked (451)", async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 451,
			json: () => Promise.resolve({}),
		} as Response);

		const result = await adapter.getBars({
			type: "init",
			symbol: "BTCUSDT",
			interval: "1h",
			timestamp: null,
			limit: 10,
		});

		expect(result.bars).toEqual([]);
		expect(result.hasMore).toBe(false);
	});

	it("fetchBarsInRange returns empty array when geo-blocked (451) instead of throwing", async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 451,
			json: () => Promise.resolve({}),
		} as Response);

		const result = await adapter.fetchBarsInRange(
			"BTCUSDT",
			"1h",
			new Date(1_700_000_000_000),
			new Date(1_700_003_600_000),
		);

		expect(result).toEqual([]);
	});

	it("subscribeKline opens a kline WS and emits live candles (regression: previously no-op, chart lagged 'now')", () => {
		const instances: any[] = [];
		class MockWebSocket {
			static CONNECTING = 0;
			static OPEN = 1;
			onmessage: ((ev: { data: string }) => void) | null = null;
			readyState = MockWebSocket.OPEN;
			constructor(public url: string) {
				instances.push(this);
			}
			close() {
				this.readyState = 3;
			}
		}
		(global as any).WebSocket = MockWebSocket;

		const received: Array<{ ts: number; close: number; isClosed?: boolean }> = [];
		const unsub = adapter.subscribeKline({
			symbol: "BTCUSDT",
			interval: "1D",
			callback: (bar) => received.push({ ts: bar.timestamp, close: bar.close, isClosed: bar.isClosed }),
		});

		// Resolves interval "1D" -> "1d" and falls back to the public stream host
		// when VN_BINANCE_WS_BASE is not injected (production path).
		expect(instances[0].url).toBe("wss://stream.binance.com:9443/ws/btcusdt@kline_1d");
		expect(instances).toHaveLength(1);

		// Emit an open candle, then a closed candle.
		instances[0].onmessage!({
			data: JSON.stringify({
				k: { t: 1_700_000_000_000, o: "40000", h: "41000", l: "39000", c: "40500", v: "150", x: false },
			}),
		});
		instances[0].onmessage!({
			data: JSON.stringify({
				k: { t: 1_700_000_000_000, o: "40000", h: "41200", l: "39000", c: "41100", v: "180", x: true },
			}),
		});

		expect(received).toHaveLength(2);
		expect(received[0]).toMatchObject({ ts: 1_700_000_000_000, close: 40500, isClosed: false });
		expect(received[1]).toMatchObject({ ts: 1_700_000_000_000, close: 41100, isClosed: true });

		unsub();
		expect(instances[0].readyState).toBe(3);
		delete (global as any).WebSocket;
	});

	it("subscribeLevel2/subscribeTicks share the kline WS base (dev proxy, prod fallback)", () => {
		const instances: any[] = [];
		class MockWebSocket {
			static CONNECTING = 0;
			static OPEN = 1;
			onmessage: ((ev: { data: string }) => void) | null = null;
			onerror: ((err: unknown) => void) | null = null;
			readyState = MockWebSocket.OPEN;
			constructor(public url: string) {
				instances.push(this);
			}
			send() {}
			close() {
				this.readyState = 3;
			}
		}
		(global as any).WebSocket = MockWebSocket;

		try {
			const unsubL2 = adapter.subscribeLevel2!({
				symbol: "BTCUSDT",
				depth: 10,
				callback: () => {},
			});
			const unsubTicks = adapter.subscribeTicks!({
				symbol: "BTCUSDT",
				callback: () => {},
			});

			// Production path (VN_BINANCE_WS_BASE not injected): same public
			// stream host as kline. Dev path uses /binance-ws-proxy via the
			// shared BINANCE_WS_BASE instead of bypassing the proxy.
			expect(instances[0].url).toBe("wss://stream.binance.com:9443/ws/btcusdt@depth10@100ms");
			expect(instances[1].url).toBe("wss://stream.binance.com:9443/ws/btcusdt@trade");

			unsubL2();
			unsubTicks();
			expect(instances[0].readyState).toBe(3);
			expect(instances[1].readyState).toBe(3);
		} finally {
			delete (global as any).WebSocket;
		}
	});
});
