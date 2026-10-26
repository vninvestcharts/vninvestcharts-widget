import type { IndicatorDefinition } from "../../types/indicator";
import { wrSeries } from "../utils";

type PriceBar = { close: number; high: number; low: number; volume: number };

/** WR — Williams %R. Range: -100 → 0. */
const WR: IndicatorDefinition<PriceBar, number[], readonly [number?]> = {
	name: "WR",
	compute: (bars, period = 14) => wrSeries(bars, period),
	computeExtents: () => [-100, 0],
	render: () => undefined,
};

export default WR;
