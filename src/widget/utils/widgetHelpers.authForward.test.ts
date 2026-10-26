import { describe, expect, it, vi } from "vitest";
import { wrapAdapterForBackfill } from "./widgetHelpers";

describe("wrapAdapterForBackfill auth forwarding", () => {
	it("preserves setAuthHandler from the source adapter", () => {
		const setAuthHandler = vi.fn();
		const adapter = {
			fetchBarsInRange: vi.fn(),
			fetchBarsBefore: vi.fn(),
			subscribeToBar: vi.fn(),
			subscribeToTrades: vi.fn(),
			subscribeToOrderbook: vi.fn(),
			searchSymbols: vi.fn(),
			setAuthHandler,
		} as never;
		const wrapped = wrapAdapterForBackfill(adapter) as unknown as { setAuthHandler?: (handler: unknown) => void };
		const handler = { getToken: () => "token" };
		wrapped.setAuthHandler?.(handler);
		expect(setAuthHandler).toHaveBeenCalledWith(handler);
	});
});
