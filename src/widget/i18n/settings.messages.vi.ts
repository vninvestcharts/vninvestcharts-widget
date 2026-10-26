import type { WidgetMessages } from "./types";

/**
 * Chuỗi Settings modal (S-06 — 3 tab settings: Appearance / Symbol / Panes).
 * Tách riêng namespace: `messages.vi.ts` đã ở trần frozen budget (L-P01 —
 * không nâng ngưỡng để qua cổng); nhập qua spread ở tail catalog.
 */
export const settingsMessagesVi: WidgetMessages = {
	"settings.appearance.gradientTop": "Màu trên",
	"settings.appearance.gradientBottom": "Màu dưới",
	"settings.appearance.gridStyle.solid": "Liền",
	"settings.appearance.gridStyle.dashed": "Nét đứt",
	"settings.appearance.gridStyle.dotted": "Chấm",
	"settings.appearance.crosshair.cross": "Chữ thập (+)",
	"settings.appearance.crosshair.dot": "Điểm (•)",
	"settings.appearance.crosshair.magnet": "Nam châm (🧲)",
	"settings.appearance.fontSizeDefault": "11px (Mặc định)",
	"settings.panes.pinned": "Ghim",
	"settings.symbol.title.upCandle": "Nến tăng",
	"settings.symbol.title.downCandle": "Nến giảm",
	"settings.symbol.title.upBorder": "Viền nến tăng",
	"settings.symbol.title.downBorder": "Viền nến giảm",
	"settings.symbol.title.upWick": "Bấc nến tăng",
	"settings.symbol.title.downWick": "Bấc nến giảm",
	"settings.symbol.timezone.hcm": "Hồ Chí Minh (UTC+7)",
	"settings.symbol.timezone.utc": "UTC (+0)",
	"settings.symbol.timezone.newYork": "New York (EST/EDT)",
	"settings.symbol.timezone.london": "Luân Đôn (GMT/BST)",
	"settings.symbol.timezone.tokyo": "Tokyo (JST, UTC+9)",
	"settings.symbol.timezone.singapore": "Singapore (SGT, UTC+8)",
};
