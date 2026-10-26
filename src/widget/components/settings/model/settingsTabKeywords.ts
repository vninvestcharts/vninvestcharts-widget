/**
 * P1-5b (C1b): từ khoá nội dung cho ô tìm kiếm trong Settings modal.
 *
 * VÌ SAO: `SettingsModal.tsx:223-226` chỉ lọc theo **nhãn tab** (`labelKey` / `id` /
 * `defaultLabel`) ⇒ người dùng gõ "volume" / "crosshair" / "watermark" (từ khoá thật
 * của phần cài đặt) thì **không** ra tab nào ⇒ tưởng chức năng không tồn tại.
 *
 * Bản đồ nằm ở file RIÊNG (thay vì nhồi vào `SettingsModal.tsx` — file fat 504/520)
 * và là **thuần dữ liệu** ⇒ không thêm UI text mới (Rule 1) và không cần i18n key.
 */
export const SETTINGS_TAB_KEYWORDS: Readonly<Record<string, readonly string[]>> = {
	symbol: ["candle", "wick", "border", "precision", "ohlc", "hollow", "heikin"],
	statusLine: ["volume", "ohlc", "bar change", "ticker", "logo", "status line"],
	scales: ["axis", "invert", "countdown", "time format", "scrollbar", "scale"],
	appearance: ["crosshair", "grid", "watermark", "background", "color", "appearance"],
	panes: ["layout", "pane", "split", "max visible"],
	indicators: ["indicator", "rsi", "macd", "lock", "share"],
	trading: ["paper", "trading", "events", "whale", "cvd", "alert", "corporate"],
	theme: ["theme", "preset", "dark", "light", "color", "palette"],
	licensing: ["license", "plan", "tier", "seat", "key"],
	reset: ["reset", "restore", "default"],
};

/** Từ khoá nội dung của 1 tab (rỗng nếu tab không khai). */
export function settingsTabKeywords(tabId: string): readonly string[] {
	return SETTINGS_TAB_KEYWORDS[tabId] ?? [];
}
