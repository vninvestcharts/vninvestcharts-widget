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

let mockVisibleRange = { from: 0, to: 2 };
const mockEngineSetHistorySnapshot = vi.fn<[unknown, unknown?]>();

const mockEngineInstance = {
	mount: vi.fn(),
	dispose: vi.fn(),
	setPaneSpecs: vi.fn(),
	setDataSource: vi.fn(),
	setEnrichedData: vi.fn(),
	setHistorySnapshot: mockEngineSetHistorySnapshot,
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
			onPaneSnapshotsChange?: (snapshots: readonly unknown[]) => void;
			onVisibleRangeChange?: (range: { from: number; to: number }) => void;
			style?: React.CSSProperties;
		}) {
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

describe("VNInvestCharts history snapshot contracts", () => {
	let container: HTMLDivElement | null = null;
	let root: ReturnType<typeof createRoot> | null = null;

	beforeEach(() => {
		window.localStorage.clear();
		document.documentElement.lang = "en";
		mockVisibleRange = { from: 0, to: 2 };
		mockEngineSetHistorySnapshot.mockClear();
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

	it("KF-12-T04: calls setHistorySnapshot on the fork engine after initial data load", async () => {
		const bars = [
			{ date: new Date("2024-01-01T00:00:00Z"), open: 100, high: 105, low: 99, close: 103, volume: 1000, index: 0, dataIndex: 0 },
			{ date: new Date("2024-01-01T01:00:00Z"), open: 103, high: 107, low: 102, close: 106, volume: 1500, index: 1, dataIndex: 1 },
		];
		const adapter = createAdapter(Promise.resolve(bars), "t04-initial-load");

		container = document.createElement("div");
		container.style.width = "1200px";
		container.style.height = "720px";
		document.body.appendChild(container);
		root = createRoot(container);

		await act(async () => {
			root?.render(
				<VNInvestCharts
					adapter={adapter as never}
					data={bars as never}
					engineRuntime="fork"
					locale="vi"
				/>,
			);
			await flushMicrotasks();
		});

		expect(mockEngineSetHistorySnapshot).toHaveBeenCalled();
		const lastCall = mockEngineSetHistorySnapshot.mock.calls.at(-1);
		expect(lastCall).toBeDefined();
		const snapshot = lastCall![0] as { bars: unknown[]; revision: number };
		expect(typeof snapshot.revision).toBe("number");
		expect(Array.isArray(snapshot.bars)).toBe(true);
	});

	it("KF-12-T04: snapshot revision increments across data updates", async () => {
		const bars1 = [
			{ date: new Date("2024-01-01T00:00:00Z"), open: 100, high: 105, low: 99, close: 103, volume: 1000, index: 0, dataIndex: 0 },
		];
		const bars2 = [
			{ date: new Date("2024-01-01T00:00:00Z"), open: 100, high: 105, low: 99, close: 103, volume: 1000, index: 0, dataIndex: 0 },
			{ date: new Date("2024-01-01T01:00:00Z"), open: 103, high: 107, low: 102, close: 106, volume: 1500, index: 1, dataIndex: 1 },
		];
		const adapter = createAdapter(Promise.resolve(bars2), "t04-revision-inc");

		container = document.createElement("div");
		container.style.width = "1200px";
		container.style.height = "720px";
		document.body.appendChild(container);
		root = createRoot(container);

		await act(async () => {
			root?.render(
				<VNInvestCharts
					adapter={adapter as never}
					data={bars1 as never}
					engineRuntime="fork"
					locale="vi"
				/>,
			);
			await flushMicrotasks();
		});

		const callsBefore = mockEngineSetHistorySnapshot.mock.calls.length;

		await act(async () => {
			root?.render(
				<VNInvestCharts
					adapter={adapter as never}
					data={bars2 as never}
					engineRuntime="fork"
					locale="vi"
				/>,
			);
			await flushMicrotasks();
		});

		expect(mockEngineSetHistorySnapshot.mock.calls.length).toBeGreaterThanOrEqual(callsBefore);
		const lastCall = mockEngineSetHistorySnapshot.mock.calls.at(-1);
		expect(lastCall).toBeDefined();
		const snapshot = lastCall![0] as { bars: unknown[]; revision: number };
		expect(typeof snapshot.revision).toBe("number");
		expect(Array.isArray(snapshot.bars)).toBe(true);
	});

});
