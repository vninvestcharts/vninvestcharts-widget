import { describe, expect, it } from "vitest";
import { computeScales } from "../../src/lib/core/scales/computeScales";
import type { OHLCVBar } from "../../src/lib/types/ohlcv";
import type { PaneConfig } from "../../src/lib/types/pane";

// Extended timeout for render heavy tests (5 minutes)
// These tests run 30 iterations of scale computation on 20k bars
const RENDER_HEAVY_TIMEOUT = 5 * 60 * 1000; // 5 minutes

function createBars(count: number): OHLCVBar[] {
	const bars: OHLCVBar[] = [];
	let close = 120;
	for (let index = 0; index < count; index += 1) {
		const drift = Math.sin(index / 12) * 1.75 + Math.cos(index / 30) * 0.85;
		const open = close;
		close = Number((close + drift).toFixed(4));
		const high = Number((Math.max(open, close) + 1.2).toFixed(4));
		const low = Number((Math.min(open, close) - 1.2).toFixed(4));
		bars.push({
			date: new Date(Date.UTC(2024, 0, 1 + index)),
			open,
			high,
			low,
			close,
			volume: 2_500 + (index % 2_400),
			index,
			dataIndex: index,
		});
	}
	return bars;
}

describe("soak/render_heavy", () => {
	it("computes pane scales on 20k bars within performance budget", { timeout: RENDER_HEAVY_TIMEOUT }, () => {
		const bars = createBars(20_000);
		const pane: PaneConfig = {
			id: "price-pane",
			minHeightPx: 120,
			heightPx: 480,
			rightAxis: { autoScale: true, scaleType: "linear" },
			indicators: [
				{ name: "EMA", params: [20], yAxis: "left" },
				{ name: "RSI", params: [14], yAxis: "right" },
				{ name: "VOLUME", params: [], yAxis: "right" },
			],
		};

		const loops = 30;
		const startedAt = performance.now();
		let lastLeftDomain: readonly number[] = [];
		let lastRightDomain: readonly number[] | undefined;

		for (let i = 0; i < loops; i += 1) {
			const result = computeScales(pane, bars, 480);
			lastLeftDomain = result.leftScale.domain();
			lastRightDomain = result.rightScale?.domain();
		}

		const elapsedMs = performance.now() - startedAt;
		const avgPerLoop = elapsedMs / loops;

		expect(lastLeftDomain.length).toBe(2);
		expect(lastLeftDomain[0]).toBeLessThan(lastLeftDomain[1]);
		expect(lastRightDomain).toBeDefined();
		expect((lastRightDomain ?? [0, 0])[0]).toBeLessThan((lastRightDomain ?? [0, 0])[1]);

		// Keep this budget generous to avoid flaky CI across machines.
		expect(elapsedMs).toBeLessThan(7_500);
		expect(avgPerLoop).toBeLessThan(250);
	});
});
