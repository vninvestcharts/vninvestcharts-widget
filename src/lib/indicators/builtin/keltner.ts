import type { IndicatorDefinition } from "../../types/indicator";
import type { OHLCVBar } from "../../types/ohlcv";
import { collectNumbers, keltnerSeries, numericExtent, type KeltnerSeriesResult } from "../utils";

const KELTNER: IndicatorDefinition<OHLCVBar, KeltnerSeriesResult, readonly [number?, number?, number?]> = {
	name: "Keltner",
	compute: (bars, period = 20, atrPeriod = 10, multiplier = 2) => {
		return keltnerSeries(bars, period, atrPeriod, multiplier);
	},
	computeExtents: (values) => numericExtent(collectNumbers(values)),
	render: () => undefined,
};

export default KELTNER;
