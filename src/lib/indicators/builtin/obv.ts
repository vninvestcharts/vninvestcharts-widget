import type { IndicatorDefinition } from "../../types/indicator";
import { obvSeries, numericExtent } from "../utils";

type PriceBar = { close: number; high: number; low: number; volume: number };

/** OBV — On Balance Volume */
const OBV: IndicatorDefinition<PriceBar, number[], []> = {
	name: "OBV",
	compute: (bars) => obvSeries(bars),
	computeExtents: (values) => numericExtent(values),
	render: () => undefined,
};

export default OBV;
