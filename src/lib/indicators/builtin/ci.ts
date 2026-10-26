import type { IndicatorDefinition } from "../../types/indicator";
import type { OHLCVBar } from "../../types/ohlcv";
import { choppinessIndexSeries, numericExtent } from "../utils";

const CI: IndicatorDefinition<OHLCVBar, number[], readonly [number?]> = {
	name: "CI",
	compute: (bars, period = 14) => choppinessIndexSeries(bars, period),
	computeExtents: (values) => numericExtent(values),
	render: () => undefined,
};

export default CI;
