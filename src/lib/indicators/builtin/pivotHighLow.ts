import type { IndicatorDefinition } from "../../types/indicator";
import type { OHLCVBar } from "../../types/ohlcv";
import { collectNumbers, numericExtent, pivotHighLowSeries, type PivotSeriesResult } from "../utils";

const PIVOT_TYPES = ["standard", "fibonacci"] as const;

const PivotHighLow: IndicatorDefinition<
	OHLCVBar,
	PivotSeriesResult,
	readonly [number?, number?]
> = {
	name: "PivotHighLow",
	compute: (bars, lookback = 10, pivotType = 0) => {
		const typeStr = PIVOT_TYPES[pivotType] || "standard";
		return pivotHighLowSeries(bars, lookback, typeStr);
	},
	computeExtents: (values) => numericExtent(collectNumbers(values)),
	render: () => undefined,
};

export default PivotHighLow;
