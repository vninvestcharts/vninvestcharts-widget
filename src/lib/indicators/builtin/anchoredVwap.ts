import type { IndicatorDefinition } from "../../types/indicator";
import type { OHLCVBar } from "../../types/ohlcv";
import { collectNumbers, numericExtent, anchoredVwapSeries, type VwapSeriesResult } from "../utils";

const AnchoredVWAP: IndicatorDefinition<
	OHLCVBar,
	VwapSeriesResult,
	readonly [number?, boolean?, number?]
> = {
	name: "AnchoredVWAP",
	compute: (bars, anchorTime = 0, showBands = true, multiplier = 1) =>
		anchoredVwapSeries(bars, anchorTime, showBands, multiplier),
	computeExtents: (values) => numericExtent(collectNumbers(values)),
	render: () => undefined,
};

export default AnchoredVWAP;
