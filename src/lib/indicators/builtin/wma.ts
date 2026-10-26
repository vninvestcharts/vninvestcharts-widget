import type { IndicatorDefinition } from "../../types/indicator";
import type { OHLCVBar } from "../../types/ohlcv";
import { numericExtent, wmaSeries } from "../utils";

const WMA: IndicatorDefinition<OHLCVBar, number[], readonly [number?]> = {
	name: "WMA",
	compute: (bars, period = 9) => wmaSeries(bars.map((b) => b.close), period),
	computeExtents: (values) => numericExtent(values),
	render: () => undefined,
};

export default WMA;
