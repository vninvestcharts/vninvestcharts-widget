// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	detectWhaleEvents,
	formatVolume,
	formatWhaleEvent,
	getBubbleColor,
	getBubbleRadius,
	getBubbleStrokeColor,
	type WhaleEvent,
} from "../whaleDetector";

describe("Whale Detection", () => {
	it("T1-01: detects whale events > threshold", () => {
		const data = [
			{
				whaleBuyVol: 2_000_000,
				whaleSellVol: 500_000,
				date: new Date("2026-05-10"),
			},
		];
		const events = detectWhaleEvents(data, 1_000_000);

		expect(events).toHaveLength(1);
		expect(events[0].index).toBe(0);
		expect(events[0].buyVol).toBe(2_000_000);
		expect(events[0].sellVol).toBe(500_000);
		expect(events[0].netDelta).toBe(1_500_000);
		expect(events[0].dominance).toBe("buy");
		expect(events[0].sizeCategory).toBe("large"); // 1.5M is 1.5x threshold (large ≤ 2.5x)
	});

	it("T1-02: filters events < threshold", () => {
		const data = [
			{
				whaleBuyVol: 1_200_000,
				whaleSellVol: 1_100_000,
				date: new Date("2026-05-10"),
			},
		];
		const events = detectWhaleEvents(data, 1_000_000);

		expect(events).toHaveLength(0); // 100K < 1M threshold
	});

	it("T1-03: categorizes sizes correctly", () => {
		const threshold = 1_000_000;
		const data = [
			// large: 1.2M (1.2x)
			{
				whaleBuyVol: 1_200_000,
				whaleSellVol: 0,
				date: new Date(),
			},
			// xlarge: 2.5M (2.5x)
			{
				whaleBuyVol: 2_500_000,
				whaleSellVol: 0,
				date: new Date(),
			},
			// mega: 5.5M (5.5x)
			{
				whaleBuyVol: 5_500_000,
				whaleSellVol: 0,
				date: new Date(),
			},
		];

		const events = detectWhaleEvents(data, threshold);
		expect(events).toHaveLength(3);
		expect(events[0].sizeCategory).toBe("large");
		expect(events[1].sizeCategory).toBe("xlarge");
		expect(events[2].sizeCategory).toBe("mega");
	});

	it("T1-04: detects sell dominance", () => {
		const data = [
			{
				whaleBuyVol: 500_000,
				whaleSellVol: 2_000_000,
				date: new Date(),
			},
		];

		const events = detectWhaleEvents(data, 1_000_000);
		expect(events).toHaveLength(1);
		expect(events[0].dominance).toBe("sell");
		expect(events[0].netDelta).toBe(-1_500_000);
	});

	it("T1-05: handles missing data gracefully", () => {
		const data = [
			{ date: new Date() }, // no whale volumes
			{
				whaleBuyVol: 2_000_000,
				date: new Date(),
			}, // missing sell vol
		];

		const events = detectWhaleEvents(data, 1_000_000);
		// First: treated as (0, 0) = no event
		// Second: treated as (2M, 0) = 2M event
		expect(events).toHaveLength(1);
	});
});

describe("Volume Formatting", () => {
	it("T1-06: formats millions correctly", () => {
		expect(formatVolume(1_500_000)).toBe("1.5M");
		expect(formatVolume(2_000_000)).toBe("2.0M");
	});

	it("T1-07: formats thousands correctly", () => {
		expect(formatVolume(500_000)).toBe("500K");
		expect(formatVolume(1_000)).toBe("1K");
	});

	it("T1-08: formats small numbers as-is", () => {
		expect(formatVolume(999)).toBe("999");
		expect(formatVolume(0)).toBe("0");
	});
});

describe("Whale Event Formatting", () => {
	it("T1-09: formats buy event", () => {
		const event: WhaleEvent = {
			index: 0,
			date: new Date(),
			buyVol: 1_500_000,
			sellVol: 500_000,
			netDelta: 1_000_000,
			dominance: "buy",
			sizeCategory: "xlarge",
		};

		expect(formatWhaleEvent(event)).toBe("BUY 1.0M");
	});

	it("T1-10: formats sell event", () => {
		const event: WhaleEvent = {
			index: 5,
			date: new Date(),
			buyVol: 300_000,
			sellVol: 2_000_000,
			netDelta: -1_700_000,
			dominance: "sell",
			sizeCategory: "xlarge",
		};

		expect(formatWhaleEvent(event)).toBe("SELL 1.7M");
	});
});

describe("Bubble Styling", () => {
	it("T1-11: returns correct radius for size category", () => {
		expect(getBubbleRadius("large")).toBe(10);
		expect(getBubbleRadius("xlarge")).toBe(14);
		expect(getBubbleRadius("mega")).toBe(18);
	});

	it("T1-12: returns correct color for dominance", () => {
		expect(getBubbleColor("buy")).toBe("rgba(34,139,34,0.4)");
		expect(getBubbleColor("sell")).toBe("rgba(178,34,34,0.4)");
		expect(getBubbleColor("buy", 0.6)).toBe("rgba(34,139,34,0.6)");
	});

	it("T1-13: returns correct stroke color", () => {
		expect(getBubbleStrokeColor("buy")).toBe("#22AA44");
		expect(getBubbleStrokeColor("sell")).toBe("#CC4444");
	});
});
