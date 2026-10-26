import type { IndicatorDefinition } from "../../types/indicator";
import { collectNumbers, numericExtent, psySeries, type PriceBar, type PsySeriesResult } from "../utils";

const PSY: IndicatorDefinition<PriceBar, PsySeriesResult, readonly [number?, number?]> = {
	name: "PSY",
	compute: (bars, period = 12, signalPeriod = 6) => psySeries(bars, period, signalPeriod),
	computeExtents: (values) => numericExtent(collectNumbers(values)),
	render: () => undefined,
};

export default PSY;