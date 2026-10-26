import type { IndicatorDefinition } from "../../types/indicator";
import { bbiSeries, numericExtent } from "../utils";

type PriceBar = { close: number; high: number; low: number; volume: number };

/** BBI — Bull and Bear Index = (MA3 + MA6 + MA12 + MA24) / 4 */
const BBI: IndicatorDefinition<PriceBar, number[], []> = {
	name: "BBI",
	compute: (bars) => bbiSeries(bars),
	computeExtents: (values) => numericExtent(values),
	render: () => undefined,
};

export default BBI;
