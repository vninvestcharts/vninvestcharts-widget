import { describe, it, expect } from "vitest";
import { hexToRGBA } from "../index";

describe("hexToRGBA helper tests", () => {
	it("should parse 3-character hex colors correctly", () => {
		expect(hexToRGBA("#fff", 0.5)).toBe("rgba(255, 255, 255, 0.5)");
		expect(hexToRGBA("#000", 1)).toBe("rgba(0, 0, 0, 1)");
	});

	it("should parse 6-character hex colors correctly", () => {
		expect(hexToRGBA("#ffffff", 0.3)).toBe("rgba(255, 255, 255, 0.3)");
		expect(hexToRGBA("#2962ff", 0.15)).toBe("rgba(41, 98, 255, 0.15)");
	});

	it("should parse 8-character hex colors correctly and override alpha", () => {
		expect(hexToRGBA("#ffffff88", 0.3)).toBe("rgba(255, 255, 255, 0.3)");
		expect(hexToRGBA("#2962ff00", 0.8)).toBe("rgba(41, 98, 255, 0.8)");
	});

	it("should parse rgba colors and override opacity", () => {
		expect(hexToRGBA("rgba(41, 98, 255, 0.5)", 0.2)).toBe("rgba(41, 98, 255, 0.2)");
		expect(hexToRGBA("rgb(41, 98, 255)", 0.4)).toBe("rgba(41, 98, 255, 0.4)");
	});

	it("should handle transparent and empty inputs correctly", () => {
		expect(hexToRGBA("", 0.5)).toBe("transparent");
		expect(hexToRGBA(undefined, 0.5)).toBe("transparent");
	});

	it("should return unknown formats as-is", () => {
		expect(hexToRGBA("red", 0.5)).toBe("red");
		expect(hexToRGBA("transparent", 0.5)).toBe("transparent");
	});
});
