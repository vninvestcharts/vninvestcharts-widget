// @vitest-environment jsdom
/**
 * S3b-2: composer thêm series khóa Order Flow theo tier (dropdown 🔒 + nút Add disabled).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { VNInvestChartsStateProvider } from "../../../../context/VNInvestChartsStateContext";
import { registerPhaseOneSeries } from "../../../../../lib/core/registry/SeriesRegistry";
import type { SeriesTier } from "../../../../../lib/core/registry/SeriesRegistry";
import { IndicatorsSettingsTab } from "../IndicatorsSettingsTab";

describe("Indicators composer series lock (S3b-2)", () => {
	let container: HTMLDivElement | null = null;
	let root: ReturnType<typeof createRoot> | null = null;

	function renderTab(seriesTier?: SeriesTier) {
		act(() => {
			root?.render(
				<VNInvestChartsStateProvider>
					<IndicatorsSettingsTab chartId="chart-a" seriesTier={seriesTier} />
				</VNInvestChartsStateProvider>,
			);
		});
	}

	function optionText(value: string): string {
		const opt = container?.querySelector(`[data-testid="composer-type-select"] option[value="${value}"]`);
		return opt?.textContent ?? "";
	}

	function selectType(value: string) {
		const sel = container?.querySelector('[data-testid="composer-type-select"]') as HTMLSelectElement | null;
		if (!sel) throw new Error("composer select missing");
		act(() => {
			sel.value = value;
			sel.dispatchEvent(new Event("change", { bubbles: true }));
		});
	}

	function addDisabled(): boolean {
		return (container?.querySelector('[data-testid="composer-add-btn"]') as HTMLButtonElement | null)?.disabled ?? false;
	}

	beforeEach(() => {
		registerPhaseOneSeries();
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

	// P0-b (2026-10-15): Footprint/VolumeProfile are Community now, so free must NOT see a lock
	// on them. MarketProfile/DeltaProfile keep their paid tier and still lock.
	it("free: Footprint/VolumeProfile mở, MarketProfile/DeltaProfile vẫn khóa", () => {
		renderTab("free");
		expect(optionText("VolumeProfile"), "VolumeProfile is Community after P0-b").not.toContain("🔒");
		expect(optionText("Footprint"), "Footprint is Community after P0-b").not.toContain("🔒");
		expect(optionText("MarketProfile"), "MarketProfile stays paid").toContain("🔒");
		expect(optionText("DeltaProfile"), "DeltaProfile stays paid").toContain("🔒");
		expect(optionText("RSI")).not.toContain("🔒");
		expect(addDisabled()).toBe(false);
		selectType("VolumeProfile");
		expect(addDisabled(), "free can add VolumeProfile").toBe(false);
		selectType("Footprint");
		expect(addDisabled(), "free can add Footprint").toBe(false);
		selectType("DeltaProfile");
		expect(addDisabled(), "free still cannot add a paid type").toBe(true);
	});

	it("pro: Footprint/VolumeProfile mở, DeltaProfile vẫn khóa", () => {
		renderTab("pro");
		expect(optionText("VolumeProfile")).not.toContain("🔒");
		expect(optionText("Footprint")).not.toContain("🔒");
		selectType("VolumeProfile");
		expect(addDisabled()).toBe(false);
		selectType("Footprint");
		expect(addDisabled(), "Footprint is Community at pro too").toBe(false);
		selectType("DeltaProfile");
		expect(addDisabled(), "DeltaProfile remains enterprise-only").toBe(true);
	});

	it("enterprise: không khóa gì; vắng seriesTier: legacy không khóa", () => {
		renderTab("enterprise");
		expect(optionText("Footprint")).not.toContain("🔒");
		expect(optionText("VolumeProfile")).not.toContain("🔒");
		expect(addDisabled()).toBe(false);
	});
});
