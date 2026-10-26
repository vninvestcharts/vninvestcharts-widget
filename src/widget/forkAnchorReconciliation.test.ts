import { describe, expect, it } from "vitest";
import { createDateTimeIndexMap } from "@vninvestcharts/engine-core";
import { createDrawingObject } from "@vninvestcharts/engine-drawing";
import { reconcileForkDrawingIndexAnchors } from "./forkAnchorReconciliation";

const plotData = [
	{ date: new Date("2026-01-01T00:00:00.000Z") },
	{ date: new Date("2026-01-01T01:00:00.000Z") },
	{ date: new Date("2026-01-01T02:00:00.000Z") },
	{ date: new Date("2026-01-01T03:00:00.000Z") },
];

describe("forkAnchorReconciliation", () => {
	it("reconciles stale xIndexFloat values from time anchors", () => {
		const timeIndexMap = createDateTimeIndexMap(plotData);
		const drawing = createDrawingObject("ellipse", [
			{
				x: plotData[2].date.getTime(),
				y: 10,
				timeMsHint: plotData[2].date.getTime(),
				xIndexFloat: 0.5,
			},
			{
				x: plotData[3].date.getTime(),
				y: 12,
				timeMsHint: plotData[3].date.getTime(),
				xIndexFloat: 1.5,
			},
		], {
			id: "stale-index",
		});

		const reconciled = reconcileForkDrawingIndexAnchors([drawing], timeIndexMap);

		expect(reconciled.changed).toBe(true);
		expect(reconciled.drawings[0].points[0].xIndexFloat).toBeCloseTo(2, 6);
		expect(reconciled.drawings[0].points[1].xIndexFloat).toBeCloseTo(3, 6);
	});

	it("hydrates missing xIndexFloat from timeMsHint", () => {
		const timeIndexMap = createDateTimeIndexMap(plotData);
		const drawing = createDrawingObject("circle", [
			{
				x: plotData[1].date.getTime(),
				y: 20,
				timeMsHint: plotData[1].date.getTime(),
			},
			{
				x: plotData[2].date.getTime(),
				y: 25,
				timeMsHint: plotData[2].date.getTime(),
			},
		], {
			id: "missing-index",
		});

		const reconciled = reconcileForkDrawingIndexAnchors([drawing], timeIndexMap);

		expect(reconciled.changed).toBe(true);
		expect(reconciled.drawings[0].points[0].xIndexFloat).toBeCloseTo(1, 6);
		expect(reconciled.drawings[0].points[1].xIndexFloat).toBeCloseTo(2, 6);
	});

	it("reconciles stale yPrice anchors to canonical point.y values", () => {
		const timeIndexMap = createDateTimeIndexMap(plotData);
		const drawing = createDrawingObject("circle", [
			{
				x: plotData[1].date.getTime(),
				y: 20,
				timeMsHint: plotData[1].date.getTime(),
				xIndexFloat: 1,
				yPrice: 25,
			},
			{
				x: plotData[2].date.getTime(),
				y: 24,
				timeMsHint: plotData[2].date.getTime(),
				xIndexFloat: 2,
				yPrice: 30,
			},
		], {
			id: "stale-y-price",
		});

		const reconciled = reconcileForkDrawingIndexAnchors([drawing], timeIndexMap);

		expect(reconciled.changed).toBe(true);
		expect(reconciled.drawings[0].points[0].yPrice).toBe(20);
		expect(reconciled.drawings[0].points[1].yPrice).toBe(24);
	});

	it("keeps legacy non-timestamp x points unchanged", () => {
		const timeIndexMap = createDateTimeIndexMap(plotData);
		const drawing = createDrawingObject("trendLine", [
			{ x: 150, y: 1 },
			{ x: 250, y: 2 },
		], {
			id: "legacy-pixel-x",
		});

		const reconciled = reconcileForkDrawingIndexAnchors([drawing], timeIndexMap);

		expect(reconciled.changed).toBe(false);
		expect(reconciled.drawings[0]).toBe(drawing);
	});
});
