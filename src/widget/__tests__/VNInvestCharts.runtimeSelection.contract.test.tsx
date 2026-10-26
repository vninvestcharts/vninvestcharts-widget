// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { VNInvestCharts } from "../VNInvestCharts";

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
const originalConsoleError = console.error;
console.error = (..._args: unknown[]) => {};

vi.mock("../../lib/core/hooks/useCanvasResize", () => {
	const ref = { current: null as HTMLDivElement | null };
	return {
		useCanvasResize: () => ({
			ref,
			size: { width: 1200, height: 720 },
		}),
	};
});

const forkEngineSnapshots = [
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
	{
		paneId: "volume",
		bounds: { left: 0, top: 420, width: 1200, height: 180 },
		plotBounds: { left: 0, top: 448, width: 1200, height: 152 },
		axisBounds: {
			right: { left: 1152, top: 420, width: 48, height: 180 },
		},
		headerAnchor: { left: 0, top: 420, width: 1200 },
		labelAnchor: { left: 0, top: 420, height: 180 },
		scaleSlotBounds: { "volume-right": { left: 1152, top: 420, width: 48, height: 180 } },
		scaleSlotStates: { "volume-right": { side: "right", mode: "auto", visible: true, domain: [1200, 1500] } },
	},
] as const;

const engineHostPropsHistory: Array<Record<string, unknown>> = [];
let mockVisibleRange = { from: 0, to: 2 };

const mockEngineInstance = {
	mount: vi.fn(),
	dispose: vi.fn(),
	setPaneSpecs: vi.fn(),
	setDataSource: vi.fn(),
	setEnrichedData: vi.fn(),
	setHistorySnapshot: vi.fn(),
	setCameraState: vi.fn(),
	setOverlayInputs: vi.fn(),
	getCameraState: vi.fn(() => ({ barSpacePx: 8, rightOffsetBars: 0, followLatest: true })),
	getDirtyMask: vi.fn(() => 0),
	getLastFlushedMask: vi.fn(() => 0),
	getAxisGridRendererCalls: vi.fn(() => 0),
	resetAxisGridRendererCalls: vi.fn(),
	isMounted: vi.fn(() => true),
	addListener: vi.fn(),
	removeListener: vi.fn(),
	setTheme: vi.fn(),
	setLocale: vi.fn(),
	setVisibleRange: vi.fn(),
	zoomToRange: vi.fn(),
	getVisibleRange: vi.fn(() => mockVisibleRange),
	getPaneSnapshots: vi.fn(() => forkEngineSnapshots),
	hitTestDrawingPrimitive: vi.fn(() => null),
};

vi.mock("@vninvestcharts/engine-react", async (importOriginal) => {
	// NOTE: do NOT dynamically import react here — nested import("react") inside
	// mock factories silently disables interception (use the static import above).
	const actual = await importOriginal() as Record<string, unknown>;

	return {
		...actual,
		EngineHost(props: {
			className?: string;
			dataSource?: unknown;
			locale?: string;
			onEngineReady?: (engine: unknown) => void;
			onPaneSnapshotsChange?: (snapshots: readonly unknown[]) => void;
			onVisibleRangeChange?: (range: { from: number; to: number }) => void;
			style?: React.CSSProperties;
		}) {
			engineHostPropsHistory.push(props as unknown as Record<string, unknown>);
			React.useEffect(() => {
				props.onEngineReady?.(mockEngineInstance);
				props.onPaneSnapshotsChange?.(forkEngineSnapshots);
				props.onVisibleRangeChange?.(mockVisibleRange);
			}, []);

			return (
				<div data-vn-kline-engine-host="true" className={props.className} style={props.style}>
					<div data-vn-kline-engine="surface" data-locale={props.locale} />
				</div>
			);
		},
	};
});

function createAdapter(fetchBarsPromise: Promise<any[]>, label: string) {
	const fetchBarsInRange = vi.fn().mockReturnValue(fetchBarsPromise);
	const fetchBarsBefore = vi.fn().mockResolvedValue([]);
	return {
		fetchBarsInRange,
		fetchBarsBefore,
		fetchBars: fetchBarsInRange,
		fetchMoreBars: fetchBarsBefore,
		subscribeToBar: vi.fn().mockReturnValue(() => {}),
		subscribeToTrades: vi.fn().mockReturnValue(() => {}),
		subscribeToOrderbook: vi.fn().mockReturnValue(() => {}),
		searchSymbols: vi.fn().mockResolvedValue([]),
		label,
	};
}

async function flushMicrotasks() {
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
}

async function waitForTruthyValue<T>(resolveValue: () => T | undefined, attempts = 6) {
	for (let attempt = 0; attempt < attempts; attempt += 1) {
		const value = resolveValue();
		if (value) {
			return value;
		}
		await act(async () => {
			await flushMicrotasks();
		});
	}

	throw new Error("Expected truthy value before timeout");
}

const forkRuntimeData = [
	{
		date: new Date("2024-01-01T09:00:00Z"),
		open: 100,
		high: 105,
		low: 98,
		close: 103,
		volume: 1200,
		index: 0,
		dataIndex: 0,
	},
	{
		date: new Date("2024-01-01T10:00:00Z"),
		open: 103,
		high: 107,
		low: 101,
		close: 106,
		volume: 1500,
		index: 1,
		dataIndex: 1,
	},
];

describe("VNInvestCharts runtime selection and host contracts", () => {
	let container: HTMLDivElement | null = null;
	let root: ReturnType<typeof createRoot> | null = null;

	beforeEach(() => {
		window.localStorage.clear();
		document.documentElement.lang = "en";
		mockVisibleRange = { from: 0, to: 2 };
		engineHostPropsHistory.length = 0;
	});

	afterEach(async () => {
		await act(async () => {
			await flushMicrotasks();
			root?.unmount();
			await flushMicrotasks();
		});
		root = null;
		container?.remove();
		container = null;
		window.localStorage.clear();
		document.documentElement.lang = "en";
	});

	afterAll(() => {
		console.error = originalConsoleError;
	});

	it("uses fork runtime when engineRuntime is auto for a series-only surface", async () => {
		const adapter = createAdapter(Promise.resolve([]), "auto-runtime-series-only");
		const handleRuntimeCapabilitiesChange = vi.fn();

		container = document.createElement("div");
		container.style.width = "1200px";
		container.style.height = "720px";
		document.body.appendChild(container);
		root = createRoot(container);

		await act(async () => {
			root?.render(
				<VNInvestCharts
					adapter={adapter as never}
					data={forkRuntimeData as never}
					engineRuntime="auto"
					locale="vi"
					onRuntimeCapabilitiesChange={handleRuntimeCapabilitiesChange}
				/>,
			);
			await flushMicrotasks();
		});

		expect(container.querySelector('[data-vn-kline-engine-host="true"]')).not.toBeNull();

		const capabilities = await waitForTruthyValue(() => handleRuntimeCapabilitiesChange.mock.calls
			.map((call) => call[0])
			.findLast((value) => value?.engineRuntime === "fork"));
		expect(capabilities).toMatchObject({
			engineRuntime: "fork",
			chartCanvasOverlays: true,
			drawingOverlays: true,
		});
	});

	it("still honors explicit fork runtime even when auto would choose legacy", async () => {
		const adapter = createAdapter(Promise.resolve([]), "explicit-fork-overrides-auto-policy");
		const handleRuntimeCapabilitiesChange = vi.fn();

		container = document.createElement("div");
		container.style.width = "1200px";
		container.style.height = "720px";
		document.body.appendChild(container);
		root = createRoot(container);

		await act(async () => {
			root?.render(
				<VNInvestCharts
					adapter={adapter as never}
					data={forkRuntimeData as never}
					engineRuntime="fork"
					drawingUiEnabled
					locale="vi"
					onRuntimeCapabilitiesChange={handleRuntimeCapabilitiesChange}
				/>,
			);
			await flushMicrotasks();
		});

		expect(container.querySelector('[data-vn-kline-engine-host="true"]')).not.toBeNull();

		const capabilities = await waitForTruthyValue(() => handleRuntimeCapabilitiesChange.mock.calls
			.map((call) => call[0])
			.findLast((value) => value?.engineRuntime === "fork"));
		expect(capabilities).toMatchObject({
			engineRuntime: "fork",
			chartCanvasOverlays: true,
			drawingOverlays: true,
		});
	});

	it("mounts the experimental fork runtime host when requested", async () => {
		const adapter = createAdapter(Promise.resolve([]), "fork-host");

		container = document.createElement("div");
		container.style.width = "1200px";
		container.style.height = "720px";
		document.body.appendChild(container);
		root = createRoot(container);

		await act(async () => {
			root?.render(
				<VNInvestCharts
					adapter={adapter as never}
					data={forkRuntimeData as never}
					engineRuntime="fork"
					locale="vi"
				/>,
			);
		});

		const host = container.querySelector('[data-vn-kline-engine-host="true"]');
		const surface = container.querySelector('[data-vn-kline-engine="surface"]') as HTMLDivElement | null;

		expect(host).not.toBeNull();
		expect(surface).not.toBeNull();
		expect(surface?.dataset.locale).toBe("vi");
		expect(adapter.fetchBars).not.toHaveBeenCalled();
	});

	it("passes oscillator-aware series data to fork engine host", async () => {
		const adapter = createAdapter(Promise.resolve([]), "fork-series-data");
		const data = Array.from({ length: 80 }, (_, index) => {
			const close = 100 + Math.sin(index / 4) * 12 + index * 0.15;
			const open = index % 2 === 0 ? close - 2 : close + 2;
			return {
				date: new Date(2024, 0, 1, index),
				open,
				high: Math.max(open, close) + 3,
				low: Math.min(open, close) - 3,
				close,
				volume: 120000 + index * 1000,
				index,
				dataIndex: index,
			};
		});

		const panes = [
			{
				id: "momentum",
				label: "Momentum",
				pinned: false,
				visible: true,
				heightRatio: 0.5,
				splitScale: true,
				tooltip: "value",
				series: [
					{ id: "macd-series", type: "MACD", yAxis: "right", params: { fast: 12, slow: 26, signal: 9 } },
				],
			},
			{
				id: "orderflow",
				label: "Order Flow",
				pinned: false,
				visible: true,
				heightRatio: 0.5,
				splitScale: false,
				tooltip: "value",
				series: [
					{ id: "whale-series", type: "Whale", yAxis: "right", params: { threshold: 1 } },
					{ id: "cvd-series", type: "CVDApprox", yAxis: "right" },
				],
			},
		];

		container = document.createElement("div");
		container.style.width = "1200px";
		container.style.height = "720px";
		document.body.appendChild(container);
		root = createRoot(container);

		await act(async () => {
			root?.render(
				<VNInvestCharts
					adapter={adapter as never}
					data={data as never}
					panes={panes as never}
					engineRuntime="fork"
				/>,
			);
			await flushMicrotasks();
		});

		const latestHostProps = engineHostPropsHistory.at(-1);
		// Current fork contract (post-e59ec41 SSOT cleanup): the engine receives
		// oscillator series as pane/series CONFIGS via the `panes` prop (it resolves
		// bars + computes indicators itself). There is no `dataSource.seriesData`.
		const enginePanes = (latestHostProps?.panes ?? []) as Array<{
			id?: string;
			visible?: boolean;
			series?: Array<{ id?: string; type?: string; params?: Record<string, unknown> }>;
		}>;
		const momentum = enginePanes.find((pane) => pane.id === "momentum");
		const orderflow = enginePanes.find((pane) => pane.id === "orderflow");
		expect(momentum?.visible).toBe(true);
		expect(orderflow?.visible).toBe(true);
		const macd = momentum?.series?.find((series) => series.id === "macd-series");
		expect(macd?.type).toBe("MACD");
		expect(macd?.params).toEqual({ fast: 12, slow: 26, signal: 9 });
		const whale = orderflow?.series?.find((series) => series.id === "whale-series");
		const cvd = orderflow?.series?.find((series) => series.id === "cvd-series");
		expect(whale?.type).toBe("Whale");
		expect(cvd?.type).toBe("CVDApprox");
	});

	it("keeps fork runtime when no canvas pixels are produced under explicit fork request", async () => {
		const adapter = createAdapter(Promise.resolve([]), "fork-degrade");
		const handleRuntimeCapabilitiesChange = vi.fn();
		const getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => ({
			getImageData: () => ({ data: new Uint8ClampedArray([0, 0, 0, 0]) }),
		} as unknown as CanvasRenderingContext2D));

		container = document.createElement("div");
		container.style.width = "1200px";
		container.style.height = "720px";
		document.body.appendChild(container);
		root = createRoot(container);

		await act(async () => {
			root?.render(
				<VNInvestCharts
					adapter={adapter as never}
					data={forkRuntimeData as never}
					engineRuntime="fork"
					onRuntimeCapabilitiesChange={handleRuntimeCapabilitiesChange}
				/>,
			);
		});

		await act(async () => {
			await new Promise((resolve) => window.setTimeout(resolve, 1400));
			await flushMicrotasks();
		});

		const legacyCapabilities = handleRuntimeCapabilitiesChange.mock.calls
			.map((call) => call[0])
			.findLast((value) => value?.engineRuntime === "legacy");
		expect(legacyCapabilities).toBeUndefined();

		const forkCapabilities = handleRuntimeCapabilitiesChange.mock.calls
			.map((call) => call[0])
			.findLast((value) => value?.engineRuntime === "fork");
		expect(forkCapabilities).toMatchObject({
			engineRuntime: "fork",
			chartCanvasOverlays: false,
			drawingOverlays: true,
		});

		getContextSpy.mockRestore();
	});
});