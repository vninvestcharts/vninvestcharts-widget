// @vitest-environment jsdom
/**
 * Indicators-tab "apply to all" button: multi-only visibility + share event.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { VNInvestChartsStateProvider } from "../../../../context/VNInvestChartsStateContext";
import { WorkspaceSettingsProvider } from "../../WorkspaceSettingsContext";
import { IndicatorsSettingsTab } from "../IndicatorsSettingsTab";
import { INDICATORS_SHARE_EVENT, type IndicatorsShareDetail } from "../../model/indicatorShare";

describe("Indicators share button", () => {
	let container: HTMLDivElement | null = null;
	let root: ReturnType<typeof createRoot> | null = null;

	function renderTab(multi: boolean) {
		const tab = <IndicatorsSettingsTab chartId="chart-a" />;
		const wrapped = multi ? (
			<WorkspaceSettingsProvider chartIds={["chart-a", "chart-b"]}>
				<VNInvestChartsStateProvider>{tab}</VNInvestChartsStateProvider>
			</WorkspaceSettingsProvider>
		) : (
			<VNInvestChartsStateProvider>{tab}</VNInvestChartsStateProvider>
		);
		act(() => {
			root?.render(wrapped);
		});
	}

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

	it("hidden in single-chart mode (no workspace provider)", () => {
		renderTab(false);
		expect(container?.querySelector('[data-testid="indicators-apply-to-all-btn"]')).toBeNull();
	});

	it("visible in multi mode and dispatches share event with source attribution", () => {
		renderTab(true);
		const btn = container?.querySelector('[data-testid="indicators-apply-to-all-btn"]') as HTMLButtonElement | null;
		expect(btn).not.toBeNull();
		const seen: IndicatorsShareDetail[] = [];
		const listener = (e: Event) => { seen.push((e as CustomEvent<IndicatorsShareDetail>).detail); };
		window.addEventListener(INDICATORS_SHARE_EVENT, listener);
		try {
			act(() => {
				btn?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
			});
		} finally {
			window.removeEventListener(INDICATORS_SHARE_EVENT, listener);
		}
		expect(seen).toHaveLength(1);
		expect(seen[0].sourceChartId).toBe("chart-a");
		expect(seen[0].indicators.length).toBeGreaterThan(0);
		expect(seen[0].indicators.every((i) => i.paneId && i.series?.type)).toBe(true);
	});
});
