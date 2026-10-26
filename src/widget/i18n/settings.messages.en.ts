import type { WidgetMessages } from "./types";

/**
 * Chuỗi Settings modal (S-06 — 3 tab settings: Appearance / Symbol / Panes).
 * Tách riêng namespace: `messages.en.ts` đã ở trần frozen budget (L-P01 —
 * không nâng ngưỡng để qua cổng); nhập qua spread ở tail catalog.
 */
export const settingsMessagesEn: WidgetMessages = {
	"settings.appearance.gradientTop": "Top color",
	"settings.appearance.gradientBottom": "Bottom color",
	"settings.appearance.gridStyle.solid": "Solid",
	"settings.appearance.gridStyle.dashed": "Dashed",
	"settings.appearance.gridStyle.dotted": "Dotted",
	"settings.appearance.crosshair.cross": "Cross (+)",
	"settings.appearance.crosshair.dot": "Dot (•)",
	"settings.appearance.crosshair.magnet": "Magnet (🧲)",
	"settings.appearance.fontSizeDefault": "11px (Default)",
	"settings.panes.pinned": "Pinned",
	"settings.symbol.title.upCandle": "Up Candle",
	"settings.symbol.title.downCandle": "Down Candle",
	"settings.symbol.title.upBorder": "Up Border",
	"settings.symbol.title.downBorder": "Down Border",
	"settings.symbol.title.upWick": "Up Wick",
	"settings.symbol.title.downWick": "Down Wick",
	"settings.symbol.timezone.hcm": "Ho Chi Minh (UTC+7)",
	"settings.symbol.timezone.utc": "UTC (+0)",
	"settings.symbol.timezone.newYork": "New York (EST/EDT)",
	"settings.symbol.timezone.london": "London (GMT/BST)",
	"settings.symbol.timezone.tokyo": "Tokyo (JST, UTC+9)",
	"settings.symbol.timezone.singapore": "Singapore (SGT, UTC+8)",
};
