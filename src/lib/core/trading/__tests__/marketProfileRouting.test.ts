import { describe, expect, it } from "vitest";
import {
	isUnclassifiedMarketSymbol,
	resolveMarketProfile,
} from "../MarketRules";

describe("market profile routing (S4 Q3)", () => {
	it("routes VN30F/crypro/VN tickers to their profiles", () => {
		expect(resolveMarketProfile("VN30F1M").profile).toBe("VN_DERIVATIVES");
		expect(resolveMarketProfile("BTCUSDT").profile).toBe("GLOBAL_MARGIN");
		expect(resolveMarketProfile("HPG").profile).toBe("VN_SPOT");
		expect(resolveMarketProfile("FPT").profile).toBe("VN_SPOT");
	});

	it("routes 4+ letter international tickers to GLOBAL_MARGIN (no VN lot/T+2)", () => {
		for (const s of ["AAPL", "MSFT", "EURUSD"]) {
			const rules = resolveMarketProfile(s);
			expect(rules.profile).toBe("GLOBAL_MARGIN");
			expect(rules.baseCurrency).toBe("USD");
			expect(rules.lotSize).toBe(1);
		}
	});

	it("flags unclassified symbols for the fallback banner", () => {
		expect(isUnclassifiedMarketSymbol("AAPL")).toBe(false);
		expect(isUnclassifiedMarketSymbol("HPG")).toBe(false);
		expect(isUnclassifiedMarketSymbol("BTCUSDT")).toBe(false);
		expect(isUnclassifiedMarketSymbol("VN30F1M")).toBe(false);
		expect(isUnclassifiedMarketSymbol("XB12")).toBe(true);
		expect(isUnclassifiedMarketSymbol("")).toBe(true);
	});
});
