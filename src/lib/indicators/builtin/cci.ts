import type { IndicatorDefinition } from "../../types/indicator";
import { cciSeries, numericExtent, type PriceBar } from "../utils";

const CCI: IndicatorDefinition<PriceBar, number[], readonly [number?]> = {
	name: "CCI",
	compute: (bars, period = 20) => cciSeries(bars, period),
	computeExtents: (values) => numericExtent(values),
	render: () => undefined,
};

export default CCI;