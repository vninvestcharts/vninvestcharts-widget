import type { IndicatorDefinition } from "../../types/indicator";
import { collectNumbers, kdjSeries, numericExtent, type KdjSeriesResult, type PriceBar } from "../utils";

const KDJ: IndicatorDefinition<PriceBar, KdjSeriesResult, readonly [number?, number?, number?]> = {
	name: "KDJ",
	compute: (bars, period = 9, m1 = 3, m2 = 3) => kdjSeries(bars, period, m1, m2),
	computeExtents: (values) => numericExtent(collectNumbers(values)),
	render: () => undefined,
};

export default KDJ;