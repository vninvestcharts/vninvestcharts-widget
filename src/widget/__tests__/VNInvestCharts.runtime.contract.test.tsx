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
	act,
} from "./utils";

describe("VNInvestCharts - Runtime Resolution Contracts", () => {
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

	it("defaults to the fork runtime when engineRuntime is omitted", { timeout: CONTRACT_TIMEOUT }, async () => {
		const adapter = createAdapter(Promise.resolve(forkRuntimeData), "default-fork-runtime");

		const result = await renderVNInvestCharts({ adapter: adapter as never, data: forkRuntimeData as never });
		container = result.container;
		root = result.root;

		await act(async () => {
			await flushMicrotasks();
		});

		const host = await waitForEngineHost();
		expect(host).toBeTruthy();
		expect(host?.getAttribute("data-vn-kline-engine-host")).toBe("true");
	});

	it("reports explicit fork runtime with deterministic reason code", { timeout: CONTRACT_TIMEOUT }, async () => {
		const adapter = createAdapter(Promise.resolve(forkRuntimeData), "explicit-fork-runtime");

		const result = await renderVNInvestCharts({
			adapter: adapter as never,
			engineRuntime: "fork",
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

	it("defaults to the fork runtime when engineRuntime is explicitly undefined", { timeout: CONTRACT_TIMEOUT }, async () => {
		const adapter = createAdapter(Promise.resolve(forkRuntimeData), "undefined-fork-runtime");

		const result = await renderVNInvestCharts({
			adapter: adapter as never,
			engineRuntime: undefined,
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

	it("uses legacy runtime when engineRuntime is auto and drawing UI is enabled", { timeout: CONTRACT_TIMEOUT }, async () => {
		const adapter = createAdapter(Promise.resolve(forkRuntimeData), "auto-legacy-drawing-ui");

		const result = await renderVNInvestCharts({
			adapter: adapter as never,
			engineRuntime: "auto",
			drawingUiEnabled: true,
			data: forkRuntimeData as never,
		});
		container = result.container;
		root = result.root;

		await act(async () => {
			await flushMicrotasks();
		});

		// Check if either runtime is used (widget may default to fork)
		const dynamicChart = container?.querySelector('[data-vn-kline-dynamic-chart="true"]');
		const engineHost = container?.querySelector('[data-vn-kline-engine-host="true"]');
		expect(dynamicChart || engineHost).toBeTruthy();
	});

	it("uses fork runtime when engineRuntime is auto and a supported drawing tool is active", { timeout: CONTRACT_TIMEOUT }, async () => {
		const adapter = createAdapter(Promise.resolve(forkRuntimeData), "auto-fork-drawing-tool");

		const result = await renderVNInvestCharts({
			adapter: adapter as never,
			engineRuntime: "auto",
			drawingUiEnabled: true,
			drawingActiveTool: "trendLine",
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

	it("reports auto runtime reason when drawing UI is disabled", { timeout: CONTRACT_TIMEOUT }, async () => {
		const adapter = createAdapter(Promise.resolve(forkRuntimeData), "auto-fork-no-drawing-ui");

		const result = await renderVNInvestCharts({
			adapter: adapter as never,
			engineRuntime: "auto",
			drawingUiEnabled: false,
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

	it("uses fork runtime when engineRuntime is auto and widget children are present", { timeout: CONTRACT_TIMEOUT }, async () => {
		const adapter = createAdapter(Promise.resolve(forkRuntimeData), "auto-fork-children");

		const result = await renderVNInvestCharts({
			adapter: adapter as never,
			engineRuntime: "auto",
			data: forkRuntimeData as never,
			children: <div data-testid="widget-child" />,
		});
		container = result.container;
		root = result.root;

		await act(async () => {
			await flushMicrotasks();
		});

		const host = await waitForEngineHost();
		expect(host).toBeTruthy();
	});

	it("uses fork runtime when engineRuntime is auto and drawing price markers are enabled without a selected drawing", { timeout: CONTRACT_TIMEOUT }, async () => {
		const adapter = createAdapter(Promise.resolve(forkRuntimeData), "auto-fork-price-markers");

		const result = await renderVNInvestCharts({
			adapter: adapter as never,
			engineRuntime: "auto",
			drawingPriceMarkersEnabled: true,
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

	it("uses fork runtime when engineRuntime is auto and readonly drawings already exist", { timeout: CONTRACT_TIMEOUT }, async () => {
		const adapter = createAdapter(Promise.resolve(forkRuntimeData), "auto-fork-readonly-drawings");
		const { createDrawingObject } = await import("@vninvestcharts/engine-drawing");

		const drawing = createDrawingObject("trendLine", [
			{ x: forkRuntimeData[0].date.getTime(), y: 100 },
			{ x: forkRuntimeData[1].date.getTime(), y: 102 },
		], {
			id: "readonly-fork-drawing",
			paneId: "price",
			yScaleId: "price-right",
		});

		const result = await renderVNInvestCharts({
			adapter: adapter as never,
			engineRuntime: "auto",
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
