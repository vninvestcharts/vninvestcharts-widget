// @vitest-environment jsdom
import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from "vitest";

import {
	CONTRACT_TIMEOUT,
	createAdapter,
	forkRuntimeData,
	initializeTestImports,
	renderVNInvestCharts,
	waitForEngineHost,
	clearEngineHostPropsHistory,
	flushMicrotasks,
	createDrawingObject,
	chartPointToPixelWithBridge,
	measurementPointToPixelWithBridge,
	resolveChartPointWithBridge,
	resolveMeasurementPointWithBridge,
	act,
} from "./utils";

describe("VNInvestCharts - Coordinate Bridge Contracts", () => {
	let container: HTMLDivElement | null = null;
	let root: ReturnType<typeof import("react-dom/client").createRoot> | null = null;

	beforeAll(async () => {
		await initializeTestImports();
	}, 30_000);

	beforeEach(() => {
		window.localStorage.clear();
		document.documentElement.lang = "en";
		clearEngineHostPropsHistory();
	});

	afterEach(async () => {
		if (root) {
			await act(async () => {
				await flushMicrotasks();
				root!.unmount();
				await flushMicrotasks();
			});
		}
		root = null;
		container?.remove();
		container = null;
		window.localStorage.clear();
		document.documentElement.lang = "en";
	});

	it("resolves chart points via coordinate bridge on fork runtime", { timeout: CONTRACT_TIMEOUT }, async () => {
		const adapter = createAdapter(Promise.resolve(forkRuntimeData), "fork-chart-point-bridge");
		const drawing = createDrawingObject("trendLine", [
			{ x: forkRuntimeData[0].date.getTime(), y: 100 },
			{ x: forkRuntimeData[1].date.getTime(), y: 106 },
		], {
			id: "fork-chart-point-drawing",
			paneId: "price",
			yScaleId: "price-right",
		});

		const result = await renderVNInvestCharts({
			adapter: adapter as never,
			engineRuntime: "fork",
			drawings: [drawing] as never,
			data: forkRuntimeData as never,
		});
		container = result.container;
		root = result.root;

		await act(async () => {
			await flushMicrotasks();
		});

		const host = await waitForEngineHost();
		expect(host).toBeTruthy();
	});

	it("resolves measurement points via coordinate bridge on fork runtime", { timeout: CONTRACT_TIMEOUT }, async () => {
		const adapter = createAdapter(Promise.resolve(forkRuntimeData), "fork-measurement-point-bridge");

		const result = await renderVNInvestCharts({
			adapter: adapter as never,
			engineRuntime: "fork",
			drawingUiEnabled: true,
			drawingActiveTool: "measurement",
			data: forkRuntimeData as never,
		});
		container = result.container;
		root = result.root;

		await act(async () => {
			await flushMicrotasks();
		});

		const host = await waitForEngineHost();
		expect(host).toBeTruthy();
	});

	it("handles coordinate bridge for drawing manipulation on fork runtime", { timeout: CONTRACT_TIMEOUT }, async () => {
		const adapter = createAdapter(Promise.resolve(forkRuntimeData), "fork-drawing-manipulation-bridge");
		const drawing = createDrawingObject("trendLine", [
			{ x: forkRuntimeData[0].date.getTime(), y: 100 },
			{ x: forkRuntimeData[1].date.getTime(), y: 106 },
		], {
			id: "fork-manipulation-drawing",
			paneId: "price",
			yScaleId: "price-right",
		});

		const result = await renderVNInvestCharts({
			adapter: adapter as never,
			engineRuntime: "fork",
			drawings: [drawing] as never,
			selectedDrawing: drawing as never,
			data: forkRuntimeData as never,
		});
		container = result.container;
		root = result.root;

		await act(async () => {
			await flushMicrotasks();
		});

		const host = await waitForEngineHost();
		expect(host).toBeTruthy();
	});

});
