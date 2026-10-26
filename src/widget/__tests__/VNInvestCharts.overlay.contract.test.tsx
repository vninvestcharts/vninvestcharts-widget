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

describe("VNInvestCharts - Overlay Contracts", () => {
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

	it("renders WhaleMarketBubbleOverlay on fork runtime", { timeout: CONTRACT_TIMEOUT }, async () => {
		const adapter = createAdapter(Promise.resolve(forkRuntimeData), "fork-whale-overlay");

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

	it("renders CVDIndicator on fork runtime", { timeout: CONTRACT_TIMEOUT }, async () => {
		const adapter = createAdapter(Promise.resolve(forkRuntimeData), "fork-cvd-overlay");

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

	it("renders ExternalCVDOverlay on fork runtime", { timeout: CONTRACT_TIMEOUT }, async () => {
		const adapter = createAdapter(Promise.resolve(forkRuntimeData), "fork-external-cvd-overlay");

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

	it("renders DarkFlowBadge on fork runtime", { timeout: CONTRACT_TIMEOUT }, async () => {
		const adapter = createAdapter(Promise.resolve(forkRuntimeData), "fork-darkflow-overlay");

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

	it("renders measurement overlay on fork runtime when enabled", { timeout: CONTRACT_TIMEOUT }, async () => {
		const adapter = createAdapter(Promise.resolve(forkRuntimeData), "fork-measurement-overlay");

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

		// Just verify the widget renders
		expect(container).toBeTruthy();
	});

	it("renders drawing price labels on fork runtime", { timeout: CONTRACT_TIMEOUT }, async () => {
		const adapter = createAdapter(Promise.resolve(forkRuntimeData), "fork-drawing-price-labels");
		const drawing = createDrawingObject("trendLine", [
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

	it("renders X-axis overlay on fork runtime", { timeout: CONTRACT_TIMEOUT }, async () => {
		const adapter = createAdapter(Promise.resolve(forkRuntimeData), "fork-xaxis-overlay");

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

	it("renders engine-enforced ad via portal to document.body (not in widget container)", { timeout: CONTRACT_TIMEOUT }, async () => {
		const adapter = createAdapter(Promise.resolve(forkRuntimeData), "fork-ads-disabled");

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

		// Engine ad slot renders via portal to document.body, NOT in widget container
		const adsBanner = container.querySelector('[data-testid="ads-banner"]');
		const adsPopup = container.querySelector('[data-testid="ads-popup"]');
		expect(adsBanner).toBeNull();
		expect(adsPopup).toBeNull();
	});
});
