import type { WidgetMessages } from "./types";

/**
 * [M-4 · 2026-10-15] Namespace tách riêng vì `messages.en.ts` / `messages.vi.ts` đã ở
 * **ngưỡng đóng băng** của cổng `audit:fat-files`. Thêm key trực tiếp vào đó ⇒ vượt
 * ngưỡng; nâng ngưỡng thì đổi thước đo để qua cổng (L-P01, cấm).
 *
 * Đây đúng là cách repo đã tách `dock` / `trading` / `a11y` / `capability` trước đó
 * — xem `__tests__/dockMessages.test.ts` ("D0 split"). File này giữ nguyên quy ước.
 *
 * Nguồn: hai chuỗi tiếng Anh hardcode trong `PricePaneHeader.tsx` (đã sửa) và một
 * chuỗi thứ ba do test AC-9.3 phát hiện ra sau đó.
 */
export const pricePaneMessagesEn: WidgetMessages = {
	"pricePaneHeader.searchSymbol": "Click to search symbol",
	"pricePaneHeader.linkGroup": "Symbol link group {group}",
	"pricePaneHeader.chartSettings": "Chart settings",
};