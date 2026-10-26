import type { IndicatorDefinition } from "../../types/indicator";
import { collectNumbers, emvSeries, numericExtent, type EmvSeriesResult, type PriceBar } from "../utils";

const EMV: IndicatorDefinition<PriceBar, EmvSeriesResult, readonly [number?]> = {
	name: "EMV",
	compute: (bars, period = 14) => emvSeries(bars, period),
	computeExtents: (values) => numericExtent(collectNumbers(values)),
	render: () => undefined,
};

export default EMV;