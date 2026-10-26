import type { IndicatorDefinition } from "../../types/indicator";
import { numericExtent } from "../utils";
import type { OHLCVBar } from "../../types/ohlcv";

/**
 * Relative Strength (RS) — compares stock price performance against a benchmark index.
 */
const StrengthRelative: IndicatorDefinition<OHLCVBar, number[], [readonly OHLCVBar[], number]> = {
	name: "StrengthRelative",
	compute: (bars, compareBars, period = 14) => {
		const indexMap = new Map<number, number>();
		if (compareBars) {
			compareBars.forEach((b) => {
				indexMap.set(new Date(b.date).getTime(), b.close);
			});
		}

		const ratio = bars.map((bar) => {
			const t = new Date(bar.date).getTime();
			const idxClose = indexMap.has(t) ? indexMap.get(t)! : bar.close;
			return bar.close / (idxClose || 1);
		});

		return ratio.map((val, i) => {
			if (i < period) {
				return 100; // default baseline
			}
			const prevRatio = ratio[i - period];
			if (prevRatio === undefined || prevRatio === 0) {
				return 100;
			}
			return (val / prevRatio) * 100;
		});
	},
	computeExtents: (values) => numericExtent(values),
	render: () => undefined,
};

export default StrengthRelative;
