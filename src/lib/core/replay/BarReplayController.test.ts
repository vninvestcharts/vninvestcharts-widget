import { describe, expect, it, vi } from "vitest";
import { BarReplayController } from "./BarReplayController";

function createBar(date: string, close: number) {
	return {
		date: new Date(date),
		open: close - 1,
		high: close + 1,
		low: close - 2,
		close,
		volume: close * 10,
	};
}

describe("BarReplayController", () => {
	it("slices visible bars and steps through the stream", () => {
		const controller = new BarReplayController({
			allData: [
				createBar("2026-01-01T00:00:00Z", 1),
				createBar("2026-01-01T01:00:00Z", 2),
				createBar("2026-01-01T02:00:00Z", 3),
				createBar("2026-01-01T03:00:00Z", 4),
			],
			startIndex: 2,
		});

		expect(controller.getCurrentIndex()).toBe(2);
		expect(controller.getVisibleData()).toHaveLength(2);
		expect(controller.getCurrentBar()?.close).toBe(2);

		controller.stepForward();
		expect(controller.getCurrentIndex()).toBe(3);
		expect(controller.getVisibleData()).toHaveLength(3);

		controller.stepBack();
		expect(controller.getCurrentIndex()).toBe(2);
		expect(controller.getVisibleData().at(-1)?.close).toBe(2);
	});

	it("jumps to a replay start date and reports progress", () => {
		const controller = new BarReplayController({
			allData: [
				createBar("2026-01-01T00:00:00Z", 1),
				createBar("2026-01-01T01:00:00Z", 2),
				createBar("2026-01-01T02:00:00Z", 3),
			],
		});

		controller.jumpToDate(new Date("2026-01-01T01:00:00Z"));

		expect(controller.getCurrentIndex()).toBe(2);
		expect(controller.getState().progress).toBeCloseTo(2 / 3);
		expect(controller.getState().canStepForward).toBe(true);
		expect(controller.getState().canStepBack).toBe(true);
	});

	it("rewinds to the first visible bar and jumps back to the latest bar", () => {
		const controller = new BarReplayController({
			allData: [
				createBar("2026-01-01T00:00:00Z", 1),
				createBar("2026-01-01T01:00:00Z", 2),
				createBar("2026-01-01T02:00:00Z", 3),
			],
			startIndex: 3,
		});

		controller.rewind();
		expect(controller.getCurrentIndex()).toBe(1);
		expect(controller.getVisibleData()).toHaveLength(1);
		expect(controller.getState().canStepBack).toBe(false);

		controller.jumpToLatest();
		expect(controller.getCurrentIndex()).toBe(3);
		expect(controller.getVisibleData()).toHaveLength(3);
		expect(controller.getState().canStepBack).toBe(true);
	});

	it("plays with the configured speed and stops at the end", () => {
		vi.useFakeTimers();
		try {
			const controller = new BarReplayController({
				allData: [
					createBar("2026-01-01T00:00:00Z", 1),
					createBar("2026-01-01T01:00:00Z", 2),
					createBar("2026-01-01T02:00:00Z", 3),
				],
				startIndex: 1,
				speed: 2,
				baseIntervalMs: 1000,
			});

			const states: Array<{ index: number; playing: boolean }> = [];
			const unsubscribe = controller.subscribe((state) => {
				states.push({ index: state.currentIndex, playing: state.isPlaying });
			});

			controller.play();
			vi.advanceTimersByTime(500);
			expect(controller.getCurrentIndex()).toBe(2);
			expect(controller.isPlayingNow()).toBe(true);

			vi.advanceTimersByTime(500);
			expect(controller.getCurrentIndex()).toBe(3);
			expect(controller.isPlayingNow()).toBe(false);
			expect(controller.getVisibleData()).toHaveLength(3);
			expect(states.some((state) => state.playing)).toBe(true);

			unsubscribe();
			controller.dispose();
		} finally {
			vi.useRealTimers();
		}
	});
});