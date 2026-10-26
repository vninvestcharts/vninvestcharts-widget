import type { RawOHLCV } from "./types";

export interface CVDApproxPoint {
	cvdApprox?: number;
	cvdDelta?: number;
}

export function calcCVDApprox(raw: readonly RawOHLCV[]): CVDApproxPoint[] {
	let cumulative = 0;
	return raw.map((bar) => {
		const range = bar.high - bar.low;
		const buyVol = range > 0 ? bar.volume * ((bar.close - bar.low) / range) : bar.volume / 2;
		const sellVol = bar.volume - buyVol;
		const delta = buyVol - sellVol;
		cumulative += delta;
		return {
			cvdDelta: delta,
			cvdApprox: cumulative,
		};
	});
}
