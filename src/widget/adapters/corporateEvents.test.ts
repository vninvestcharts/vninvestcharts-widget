import { describe, expect, it, vi } from "vitest";
import { fetchCorporateEvents } from "./corporateEvents";

const plotData = Array.from({ length: 60 }, (_, index) => ({ date: new Date(1_700_000_000_000 + index * 3_600_000) }));

describe("corporateEvents production safety", () => {
	it("returns empty when the adapter cannot supply events", async () => {
		await expect(fetchCorporateEvents(undefined, "FPT", 0, 1, plotData)).resolves.toEqual([]);
	});

	it("returns empty when the adapter request fails", async () => {
		const adapter = { fetchCorporateEvents: vi.fn().mockRejectedValue(new Error("down")) } as never;
		await expect(fetchCorporateEvents(adapter, "FPT", 0, 1, plotData)).resolves.toEqual([]);
	});

	it("allows mock events only in explicit demo mode", async () => {
		const events = await fetchCorporateEvents(undefined, "FPT", 0, 1, plotData, { allowMockEvents: true });
		expect(events.length).toBeGreaterThan(0);
	});
});
