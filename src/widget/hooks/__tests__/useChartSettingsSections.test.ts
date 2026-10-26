// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { StorageAdapter } from "@vninvestcharts/engine-react";
import { useChartSettingsSections } from "../useChartSettingsSections";
import { LEGACY_COMPOSITE_KEY } from "../../components/settings/storageKeys";

function memoryAdapter(initial: Record<string, string> = {}): StorageAdapter & { store: Map<string, string> } {
	const store = new Map<string, string>(Object.entries(initial));
	return {
		store,
		getItem: (key: string) => store.get(key) ?? null,
		setItem: (key: string, value: string) => {
			store.set(key, value);
		},
		removeItem: (key: string) => {
			store.delete(key);
		},
	} as StorageAdapter & { store: Map<string, string> };
}

describe("useChartSettingsSections (Batch B)", () => {
	it("hydrates the sections from the stored composite", () => {
		const composite = {
			version: 1,
			appearance: { crosshairColor: "#ff0000", crosshairMode: "dot" },
			symbol: { candleStyle: "line" },
			scales: { timeFormat: "12h" },
			tradingEvents: { showPaperOrders: false, showPaperPositions: false },
		};
		const adapter = memoryAdapter({ [LEGACY_COMPOSITE_KEY]: JSON.stringify(composite) });

		const { result } = renderHook(() => useChartSettingsSections({ storageAdapter: adapter }));

		expect(result.current.sections.appearance.crosshairColor).toBe("#ff0000");
		expect(result.current.sections.symbol.candleStyle).toBe("line");
		expect(result.current.sections.scales.timeFormat).toBe("12h");
		expect(result.current.sections.tradingEvents.showPaperOrders).toBe(false);
		expect(result.current.crosshairMode).toBe("dot");
	});

	it("falls back to the defaults when nothing is stored", () => {
		const adapter = memoryAdapter();
		const { result } = renderHook(() => useChartSettingsSections({ storageAdapter: adapter }));

		expect(result.current.sections.scales.timeFormat).toBe("24h");
		expect(result.current.sections.symbol.candleStyle).toBe("candle");
		expect(result.current.crosshairMode).toBe("cross");
	});

	it("picks up a settings-sync event for the own chart", () => {
		const adapter = memoryAdapter();
		const { result } = renderHook(() => useChartSettingsSections({ chartId: "cell-1", storageAdapter: adapter }));

		act(() => {
			window.dispatchEvent(
				new CustomEvent("vnsc-settings-sync", {
					detail: {
						chartId: "cell-1",
						state: {
							version: 1,
							appearance: { crosshairMode: "magnet" },
							scales: { timeFormat: "12h" },
						},
					},
				}),
			);
		});

		expect(result.current.sections.scales.timeFormat).toBe("12h");
		expect(result.current.crosshairMode).toBe("magnet");
	});

	it("ignores a settings-sync event that belongs to another chart", () => {
		const adapter = memoryAdapter();
		const { result } = renderHook(() => useChartSettingsSections({ chartId: "cell-1", storageAdapter: adapter }));

		act(() => {
			window.dispatchEvent(
				new CustomEvent("vnsc-settings-sync", {
					detail: { chartId: "cell-2", state: { version: 1, scales: { timeFormat: "12h" } } },
				}),
			);
		});

		expect(result.current.sections.scales.timeFormat).toBe("24h");
	});

	it("writes the crosshair mode to the composite and to the scoped key", () => {
		const adapter = memoryAdapter();
		const { result } = renderHook(() => useChartSettingsSections({ storageAdapter: adapter }));

		act(() => result.current.setCrosshairMode("dot"));

		expect(result.current.crosshairMode).toBe("dot");
		const stored = JSON.parse(adapter.store.get(LEGACY_COMPOSITE_KEY) ?? "{}");
		expect(stored.appearance?.crosshairMode).toBe("dot");
		expect(adapter.store.get("vnsc_crosshairMode")).toBe("dot");
	});
});
