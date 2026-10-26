import type { IndicatorDefinition } from "../../types/indicator";
import { vrSeries, numericExtent } from "../utils";

type PriceBar = { close: number; high: number; low: number; volume: number };

/** VR — Volume Ratio */
const VR: IndicatorDefinition<PriceBar, number[], readonly [number?]> = {
	name: "VR",
	compute: (bars, period = 26) => vrSeries(bars, period),
	computeExtents: (values) => numericExtent(values.filter((v) => Number.isFinite(v))),
	render: () => undefined,
};

export default VR;
