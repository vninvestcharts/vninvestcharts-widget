import type { IndicatorDefinition } from "../../types/indicator";
import type { OHLCVBar } from "../../types/ohlcv";
import { bollingerSeries, collectNumbers, numericExtent } from "../utils";

export interface BollingerIndicatorValue {
	upper: number[];
	middle: number[];
	lower: number[];
}

const BOLLINGER: IndicatorDefinition<OHLCVBar, BollingerIndicatorValue, readonly [number?, number?]> = {
	name: "BOLLINGER",
	compute: (bars, period = 20, multiplier = 2) => {
		return bollingerSeries(bars.map((bar) => bar.close), period, multiplier);
	},
	computeExtents: (values) => numericExtent(collectNumbers(values)),
	render: () => undefined,
};

export default BOLLINGER;