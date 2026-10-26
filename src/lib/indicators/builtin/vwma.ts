import type { IndicatorDefinition } from "../../types/indicator";
import type { OHLCVBar } from "../../types/ohlcv";
import { numericExtent, vwmaSeries } from "../utils";

const VWMA: IndicatorDefinition<OHLCVBar, number[], readonly [number?]> = {
	name: "VWMA",
	compute: (bars, period = 20) => vwmaSeries(bars, period),
	computeExtents: (values) => numericExtent(values),
	render: () => undefined,
};

export default VWMA;
