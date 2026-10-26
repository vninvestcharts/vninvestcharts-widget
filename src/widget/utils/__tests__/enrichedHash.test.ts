import { describe, expect, it } from "vitest";
import { hashEnrichedData } from "../enrichedHash";
import type { EnrichedDatum } from "../../../lib/core/calculators/types";

function bar(over: Record<string, unknown> = {}): EnrichedDatum {
	return {
		date: new Date("2026-09-01T00:00:00Z"),
		open: 100,
		high: 110,
		low: 90,
		close: 105,
		volume: 1000,
		...over,
	} as unknown as EnrichedDatum;
}

describe("hashEnrichedData (BL-07 shared util)", () => {
	it("returns empty string for nullish input", () => {
		expect(hashEnrichedData(undefined as never)).toBe("");
	});

	it("is stable for identical bars regardless of key order", () => {
		const a = [bar()];
		const b = [bar()];
		expect(hashEnrichedData(a)).toBe(hashEnrichedData(b));
	});

	it("changes when OHLCV changes", () => {
		const base = hashEnrichedData([bar()]);
		expect(hashEnrichedData([bar({ close: 106 })])).not.toBe(base);
		expect(hashEnrichedData([bar({ volume: 2000 })])).not.toBe(base);
	});

	it("ignores symbolData by default (useWidgetData legacy semantics)", () => {
		const plain = hashEnrichedData([bar()]);
		const withSymbols = hashEnrichedData([bar({ symbolData: { FPT: { close: 50 } } })]);
		expect(withSymbols).toBe(plain);
	});

	it("includes comparison closes when includeComparison is true (VNInvestCharts legacy semantics)", () => {
		const plain = hashEnrichedData([bar()], { includeComparison: true });
		const added = hashEnrichedData([bar({ symbolData: { FPT: { close: 50 } } })], { includeComparison: true });
		const changed = hashEnrichedData([bar({ symbolData: { FPT: { close: 51 } } })], { includeComparison: true });
		expect(added).not.toBe(plain);
		expect(changed).not.toBe(added);
	});
});
