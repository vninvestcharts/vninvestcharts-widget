import type { IndicatorDefinition } from "../../types/indicator";
import type { OHLCVBar } from "../../types/ohlcv";
import { computeMarketProfile, synthesizeTicksFromBar, MarketProfileData } from "../utils";

const MarketProfile: IndicatorDefinition<OHLCVBar, MarketProfileData, readonly [number?, number?, number?, number?]> = {
	name: "MarketProfile",
	compute: (bars, sessionStart, sessionEnd, tickSize = 0.01, tpoPeriodMinutes = 30) => {
		const start = sessionStart ?? (bars[0]?.date ? new Date(bars[0].date).getTime() : Date.now());
		const end = sessionEnd ?? (bars[bars.length - 1]?.date ? new Date(bars[bars.length - 1].date).getTime() : Date.now());
		const ticks = bars.flatMap(bar => synthesizeTicksFromBar(bar, tickSize));
		return computeMarketProfile(ticks, start, end, tickSize, tpoPeriodMinutes);
	},
	render: () => undefined,
};

export default MarketProfile;
