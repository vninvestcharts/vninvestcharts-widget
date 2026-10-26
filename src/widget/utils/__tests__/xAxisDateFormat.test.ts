import { describe, it, expect, beforeEach } from "vitest";
import { dateFormat, dailyAxisFormat } from "../widgetHelpers";
import { formatForkXAxisLabel, formatForkXAxisTicksSequence, resolveForkHoverLabel, resolveForkTickLabel } from "../xAxisTickFormatter";
import { setGlobalTimezone } from "../../../lib/utils/timezoneFormatter";

describe("X-Axis date formatting and user patterns", () => {
	beforeEach(() => {
		setGlobalTimezone("Asia/Ho_Chi_Minh");
	});

	// Test date: 2024-05-25T05:00:00Z -> 2024-05-25 12:00:00 (Asia/Ho_Chi_Minh, UTC+7)
	const testDate = new Date("2024-05-25T05:00:00Z");

	describe("formatForkXAxisLabel adaptive formatting", () => {
		it("formats daily timeframe with compact DD/MM for yyyy-mm-dd and dd/mm/yyyy", () => {
			const labelIso = formatForkXAxisLabel(testDate, "1D", 60, "yyyy-mm-dd");
			expect(labelIso).toBe("25/05");

			const labelVn = formatForkXAxisLabel(testDate, "1D", 60, "dd/mm/yyyy");
			expect(labelVn).toBe("25/05");
		});

		it("formats daily timeframe with MM/DD for mm/dd/yyyy pattern", () => {
			const labelUs = formatForkXAxisLabel(testDate, "1D", 60, "mm/dd/yyyy");
			expect(labelUs).toBe("05/25");
		});

		it("formats long-range daily view (>250 bars) with MM/YYYY", () => {
			const label = formatForkXAxisLabel(testDate, "1D", 300, "yyyy-mm-dd");
			expect(label).toBe("05/2024");
		});

		it("formats intraday timeframe (<= 48 bars) with HH:mm", () => {
			const label1h = formatForkXAxisLabel(testDate, "1h", 24, "yyyy-mm-dd");
			expect(label1h).toBe("12:00");
		});

		it("formats intraday timeframe (> 48 bars) with mixed date and time", () => {
			const label1h = formatForkXAxisLabel(testDate, "1h", 60, "yyyy-mm-dd");
			expect(label1h).toContain("25/05");
			expect(label1h).toContain("12:00");
		});

		it("V-01: wide 1h view (>250 bars) never shows monthYear duplicates", () => {
			const label1h = formatForkXAxisLabel(testDate, "1h", 300, "yyyy-mm-dd");
			expect(label1h).not.toMatch(/^\d{2}\/\d{4}$/);
			expect(label1h).toContain("25/05");
		});
	});

	describe("formatForkXAxisTicksSequence (V-01 regression lock)", () => {
		it("sparse 1h ticks across a month carry no monthYear labels", () => {
			const base = new Date("2026-08-20T00:00:00Z").getTime();
			const ticks = Array.from({ length: 8 }, (_, i) => ({
				key: `t${i}`,
				x: 40 + i * 80,
				dataIndex: i * 100,
				date: new Date(base + i * 100 * 3_600_000),
			}));
			const out = formatForkXAxisTicksSequence(ticks, "1h", "yyyy-mm-dd");
			expect(out).toHaveLength(8);
			for (const tick of out) {
				expect(tick.label).not.toMatch(/^\d{2}\/\d{4}$/);
			}
		});
	});

	describe("dateFormat full formatting with time", () => {
		it("formats full date-time with yyyy-mm-dd pattern", () => {
			expect(dateFormat(testDate, "yyyy-mm-dd")).toBe("2024-05-25 12:00");
		});

		it("formats full date-time with dd/mm/yyyy pattern", () => {
			expect(dateFormat(testDate, "dd/mm/yyyy")).toBe("25/05/2024 12:00");
		});

		it("formats full date-time with mm/dd/yyyy pattern", () => {
			expect(dateFormat(testDate, "mm/dd/yyyy")).toBe("05/25/2024 12:00");
		});
	});

	describe("dailyAxisFormat date only formatting", () => {
		it("formats date only with yyyy-mm-dd pattern", () => {
			expect(dailyAxisFormat(testDate, "yyyy-mm-dd")).toBe("2024-05-25");
		});

		it("formats date only with dd/mm/yyyy pattern", () => {
			expect(dailyAxisFormat(testDate, "dd/mm/yyyy")).toBe("25/05/2024");
		});

		it("formats date only with mm/dd/yyyy pattern", () => {
			expect(dailyAxisFormat(testDate, "mm/dd/yyyy")).toBe("05/25/2024");
		});
	});

	describe("resolveForkTickLabel day-change awareness (TV-style dedupe)", () => {
		const day1a = new Date("2026-09-16T10:00:00Z");
		const day1b = new Date("2026-09-16T14:00:00Z");
		const day2 = new Date("2026-09-17T09:00:00Z");

		it("first tick of a day shows the date", () => {
			const r = resolveForkTickLabel(day1a, "1h", 300, "yyyy-mm-dd", null);
			expect(r.label).toContain("16/09");
		});

		it("second tick the same day shows time only (no duplicate date)", () => {
			const first = resolveForkTickLabel(day1a, "1h", 300, "yyyy-mm-dd", null);
			const second = resolveForkTickLabel(day1b, "1h", 300, "yyyy-mm-dd", first.dayKey);
			expect(second.label).not.toContain("/");
			expect(second.label).toMatch(/\d{2}:\d{2}/);
		});

		it("day change shows the new date again", () => {
			const first = resolveForkTickLabel(day1a, "1h", 300, "yyyy-mm-dd", null);
			const next = resolveForkTickLabel(day2, "1h", 300, "yyyy-mm-dd", first.dayKey);
			expect(next.label).toContain("17/09");
		});

		it("daily frames keep the base label (no time downgrade)", () => {
			const first = resolveForkTickLabel(day1a, "1D", 100, "yyyy-mm-dd", null);
			const second = resolveForkTickLabel(day1b, "1D", 100, "yyyy-mm-dd", first.dayKey);
			expect(second.label).toContain("16/09");
		});
	});

	// UIUX-AB-06: nhãn giờ của crosshair hover phải theo `scales.timeFormat` như trục X.
	describe("resolveForkHoverLabel (crosshair hover honours the time format)", () => {
		const d = new Date("2024-05-25T05:00:00Z"); // 12:00 theo Asia/Ho_Chi_Minh

		it("intraday + 24h => HH:mm (không AM/PM)", () => {
			expect(resolveForkHoverLabel(d, "1h", "dd/mm/yyyy", "24h")).toBe("25/05/2024 12:00");
		});
		it("intraday + 12h => có AM/PM", () => {
			const label = resolveForkHoverLabel(d, "1h", "dd/mm/yyyy", "12h");
			expect(label).toContain("PM");
			expect(label).not.toBe(resolveForkHoverLabel(d, "1h", "dd/mm/yyyy", "24h"));
		});
		it("daily (D/W/M) => KHÔNG có giờ (không đổi so với trước)", () => {
			expect(resolveForkHoverLabel(d, "1D", "dd/mm/yyyy", "24h")).toBe("25/05/2024");
			expect(resolveForkHoverLabel(d, "1W", "dd/mm/yyyy", "12h")).toBe("25/05/2024");
			expect(resolveForkHoverLabel(d, "1M", "dd/mm/yyyy", "12h")).toBe("25/05/2024");
		});
	});
});
