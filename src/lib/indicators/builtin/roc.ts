import type { IndicatorDefinition } from "../../types/indicator";
import { numericExtent, rocSeries, type PriceBar } from "../utils";

const ROC: IndicatorDefinition<PriceBar, number[], readonly [number?]> = {
	name: "ROC",
	compute: (bars, period = 12) => rocSeries(bars, period),
	computeExtents: (values) => numericExtent(values),
	render: () => undefined,
};

export default ROC;