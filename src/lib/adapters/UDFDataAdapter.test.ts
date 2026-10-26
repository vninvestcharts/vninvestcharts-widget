import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UDFDataAdapter } from "./UDFDataAdapter";

describe("UDFDataAdapter", () => {
	const mockBaseUrl = "http://mock-udf-server.local";
	let adapter: UDFDataAdapter;

	beforeEach(() => {
		adapter = new UDFDataAdapter({ baseUrl: mockBaseUrl });
		vi.stubGlobal("fetch", vi.fn());
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("fetches bars in range correctly", async () => {
		const mockResponse = {
			s: "ok",
			t: [1600000000, 1600086400],
			o: [100, 101],
			h: [102, 103],
			l: [99, 100],
			c: [101, 102],
			v: [1000, 1100],
		};

		vi.mocked(fetch).mockResolvedValueOnce({
			ok: true,
			json: async () => mockResponse,
		} as unknown as Response);

		const from = new Date(1600000000 * 1000);
		const to = new Date(1600086400 * 1000);
		const bars = await adapter.fetchBarsInRange("AAPL", "1D", from, to);

		expect(fetch).toHaveBeenCalledWith(
			"http://mock-udf-server.local/history?symbol=AAPL&resolution=D&from=1600000000&to=1600086400",
		);
		expect(bars).toHaveLength(2);
		expect(bars[0]).toEqual({
			date: new Date(1600000000 * 1000),
			open: 100,
			high: 102,
			low: 99,
			close: 101,
			volume: 1000,
			index: 0,
			dataIndex: 0,
		});
	});

	it("fetches bars before an anchor correctly", async () => {
		const mockResponse = {
			s: "ok",
			t: [1599913600],
			o: [98],
			h: [99],
			l: [97],
			c: [98],
			v: [900],
		};

		vi.mocked(fetch).mockResolvedValueOnce({
			ok: true,
			json: async () => mockResponse,
		} as unknown as Response);

		const before = new Date(1600000000 * 1000);
		const bars = await adapter.fetchBarsBefore("AAPL", "1D", before, 5);

		expect(fetch).toHaveBeenCalledWith(
			"http://mock-udf-server.local/history?symbol=AAPL&resolution=D&to=1600000000&countback=5",
		);
		expect(bars).toHaveLength(1);
	});

	it("searches symbols using UDF standard query", async () => {
		const mockSearchResponse = [
			{
				symbol: "AAPL",
				description: "Apple Inc.",
				exchange: "NASDAQ",
			},
		];

		vi.mocked(fetch).mockResolvedValueOnce({
			ok: true,
			json: async () => mockSearchResponse,
		} as unknown as Response);

		const results = await adapter.searchSymbols("AAPL");
		expect(fetch).toHaveBeenCalledWith("http://mock-udf-server.local/search?query=AAPL");
		expect(results).toEqual([
			{
				symbol: "AAPL",
				name: "Apple Inc.",
				exchange: "NASDAQ",
			},
		]);
	});
});
