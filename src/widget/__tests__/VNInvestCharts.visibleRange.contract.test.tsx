// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { VNInvestCharts } from "../VNInvestCharts";

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
const originalConsoleError = console.error;

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
	getVisibleRange: vi.fn(() => ({ from: 0, to: 1 })),
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

function createDenseData(length = 6000) {
	return Array.from({ length }, (_value, index) => {
		const base = 20000 + index;
		return {
			date: new Date(Date.UTC(2023, 0, 1, index)),
			open: base,
			high: base + 100,
			low: base - 100,
			close: base + 20,
			volume: 1000 + (index % 200),
			index,
			dataIndex: index,
		};
	});
}

describe("VNInvestCharts fork visible range contracts", () => {
	let container: HTMLDivElement | null = null;
	let root: ReturnType<typeof createRoot> | null = null;

	beforeEach(() => {
		window.localStorage.clear();
		document.documentElement.lang = "en";
		mockVisibleRange = { from: 0, to: 2 };
		engineHostPropsHistory.length = 0;
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

	async function renderForkChart(options?: {
		adapterLabel?: string;
		data?: typeof forkRuntimeData;
		onVisibleRangeChange?: ReturnType<typeof vi.fn>;
		onVisibleDomainChange?: ReturnType<typeof vi.fn>;
	}) {
		const adapter = createAdapter(Promise.resolve([]), options?.adapterLabel ?? "fork-visible-range");
		container = document.createElement("div");
		container.style.width = "1200px";
		container.style.height = "720px";
		document.body.appendChild(container);
		root = createRoot(container);

		await act(async () => {
			root?.render(
				<VNInvestCharts
					adapter={adapter as never}
					data={(options?.data ?? forkRuntimeData) as never}
					engineRuntime="fork"
					locale="vi"
					onVisibleRangeChange={options?.onVisibleRangeChange}
					onVisibleDomainChange={options?.onVisibleDomainChange}
				/>,
			);
			await flushMicrotasks();
		});

		// Flush any passive effects and microtasks queued during mount/initial effects
		await act(async () => {
			await flushMicrotasks();
		});

		return {
			adapter,
			latestHostProps: engineHostPropsHistory[engineHostPropsHistory.length - 1] as {
				onVisibleRangeChange?: (range: { from: number; to: number }) => void;
			},
		};
	}

	it("normalizes fork visible-range updates back into the widget contract", async () => {
		const handleVisibleRangeChange = vi.fn();
		const handleVisibleDomainChange = vi.fn();

		await renderForkChart({
			adapterLabel: "fork-visible-range",
			onVisibleRangeChange: handleVisibleRangeChange,
			onVisibleDomainChange: handleVisibleDomainChange,
		});

		expect(handleVisibleRangeChange).toHaveBeenCalledWith(expect.objectContaining({
			startIndex: 0,
			endIndex: 1,
			startDate: forkRuntimeData[0].date,
			endDate: forkRuntimeData[1].date,
			barCount: 2,
		}));
		// B3: single emit path — one engine event must produce exactly one emit.
		expect(handleVisibleRangeChange).toHaveBeenCalledTimes(1);
		expect(handleVisibleDomainChange).toHaveBeenCalledWith([
			forkRuntimeData[0].date,
			forkRuntimeData[1].date,
		]);
	});

	it("normalizes reversed fork visible-range updates back into the widget contract", async () => {
		const handleVisibleRangeChange = vi.fn();
		const handleVisibleDomainChange = vi.fn();
		mockVisibleRange = { from: 2, to: 0 };

		await renderForkChart({
			adapterLabel: "fork-visible-range-reversed",
			onVisibleRangeChange: handleVisibleRangeChange,
			onVisibleDomainChange: handleVisibleDomainChange,
		});

		expect(handleVisibleRangeChange).toHaveBeenCalledWith(expect.objectContaining({
			startIndex: 0,
			endIndex: 1,
			startDate: forkRuntimeData[0].date,
			endDate: forkRuntimeData[1].date,
			barCount: 2,
		}));
		// B3: single emit path — one engine event must produce exactly one emit.
		expect(handleVisibleRangeChange).toHaveBeenCalledTimes(1);
		expect(handleVisibleDomainChange).toHaveBeenCalledWith([
			forkRuntimeData[0].date,
			forkRuntimeData[1].date,
		]);
	});

	it("re-anchors fork camera when deep zoom pan-left drifts fully outside loaded bars", async () => {
		const handleVisibleRangeChange = vi.fn();
		const { latestHostProps } = await renderForkChart({
			adapterLabel: "fork-visible-range-pan-left-anchor",
			onVisibleRangeChange: handleVisibleRangeChange,
		});

		handleVisibleRangeChange.mockClear();
		expect(typeof latestHostProps.onVisibleRangeChange).toBe("function");

		await act(async () => {
			const activeProps = engineHostPropsHistory[engineHostPropsHistory.length - 1] as any;
			activeProps.onVisibleRangeChange?.({ from: -3.8, to: -3.2 });
			await flushMicrotasks();
		});

		expect(mockEngineInstance.zoomToRange).not.toHaveBeenCalled();
		// Z3-07: left overscroll extrapolates time (sync-safe) while indices stay
		// clamped — rawStart = floor(-3.8) = -4 → 4h before the first bar.
		expect(handleVisibleRangeChange).toHaveBeenCalledWith(expect.objectContaining({
			startIndex: 0,
			endIndex: 0,
			startDate: new Date(forkRuntimeData[0].date.getTime() - 4 * 3_600_000),
			endDate: forkRuntimeData[0].date,
			barCount: 1,
		}));
		// B3: single emit path — one engine event must produce exactly one emit.
		expect(handleVisibleRangeChange).toHaveBeenCalledTimes(1);
	});

	it("re-anchors fork camera when deep pan-left leaves only tiny overlap with loaded bars", async () => {
		const handleVisibleRangeChange = vi.fn();
		const { latestHostProps } = await renderForkChart({
			adapterLabel: "fork-visible-range-pan-left-mostly-blank",
			onVisibleRangeChange: handleVisibleRangeChange,
		});

		handleVisibleRangeChange.mockClear();
		expect(typeof latestHostProps.onVisibleRangeChange).toBe("function");

		await act(async () => {
			const activeProps = engineHostPropsHistory[engineHostPropsHistory.length - 1] as any;
			activeProps.onVisibleRangeChange?.({ from: -40, to: 2 });
			await flushMicrotasks();
		});

		expect(mockEngineInstance.zoomToRange).not.toHaveBeenCalled();
		// Z3-07: rawStart = -40 → 40h before the first bar; indices clamped.
		expect(handleVisibleRangeChange).toHaveBeenCalledWith(expect.objectContaining({
			startIndex: 0,
			endIndex: 1,
			startDate: new Date(forkRuntimeData[0].date.getTime() - 40 * 3_600_000),
			endDate: forkRuntimeData[1].date,
			barCount: 42,
		}));
		// B3: single emit path — one engine event must produce exactly one emit.
		expect(handleVisibleRangeChange).toHaveBeenCalledTimes(1);
	});

	it("keeps prior zoom span when recovering from extreme out-of-bounds fork range", async () => {
		const handleVisibleRangeChange = vi.fn();
		const { latestHostProps } = await renderForkChart({
			adapterLabel: "fork-visible-range-preserve-span",
			onVisibleRangeChange: handleVisibleRangeChange,
		});

		handleVisibleRangeChange.mockClear();
		expect(typeof latestHostProps.onVisibleRangeChange).toBe("function");

		await act(async () => {
			const activeProps = engineHostPropsHistory[engineHostPropsHistory.length - 1] as any;
			activeProps.onVisibleRangeChange?.({ from: -50000, to: 10000 });
			await flushMicrotasks();
		});

		expect(mockEngineInstance.zoomToRange).not.toHaveBeenCalled();
		// Z3-07: extreme overscroll keeps clamped indices; time + span stay truthful.
		// rawStart = -50000 → 50000h before bar 0; rawEnd = ceil(10000)-1 = 9999
		// → 9998 bars after the last bar (both sides extrapolate, indices clamp).
		expect(handleVisibleRangeChange).toHaveBeenCalledWith(expect.objectContaining({
			startIndex: 0,
			endIndex: 1,
			startDate: new Date(forkRuntimeData[0].date.getTime() - 50_000 * 3_600_000),
			endDate: new Date(forkRuntimeData[1].date.getTime() + 9_998 * 3_600_000),
			barCount: 60000,
		}));
		// B3: single emit path — one engine event must produce exactly one emit.
		expect(handleVisibleRangeChange).toHaveBeenCalledTimes(1);
	});

	it("keeps fork zoom continuous for in-bounds dense visible ranges (no hard cap)", async () => {
		const handleVisibleRangeChange = vi.fn();
		const denseData = createDenseData();
		const { latestHostProps } = await renderForkChart({
			adapterLabel: "fork-visible-range-density-limit",
			data: denseData as typeof forkRuntimeData,
			onVisibleRangeChange: handleVisibleRangeChange,
		});

		handleVisibleRangeChange.mockClear();
		expect(typeof latestHostProps.onVisibleRangeChange).toBe("function");

		await act(async () => {
			const activeProps = engineHostPropsHistory[engineHostPropsHistory.length - 1] as any;
			activeProps.onVisibleRangeChange?.({ from: 0, to: 6000 });
			await flushMicrotasks();
		});

		expect(mockEngineInstance.zoomToRange).not.toHaveBeenCalled();
		expect(handleVisibleRangeChange).toHaveBeenCalledWith(expect.objectContaining({
			barCount: 6000,
		}));
	});

	it("re-anchors fork camera when zoom drifts partially outside loaded bars", async () => {
		const handleVisibleRangeChange = vi.fn();
		const denseData = createDenseData();
		const { latestHostProps } = await renderForkChart({
			adapterLabel: "fork-visible-range-partial-outside",
			data: denseData as typeof forkRuntimeData,
			onVisibleRangeChange: handleVisibleRangeChange,
		});

		handleVisibleRangeChange.mockClear();
		expect(typeof latestHostProps.onVisibleRangeChange).toBe("function");

		await act(async () => {
			const activeProps = engineHostPropsHistory[engineHostPropsHistory.length - 1] as any;
			activeProps.onVisibleRangeChange?.({ from: -4_000, to: 6_000 });
			await flushMicrotasks();
		});

		expect(mockEngineInstance.zoomToRange).not.toHaveBeenCalled();
		// Z3-07: raw span (-4000..6000) is truthful; indices stay clamped to data.
		expect(handleVisibleRangeChange).toHaveBeenCalledWith(expect.objectContaining({
			startIndex: 0,
			endIndex: 5999,
			barCount: 10000,
		}));
	});

	it("pins fork camera to the right edge when zooming into empty right-side space", async () => {
		const handleVisibleRangeChange = vi.fn();
		const { latestHostProps } = await renderForkChart({
			adapterLabel: "fork-visible-range-right-edge-pin",
			onVisibleRangeChange: handleVisibleRangeChange,
		});

		handleVisibleRangeChange.mockClear();
		expect(typeof latestHostProps.onVisibleRangeChange).toBe("function");

		await act(async () => {
			const activeProps = engineHostPropsHistory[engineHostPropsHistory.length - 1] as any;
			activeProps.onVisibleRangeChange?.({ from: 1, to: 10 });
			await flushMicrotasks();
		});

		expect(mockEngineInstance.zoomToRange).not.toHaveBeenCalled();
		// Z3-07: right-side empty space extrapolates the end time (2 bars → rawEnd
		// 9 → 8h after the last bar); indices stay clamped for safe indexing.
		expect(handleVisibleRangeChange).toHaveBeenCalledWith(expect.objectContaining({
			startIndex: 1,
			endIndex: 1,
			startDate: forkRuntimeData[1].date,
			endDate: new Date(forkRuntimeData[1].date.getTime() + 8 * 3_600_000),
			barCount: 9,
		}));
		// B3: single emit path — one engine event must produce exactly one emit.
		expect(handleVisibleRangeChange).toHaveBeenCalledTimes(1);
	});
});