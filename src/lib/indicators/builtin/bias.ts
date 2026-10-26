import type { IndicatorDefinition } from "../../types/indicator";
import { biasSeries, numericExtent, type PriceBar } from "../utils";

const BIAS: IndicatorDefinition<PriceBar, number[], readonly [number?]> = {
	name: "BIAS",
	compute: (bars, period = 6) => biasSeries(bars, period),
	computeExtents: (values) => numericExtent(values),
	render: () => undefined,
};

export default BIAS;