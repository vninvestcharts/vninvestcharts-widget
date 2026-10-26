import type { IndicatorDefinition } from "../../types/indicator";
import type { OHLCVBar } from "../../types/ohlcv";
import { emaSeries, numericExtent } from "../utils";

const EMA: IndicatorDefinition<OHLCVBar, number[], readonly [number?]> = {
	name: "EMA",
	compute: (bars, period = 20) => emaSeries(bars.map((bar) => bar.close), period),
	computeExtents: (values) => numericExtent(values),
	render: () => undefined,
};

export default EMA;