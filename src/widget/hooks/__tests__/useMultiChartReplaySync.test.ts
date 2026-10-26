import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
	useMultiChartReplaySync,
	electMaster,
	replayActive,
} from "../useMultiChartReplaySync";
import { emitReplayEvent } from "../../../lib/core/replay/ReplayEventBus";
import type { WidgetChartHandle } from "../../utils/widgetHelpers";

function makeHandle(
	overrides?: Partial<WidgetChartHandle>,
): WidgetChartHandle {
	return {
		getReplayState: overrides?.getReplayState ?? (() => undefined),
		...overrides,
	} as WidgetChartHandle;
}

describe("electMaster", () => {
	it("returns null for empty map", () => {
		expect(electMaster(new Map())).toBeNull();
	});

	it("elects single chart as master", () => {
		const states = new Map([["c1", { tfMinutes: 60, currentBar: 50, totalBars: 100 }]]);
		expect(electMaster(states)).toBe("c1");
	});

	it("elects lowest timeframe as master", () => {
		const states = new Map([
			["c1", { tfMinutes: 60, currentBar: 50, totalBars: 100 }],
			["c2", { tfMinutes: 5, currentBar: 40, totalBars: 100 }],
			["c3", { tfMinutes: 1440, currentBar: 30, totalBars: 100 }],
		]);
		expect(electMaster(states)).toBe("c2");
	});

	it("tie-breaks by lower currentBar when TF equal (chart bắt đầu replay từ đầu là master)", () => {
		const states = new Map([
			["c1", { tfMinutes: 60, currentBar: 50, totalBars: 100 }],
			["c2", { tfMinutes: 60, currentBar: 80, totalBars: 100 }],
		]);
		expect(electMaster(states)).toBe("c1");
	});
});

describe("replayActive", () => {
	it("returns true when playing", () => {
		expect(replayActive({ currentBar: 99, totalBars: 100, playing: true })).toBe(true);
	});

	it("returns true when not playing but has unplayed bars", () => {
		expect(replayActive({ currentBar: 50, totalBars: 100, playing: false })).toBe(true);
	});

	it("returns false when at end and not playing", () => {
		expect(replayActive({ currentBar: 99, totalBars: 100, playing: false })).toBe(false);
	});
});

describe("useMultiChartReplaySync", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	it("mounts with empty charts and returns null master", () => {
		const { result } = renderHook(() =>
			useMultiChartReplaySync({
				chartHandles: new Map(),
				charts: [],
			}),
		);
		expect(result.current.masterChartId).toBeNull();
		expect(result.current.slaveChartIds).toEqual([]);
	});

	it("elects playing chart as master over non-playing even if higher timeframe", () => {
		const handles = new Map<string, WidgetChartHandle>([
			["c1", makeHandle({ getReplayState: () => ({ playing: true, speed: 1, currentBar: 10, totalBars: 100, currentBarTimestamp: 1000 }) })],
			["c2", makeHandle({ getReplayState: () => ({ playing: false, speed: 1, currentBar: 5, totalBars: 100, currentBarTimestamp: 500 }) })],
		]);

		const { result } = renderHook(() =>
			useMultiChartReplaySync({
				chartHandles: handles,
				charts: [
					{ id: "c1", timeframe: "1h" },
					{ id: "c2", timeframe: "5m" },
				],
			}),
		);

		act(() => {
			vi.advanceTimersByTime(300);
		});

		// c1 is playing → preferred as master despite higher timeframe
		expect(result.current.masterChartId).toBe("c1");
		expect(result.current.slaveChartIds).toEqual(["c2"]);
	});

	it("falls back to timeframe-based election when no chart playing", () => {
		const handles = new Map<string, WidgetChartHandle>([
			["c1", makeHandle({ getReplayState: () => ({ playing: false, speed: 1, currentBar: 10, totalBars: 100, currentBarTimestamp: 1000 }) })],
			["c2", makeHandle({ getReplayState: () => ({ playing: false, speed: 1, currentBar: 5, totalBars: 100, currentBarTimestamp: 500 }) })],
		]);

		const { result } = renderHook(() =>
			useMultiChartReplaySync({
				chartHandles: handles,
				charts: [
					{ id: "c1", timeframe: "1h" },
					{ id: "c2", timeframe: "5m" },
				],
			}),
		);

		act(() => {
			vi.advanceTimersByTime(300);
		});

		// No chart playing → fall back to lowest timeframe
		expect(result.current.masterChartId).toBe("c2");
		expect(result.current.slaveChartIds).toEqual(["c1"]);
	});

	it("returns null master when no charts active", () => {
		const handles = new Map<string, WidgetChartHandle>([
			["c1", makeHandle({ getReplayState: () => ({ playing: false, speed: 1, currentBar: 99, totalBars: 100, currentBarTimestamp: 1000 }) })],
		]);

		const { result } = renderHook(() =>
			useMultiChartReplaySync({
				chartHandles: handles,
				charts: [{ id: "c1", timeframe: "1h" }],
			}),
		);

		act(() => {
			vi.advanceTimersByTime(300);
		});

		expect(result.current.masterChartId).toBeNull();
	});

	it("F-11: onMasterChange fires exactly once on election, not per heartbeat", () => {
		const onMasterChange = vi.fn();
		const handles = new Map<string, WidgetChartHandle>([
			["c1", makeHandle({ getReplayState: () => ({ playing: true, speed: 1, currentBar: 10, totalBars: 100, currentBarTimestamp: 1000 }) })],
		]);

		renderHook(() =>
			useMultiChartReplaySync({
				chartHandles: handles,
				charts: [{ id: "c1", timeframe: "1h" }],
				onMasterChange,
			}),
		);

		act(() => {
			vi.advanceTimersByTime(300);
		});
		expect(onMasterChange).toHaveBeenCalledTimes(1);
		expect(onMasterChange).toHaveBeenLastCalledWith("c1");

		// Subsequent heartbeats with same master → no extra calls.
		act(() => {
			vi.advanceTimersByTime(900);
		});
		expect(onMasterChange).toHaveBeenCalledTimes(1);
	});

	it("F-11: onMasterChange fires with new id when master switches", () => {
		const onMasterChange = vi.fn();
		let c1Playing = true;
		let c2Playing = false;
		const handles = new Map<string, WidgetChartHandle>([
			["c1", makeHandle({ getReplayState: () => ({ playing: c1Playing, speed: 1, currentBar: 10, totalBars: 100, currentBarTimestamp: 1000 }) })],
			["c2", makeHandle({ getReplayState: () => ({ playing: c2Playing, speed: 1, currentBar: 20, totalBars: 100, currentBarTimestamp: 2000 }) })],
		]);

		renderHook(() =>
			useMultiChartReplaySync({
				chartHandles: handles,
				charts: [
					{ id: "c1", timeframe: "1h" },
					{ id: "c2", timeframe: "1h" },
				],
				onMasterChange,
			}),
		);

		act(() => {
			vi.advanceTimersByTime(300);
		});
		expect(onMasterChange).toHaveBeenLastCalledWith("c1");
		const callsAfterFirst = onMasterChange.mock.calls.length;

		// Master switches: c1 stops playing (goes to end), c2 starts playing.
		c1Playing = false;
		c2Playing = true;
		act(() => {
			vi.advanceTimersByTime(300);
		});
		expect(onMasterChange.mock.calls.length).toBeGreaterThan(callsAfterFirst);
		expect(onMasterChange).toHaveBeenLastCalledWith("c2");
	});

	it("F-11: onMasterChange fires with null when all charts inactive", () => {
		const onMasterChange = vi.fn();
		let playing = true;
		const handles = new Map<string, WidgetChartHandle>([
			["c1", makeHandle({ getReplayState: () => ({ playing, speed: 1, currentBar: playing ? 10 : 99, totalBars: 100, currentBarTimestamp: 1000 }) })],
		]);

		renderHook(() =>
			useMultiChartReplaySync({
				chartHandles: handles,
				charts: [{ id: "c1", timeframe: "1h" }],
				onMasterChange,
			}),
		);

		act(() => {
			vi.advanceTimersByTime(300);
		});
		expect(onMasterChange).toHaveBeenLastCalledWith("c1");

		// Chart reaches end + not playing → inactive → master reset to null.
		playing = false;
		act(() => {
			vi.advanceTimersByTime(300);
		});
		expect(onMasterChange).toHaveBeenLastCalledWith(null);
	});

	it("A6: Pause at the last bar keeps the session-active master (no null/reset)", () => {
		const onMasterChange = vi.fn();
		const handles = new Map<string, WidgetChartHandle>([
			["c1", makeHandle({ getReplayState: () => ({ playing: false, speed: 1, currentBar: 99, totalBars: 100, currentBarTimestamp: 1000, sessionActive: true }) })],
		]);

		const { result } = renderHook(() =>
			useMultiChartReplaySync({
				chartHandles: handles,
				charts: [{ id: "c1", timeframe: "1h" }],
				onMasterChange,
			}),
		);

		act(() => {
			vi.advanceTimersByTime(900);
		});

		expect(result.current.masterChartId).toBe("c1");
		expect(onMasterChange).toHaveBeenCalledTimes(1);
		expect(onMasterChange).toHaveBeenLastCalledWith("c1");
		expect(onMasterChange).not.toHaveBeenCalledWith(null);
	});

	it("A6: sessionActive with zero bars still participates in election", () => {
		const handles = new Map<string, WidgetChartHandle>([
			["c1", makeHandle({ getReplayState: () => ({ playing: false, speed: 1, currentBar: 0, totalBars: 0, sessionActive: true }) })],
			["c2", makeHandle({ getReplayState: () => ({ playing: false, speed: 1, currentBar: 99, totalBars: 100, sessionActive: false }) })],
		]);

		const { result } = renderHook(() =>
			useMultiChartReplaySync({
				chartHandles: handles,
				charts: [
					{ id: "c1", timeframe: "1h" },
					{ id: "c2", timeframe: "5m" },
				],
			}),
		);

		act(() => {
			vi.advanceTimersByTime(300);
		});
		expect(result.current.masterChartId).toBe("c1");
	});

	it("A6: timeframe/charts re-render while paused retains master without a reset notification", () => {
		const onMasterChange = vi.fn();
		const handles = new Map<string, WidgetChartHandle>([
			["c1", makeHandle({ getReplayState: () => ({ playing: false, speed: 1, currentBar: 50, totalBars: 100, currentBarTimestamp: 1000, sessionActive: true }) })],
		]);

		const { result, rerender } = renderHook(
			({ charts }) =>
				useMultiChartReplaySync({
					chartHandles: handles,
					charts,
					onMasterChange,
				}),
			{ initialProps: { charts: [{ id: "c1", timeframe: "1h" }] } },
		);

		act(() => {
			vi.advanceTimersByTime(300);
		});
		expect(result.current.masterChartId).toBe("c1");

		rerender({ charts: [{ id: "c1", timeframe: "5m" }] });
		act(() => {
			vi.advanceTimersByTime(600);
		});

		expect(result.current.masterChartId).toBe("c1");
		expect(onMasterChange.mock.calls.filter(([id]) => id === null)).toHaveLength(0);
	});

	it("forceBroadcast REPLAY_SEEK (Alt+click start bar) sync tất cả slaves theo timestamp, bất kể master hiện tại", () => {
		const c1Seek = vi.fn();
		const c2Seek = vi.fn();
		const handles = new Map<string, WidgetChartHandle>([
			["c1", makeHandle({
				getReplayState: () => ({ playing: false, speed: 1, currentBar: 99, totalBars: 100, currentBarTimestamp: 1000 }),
				replaySeekByTimestamp: c1Seek,
			})],
			["c2", makeHandle({
				getReplayState: () => ({ playing: false, speed: 1, currentBar: 99, totalBars: 100, currentBarTimestamp: 1000 }),
				replaySeekByTimestamp: c2Seek,
			})],
		]);

		renderHook(() =>
			useMultiChartReplaySync({
				chartHandles: handles,
				charts: [
					{ id: "c1", timeframe: "1h" },
					{ id: "c2", timeframe: "5m" },
				],
			}),
		);

		// Alt+click trên c2 chọn start bar → phát forceBroadcast từ c2
		act(() => {
			emitReplayEvent({
				type: "REPLAY_SEEK",
				chartId: "c2",
				timestamp: Date.now(),
				barIndex: 0,
				currentBarDate: 500,
				forceBroadcast: true,
			} as any, "mc-1");
		});

		// c2 là master (phát event), c1 là slave → c1 sync theo timestamp
		expect(c1Seek).toHaveBeenCalledWith(500);
		expect(c2Seek).not.toHaveBeenCalled();
	});

	it("R1-a single mode: slaves ignore REPLAY_SEEK, even forceBroadcast", () => {
		const c1Seek = vi.fn();
		const c2Seek = vi.fn();
		const handles = new Map<string, WidgetChartHandle>([
			["c1", makeHandle({
				getReplayState: () => ({ playing: false, speed: 1, currentBar: 99, totalBars: 100, currentBarTimestamp: 1000 }),
				replaySeekByTimestamp: c1Seek,
			})],
			["c2", makeHandle({
				getReplayState: () => ({ playing: false, speed: 1, currentBar: 99, totalBars: 100, currentBarTimestamp: 1000 }),
				replaySeekByTimestamp: c2Seek,
			})],
		]);

		renderHook(() =>
			useMultiChartReplaySync({
				chartHandles: handles,
				charts: [
					{ id: "c1", timeframe: "1h" },
					{ id: "c2", timeframe: "5m" },
				],
				mode: "single",
			}),
		);

		act(() => {
			emitReplayEvent({
				type: "REPLAY_SEEK",
				chartId: "c2",
				timestamp: Date.now(),
				barIndex: 0,
				currentBarDate: 500,
				forceBroadcast: true,
			} as any, "mc-1");
		});

		expect(c1Seek).not.toHaveBeenCalled();
		expect(c2Seek).not.toHaveBeenCalled();
	});

	it("R1-c REPLAY_START: slave seeks cursor + aligns camera, master untouched", () => {
		const c1Seek = vi.fn();
		const c1Anchor = vi.fn();
		const c2Seek = vi.fn();
		const c2Anchor = vi.fn();
		const handles = new Map<string, WidgetChartHandle>([
			["c1", makeHandle({
				getReplayState: () => ({ playing: false, speed: 1, currentBar: 99, totalBars: 100, currentBarTimestamp: 1000 }),
				replaySeekByTimestamp: c1Seek,
				setTimeAnchor: c1Anchor,
			})],
			["c2", makeHandle({
				getReplayState: () => ({ playing: false, speed: 1, currentBar: 99, totalBars: 100, currentBarTimestamp: 1000 }),
				replaySeekByTimestamp: c2Seek,
				setTimeAnchor: c2Anchor,
			})],
		]);

		renderHook(() =>
			useMultiChartReplaySync({
				chartHandles: handles,
				charts: [
					{ id: "c1", timeframe: "1h" },
					{ id: "c2", timeframe: "5m" },
				],
			}),
		);

		act(() => {
			emitReplayEvent({
				type: "REPLAY_START",
				chartId: "c2",
				timestamp: Date.now(),
				startTimestamp: 500,
			} as any, "mc-1");
		});

		expect(c1Seek).toHaveBeenCalledWith(500);
		expect(c1Anchor).toHaveBeenCalledWith({ timestamp: 500 }, "c2");
		expect(c2Seek).not.toHaveBeenCalled();
		expect(c2Anchor).not.toHaveBeenCalled();
	});
});
