import { describe, expect, it } from "vitest";
import { parseColor, toHexInputValue, withPreservedAlpha } from "../colorAlpha";

/**
 * UIUX-AB-03 — màu lưới mặc định là `rgba(255, 255, 255, 0.06)`
 * (`defaultSettings.ts:13` `gridColor`, gán tại `:61`) nhưng `<input type="color">` chỉ nhận hex
 * ⇒ trước fix: mỗi lần chỉnh sửa làm **mất alpha** và UI hiển thị sai màu hiện tại.
 */
describe("colorAlpha", () => {
	describe("parseColor", () => {
		it("parse hex 6 ký tự ⇒ alpha 1", () => {
			expect(parseColor("#334155")).toEqual({ hex: "#334155", alpha: 1 });
		});
		it("parse hex 3 ký tự ⇒ mở rộng + alpha 1", () => {
			expect(parseColor("#abc")).toEqual({ hex: "#aabbcc", alpha: 1 });
		});
		it("parse hex 8 ký tự ⇒ lấy alpha", () => {
			expect(parseColor("#33415580")).toEqual({ hex: "#334155", alpha: 128 / 255 });
		});
		it("parse rgb() ⇒ alpha 1", () => {
			expect(parseColor("rgb(51, 65, 85)")).toEqual({ hex: "#334155", alpha: 1 });
		});
		it("parse rgba() ⇒ lấy alpha", () => {
			expect(parseColor("rgba(255, 255, 255, 0.06)")).toEqual({ hex: "#ffffff", alpha: 0.06 });
		});
		it("trả null khi không parse được", () => {
			expect(parseColor("var(--vnsc-color-grid)")).toBeNull();
			expect(parseColor("")).toBeNull();
			expect(parseColor(undefined)).toBeNull();
		});
		it("từ chối hex không hợp lệ và phần trăm (CSS Color 4)", () => {
			expect(parseColor("#zzzzzz")).toBeNull();
			expect(parseColor("rgb(50% 50% 50%)")).toBeNull();
		});
	});

	describe("toHexInputValue", () => {
		it("hiện màu THẬT hiện tại (không phải giá trị thay thế)", () => {
			// Trước fix: tab hiện "#334155" cho mọi giá trị rgba ⇒ UI nói dối.
			expect(toHexInputValue("rgba(255, 255, 255, 0.06)")).toBe("#ffffff");
			expect(toHexInputValue("#ff00ff")).toBe("#ff00ff");
		});
		it("fallback khi không parse được", () => {
			expect(toHexInputValue("nonsense")).toBe("#334155");
			expect(toHexInputValue(null, "#123456")).toBe("#123456");
		});
	});

	describe("withPreservedAlpha", () => {
		it("GIỮ alpha gốc khi đổi RGB (case lỗi AB-03)", () => {
			expect(withPreservedAlpha("rgba(255, 255, 255, 0.06)", "#ff00ff")).toBe("rgba(255, 0, 255, 0.06)");
		});
		it("alpha = 1 ⇒ trả hex thuần", () => {
			expect(withPreservedAlpha("#334155", "#ff00ff")).toBe("#ff00ff");
		});
		it("giá trị hiện tại không parse được ⇒ coi như alpha 1", () => {
			expect(withPreservedAlpha("var(--x)", "#ff00ff")).toBe("#ff00ff");
		});
		it("màu chọn không hợp lệ ⇒ KHÔNG ghi chuỗi bất kỳ vào settings", () => {
			expect(withPreservedAlpha("rgba(0, 0, 0, 0.5)", "not-a-color")).toBe("#334155");
		});
	});
});
