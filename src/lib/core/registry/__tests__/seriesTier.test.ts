import { describe, expect, it } from "vitest";
import {
	filterAvailableSeries,
	getSeriesTier,
	isSeriesAvailableForTier,
	registerPhaseOneSeries,
	toSeriesTier,
} from "../SeriesRegistry";
import type { SeriesConfig } from "../../types/pane-descriptor";

registerPhaseOneSeries();

describe("series tier gating (S3b)", () => {
	it("defaults unmarked series to free", () => {
		expect(getSeriesTier("RSI")).toBe("free");
		expect(getSeriesTier("MACD")).toBe("free");
		expect(isSeriesAvailableForTier("RSI", "free")).toBe(true);
	});

	it("P0-b: VolumeProfile is Community; MarketProfile stays pro", () => {
		// Community since P0-b (2026-10-15): engine capabilities.ts:138 declares
		// volume_profile as "none" and explains that gating it is a Rule 15 violation.
		expect(getSeriesTier("VolumeProfile")).toBe("free");
		expect(getSeriesTier("MarketProfile")).toBe("pro");
		expect(isSeriesAvailableForTier("VolumeProfile", "free"), "free must now get VolumeProfile").toBe(true);
		expect(isSeriesAvailableForTier("MarketProfile", "free"), "MarketProfile stays paid").toBe(false);
		expect(isSeriesAvailableForTier("MarketProfile", "enterprise")).toBe(true);
	});

	it("P0-b: Footprint is Community; DeltaProfile stays enterprise", () => {
		// Community since P0-b: engine capabilities.ts:139 declares volume_footprint as
		// "none". Its DEVICE_HEAVY degrade for narrow viewports is untouched.
		expect(getSeriesTier("Footprint")).toBe("free");
		expect(getSeriesTier("DeltaProfile")).toBe("enterprise");
		expect(isSeriesAvailableForTier("Footprint", "free"), "free must now get Footprint").toBe(true);
		expect(isSeriesAvailableForTier("DeltaProfile", "free"), "DeltaProfile stays paid").toBe(false);
		expect(isSeriesAvailableForTier("DeltaProfile", "enterprise")).toBe(true);
	});

	it("toSeriesTier maps 7 PAT levels to 3 series tiers (S5b)", () => {
		expect(toSeriesTier("pro")).toBe("pro");
		expect(toSeriesTier("enterprise")).toBe("enterprise");
		expect(toSeriesTier("custom")).toBe("enterprise");
		expect(toSeriesTier("internal")).toBe("enterprise");
		expect(toSeriesTier("free")).toBe("free");
		expect(toSeriesTier("starter")).toBe("free");
		expect(toSeriesTier("none")).toBe("free");
		expect(toSeriesTier(null)).toBe("free");
		expect(toSeriesTier(undefined)).toBe("free");
	});

	it("filterAvailableSeries drops locked types per tier (S3b-1 render-gate)", () => {
		const mk = (type: string) => ({ type, yAxis: "right", params: {} }) as SeriesConfig;
		const all = ["RSI", "VolumeProfile", "MarketProfile", "Footprint", "DeltaProfile"].map(mk);
		// P0-b: VolumeProfile and Footprint are Community, so free now keeps them alongside RSI.
		expect(filterAvailableSeries(all, "free").map((s) => String(s.type))).toEqual([
			"RSI",
			"VolumeProfile",
			"Footprint",
		]);
		expect(filterAvailableSeries(all, "pro").map((s) => String(s.type))).toEqual([
			"RSI",
			"VolumeProfile",
			"MarketProfile",
			"Footprint",
		]);
		expect(filterAvailableSeries(all, "enterprise")).toHaveLength(5);
		expect(filterAvailableSeries([{ type: "Nope", yAxis: "right", params: {} } as never], "enterprise")).toEqual([]);
	});
});
