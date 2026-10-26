import type { IndicatorDefinition } from "../../types/indicator";
import type { OHLCVBar } from "../../types/ohlcv";
import { collectNumbers, donchianSeries, numericExtent, type DonchianSeriesResult } from "../utils";

const DONCHIAN: IndicatorDefinition<OHLCVBar, DonchianSeriesResult, readonly [number?]> = {
	name: "Donchian",
	compute: (bars, period = 20) => {
		return donchianSeries(bars, period);
	},
	computeExtents: (values) => numericExtent(collectNumbers(values)),
	render: () => undefined,
};

export default DONCHIAN;
