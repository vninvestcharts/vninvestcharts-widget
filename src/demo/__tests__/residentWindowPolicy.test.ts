import { describe, expect, it } from "vitest";

import { applyResidentWindowPolicy } from "../residentWindowPolicy";
import type { RawOHLCV } from "../../lib/core/calculators/types";

function createBars(length: number): RawOHLCV[] {
	return Array.from({ length }, (_, index) => ({
		date: new Date(index * 60_000),
		open: index,
		high: index + 1,
		low: index - 1,
		close: index,
		volume: 100,
	}));
}

describe("residentWindowPolicy", () => {
	it("does not trim when bar count is below maxBars", () => {
		const bars = createBars(100);
		const next = applyResidentWindowPolicy(bars, null, {
			maxBars: 200,
			trimToBars: 150,
			leftPaddingBars: 10,
		});

		expect(next).toHaveLength(100);
		expect(next[0].date.valueOf()).toBe(bars[0].date.valueOf());
	});

	it("trims oldest bars when visibleDomain is absent", () => {
		const bars = createBars(1000);
		const next = applyResidentWindowPolicy(bars, null, {
			maxBars: 900,
			trimToBars: 700,
			leftPaddingBars: 10,
		});

		expect(next).toHaveLength(700);
		expect(next[0].date.valueOf()).toBe(bars[300].date.valueOf());
	});

	it("preserves left context around visible start when trimming", () => {
		const bars = createBars(1000);
		const visibleStart = bars[500].date.valueOf();
		const next = applyResidentWindowPolicy(
			bars,
			[visibleStart, bars[900].date.valueOf()],
			{
				maxBars: 900,
				trimToBars: 700,
				leftPaddingBars: 50,
			},
		);

		expect(next).toHaveLength(700);
		// Trim count capped to keep at least 50 bars before current viewport.
		expect(next[0].date.valueOf()).toBe(bars[300].date.valueOf());
	});

	it("skips trim when requested trim would cut into protected viewport padding", () => {
		const bars = createBars(1000);
		const visibleStart = bars[250].date.valueOf();
		const next = applyResidentWindowPolicy(
			bars,
			[visibleStart, bars[800].date.valueOf()],
			{
				maxBars: 900,
				trimToBars: 700,
				leftPaddingBars: 250,
			},
		);

		// firstVisibleIndex=250 and padding=250 => max trimmable=0, so policy keeps all bars.
		expect(next).toHaveLength(1000);
		expect(next[0].date.valueOf()).toBe(bars[0].date.valueOf());
	});
});
