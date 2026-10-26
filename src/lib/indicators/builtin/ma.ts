import type { IndicatorDefinition } from "../../types/indicator";
import { numericExtent, smaSeries } from "../utils";

type PriceBar = { close: number; high: number; low: number; volume: number };

/** MA — Moving Average (alias for parameterized SMA) */
const MA: IndicatorDefinition<PriceBar, number[], readonly [number?]> = {
	name: "MA",
	compute: (bars, period = 20) => smaSeries(bars.map((b) => b.close), period),
	computeExtents: (values) => numericExtent(values),
	render: () => undefined,
};

export default MA;
