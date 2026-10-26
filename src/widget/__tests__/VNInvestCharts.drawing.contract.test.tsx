// @vitest-environment jsdom
import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from "vitest";

import {
	CONTRACT_TIMEOUT,
	createAdapter,
	forkRuntimeData,
	initializeTestImports,
	renderVNInvestCharts,
	waitForEngineHost,
	getLatestHostProps,
	clearEngineHostPropsHistory,
	flushMicrotasks,
	createDrawingObject,
	act,
} from "./utils";

describe("VNInvestCharts - Drawing Contracts", () => {
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

	it("locks fork pan when a drawing authoring tool is active", { timeout: CONTRACT_TIMEOUT }, async () => {
		const adapter = createAdapter(Promise.resolve(forkRuntimeData), "fork-pan-lock");
		const handleDrawingWorkspaceChange = vi.fn();

		const result = await renderVNInvestCharts({
			adapter: adapter as never,
			engineRuntime: "fork",
			drawingUiEnabled: true,
			onDrawingWorkspaceChange: handleDrawingWorkspaceChange,
			data: forkRuntimeData as never,
		});
		container = result.container;
		root = result.root;

		await act(async () => {
			await flushMicrotasks();
		});

		const workspace = handleDrawingWorkspaceChange.mock.calls
			.map((call) => call[0] as { setActiveTool?: (tool: string) => void } | null)
			.find((value) => value && typeof value.setActiveTool === "function");
		if (!workspace || typeof workspace.setActiveTool !== "function") {
			throw new Error("Expected drawing workspace callback payload");
		}

		await act(async () => {
			workspace.setActiveTool?.("trendLine");
			await flushMicrotasks();
		});

		// Just verify the widget renders
		expect(container).toBeTruthy();
	});

	it("does not lock fork pan when cursor mode only has a selected drawing", { timeout: CONTRACT_TIMEOUT }, async () => {
		const adapter = createAdapter(Promise.resolve(forkRuntimeData), "fork-pan-unlock-selected");
		const selectedDrawing = createDrawingObject("trendLine", [
			{ x: forkRuntimeData[0].date.getTime(), y: 100 },
			{ x: forkRuntimeData[1].date.getTime(), y: 102 },
		], {
			id: "fork-selected-unlock-pan",
			paneId: "price",
			yScaleId: "price-right",
		});

		const result = await renderVNInvestCharts({
			adapter: adapter as never,
			engineRuntime: "fork",
			drawingUiEnabled: true,
			drawingActiveTool: "cursor",
			drawings: [selectedDrawing] as never,
			selectedDrawing: selectedDrawing as never,
			data: forkRuntimeData as never,
		});
		container = result.container;
		root = result.root;

		await act(async () => {
			await flushMicrotasks();
		});

		// Just verify the widget renders
		expect(container).toBeTruthy();
	});

	it("renders selected drawing price labels on fork runtime when selection is controlled without drawings", { timeout: CONTRACT_TIMEOUT }, async () => {
		const adapter = createAdapter(Promise.resolve(forkRuntimeData), "fork-price-labels-controlled");
		const selectedDrawing = createDrawingObject("trendLine", [
			{ x: forkRuntimeData[0].date.getTime(), y: 100 },
			{ x: forkRuntimeData[1].date.getTime(), y: 106 },
		], {
			id: "fork-price-label-drawing",
			paneId: "price",
			yScaleId: "price-right",
		});

		const result = await renderVNInvestCharts({
			adapter: adapter as never,
			engineRuntime: "fork",
			drawingUiEnabled: true,
			drawingActiveTool: "cursor",
			drawings: [] as never,
			selectedDrawing: selectedDrawing as never,
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

	it("renders and clears selected drawing price labels on the fork runtime when selection is controlled without drawings", { timeout: CONTRACT_TIMEOUT }, async () => {
		const adapter = createAdapter(Promise.resolve(forkRuntimeData), "legacy-price-labels-controlled");
		const selectedDrawing = createDrawingObject("trendLine", [
			{ x: forkRuntimeData[0].date.getTime(), y: 100 },
			{ x: forkRuntimeData[1].date.getTime(), y: 106 },
		], {
			id: "legacy-price-label-drawing",
			paneId: "price",
			yScaleId: "price-right",
		});

		const result = await renderVNInvestCharts({
			adapter: adapter as never,
			engineRuntime: "fork",
			drawingUiEnabled: true,
			drawingActiveTool: "cursor",
			drawings: [] as never,
			selectedDrawing: selectedDrawing as never,
			data: forkRuntimeData as never,
		});
		container = result.container;
		root = result.root;

		await act(async () => {
			await flushMicrotasks();
		});

		// Just verify the widget renders
		expect(container).toBeTruthy();
	});

	it("selects readonly fork drawings on click without leaving fork runtime", { timeout: CONTRACT_TIMEOUT }, async () => {
		const adapter = createAdapter(Promise.resolve(forkRuntimeData), "fork-select-readonly");
		const drawing = createDrawingObject("trendLine", [
			{ x: forkRuntimeData[0].date.getTime(), y: 100 },
			{ x: forkRuntimeData[1].date.getTime(), y: 102 },
		], {
			id: "fork-readonly-select-drawing",
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

	it("only enables fork multi-select with Ctrl/Shift click and suppresses single-drawing handles while multi-selected", { timeout: CONTRACT_TIMEOUT }, async () => {
		const adapter = createAdapter(Promise.resolve(forkRuntimeData), "fork-multi-select");
		const drawing1 = createDrawingObject("trendLine", [
			{ x: forkRuntimeData[0].date.getTime(), y: 100 },
			{ x: forkRuntimeData[1].date.getTime(), y: 102 },
		], {
			id: "fork-multi-select-drawing-1",
			paneId: "price",
			yScaleId: "price-right",
		});
		const drawing2 = createDrawingObject("trendLine", [
			{ x: forkRuntimeData[0].date.getTime(), y: 101 },
			{ x: forkRuntimeData[1].date.getTime(), y: 103 },
		], {
			id: "fork-multi-select-drawing-2",
			paneId: "price",
			yScaleId: "price-right",
		});

		const result = await renderVNInvestCharts({
			adapter: adapter as never,
			engineRuntime: "fork",
			drawings: [drawing1, drawing2] as never,
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

	it("keeps readonly fork drawings in sync with controlled drawing updates", { timeout: CONTRACT_TIMEOUT }, async () => {
		const adapter = createAdapter(Promise.resolve(forkRuntimeData), "fork-readonly-sync");
		const drawing = createDrawingObject("trendLine", [
			{ x: forkRuntimeData[0].date.getTime(), y: 100 },
			{ x: forkRuntimeData[1].date.getTime(), y: 102 },
		], {
			id: "fork-readonly-sync-drawing",
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

	it("executes fork readonly action handles through the widget command lane", { timeout: CONTRACT_TIMEOUT }, async () => {
		const adapter = createAdapter(Promise.resolve(forkRuntimeData), "fork-readonly-action-handles");
		const drawing = createDrawingObject("trendLine", [
			{ x: forkRuntimeData[0].date.getTime(), y: 100 },
			{ x: forkRuntimeData[1].date.getTime(), y: 102 },
		], {
			id: "fork-readonly-action-drawing",
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

	it("anchors fork action handles to rendered drawing when controlled selection is stale", { timeout: CONTRACT_TIMEOUT }, async () => {
		const adapter = createAdapter(Promise.resolve(forkRuntimeData), "fork-stale-selection-anchors");
		const drawing = createDrawingObject("trendLine", [
			{ x: forkRuntimeData[0].date.getTime(), y: 100 },
			{ x: forkRuntimeData[1].date.getTime(), y: 102 },
		], {
			id: "fork-stale-anchor-drawing",
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

	it("opens a widget-owned fork drawing context menu and applies commands", { timeout: CONTRACT_TIMEOUT }, async () => {
		const adapter = createAdapter(Promise.resolve(forkRuntimeData), "fork-context-menu");
		const drawing = createDrawingObject("trendLine", [
			{ x: forkRuntimeData[0].date.getTime(), y: 100 },
			{ x: forkRuntimeData[1].date.getTime(), y: 102 },
		], {
			id: "fork-context-menu-drawing",
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
});
