// @vitest-environment jsdom
// BLACKSCREEN-FIX regression lock: data arriving BEFORE the engine finishes
// init must still reach the engine once it becomes ready. Previously the
// useWidgetData push effect consumed prev refs on the no-engine skip, so the
// later ready-transition compared equal hashes and never pushed → black chart
// with zero errors until the next data change (e.g. adding a comparison).
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
	isMounted: vi.fn(() => true),
	addListener: vi.fn(),
	removeListener: vi.fn(),
	setTheme: vi.fn(),
	setLocale: vi.fn(),
	setVisibleRange: vi.fn(),
	zoomToRange: vi.fn(),
	getVisibleRange: vi.fn(() => ({ from: 0, to: 2 })),
	getPaneSnapshots: vi.fn(() => []),
	hitTestDrawingPrimitive: vi.fn(() => null),
};

// Gate: the mock host captures props but does NOT fire onEngineReady until
// the test releases it — this reproduces engine-init AFTER data arrival.
let pendingReady: ((engine: unknown) => void) | null = null;

vi.mock("@vninvestcharts/engine-react", async (importOriginal) => {
	const React = await import("react");
	const actual = await importOriginal() as Record<string, unknown>;

	return {
		...actual,
		EngineHost(props: { onEngineReady?: (engine: unknown) => void }) {
			React.useEffect(() => {
				if (props.onEngineReady) {
					pendingReady = props.onEngineReady;
				}
			}, []);
			return <div data-vn-kline-engine-host="true" />;
		},
	};
});

function createAdapter(fetchBarsPromise: Promise<any[]>) {
	const fetchBarsInRange = vi.fn().mockReturnValue(fetchBarsPromise);
	return {
		fetchBarsInRange,
		fetchBarsBefore: vi.fn().mockResolvedValue([]),
		fetchBars: fetchBarsInRange,
		fetchMoreBars: vi.fn().mockResolvedValue([]),
		subscribeToBar: vi.fn().mockReturnValue(() => {}),
		subscribeToTrades: vi.fn().mockReturnValue(() => {}),
		subscribeToOrderbook: vi.fn().mockReturnValue(() => {}),
		searchSymbols: vi.fn().mockResolvedValue([]),
	};
}

async function flushMicrotasks() {
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
}

const raceBars = [
	{ date: new Date("2024-01-01T09:00:00Z"), open: 100, high: 105, low: 98, close: 103, volume: 1200, index: 0, dataIndex: 0 },
	{ date: new Date("2024-01-01T10:00:00Z"), open: 103, high: 107, low: 101, close: 106, volume: 1500, index: 1, dataIndex: 1 },
];

function snapshotHasBars(): boolean {
	return mockEngineInstance.setHistorySnapshot.mock.calls.some(([snapshot]) => {
		const bars = (snapshot as { bars?: unknown[] })?.bars;
		return Array.isArray(bars) && bars.length === raceBars.length;
	});
}

function enrichedHasBars(): boolean {
	return mockEngineInstance.setEnrichedData.mock.calls.some(
		(data) => Array.isArray(data) && data.length === raceBars.length,
	);
}

describe("VNInvestCharts engine-ready race (BLACKSCREEN-FIX)", () => {
	let container: HTMLDivElement | null = null;
	let root: ReturnType<typeof createRoot> | null = null;

	beforeEach(() => {
		window.localStorage.clear();
		document.documentElement.lang = "en";
		pendingReady = null;
		mockEngineInstance.setHistorySnapshot.mockClear();
		mockEngineInstance.setEnrichedData.mockClear();
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

	it("pushes pending data to the engine when it becomes ready after data arrival", async () => {
		let resolveBars: ((bars: any[]) => void) | null = null;
		const fetchDeferred = new Promise<any[]>((resolve) => {
			resolveBars = resolve;
		});
		const adapter = createAdapter(fetchDeferred);

		container = document.createElement("div");
		container.style.width = "1200px";
		container.style.height = "720px";
		document.body.appendChild(container);
		root = createRoot(container);

		await act(async () => {
			root!.render(<VNInvestCharts adapter={adapter as never} engineRuntime="fork" />);
			await flushMicrotasks();
		});

		// 1. Data lands while the engine is NOT ready yet.
		await act(async () => {
			resolveBars!(raceBars);
			await flushMicrotasks();
		});
		expect(pendingReady).not.toBeNull();
		// Nothing containing bars may have been pushed (no engine to push to).
		expect(snapshotHasBars()).toBe(false);
		expect(enrichedHasBars()).toBe(false);

		// 2. Engine finishes init afterwards → pending data MUST be pushed.
		await act(async () => {
			pendingReady!(mockEngineInstance);
			await flushMicrotasks();
		});
		expect(snapshotHasBars() || enrichedHasBars()).toBe(true);
	}, 60_000);
});
