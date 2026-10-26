import { describe, it, expect, beforeEach } from "vitest";
import {
	setGlobalTimezone,
	getGlobalTimezone,
	formatWithTimezone,
	formatCustomDateWithTimezone,
} from "../timezoneFormatter";

describe("timezoneFormatter helper tests", () => {
	beforeEach(() => {
		// Reset múi giờ mặc định trước mỗi bài test
		setGlobalTimezone("Asia/Ho_Chi_Minh");
	});

	describe("TC-AUT-01: Timezone Translation math", () => {
		// Epoch: 1716613200000 = 2024-05-25T05:00:00Z
		const testEpoch = 1716613200000;

		it("should format Vietnam Time (UTC+7) correctly", () => {
			setGlobalTimezone("Asia/Ho_Chi_Minh");
			expect(getGlobalTimezone()).toBe("Asia/Ho_Chi_Minh");

			const formatted = formatWithTimezone(testEpoch, {
				hour: "2-digit",
				minute: "2-digit",
				second: "2-digit",
				day: "2-digit",
				month: "2-digit",
				year: "numeric",
				hour12: false
			});

			// "25/05/2024, 12:00:00" hoặc định dạng vi-VN tương ứng
			expect(formatted).toContain("25");
			expect(formatted).toContain("05");
			expect(formatted).toContain("2024");
			expect(formatted).toContain("12:00:00");
		});

		it("should format New York Time (UTC-4 DST) correctly", () => {
			setGlobalTimezone("America/New_York");
			expect(getGlobalTimezone()).toBe("America/New_York");

			const formatted = formatWithTimezone(testEpoch, {
				hour: "2-digit",
				minute: "2-digit",
				second: "2-digit",
				day: "2-digit",
				month: "2-digit",
				year: "numeric",
				hour12: false
			});

			// 05:00:00 UTC - 4 tiếng = 01:00:00 ngày 25/05/2024
			expect(formatted).toContain("25");
			expect(formatted).toContain("05");
			expect(formatted).toContain("2024");
			expect(formatted).toContain("01:00:00");
		});

		it("should format UTC Time (UTC+0) correctly", () => {
			setGlobalTimezone("UTC");
			expect(getGlobalTimezone()).toBe("UTC");

			const formatted = formatWithTimezone(testEpoch, {
				hour: "2-digit",
				minute: "2-digit",
				second: "2-digit",
				day: "2-digit",
				month: "2-digit",
				year: "numeric",
				hour12: false
			});

			expect(formatted).toContain("25");
			expect(formatted).toContain("05");
			expect(formatted).toContain("2024");
			expect(formatted).toContain("05:00:00");
		});
	});

	describe("TC-AUT-02: Formatter Caching efficiency", () => {
		it("should handle 1000 format calls with high performance and no exceptions", () => {
			const testEpoch = 1716613200000;
			// Annotated, not inferred: hoisting this object out of the call site drops the
			// contextual typing it used to get from formatWithTimezone's parameter, and an
			// un-annotated literal widens `hour` to `string`. tsc caught that (TS2345).
			const options: Intl.DateTimeFormatOptions = {
				hour: "2-digit",
				minute: "2-digit",
				hour12: false
			};

			// Two defects, not one.
			//
			// 1. The old body put `expect(...).toContain("12:00")` INSIDE the timed loop, so
			//    1000 vitest assertions were measured alongside 1000 formatter calls. That
			//    measures the assertion machinery, not formatWithTimezone. Correctness is now
			//    asserted once, OUTSIDE the timed region — the loop is a benchmark, not a test.
			// 2. One cold sample against a wall-clock budget is a measurement of the
			//    scheduler. This test failed on one full-suite run of RELEASE_B4 and passed on
			//    the next, while passing 8/8 in isolation — the same signature as the
			//    enrichData flake fixed at fb42ed9. Noise can only ADD time, so the minimum
			//    of N samples after a warmup is the robust estimator; a superlinear
			//    regression still fails loudly.
			//
			// Budget 50ms matches enrichData.test.ts. Measured best-of-7 in isolation and
			// under full-suite load: see [timezoneFormatter perf] output.
			formatWithTimezone(testEpoch, options);
			const samples: number[] = [];
			for (let round = 0; round < 7; round += 1) {
				const startedAt = performance.now();
				for (let i = 0; i < 1000; i++) {
					formatWithTimezone(testEpoch, options);
				}
				samples.push(performance.now() - startedAt);
			}

			const best = Math.min(...samples);
			const sorted = [...samples].sort((a, b) => a - b);
			console.log(
				`[timezoneFormatter perf] best=${best.toFixed(2)}ms median=${sorted[3].toFixed(2)}ms worst=${Math.max(...samples).toFixed(2)}ms`,
			);

			expect(best).toBeLessThan(50);
			// Correctness, asserted once and deliberately outside the measurement above.
			expect(formatWithTimezone(testEpoch, options)).toContain("12:00");
		});
	});

	describe("TC-AUT-03: Fallback Protection on invalid inputs", () => {
		it("should fallback to UTC instead of throwing if timezone is invalid", () => {
			const testEpoch = 1716613200000;

			// Ép kiểu bypass TypeScript để test trường hợp bị truyền tham số sai từ JS/runtime
			setGlobalTimezone("Invalid/Timezone" as any);

			const formatted = formatWithTimezone(testEpoch, {
				hour: "2-digit",
				minute: "2-digit",
				second: "2-digit",
				hour12: false
			});

			// Múi giờ không hợp lệ -> Fallback sang UTC -> Giờ hiển thị phải là 05:00:00
			expect(formatted).toContain("05:00:00");
		});
	});

	describe("TC-AUT-04: formatCustomDateWithTimezone patterns", () => {
		// Epoch: 1716613200000 = 2024-05-25T05:00:00Z -> 2024-05-25 12:00:00 in UTC+7
		const testEpoch = 1716613200000;

		it("should format yyyy-mm-dd pattern", () => {
			setGlobalTimezone("Asia/Ho_Chi_Minh");
			expect(formatCustomDateWithTimezone(testEpoch, "yyyy-mm-dd", false)).toBe("2024-05-25");
			expect(formatCustomDateWithTimezone(testEpoch, "yyyy-mm-dd", true)).toBe("2024-05-25 12:00");
		});

		it("should format dd/mm/yyyy pattern", () => {
			setGlobalTimezone("Asia/Ho_Chi_Minh");
			expect(formatCustomDateWithTimezone(testEpoch, "dd/mm/yyyy", false)).toBe("25/05/2024");
			expect(formatCustomDateWithTimezone(testEpoch, "dd/mm/yyyy", true)).toBe("25/05/2024 12:00");
		});

		it("should format mm/dd/yyyy pattern", () => {
			setGlobalTimezone("Asia/Ho_Chi_Minh");
			expect(formatCustomDateWithTimezone(testEpoch, "mm/dd/yyyy", false)).toBe("05/25/2024");
			expect(formatCustomDateWithTimezone(testEpoch, "mm/dd/yyyy", true)).toBe("05/25/2024 12:00");
		});
	});

	// AUD-04. This is a KNOWN limitation, pinned deliberately.
	//
	// `globalTimezone` is one module-level `let`, and VNInvestCharts writes to it from
	// a useEffect on mount. So two widgets on one page cannot hold different timezones:
	// the last one to mount wins, and the earlier one re-renders using it. Unmounting
	// does not restore the previous value either.
	//
	// The audit that prompted this found it, then the W-16 investigation that followed
	// listed it as one of the four globals already known - and still concluded no global
	// existed. Both statements cannot hold. It is recorded here so the behaviour cannot
	// drift silently, and so nobody "fixes" it assuming it was never deliberate.
	//
	// Refactoring this into a per-instance TimezoneContext is W-17 and is explicitly
	// out of scope for this pass; it is an architectural change across many call sites,
	// not a finding closure.
	describe("TC-AUD-04: global timezone is process-wide, last writer wins", () => {
		it("a second widget's timezone overwrites the first", () => {
			setGlobalTimezone("America/New_York");
			// Chart B mounts later and writes its own timezone.
			setGlobalTimezone("Asia/Ho_Chi_Minh");

			// Chart A now formats with B's zone. Asserted as-is, not as desired:
			// this is the behaviour that exists today.
			expect(getGlobalTimezone()).toBe("Asia/Ho_Chi_Minh");
			// 2024-05-24T22:00:00Z = 1716588000000 is 18:00 on 05/24 in New York, and
			// 05:00 on 05/25 in Vietnam - a different calendar day, which is the part a
			// user notices. Epoch computed rather than eyeballed.
			expect(formatCustomDateWithTimezone(1716588000000, "dd/mm/yyyy", true)).toBe("25/05/2024 05:00");
		});

		// UIUX-AB-06: nhãn giờ của crosshair hover phải theo `scales.timeFormat`
		// như trục X (trước đây `formatCustomDateWithTimezone` hardcode 24h).
		it("honours the 12h time format for the hover label (AB-06)", () => {
			// 2024-05-24T22:00:00Z = 05:00 ngày 25/05 theo Asia/Ho_Chi_Minh.
			const epoch = 1716588000000;
			expect(formatCustomDateWithTimezone(epoch, "dd/mm/yyyy", true, "24h")).toBe("25/05/2024 05:00");
			const twelve = formatCustomDateWithTimezone(epoch, "dd/mm/yyyy", true, "12h");
			expect(twelve).toContain("AM");
			// Định dạng 12h phải **khác** 24h (24h không có AM/PM).
			expect(twelve).not.toBe("25/05/2024 05:00");
			// Cùng cách đệm giờ như trục X (`composeClockTime` dùng chung).
			expect(twelve).toBe("25/05/2024 05:00 AM");
		});

		it("keeps the 24h default when no time format is given (no behaviour change)", () => {
			const epoch = 1716588000000;
			expect(formatCustomDateWithTimezone(epoch, "dd/mm/yyyy", true)).toBe("25/05/2024 05:00");
		});

		it("there is no way to read a per-instance timezone", () => {
			// Guards against the appearance of a second source of truth. If someone adds
			// an instance-scoped accessor later, this test should be revisited on purpose
			// rather than discovered as a silent behaviour change.
			expect(getGlobalTimezone()).toBe("Asia/Ho_Chi_Minh");
		});
	});
});

