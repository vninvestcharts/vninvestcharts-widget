import { describe, expect, it } from "vitest";
import { formatAxisPrice } from "../axisPriceFormat";

describe("formatAxisPrice (audit #21)", () => {
	it("renders full grouped numbers, never compact K", () => {
		expect(formatAxisPrice(84000)).toBe("84,000");
		expect(formatAxisPrice(81352.54)).toBe("81,352.54");
		expect(formatAxisPrice(116.0)).toBe("116");
		expect(formatAxisPrice(-35.76)).toBe("-35.76");
	});

	it("handles non-finite input defensively", () => {
		expect(formatAxisPrice(NaN)).toBe("—");
		expect(formatAxisPrice(Infinity)).toBe("—");
	});
});
