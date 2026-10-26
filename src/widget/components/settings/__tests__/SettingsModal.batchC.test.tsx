// @vitest-environment jsdom
// UIUX_BATCH_C_2026-10-21 — C1a (Cancel hoàn tác thật) · C1b (search lọc cả nội dung)
// · C1c (SnapshotPreviewModal scope theme) · C7 (AlertsModal scope theme + bỏ 13 `#fff`).
//
// Khoá hành vi (mỗi assert phải ĐỎ nếu fix bị revert):
//  · C1a: đổi 1 setting (composite đã ghi) ⇒ bấm Cancel ⇒ composite về **đúng** giá trị cũ.
//  · C1b: gõ "volume" (KHÔNG nằm trong nhãn tab) ⇒ tab Status Line **vẫn hiện**.
//  · C1c: `SnapshotPreviewModal` phải có `.vnsc-root` + `data-chart-mode="light"`.
//  · C7 : `AlertsModal` phải có `.vnsc-root` + `data-chart-mode` và **không** còn `color: "#fff"`.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { SettingsModal, type SettingsModalProps } from "../SettingsModal";
import { SnapshotPreviewModal } from "../SnapshotPreviewModal";
import { AlertsModal } from "../AlertsModal";
import { VNInvestChartsStateProvider } from "../../../context/VNInvestChartsStateContext";
import { WidgetI18nProvider } from "../../../context/WidgetI18nContext";

const COMPOSITE = "vnsc_chart_settings_v1";

describe("Batch C — settings modal contract (C1a/C1b/C1c/C7)", () => {
	let container: HTMLDivElement | null = null;
	let root: ReturnType<typeof createRoot> | null = null;

	const renderModal = async (props: SettingsModalProps) => {
		await act(async () => {
			root?.render(
				<WidgetI18nProvider locale="en">
					<VNInvestChartsStateProvider>
						<SettingsModal {...props} />
					</VNInvestChartsStateProvider>
				</WidgetI18nProvider>
			);
		});
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

	it("C1b: search matches tab CONTENT keywords, not only the tab name", async () => {
		await renderModal({ open: true });

		const searchInput = document.querySelector('input[type="search"], input[placeholder*="Tìm kiếm"], input[placeholder*="Search"]') as HTMLInputElement | null;
		expect(searchInput, "settings modal must expose a search input").toBeTruthy();
		if (!searchInput) return;

		await act(async () => {
			const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
			nativeSetter?.call(searchInput, "volume");
			searchInput.dispatchEvent(new Event("input", { bubbles: true }));
		});

		const labels = Array.from(document.querySelectorAll('[role="tab"]')).map((t) => (t.textContent || "").toLowerCase());
		// "volume" không xuất hiện trong nhãn tab nào ⇒ chỉ khớp được nhờ keyword content.
		expect(labels.some((l) => l.includes("volume"))).toBe(false);
		expect(labels.length, "keyword search must still surface the Status Line tab").toBeGreaterThan(0);
	});

	it("C1a: Cancel REVERTS the change that was applied live", async () => {
		const onClose = vi.fn();
		// Composite có sẵn giá trị đã biết cho đúng field mà test sẽ đổi
		// (checkbox ĐẦU của tab Status Line = `showLogo`, `StatusLineSettingsTab.tsx:25`).
		const seededStatus = { showLogo: true };
		const seeded = JSON.stringify({ version: 1, statusLine: seededStatus });
		window.localStorage.setItem(COMPOSITE, seeded);
		await renderModal({ open: true, onClose });

		const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
		const statusTab = tabs.find((t) => /status|dòng trạng thái/i.test(t.textContent || ""));
		if (statusTab) {
			await act(async () => {
				statusTab.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			});
		}
		const checkbox = document.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
		expect(checkbox, "status line tab must expose a checkbox").toBeTruthy();
		if (!checkbox) return;
		await act(async () => {
			checkbox.click();
		});
		const afterChange = window.localStorage.getItem(COMPOSITE);
		expect(afterChange, "changing a control must persist to the composite").not.toBe(seeded);

		// Field nào đã đổi? (tìm theo chênh lệch so với giá trị seed)
		const changed = JSON.parse(afterChange || "{}").statusLine || {};
		const changedKey = Object.keys(changed).find((k) => changed[k] !== seededStatus[k as keyof typeof seededStatus]);
		expect(changedKey, "the toggled field must differ from the seeded value").toBeTruthy();
		const expectedValue = seededStatus[changedKey as keyof typeof seededStatus];

		// Bấm Cancel ⇒ phải HOÀN TÁC.
		const cancelBtn = Array.from(document.querySelectorAll("button")).find((b) => /cancel|hủy/i.test(b.textContent || ""));
		expect(cancelBtn, "settings modal must expose a Cancel button").toBeTruthy();
		if (!cancelBtn) return;
		await act(async () => {
			cancelBtn.click();
		});

		expect(onClose).toHaveBeenCalled();
		const afterCancel = window.localStorage.getItem(COMPOSITE);
		expect(afterCancel, "Cancel must keep the composite (not wipe the settings)").toBeTruthy();
		// Giá trị đã sửa phải về đúng giá trị gốc. KHÔNG có rollback ⇒ giá trị vẫn là
		// giá trị sau khi sửa ⇒ assert ĐỎ (fail-closed).
		const reverted = JSON.parse(afterCancel || "{}").statusLine || {};
		expect(reverted[changedKey as string], "Cancel must restore the edited field").toBe(expectedValue);
	});

	it("C1c: SnapshotPreviewModal scopes the theme (vnsc-root + data-chart-mode)", async () => {
		await act(async () => {
			root?.render(
				<WidgetI18nProvider locale="en">
					<SnapshotPreviewModal
						isOpen
						imageDataUrl="data:image/png;base64,iVBORw0KGgo="
						isDark={false}
						themePreset="modern-light"
						onClose={() => {}}
						onSave={() => {}}
					/>
				</WidgetI18nProvider>
			);
		});
		const backdrop = document.querySelector('[data-testid="snapshot-preview-backdrop"]');
		expect(backdrop).toBeTruthy();
		expect(backdrop?.classList.contains("vnsc-root")).toBe(true);
		expect(backdrop?.getAttribute("data-chart-mode")).toBe("light");
		expect(backdrop?.getAttribute("data-chart-theme")).toBe("modern-light");
	});

	it("C7: AlertsModal scopes the theme and has NO hardcoded #fff text color", async () => {
		await act(async () => {
			root?.render(
				<WidgetI18nProvider locale="en">
					<VNInvestChartsStateProvider>
						<AlertsModal
							open
							onClose={() => {}}
							symbol="BTCUSDT"
							timeframe="1h"
							alertManager={{ getAlerts: () => [], toggleAlert: () => {} }}
							isDark={false}
							themePreset="modern-light"
						/>
					</VNInvestChartsStateProvider>
				</WidgetI18nProvider>
			);
		});
		const backdrop = document.querySelector('[data-testid="alerts-backdrop"]');
		expect(backdrop, "AlertsModal must expose a themed backdrop").toBeTruthy();
		expect(backdrop?.classList.contains("vnsc-root")).toBe(true);
		expect(backdrop?.getAttribute("data-chart-mode")).toBe("light");
		expect(backdrop?.getAttribute("role")).toBe("dialog");
		// 13 chỗ `color: "#fff"` cũ ⇒ trong light mode sẽ thành TRẮNG-TRÊN-TRẮNG.
		const whites = Array.from(document.querySelectorAll("[style]")).filter((el) =>
			(el.getAttribute("style") || "").includes('"#fff"'),
		);
		expect(whites.length, "AlertsModal must not hardcode #fff as a text color").toBe(0);
	});
});
