import { describe, expect, it, vi } from "vitest";
import { emitTelemetry } from "../telemetry";

describe("telemetry opt-in sink (BL-18)", () => {
	it("is a no-op without a handler", () => {
		expect(() => emitTelemetry(undefined, "data-error", "x")).not.toThrow();
		expect(() => emitTelemetry(null, "data-error", "x")).not.toThrow();
	});

	it("forwards classified events with timestamp", () => {
		const handler = vi.fn();
		emitTelemetry(handler, "data-error", "boom", { code: "DATA_FETCH", context: { symbol: "VIC" } });
		expect(handler).toHaveBeenCalledTimes(1);
		const event = handler.mock.calls[0][0];
		expect(event.kind).toBe("data-error");
		expect(event.code).toBe("DATA_FETCH");
		expect(event.context).toEqual({ symbol: "VIC" });
		expect(typeof event.timestamp).toBe("number");
	});

	it("never throws when the host handler throws", () => {
		expect(() =>
			emitTelemetry(() => { throw new Error("host bug"); }, "render-error", "x"),
		).not.toThrow();
	});
});
