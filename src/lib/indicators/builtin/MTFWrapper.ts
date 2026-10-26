import type { OHLCVBar } from "../../types/ohlcv";

export function resolveTimeframeMs(timeframe: string): number {
	const match = timeframe.match(/^(\d+)?([mhdws])$/i);
	if (!match) return 24 * 60 * 60 * 1000; // default 1d

	const value = match[1] ? parseInt(match[1], 10) : 1;
	const unit = match[2].toLowerCase();

	switch (unit) {
		case "m": return value * 60 * 1000;
		case "h": return value * 60 * 60 * 1000;
		case "d": return value * 24 * 60 * 60 * 1000;
		case "w": return value * 7 * 24 * 60 * 60 * 1000;
		default: return 24 * 60 * 60 * 1000;
	}
}

export function alignMTFData(
	baseBars: OHLCVBar[],
	targetBars: OHLCVBar[],
	targetValues: any[],
	targetTimeframe: string
): any[] {
	if (baseBars.length === 0 || targetBars.length === 0) {
		return new Array(baseBars.length).fill(undefined);
	}

	const aligned: any[] = [];
	const tfMs = resolveTimeframeMs(targetTimeframe);
	let lastClosedIdx = -1;

	for (let i = 0; i < baseBars.length; i++) {
		const baseTime = baseBars[i].date.getTime();

		// Advance lastClosedIdx as long as the next target bar is closed
		while (
			lastClosedIdx + 1 < targetBars.length &&
			targetBars[lastClosedIdx + 1].date.getTime() + tfMs <= baseTime
		) {
			lastClosedIdx++;
		}

		aligned.push(lastClosedIdx !== -1 ? (targetValues[lastClosedIdx] ?? undefined) : undefined);
	}

	return aligned;
}
