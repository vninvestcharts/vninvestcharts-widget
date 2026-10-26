import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
	onReplayEvent,
	emitReplayEvent,
	onAnyReplayEvent,
	parseReplayTimeframeToMinutes,
} from "./ReplayEventBus";

describe("ReplayEventBus", () => {
	beforeEach(() => {
		// Ensure no leftover listeners from previous tests
		vi.restoreAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("emits and receives a MASTER_ANNOUNCE event", () => {
		const handler = vi.fn();
		const unsub = onReplayEvent("MASTER_ANNOUNCE", handler);

		emitReplayEvent({
			type: "MASTER_ANNOUNCE",
			chartId: "chart-1",
			timestamp: Date.now(),
			tf: "1m",
			barIndex: 42,
		});

		expect(handler).toHaveBeenCalledTimes(1);
		const received = handler.mock.calls[0][0];
		expect(received.type).toBe("MASTER_ANNOUNCE");
		expect(received.chartId).toBe("chart-1");
		expect((received as any).tf).toBe("1m");
		expect((received as any).barIndex).toBe(42);
		unsub();
	});

	it("emits and receives a REPLAY_SEEK event with currentBarDate", () => {
		const handler = vi.fn();
		const unsub = onReplayEvent("REPLAY_SEEK", handler);

		emitReplayEvent({
			type: "REPLAY_SEEK",
			chartId: "chart-2",
			timestamp: 2000,
			barIndex: 10,
			currentBarDate: 1234567895000,
		});

		expect(handler).toHaveBeenCalledTimes(1);
		const received = handler.mock.calls[0][0];
		expect((received as any).currentBarDate).toBe(1234567895000);
		unsub();
	});

	it("emits and receives a REPLAY_TOGGLE event", () => {
		const handler = vi.fn();
		const unsub = onReplayEvent("REPLAY_TOGGLE", handler);

		emitReplayEvent({
			type: "REPLAY_TOGGLE",
			chartId: "chart-1",
			timestamp: Date.now(),
			playing: true,
		});

		expect(handler).toHaveBeenCalledTimes(1);
		expect(handler.mock.calls[0][0].type).toBe("REPLAY_TOGGLE");
		expect((handler.mock.calls[0][0] as any).playing).toBe(true);
		unsub();
	});

	it("emits and receives a REPLAY_END event", () => {
		const handler = vi.fn();
		const unsub = onReplayEvent("REPLAY_END", handler);

		emitReplayEvent({
			type: "REPLAY_END",
			chartId: "chart-1",
			timestamp: Date.now(),
		});

		expect(handler).toHaveBeenCalledTimes(1);
		expect(handler.mock.calls[0][0].type).toBe("REPLAY_END");
		unsub();
	});

	it("forceBroadcast field is typed and passed through", () => {
		const handler = vi.fn();
		const unsub = onReplayEvent("REPLAY_SEEK", handler);

		emitReplayEvent({
			type: "REPLAY_SEEK",
			chartId: "chart-1",
			timestamp: 1000,
			barIndex: 5,
			currentBarDate: 1234567890000,
			forceBroadcast: true,
		});

		expect(handler).toHaveBeenCalledTimes(1);
		expect(handler.mock.calls[0][0].forceBroadcast).toBe(true);
		unsub();
	});

	it("onAnyReplayEvent receives all active event types", () => {
		const handler = vi.fn();
		const unsub = onAnyReplayEvent(handler);

		emitReplayEvent({ type: "MASTER_ANNOUNCE", chartId: "c1", timestamp: 1, tf: "1m", barIndex: 0 });
		expect(handler).toHaveBeenCalledTimes(1);

		emitReplayEvent({ type: "REPLAY_SEEK", chartId: "c1", timestamp: 2, barIndex: 2, currentBarDate: 200 });
		expect(handler).toHaveBeenCalledTimes(2);

		emitReplayEvent({ type: "REPLAY_TOGGLE", chartId: "c1", timestamp: 3, playing: false });
		expect(handler).toHaveBeenCalledTimes(3);

		emitReplayEvent({ type: "REPLAY_END", chartId: "c1", timestamp: 4 });
		expect(handler).toHaveBeenCalledTimes(4);

		unsub();
	});

	it("unsubscribe removes the listener", () => {
		const handler = vi.fn();
		const unsub = onReplayEvent("REPLAY_SEEK", handler);
		unsub();

		emitReplayEvent({ type: "REPLAY_SEEK", chartId: "c1", timestamp: 1, barIndex: 0, currentBarDate: 100 });
		expect(handler).not.toHaveBeenCalled();
	});

	it("unsubscribe from onAnyReplayEvent removes all listeners", () => {
		const handler = vi.fn();
		const unsub = onAnyReplayEvent(handler);
		unsub();

		emitReplayEvent({ type: "REPLAY_SEEK", chartId: "c1", timestamp: 1, barIndex: 0, currentBarDate: 100 });
		emitReplayEvent({ type: "REPLAY_END", chartId: "c1", timestamp: 2 });
		expect(handler).not.toHaveBeenCalled();
	});

	it("does not leak listeners after multiple subscribe/unsubscribe cycles", () => {
		const handler = vi.fn();

		// Subscribe 5 times WITHOUT unsubscribing — each addEventListener fires once per emit
		const unsubs: (() => void)[] = [];
		for (let i = 0; i < 5; i++) {
			unsubs.push(onReplayEvent("REPLAY_SEEK", handler));
		}

		emitReplayEvent({ type: "REPLAY_SEEK", chartId: "c1", timestamp: 1, barIndex: 0, currentBarDate: 100 });
		expect(handler).toHaveBeenCalledTimes(5);

		// Clean up all
		unsubs.forEach(u => u());
		handler.mockClear();

		emitReplayEvent({ type: "REPLAY_SEEK", chartId: "c1", timestamp: 2, barIndex: 1, currentBarDate: 101 });
		expect(handler).not.toHaveBeenCalled();
	});

	// F-12: namespace isolation cho nhiều instance multi-chart cùng mount.
	describe("instanceId namespacing (F-12)", () => {
		it("subscriber với instanceId chỉ nhận event emit cùng instanceId", () => {
			const handlerA = vi.fn();
			const unsubA = onReplayEvent("REPLAY_SEEK", handlerA, "ws-A");

			emitReplayEvent({ type: "REPLAY_SEEK", chartId: "c1", timestamp: 1, barIndex: 0, currentBarDate: 100 }, "ws-A");
			expect(handlerA).toHaveBeenCalledTimes(1);

			// Event từ instance khác không chạm vào subscriber ws-A
			emitReplayEvent({ type: "REPLAY_SEEK", chartId: "c1", timestamp: 2, barIndex: 1, currentBarDate: 101 }, "ws-B");
			expect(handlerA).toHaveBeenCalledTimes(1);

			unsubA();
		});

		it("hai instance cô lập lẫn nhau, không cross-talk", () => {
			const handlerA = vi.fn();
			const handlerB = vi.fn();
			const unsubA = onAnyReplayEvent(handlerA, "ws-A");
			const unsubB = onAnyReplayEvent(handlerB, "ws-B");

			emitReplayEvent({ type: "REPLAY_END", chartId: "c1", timestamp: 1 }, "ws-A");
			expect(handlerA).toHaveBeenCalledTimes(1);
			expect(handlerB).not.toHaveBeenCalled();

			emitReplayEvent({ type: "REPLAY_END", chartId: "c2", timestamp: 2 }, "ws-B");
			expect(handlerA).toHaveBeenCalledTimes(1);
			expect(handlerB).toHaveBeenCalledTimes(1);

			unsubA();
			unsubB();
		});

		it("default namespace (no instanceId) cô lập khỏi namespace instance", () => {
			const handlerDefault = vi.fn();
			const handlerNs = vi.fn();
			const unsubDefault = onReplayEvent("REPLAY_TOGGLE", handlerDefault);
			const unsubNs = onReplayEvent("REPLAY_TOGGLE", handlerNs, "ws-A");

			emitReplayEvent({ type: "REPLAY_TOGGLE", chartId: "c1", timestamp: 1, playing: true });
			expect(handlerDefault).toHaveBeenCalledTimes(1);
			expect(handlerNs).not.toHaveBeenCalled();

			emitReplayEvent({ type: "REPLAY_TOGGLE", chartId: "c1", timestamp: 2, playing: false }, "ws-A");
			expect(handlerDefault).toHaveBeenCalledTimes(1);
			expect(handlerNs).toHaveBeenCalledTimes(1);

			unsubDefault();
			unsubNs();
		});
	});
});

describe("parseReplayTimeframeToMinutes", () => {
	it.each([
		["1m", 1],
		["5m", 5],
		["15m", 15],
		["1h", 60],
		["4h", 240],
		["1D", 1440],
		["1W", 10080],
		["1M", 43200],
		["M", 43200],
		["", Infinity],
		[null as unknown as string, Infinity],
	])("parses %s -> %i minutes", (tf, expected) => {
		expect(parseReplayTimeframeToMinutes(tf as string)).toBe(expected);
	});
});
