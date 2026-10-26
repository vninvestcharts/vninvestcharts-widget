// @vitest-environment jsdom
import { act } from "react";
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

let mockVisibleRange = { from: 0, to: 2 };

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
		bounds: { left: 0, top: 430, width: 1200, height: 200 },
		plotBounds: { left: 0, top: 440, width: 1200, height: 190 },
		axisBounds: {
			right: { left: 1152, top: 430, width: 48, height: 200 },
		},
		headerAnchor: { left: 0, top: 430, width: 1200 },
		labelAnchor: { left: 0, top: 430, height: 200 },
		scaleSlotBounds: { "volume-right": { left: 1152, top: 430, width: 48, height: 200 } },
		scaleSlotStates: { "volume-right": { side: "right", mode: "auto", visible: true, domain: [0, 5000000] } },
	},
];

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
	const React = await import("react");
	const actual = await importOriginal() as Record<string, unknown>;

	return {
		...actual,
		EngineHost(props: {
			className?: string;
			locale?: string;
			onEngineReady?: (engine: unknown) => void;
			onVisibleRangeChange?: (range: { from: number; to: number }) => void;
			style?: React.CSSProperties;
		}) {
			React.useEffect(() => {
				props.onEngineReady?.(mockEngineInstance);
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

const extendedForkRuntimeData = Array.from({ length: 500 }, (_unused, index) => ({
	date: new Date(Date.UTC(2024, 0, 1, 9 + index)),
	open: 100 + index,
	high: 102 + index,
	low: 98 + index,
	close: 101 + index,
	volume: 1_000 + index,
	index,
	dataIndex: index,
}));

describe("VNInvestCharts controlled xExtents", () => {
	let container: HTMLDivElement | null = null;
	let root: ReturnType<typeof createRoot> | null = null;

	beforeEach(() => {
		window.localStorage.clear();
		document.documentElement.lang = "en";
		mockVisibleRange = { from: 0, to: 2 };
		mockEngineInstance.zoomToRange.mockClear();
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

	it("maps controlled xExtents into fork visible range for engine camera", async () => {
		const adapter = createAdapter(Promise.resolve([]), "fork-controlled-x-extents");

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
					xExtents={[forkRuntimeData[0].date, forkRuntimeData[1].date]}
				/>,
			);
			await flushMicrotasks();
		});

		expect(mockEngineInstance.zoomToRange).toHaveBeenCalledWith({ from: 0, to: 2 });
	});

	it("re-applies controlled fork xExtents after temporarily leaving controlled mode", async () => {
		const adapter = createAdapter(Promise.resolve([]), "fork-controlled-x-extents-toggle");
		const prependedData = [
			{
				date: new Date("2024-01-01T08:00:00Z"),
				open: 99,
				high: 101,
				low: 97,
				close: 100,
				volume: 900,
				index: 0,
				dataIndex: 0,
			},
			{
				...forkRuntimeData[0],
				index: 1,
				dataIndex: 1,
			},
			{
				...forkRuntimeData[1],
				index: 2,
				dataIndex: 2,
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
					data={forkRuntimeData as never}
					engineRuntime="fork"
					locale="vi"
					xExtents={[forkRuntimeData[0].date, forkRuntimeData[1].date]}
				/>,
			);
			await flushMicrotasks();
		});

		expect(mockEngineInstance.zoomToRange).toHaveBeenCalledWith({ from: 0, to: 2 });
		mockEngineInstance.zoomToRange.mockClear();

		mockVisibleRange = { from: 0, to: 2 };
		await act(async () => {
			root?.render(
				<VNInvestCharts
					adapter={adapter as never}
					data={prependedData as never}
					engineRuntime="fork"
					locale="vi"
				/>,
			);
			await flushMicrotasks();
		});
		expect(mockEngineInstance.zoomToRange).not.toHaveBeenCalled();

		await act(async () => {
			root?.render(
				<VNInvestCharts
					adapter={adapter as never}
					data={prependedData as never}
					engineRuntime="fork"
					locale="vi"
					xExtents={[forkRuntimeData[0].date, forkRuntimeData[1].date]}
				/>,
			);
			await flushMicrotasks();
		});

		expect(mockEngineInstance.zoomToRange).toHaveBeenCalledWith({ from: 1, to: 3 });
	});

	it("does not force re-zoom on prepended data when controlled xExtents key is unchanged", async () => {
		const adapter = createAdapter(Promise.resolve([]), "fork-controlled-x-extents-prepend");
		const prependedData = [
			{
				date: new Date("2024-01-01T08:00:00Z"),
				open: 99,
				high: 101,
				low: 97,
				close: 100,
				volume: 900,
				index: 0,
				dataIndex: 0,
			},
			{
				...forkRuntimeData[0],
				index: 1,
				dataIndex: 1,
			},
			{
				...forkRuntimeData[1],
				index: 2,
				dataIndex: 2,
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
					data={forkRuntimeData as never}
					engineRuntime="fork"
					locale="vi"
					xExtents={[forkRuntimeData[0].date, forkRuntimeData[1].date]}
				/>,
			);
			await flushMicrotasks();
		});

		mockEngineInstance.zoomToRange.mockClear();
		await act(async () => {
			root?.render(
				<VNInvestCharts
					adapter={adapter as never}
					data={prependedData as never}
					engineRuntime="fork"
					locale="vi"
					xExtents={[forkRuntimeData[0].date, forkRuntimeData[1].date]}
				/>,
			);
			await flushMicrotasks();
		});

		expect(mockEngineInstance.zoomToRange).not.toHaveBeenCalled();
	});

	it("re-applies fork visible range when maxVisibleBars changes", async () => {
		const adapter = createAdapter(Promise.resolve([]), "fork-max-visible-bars");
		mockVisibleRange = { from: 100, to: 300 };

		container = document.createElement("div");
		container.style.width = "1200px";
		container.style.height = "720px";
		document.body.appendChild(container);
		root = createRoot(container);

		await act(async () => {
			root?.render(
				<VNInvestCharts
					adapter={adapter as never}
					data={extendedForkRuntimeData as never}
					engineRuntime="fork"
					locale="vi"
					maxVisibleBars={200}
				/>,
			);
			await flushMicrotasks();
		});

		expect(mockEngineInstance.zoomToRange).not.toHaveBeenCalled();

		await act(async () => {
			root?.render(
				<VNInvestCharts
					adapter={adapter as never}
					data={extendedForkRuntimeData as never}
					engineRuntime="fork"
					locale="vi"
					maxVisibleBars={400}
				/>,
			);
			await flushMicrotasks();
		});

		expect(mockEngineInstance.zoomToRange).not.toHaveBeenCalled();
	});
});