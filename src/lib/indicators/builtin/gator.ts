import type { IndicatorDefinition } from "../../types/indicator";
import type { OHLCVBar } from "../../types/ohlcv";
import { collectNumbers, numericExtent, gatorSeries, type GatorSeriesResult } from "../utils";

const Gator: IndicatorDefinition<
	OHLCVBar,
	GatorSeriesResult,
	readonly [number?, number?, number?, number?, number?, number?]
> = {
	name: "Gator",
	compute: (bars, jawPeriod = 13, jawShift = 8, teethPeriod = 8, teethShift = 5, lipsPeriod = 5, lipsShift = 3) =>
		gatorSeries(bars, jawPeriod, jawShift, teethPeriod, teethShift, lipsPeriod, lipsShift),
	computeExtents: (values) => numericExtent(collectNumbers(values)),
	render: () => undefined,
};

export default Gator;
