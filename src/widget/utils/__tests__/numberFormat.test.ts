import { describe, it, expect } from "vitest";
import { formatPrice, formatVolume, formatChangeValue, formatPercent } from "../numberFormat";

describe("numberFormat SSOT (V-02)", () => {
	it("formats prices with international grouping, 2 decimals", () => {
		expect(formatPrice(81325.38)).toBe("81,325.38");
		expect(formatPrice(2600)).toBe("2,600.00");
		expect(formatPrice(NaN)).toBe("n/a");
	});

	it("formats volumes M/K/raw with grid semantics", () => {
		expect(formatVolume(2500000)).toBe("2.5M");
		expect(formatVolume(42954)).toBe("43K");
		expect(formatVolume(13000)).toBe("13K");
		expect(formatVolume(42.95458)).toBe("42.95458");
		expect(formatVolume(NaN)).toBe("n/a");
	});

	it("formats signed change and percent", () => {
		expect(formatChangeValue(2700)).toBe("+2,700.00");
		expect(formatChangeValue(-300.5)).toBe("-300.50");
		expect(formatPercent(2.04)).toBe("+2.04%");
		expect(formatPercent(-0.62)).toBe("-0.62%");
	});
});
