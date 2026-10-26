import { describe, expect, it } from "vitest";
import { findAxisSlotAt, isLogScaleAvailable } from "../axisHit";

const priceSnapshot: any = {
	paneId: "price",
	scaleSlotBounds: {
		"price-right": { left: 752, top: 0, width: 48, height: 500 },
		"price-left": { left: 0, top: 0, width: 40, height: 500 },
	},
	scaleSlotStates: {
		"price-right": { side: "right", visible: true, domain: [90, 110] },
		"price-left": { side: "left", visible: true, domain: [90, 110] },
	},
};

describe("findAxisSlotAt", () => {
	it("hits the right Y axis slot", () => {
		expect(findAxisSlotAt([priceSnapshot], 760, 250)).toEqual({
			paneId: "price",
			scaleSlotId: "price-right",
			side: "right",
			domain: [90, 110],
		});
	});

	it("hits the left Y axis slot", () => {
		expect(findAxisSlotAt([priceSnapshot], 20, 250)?.scaleSlotId).toBe("price-left");
		expect(findAxisSlotAt([priceSnapshot], 20, 250)?.side).toBe("left");
	});

	it("misses the plot area between axes", () => {
		expect(findAxisSlotAt([priceSnapshot], 400, 250)).toBeNull();
	});

	it("misses points outside every bound", () => {
		expect(findAxisSlotAt([priceSnapshot], 760, 600)).toBeNull();
		expect(findAxisSlotAt([priceSnapshot], -10, 250)).toBeNull();
	});

	it("is total on degenerate input", () => {
		expect(findAxisSlotAt(null, 760, 250)).toBeNull();
		expect(findAxisSlotAt(undefined, 760, 250)).toBeNull();
		expect(findAxisSlotAt([], 760, 250)).toBeNull();
		expect(findAxisSlotAt([priceSnapshot], NaN, 250)).toBeNull();
		expect(findAxisSlotAt([{ paneId: "x" } as never], 760, 250)).toBeNull();
	});
});

describe("isLogScaleAvailable", () => {
	it("requires a strictly positive domain", () => {
		expect(isLogScaleAvailable([90, 110])).toBe(true);
		expect(isLogScaleAvailable([0, 110])).toBe(false);
		expect(isLogScaleAvailable([-5, 110])).toBe(false);
		expect(isLogScaleAvailable(undefined)).toBe(false);
	});
});
