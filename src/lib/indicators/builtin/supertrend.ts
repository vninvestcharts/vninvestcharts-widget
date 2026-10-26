import type { IndicatorDefinition } from "../../types/indicator";
import type { OHLCVBar } from "../../types/ohlcv";
import { collectNumbers, numericExtent, supertrendSeries, type SupertrendSeriesResult } from "../utils";

const SUPERTREND: IndicatorDefinition<OHLCVBar, SupertrendSeriesResult, readonly [number?, number?]> = {
	name: "Supertrend",
	compute: (bars, period = 10, multiplier = 3) => {
		return supertrendSeries(bars, period, multiplier);
	},
	computeExtents: (values) => numericExtent(collectNumbers(values)),
	render: () => undefined,
};

export default SUPERTREND;
