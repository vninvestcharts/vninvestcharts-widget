import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { PaneRuntimeSnapshot } from "@vninvestcharts/engine-core";

import type { MeasurementCoordinateBridge } from "@vninvestcharts/engine-drawing";
import { createDrawingObject } from "@vninvestcharts/engine-drawing";
import DrawingPriceLabelsOverlay from "./DrawingPriceLabelsOverlay";

const paneSnapshots = [
	{
		paneId: "price",
		bounds: { left: 0, top: 0, width: 1200, height: 420 },
		plotBounds: { left: 0, top: 28, width: 1200, height: 392 },
		axisBounds: {
			right: { left: 1152, top: 0, width: 48, height: 420 },
		},
		headerAnchor: { left: 0, top: 0, width: 1200 },
		labelAnchor: { left: 0, top: 0, height: 420 },
		scaleSlotBounds: { "price-right": { left: 1152, top: 0, width: 48, height: 420 } },
		scaleSlotStates: { "price-right": { side: "right", mode: "auto", visible: true, domain: [98, 107] } },
	},
] as const satisfies readonly PaneRuntimeSnapshot[];

describe("DrawingPriceLabelsOverlay", () => {
	it("renders engine-backed price labels for fork runtime", () => {
		const markup = renderToStaticMarkup(
			<DrawingPriceLabelsOverlay
				enabled
				renderMode="engine"
				runtime="fork"
				priceFormat={(value: number) => value.toFixed(2)}
				enginePriceLabels={{
					drawingId: "engine-drawing",
					paneId: "price",
					scaleSlotId: "price-right",
					highlighted: true,
					labels: [{
						key: "engine-drawing-anchor",
						price: 111.25,
						y: 156,
						side: "right",
						fill: "#f59e0b",
						stroke: "#f59e0b",
						textColor: "#FFFFFF",
					}],
				}}
				height={720}
				width={1200}
			/>,
		);

		expect(markup).toContain('data-rsc-drawing-price-labels="fork"');
		expect(markup).toContain('data-rsc-drawing-price-labels-source="engine"');
		expect(markup).toContain('data-rsc-drawing-price-label="engine-drawing-anchor"');
		expect(markup).toContain("111.25");
	});

	it("renders bridge-backed price labels on the fork runtime", () => {
		const drawing = createDrawingObject("trendLine", [
			{ x: 1704099600000, y: 100 },
			{ x: 1704103200000, y: 106 },
		], {
			id: "legacy-drawing",
			paneId: "price",
			yScaleId: "price-right",
		});
		const coordinateBridge: MeasurementCoordinateBridge = {
			resolveChartPoint: vi.fn(),
			chartPointToPixel: vi.fn(() => ({ x: 1180, y: 156 })),
			resolveMeasurementPoint: vi.fn(),
			measurementPointToPixel: vi.fn(() => ({ x: 1180, y: 156 })),
		};

		const markup = renderToStaticMarkup(
			<DrawingPriceLabelsOverlay
				enabled
				runtime="fork"
				priceFormat={(value: number) => value.toFixed(2)}
				drawing={drawing}
				coordinateBridge={coordinateBridge}
				paneSnapshots={paneSnapshots}
				height={720}
				width={1200}
			/>,
		);

		expect(markup).toContain('data-rsc-drawing-price-labels="fork"');
		expect(markup).toContain('data-rsc-drawing-price-label="legacy-drawing-anchor"');
		expect(markup).toContain("106.00");
	});

	it("stops rendering when the selected drawing is removed", () => {
		const coordinateBridge: MeasurementCoordinateBridge = {
			resolveChartPoint: vi.fn(),
			chartPointToPixel: vi.fn(() => ({ x: 1180, y: 156 })),
			resolveMeasurementPoint: vi.fn(),
			measurementPointToPixel: vi.fn(() => ({ x: 1180, y: 156 })),
		};

		const markup = renderToStaticMarkup(
			<DrawingPriceLabelsOverlay
				enabled
				runtime="fork"
				priceFormat={(value: number) => value.toFixed(2)}
				drawing={null}
				coordinateBridge={coordinateBridge}
				paneSnapshots={paneSnapshots}
				height={720}
				width={1200}
			/>,
		);

		expect(markup).toBe("");
	});
});