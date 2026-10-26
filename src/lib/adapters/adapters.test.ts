import { afterEach, describe, expect, it, vi } from "vitest";
import type { OHLCVBar } from "../types/ohlcv";
import { DjangoVnstockAdapter } from "./DjangoVnstockAdapter";
import { MockAdapter } from "./MockAdapter";

const from = new Date("2024-01-10T00:00:00.000Z");
const to = new Date("2024-01-12T00:00:00.000Z");

const sampleBars = [
	{
		date: "2024-01-10T00:00:00.000Z",
		open: 10,
		high: 12,
		low: 9,
		close: 11,
		volume: 100,
	},
	{
		date: "2024-01-11T00:00:00.000Z",
		open: 11,
		high: 13,
		low: 10,
		close: 12,
		volume: 110,
	},
] satisfies Array<Omit<OHLCVBar, "date" | "index" | "dataIndex"> & { date: string }>;

const sampleSymbols = [
	{ symbol: "VCB", name: "Vietcombank", exchange: "HOSE" },
	{ symbol: "FPT", name: "FPT Corporation", exchange: "HOSE" },
] as const;

class MockSocket {
	static instances: MockSocket[] = [];

	url: string;
	closed = false;
	onmessage: ((event: MessageEvent<string>) => void) | null = null;

	constructor(url: string) {
		this.url = url;
		MockSocket.instances.push(this);
	}

	emit(payload: unknown) {
		this.onmessage?.({ data: JSON.stringify(payload) } as MessageEvent<string>);
	}

	close() {
		this.closed = true;
	}
}

function createResponse(body: unknown) {
	return {
		ok: true,
		status: 200,
		json: async () => body,
	} as Response;
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	MockSocket.instances = [];
});

describe("MockAdapter", () => {
	it("returns OHLCV bars and supports history navigation", async () => {
		const adapter = new MockAdapter({ intervalMs: 5 });

		const bars = await adapter.fetchBars("VCB", "1D", from, to);
		const moreBars = await adapter.fetchMoreBars("VCB", "1D", from, 5);

		expect(bars.length).toBeGreaterThan(0);
		expect(bars[0].date).toBeInstanceOf(Date);
		expect(moreBars.length).toBeLessThanOrEqual(5);
		expect(moreBars.every((bar) => bar.date < from)).toBe(true);
	});

	it("supports symbol search and realtime subscriptions", async () => {
		const adapter = new MockAdapter({ intervalMs: 5 });
		const onBar = vi.fn();
		const onTrade = vi.fn();
		const onOrderbook = vi.fn();

		expect(await adapter.searchSymbols("vc")).toEqual([
			{ symbol: "VCB", name: "Vietcombank", exchange: "HOSE" },
		]);

		const unsubscribeBar = adapter.subscribeToBar("VCB", "1D", onBar);
		const unsubscribeTrades = adapter.subscribeToTrades("VCB", onTrade);
		const unsubscribeOrderbook = adapter.subscribeToOrderbook("VCB", onOrderbook);

		expect(onBar).toHaveBeenCalledTimes(1);
		expect(onTrade).toHaveBeenCalledTimes(1);
		expect(onOrderbook).toHaveBeenCalledTimes(1);
		expect(typeof unsubscribeBar).toBe("function");
		expect(typeof unsubscribeTrades).toBe("function");
		expect(typeof unsubscribeOrderbook).toBe("function");

		unsubscribeBar();
		unsubscribeTrades();
		unsubscribeOrderbook();
	});
});

describe("DjangoVnstockAdapter", () => {
	it("maps REST and websocket payloads into the adapter contract", async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = input.toString();
			if (url.includes("/api/bars/VCB/")) {
				return createResponse(sampleBars);
			}
			if (url.includes("/api/symbols/search/")) {
				return createResponse(sampleSymbols);
			}
			throw new Error(`Unexpected URL: ${url}`);
		});

		vi.stubGlobal("fetch", fetchMock);
		vi.stubGlobal("WebSocket", MockSocket as unknown as typeof WebSocket);

		const adapter = new DjangoVnstockAdapter("https://api.example.com", 1_000);

		const bars = await adapter.fetchBarsInRange("VCB", "1D", from, to);
		expect(fetchMock).toHaveBeenCalledWith(
			"https://api.example.com/api/bars/VCB/?tf=1D&from=2024-01-10T00%3A00%3A00.000Z&to=2024-01-12T00%3A00%3A00.000Z",
			undefined,
		);
		expect(bars).toHaveLength(2);
		expect(bars[0].date).toBeInstanceOf(Date);
		expect(bars[0].index).toBe(0);

		const moreBars = await adapter.fetchBarsBefore("VCB", "1D", from, 1);
		expect(moreBars).toHaveLength(2);

		const symbols = await adapter.searchSymbols("VC");
		expect(symbols).toEqual(sampleSymbols);

		const onBar = vi.fn();
		const onTrade = vi.fn();
		const onOrderbook = vi.fn();

		const unsubscribeBar = adapter.subscribeToBar("VCB", "1D", onBar);
		const unsubscribeTrades = adapter.subscribeToTrades("VCB", onTrade);
		const unsubscribeOrderbook = adapter.subscribeToOrderbook("VCB", onOrderbook);

		expect(MockSocket.instances).toHaveLength(3);
		MockSocket.instances[0].emit({
			date: "2024-01-15T00:00:00.000Z",
			open: 20,
			high: 21,
			low: 19,
			close: 20.5,
			volume: 300,
		});
		MockSocket.instances[1].emit({
			symbol: "VCB",
			price: 20.5,
			size: 200,
			timestamp: "2024-01-15T00:00:00.000Z",
			side: "buy",
		});
		MockSocket.instances[2].emit({
			timestamp: "2024-01-15T00:00:00.000Z",
			bids: [{ price: 20, size: 100 }],
			asks: [{ price: 21, size: 80 }],
		});

		expect(onBar).toHaveBeenCalledTimes(1);
		expect(onTrade).toHaveBeenCalledTimes(1);
		expect(onOrderbook).toHaveBeenCalledTimes(1);
		expect(onBar.mock.calls[0]?.[0].date).toBeInstanceOf(Date);
		expect(onTrade.mock.calls[0]?.[0].timestamp).toBeInstanceOf(Date);
		expect(onOrderbook.mock.calls[0]?.[0].timestamp).toBeInstanceOf(Date);

		unsubscribeBar();
		unsubscribeTrades();
		unsubscribeOrderbook();
		expect(MockSocket.instances.every((socket) => socket.closed)).toBe(true);
	});
});
