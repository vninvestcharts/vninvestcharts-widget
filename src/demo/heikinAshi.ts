import type { OHLCVBar } from "../lib/types/ohlcv";
import type { RawOHLCV } from "../lib/core/calculators/types";

export function transformHeikinAshi(bars: readonly RawOHLCV[]): OHLCVBar[] {
	if (bars.length === 0) {
		return [];
	}

	const result: OHLCVBar[] = [];

	for (let index = 0; index < bars.length; index += 1) {
		const bar = bars[index];
		const close = (bar.open + bar.high + bar.low + bar.close) / 4;
		const open = index === 0
			? (bar.open + bar.close) / 2
			: (result[index - 1].open + result[index - 1].close) / 2;
		const high = Math.max(bar.high, open, close);
		const low = Math.min(bar.low, open, close);

		result.push({
			...bar,
			index,
			dataIndex: index,
			open,
			high,
			low,
			close,
		});
	}

	return result;
}
