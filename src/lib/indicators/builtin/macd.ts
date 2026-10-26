import type { IndicatorDefinition } from "../../types/indicator";
import type { OHLCVBar } from "../../types/ohlcv";
import { collectNumbers, macdSeries, numericExtent } from "../utils";

export interface MacdIndicatorValue {
	macd: number[];
	signal: number[];
	histogram: number[];
}

const MACD: IndicatorDefinition<OHLCVBar, MacdIndicatorValue, readonly [number?, number?, number?]> = {
	name: "MACD",
	compute: (bars, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) => {
		return macdSeries(bars.map((bar) => bar.close), fastPeriod, slowPeriod, signalPeriod);
	},
	computeExtents: (values) => numericExtent(collectNumbers(values)),
	render: () => undefined,
};

export default MACD;