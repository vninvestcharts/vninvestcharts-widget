import { describe, it, expect } from "vitest";
import { computeVolumeProfileAsync } from "../VolumeProfileWorker";
import { computeVolumeProfile } from "../../utils";

function makeBar(open: number, high: number, low: number, close: number, volume: number, date?: Date) {
	return {
		open,
		high,
		low,
		close,
		volume,
		date: date ?? new Date(),
	};
}

describe("VolumeProfileWorker Async Integration", () => {
	it("correctly computes Volume Profile using async utility", async () => {
		const bars = [
			makeBar(100, 102, 98, 101, 1000),
			makeBar(101, 103, 99, 102, 2000),
		];

		const asyncResult = await computeVolumeProfileAsync(bars, 1);
		const syncResult = computeVolumeProfile(bars, 1);

		expect(asyncResult.priceLevels).toHaveLength(syncResult.priceLevels.length);
		expect(asyncResult.poc).toBe(syncResult.poc);
		expect(asyncResult.valueAreaHigh).toBe(syncResult.valueAreaHigh);
		expect(asyncResult.valueAreaLow).toBe(syncResult.valueAreaLow);
		expect(asyncResult.highVolumeNodes).toEqual(syncResult.highVolumeNodes);
		expect(asyncResult.lowVolumeNodes).toEqual(syncResult.lowVolumeNodes);
	});

	it("returns empty structure for empty data", async () => {
		const result = await computeVolumeProfileAsync([], 1);
		expect(result.priceLevels).toHaveLength(0);
		expect(result.poc).toBe(0);
		expect(result.valueAreaHigh).toBe(0);
		expect(result.valueAreaLow).toBe(0);
	});
});
