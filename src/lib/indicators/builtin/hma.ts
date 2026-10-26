import type { IndicatorDefinition } from "../../types/indicator";
import type { OHLCVBar } from "../../types/ohlcv";
import { numericExtent, hmaSeries } from "../utils";

const HMA: IndicatorDefinition<OHLCVBar, number[], readonly [number?]> = {
	name: "HMA",
	compute: (bars, period = 9) => hmaSeries(bars.map((b) => b.close), period),
	computeExtents: (values) => numericExtent(values),
	render: () => undefined,
};

export default HMA;
