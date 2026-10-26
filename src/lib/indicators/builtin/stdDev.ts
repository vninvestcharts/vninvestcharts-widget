import type { IndicatorDefinition } from "../../types/indicator";
import type { OHLCVBar } from "../../types/ohlcv";
import { numericExtent, stdDevSeries } from "../utils";

const STDDEV: IndicatorDefinition<OHLCVBar, number[], readonly [number?]> = {
	name: "StdDev",
	compute: (bars, period = 20) => stdDevSeries(bars.map((b) => b.close), period),
	computeExtents: (values) => numericExtent(values),
	render: () => undefined,
};

export default STDDEV;
