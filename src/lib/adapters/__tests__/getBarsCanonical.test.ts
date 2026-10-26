/**
 * Tests for CanonicalFetchResult / getBarsCanonical coverage fragments.
 *
 * Each adapter must:
 * 1. Expose getBarsCanonical() that returns bars + coverage
 * 2. Coverage fragments accurately describe what was fetched and what is unresolved
 *
 * BU-01-02 acceptance criteria:
 * - BinanceAdapter: exact-range source — covered fragment + boundary-exhausted when hasMore=false
 * - LocalCacheAdapter: finite-snapshot source — always boundary-exhausted before oldest bar
 * - VNStocksAdapter: window-hint source — covered + boundary-exhausted when exhausted
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { GetBarsParams, KLineBar } from "../DataAdapter";
import { BinanceAdapter } from "../BinanceAdapter";
import { LocalCacheAdapter } from "../LocalCacheAdapter";
import { VNStocksAdapter } from "../VNStocksAdapter";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function makeBar(ts: number): KLineBar {
	return { timestamp: ts, open: 1, high: 2, low: 0.5, close: 1.5, volume: 100 };
}

const BASE_PARAMS: GetBarsParams = {
	type: "backward",
	symbol: "BTCUSDT",
	interval: "1h",
	timestamp: 2000,
	limit: 5,
};

// ---------------------------------------------------------------------------
// BinanceAdapter
// ---------------------------------------------------------------------------

describe("BinanceAdapter.getBarsCanonical", () => {
	let adapter: BinanceAdapter;

	beforeEach(() => {
		adapter = new BinanceAdapter();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("returns covered fragment for a normal page of results", async () => {
		const bars = [makeBar(100), makeBar(200), makeBar(300)];
		vi.spyOn(adapter, "getBars").mockResolvedValue({ bars, hasMore: true });

		const result = await adapter.getBarsCanonical!(BASE_PARAMS);

		expect(result.bars).toHaveLength(3);
		expect(result.coverage).toHaveLength(1);
		expect(result.coverage[0]).toMatchObject({ fromTs: 100, toTs: 300, status: "covered" });
	});

	it("prepends boundary-exhausted fragment when hasMore is false", async () => {
		const bars = [makeBar(100), makeBar(200)];
		vi.spyOn(adapter, "getBars").mockResolvedValue({ bars, hasMore: false });

		const result = await adapter.getBarsCanonical!(BASE_PARAMS);

		expect(result.coverage).toHaveLength(2);
		expect(result.coverage[0]).toMatchObject({ status: "unresolved", reason: "boundary-exhausted" });
		expect(result.coverage[0].toTs).toBe(100);
		expect(result.coverage[1]).toMatchObject({ fromTs: 100, toTs: 200, status: "covered" });
	});

	it("returns source-no-data unresolved when bars empty on init", async () => {
		vi.spyOn(adapter, "getBars").mockResolvedValue({ bars: [], hasMore: false });
		const initParams: GetBarsParams = { ...BASE_PARAMS, type: "init", timestamp: null };

		const result = await adapter.getBarsCanonical!(initParams);

		expect(result.coverage).toHaveLength(1);
		expect(result.coverage[0]).toMatchObject({ status: "unresolved", reason: "source-no-data" });
	});

	it("returns boundary-exhausted when bars empty on backward fetch", async () => {
		vi.spyOn(adapter, "getBars").mockResolvedValue({ bars: [], hasMore: false });

		const result = await adapter.getBarsCanonical!(BASE_PARAMS);

		expect(result.coverage).toHaveLength(1);
		expect(result.coverage[0]).toMatchObject({ status: "unresolved", reason: "boundary-exhausted" });
		expect(result.coverage[0].toTs).toBe(2000);
	});
});

// ---------------------------------------------------------------------------
// LocalCacheAdapter
// ---------------------------------------------------------------------------

describe("LocalCacheAdapter.getBarsCanonical", () => {
	let adapter: LocalCacheAdapter;

	beforeEach(() => {
		adapter = new LocalCacheAdapter();
	});

	it("includes covered + boundary-exhausted fragments when bars exist", async () => {
		adapter.loadBars("BTCUSDT", "1h", [makeBar(1000), makeBar(2000), makeBar(3000)]);
		const params: GetBarsParams = { type: "backward", symbol: "BTCUSDT", interval: "1h", timestamp: 5000, limit: 10 };

		const result = await adapter.getBarsCanonical!(params);

		expect(result.bars).toHaveLength(3);
		expect(result.coverage).toHaveLength(2);
		expect(result.coverage[0]).toMatchObject({ status: "unresolved", reason: "boundary-exhausted", toTs: 1000 });
		expect(result.coverage[1]).toMatchObject({ fromTs: 1000, toTs: 3000, status: "covered" });
	});

	it("returns only boundary-exhausted when no bars in cache", async () => {
		const params: GetBarsParams = { type: "backward", symbol: "UNKNOWN", interval: "1h", timestamp: 9999, limit: 5 };

		const result = await adapter.getBarsCanonical!(params);

		expect(result.bars).toHaveLength(0);
		expect(result.coverage).toHaveLength(1);
		expect(result.coverage[0]).toMatchObject({ status: "unresolved", reason: "boundary-exhausted", toTs: 9999 });
	});

	it("coverage boundary-exhausted toTs = anchor timestamp on backward fetch", async () => {
		adapter.loadBars("BTCUSDT", "1h", [makeBar(100)]);
		const params: GetBarsParams = { type: "backward", symbol: "BTCUSDT", interval: "1h", timestamp: 500, limit: 10 };

		const result = await adapter.getBarsCanonical!(params);

		expect(result.coverage[0].toTs).toBe(100); // boundary is the oldest bar, not the anchor
	});
});

// ---------------------------------------------------------------------------
// VNStocksAdapter — coverage shape
// ---------------------------------------------------------------------------

describe("VNStocksAdapter.getBarsCanonical (coverage shape)", () => {
	let adapter: VNStocksAdapter;

	beforeEach(() => {
		adapter = new VNStocksAdapter();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("returns covered fragment for a result with more data available", async () => {
		const bars = [makeBar(1000), makeBar(2000)];
		vi.spyOn(adapter, "getBars").mockResolvedValue({ bars, hasMore: true });

		const result = await adapter.getBarsCanonical!(BASE_PARAMS);

		expect(result.coverage).toHaveLength(1);
		expect(result.coverage[0]).toMatchObject({ fromTs: 1000, toTs: 2000, status: "covered" });
	});

	it("prepends boundary-exhausted when hasMore is false", async () => {
		const bars = [makeBar(500), makeBar(1500)];
		vi.spyOn(adapter, "getBars").mockResolvedValue({ bars, hasMore: false });

		const result = await adapter.getBarsCanonical!(BASE_PARAMS);

		expect(result.coverage).toHaveLength(2);
		expect(result.coverage[0]).toMatchObject({ status: "unresolved", reason: "boundary-exhausted", toTs: 500 });
		expect(result.coverage[1]).toMatchObject({ fromTs: 500, toTs: 1500, status: "covered" });
	});
});
