import { describe, expect, it } from "vitest";
import { widgetMessagesVi } from "../messages.vi";
import { widgetMessagesEn } from "../messages.en";

/**
 * S3 regression lock — bề mặt tiếng Việt không được để nguyên tiếng Anh.
 *
 * Gap gốc trích 1 chuỗi (`ui.bottomTab.paperTrade`), nhưng grep cho thấy **11 chuỗi**
 * trong `messages.vi.ts` chứa "Paper Trading"/"paper trading". Sửa 1 dòng sẽ để lại 10
 * lỗi cùng loại — và lần sau lại có gap. Nên khoá theo **cụm thuật ngữ**, không theo
 * từng dòng.
 *
 * Cố tình KHÔNG kiểm "không có chữ cái Latin nào": file vi hợp lệ chứa rất nhiều thuật
 * ngữ chuyên ngữ giữ nguyên tiếng Anh (`Pine`, `CVD`, `Theme`, `Workspace`, tên cổ phiếu,
 * `ticks`). Một phép kiểm tra như vậy sẽ đỏ vì lý do sai rồi dạy cả team bỏ gate.
 */

/** Các cụm tiếng Anh bị bỏ sót trong câu tiếng Việt — mỗi cụm là một lớp lỗi riêng. */
const UNTRANSLATED_TERMS = [
	"Paper Trading",
	"paper trading",
	// Thêm ở đây khi gặp lần lặp tiếp theo — mỗi mục phải kèm ví dụ chuỗi vi cụ thể.
];

/** Key chứa toàn bộ hoặc một phần chuỗi cần kiểm (danh sách đóng có chủ đích). */
const PAPER_KEYS = [
	"ui.bottomTab.paperTrade",
	"ui.bottomTab.paperTrading",
	"widget.trading.paperTrading",
	"widget.trading.paperVisibility",
	"widget.trading.paperVisibilityActive",
	"widget.trading.enablePaperTrading",
	"widget.trading.paperTradingOff",
	"widget.trading.hidePaperTrading",
	"widget.trading.showPaperTrading",
	"settings.trading.showPaperOrders",
	"settings.trading.paperMarkers",
] as const;

describe("S3: paper trading phai duoc dich o be mat tieng Viet", () => {
	it("khong con chuoi nao bo 'Paper Trading' nguyen van", () => {
		for (const key of PAPER_KEYS) {
			const value = widgetMessagesVi[key];
			expect(typeof value, `thiếu key ${key}`).toBe("string");
			for (const term of UNTRANSLATED_TERMS) {
				expect(value.includes(term), `${key} còn chứa "${term}": ${value}`).toBe(false);
			}
		}
	});

	it("dung thuat ngu da ton tai trong file (khong tu dich moi)", () => {
		// File đã có "Giao dịch mô phỏng" (settings.trading.alertsAndPaper). Khoá luôn
		// để lần sửa sau không đổi sang thuật ngữ khác và làm lệch khỏi phần còn lại.
		for (const key of PAPER_KEYS) {
			expect(widgetMessagesVi[key], key).toContain("mô phỏng");
		}
	});

	it("en giu nguyen chuoi Anh (khong dich nguoc)", () => {
		// en là bản gốc: "Paper Trading" ở đây là ĐÚNG. Test này chống việc "sửa nhầm
		// sang cả file en" — một cách sửa i18n rất hay xảy ra.
		expect(widgetMessagesEn["ui.bottomTab.paperTrading"]).toBe("Paper Trading");
		expect(widgetMessagesEn["widget.trading.enablePaperTrading"]).toMatch(/^Enable /);
	});

	it("vi/en giu nguyen key set (khong phai doi khoa khi them)", () => {
		expect(Object.keys(widgetMessagesVi).sort()).toEqual(Object.keys(widgetMessagesEn).sort());
	});
});