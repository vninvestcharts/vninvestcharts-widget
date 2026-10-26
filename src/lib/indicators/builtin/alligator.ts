import type { IndicatorDefinition } from "../../types/indicator";
import type { OHLCVBar } from "../../types/ohlcv";
import { collectNumbers, numericExtent, alligatorSeries, type AlligatorSeriesResult } from "../utils";

const Alligator: IndicatorDefinition<
	OHLCVBar,
	AlligatorSeriesResult,
	readonly [number?, number?, number?, number?, number?, number?]
> = {
	name: "Alligator",
	compute: (bars, jawPeriod = 13, jawShift = 8, teethPeriod = 8, teethShift = 5, lipsPeriod = 5, lipsShift = 3) =>
		alligatorSeries(bars, jawPeriod, jawShift, teethPeriod, teethShift, lipsPeriod, lipsShift),
	computeExtents: (values) => numericExtent(collectNumbers(values)),
	render: () => undefined,
};

export default Alligator;
