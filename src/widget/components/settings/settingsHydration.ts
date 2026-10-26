/**
 * Hydration readers cho 3 setting single-key (S-01/S-02/F-03 — PLAN_SETTINGS_FIX_2026-10-18).
 * Pure functions nhận `read` callback (call site chọn scoped-first qua readScopedSetting) để
 * unit-test trực tiếp không cần dựng hook. Tách khỏi `useWidgetSettings.ts` vì file
 * hook chỉ còn 1 dòng headroom tới budget 800 (L-P01: không bump config).
 */
import { WIDGET_TIMEZONES, type WidgetTimezone } from "../../../lib/utils/timezoneFormatter";

export type SettingsKeyReader = (base: string) => string | null;

export function hydrateCvdMode(read: SettingsKeyReader): "oscillator" | "histogram" {
	return (read("vnsc_settings_cvdMode") || read("vnsc_cvdMode")) === "histogram" ? "histogram" : "oscillator";
}

export function hydrateTimezone(read: SettingsKeyReader): WidgetTimezone {
	const val = read("vnsc_settings_timezone") || read("vnsc_timezone");
	return val && (WIDGET_TIMEZONES as readonly string[]).includes(val) ? (val as WidgetTimezone) : "Asia/Ho_Chi_Minh";
}

export function hydrateAlertAudioEnabled(read: SettingsKeyReader): boolean {
	return (read("vnsc_settings_alertAudioEnabled") || read("vnsc_alertAudioEnabled")) === "true";
}
