// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { formatForkXAxisLabel, resolveForkTickLabel } from "../xAxisTickFormatter";

/**
 * Batch B / B4 — the `scales.timeFormat` control (12h / 24h) had no reader:
 * every X-axis label was always rendered on a 24-hour clock
 * (`intradayAxisFormat` → `hour12: false`).
 *
 * The assertion is deliberately locale agnostic: the day-period marker is
 * "AM/PM" in en-US and "SA/CH" in vi-VN, so the test only requires that the
 * 12-hour label differs from the 24-hour one and carries a non-digit marker.
 */
const SAMPLE = new Date("2026-01-02T10:00:00Z");
const HAS_MARKER = /[^\d:]/;

describe("x-axis time format (B4)", () => {
	it("renders a 12-hour label with a day-period marker", () => {
		const label12 = resolveForkTickLabel(SAMPLE, "1m", 20, "yyyy-mm-dd", null, "12h").label;
		expect(label12).toMatch(HAS_MARKER);
	});

	it("keeps the 24-hour label free of a day-period marker", () => {
		const label24 = resolveForkTickLabel(SAMPLE, "1m", 20, "yyyy-mm-dd", null, "24h").label;
		expect(label24).not.toMatch(HAS_MARKER);
	});

	it("does not change the previous behaviour when the format is omitted", () => {
		const implicit = resolveForkTickLabel(SAMPLE, "1m", 20, "yyyy-mm-dd", null).label;
		const explicit = resolveForkTickLabel(SAMPLE, "1m", 20, "yyyy-mm-dd", null, "24h").label;
		expect(implicit).toBe(explicit);
		expect(implicit).not.toMatch(HAS_MARKER);
	});

	it("applies the 12-hour format to the single-label formatter as well", () => {
		const label12 = formatForkXAxisLabel(SAMPLE, "1m", 20, "yyyy-mm-dd", "12h");
		const label24 = formatForkXAxisLabel(SAMPLE, "1m", 20, "yyyy-mm-dd", "24h");
		expect(label12).not.toBe(label24);
		expect(label12).toMatch(HAS_MARKER);
	});
});
