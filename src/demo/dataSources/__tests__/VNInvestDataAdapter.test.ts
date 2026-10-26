/**
 * Slice H — Task H-08: Tests H-T01 → H-T12
 * Tests for VNInvestDataAdapter covering whale events, dark flow, and edge cases.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { VNInvestDataAdapter } from "../VNInvestDataAdapter";
import type { VNInvestClient } from "../../../widget/adapters/VNInvestClient";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeWhaleOrder(overrides: Partial<{
	ts: string;
	side: "buy" | "sell";
	price: number;
	volume: number;
	matched_value: number;
	size_class: "small" | "shark" | "whale";
}> = {}) {
	return {
		ts: "2026-06-08T10:00:00.000Z",
		side: "buy" as const,
		price: 50_000,
		volume: 10_000,
		matched_value: 5_000_000,
		size_class: "shark" as const,
		...overrides,
	};
}

function makeMockClient(overrides: Partial<{
	getWhaleFeed: ReturnType<typeof vi.fn>;
	getOrderFlow: ReturnType<typeof vi.fn>;
}> = {}): VNInvestClient {
	return {
		getWhaleFeed: vi.fn().mockResolvedValue({
			symbol: "VCB",
			whale_orders: [],
			summary: {
				buy_value: 0,
				sell_value: 0,
				shark_buy: 0,
				shark_sell: 0,
				whale_buy: 0,
				whale_sell: 0,
				small_buy: 0,
				small_sell: 0,
			},
		}),
		getOrderFlow: vi.fn().mockResolvedValue(null),
		...overrides,
	} as unknown as VNInvestClient;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("VNInvestDataAdapter — H-08 tests", () => {
	let adapter: VNInvestDataAdapter;
	let mockClient: VNInvestClient;

	beforeEach(() => {
		mockClient = makeMockClient();
		adapter = new VNInvestDataAdapter(mockClient);
	});

	// H-T01: getWhaleEvents maps whale_orders correctly
	it("H-T01: getWhaleEvents maps whale_orders to WhaleEvent shape", async () => {
		vi.mocked(mockClient.getWhaleFeed).mockResolvedValue({
			symbol: "VCB",
			whale_orders: [makeWhaleOrder({ matched_value: 10_000_000, side: "buy", price: 48_500 })],
			summary: {} as never,
		});

		const events = await adapter.getWhaleEvents("VCB");
		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({
			ts: "2026-06-08T10:00:00.000Z",
			side: "buy",
			value: 10_000_000,
			severity: "shark",
			price: 48_500,
		});
		expect(events[0].score).toBeGreaterThan(0);
		expect(events[0].score).toBeLessThanOrEqual(1);
	});

	// H-T02: getWhaleEvents filters below default threshold
	it("H-T02: getWhaleEvents excludes orders below threshold (1M default)", async () => {
		vi.mocked(mockClient.getWhaleFeed).mockResolvedValue({
			symbol: "VCB",
			whale_orders: [
				makeWhaleOrder({ matched_value: 500_000 }),  // below threshold
				makeWhaleOrder({ matched_value: 2_000_000 }), // above threshold
			],
			summary: {} as never,
		});

		const events = await adapter.getWhaleEvents("VCB");
		expect(events).toHaveLength(1);
		expect(events[0].value).toBe(2_000_000);
	});

	// H-T03: getWhaleEvents with empty whale_orders returns []
	it("H-T03: getWhaleEvents with empty whale_orders returns []", async () => {
		const events = await adapter.getWhaleEvents("VCB");
		expect(events).toEqual([]);
	});

	// H-T04: getWhaleEvents returns [] when network throws
	it("H-T04: getWhaleEvents returns [] on network error", async () => {
		vi.mocked(mockClient.getWhaleFeed).mockRejectedValue(new Error("NETWORK_ERROR"));
		const events = await adapter.getWhaleEvents("VCB");
		expect(events).toEqual([]);
	});

	// H-T05: getWhaleEvents respects custom threshold
	it("H-T05: getWhaleEvents respects custom threshold option", async () => {
		vi.mocked(mockClient.getWhaleFeed).mockResolvedValue({
			symbol: "VCB",
			whale_orders: [
				makeWhaleOrder({ matched_value: 3_000_000 }),  // above 1M, below 5M
				makeWhaleOrder({ matched_value: 10_000_000 }), // above 5M
			],
			summary: {} as never,
		});

		const events = await adapter.getWhaleEvents("VCB", { threshold: 5_000_000 });
		expect(events).toHaveLength(1);
		expect(events[0].value).toBe(10_000_000);
	});

	// H-T06: getWhaleEvents respects `since` filter
	it("H-T06: getWhaleEvents filters by `since` timestamp", async () => {
		const oldTs = "2026-06-07T09:00:00.000Z";
		const newTs = "2026-06-08T10:00:00.000Z";
		vi.mocked(mockClient.getWhaleFeed).mockResolvedValue({
			symbol: "VCB",
			whale_orders: [
				makeWhaleOrder({ ts: oldTs, matched_value: 5_000_000 }),
				makeWhaleOrder({ ts: newTs, matched_value: 5_000_000 }),
			],
			summary: {} as never,
		});

		const cutoff = new Date("2026-06-08T00:00:00.000Z").getTime();
		const events = await adapter.getWhaleEvents("VCB", { since: cutoff });
		expect(events).toHaveLength(1);
		expect(events[0].ts).toBe(newTs);
	});

	// H-T07: severity mapping
	it("H-T07: severity mapping matches size_class from API", async () => {
		vi.mocked(mockClient.getWhaleFeed).mockResolvedValue({
			symbol: "VCB",
			whale_orders: [
				makeWhaleOrder({ size_class: "whale", matched_value: 50_000_000 }),
				makeWhaleOrder({ size_class: "shark", matched_value: 5_000_000 }),
				makeWhaleOrder({ size_class: "small", matched_value: 1_500_000 }),
			],
			summary: {} as never,
		});

		const events = await adapter.getWhaleEvents("VCB");
		expect(events.map((e) => e.severity)).toEqual(["whale", "shark", "small"]);
	});

	// H-T08: score normalised to 0-1
	it("H-T08: score is normalised to [0, 1]", async () => {
		vi.mocked(mockClient.getWhaleFeed).mockResolvedValue({
			symbol: "VCB",
			whale_orders: [
				makeWhaleOrder({ matched_value: 1_000_000 }),   // exactly threshold → score 0.1
				makeWhaleOrder({ matched_value: 100_000_000 }), // very large → score 1 (clamped)
			],
			summary: {} as never,
		});

		const events = await adapter.getWhaleEvents("VCB");
		expect(events[0].score).toBeCloseTo(0.1, 5);
		expect(events[1].score).toBe(1);
	});

	// H-T09: getDarkFlowStrength returns DarkFlowResult from getOrderFlow
	it("H-T09: getDarkFlowStrength returns dark_flow from order flow response", async () => {
		vi.mocked(mockClient.getOrderFlow).mockResolvedValue({
			ok: true,
			symbol: "VCB",
			window: "30m",
			cvd_series: [],
			dark_flow: {
				signal_type: "iceberg",
				strength: 72,
				confidence: 0.85,
			},
		} as never);

		const result = await adapter.getDarkFlowStrength("VCB");
		expect(result).not.toBeNull();
		expect(result!.signal_type).toBe("iceberg");
		expect(result!.strength).toBe(72);
	});

	// H-T10: getDarkFlowStrength returns null when getOrderFlow returns null
	it("H-T10: getDarkFlowStrength returns null when order flow is null", async () => {
		vi.mocked(mockClient.getOrderFlow).mockResolvedValue(null);
		const result = await adapter.getDarkFlowStrength("VCB");
		expect(result).toBeNull();
	});

	// H-T11: getDarkFlowStrength returns null on network error
	it("H-T11: getDarkFlowStrength returns null on network error", async () => {
		vi.mocked(mockClient.getOrderFlow).mockRejectedValue(new Error("TIMEOUT"));
		const result = await adapter.getDarkFlowStrength("VCB");
		expect(result).toBeNull();
	});

	// H-T12: getDarkFlowSignalType defaults to "none" when no data
	it("H-T12: getDarkFlowSignalType returns 'none' when no dark_flow data", async () => {
		vi.mocked(mockClient.getOrderFlow).mockResolvedValue(null);
		const signal = await adapter.getDarkFlowSignalType("VCB");
		expect(signal).toBe("none");
	});
});
