import type { IndicatorDefinition } from "../../types/indicator";
import { numericExtent } from "../utils";
import type { OHLCVBar } from "../../types/ohlcv";

export interface IndicatorWyckoffValue {
	direction: number; // 1 for up swing, -1 for down swing
	zigzag: number;    // The price value of the zigzag line at this bar
	waveVolume: number;// Cumulative volume of the current wave so far
	waveDuration: number; // Bar count of the current wave so far
	isPivot: boolean;  // True if this bar is a peak or trough
}

/**
 * Wyckoff Wave & Volume calculation using a ZigZag peak-and-trough algorithm.
 */
export function computeWyckoffWave(bars: readonly OHLCVBar[], thresholdPercent = 1): IndicatorWyckoffValue[] {
	const n = bars.length;
	if (n === 0) return [];

	interface Pivot {
		index: number;
		value: number;
		type: "peak" | "trough";
	}
	const pivots: Pivot[] = [];

	let direction = 0; // 1 = up, -1 = down
	let lastExtremumVal = bars[0].close;
	let lastExtremumIndex = 0;

	// Establish initial direction
	for (let i = 1; i < n; i++) {
		const highDiff = ((bars[i].high - lastExtremumVal) / lastExtremumVal) * 100;
		const lowDiff = ((bars[i].low - lastExtremumVal) / lastExtremumVal) * 100;

		if (highDiff >= thresholdPercent) {
			direction = 1;
			lastExtremumVal = bars[i].high;
			lastExtremumIndex = i;
			pivots.push({ index: 0, value: bars[0].low, type: "trough" });
			break;
		} else if (lowDiff <= -thresholdPercent) {
			direction = -1;
			lastExtremumVal = bars[i].low;
			lastExtremumIndex = i;
			pivots.push({ index: 0, value: bars[0].high, type: "peak" });
			break;
		}
	}

	if (direction === 0) {
		// No direction established, return flat wave
		return bars.map((b) => ({
			direction: 0,
			zigzag: b.close,
			waveVolume: b.volume,
			waveDuration: 1,
			isPivot: false,
		}));
	}

	for (let i = lastExtremumIndex + 1; i < n; i++) {
		if (direction === 1) {
			if (bars[i].high > lastExtremumVal) {
				lastExtremumVal = bars[i].high;
				lastExtremumIndex = i;
			} else {
				const diff = ((bars[i].low - lastExtremumVal) / lastExtremumVal) * 100;
				if (diff <= -thresholdPercent) {
					pivots.push({ index: lastExtremumIndex, value: lastExtremumVal, type: "peak" });
					direction = -1;
					lastExtremumVal = bars[i].low;
					lastExtremumIndex = i;
				}
			}
		} else {
			if (bars[i].low < lastExtremumVal) {
				lastExtremumVal = bars[i].low;
				lastExtremumIndex = i;
			} else {
				const diff = ((bars[i].high - lastExtremumVal) / lastExtremumVal) * 100;
				if (diff >= thresholdPercent) {
					pivots.push({ index: lastExtremumIndex, value: lastExtremumVal, type: "trough" });
					direction = 1;
					lastExtremumVal = bars[i].high;
					lastExtremumIndex = i;
				}
			}
		}
	}

	// Add the final bar as a pivot to close the last wave
	pivots.push({
		index: n - 1,
		value: direction === 1 ? bars[n - 1].high : bars[n - 1].low,
		type: direction === 1 ? "peak" : "trough",
	});

	// Second pass: interpolate ZigZag values and accumulate volume / duration
	const result: IndicatorWyckoffValue[] = new Array(n);
	let pivotIdx = 0;

	for (let i = 0; i < n; i++) {
		while (pivotIdx < pivots.length - 1 && pivots[pivotIdx + 1].index < i) {
			pivotIdx++;
		}

		const p1 = pivots[pivotIdx];
		const p2 = pivots[pivotIdx + 1] || p1;

		let zigzagVal = p1.value;
		if (p2.index > p1.index) {
			const ratio = (i - p1.index) / (p2.index - p1.index);
			zigzagVal = p1.value + (p2.value - p1.value) * ratio;
		}

		let waveVolume = 0;
		for (let k = p1.index + 1; k <= i; k++) {
			waveVolume += bars[k].volume;
		}
		if (p1.index === i) {
			waveVolume = bars[i].volume;
		}
		const waveDuration = i - p1.index + 1;

		result[i] = {
			direction: p2.type === "peak" ? 1 : -1,
			zigzag: zigzagVal,
			waveVolume,
			waveDuration,
			isPivot: i === p1.index || i === p2.index,
		};
	}

	return result;
}

const WyckoffWave: IndicatorDefinition<OHLCVBar, IndicatorWyckoffValue[], [number]> = {
	name: "WyckoffWave",
	compute: (bars, thresholdPercent = 1) => computeWyckoffWave(bars, thresholdPercent),
	computeExtents: (values) => numericExtent(values.map((v) => v.zigzag)),
	render: () => undefined,
};

export default WyckoffWave;
