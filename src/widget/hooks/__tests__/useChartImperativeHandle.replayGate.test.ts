// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import React from "react";
import { useChartImperativeHandle } from "../useChartImperativeHandle";

/**
 * AUTH-03: replay is a Pro capability. The toolbar was gated by
 * `PremiumFeatureGate`, but the imperative ref exposed every mutating replay
 * command unconditionally, so a host driving the ref could start replay
 * without entitlement.
 */
function makeCtx(canUseReplay: boolean) {
	const replay = {
		playing: false,
		speed: 1,
		currentBar: 0,
		totalBars: 100,
		currentBarTimestamp: 0,
		sessionActive: true,
		sessionEpoch: 3,
		onReplayPlay: vi.fn(),
		onReplayPause: vi.fn(),
		onReplayStop: vi.fn(),
		onReplayStepForward: vi.fn(),
		onReplayStepBack: vi.fn(),
		onReplayRewind: vi.fn(),
		onReplaySpeedChange: vi.fn(),
		onReplaySeek: vi.fn(),
		onReplaySeekByDate: vi.fn(),
	};
	const plotData = Array.from({ length: 10 }, (_, i) => ({
		date: new Date(1_700_000_000_000 + i * 86_400_000),
		open: 100 + i, high: 101 + i, low: 99 + i, close: 100 + i, volume: 1000 + i,
	}));

	const ctx = {
		props: { id: "chart-A" },
		localSymbol: "VIC",
		settings: {
			localTimeframe: "1m",
			resolvedTheme: "dark",
			themeState: { toggleTheme: vi.fn() },
			isFullscreen: false,
			handleFullscreenToggle: vi.fn(),
		},
		isForkRuntime: true,
		engineInstanceRef: { current: null },
		dataResult: {
			plotData,
			historyBackfillBeforeRef: { current: null },
			requestVisibleHistoryWindowSync: vi.fn(),
		},
		resolvedLegacyVisibleRange: {},
		paneState: {},
		comparisonState: {},
		drawingsResult: {},
		canUseReplay,
		replay,
		replayTrading: { totalPnl: 0, analytics: {} },
		replayAwaitingStartBar: false,
		setLegacyVisibleRange: vi.fn(),
		setChartType: vi.fn(),
		setIsFrozen: vi.fn(),
		isFrozen: false,
		openAlertsModal: vi.fn(),
		setReplayAwaitingStartBar: vi.fn(),
		isRemoteVisibleRangeRef: { current: false },
		lastRemoteRangeRef: { current: null },
		pendingSyncTimeRangeRef: { current: null },
		visibleRangeTimeoutRef: { current: undefined },
		isRemoteCrosshairRef: { current: false },
		isRemoteDrawingChangeRef: { current: false },
		syncDrawingHandlersRef: { current: new Set() },
		syncViewportHandlersRef: { current: new Set() },
		replayBarVisibleRef: { current: false },
		replayAwaitingStartBarRef: { current: false },
		suppressReplayTickRef: { current: false },
		onDataChangeCallbacks: { current: new Set() },
		onIndicatorsChangeCallbacks: { current: new Set() },
		containerRef: { current: null },
		handleSaveTemplate: vi.fn(),
		handleLoadTemplate: vi.fn(),
		legacyPaneSnapshots: { current: [] },
		paneSnapshots: [],
		legacyCoordinateBridge: { current: null },
		CHART_TYPE_MAP: {},
	};
	return { ctx, replay };
}

function mount(canUseReplay: boolean) {
	const { ctx, replay } = makeCtx(canUseReplay);
	const ref = React.createRef<Record<string, never>>();
	renderHook(() => useChartImperativeHandle(ref, ctx as never));
	return { api: ref.current as unknown as Record<string, (v?: number) => unknown>, replay };
}

const MUTATING = [
	"replayPlay",
	"replayPause",
	"replayStop",
	"replayStepForward",
	"replayStepBack",
	"replayRewind",
	"replaySetSpeed",
	"replaySeek",
	"replaySeekByTimestamp",
] as const;

describe("AUTH-03 replay entitlement on the imperative API", () => {
	// AC-AUTH-03-1
	it("exposes every replay command but blocks them all when locked", () => {
		const { api, replay } = mount(false);
		for (const name of MUTATING) {
			expect(typeof api[name], `${name} phải tồn tại`).toBe("function");
		}
		for (const name of MUTATING) {
			act(() => {
				api[name]?.(1);
			});
		}
		// Not a single command reached the replay controller.
		for (const [key, value] of Object.entries(replay)) {
			if (typeof value !== "function") continue;
			expect(value, `${key} phải không được gọi`).not.toHaveBeenCalled();
		}
	});

	// AC-AUTH-03-2
	it("forwards replay commands when the tier grants replay", () => {
		const { api, replay } = mount(true);

		act(() => api.replayPlay());
		act(() => api.replayStepForward());
		act(() => api.replaySetSpeed(4));
		act(() => api.replaySeek(12));

		expect(replay.onReplayPlay).toHaveBeenCalledTimes(1);
		expect(replay.onReplayStepForward).toHaveBeenCalledTimes(1);
		expect(replay.onReplaySpeedChange).toHaveBeenCalledWith(4);
		expect(replay.onReplaySeek).toHaveBeenCalledWith(12);
	});

	it("still allows cancelling a replay selection while locked (cleanup path)", () => {
		const { api } = mount(false);
		expect(() => act(() => api.replayCancelSelection())).not.toThrow();
	});

	// Read-only accessors must keep working regardless of tier.
	it("keeps read-only replay state readable when locked", () => {
		const { api } = mount(false);
		expect(api.getReplayState()).toMatchObject({ playing: false, totalBars: 100, sessionActive: true });
	});
});
