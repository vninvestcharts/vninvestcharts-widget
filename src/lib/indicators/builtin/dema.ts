import type { IndicatorDefinition } from "../../types/indicator";
import type { OHLCVBar } from "../../types/ohlcv";
import { numericExtent, demaSeries } from "../utils";

const DEMA: IndicatorDefinition<OHLCVBar, number[], readonly [number?]> = {
	name: "DEMA",
	compute: (bars, period = 9) => demaSeries(bars.map((b) => b.close), period),
	computeExtents: (values) => numericExtent(values),
	render: () => undefined,
};

export default DEMA;
