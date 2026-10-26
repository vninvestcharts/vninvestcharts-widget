import { beforeEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { useWidgetSettings } from "../useWidgetSettings";
import type { UseWidgetSettingsOptions } from "../useWidgetSettings";
import { VNInvestChartsStateProvider } from "../../context/VNInvestChartsContext";

const STATUS_LINE = {
	showLogo: false,
	showTicker: true,
	showOhlc: false,
	showBarChange: true,
	showVolume: true,
	showIndicatorTitles: true,
	showIndicatorArguments: true,
	showIndicatorValues: true,
	backgroundOpacity: 0.8,
};

function renderSettings(options: Partial<UseWidgetSettingsOptions> = {}) {
	const wrapper = ({ children }: { children: ReactNode }) => (
		<VNInvestChartsStateProvider storageScopeId="status-line-test">{children}</VNInvestChartsStateProvider>
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

describe("useWidgetSettings statusLine showOhlc -> showOHLC", () => {
	beforeEach(() => {
		localStorage.clear();
	});

	it("hydrate legacy composite: showOhlc false -> showOHLC false", () => {
		localStorage.setItem("vnsc_chart_settings_v1", JSON.stringify({ statusLine: STATUS_LINE }));
		const { result, unmount } = renderSettings();
		expect(result.current.statusLineSettings.showOHLC).toBe(false);
		expect(result.current.statusLineSettings.showTicker).toBe(true);
		unmount();
	});

	it("sync event: showOhlc false -> showOHLC false", () => {
		const { result, unmount } = renderSettings();
		expect(result.current.statusLineSettings.showOHLC).toBe(true);
		act(() => {
			window.dispatchEvent(
				new CustomEvent("vnsc-settings-sync", { detail: { state: { statusLine: STATUS_LINE } } }),
			);
		});
		expect(result.current.statusLineSettings.showOHLC).toBe(false);
		unmount();
	});
});
