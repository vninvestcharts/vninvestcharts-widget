import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
	DEFAULT_BARS_HOT_WINDOW_LOAD_GATE_THRESHOLDS,
	diffBarsHotWindowTelemetry,
	evaluateBarsHotWindowLoadGate,
	VNInvestClient,
	resolveApiBase,
} from "../../../widget/adapters/VNInvestClient";
import { VNInvestDataSource, DemoDataSource } from "../index";

vi.mock("../../demoData", () => ({
	getOfflineDemoBars: () => [
		{ date: new Date("2026-01-01T00:00:00.000Z"), open: 1, high: 2, low: 0.5, close: 1.5, volume: 100 },
	],
}));

describe("VNInvestClient", () => {
	let client: VNInvestClient;

	beforeEach(() => {
		vi.unstubAllGlobals();
		// Clear localStorage mock
		vi.stubGlobal("localStorage", {
			getItem: vi.fn().mockReturnValue(null),
			setItem: vi.fn(),
			removeItem: vi.fn(),
		});
		client = new VNInvestClient();
	});

	afterEach(() => {
		VNInvestClient.__resetBarsHotWindowCacheForTests();
		vi.unstubAllGlobals();
	});

	it("resolveApiBase fallback về origin hiện tại khi chưa có override", () => {
		vi.stubGlobal("location", {
			origin: "http://localhost:3000",
			hostname: "localhost",
			port: "3000",
		});

		expect(resolveApiBase()).toBe("http://localhost:3000");
	});

	it("resolveApiBase fallback về 127.0.0.1 khi origin hiện tại không dùng được", () => {
		vi.stubGlobal("location", {
			origin: "null",
			hostname: "",
			port: "",
		});

		expect(resolveApiBase()).toBe("https://127.0.0.1");
	});

	it("resolveApiBase fallback về 127.0.0.1 khi không có location", () => {
		vi.stubGlobal("location", undefined);

		expect(resolveApiBase()).toBe("https://127.0.0.1");
	});

	it("resolveApiBase ưu tiên giá trị đã lưu trong localStorage thay vì origin", () => {
		vi.stubGlobal("location", {
			origin: "http://127.0.0.1:3000",
			hostname: "127.0.0.1",
			port: "3000",
		});
		vi.stubGlobal("localStorage", {
			getItem: vi.fn().mockReturnValue("https://api.example.invalid"),
			setItem: vi.fn(),
			removeItem: vi.fn(),
		});

		expect(resolveApiBase()).toBe("https://api.example.invalid");
	});

	it("hasPAT trả false khi chưa có PAT (fail-closed by design, DEFAULT_PAT rỗng)", () => {
		expect(client.hasPAT()).toBe(false);
	});

	it("hasPAT trả true sau setPAT", () => {
		client.setPAT("test-token-abc");
		expect(client.hasPAT()).toBe(true);
	});

	it("setPAT với chuỗi rỗng sẽ xóa PAT", () => {
		client.setPAT("existing-token");
		client.setPAT("   "); // whitespace only
		expect(client.hasPAT()).toBe(false);
		expect(client.getPAT()).toBe("");
	});

	it("getChart 401 → throw TOKEN_EXPIRED", async () => {
		client.setPAT("test-token");
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 401, ok: false }));
		await expect(client.getChart("VCB")).rejects.toThrow("TOKEN_EXPIRED");
	});

	it("getChart 404 → throw SYMBOL_NOT_FOUND", async () => {
		client.setPAT("test-token");
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 404, ok: false }));
		await expect(client.getChart("INVALID")).rejects.toThrow("SYMBOL_NOT_FOUND");
	});

	it("getChart trả đúng RawOHLCVBar[] shape", async () => {
		client.setPAT("test-token");
		const mockResponse = {
			symbol: "VCB",
			days: 30,
			timeframe: "D",
			points: [
				{ date: "2026-01-01", open: 100, high: 110, low: 90, close: 105, volume: 1000 },
			],
			technical: { rsi14: 55.5 },
		};
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
			status: 200,
			ok: true,
			json: vi.fn().mockResolvedValue(mockResponse),
		}));
		const bars = await client.getChart("VCB");
		expect(bars).toHaveLength(1);
		expect(bars[0].date).toBeInstanceOf(Date);
		expect(bars[0].open).toBe(100);
		expect(bars[0].close).toBe(105);
		expect(bars[0].technical?.rsi14).toBe(55.5);
	});

	it("getChart chuẩn hóa timeframe D giữ nguyên D theo backend contract", async () => {
		client.setPAT("test-token");
		const fetchMock = vi.fn().mockResolvedValue({
			status: 200,
			ok: true,
			json: vi.fn().mockResolvedValue({ points: [] }),
		});
		vi.stubGlobal("fetch", fetchMock);

		await client.getChart("VCB", { timeframe: "D", days: 5 });

		const calledUrl = String(fetchMock.mock.calls[0]?.[0] ?? "");
		expect(calledUrl).toContain("timeframe=D");
		expect(calledUrl).toContain("days=5");
	});

	it("getChart chấp nhận payload mảng point trực tiếp từ SaaS runtime", async () => {
		client.setPAT("test-token");
		const mockResponse = [
			{ date: "2026-01-02", open: 101, high: 112, low: 99, close: 110, volume: 2000 },
		];
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
			status: 200,
			ok: true,
			json: vi.fn().mockResolvedValue(mockResponse),
		}));
		const bars = await client.getChart("VCB");
		expect(bars).toHaveLength(1);
		expect(bars[0].date).toBeInstanceOf(Date);
		expect(bars[0].open).toBe(101);
		expect(bars[0].technical).toBeUndefined();
	});

	it("getChart parse được payload nested data.points", async () => {
		client.setPAT("test-token");
		const mockResponse = {
			data: {
				points: [
					{ date: "2026-01-03T00:00:00Z", open: 102, high: 108, low: 100, close: 106, volume: 1500 },
				],
				technical: { rsi14: 60.1 },
			},
		};
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
			status: 200,
			ok: true,
			json: vi.fn().mockResolvedValue(mockResponse),
		}));

		const bars = await client.getChart("VCB");
		expect(bars).toHaveLength(1);
		expect(bars[0].open).toBe(102);
		expect(bars[0].technical?.rsi14).toBe(60.1);
	});

	it("getChart parse được payload candles với key o/h/l/c/v", async () => {
		client.setPAT("test-token");
		const mockResponse = {
			candles: [
				{ t: "2026-01-04T00:00:00Z", o: 103, h: 109, l: 101, c: 107, v: 1700 },
			],
		};
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
			status: 200,
			ok: true,
			json: vi.fn().mockResolvedValue(mockResponse),
		}));

		const bars = await client.getChart("VCB");
		expect(bars).toHaveLength(1);
		expect(bars[0].close).toBe(107);
		expect(bars[0].volume).toBe(1700);
	});

	it("getChart parse được payload OHLCV dạng chuỗi số", async () => {
		client.setPAT("test-token");
		const mockResponse = {
			points: [
				{ date: "2026-01-05", open: "104", high: "111", low: "102", close: "109", volume: "2500" },
			],
		};
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
			status: 200,
			ok: true,
			json: vi.fn().mockResolvedValue(mockResponse),
		}));

		const bars = await client.getChart("VCB");
		expect(bars).toHaveLength(1);
		expect(bars[0].open).toBe(104);
		expect(bars[0].close).toBe(109);
		expect(bars[0].volume).toBe(2500);
	});

	it("getChart parse đúng timestamp unix seconds", async () => {
		client.setPAT("test-token");
		const mockResponse = {
			candles: [
				{ t: 1704412800, o: 104, h: 111, l: 102, c: 109, v: 2500 },
			],
		};
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
			status: 200,
			ok: true,
			json: vi.fn().mockResolvedValue(mockResponse),
		}));

		const bars = await client.getChart("VCB");
		expect(bars).toHaveLength(1);
		expect(bars[0].date.valueOf()).toBe(new Date("2024-01-05T00:00:00.000Z").valueOf());
	});

	it("getWhaleFeed trả null khi backend trả mảng rỗng", async () => {
		client.setPAT("test-token");
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
			status: 200,
			ok: true,
			json: vi.fn().mockResolvedValue([]),
		}));
		await expect(client.getWhaleFeed("VCB")).resolves.toBeNull();
	});

	it("getBarsPage collapse concurrent requests cùng key", async () => {
		client.setPAT("test-token");
		const payload = {
			bars: [{ t: "2026-01-05T00:00:00Z", o: 100, h: 110, l: 95, c: 108, v: 1000 }],
			has_more_before: true,
			has_more_after: false,
			next_before: 1700000000000,
			snapshot_id: "snap-1",
		};
		const fetchMock = vi.fn().mockImplementation(async () => ({
			status: 200,
			ok: true,
			json: async () => payload,
		}));
		vi.stubGlobal("fetch", fetchMock);

		const [first, second] = await Promise.all([
			client.getBarsPage({ type: "backward", symbol: "VCB", timeframe: "D", before: 1704067200000, limit: 200 }),
			client.getBarsPage({ type: "backward", symbol: "VCB", timeframe: "D", before: 1704067200000, limit: 200 }),
		]);

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(first.bars).toHaveLength(1);
		expect(second.bars).toHaveLength(1);
		expect(first.snapshotId).toBe("snap-1");
		expect(second.snapshotId).toBe("snap-1");
		expect(VNInvestClient.__getBarsHotWindowTelemetryForTests()).toMatchObject({
			networkRequests: 1,
			inFlightCollapses: 1,
		});
	});

	it("getBarsPage dùng hot-window cache cho cùng query liên tiếp", async () => {
		client.setPAT("test-token");
		const payload = {
			bars: [{ t: "2026-01-06T00:00:00Z", o: 101, h: 111, l: 96, c: 109, v: 1200 }],
			has_more_before: false,
			has_more_after: false,
			next_before: null,
			snapshot_id: "snap-2",
		};
		const fetchMock = vi.fn().mockResolvedValue({
			status: 200,
			ok: true,
			json: vi.fn().mockResolvedValue(payload),
		});
		vi.stubGlobal("fetch", fetchMock);

		await client.getBarsPage({ type: "init", symbol: "VCB", timeframe: "D", from: 1703808000000, to: 1704412800000, limit: 300 });
		await client.getBarsPage({ type: "init", symbol: "VCB", timeframe: "D", from: 1703808000000, to: 1704412800000, limit: 300 });

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(VNInvestClient.__getBarsHotWindowTelemetryForTests()).toMatchObject({
			networkRequests: 1,
			cacheHits: 1,
		});
	});

	it("getBarsPage không dùng cache khi anchor/direction khác", async () => {
		client.setPAT("test-token");
		const fetchMock = vi.fn().mockResolvedValue({
			status: 200,
			ok: true,
			json: vi.fn().mockResolvedValue({ bars: [], has_more_before: false, has_more_after: false, next_before: null, snapshot_id: null }),
		});
		vi.stubGlobal("fetch", fetchMock);

		await client.getBarsPage({ type: "backward", symbol: "VCB", timeframe: "D", before: 1704067200000, limit: 200 });
		await client.getBarsPage({ type: "backward", symbol: "VCB", timeframe: "D", before: 1703980800000, limit: 200 });

		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("getBarsPage fallback nextBefore về timestamp bar cũ nhất khi backend thiếu next_before", async () => {
		client.setPAT("test-token");
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
			status: 200,
			ok: true,
			json: vi.fn().mockResolvedValue({
				bars: [
					{ t: "2026-01-10T00:00:00Z", o: 1, h: 2, l: 0.5, c: 1.5, v: 10 },
					{ t: "2026-01-09T00:00:00Z", o: 1, h: 2, l: 0.5, c: 1.5, v: 10 },
				],
				has_more_before: true,
				has_more_after: false,
				snapshot_id: "snap-fallback",
			}),
		}));

		const response = await client.getBarsPage({
			type: "backward",
			symbol: "VCB",
			timeframe: "D",
			before: 1704800000000,
			limit: 200,
		});

		expect(response.hasMoreBefore).toBe(true);
		expect(response.nextBefore).toBe(new Date("2026-01-09T00:00:00Z").valueOf());
		expect(response.snapshotId).toBe("snap-fallback");
	});

	it("getBarsPage buộc nextBefore=null khi has_more_before=false", async () => {
		client.setPAT("test-token");
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
			status: 200,
			ok: true,
			json: vi.fn().mockResolvedValue({
				bars: [{ t: "2026-01-08T00:00:00Z", o: 1, h: 2, l: 0.5, c: 1.5, v: 10 }],
				has_more_before: false,
				has_more_after: false,
				next_before: 1690000000000,
			}),
		}));

		const response = await client.getBarsPage({
			type: "backward",
			symbol: "VCB",
			timeframe: "D",
			before: 1704800000000,
			limit: 200,
		});

		expect(response.hasMoreBefore).toBe(false);
		expect(response.nextBefore).toBeNull();
	});

	it.each([100, 1000])("getBarsPage collapse %i concurrent chart opens vào một request mạng", async (concurrency) => {
		VNInvestClient.__resetBarsHotWindowCacheForTests();
		client.setPAT("test-token");
		const telemetryBefore = VNInvestClient.getBarsHotWindowTelemetry();
		const payload = {
			bars: [{ t: "2026-01-07T00:00:00Z", o: 102, h: 112, l: 97, c: 110, v: 1300 }],
			has_more_before: true,
			has_more_after: false,
			next_before: 1699999999000,
			snapshot_id: "snap-load",
		};
		const fetchMock = vi.fn().mockImplementation(async () => ({
			status: 200,
			ok: true,
			json: async () => payload,
		}));
		vi.stubGlobal("fetch", fetchMock);

		const responses = await Promise.all(
			Array.from({ length: concurrency }, () => client.getBarsPage({
				type: "init",
				symbol: "VCB",
				timeframe: "D",
				from: 1703808000000,
				to: 1704412800000,
				limit: 300,
			})),
		);

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(responses).toHaveLength(concurrency);
		expect(responses.every((response) => response.snapshotId === "snap-load")).toBe(true);
		const telemetryAfter = VNInvestClient.getBarsHotWindowTelemetry();
		const telemetryDelta = diffBarsHotWindowTelemetry(telemetryBefore, telemetryAfter);
		expect(telemetryDelta).toMatchObject({
			networkRequests: 1,
			inFlightCollapses: concurrency - 1,
		});
		expect(evaluateBarsHotWindowLoadGate(telemetryDelta).status).toBe("healthy");
	});

	it("evaluateBarsHotWindowLoadGate trả warning khi sample chưa đủ lớn", () => {
		const report = evaluateBarsHotWindowLoadGate({
			cacheHits: 9,
			inFlightCollapses: 90,
			networkRequests: 1,
			lastUpdatedAt: Date.now(),
		}, {
			...DEFAULT_BARS_HOT_WINDOW_LOAD_GATE_THRESHOLDS,
			minimumObservedRequests: 200,
		});

		expect(report.status).toBe("warning");
		expect(report.reasons).toContain("insufficient-sample");
	});

	it("evaluateBarsHotWindowLoadGate không rollback khi telemetry chưa có sample", () => {
		const report = evaluateBarsHotWindowLoadGate({
			cacheHits: 0,
			inFlightCollapses: 0,
			networkRequests: 0,
			lastUpdatedAt: null,
		});

		expect(report.status).toBe("warning");
		expect(report.reasons).toEqual(["insufficient-sample"]);
	});

	it("evaluateBarsHotWindowLoadGate giữ warning cho sample dương nhưng chưa đủ ngưỡng", () => {
		const report = evaluateBarsHotWindowLoadGate({
			cacheHits: 0,
			inFlightCollapses: 0,
			networkRequests: 1,
			lastUpdatedAt: Date.now(),
		});

		expect(report.status).toBe("warning");
		expect(report.reasons).toContain("insufficient-sample");
		expect(report.reasons).toContain("warning-saved-request-ratio");
		expect(report.reasons).toContain("warning-network-request-ratio");
	});

	it("evaluateBarsHotWindowLoadGate trả rollback khi network requests chiếm tỷ lệ quá cao", () => {
		const report = evaluateBarsHotWindowLoadGate({
			cacheHits: 5,
			inFlightCollapses: 10,
			networkRequests: 85,
			lastUpdatedAt: Date.now(),
		});

		expect(report.status).toBe("rollback");
		expect(report.reasons).toContain("rollback-network-request-ratio");
	});
});

describe("VNInvestDataSource", () => {
	it("loadBars gọi getChart của client", async () => {
		vi.stubGlobal("localStorage", {
			getItem: vi.fn().mockReturnValue(null),
			setItem: vi.fn(),
		});
		vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("NETWORK_ERROR")));
		const client = new VNInvestClient();
		const ds = new VNInvestDataSource(client);
		await expect(ds.loadBars("VCB")).rejects.toThrow();
	});
});

describe("DemoDataSource", () => {
	it("loadBars trả non-empty array", async () => {
		const ds = new DemoDataSource();
		const bars = await ds.loadBars("BTCUSDT");
		expect(bars.length).toBeGreaterThan(0);
	});

	it("searchSymbols trả array có shape đúng", async () => {
		const ds = new DemoDataSource();
		const results = await ds.searchSymbols("BTC");
		expect(results[0]).toHaveProperty("symbol");
	});
});
