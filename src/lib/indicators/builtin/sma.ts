import type { IndicatorDefinition } from "../../types/indicator";
import type { OHLCVBar } from "../../types/ohlcv";
import { numericExtent, smaSeries } from "../utils";

const SMA: IndicatorDefinition<OHLCVBar, number[], readonly [number?]> = {
	name: "SMA",
	compute: (bars, period = 20) => smaSeries(bars.map((bar) => bar.close), period),
	computeExtents: (values) => numericExtent(values),
	render: () => undefined,
};

export default SMA;