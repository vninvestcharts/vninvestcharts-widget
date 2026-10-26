import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useReplayState } from "../useReplayState";
import type { EnrichedDatum } from "../../../lib/core/calculators/types";

function makeData(n: number): EnrichedDatum[] {
	return Array.from({ length: n }, (_, i) => ({
		date: new Date(2020, 0, 1 + i),
		open: 100 + i,
		high: 101 + i,
		low: 99 + i,
		close: 100 + i,
		volume: 1000 + i,
	})) as unknown as EnrichedDatum[];
}

describe("useReplayState (F-15 dispose-on-unmount)", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.clearAllTimers();
		vi.useRealTimers();
	});

	it("clears the replay interval timer on unmount (no leaked setInterval after unmount)", () => {
		const clearSpy = vi.spyOn(globalThis, "clearInterval");
		const data = makeData(10);
		const { result, unmount } = renderHook(() => useReplayState(data));

		// Rewind to the start then play so the controller schedules its setInterval.
		act(() => {
			result.current.onReplayRewind();
			result.current.onReplayPlay();
		});
		expect(result.current.playing).toBe(true);

		const clearCallsBeforeUnmount = clearSpy.mock.calls.length;
		unmount();

		// dispose() -> clearTimer() -> clearInterval must fire exactly once on unmount.
		expect(clearSpy.mock.calls.length).toBeGreaterThan(clearCallsBeforeUnmount);

		// Advancing time must not throw (no setState-after-unmount tick callback).
		expect(() => {
			act(() => {
				vi.advanceTimersByTime(5000);
			});
		}).not.toThrow();

		clearSpy.mockRestore();
	});

	it("recreates a fresh controller after StrictMode-style unmount/remount", () => {
		const data = makeData(5);
		const first = renderHook(() => useReplayState(data));
		first.unmount();

		// A brand-new hook instance (fresh refs) must still initialize correctly
		// with the full dataset — cursor at the end, replay inactive.
		const second = renderHook(() => useReplayState(data));
		expect(second.result.current.totalBars).toBe(5);
		expect(second.result.current.currentBar).toBe(4);
		expect(second.result.current.replayActive).toBe(false);
		second.unmount();
	});
});

describe("useReplayState A6 session lifecycle", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.clearAllTimers();
		vi.useRealTimers();
	});

	it("starts inactive and keeps the session through Pause at the last bar", () => {
		const data = makeData(5);
		const { result, unmount } = renderHook(() => useReplayState(data));

		expect(result.current.sessionActive).toBe(false);
		expect(result.current.sessionEpoch).toBe(0);

		act(() => {
			result.current.onReplaySeek(4);
		});
		expect(result.current.sessionActive).toBe(true);
		expect(result.current.replayActive).toBe(true);

		act(() => {
			result.current.onReplayPause();
		});
		expect(result.current.currentBar).toBe(4);
		expect(result.current.sessionActive).toBe(true);
		expect(result.current.replayActive).toBe(true);
		expect(result.current.replayData).toHaveLength(5);

		act(() => {
			result.current.onReplayStop();
		});
		expect(result.current.sessionActive).toBe(false);
		expect(result.current.sessionEpoch).toBe(1);
		expect(result.current.replayActive).toBe(false);
		unmount();
	});

	it("does not start a session when Step hits the last-bar boundary", () => {
		const data = makeData(5);
		const { result, unmount } = renderHook(() => useReplayState(data));

		expect(result.current.currentBar).toBe(4);
		act(() => {
			result.current.onReplayStepForward();
		});
		expect(result.current.currentBar).toBe(4);
		expect(result.current.sessionActive).toBe(false);

		act(() => {
			result.current.onReplayStepBack();
		});
		expect(result.current.currentBar).toBe(3);
		expect(result.current.sessionActive).toBe(true);
		unmount();
	});

	it("Play at end opens a fresh session at bar 0 with a new epoch", () => {
		const data = makeData(5);
		const { result, unmount } = renderHook(() => useReplayState(data));

		act(() => {
			result.current.onReplayPlay();
		});

		expect(result.current.playing).toBe(true);
		expect(result.current.currentBar).toBe(0);
		expect(result.current.sessionActive).toBe(true);
		expect(result.current.sessionEpoch).toBe(1);
		expect(result.current.replayData).toHaveLength(1);
		unmount();
	});

	it("Rewind always starts a new session epoch, even when already at bar 0", () => {
		const data = makeData(5);
		const { result, unmount } = renderHook(() => useReplayState(data));

		act(() => {
			result.current.onReplayRewind();
		});
		expect(result.current.currentBar).toBe(0);
		expect(result.current.sessionActive).toBe(true);
		expect(result.current.sessionEpoch).toBe(1);

		act(() => {
			result.current.onReplayRewind();
		});
		expect(result.current.currentBar).toBe(0);
		expect(result.current.sessionActive).toBe(true);
		expect(result.current.sessionEpoch).toBe(2);
		unmount();
	});
});

describe("useReplayState onTick (R3.1 tick broadcast)", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.clearAllTimers();
		vi.useRealTimers();
	});

	it("fires onTick with (barIndex, timestamp) on seek, not on mount", () => {
		const data = makeData(10);
		const onTick = vi.fn();
		const { result, unmount } = renderHook(() => useReplayState(data, { onTick }));

		expect(onTick).not.toHaveBeenCalled();

		act(() => {
			result.current.onReplaySeek(4);
		});

		expect(onTick).toHaveBeenCalledTimes(1);
		expect(onTick).toHaveBeenCalledWith(4, data[4].date.getTime());
		unmount();
	});

	it("suppressTickRef consumes one bus-originated tick, then re-arms", () => {
		const data = makeData(10);
		const onTick = vi.fn();
		const suppressTickRef = { current: false };
		const { result, unmount } = renderHook(() => useReplayState(data, { onTick, suppressTickRef }));

		suppressTickRef.current = true;
		act(() => {
			result.current.onReplaySeek(3);
		});
		expect(onTick).not.toHaveBeenCalled();
		expect(suppressTickRef.current).toBe(false);

		act(() => {
			result.current.onReplaySeek(5);
		});
		expect(onTick).toHaveBeenCalledTimes(1);
		expect(onTick).toHaveBeenCalledWith(5, data[5].date.getTime());
		unmount();
	});

	it("does not fire onTick on speed-only change", () => {
		const data = makeData(10);
		const onTick = vi.fn();
		const { result, unmount } = renderHook(() => useReplayState(data, { onTick }));

		act(() => {
			result.current.onReplaySpeedChange(2);
		});

		expect(onTick).not.toHaveBeenCalled();
		unmount();
	});

	it("BUG-2 repro: seek while PLAYING pauses (seekOnly, never auto-resumes)", () => {
		const data = makeData(10);
		const { result, unmount } = renderHook(() => useReplayState(data));

		act(() => {
			result.current.onReplayRewind();
			result.current.onReplayPlay();
		});
		expect(result.current.playing).toBe(true);

		// User clicks a bar (start-bar select / Alt+click) mid-playback.
		act(() => {
			result.current.onReplaySeek(5);
		});

		// SeekOnly contract: cursor moves, playback STOPS, replay stays active.
		expect(result.current.currentBar).toBe(5);
		expect(result.current.playing).toBe(false);
		expect(result.current.replayActive).toBe(true);
		unmount();
	});

	it("BUG-2 repro: seek while PAUSED stays paused (no auto-play)", () => {
		const data = makeData(10);
		const { result, unmount } = renderHook(() => useReplayState(data));

		act(() => {
			result.current.onReplaySeek(5);
		});

		expect(result.current.currentBar).toBe(5);
		expect(result.current.playing).toBe(false);
		expect(result.current.replayActive).toBe(true);

		// Explicit play is still required to resume — seek never implies play.
		act(() => {
			result.current.onReplayPlay();
		});
		expect(result.current.playing).toBe(true);
		unmount();
	});

	it("BUG-2 repro: seekByDate while PLAYING pauses (same seekOnly contract)", () => {
		const data = makeData(10);
		const { result, unmount } = renderHook(() => useReplayState(data));

		act(() => {
			result.current.onReplayRewind();
			result.current.onReplayPlay();
		});
		expect(result.current.playing).toBe(true);

		act(() => {
			result.current.onReplaySeekByDate(data[3].date);
		});

		expect(result.current.currentBar).toBe(3);
		expect(result.current.playing).toBe(false);
		unmount();
	});

	it("R1-d TF-wait: repeated same-bar seeks emit onTick once (no per-tick storm)", () => {
		const data = makeData(10);
		const onTick = vi.fn();
		const { result, unmount } = renderHook(() => useReplayState(data, { onTick }));

		// First seek arms the tracker without emitting (mount semantics).
		act(() => {
			result.current.onReplaySeek(4);
		});
		expect(onTick).toHaveBeenCalledTimes(1);

		// Same bar hammered (large-TF slave fed by small-TF master ticks).
		act(() => {
			result.current.onReplaySeek(4);
		});
		act(() => {
			result.current.onReplaySeek(4);
		});
		expect(onTick).toHaveBeenCalledTimes(1);

		// New bar advances exactly once.
		act(() => {
			result.current.onReplaySeek(5);
		});
		expect(onTick).toHaveBeenCalledTimes(2);
		expect(onTick).toHaveBeenLastCalledWith(5, data[5].date.getTime());
		unmount();
	});
});
