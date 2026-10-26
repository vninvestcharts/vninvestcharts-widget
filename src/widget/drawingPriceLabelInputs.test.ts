import { describe, expect, it } from "vitest";

import { createDrawingObject } from "@vninvestcharts/engine-drawing";
import { createSelectedPriceLabelsInput } from "./drawingPriceLabelInputs";

describe("createSelectedPriceLabelsInput", () => {
	it("returns null when disabled or no drawing is selected", () => {
		expect(createSelectedPriceLabelsInput(null, true, "price")).toBeNull();

		const drawing = createDrawingObject("trendLine", [
			{ x: 100, y: 20 },
			{ x: 200, y: 40 },
		], {
			id: "drawing-disabled",
			paneId: "price",
			yScaleId: "price-right",
		});

		expect(createSelectedPriceLabelsInput(drawing, false, "price")).toBeNull();
	});

	it("maps the selected drawing into the engine overlay input", () => {
		const drawing = createDrawingObject("trendLine", [
			{ x: 1704099600000, y: 100, timeMsHint: 1704099605000, xIndexFloat: 12.25 },
			{ x: 1704103200000, y: 106 },
		], {
			id: "selected-drawing",
			paneId: "price",
			yScaleId: "price-right",
		});

		expect(createSelectedPriceLabelsInput(drawing, true, null)).toEqual({
			drawingId: "selected-drawing",
			paneId: "price",
			scaleSlotId: "price-right",
			anchorTime: 1704099605000,
			markers: [{
				key: "selected-drawing-anchor",
				price: 106,
			}],
			fill: "#f59e0b",
			stroke: "#f59e0b",
			textColor: "#FFFFFF",
			highlighted: true,
			visible: true,
		});
	});

	it("falls back to the provided pane id and skips hidden drawings", () => {
		const drawing = createDrawingObject("hLine", [
			{ x: 1704099600000, y: 101.5 },
		], {
			id: "fallback-drawing",
			yScaleId: "price-right",
		});

		expect(createSelectedPriceLabelsInput(drawing, true, "fallback-pane")).toMatchObject({
			drawingId: "fallback-drawing",
			paneId: "fallback-pane",
			visible: true,
			markers: [{
				key: "fallback-drawing-hline",
				price: 101.5,
			}],
		});

		const hiddenDrawing = createDrawingObject("hLine", [
			{ x: 1704099600000, y: 101.5 },
		], {
			id: "hidden-drawing",
			visible: false,
		});

		expect(createSelectedPriceLabelsInput(hiddenDrawing, true, "fallback-pane")).toBeNull();
	});
});