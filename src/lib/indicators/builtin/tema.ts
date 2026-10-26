import type { IndicatorDefinition } from "../../types/indicator";
import type { OHLCVBar } from "../../types/ohlcv";
import { numericExtent, temaSeries } from "../utils";

const TEMA: IndicatorDefinition<OHLCVBar, number[], readonly [number?]> = {
	name: "TEMA",
	compute: (bars, period = 9) => temaSeries(bars.map((b) => b.close), period),
	computeExtents: (values) => numericExtent(values),
	render: () => undefined,
};

export default TEMA;
