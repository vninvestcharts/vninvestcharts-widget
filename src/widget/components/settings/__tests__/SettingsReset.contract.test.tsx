// @vitest-environment jsdom
/**
 * S-04: resetAll must clear the dynamic paneId price-scale-mode keys and
 * broadcast the reset state to sibling surfaces (sync + theme events).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { SettingsProvider, useSettingsContext } from "../SettingsContext";

function createMockAdapter() {
	const store = new Map<string, string>();
	return {
		store,
		getItem: vi.fn((key: string) => store.get(key) ?? null),
		setItem: vi.fn((key: string, val: string) => {
			store.set(key, val);
		}),
		removeItem: vi.fn((key: string) => {
			store.delete(key);
		}),
	};
}

describe("resetAll orchestrates keys + broadcasts (S-04)", () => {
	let container: HTMLDivElement | null = null;
	let root: ReturnType<typeof createRoot> | null = null;

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

	const mount = async (
		adapter: ReturnType<typeof createMockAdapter>,
		chartId?: string
	): Promise<() => ReturnType<typeof useSettingsContext>> => {
		let captured: ReturnType<typeof useSettingsContext> | null = null;
		function Probe() {
			const ctx = useSettingsContext();
			useEffect(() => {
				captured = ctx;
			}, [ctx]);
			return null;
		}
		await act(async () => {
			root?.render(
				<SettingsProvider
					key={chartId ?? "single"}
					chartId={chartId}
					isDark
					themePreset="classic-dark"
					storageAdapter={adapter as never}
				>
					<Probe />
				</SettingsProvider>
			);
		});
		return () => captured as ReturnType<typeof useSettingsContext>;
	};

	it("single-chart: clears priceScaleMode prefix keys, keeps chart theme, broadcasts defaults", async () => {
		const adapter = createMockAdapter();
		window.localStorage.setItem("vnsc_priceScaleMode:price", "log");
		window.localStorage.setItem("vnsc_priceScaleMode:volume", "percent");
		window.localStorage.setItem("rsc-chart-theme", "trading-night");
		adapter.store.set("vnsc_priceScaleMode:price", "log");

		const getCtx = await mount(adapter);
		const syncSpy = vi.fn();
		const themeSpy = vi.fn();
		window.addEventListener("vnsc-settings-sync", syncSpy);
		document.addEventListener("vnsc-theme-change", themeSpy);
		try {
			await act(async () => {
				getCtx().resetAll();
			});
		} finally {
			window.removeEventListener("vnsc-settings-sync", syncSpy);
			document.removeEventListener("vnsc-theme-change", themeSpy);
		}

		expect(window.localStorage.getItem("vnsc_priceScaleMode:price")).toBeNull();
		expect(window.localStorage.getItem("vnsc_priceScaleMode:volume")).toBeNull();
		expect(adapter.store.has("vnsc_priceScaleMode:price")).toBe(false);
		expect(adapter.removeItem).toHaveBeenCalledWith("vnsc_priceScaleMode:price");
		// Q5: chart theme survives reset (not a detachable settings key).
		expect(window.localStorage.getItem("rsc-chart-theme")).toBe("trading-night");

		expect(syncSpy).toHaveBeenCalled();
		const syncDetail = syncSpy.mock.calls[syncSpy.mock.calls.length - 1][0].detail;
		expect(syncDetail.chartId).toBeNull();
		expect(syncDetail.state.theme.presetName).toBe("classic-dark");
		expect(syncDetail.state.scales.priceScaleMode).toBe("normal");

		expect(themeSpy).toHaveBeenCalled();
		const themeDetail = themeSpy.mock.calls[themeSpy.mock.calls.length - 1][0].detail;
		expect(themeDetail.chartId).toBeNull();
		expect(themeDetail.theme.presetName).toBe("classic-dark");

		expect(getCtx().settings.theme.presetName).toBe("classic-dark");
	});

	it("multi-chart: only own suffixed priceScaleMode keys cleared; siblings + unscoped survive", async () => {
		const adapter = createMockAdapter();
		window.localStorage.setItem("vnsc_priceScaleMode:price_chart-A", "log");
		window.localStorage.setItem("vnsc_priceScaleMode:price_chart-B", "percent");
		window.localStorage.setItem("vnsc_priceScaleMode:volume", "percent");
		adapter.store.set("vnsc_priceScaleMode:price_chart-A", "log");
		adapter.store.set("vnsc_priceScaleMode:price_chart-B", "percent");

		const getCtx = await mount(adapter, "chart-A");
		const syncSpy = vi.fn();
		window.addEventListener("vnsc-settings-sync", syncSpy);
		try {
			await act(async () => {
				getCtx().resetAll();
			});
		} finally {
			window.removeEventListener("vnsc-settings-sync", syncSpy);
		}

		expect(window.localStorage.getItem("vnsc_priceScaleMode:price_chart-A")).toBeNull();
		expect(window.localStorage.getItem("vnsc_priceScaleMode:price_chart-B")).toBe("percent");
		expect(window.localStorage.getItem("vnsc_priceScaleMode:volume")).toBe("percent");
		expect(adapter.store.has("vnsc_priceScaleMode:price_chart-A")).toBe(false);
		expect(adapter.store.get("vnsc_priceScaleMode:price_chart-B")).toBe("percent");

		const syncDetail = syncSpy.mock.calls[syncSpy.mock.calls.length - 1][0].detail;
		expect(syncDetail.chartId).toBe("chart-A");
	});
});
