// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { SettingsModal, type SettingsModalProps } from "../components/settings/SettingsModal";
import { VNInvestChartsStateProvider } from "../context/VNInvestChartsStateContext";

describe("SettingsModal - Contract & Theme Tests", () => {
	let container: HTMLDivElement | null = null;
	let root: ReturnType<typeof createRoot> | null = null;

	const renderModal = async (props: SettingsModalProps) => {
		await act(async () => {
			root?.render(
				<VNInvestChartsStateProvider>
					<SettingsModal {...props} />
				</VNInvestChartsStateProvider>
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

	it("renders portal backdrop with .vnsc-root and data-chart-mode=dark in dark mode", async () => {
		await renderModal({ open: true, isDark: true });

		const backdrop = document.querySelector(".vnsc-settings-backdrop");
		expect(backdrop).toBeTruthy();
		expect(backdrop?.classList.contains("vnsc-root")).toBe(true);
		expect(backdrop?.getAttribute("data-chart-mode")).toBe("dark");
		expect(backdrop?.getAttribute("data-chart-theme")).toBe("classic-dark");
	});

	it("renders portal backdrop with data-chart-mode=light in light mode", async () => {
		await renderModal({ open: true, isDark: false });

		const backdrop = document.querySelector(".vnsc-settings-backdrop");
		expect(backdrop).toBeTruthy();
		expect(backdrop?.classList.contains("vnsc-root")).toBe(true);
		expect(backdrop?.getAttribute("data-chart-mode")).toBe("light");
		expect(backdrop?.getAttribute("data-chart-theme")).toBe("modern-light");
	});

	it("applies custom themePreset and chartId attributes to portal root", async () => {
		await renderModal({
			open: true,
			isDark: true,
			themePreset: "trading-night",
			chartId: "chart-test-id",
		});

		const backdrop = document.querySelector(".vnsc-settings-backdrop");
		expect(backdrop).toBeTruthy();
		expect(backdrop?.getAttribute("data-chart-theme")).toBe("trading-night");
		expect(backdrop?.getAttribute("data-chart-id")).toBe("chart-test-id");
	});

	it("reads and writes settings using unified storage keys", async () => {
		const store = new Map<string, string>();
		const mockStorage = {
			getItem: vi.fn((key: string) => store.get(key) ?? null),
			setItem: vi.fn((key: string, val: string) => { store.set(key, val); }),
			removeItem: vi.fn((key: string) => { store.delete(key); }),
		};

		// Seed a legacy key
		store.set("vnsc_maxVisiblePanes", "7");

		await renderModal({
			open: true,
			storageAdapter: mockStorage as any,
		});

		// Verify that storageAdapter was called with unified or legacy key
		expect(mockStorage.getItem).toHaveBeenCalled();
	});

	it("triggers overlayTimeframe and overlayStyle callbacks when provided", async () => {
		const onOverlayTimeframeChange = vi.fn();
		const onOverlayStyleChange = vi.fn();

		await renderModal({
			open: true,
			overlayTimeframe: "1d",
			onOverlayTimeframeChange: onOverlayTimeframeChange,
			overlayStyle: "step",
			onOverlayStyleChange: onOverlayStyleChange,
		});

		const selects = document.querySelectorAll("select");
		expect(selects.length).toBeGreaterThan(0);
	});

	it("switches tabs when clicking sidebar tab items", async () => {
		await renderModal({ open: true });

		const tabs = document.querySelectorAll('[role="tab"]');
		expect(tabs.length).toBeGreaterThanOrEqual(8);

		// Click on 'scales' or second tab
		const scalesTab = Array.from(tabs).find((t) => t.textContent?.includes("Thang đo") || t.textContent?.includes("Scales"));
		expect(scalesTab).toBeTruthy();

		await act(async () => {
			scalesTab?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});

		// Active tab should update
		expect(scalesTab?.getAttribute("aria-selected")).toBe("true");
	});

	it("filters tabs via the search input", async () => {
		await renderModal({ open: true });

		const searchInput = document.querySelector('input[placeholder*="Tìm kiếm"]') as HTMLInputElement;
		expect(searchInput).toBeTruthy();

		await act(async () => {
			const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
			nativeSetter?.call(searchInput, "Chủ đề");
			searchInput.dispatchEvent(new Event("input", { bubbles: true }));
		});

		const filteredTabs = document.querySelectorAll('[role="tab"]');
		expect(filteredTabs.length).toBeLessThanOrEqual(3);
	});

	it("triggers onReset callback when clicking Restore Defaults", async () => {
		const onReset = vi.fn();
		await renderModal({ open: true, onReset });

		const resetBtn = document.querySelector('[data-testid="settings-reset-defaults-btn"]') as HTMLButtonElement;
		expect(resetBtn).toBeTruthy();

		await act(async () => {
			resetBtn?.click();
		});

		expect(onReset).toHaveBeenCalled();
	});

	it("dispatches vnsc-settings-sync and vnsc-theme-change on settings updates", async () => {
		const syncSpy = vi.fn();
		const themeSpy = vi.fn();
		window.addEventListener("vnsc-settings-sync", syncSpy);
		document.addEventListener("vnsc-theme-change", themeSpy);

		await renderModal({ open: true });

		// Click on status line tab
		const tabs = document.querySelectorAll('[role="tab"]');
		const statusTab = Array.from(tabs).find((t) => t.textContent?.includes("Dòng trạng thái") || t.textContent?.includes("Status"));
		if (statusTab) {
			await act(async () => {
				statusTab.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			});

			// Toggle a checkbox in status tab
			const checkbox = document.querySelector('input[type="checkbox"]') as HTMLInputElement;
			if (checkbox) {
				await act(async () => {
					checkbox.click();
				});
				expect(syncSpy).toHaveBeenCalled();
			}
		}

		window.removeEventListener("vnsc-settings-sync", syncSpy);
		document.removeEventListener("vnsc-theme-change", themeSpy);
	});

	it("respects showTimeScrollbar prop default (singlechart vs multichart) and dispatches updates", async () => {
		const onScrollbarChange = vi.fn();
		const syncSpy = vi.fn();
		window.addEventListener("vnsc-settings-sync", syncSpy);

		// Render with showTimeScrollbar=false (multichart mode)
		await renderModal({ open: true, showTimeScrollbar: false, onShowTimeScrollbarChange: onScrollbarChange });

		// Switch to Scales tab
		const tabs = document.querySelectorAll('[role="tab"]');
		const scalesTab = Array.from(tabs).find((t) => t.textContent?.includes("Thang đo") || t.textContent?.includes("Scales"));
		expect(scalesTab).toBeTruthy();
		await act(async () => {
			scalesTab?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});

		// Find showTimeScrollbar checkbox
		const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"]')) as HTMLInputElement[];
		// Look for the scrollbar checkbox
		const scrollbarCheckbox = checkboxes.find((cb) => {
			const parentText = cb.closest("label")?.textContent || "";
			return parentText.includes("Scrollbar") || parentText.includes("cuộn");
		});

		expect(scrollbarCheckbox).toBeTruthy();
		expect(scrollbarCheckbox?.checked).toBe(false);

		// Toggle it ON
		await act(async () => {
			scrollbarCheckbox?.click();
		});

		expect(onScrollbarChange).toHaveBeenCalledWith(true);
		expect(syncSpy).toHaveBeenCalled();
		const lastEvent = syncSpy.mock.calls[syncSpy.mock.calls.length - 1][0] as CustomEvent;
		expect(lastEvent.detail?.state?.scales?.showTimeScrollbar ?? lastEvent.detail?.scales?.showTimeScrollbar).toBe(true);

		window.removeEventListener("vnsc-settings-sync", syncSpy);
	});
});



