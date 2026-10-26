import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pricePaneMessagesEn } from "../../../i18n/pricePane.messages.en";
import { pricePaneMessagesVi } from "../../../i18n/pricePane.messages.vi";

/**
 * [M-4 · 2026-10-15] Khoá hai chuỗi UI tiếng Anh đã sửa trong `PricePaneHeader`.
 *
 * ## Vì sao có test này
 *
 * Cổng `audit:hardcoded-text` chỉ phát hiện **tiếng Việt** (`VI_REGEX`), nên hai
 * `title="..."` tiếng Anh ở `PricePaneHeader.tsx` đã tồn tại mà cổng im lặng.
 * Đo được (probe `scripts/__probe-en-measure.cjs`, đã xoá sau khi đo):
 * **695** chuỗi tiếng Anh ứng viên trên 654 file, trong đó phần lớn là
 * `console.error`/log nội bộ — **không** phải UI. Vì vậy M-4 **không** được đóng
 * bằng một trục "tiếng Anh" tự động (sẽ ra hàng trăm false positive và dạy đội
 * bỏ qua cổng). Xem `docs/PLAN_PM_2026-10-15.md` §3.
 *
 * Thay vào đó: sửa **hai vi phạm thật** đã tìm ra, và khoá chúng ở đây.
 *
 * ## Không vacuous (L-E01)
 *
 * Trước khi sửa, `PricePaneHeader.tsx` **không hề** import `useWidgetI18n` và
 * không có key nào ⇒ cả hai assertion dưới đều đỏ trên bản cũ, không phải trên
 * trạng thái mặc định.
 */
describe("PricePaneHeader: chuỗi UI đã đi qua i18n", () => {
	it("AC-9.1: ba key tồn tại ở CẢ en và vi", () => {
		for (const key of [
			"pricePaneHeader.searchSymbol",
			"pricePaneHeader.linkGroup",
			"pricePaneHeader.chartSettings",
		]) {
			expect(pricePaneMessagesEn[key], `thiếu key EN: ${key}`).toBeTruthy();
			expect(pricePaneMessagesVi[key], `thiếu key VI: ${key}`).toBeTruthy();
		}
	});

	it("AC-9.2: bản dịch VI KHÁC bản EN (không phải copy-paste chưa dịch)", () => {
		for (const key of [
			"pricePaneHeader.searchSymbol",
			"pricePaneHeader.linkGroup",
			"pricePaneHeader.chartSettings",
		]) {
			expect(pricePaneMessagesVi[key], `chưa dịch: ${key}`).not.toBe(pricePaneMessagesEn[key]);
		}
	});

	it("AC-9.3: chỉ còn `title=\"...\"` là TÊN THƯƠNG HIỆU (chống tái phát)", () => {
		const src = readFileSync(resolve(__dirname, "..", "PricePaneHeader.tsx"), "utf8");
		// Chỉ `title` viết thẳng mới là vi phạm. `aria-label`/`data-*` không tính.
		// Danh sách cho phép là TÊN THƯƠNG HIỆU — không dịch, không đi qua i18n.
		const BRAND_ALLOWED = new Set(['title="VNInvest"']);
		const found = (src.match(/title="[^"]*"/g) ?? []).filter((t) => !BRAND_ALLOWED.has(t));
		expect(found).toEqual([]);
	});
});