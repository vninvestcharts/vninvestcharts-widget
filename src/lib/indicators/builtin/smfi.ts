import type { IndicatorDefinition } from "../../types/indicator";
import { numericExtent } from "../utils";
import type { OHLCVBar } from "../../types/ohlcv";

/**
 * Smart Money Flow Index (SMFI)
 * Calculates the net money flow in the first 30 minutes vs the last 30 minutes of the trading day.
 */
const SMFI: IndicatorDefinition<OHLCVBar, number[], []> = {
	name: "SMFI",
	compute: (bars) => {
		const n = bars.length;
		if (n === 0) return [];

		// Detect if intraday
		const days = new Set<string>();
		bars.forEach((b) => days.add(new Date(b.date).toDateString()));
		const isIntraday = n > days.size * 1.5;

		const results: number[] = new Array(n);
		let smfi = 10000;

		if (!isIntraday) {
			// Daily fallback
			for (let i = 0; i < n; i++) {
				const prevClose = i > 0 ? bars[i - 1].close : bars[i].open;
				const changeFirst = bars[i].open - prevClose;
				const volFirst = bars[i].volume * 0.2;
				const changeLast = bars[i].close - bars[i].open;
				const volLast = bars[i].volume * 0.3;
				smfi = smfi - changeFirst * volFirst + changeLast * volLast;
				results[i] = smfi;
			}
		} else {
			// Intraday logic
			for (let i = 0; i < n; i++) {
				const date = new Date(bars[i].date);
				const hour = date.getHours();
				const min = date.getMinutes();

				const isFirst30 = hour === 9 && min >= 0 && min <= 30;
				const isLast30 = (hour === 14 && min >= 15 && min <= 59) || (hour === 15 && min === 0);

				const priceChange = i > 0 ? bars[i].close - bars[i - 1].close : 0;
				const volume = bars[i].volume;

				if (isFirst30) {
					smfi -= priceChange * volume;
				} else if (isLast30) {
					smfi += priceChange * volume;
				}

				results[i] = smfi;
			}
		}

		return results;
	},
	computeExtents: (values) => numericExtent(values),
	render: () => undefined,
};

export default SMFI;
