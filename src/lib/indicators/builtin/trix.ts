import type { IndicatorDefinition } from "../../types/indicator";
import { collectNumbers, numericExtent, trixSeries, type PriceBar, type TrixSeriesResult } from "../utils";

const TRIX: IndicatorDefinition<PriceBar, TrixSeriesResult, readonly [number?, number?]> = {
	name: "TRIX",
	compute: (bars, period = 12, signalPeriod = 9) => trixSeries(bars, period, signalPeriod),
	computeExtents: (values) => numericExtent(collectNumbers(values)),
	render: () => undefined,
};

export default TRIX;