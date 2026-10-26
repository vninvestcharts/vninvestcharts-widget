import { beforeEach, describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { useWidgetSettings } from "../useWidgetSettings";
import type { UseWidgetSettingsOptions } from "../useWidgetSettings";
import { VNInvestChartsStateProvider } from "../../context/VNInvestChartsContext";

/**
 * D1 — PLAN_SETTINGS_FIX_2026-10-18 (S-01 / S-02 persist / F-03).
 *
 * Writers scoped keys đã có đủ (`SettingsContext.tsx:301-302` cvdMode,
 * `:306-307` alertAudio, `:318-319` timezone) nhưng reader chưa: 3 initializer
 * `useWidgetSettings.ts:417/:420/:423` là literal ⇒ lựa chọn của user mất sau reload.
 * Test này khoá call site đọc scoped key — RED trước fix, GREEN sau.
 */

function renderSettings(options: Partial<UseWidgetSettingsOptions> = {}) {
	const wrapper = ({ children }: { children: ReactNode }) => (
		<VNInvestChartsStateProvider storageScopeId="hydration-test">{children}</VNInvestChartsStateProvider>
	);
	return renderHook(
		() =>
			useWidgetSettings({
				containerRef: { current: document.createElement("div") },
				size: { width: 900, height: 500 },
				plotData: [],
				tierRef: { current: undefined },
				...options,
			} as unknown as UseWidgetSettingsOptions),
		{ wrapper },
	);
}

describe("useWidgetSettings hydration — S-01 cvdMode", () => {
	beforeEach(() => {
		localStorage.clear();
	});

	it("key scoped/legacy 'histogram' thắng default 'oscillator'", () => {
		localStorage.setItem("vnsc_settings_cvdMode", "histogram");
		const { result, unmount } = renderSettings();
		expect(result.current.activeCvdMode).toBe("histogram");
		unmount();
	});

	it("không key → default 'oscillator'", () => {
		const { result, unmount } = renderSettings();
		expect(result.current.activeCvdMode).toBe("oscillator");
		unmount();
	});

	it("giá trị ngoài whitelist → default 'oscillator' (không crash, không nuốt rác)", () => {
		localStorage.setItem("vnsc_settings_cvdMode", "gorilla-mode");
		const { result, unmount } = renderSettings();
		expect(result.current.activeCvdMode).toBe("oscillator");
		unmount();
	});

	it("multi-chart (id) đọc key scoped '_<id>' TRƯỚC key legacy", () => {
		localStorage.setItem("vnsc_settings_cvdMode_chart-A", "histogram");
		localStorage.setItem("vnsc_settings_cvdMode", "oscillator");
		const { result, unmount } = renderSettings({ id: "chart-A" });
		expect(result.current.activeCvdMode).toBe("histogram");
		unmount();
	});
});

describe("useWidgetSettings hydration — S-02 timezone (union mở rộng 6)", () => {
	beforeEach(() => {
		localStorage.clear();
	});

	it("'Asia/Tokyo' (option UI ngoài union cũ) sống qua reload", () => {
		localStorage.setItem("vnsc_settings_timezone", "Asia/Tokyo");
		const { result, unmount } = renderSettings();
		expect(result.current.activeTimezone).toBe("Asia/Tokyo");
		unmount();
	});

	it("'Asia/Singapore' sống qua reload", () => {
		localStorage.setItem("vnsc_timezone", "Asia/Singapore");
		const { result, unmount } = renderSettings();
		expect(result.current.activeTimezone).toBe("Asia/Singapore");
		unmount();
	});

	it("không key → default 'Asia/Ho_Chi_Minh'", () => {
		const { result, unmount } = renderSettings();
		expect(result.current.activeTimezone).toBe("Asia/Ho_Chi_Minh");
		unmount();
	});

	it("giá trị rác → default (không nuốt, không crash)", () => {
		localStorage.setItem("vnsc_settings_timezone", "Mars/Olympus_Mons");
		const { result, unmount } = renderSettings();
		expect(result.current.activeTimezone).toBe("Asia/Ho_Chi_Minh");
		unmount();
	});
});

describe("useWidgetSettings hydration — F-03 alertAudioEnabled", () => {
	beforeEach(() => {
		localStorage.clear();
	});

	it("'true' → true", () => {
		localStorage.setItem("vnsc_settings_alertAudioEnabled", "true");
		const { result, unmount } = renderSettings();
		expect(result.current.activeAlertAudioEnabled).toBe(true);
		unmount();
	});

	it("'false' → false; không key → false", () => {
		localStorage.setItem("vnsc_settings_alertAudioEnabled", "false");
		const a = renderSettings();
		expect(a.result.current.activeAlertAudioEnabled).toBe(false);
		a.unmount();

		localStorage.removeItem("vnsc_settings_alertAudioEnabled");
		const b = renderSettings();
		expect(b.result.current.activeAlertAudioEnabled).toBe(false);
		b.unmount();
	});

	it("giá trị rác → false (chỉ 'true' mới bật)", () => {
		localStorage.setItem("vnsc_settings_alertAudioEnabled", "yes");
		const { result, unmount } = renderSettings();
		expect(result.current.activeAlertAudioEnabled).toBe(false);
		unmount();
	});
});
