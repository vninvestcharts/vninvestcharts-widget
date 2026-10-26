import { describe, it, expect } from "vitest";
import { resolveCrosshairPrice, resolveLocalXIndexFromTimestamp } from "../utils/crosshairSync";

function makePlotData(timestamps: number[]) {
	return timestamps.map((ts) => ({ date: new Date(ts) }));
}

describe("resolveLocalXIndexFromTimestamp — exact-timestamp crosshair sync", () => {
	// X1: exact timestamp match resolves to the matching target bar
	it("X1: resolves to the bar whose timestamp equals the source timestamp", () => {
		const dailyTs = [
			Date.parse("2026-07-10T00:00:00Z"),
			Date.parse("2026-07-11T00:00:00Z"),
			Date.parse("2026-07-12T00:00:00Z"),
		];
		const targetTs = [
			Date.parse("2026-07-09T00:00:00Z"),
			Date.parse("2026-07-10T00:00:00Z"),
			Date.parse("2026-07-11T00:00:00Z"),
			Date.parse("2026-07-12T00:00:00Z"),
			Date.parse("2026-07-13T00:00:00Z"),
		];

		const sourceData = makePlotData(dailyTs);
		const targetData = makePlotData(targetTs);

		// Hover on source bar index 1 (July 11)
		const hoverTimestamp = sourceData[1].date.getTime();
		const result = resolveLocalXIndexFromTimestamp(targetData, hoverTimestamp);

		// Target July 11 is index 2
		expect(result).toBe(2);
	});

	// X2: pan-invariant — same timestamp always resolves to same target bar
	it("X2: pan-invariant — same timestamp resolves to the same target bar", () => {
		const targetTs = [
			Date.parse("2026-07-10T08:00:00Z"),
			Date.parse("2026-07-10T09:00:00Z"),
			Date.parse("2026-07-10T10:00:00Z"),
			Date.parse("2026-07-10T11:00:00Z"),
			Date.parse("2026-07-10T12:00:00Z"),
		];
		const targetData = makePlotData(targetTs);
		const hoverTimestamp = Date.parse("2026-07-10T11:00:00Z");

		const r1 = resolveLocalXIndexFromTimestamp(targetData, hoverTimestamp);
		const r2 = resolveLocalXIndexFromTimestamp(targetData, hoverTimestamp);
		const r3 = resolveLocalXIndexFromTimestamp(targetData, hoverTimestamp);

		expect(r1).toBe(r2);
		expect(r2).toBe(r3);
		expect(r1).toBe(3);
	});

	// X3: crypto → stock over a weekend the stock has no bar for → hide crosshair
	it("X3: returns null when the exact timestamp has no bar on the target (weekend gap)", () => {
		// Stock (exchange-calendar): trades Fri 26/06 then next bar Mon 29/06 — no weekend bars.
		const stockTs = [
			Date.parse("2026-06-25T00:00:00Z"), // Thu
			Date.parse("2026-06-26T00:00:00Z"), // Fri
			Date.parse("2026-06-29T00:00:00Z"), // Mon
			Date.parse("2026-06-30T00:00:00Z"), // Tue
		];
		const stockData = makePlotData(stockTs);

		// Crypto (continuous) hovers Saturday 27/06 — stock has no such bar.
		const saturday = Date.parse("2026-06-27T00:00:00Z");
		expect(resolveLocalXIndexFromTimestamp(stockData, saturday)).toBeNull();

		// Sunday too.
		const sunday = Date.parse("2026-06-28T00:00:00Z");
		expect(resolveLocalXIndexFromTimestamp(stockData, sunday)).toBeNull();

		// Monday exists → resolves.
		expect(resolveLocalXIndexFromTimestamp(stockData, Date.parse("2026-06-29T00:00:00Z"))).toBe(2);
	});

	// X4: stock → crypto — crypto has a bar at every day → always resolves
	it("X4: continuous target always has the matching bar (stock → crypto)", () => {
		const cryptoTs = [
			Date.parse("2026-06-25T00:00:00Z"),
			Date.parse("2026-06-26T00:00:00Z"),
			Date.parse("2026-06-27T00:00:00Z"),
			Date.parse("2026-06-28T00:00:00Z"),
			Date.parse("2026-06-29T00:00:00Z"),
		];
		const cryptoData = makePlotData(cryptoTs);

		// Stock bar Friday 26/06 → crypto has it at index 1.
		expect(resolveLocalXIndexFromTimestamp(cryptoData, Date.parse("2026-06-26T00:00:00Z"))).toBe(1);
		// Stock bar Monday 29/06 → crypto index 4.
		expect(resolveLocalXIndexFromTimestamp(cryptoData, Date.parse("2026-06-29T00:00:00Z"))).toBe(4);
	});

	// X5: timezone-offset tolerance — a same-day 1D bar stamped with a tz offset
	// still snaps to the correct bar (nearest within half a bar-duration).
	it("X5: snaps a timezone-offset 1D timestamp to the same calendar-day bar", () => {
		// Crypto (continuous) target, 1D bars at 00:00 UTC.
		const cryptoTs = [
			Date.parse("2026-07-13T00:00:00Z"),
			Date.parse("2026-07-14T00:00:00Z"),
			Date.parse("2026-07-15T00:00:00Z"),
			Date.parse("2026-07-16T00:00:00Z"),
		];
		const cryptoData = makePlotData(cryptoTs);

		// VN stock stamps the 15/07 bar at 00:00 Asia/Ho_Chi_Minh = 14/07 17:00 UTC.
		const vnStock15 = Date.parse("2026-07-14T17:00:00Z");
		// Must resolve to crypto 15/07 (index 2), NOT 14/07 (index 1).
		// Cursor at the source bar start (fraction 0) → exactly index 2.
		expect(resolveLocalXIndexFromTimestamp(cryptoData, vnStock15, 0)).toBe(2);
	});

	// X8: source-bar fraction is preserved (exact cursor position, tz-immune)
	it("X8: preserves the source-bar fraction so the crosshair sits at the cursor", () => {
		const cryptoTs = [
			Date.parse("2026-07-13T00:00:00Z"),
			Date.parse("2026-07-14T00:00:00Z"),
			Date.parse("2026-07-15T00:00:00Z"),
			Date.parse("2026-07-16T00:00:00Z"),
		];
		const cryptoData = makePlotData(cryptoTs);
		const vnStock15 = Date.parse("2026-07-14T17:00:00Z");

		// Cursor in the middle of the source bar (fraction 0.5) → index 2 + 0.5.
		expect(resolveLocalXIndexFromTimestamp(cryptoData, vnStock15, 0.5)).toBeCloseTo(2.5, 6);
		// Source xIndexFloat is an absolute float; only its fractional part matters.
		expect(resolveLocalXIndexFromTimestamp(cryptoData, vnStock15, 87.25)).toBeCloseTo(2.25, 6);
	});

	// X9: same-timezone charts also carry the cursor fraction through
	it("X9: passes the cursor fraction through when both charts share the grid", () => {
		const targetTs = [
			Date.parse("2026-07-10T00:00:00Z"),
			Date.parse("2026-07-11T00:00:00Z"),
			Date.parse("2026-07-12T00:00:00Z"),
		];
		const targetData = makePlotData(targetTs);
		const hover = Date.parse("2026-07-11T00:00:00Z");
		expect(resolveLocalXIndexFromTimestamp(targetData, hover, 0.4)).toBeCloseTo(1.4, 6);
	});

	// X6: out of range — before first / after last → null
	it("X6: returns null before the first bar and after the last bar", () => {
		const targetTs = [
			Date.parse("2026-07-10T10:00:00Z"),
			Date.parse("2026-07-10T11:00:00Z"),
		];
		const targetData = makePlotData(targetTs);

		expect(resolveLocalXIndexFromTimestamp(targetData, Date.parse("2026-07-09T10:00:00Z"))).toBeNull();
		expect(resolveLocalXIndexFromTimestamp(targetData, Date.parse("2026-07-11T10:00:00Z"))).toBeNull();
	});

	it("X6b: returns null for empty plotData", () => {
		expect(resolveLocalXIndexFromTimestamp([], Date.now())).toBeNull();
	});

	// X7: deterministic — same input always same output
	it("X7: deterministic — same input always produces same output", () => {
		const targetTs = [
			Date.parse("2026-07-10T10:00:00Z"),
			Date.parse("2026-07-10T11:00:00Z"),
			Date.parse("2026-07-10T12:00:00Z"),
		];
		const targetData = makePlotData(targetTs);
		const timestamp = Date.parse("2026-07-10T11:00:00Z");

		const results = Array.from({ length: 10 }, () =>
			resolveLocalXIndexFromTimestamp(targetData, timestamp),
		);
		expect(new Set(results).size).toBe(1);
		expect(results[0]).toBe(1);
	});

	// Edge: exact match at first and last bar
	it("resolves exact match at first and last bars", () => {
		const targetTs = [
			Date.parse("2026-07-10T10:00:00Z"),
			Date.parse("2026-07-10T11:00:00Z"),
			Date.parse("2026-07-10T12:00:00Z"),
		];
		const targetData = makePlotData(targetTs);

		expect(resolveLocalXIndexFromTimestamp(targetData, targetTs[0])).toBe(0);
		expect(resolveLocalXIndexFromTimestamp(targetData, targetTs[2])).toBe(2);
	});

	// Edge: single bar
	it("handles single bar in plotData", () => {
		const targetTs = [Date.parse("2026-07-10T10:00:00Z")];
		const targetData = makePlotData(targetTs);

		expect(resolveLocalXIndexFromTimestamp(targetData, targetTs[0])).toBe(0);
		expect(resolveLocalXIndexFromTimestamp(targetData, targetTs[0] + 1)).toBeNull();
	});
});

describe("resolveCrosshairPrice - price-local crosshair sync (B4/Q4)", () => {
	// P1: same symbol + finite remote price → project the remote price.
	it("P1: same symbol uses the remote price", () => {
		expect(resolveCrosshairPrice(
			{ price: 40000, symbol: "VIC" }, "VIC", 132,
		)).toBe(40000);
	});

	// P2: different symbol → local bar close (VIC 40k must not land on FPT scale).
	it("P2: different symbol uses the local bar close", () => {
		expect(resolveCrosshairPrice(
			{ price: 40000, symbol: "VIC" }, "FPT", 132.5,
		)).toBe(132.5);
	});

	// P3: missing symbol (legacy payload) → local close.
	it("P3: missing remote symbol uses the local bar close", () => {
		expect(resolveCrosshairPrice(
			{ price: 40000 }, "FPT", 132.5,
		)).toBe(132.5);
	});

	// P4: nothing usable → null (caller falls back to mid-pane, vertical-only).
	it("P4: returns null when neither remote price nor local close is usable", () => {
		expect(resolveCrosshairPrice({ price: null, symbol: "VIC" }, "VIC", null)).toBeNull();
		expect(resolveCrosshairPrice({ price: Number.NaN, symbol: "VIC" }, "VIC", 10)).toBe(10);
	});
});
