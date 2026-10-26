import type { IndicatorDefinition } from "../../types/indicator";
import { aoSeries, numericExtent, type PriceBar } from "../utils";

const AO: IndicatorDefinition<PriceBar, number[], []> = {
	name: "AO",
	compute: (bars) => aoSeries(bars),
	computeExtents: (values) => numericExtent(values),
	render: () => undefined,
};

export default AO;