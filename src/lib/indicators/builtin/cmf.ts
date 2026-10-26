import type { IndicatorDefinition } from "../../types/indicator";
import type { OHLCVBar } from "../../types/ohlcv";
import { numericExtent, cmfSeries } from "../utils";

const CMF: IndicatorDefinition<OHLCVBar, number[], readonly [number?]> = {
	name: "CMF",
	compute: (bars, period = 20) => cmfSeries(bars, period),
	computeExtents: (values) => numericExtent(values),
	render: () => undefined,
};

export default CMF;
