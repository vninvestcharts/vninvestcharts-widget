// Header timeframe funnel (Slice D3 — SY-09).
// Local apply + config always run; engine fan-out only when the channel is on
// and the source chart did not opt out.

import { describe, it, expect, vi } from "vitest";
import { applyHeaderTimeframe, type HeaderTimeframeDeps } from "../headerSync";

function makeDeps(overrides: Partial<HeaderTimeframeDeps> = {}) {
	const handle = { setTimeframe: vi.fn() };
	const deps: HeaderTimeframeDeps & { handle: { setTimeframe: ReturnType<typeof vi.fn> } } = {
		getHandle: vi.fn(() => handle),
		broadcastTimeframe: vi.fn(),
		onConfigChange: vi.fn(),
		syncEnabled: true,
		sourceOptedOut: false,
		handle,
		...overrides,
	};
	return deps;
}

describe("applyHeaderTimeframe (D3)", () => {
	it("applies locally + broadcasts when the channel is on and opted in", () => {
		const deps = makeDeps();
		applyHeaderTimeframe("chart-A", "5m", deps);
		expect(deps.handle.setTimeframe).toHaveBeenCalledWith("5m");
		expect(deps.onConfigChange).toHaveBeenCalledWith("chart-A", "5m");
		expect(deps.broadcastTimeframe).toHaveBeenCalledWith("chart-A", "5m");
	});

	it("skips broadcast when the global toggle is off (local-only)", () => {
		const deps = makeDeps({ syncEnabled: false });
		applyHeaderTimeframe("chart-A", "5m", deps);
		expect(deps.handle.setTimeframe).toHaveBeenCalledWith("5m");
		expect(deps.onConfigChange).toHaveBeenCalledWith("chart-A", "5m");
		expect(deps.broadcastTimeframe).not.toHaveBeenCalled();
	});

	it("skips broadcast when the source chart opted out (local-only)", () => {
		const deps = makeDeps({ sourceOptedOut: true });
		applyHeaderTimeframe("chart-A", "5m", deps);
		expect(deps.handle.setTimeframe).toHaveBeenCalledWith("5m");
		expect(deps.broadcastTimeframe).not.toHaveBeenCalled();
	});

	it("tolerates missing handle and missing broadcast fn", () => {
		const deps = makeDeps({ getHandle: () => undefined, broadcastTimeframe: undefined });
		expect(() => applyHeaderTimeframe("chart-A", "5m", deps)).not.toThrow();
		expect(deps.onConfigChange).toHaveBeenCalledWith("chart-A", "5m");
	});
});
