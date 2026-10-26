import type { IndicatorDefinition } from "../../types/indicator";
import type { OHLCVBar } from "../../types/ohlcv";
import { collectNumbers, numericExtent, pivotStandardSeries, type PivotSeriesResult } from "../utils";

const PIVOT_TYPES = ["standard", "fibonacci", "camarilla", "woodie", "demark"] as const;

const PivotStandard: IndicatorDefinition<
	OHLCVBar,
	PivotSeriesResult,
	readonly [number?]
> = {
	name: "PivotStandard",
	compute: (bars, pivotType = 0) => {
		const typeStr = PIVOT_TYPES[pivotType] || "standard";
		return pivotStandardSeries(bars, typeStr);
	},
	computeExtents: (values) => numericExtent(collectNumbers(values)),
	render: () => undefined,
};

export default PivotStandard;
