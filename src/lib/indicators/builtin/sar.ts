import type { IndicatorDefinition } from "../../types/indicator";
import { sarSeries, numericExtent } from "../utils";

type PriceBar = { close: number; high: number; low: number; volume: number };

/** SAR — Parabolic Stop and Reverse */
const SAR: IndicatorDefinition<PriceBar, number[], readonly [number?, number?]> = {
	name: "SAR",
	compute: (bars, afStep = 0.02, afMax = 0.2) => sarSeries(bars, afStep, afMax),
	computeExtents: (values) => numericExtent(values.filter((v) => Number.isFinite(v))),
	render: () => undefined,
};

export default SAR;
