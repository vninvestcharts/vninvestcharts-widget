import { describe, it, expect } from "vitest";
import { resolvePaperEnabled } from "../paperVisibility";

// Task M4: khóa resolution matrix hiển thị paper trading.

describe("resolvePaperEnabled", () => {
	it("mặc định bật khi không có gì", () => {
		expect(resolvePaperEnabled({})).toBe(true);
	});
	it("prop tường minh thắng store + legacy (khi chưa toggle)", () => {
		expect(resolvePaperEnabled({ defaultEnabled: false, chartId: "a", perChart: { a: true }, master: true, legacyEnabled: true })).toBe(false);
		expect(resolvePaperEnabled({ defaultEnabled: true, master: false })).toBe(true);
	});
	it("toggle runtime (mắt/CTA) thắng cả prop — hợp đồng TVP-A0", () => {
		expect(resolvePaperEnabled({ localOverride: true, defaultEnabled: false })).toBe(true);
		expect(resolvePaperEnabled({ localOverride: false, defaultEnabled: true, master: true })).toBe(false);
	});
	it("override riêng chart thắng master + legacy", () => {
		expect(resolvePaperEnabled({ chartId: "a", perChart: { a: false }, master: true, legacyEnabled: true })).toBe(false);
		expect(resolvePaperEnabled({ chartId: "b", perChart: { a: false }, master: false })).toBe(false);
	});
	it("chart khác không bị lây override", () => {
		expect(resolvePaperEnabled({ chartId: "b", perChart: { a: false }, master: true })).toBe(true);
	});
	it("không chartId -> bỏ qua tầng perChart", () => {
		expect(resolvePaperEnabled({ perChart: { a: false }, master: false })).toBe(false);
	});
	it("master thắng legacy", () => {
		expect(resolvePaperEnabled({ master: false, legacyEnabled: true })).toBe(false);
		expect(resolvePaperEnabled({ master: true, legacyEnabled: false })).toBe(true);
	});
	it("legacy giữ hành vi cũ khi không có store mới", () => {
		expect(resolvePaperEnabled({ legacyEnabled: false })).toBe(false);
		expect(resolvePaperEnabled({ legacyEnabled: true })).toBe(true);
	});
});
