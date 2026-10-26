// B2 regression lock: remote-led happy-path must drop followLatest (SY-03),
// pending sync must self-release after 5s (SY-12). Mounts the real factory
// with a mocked engine + ctx refs.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useChartImperativeHandle } from "../useChartImperativeHandle";

const DAY = 86_400_000;
const T0 = new Date(2024, 0, 1).getTime();
const plotData = Array.from({ length: 100 }, (_, i) => ({
	date: new Date(T0 + i * DAY),
	open: 100 + i, high: 101 + i, low: 99 + i, close: 100 + i, volume: 1000 + i,
}));

function makeHarness() {
	const engine = {
		setCameraState: vi.fn(),
		zoomToRange: vi.fn(),
		setCrosshairPos: vi.fn(),
		getVisibleRange: () => ({ from: 0, to: 99 }),
		getPaneSnapshots: () => [{
			paneId: "p1",
			scaleSlotStates: { right: { side: "right" } },
			plotBounds: { top: 0, height: 400 },
		}],
		dataIndexToPixelX: () => 100,
		priceToPixelY: vi.fn((_pane: unknown, _slot: unknown, price: number) => price),
	};
	const refs = {
		isRemoteVisibleRangeRef: { current: false },
		lastRemoteRangeRef: { current: null as { from: number; to: number } | null },
		isRemoteCrosshairRef: { current: false },
		pendingSyncTimeRangeRef: { current: null as any },
		visibleRangeTimeoutRef: { current: undefined as any },
	};
	const ctx = {
		props: { id: "chart-B" },
		localSymbol: "VNM",
		settings: {
			localTimeframe: "1m",
			resolvedTheme: "dark",
			themeState: { toggleTheme: vi.fn() },
			isFullscreen: false,
			handleFullscreenToggle: vi.fn(),
		},
		isForkRuntime: true,
		engineInstanceRef: { current: engine },
		dataResult: {
			plotData,
			historyBackfillBeforeRef: { current: null },
			requestVisibleHistoryWindowSync: vi.fn(),
		},
		// AUTH-03: replay is Pro-only; this suite asserts the SYNC mechanics of a
		// bus-applied replay seek for an entitled user. The locked-tier path is
		// covered by useChartImperativeHandle.replayGate.test.ts.
		canUseReplay: true,
		replay: {
			playing: false, speed: 1, currentBar: 0, totalBars: 0,
			currentBarTimestamp: 0,
			onReplayPlay: vi.fn(), onReplayPause: vi.fn(), onReplayStop: vi.fn(),
			onReplayStepForward: vi.fn(), onReplayStepBack: vi.fn(),
			onReplayRewind: vi.fn(), onReplaySpeedChange: vi.fn(),
			onReplaySeek: vi.fn(), onReplaySeekByDate: vi.fn(),
		},
		...refs,
	} as any;
	const ref = { current: null as any };
	renderHook(() => useChartImperativeHandle(ref, ctx));
	return { engine, refs, ref, ctx };
}

describe("useChartImperativeHandle sync receive (B2)", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.clearAllTimers();
		vi.useRealTimers();
	});

	it("SY-03: remote timeRange happy-path disables followLatest + zooms", () => {
		const { engine, ref } = makeHarness();
		act(() => {
			ref.current.setVisibleRange(
				{ timeRange: { from: T0 + 10 * DAY, to: T0 + 20 * DAY } },
				"chart-A",
			);
		});
		expect(engine.setCameraState).toHaveBeenCalledWith({ followLatest: false });
		// Half-open engine range: inclusive bar indexes [10,20] apply as [10,21).
		expect(engine.zoomToRange).toHaveBeenCalledWith({ from: 10, to: 21 });
	});

	it("SY-03: local intent does NOT touch followLatest", () => {
		const { engine, ref } = makeHarness();
		act(() => {
			ref.current.setVisibleRange({ timeRange: { from: T0 + 10 * DAY, to: T0 + 20 * DAY } });
		});
		expect(engine.setCameraState).not.toHaveBeenCalled();
		expect(engine.zoomToRange).toHaveBeenCalledWith({ from: 10, to: 21 });
	});

	it("SY-03: remote index-range branch also disables followLatest", () => {
		const { engine, ref } = makeHarness();
		act(() => {
			ref.current.setVisibleRange({ from: 5, to: 15 }, "chart-A");
		});
		expect(engine.setCameraState).toHaveBeenCalledWith({ followLatest: false });
		expect(engine.zoomToRange).toHaveBeenCalledWith({ from: 5, to: 15 });
	});

	it("SY-12: pending stash self-releases after 5s (no infinite guard)", () => {
		const { refs, ref } = makeHarness();
		act(() => {
			ref.current.setVisibleRange(
				{ timeRange: { from: T0 - 365 * DAY, to: T0 - 300 * DAY } },
				"chart-A",
			);
		});
		expect(refs.pendingSyncTimeRangeRef.current).not.toBeNull();
		expect(refs.isRemoteVisibleRangeRef.current).toBe(true);
		act(() => {
			vi.advanceTimersByTime(5000);
		});
		expect(refs.pendingSyncTimeRangeRef.current).toBeNull();
		expect(refs.isRemoteVisibleRangeRef.current).toBe(false);
	});

	it("applied happy-path supersedes stale pending (no leaked 5s fire)", () => {
		const { engine, refs, ref } = makeHarness();
		act(() => {
			ref.current.setVisibleRange(
				{ timeRange: { from: T0 - 365 * DAY, to: T0 - 300 * DAY } },
				"chart-A",
			);
		});
		expect(refs.pendingSyncTimeRangeRef.current).not.toBeNull();
		// Newer in-bounds remote range arrives: clears the 5s timer + stash.
		act(() => {
			ref.current.setVisibleRange(
				{ timeRange: { from: T0 + 10 * DAY, to: T0 + 20 * DAY } },
				"chart-A",
			);
		});
		expect(engine.zoomToRange).toHaveBeenCalledWith({ from: 10, to: 21 });
		expect(refs.pendingSyncTimeRangeRef.current).toBeNull();
		act(() => {
			vi.advanceTimersByTime(6000);
		});
		// Stale timer gone (would otherwise null a fresh stash); guard released.
		expect(refs.pendingSyncTimeRangeRef.current).toBeNull();
		expect(refs.isRemoteVisibleRangeRef.current).toBe(false);
	});

	it("SY-08: different symbol projects the LOCAL bar close, not the remote price", () => {
		const { engine, ref } = makeHarness(); // localSymbol "VNM", close[50] = 150
		act(() => {
			ref.current.setCrosshair(
				{ timestamp: T0 + 50 * DAY, xIndexFloat: 50.5, price: 40000, symbol: "VIC", isHovering: true },
				"chart-A",
			);
		});
		expect(engine.priceToPixelY).toHaveBeenCalledWith("p1", "right", 150);
		expect(engine.setCrosshairPos).toHaveBeenCalledWith({ x: 100, y: 150 });
	});

	it("SY-08: same symbol projects the remote price", () => {
		const { engine, ref } = makeHarness();
		act(() => {
			ref.current.setCrosshair(
				{ timestamp: T0 + 50 * DAY, xIndexFloat: 50.5, price: 40000, symbol: "VNM", isHovering: true },
				"chart-A",
			);
		});
		expect(engine.priceToPixelY).toHaveBeenCalledWith("p1", "right", 40000);
		expect(engine.setCrosshairPos).toHaveBeenCalledWith({ x: 100, y: 40000 });
	});

	it("SY-07: setCrosshair accepts the engine-passed source id (signature parity)", () => {
		const { engine, ref } = makeHarness();
		act(() => {
			ref.current.setCrosshair(
				{ timestamp: T0 + 50 * DAY, price: 40000, symbol: "VNM", isHovering: true },
				"chart-A",
			);
		});
		expect(engine.setCrosshairPos).toHaveBeenCalled();
	});

	it("R1-b: bus-applied replay seek drops followLatest + arms the echo guard", () => {
		const { engine, refs, ref } = makeHarness();
		act(() => {
			ref.current.replaySeekByTimestamp(T0 + 10 * DAY);
		});
		expect(engine.setCameraState).toHaveBeenCalledWith({ followLatest: false });
		expect(refs.isRemoteVisibleRangeRef.current).toBe(true);
	});
});
