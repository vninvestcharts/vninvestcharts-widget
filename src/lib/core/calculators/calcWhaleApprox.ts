import type { RawOHLCV } from "./types";

export interface WhaleApproxPoint {
	whaleBuyVol?: number;
	whaleSellVol?: number;
}

export function calcWhaleApprox(raw: readonly RawOHLCV[], threshold = 50_000): WhaleApproxPoint[] {
	return raw.map((bar) => {
		const dollarVolume = bar.close * bar.volume;
		const range = bar.high - bar.low;
		const buyShare = range > 0 ? (bar.close - bar.low) / range : 0.5;
		const sellShare = 1 - buyShare;
		const buyDollar = dollarVolume * buyShare;
		const sellDollar = dollarVolume * sellShare;
		const next: WhaleApproxPoint = {};

		if (buyDollar >= threshold) {
			next.whaleBuyVol = bar.volume * buyShare;
		}
		if (sellDollar >= threshold) {
			next.whaleSellVol = bar.volume * sellShare;
		}

		return next;
	});
}
