import type { IndicatorDefinition } from "../../types/indicator";
import { collectNumbers, dmiSeries, numericExtent, type DmiSeriesResult, type PriceBar } from "../utils";

const DMI: IndicatorDefinition<PriceBar, DmiSeriesResult, readonly [number?]> = {
	name: "DMI",
	compute: (bars, period = 14) => dmiSeries(bars, period),
	computeExtents: (values) => numericExtent(collectNumbers(values)),
	render: () => undefined,
};

export default DMI;