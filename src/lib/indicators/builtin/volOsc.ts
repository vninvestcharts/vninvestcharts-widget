import type { IndicatorDefinition } from "../../types/indicator";
import type { OHLCVBar } from "../../types/ohlcv";
import { numericExtent, volOscSeries } from "../utils";

const VOLOSC: IndicatorDefinition<OHLCVBar, number[], readonly [number?, number?]> = {
	name: "VOLOSC",
	compute: (bars, shortPeriod = 5, longPeriod = 20) => volOscSeries(bars, shortPeriod, longPeriod),
	computeExtents: (values) => numericExtent(values),
	render: () => undefined,
};

export default VOLOSC;
