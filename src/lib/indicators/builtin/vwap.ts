import type { IndicatorDefinition } from "../../types/indicator";
import type { OHLCVBar } from "../../types/ohlcv";
import { collectNumbers, numericExtent, vwapSeries, type VwapSeriesResult } from "../utils";

const VWAP: IndicatorDefinition<
	OHLCVBar,
	VwapSeriesResult,
	readonly [("session" | "week" | "month")?, boolean?, number?]
> = {
	name: "VWAP",
	compute: (bars, anchor = "session", showBands = true, multiplier = 1) =>
		vwapSeries(bars, anchor, showBands, multiplier),
	computeExtents: (values) => numericExtent(collectNumbers(values)),
	render: () => undefined,
};

export default VWAP;
