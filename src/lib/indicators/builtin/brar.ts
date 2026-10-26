import type { IndicatorDefinition } from "../../types/indicator";
import { brarSeries, collectNumbers, numericExtent, type BrarSeriesResult, type PriceBar } from "../utils";

const BRAR: IndicatorDefinition<PriceBar, BrarSeriesResult, readonly [number?]> = {
	name: "BRAR",
	compute: (bars, period = 26) => brarSeries(bars, period),
	computeExtents: (values) => numericExtent(collectNumbers(values)),
	render: () => undefined,
};

export default BRAR;