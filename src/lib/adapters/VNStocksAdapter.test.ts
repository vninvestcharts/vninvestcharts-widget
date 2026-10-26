import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VNStocksAdapter } from "./VNStocksAdapter";

interface MockResponseInit {
	readonly ok?: boolean;
	readonly status?: number;
	readonly body: unknown;
}

function createResponse({ ok = true, status = 200, body }: MockResponseInit): Response {
	return {
		ok,
		status,
		json: async () => body,
	} as Response;
}

function createStorageMock(): Storage {
	const store = new Map<string, string>();

	return {
		get length() {
			return store.size;
		},
		clear() {
			store.clear();
		},
		getItem(key: string) {
			return store.has(key) ? store.get(key) ?? null : null;
		},
		key(index: number) {
			return Array.from(store.keys())[index] ?? null;
		},
		removeItem(key: string) {
			store.delete(key);
		},
		setItem(key: string, value: string) {
			store.set(key, value);
		},
	} satisfies Storage;
}

describe("VNStocksAdapter", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-05-21T00:00:00.000Z"));
		vi.stubGlobal("localStorage", createStorageMock());
		localStorage.clear();
	});

	afterEach(() => {
		vi.useRealTimers();
		localStorage.clear();
		delete (globalThis as typeof globalThis & { __VNI_API_BASE__?: string }).__VNI_API_BASE__;
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("requires PAT before requesting VNStocks chart data", async () => {
		const adapter = new VNStocksAdapter();

		await expect(adapter.getBars({
			type: "init",
			symbol: "TCB",
			interval: "D",
			timestamp: null,
			limit: 200,
		})).rejects.toThrow("NO_PAT");
	});

	it("maps latest chart bars from the protected OHLCV endpoint", async () => {
		localStorage.setItem("vni_pat", "demo-token");
		localStorage.setItem("vni_api_base", "https://api.example.com/");

		const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = new URL(input.toString());
			expect(url.origin).toBe("https://api.example.com");
			expect(url.pathname).toBe("/api/stock-management/stocks/TCB/chart/");
			expect(url.searchParams.get("timeframe")).toBe("1H");
			expect(url.searchParams.get("days")).toBe("1");
			expect((init?.headers as Record<string, string>)?.Authorization).toBe("Bearer demo-token");

			return createResponse({
				body: {
					points: [
						{ date: "2026-05-20T09:00:00.000Z", open: "10", high: "12", low: "9", close: "11", volume: "1000" },
						{ date: "2026-05-20T10:00:00.000Z", open: "11", high: "13", low: "10", close: "12", volume: "1100" },
						{ date: "2026-05-20T11:00:00.000Z", open: "12", high: "14", low: "11", close: "13", volume: "1200" },
					],
				},
			});
		});

		vi.stubGlobal("fetch", fetchMock);

		const adapter = new VNStocksAdapter();
		const result = await adapter.getBars({
			type: "init",
			symbol: "TCB",
			interval: "1H",
			timestamp: null,
			limit: 2,
		});

		expect(result.bars).toHaveLength(2);
		expect(result.bars[0]).toMatchObject({
			timestamp: new Date("2026-05-20T10:00:00.000Z").valueOf(),
			open: 11,
			high: 13,
			low: 10,
			close: 12,
			volume: 1100,
		});
		expect(result.bars[1]?.timestamp).toBe(new Date("2026-05-20T11:00:00.000Z").valueOf());
		expect(result.hasMore).toBe(true);
	});

	it("filters backward requests to older bars only", async () => {
		localStorage.setItem("vni_pat", "demo-token");
		(globalThis as typeof globalThis & { __VNI_API_BASE__?: string }).__VNI_API_BASE__ = "https://bridge.example.com";

		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = new URL(input.toString());
			expect(url.origin).toBe("https://bridge.example.com");
			expect(url.searchParams.get("timeframe")).toBe("D");
			expect(url.searchParams.get("days")).toBe("4");

			return createResponse({
				body: {
					points: [
						{ date: "2026-05-16T00:00:00.000Z", open: 10, high: 12, low: 9, close: 11, volume: 1000 },
						{ date: "2026-05-17T00:00:00.000Z", open: 11, high: 13, low: 10, close: 12, volume: 1100 },
						{ date: "2026-05-18T00:00:00.000Z", open: 12, high: 14, low: 11, close: 13, volume: 1200 },
						{ date: "2026-05-19T00:00:00.000Z", open: 13, high: 15, low: 12, close: 14, volume: 1300 },
					],
				},
			});
		});

		vi.stubGlobal("fetch", fetchMock);

		const adapter = new VNStocksAdapter();
		const result = await adapter.getBars({
			type: "backward",
			symbol: "TCB",
			interval: "D",
			timestamp: new Date("2026-05-19T00:00:00.000Z").valueOf(),
			limit: 2,
		});

		expect(result.bars.map((bar) => bar.timestamp)).toEqual([
			new Date("2026-05-17T00:00:00.000Z").valueOf(),
			new Date("2026-05-18T00:00:00.000Z").valueOf(),
		]);
		expect(result.hasMore).toBe(true);
	});

	it("rejects invalid symbols before sending a network request", async () => {
		localStorage.setItem("vni_pat", "demo-token");
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		const adapter = new VNStocksAdapter();

		await expect(adapter.getBars({
			type: "init",
			symbol: "../../etc/passwd",
			interval: "D",
			timestamp: null,
			limit: 10,
		})).rejects.toThrow("symbol không hợp lệ");
		expect(fetchMock).not.toHaveBeenCalled();
	});
});