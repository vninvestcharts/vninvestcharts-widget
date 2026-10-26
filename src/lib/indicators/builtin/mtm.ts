import type { IndicatorDefinition } from "../../types/indicator";
import { collectNumbers, mtmSeries, numericExtent, type MtmSeriesResult, type PriceBar } from "../utils";

const MTM: IndicatorDefinition<PriceBar, MtmSeriesResult, readonly [number?, number?]> = {
	name: "MTM",
	compute: (bars, period = 6, signalPeriod = 6) => mtmSeries(bars, period, signalPeriod),
	computeExtents: (values) => numericExtent(collectNumbers(values)),
	render: () => undefined,
};

export default MTM;