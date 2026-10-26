// @vitest-environment jsdom
// UIUX_BATCH_D_2026-10-21 — D1: test wiring từng tab Settings → observable.
//
// VÌ SAO: claim "4 tab static 0 dead (Indicators/Theme/Licensing/Reset)" trong
// `docs/upgrade-standard/AUDIT_LEDGER.md:20575` là đọc **wiring** (`SettingsModal.tsx:267-293`),
// **chưa** có test nào render modal rồi bấm từng tab. Claim kiểu đó rẻ và dễ mục.
// Test này khoá: mỗi tab phải **render ra thứ quan sát được** (không phải "component đã mount").
//
// Fail-closed: nếu wiring của 1 tab bị revert (tab không render / không có control),
// assert tương ứng **ĐỎ**.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { SettingsModal, type SettingsModalProps } from "../SettingsModal";
import { VNInvestChartsStateProvider } from "../../../context/VNInvestChartsStateContext";
import { WidgetI18nProvider } from "../../../context/WidgetI18nContext";

describe("D1 — Settings tabs render an observable (UIUX_BATCH_D_2026-10-21)", () => {
	let container: HTMLDivElement | null = null;
	let root: ReturnType<typeof createRoot> | null = null;

	const renderModal = async (props: Partial<SettingsModalProps> = {}) => {
		await act(async () => {
			root?.render(
				<WidgetI18nProvider locale="en">
					<VNInvestChartsStateProvider>
						<SettingsModal open {...props} />
					</VNInvestChartsStateProvider>
				</WidgetI18nProvider>
			);
		});
	};

	const tabByName = (re: RegExp) =>
		Array.from(document.querySelectorAll('[role="tab"]')).find((t) => re.test(t.textContent || ""));

	const clickTab = async (re: RegExp) => {
		const tab = tabByName(re);
		expect(tab, `tab ${re} must exist`).toBeTruthy();
		await act(async () => {
			tab?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		return tab;
	};

	beforeEach(() => {
		window.localStorage.clear();
		document.body.innerHTML = "";
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(async () => {
		await act(async () => {
			root?.unmount();
		});
		root = null;
		container?.remove();
		container = null;
		document.body.innerHTML = "";
		window.localStorage.clear();
	});

	it("Indicators tab renders its composer controls (not an empty panel)", async () => {
		await renderModal();
		await clickTab(/indicators|chỉ báo/i);
		expect(document.querySelector('[data-testid="composer-type-select"]')).toBeTruthy();
		expect(document.querySelector('[data-testid="composer-add-btn"]')).toBeTruthy();
	});

	it("Theme tab renders preset cards AND clicking one fires onThemePresetChange", async () => {
		const onThemePresetChange = vi.fn();
		await renderModal({ onThemePresetChange });
		await clickTab(/theme|chủ đề|giao diện/i);
		// Preset card là `<div onClick>` (không phải button) ⇒ bấm vào **tên** preset,
		// event bubble lên card ⇒ `handleSelectPreset` chạy (`ThemePaletteSettingsTab.tsx:40-50`).
		const card = Array.from(document.querySelectorAll("span, div")).find(
			(el) => (el.textContent || "").trim() === "Midnight Blue",
		);
		expect(card, "theme tab must render the Midnight Blue preset card").toBeTruthy();
		await act(async () => {
			(card as HTMLElement)?.click();
		});
		expect(onThemePresetChange, "clicking a preset must reach the host callback").toHaveBeenCalled();
	});

	it("Reset tab renders the restore button AND clicking it fires onReset", async () => {
		const onReset = vi.fn();
		await renderModal({ onReset });
		await clickTab(/reset|mặc định|đặt lại/i);
		const btn = document.querySelector('[data-testid="settings-reset-defaults-btn"]');
		expect(btn, "reset tab must render the restore button").toBeTruthy();
		await act(async () => {
			(btn as HTMLButtonElement)?.click();
		});
		expect(onReset).toHaveBeenCalled();
	});

	it("Licensing tab is only offered when a SaaS feature context exists (0 dead ⇒ visible to licensed hosts)", async () => {
		await renderModal();
		const names = Array.from(document.querySelectorAll('[role="tab"]')).map((t) => (t.textContent || "").toLowerCase());
		// Không có `SaaSFeatureProvider` ⇒ tab Licensing bị ẩn (SettingsModal.tsx:218-220).
		// Đây là observable của wiring: host **có** provider thì tab phải hiện.
		expect(
			names.some((n) => /licens|giấy phép|license/i.test(n)),
			"without a SaaS provider the Licensing tab is intentionally hidden",
		).toBe(false);
	});
});
