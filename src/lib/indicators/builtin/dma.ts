import type { IndicatorDefinition } from "../../types/indicator";
import { collectNumbers, dmaSeries, numericExtent, type DmaSeriesResult, type PriceBar } from "../utils";

const DMA: IndicatorDefinition<PriceBar, DmaSeriesResult, readonly [number?, number?, number?]> = {
	name: "DMA",
	compute: (bars, fastPeriod = 10, slowPeriod = 50, signalPeriod = 10) => dmaSeries(bars, fastPeriod, slowPeriod, signalPeriod),
	computeExtents: (values) => numericExtent(collectNumbers(values)),
	render: () => undefined,
};

export default DMA;