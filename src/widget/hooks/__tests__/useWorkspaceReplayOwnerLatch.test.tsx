import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useWorkspaceReplayOwnerLatch } from "../useWorkspaceReplayOwnerLatch";
import type { WidgetChartHandle } from "../../utils/widgetHelpers";

function makeHandle(sessionActive: boolean): WidgetChartHandle {
	return {
		getReplayState: () => ({
			playing: false,
			speed: 1,
			currentBar: sessionActive ? 10 : 99,
			totalBars: 100,
			currentBarTimestamp: 1000,
			sessionActive,
		}),
	} as unknown as WidgetChartHandle;
}

describe("useWorkspaceReplayOwnerLatch A6", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.clearAllTimers();
		vi.useRealTimers();
	});

	it("stays idle when no chart has an active session", () => {
		const claim = vi.fn();
		const stopAll = vi.fn();
		const handles = new Map<string, WidgetChartHandle>([["c1", makeHandle(false)]]);

		renderHook(() =>
			useWorkspaceReplayOwnerLatch({
				chartHandles: handles,
				activeChartId: "c1",
				sessionOwnerId: null,
				claimSessionOwner: claim,
				stopAll,
			}),
		);
		act(() => {
			vi.advanceTimersByTime(1000);
		});

		expect(claim).not.toHaveBeenCalled();
		expect(stopAll).not.toHaveBeenCalled();
	});

	it("claims the active chart when it owns the live session, otherwise the first active chart", () => {
		const claim = vi.fn();
		const handles = new Map<string, WidgetChartHandle>([
			["c1", makeHandle(true)],
			["c2", makeHandle(true)],
		]);

		const { rerender } = renderHook(
			({ activeChartId }) =>
				useWorkspaceReplayOwnerLatch({
					chartHandles: handles,
					activeChartId,
					sessionOwnerId: null,
					claimSessionOwner: claim,
					stopAll: vi.fn(),
				}),
			{ initialProps: { activeChartId: "c2" as string | null } },
		);
		act(() => {
			vi.advanceTimersByTime(250);
		});
		expect(claim).toHaveBeenLastCalledWith("c2");

		claim.mockClear();
		rerender({ activeChartId: null });
		act(() => {
			vi.advanceTimersByTime(250);
		});
		expect(claim).toHaveBeenLastCalledWith("c1");
	});

	it("stops all exactly once when the owner unmounts, then waits for idle before claiming again", () => {
		const claim = vi.fn();
		const stopAll = vi.fn();
		const handles = new Map<string, WidgetChartHandle>([
			["c1", makeHandle(true)],
			["c2", makeHandle(true)],
		]);

		renderHook(() =>
			useWorkspaceReplayOwnerLatch({
				chartHandles: handles,
				activeChartId: "c2",
				sessionOwnerId: "c1",
				claimSessionOwner: claim,
				stopAll,
			}),
		);

		handles.delete("c1");
		act(() => {
			vi.advanceTimersByTime(750);
		});
		expect(stopAll).toHaveBeenCalledTimes(1);
		expect(claim).not.toHaveBeenCalled();

		handles.set("c2", makeHandle(false));
		act(() => {
			vi.advanceTimersByTime(250);
		});
		expect(stopAll).toHaveBeenCalledTimes(1);
		expect(claim).not.toHaveBeenCalled();
	});
});
