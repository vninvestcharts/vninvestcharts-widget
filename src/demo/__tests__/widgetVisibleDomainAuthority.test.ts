import { describe, expect, it } from "vitest";

import {
	resolvePendingChartRangeSync,
	shouldReleaseDemoVisibleDomainControl,
	shouldRetainDemoVisibleDomainControl,
	shouldUseWidgetOwnedHistory,
} from "../widgetVisibleDomainAuthority";

describe("widgetVisibleDomainAuthority", () => {
	it("enables widget-owned history for Binance regardless of runtime lane selection", () => {
		expect(shouldUseWidgetOwnedHistory({
			activeSource: "binance",
			dataAdapterName: "binance",
		})).toBe(true);
	});

	it("does not enable widget-owned history for non-Binance adapter/source combinations", () => {
		expect(shouldUseWidgetOwnedHistory({
			activeSource: "vninvest",
			dataAdapterName: "binance",
		})).toBe(false);
		expect(shouldUseWidgetOwnedHistory({
			activeSource: "binance",
			dataAdapterName: "vnstocks",
		})).toBe(false);
	});

	it("enables widget-owned history for VNInvest when data adapter name is vninvest", () => {
		expect(shouldUseWidgetOwnedHistory({
			activeSource: "vninvest",
			dataAdapterName: "vninvest",
		})).toBe(true);
	});

	it("releases normal-range authority on widget-owned history once pending sync is done", () => {
		expect(shouldRetainDemoVisibleDomainControl({
			useWidgetOwnedHistory: true,
			range: "5D",
			pendingChartRangeSync: false,
		})).toBe(false);
		expect(shouldReleaseDemoVisibleDomainControl({
			useWidgetOwnedHistory: true,
			range: "5D",
			pendingChartRangeSync: false,
		})).toBe(true);
	});

	it("does not keep normal-range pending sync on widget-owned history", () => {
		expect(resolvePendingChartRangeSync({
			useWidgetOwnedHistory: true,
			rangeSatisfied: false,
		})).toBe(false);
		expect(shouldRetainDemoVisibleDomainControl({
			useWidgetOwnedHistory: true,
			range: "5D",
			pendingChartRangeSync: true,
		})).toBe(false);
		expect(shouldReleaseDemoVisibleDomainControl({
			useWidgetOwnedHistory: true,
			range: "5D",
			pendingChartRangeSync: true,
		})).toBe(true);
	});

	it("does not retain All-range authority once widget owns history", () => {
		expect(resolvePendingChartRangeSync({
			useWidgetOwnedHistory: true,
			rangeSatisfied: true,
		})).toBe(false);
		expect(resolvePendingChartRangeSync({
			useWidgetOwnedHistory: true,
			rangeSatisfied: false,
		})).toBe(false);
		expect(shouldRetainDemoVisibleDomainControl({
			useWidgetOwnedHistory: true,
			range: "All",
			pendingChartRangeSync: true,
		})).toBe(false);
		expect(shouldReleaseDemoVisibleDomainControl({
			useWidgetOwnedHistory: true,
			range: "All",
			pendingChartRangeSync: true,
		})).toBe(true);
	});

	it("does not apply widget-owned handoff rules to non-widget history paths", () => {
		expect(resolvePendingChartRangeSync({
			useWidgetOwnedHistory: false,
			rangeSatisfied: false,
		})).toBe(true);
		expect(shouldRetainDemoVisibleDomainControl({
			useWidgetOwnedHistory: false,
			range: "5D",
			pendingChartRangeSync: false,
		})).toBe(true);
		expect(shouldReleaseDemoVisibleDomainControl({
			useWidgetOwnedHistory: false,
			range: "5D",
			pendingChartRangeSync: false,
		})).toBe(false);
	});
});