import { describe, expect, it } from "vitest";
import type { PaneRuntimeSnapshot } from "@vninvestcharts/engine-core";

import { createDrawingObject } from "@vninvestcharts/engine-drawing";
import { createForkDrawingPrimitiveInputs } from "./ForkDrawingsOverlay";

function createPaneSnapshot(): PaneRuntimeSnapshot {
	return {
		paneId: "price",
		plotBounds: { left: 0, top: 0, width: 1000, height: 400 },
		scaleSlotBounds: {
			"price-left": { left: 0, top: 0, width: 48, height: 400 },
			"price-right": { left: 952, top: 0, width: 48, height: 400 },
		},
		scaleSlotStates: {
			"price-left": { side: "left", mode: "auto", visible: true, domain: [80, 120] },
			"price-right": { side: "right", mode: "auto", visible: true, domain: [98, 107] },
		},
	} as unknown as PaneRuntimeSnapshot;
}

const plotData = [
	{ date: new Date("2026-01-01T00:00:00.000Z"), open: 100, high: 101, low: 99, close: 100, volume: 1000 },
	{ date: new Date("2026-01-01T01:00:00.000Z"), open: 101, high: 102, low: 100, close: 101, volume: 900 },
	{ date: new Date("2026-01-01T02:00:00.000Z"), open: 102, high: 103, low: 101, close: 102, volume: 1100 },
] as const;

describe("ForkDrawingsOverlay", () => {
	it("marks all selected drawings in multi-select mode without action handles", () => {
		const first = createDrawingObject("rectangle", [
			{ x: plotData[0].date.getTime(), y: 100, timeMsHint: plotData[0].date.getTime(), xIndexFloat: 0, yPrice: 100 },
			{ x: plotData[1].date.getTime(), y: 102, timeMsHint: plotData[1].date.getTime(), xIndexFloat: 1, yPrice: 102 },
		], { id: "drawing-a", paneId: "price", yScaleId: "price-right" });
		const second = createDrawingObject("rectangle", [
			{ x: plotData[1].date.getTime(), y: 101, timeMsHint: plotData[1].date.getTime(), xIndexFloat: 1, yPrice: 101 },
			{ x: plotData[2].date.getTime(), y: 103, timeMsHint: plotData[2].date.getTime(), xIndexFloat: 2, yPrice: 103 },
		], { id: "drawing-b", paneId: "price", yScaleId: "price-right" });

		const inputs = createForkDrawingPrimitiveInputs({
			drawings: [first, second],
			selectedDrawing: null,
			selectedDrawingIds: ["drawing-a", "drawing-b"],
			paneSnapshots: [createPaneSnapshot()],
			visibleRange: { from: 0, to: 2 },
			plotData: plotData as never,
		});

		expect(inputs.filter((input) => input.selected).map((input) => input.drawingId).sort()).toEqual(["drawing-a", "drawing-b"]);
		expect(inputs.some((input) => input.actionHandle)).toBe(false);
	});

	it("keeps primitives renderable when price is outside current visible domain", () => {
		const farPriceLine = createDrawingObject("hLine", [
			{ x: plotData[1].date.getTime(), y: 130, timeMsHint: plotData[1].date.getTime(), xIndexFloat: 1, yPrice: 130 },
		], { id: "far-price", paneId: "price", yScaleId: "price-right" });

		const inputs = createForkDrawingPrimitiveInputs({
			drawings: [farPriceLine],
			selectedDrawing: farPriceLine,
			selectedDrawingIds: ["far-price"],
			paneSnapshots: [createPaneSnapshot()],
			visibleRange: { from: 0, to: 2 },
			plotData: plotData as never,
		});

		expect(inputs.length).toBeGreaterThan(0);
		const linePrimitive = inputs.find((input) => input.drawingId === "far-price" && !input.actionHandle)?.primitive as {
			points?: Array<{ x: number; y: number }>;
		};
		expect(linePrimitive?.points?.[0]?.y).toBeTypeOf("number");
		expect(Number.isFinite(linePrimitive?.points?.[0]?.y ?? Number.NaN)).toBe(true);
	});

	it("keeps drawing-requested visible yScaleId for strict legacy parity", () => {
		const leftAnchoredDrawing = createDrawingObject("hLine", [
			{ x: plotData[1].date.getTime(), y: 102, timeMsHint: plotData[1].date.getTime(), xIndexFloat: 1, yPrice: 102 },
		], { id: "left-anchored", paneId: "price", yScaleId: "price-left" });

		const inputs = createForkDrawingPrimitiveInputs({
			drawings: [leftAnchoredDrawing],
			selectedDrawing: leftAnchoredDrawing,
			selectedDrawingIds: ["left-anchored"],
			paneSnapshots: [createPaneSnapshot()],
			visibleRange: { from: 0, to: 2 },
			plotData: plotData as never,
		});

		const basePrimitive = inputs.find((input) => input.drawingId === "left-anchored" && !input.actionHandle);
		expect(basePrimitive?.scaleSlotId).toBe("price-left");
	});
});
