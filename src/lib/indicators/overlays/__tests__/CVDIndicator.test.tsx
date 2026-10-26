// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { CVDIndicator, type CVDIndicatorProps } from "../CVDIndicator";
import type { EnrichedDatum } from "../../../core/calculators/types";

describe("CVDIndicator", () => {
	it("T5-01: renders without error with valid data", () => {
		const data: EnrichedDatum[] = [
			{
				date: new Date(),
				open: 100,
				high: 105,
				low: 95,
				close: 102,
				volume: 1000,
				cvdApprox: 200,
			} as any,
		];

		const visibleRange = {
			startIndex: 0,
			endIndex: 0,
			startDate: new Date(),
			endDate: new Date(),
			timeRange: { from: Date.now(), to: Date.now() },
			barCount: 1,
		};

		const props: CVDIndicatorProps = {
			data,
			visibleRange,
			mode: "oscillator",
		};

		expect(() => {
			const elem = <CVDIndicator {...props} />;
			expect(elem).toBeDefined();
		}).not.toThrow();
	});

	it("T5-02: handles null visible range gracefully", () => {
		const data: EnrichedDatum[] = [
			{
				date: new Date(),
				open: 100,
				high: 105,
				low: 95,
				close: 102,
				volume: 1000,
				cvdApprox: 200,
			} as any,
		];

		const props: CVDIndicatorProps = {
			data,
			visibleRange: null,
			mode: "oscillator",
		};

		expect(() => {
			const elem = <CVDIndicator {...props} />;
			expect(elem).toBeDefined();
		}).not.toThrow();
	});

	it("T5-03: handles empty data gracefully", () => {
		const props: CVDIndicatorProps = {
			data: [],
			visibleRange: {
				startIndex: 0,
				endIndex: 10,
				startDate: new Date(),
				endDate: new Date(),
				timeRange: { from: Date.now(), to: Date.now() },
				barCount: 11,
			},
			mode: "oscillator",
		};

		expect(() => {
			const elem = <CVDIndicator {...props} />;
			expect(elem).toBeDefined();
		}).not.toThrow();
	});

	it("T5-04: renders with different modes", () => {
		const data: EnrichedDatum[] = [
			{
				date: new Date(),
				open: 100,
				high: 105,
				low: 95,
				close: 102,
				volume: 1000,
				cvdApprox: 200,
			} as any,
		];

		const visibleRange = {
			startIndex: 0,
			endIndex: 0,
			startDate: new Date(),
			endDate: new Date(),
			timeRange: { from: Date.now(), to: Date.now() },
			barCount: 1,
		};

		// Oscillator mode
		expect(() => {
			const elem = <CVDIndicator data={data} visibleRange={visibleRange} mode="oscillator" />;
			expect(elem).toBeDefined();
		}).not.toThrow();

		// Histogram mode
		expect(() => {
			const elem = <CVDIndicator data={data} visibleRange={visibleRange} mode="histogram" />;
			expect(elem).toBeDefined();
		}).not.toThrow();
	});
});
