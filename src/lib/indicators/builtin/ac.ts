import type { IndicatorDefinition } from "../../types/indicator";
import type { OHLCVBar } from "../../types/ohlcv";
import { numericExtent, acSeries } from "../utils";

const AC: IndicatorDefinition<OHLCVBar, number[], readonly []> = {
	name: "AC",
	compute: (bars) => acSeries(bars),
	computeExtents: (values) => numericExtent(values),
	render: () => undefined,
};

export default AC;
