import type { IndicatorDefinition } from "../../types/indicator";
import { numericExtent, pvtSeries, type PriceBar } from "../utils";

const PVT: IndicatorDefinition<PriceBar, number[], []> = {
	name: "PVT",
	compute: (bars) => pvtSeries(bars),
	computeExtents: (values) => numericExtent(values),
	render: () => undefined,
};

export default PVT;