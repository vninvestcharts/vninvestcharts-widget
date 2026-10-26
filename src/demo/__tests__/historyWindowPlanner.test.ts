import { describe, it, expect } from "vitest";
import {
	computeTargetWindow,
	computeLoadedWindow,
	computeMissingSegments,
	shouldScheduleFetch,
} from "../historyWindowPlanner";

describe("historyWindowPlanner", () => {
	it("computeTargetWindow áp dụng đúng ratio 2.0 / 0.5", () => {
		const viewport = { startMs: 1000, endMs: 2000 };
		const target = computeTargetWindow(viewport, { leftPrefetchRatio: 2.0, rightPrefetchRatio: 0.5 });
		// span = 1000
		expect(target.startMs).toBe(1000 - 2000); // -1000
		expect(target.endMs).toBe(2000 + 500); // 2500
	});

	it("computeLoadedWindow trả null cho data rỗng", () => {
		expect(computeLoadedWindow([])).toBeNull();
	});

	it("computeLoadedWindow trả đúng min/max", () => {
		const data = [
			{ date: new Date(1000) },
			{ date: new Date(3000) },
			{ date: new Date(2000) },
		];
		const window = computeLoadedWindow(data)!;
		expect(window.startMs).toBe(1000);
		expect(window.endMs).toBe(3000);
	});

	it("computeMissingSegments: left missing khi loaded.start > target.start", () => {
		const target = { startMs: 500, endMs: 5000 };
		const loaded = { startMs: 1000, endMs: 4000 };
		const result = computeMissingSegments(target, loaded);
		expect(result.leftMissing).toBe(true);
		expect(result.rightMissing).toBe(true);
		expect(result.leftTargetMs).toBe(500);
		expect(result.rightTargetMs).toBe(5000);
	});

	it("computeMissingSegments: không có missing khi loaded bao phủ toàn target", () => {
		const target = { startMs: 1000, endMs: 3000 };
		const loaded = { startMs: 500, endMs: 4000 };
		const result = computeMissingSegments(target, loaded);
		expect(result.leftMissing).toBe(false);
		expect(result.rightMissing).toBe(false);
	});

	it("shouldScheduleFetch: false khi prev và next đều không missing", () => {
		const seg = { leftMissing: false, rightMissing: false, leftTargetMs: 0, rightTargetMs: 0 };
		expect(shouldScheduleFetch(seg, seg)).toBe(false);
	});

	it("shouldScheduleFetch: true khi prev null và next.leftMissing = true", () => {
		const next = { leftMissing: true, rightMissing: false, leftTargetMs: 0, rightTargetMs: 0 };
		expect(shouldScheduleFetch(null, next)).toBe(true);
	});

	it("shouldScheduleFetch: false khi cùng missing window lặp lại", () => {
		const previous = { leftMissing: true, rightMissing: false, leftTargetMs: 100, rightTargetMs: 200 };
		const next = { leftMissing: true, rightMissing: false, leftTargetMs: 100, rightTargetMs: 200 };
		expect(shouldScheduleFetch(previous, next)).toBe(false);
	});
});
