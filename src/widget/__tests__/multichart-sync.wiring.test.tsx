// @vitest-environment jsdom
// P0-c/C1 — mount-real wiring locks for multichart sync (SY-18 partial).
// Full stack, mocked edges: real GridContainer + VNInvestCharts + SyncContext,
// mocked EngineHost (per-symbol engine mocks) + symbol-keyed adapter data.
// Chart A = AAA crypto-like (500 continuous daily bars).
// Chart B = BBB stock-like (2000 weekday-only daily bars, same epoch).

import { act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";

import { GridContainer } from "../components/layout/GridContainer";
import { SyncContextShareProvider } from "../context/SyncContextShare";
// Production provider nesting mirrored from VNInvestMultiCharts (1630-1674):
// per-mount RequestCoordinator/BackfillDedup/SharedBarStore isolate history
// sessions between mounts. Without them, hooks fall back to a MODULE-LEVEL
// singleton coordinator whose cross-test state starves later mounts of data.
import { RequestCoordinatorProvider } from "../history/RequestCoordinator";
import { BackfillDedupProvider } from "../history/BackfillDedupContext";
import { SharedBarStoreProvider } from "../history/SharedBarStoreContext";
import {
	SyncProvider,
	useSyncContext,
	createVirtualClockAdapter,
	createMockBroadcastChannelAdapter,
} from "@vninvestcharts/engine-react";
import type { MultiChartConfig } from "../VNInvestMultiCharts";
import type { GridLayout } from "../grid/types";

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

if (typeof globalThis.crypto === "undefined") {
	(globalThis as any).crypto = { randomUUID: () => `test-${Math.random()}` };
} else if (!("randomUUID" in globalThis.crypto)) {
	(globalThis.crypto as any).randomUUID = () => `test-${Math.random()}`;
}

vi.mock("../../lib/core/hooks/useCanvasResize", () => {
	const ref = { current: null as HTMLDivElement | null };
	return {
		useCanvasResize: () => ({
			ref,
			size: { width: 1200, height: 720 },
		}),
	};
});

// Per-symbol mock engines + latest EngineHost props, keyed by dataSource.symbol.
interface HostEntry {
	engine: Record<string, any>;
	props: Record<string, any>;
}
const hostRegistry = new Map<string, HostEntry>();

function makeMockEngine() {
	return {
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
		setTheme: vi.fn(),
		setLocale: vi.fn(),
		setVisibleRange: vi.fn(),
		zoomToRange: vi.fn(),
		getVisibleRange: vi.fn(() => ({ from: 0, to: 100000 })),
		getPaneSnapshots: vi.fn(() => [pricePaneSnapshot]),
		dataIndexToPixelX: vi.fn(() => 100),
		priceToPixelY: vi.fn((_pane: unknown, _slot: unknown, price: number) => price),
		setCrosshairPos: vi.fn(),
		addListener: vi.fn(),
		removeListener: vi.fn(),
		isMounted: vi.fn(() => true),
		hitTestDrawingPrimitive: vi.fn(() => null),
	};
}

const pricePaneSnapshot = {
	paneId: "price",
	bounds: { left: 0, top: 0, width: 1200, height: 420 },
	plotBounds: { left: 0, top: 28, width: 1200, height: 392 },
	axisBounds: {
		right: { left: 1152, top: 0, width: 48, height: 420 },
	},
	headerAnchor: { left: 0, top: 0, width: 1200 },
	labelAnchor: { left: 0, top: 0, height: 420 },
	scaleSlotBounds: { "price-right": { left: 1152, top: 0, width: 48, height: 420 } },
	scaleSlotStates: { "price-right": { side: "right", mode: "auto", visible: true, domain: [0, 100000] } },
};

vi.mock("@vninvestcharts/engine-react", async (importOriginal) => {
	const React = await import("react");
	const actual = await importOriginal() as Record<string, unknown>;

	return {
		...actual,
		EngineHost(props: Record<string, any>) {
			const symbol = (props.dataSource as any)?.symbol ?? "unknown";
			let entry = hostRegistry.get(symbol);
			if (!entry) {
				entry = { engine: makeMockEngine(), props };
				hostRegistry.set(symbol, entry);
			}
			entry.props = props;
			React.useEffect(() => {
				props.onEngineReady?.(entry.engine);
				props.onPaneSnapshotsChange?.([pricePaneSnapshot]);
			}, []);
			return React.createElement("div", { "data-vn-kline-engine-host": "true" });
		},
	};
});

const DAY = 86_400_000;
const EPOCH = Date.UTC(2020, 0, 1);

function makeBar(t: number, i: number) {
	return {
		date: new Date(t),
		open: 100 + i,
		high: 101 + i,
		low: 99 + i,
		close: 100 + i,
		volume: 1000 + i,
		index: i,
		dataIndex: i,
	};
}

// AAA: 500 continuous daily bars (crypto-like,ข้าง weekends included).
const barsAAA = Array.from({ length: 500 }, (_, i) => makeBar(EPOCH + i * DAY, i));
// BBB: 2000 weekday-only daily bars from the same epoch (stock-like).
const barsBBB: ReturnType<typeof makeBar>[] = [];
{
	let t = EPOCH;
	let i = 0;
	while (barsBBB.length < 2000) {
		const dow = new Date(t).getUTCDay();
		if (dow !== 0 && dow !== 6) {
			barsBBB.push(makeBar(t, i));
			i++;
		}
		t += DAY;
	}
}
const barsBySymbol: Record<string, ReturnType<typeof makeBar>[]> = { AAA: barsAAA, BBB: barsBBB };

function createAdapter() {
	return {
		fetchBarsInRange: vi.fn(async (symbol: string) => barsBySymbol[symbol] ?? []),
		fetchBarsBefore: vi.fn(async () => []),
		fetchBars: vi.fn(async (symbol: string) => barsBySymbol[symbol] ?? []),
		fetchMoreBars: vi.fn(async () => []),
		subscribeToBar: vi.fn().mockReturnValue(() => {}),
		subscribeToTrades: vi.fn().mockReturnValue(() => {}),
		subscribeToOrderbook: vi.fn().mockReturnValue(() => {}),
		searchSymbols: vi.fn().mockResolvedValue([]),
	};
}

const charts: MultiChartConfig[] = [
	{ id: "chart-A", symbol: "AAA", timeframe: "1D" },
	{ id: "chart-B", symbol: "BBB", timeframe: "1D" },
];
const layout: GridLayout = {
	rows: 1,
	cols: 2,
	slots: [
		{ id: "chart-A", rowStart: 1, rowEnd: 1, colStart: 1, colEnd: 1 },
		{ id: "chart-B", rowStart: 1, rowEnd: 1, colStart: 2, colEnd: 2 },
	],
	rowSizes: ["1fr"],
	colSizes: ["1fr", "1fr"],
};
const SYNC_ALL_ON = {
	visibleRange: true,
	crosshair: true,
	drawings: true,
	symbolLinks: true,
	timeframe: true,
	chartType: true,
	replay: true,
	time: true,
};

async function flush(times = 5) {
	for (let i = 0; i < times; i++) {
		await Promise.resolve();
	}
	await new Promise((resolve) => setTimeout(resolve, 0));
	for (let i = 0; i < times; i++) {
		await Promise.resolve();
	}
}

function Bridge({ children }: { children: ReactNode }) {
	const syncContext = useSyncContext();
	capturedSyncContext.current = syncContext;
	return <SyncContextShareProvider syncContext={syncContext}>{children}</SyncContextShareProvider>;
}

// Captured live SyncContextValue per mount (lets tests observe broadcasts).
const capturedSyncContext: { current: any } = { current: null };

function countBroadcasts() {
	const ctx = capturedSyncContext.current;
	const counts = { visibleRange: 0, crosshair: 0 };
	if (!ctx || (ctx as any).__counted) return counts;
	(ctx as any).__counted = true;
	for (const key of ["visibleRange", "crosshair"] as const) {
		const setter = key === "visibleRange" ? "setVisibleRange" : "setCrosshair";
		const orig = ctx[setter].bind(ctx);
		ctx[setter] = (...args: any[]) => {
			counts[key]++;
			return orig(...args);
		};
	}
	return counts;
}

interface Mounted {
	container: HTMLDivElement;
	root: ReturnType<typeof createRoot>;
	adapter: ReturnType<typeof createAdapter>;
	chartRefs: { current: Map<string, { current: any }> };
	clock: ReturnType<typeof createVirtualClockAdapter>;
	rerender: (syncSettings?: Record<string, boolean>, overrides?: Record<string, Record<string, boolean>>) => Promise<void>;
}

async function mountGrid(
	syncSettings: Record<string, boolean> = SYNC_ALL_ON,
	overrides?: Record<string, Record<string, boolean>>,
): Promise<Mounted> {
	const adapter = createAdapter();
	const container = document.createElement("div");
	container.style.width = "1200px";
	container.style.height = "720px";
	document.body.appendChild(container);
	const root = createRoot(container);
	const chartRefs = { current: new Map() } as any;
	const chartHandles = { current: new Map() } as any;
	const clock = createVirtualClockAdapter(0);
	// Hoisted per mount: inline recreation would churn provider value identity
	// ( hence orphaning spies AND resubscribing cross-tab effects on rerender).
	const broadcastChannelAdapter = createMockBroadcastChannelAdapter() as any;

	const render = (settings: Record<string, boolean>, overrideMap?: Record<string, Record<string, boolean>>) => {
		root.render(
			<SyncProvider
				clockAdapter={clock as any}
				broadcastChannelAdapter={broadcastChannelAdapter}
			>
				<RequestCoordinatorProvider>
					<BackfillDedupProvider>
						<SharedBarStoreProvider>
							<Bridge>
								<GridContainer
									charts={charts}
									layout={layout}
									activeChartId="chart-A"
									syncSettings={settings as any}
									syncOverrideMap={overrideMap}
									defaultChartProps={{ adapter, engineRuntime: "fork", locale: "en" } as any}
									chartRefs={chartRefs}
									chartHandles={chartHandles}
									setActiveChart={() => {}}
									addChart={() => {}}
								/>
							</Bridge>
						</SharedBarStoreProvider>
					</BackfillDedupProvider>
				</RequestCoordinatorProvider>
			</SyncProvider>,
		);
	};

	await act(async () => {
		render(syncSettings, overrides);
		await flush(10);
	});

	// Wait until both charts committed data (engine received enriched data).
	await waitFor(() => {
		expect(hostRegistry.get("AAA")?.engine.setEnrichedData).toHaveBeenCalled();
		expect(hostRegistry.get("BBB")?.engine.setEnrichedData).toHaveBeenCalled();
	}, { timeout: 15000 });
	await act(async () => {
		await flush(10);
	});

	return {
		container,
		root,
		adapter,
		chartRefs,
		clock,
		rerender: async (settings: Record<string, boolean> = SYNC_ALL_ON, overrideMap?: Record<string, Record<string, boolean>>) => {
			await act(async () => {
				render(settings, overrideMap);
				await flush(10);
			});
		},
	};
}

async function fireEngineRange(symbol: string, range: { from: number; to: number }) {
	await act(async () => {
		hostRegistry.get(symbol)?.props.onVisibleRangeChange?.(range);
		await flush(10);
	});
}

// The VNInvestCharts echo-suppression wrapper drops local emits for 200ms
// after a remote apply (pre-existing B2 heuristic). Tests that need a
// GENUINE emit after an apply must out-wait that window; tests asserting a
// drop must fire inside it. (Follow-up: content-based suppression, P1-H.)
function sleep(ms: number): Promise<void> {
	return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function engines() {
	return {
		A: hostRegistry.get("AAA")!.engine,
		B: hostRegistry.get("BBB")!.engine,
	};
}

describe("multichart sync wiring (P0-c/C1, mount-real)", () => {
	let mounted: Mounted | null = null;

	beforeEach(() => {
		hostRegistry.clear();
		window.localStorage.clear();
		document.documentElement.lang = "en";
	});

	afterEach(async () => {
		await act(async () => {
			mounted?.root.unmount();
		});
		mounted?.container.remove();
		mounted = null;
		hostRegistry.clear();
	});

	it("T1: pan A (last 100 bars) applies the SAME calendar dates on B (timestamp-primary, B1)", async () => {
		mounted = await mountGrid();
		const { A, B } = engines();
		B.zoomToRange.mockClear();
		A.zoomToRange.mockClear();

		// Pan A to its last 100 bars (engine index-space, HALF-OPEN [from, to):
		// {from:0, to:2} covers bars 0..1 (see visibleRange contract tests).
		await fireEngineRange("AAA", { from: 400, to: 499 });

		// Expected: timestamp mapping onto B's weekday-only bars.
		// Covered A bars are 400..498 → same calendar dates on B.
		const fromDate = barsAAA[400].date.getTime();
		const toDate = barsAAA[498].date.getTime();
		const bDates = barsBBB.map((b) => b.date.getTime());
		const expectedFrom = bDates.findIndex((t) => t >= fromDate);
		let expectedTo = -1;
		for (let i = bDates.length - 1; i >= 0; i--) {
			if (bDates[i] <= toDate) {
				expectedTo = i;
				break;
			}
		}
		expect(expectedFrom).toBeGreaterThanOrEqual(0);
		expect(expectedTo).toBeGreaterThan(expectedFrom);

		expect(B.zoomToRange).toHaveBeenCalledTimes(1);
		// Half-open apply: inclusive B bars [expectedFrom..expectedTo] render as
		// [expectedFrom, expectedTo + 1) — the old {.., expectedTo} dropped bar
		// expectedTo every hop and ratcheted synced charts to max zoom-in.
		expect(B.zoomToRange).toHaveBeenCalledWith({ from: expectedFrom, to: expectedTo + 1 });
		// Source chart is never re-applied (engine excludes source from fan-out).
		expect(A.zoomToRange).not.toHaveBeenCalled();

		// Discrimination: naive ratio mapping (old SY-02 bug) would land elsewhere.
		const ratioFrom = Math.round(0.8 * (bDates.length - 1));
		expect(expectedFrom).not.toBe(ratioFrom);
	});

	it("T2: suppression layers across rapid B emits (one-shot, broadcast, dedup)", async () => {
		mounted = await mountGrid();
		const { A, B } = engines();
		const broadcasts = countBroadcasts();
		B.zoomToRange.mockClear();
		A.zoomToRange.mockClear();

		// A first: request (silent, B holds nothing) + own broadcast → B applies
		// (and is marked synced — no catch-up needed on later emits).
		await fireEngineRange("AAA", { from: 400, to: 499 });
		expect(broadcasts.visibleRange).toBe(1);
		expect(B.zoomToRange).toHaveBeenCalledTimes(1);
		// Out-wait B's 200ms post-apply wrapper suppression (see sleep helper).
		await sleep(250);
		// B#1 (T1-applied range): stale one-shot flag is consumed → dropped.
		await fireEngineRange("BBB", { from: 286, to: 357 });
		expect(broadcasts.visibleRange).toBe(1);
		expect(B.zoomToRange).toHaveBeenCalledTimes(1);
		expect(A.zoomToRange).not.toHaveBeenCalled();
		// B#2 (new range): genuine intent propagates → A applies.
		await fireEngineRange("BBB", { from: 300, to: 400 });
		expect(broadcasts.visibleRange).toBe(2);
		expect(A.zoomToRange).toHaveBeenCalledTimes(1);
		// B#3 (same range): Path-A dedup swallows the duplicate engine event.
		await fireEngineRange("BBB", { from: 300, to: 400 });
		expect(broadcasts.visibleRange).toBe(2);
		expect(A.zoomToRange).toHaveBeenCalledTimes(1);
		expect(B.zoomToRange).toHaveBeenCalledTimes(1);
	});

	it("T3: syncSettings.visibleRange=false blocks remote apply (toggle-OFF)", async () => {
		mounted = await mountGrid({ ...SYNC_ALL_ON, visibleRange: false });
		const { B } = engines();
		B.zoomToRange.mockClear();

		await fireEngineRange("AAA", { from: 400, to: 499 });

		expect(B.zoomToRange).not.toHaveBeenCalled();
	});

	it("T4: Saturday hover on crypto-A hides stock-B crosshair, weekday shows it", async () => {
		mounted = await mountGrid();
		const { B } = engines();
		const broadcasts = countBroadcasts();

		// Saturday 2020-01-04 = A's bar index 3 (continuous daily data).
		const saturdayIdx = barsAAA.findIndex(
			(b) => b.date.getTime() === Date.UTC(2020, 0, 4),
		);
		expect(saturdayIdx).toBeGreaterThanOrEqual(0);
		const saturdayTs = barsAAA[saturdayIdx].date.getTime();
		// Sanity: B (weekday-only) really has no bar covering that Saturday.
		const bDates = barsBBB.map((b) => b.date.getTime());
		expect(bDates).not.toContain(saturdayTs);

		await act(async () => {
			hostRegistry.get("AAA")?.props.onOverlayStateChange?.({
				xAxisTicks: [],
				crosshair: { dataIndex: saturdayIdx, xIndexFloat: saturdayIdx + 0.5, y: NaN, paneId: "price" },
			});
			await flush(10);
		});
		expect(broadcasts.crosshair).toBe(1);
		expect(B.setCrosshairPos).toHaveBeenCalledWith(null);

		// Weekday Monday 2020-01-06 (A index 5) → B shows a local crosshair.
		// NOTE: engine crosshair throttle runs on the virtual clock — advance it
		// past the 16ms window so the second broadcast isn't coalesced behind
		// Saturday's (in prod, rAF advances real time between hovers).
		B.setCrosshairPos.mockClear();
		mounted.clock.advanceTime(20);
		mounted.clock.runPendingFrames();
		const mondayIdx = barsAAA.findIndex(
			(b) => b.date.getTime() === Date.UTC(2020, 0, 6),
		);
		expect(mondayIdx).toBeGreaterThanOrEqual(0);
		await act(async () => {
			hostRegistry.get("AAA")?.props.onOverlayStateChange?.({
				xAxisTicks: [],
				crosshair: { dataIndex: mondayIdx, xIndexFloat: mondayIdx + 0.5, y: NaN, paneId: "price" },
			});
			await flush(10);
		});
		expect(B.setCrosshairPos).toHaveBeenCalledTimes(1);
		const pos = (B.setCrosshairPos as any).mock.calls[0][0];
		expect(pos).not.toBeNull();
		expect(typeof pos.x).toBe("number");
		expect(typeof pos.y).toBe("number");
	});

	it("T5: drawing op from another symbol is dropped, same-symbol op applies (E1)", async () => {
		mounted = await mountGrid();
		const getBDrawings = () =>
			mounted?.chartRefs.current.get("chart-B")?.current?.getDrawings?.() ?? null;
		expect(getBDrawings()).toEqual([]);

		const baseOp = {
			id: "op-e1",
			drawingId: "d-e1",
			type: "create",
			version: {},
			timestamp: 1,
			authorId: "user-1",
			chartId: "chart-A",
			data: {
				type: "trendline",
				points: [{ timestamp: barsBBB[10].date.getTime(), price: 110, xIndexFloat: 10 }],
			},
		};

		// Other-symbol op (AAA) → dropped before B's workspace.
		await act(async () => {
			capturedSyncContext.current.syncDrawing({ ...baseOp, symbol: "AAA" });
			await flush(10);
		});
		expect(getBDrawings()).toEqual([]);

		// Same-symbol op (BBB) → applied to B's workspace.
		await act(async () => {
			capturedSyncContext.current.syncDrawing({ ...baseOp, symbol: "BBB" });
			await flush(10);
		});
		const applied = getBDrawings();
		expect(applied).toHaveLength(1);
		expect(applied[0].id).toBe("d-e1");

		// Per-drawing Local Only (R2-d): same-symbol op with the flag drops too.
		await act(async () => {
			capturedSyncContext.current.syncDrawing({ ...baseOp, id: "op-e1-local", drawingId: "d-e1-local", symbol: "BBB", syncInLayout: false });
			await flush(10);
		});
		expect(getBDrawings()).toHaveLength(1);
	});

	it("T6: concurrent drawing edits surface a conflict notice on the same-symbol chart (E2)", async () => {
		mounted = await mountGrid();

		const conflictOp = (chartId: string, timestamp: number) => ({
			id: `op-conflict-${chartId}`,
			drawingId: "d-conflict",
			type: "create",
			version: {},
			timestamp,
			authorId: `user-${chartId}`,
			chartId,
			symbol: "AAA",
			data: {
				symbol: "AAA",
				timeframe: "1D",
				type: "trendline",
				points: [{ timestamp: barsAAA[10].date.getTime(), price: 110, xIndexFloat: 10 }],
			},
		});

		// Two concurrent creates of the same drawing (equal versions, ts 100 → 200):
		// engine CRDT resolves remote-wins and notifies.
		await act(async () => {
			capturedSyncContext.current.applyDrawingOperation(conflictOp("chart-A", 100));
			await flush(10);
		});
		expect(mounted.container.querySelectorAll('[data-testid="drawing-conflict-notice"]')).toHaveLength(0);

		await act(async () => {
			capturedSyncContext.current.applyDrawingOperation(conflictOp("chart-B", 200));
			await flush(10);
		});
		const notices = mounted.container.querySelectorAll('[data-testid="drawing-conflict-notice"]');
		expect(notices).toHaveLength(1);
		expect(notices[0].closest("[data-chart-id]")?.getAttribute("data-chart-id")).toBe("chart-A");
	});

	it("T7: time anchor centers B on the timestamp with span kept, A untouched (F1)", async () => {
		mounted = await mountGrid();
		const { A, B } = engines();
		B.zoomToRange.mockClear();
		A.zoomToRange.mockClear();
		B.getVisibleRange.mockReturnValue({ from: 1000, to: 1100 });
		// Establish A's range first (also syncs B via normal broadcast).
		await fireEngineRange("AAA", { from: 400, to: 499 });
		expect(B.zoomToRange).toHaveBeenCalledTimes(1);
		const anchorTs = barsAAA[100].date.getTime();

		await act(async () => {
			capturedSyncContext.current.setTimeAnchor("chart-A", anchorTs);
			await flush(10);
		});

		const bDates = barsBBB.map((b) => b.date.getTime());
		let center = bDates.findIndex((t) => t >= anchorTs);
		if (center > 0 && bDates[center] > anchorTs) {
			const prev = center - 1;
			if (anchorTs - bDates[prev] <= bDates[center] - anchorTs) center = prev;
		}
		expect(B.zoomToRange).toHaveBeenCalledTimes(2);
		// Half-open apply (see T1): bars 286..356 render as [286, 357).
		expect(B.zoomToRange).toHaveBeenNthCalledWith(1, { from: 286, to: 357 });
		expect(B.zoomToRange).toHaveBeenNthCalledWith(2, { from: center - 50, to: center + 50 });
		// Span preserved (100 bars), source never re-applied, history-led.
		const zoomArg = (B.zoomToRange as any).mock.calls[1][0];
		expect(zoomArg.to - zoomArg.from).toBe(100);
		expect(A.zoomToRange).not.toHaveBeenCalled();
		expect(B.setCameraState).toHaveBeenCalledWith({ followLatest: false });

		// Anti-collapse: B's engine now emits the anchored range back (a real
		// engine fires onVisibleRangeChange on zoom). B is synced (didRequest
		// via applies), so this takes the normal path — and the anchor guard
		// must swallow it, else the leader collapses to the follower's span.
		await fireEngineRange("BBB", { from: zoomArg.from, to: zoomArg.to });
		expect(A.zoomToRange).not.toHaveBeenCalled();
		expect(B.zoomToRange).toHaveBeenCalledTimes(2);
	});

	it("T8: syncSettings.time=false blocks the anchor apply (toggle-OFF)", async () => {
		mounted = await mountGrid({ ...SYNC_ALL_ON, time: false });
		const { B } = engines();
		B.zoomToRange.mockClear();

		await act(async () => {
			capturedSyncContext.current.setTimeAnchor("chart-A", barsAAA[100].date.getTime());
			await flush(10);
		});

		expect(B.zoomToRange).not.toHaveBeenCalled();
	});

	it("T9: late-joiner catch-up — pristine B adopts active A's range, then leads (F2/Q5)", async () => {
		// B starts opted out: A's broadcast can't sync it (stays pristine —
		// didRequest false, no stored range, guards untouched).
		mounted = await mountGrid(SYNC_ALL_ON, { "chart-B": { visibleRange: false } });
		const { A, B } = engines();
		const broadcasts = countBroadcasts();
		B.zoomToRange.mockClear();
		A.zoomToRange.mockClear();

		// A establishes (broadcasts; B drops via override).
		await fireEngineRange("AAA", { from: 400, to: 499 });
		expect(broadcasts.visibleRange).toBe(1);
		expect(B.zoomToRange).not.toHaveBeenCalled();
		// B opts back in (still pristine).
		await mounted.rerender(SYNC_ALL_ON);
		// B first emit: requests → A (active, stored) answers targeted → B
		// adopts A's dates; own echo-Rb suppressed (no new broadcast).
		await fireEngineRange("BBB", { from: 0, to: 10 });
		expect(broadcasts.visibleRange).toBe(1);
		expect(B.zoomToRange).toHaveBeenCalledTimes(1);
		// Half-open apply (see T1): bars 286..356 render as [286, 357).
		expect(B.zoomToRange).toHaveBeenCalledWith({ from: 286, to: 357 });
		expect(A.zoomToRange).not.toHaveBeenCalled();
		// Out-wait the answer-apply wrapper suppression, then re-emit the ADOPTED
		// range itself: one-shot consumed + content MATCH → dropped as echo.
		await sleep(250);
		await fireEngineRange("BBB", { from: 286, to: 357 });
		expect(broadcasts.visibleRange).toBe(1);
		expect(B.zoomToRange).toHaveBeenCalledTimes(1);
		expect(A.zoomToRange).not.toHaveBeenCalled();
		// B third emit (new range): genuine intent propagates normally → A applies.
		await fireEngineRange("BBB", { from: 310, to: 410 });
		expect(broadcasts.visibleRange).toBe(2);
		expect(A.zoomToRange).toHaveBeenCalledTimes(1);
	});

	it("T10: content-based suppression — echo drops, genuine rapid pan flows (P1-H)", async () => {
		mounted = await mountGrid();
		const { A, B } = engines();
		const broadcasts = countBroadcasts();
		B.zoomToRange.mockClear();
		A.zoomToRange.mockClear();

		// A establishes → B applies (guards armed, applied timestamps recorded).
		await fireEngineRange("AAA", { from: 400, to: 499 });
		expect(broadcasts.visibleRange).toBe(1);
		expect(B.zoomToRange).toHaveBeenCalledTimes(1);
		// IMMEDIATE echo of the applied range (no sleep!): same timestamps →
		// dropped at BOTH content-aware layers despite active guards.
		await fireEngineRange("BBB", { from: 286, to: 357 });
		expect(broadcasts.visibleRange).toBe(1);
		expect(B.zoomToRange).toHaveBeenCalledTimes(1);
		expect(A.zoomToRange).not.toHaveBeenCalled();
		// IMMEDIATE genuine pan (no sleep!): different timestamps → flows at
		// once AND releases the guard (pre-P1-H this was eaten by the 200ms
		// blanket window — RED basis below).
		await fireEngineRange("BBB", { from: 300, to: 400 });
		expect(broadcasts.visibleRange).toBe(2);
		expect(A.zoomToRange).toHaveBeenCalledTimes(1);
	});
});
