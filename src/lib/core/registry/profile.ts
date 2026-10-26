/**
 * Nhóm 8/8 — order-flow profile / footprint + overlay so sánh (tier pro/enterprise).
 */

import { format } from "d3-format";
import FootprintSeries from "../../series/FootprintSeries";
import LineSeries from "../../series/LineSeries";
import MarketProfileSeries from "../../series/MarketProfileSeries";
import VolumeProfileSeries from "../../series/VolumeProfileSeries";
import { resolveSeriesValue } from "../seriesValueResolver";
import { registerSeries } from "./registryCore";

export const registerMarketProfile = (): void => registerSeries("MarketProfile", {
	component: MarketProfileSeries,
	defaultParams: { tickSize: 0.01, tpoPeriodMinutes: 30 },
	defaultYAxis: "right",
	tier: "pro",
	settingsFields: [
		{ key: "tickSize", labelKey: "settings.tickSize", type: "number", defaultValue: 0.01, min: 0.0001, step: 0.0001 },
		{ key: "tpoPeriodMinutes", labelKey: "settings.tpoPeriodMinutes", type: "number", defaultValue: 30, min: 5, step: 5 },
	],
	tooltipEntry: (config) => ({
		label: "Market Profile",
		format: format(".2f"),
		accessor: (d) => resolveSeriesValue(d, config),
	}),
});

export const registerVolumeProfile = (): void => registerSeries("VolumeProfile", {
	component: VolumeProfileSeries,
	defaultParams: { priceTickSize: 0.01 },
	defaultYAxis: "right",
	// Community (P0-b, 2026-10-15). Was "pro". The capability matrix declares `volume_profile:
	// "none"` in engine `capabilities.ts:138`, and its comment there explains the rule: gating a
	// feature that already runs for free is a Rule 15 violation — Community code is public MIT and
	// must actually work — not a revenue gain. Volume-at-price is Community in every mainstream
	// product. SeriesTier and the capability matrix are two independent mechanisms with no mapping
	// between them, so this is a policy alignment with a decision already taken and documented on
	// the engine side, not a broken single source of truth.
	//
	// `MarketProfile` and `DeltaProfile` keep their tiers: they have NO capability in the matrix at
	// all, so there is no contradicting decision to align with. Raising those two is open work —
	// it needs a capability row in the engine (Rule 12 + rebuild), not a one-line change here.
	tier: "free",
	settingsFields: [
		{ key: "priceTickSize", labelKey: "settings.priceTickSize", type: "number", defaultValue: 0.01, min: 0.0001, step: 0.0001 },
	],
	tooltipEntry: (config) => ({
		label: "Volume Profile",
		format: format(".2f"),
		accessor: (d) => resolveSeriesValue(d, config),
	}),
});

export const registerFootprint = (): void => registerSeries("Footprint", {
	component: FootprintSeries,
	defaultParams: { barIntervalMs: 60000, priceTickSize: 0.01 },
	defaultYAxis: "right",
	// Community (P0-b, 2026-10-15). Was "enterprise". See the note on `registerVolumeProfile` —
	// engine `capabilities.ts:139` declares `volume_footprint: "none"` with the same rationale.
	//
	// Footprint keeps a `DEVICE_HEAVY` degrade (engine `capabilities.ts:124`) for narrow viewports
	// at EVERY tier. That is a performance guard, not an entitlement, and it is unaffected here.
	tier: "free",
	settingsFields: [
		{ key: "barIntervalMs", labelKey: "settings.barIntervalMs", type: "number", defaultValue: 60000, min: 1000, step: 1000 },
		{ key: "priceTickSize", labelKey: "settings.priceTickSize", type: "number", defaultValue: 0.01, min: 0.0001, step: 0.0001 },
	],
	tooltipEntry: (config) => ({
		label: "Footprint",
		format: format(".2f"),
		accessor: (d) => resolveSeriesValue(d, config),
	}),
});

export const registerDeltaProfile = (): void => registerSeries("DeltaProfile", {
	component: LineSeries,
	defaultParams: { barIntervalMs: 60000, priceTickSize: 0.01, smaPeriod: 14 },
	defaultYAxis: "left",
	tier: "enterprise",
	settingsFields: [
		{ key: "barIntervalMs", labelKey: "settings.barIntervalMs", type: "number", defaultValue: 60000, min: 1000, step: 1000 },
		{ key: "priceTickSize", labelKey: "settings.priceTickSize", type: "number", defaultValue: 0.01, min: 0.0001, step: 0.0001 },
		{ key: "smaPeriod", labelKey: "settings.smaPeriod", type: "number", defaultValue: 14, min: 1, step: 1 },
	],
	tooltipEntry: (config) => ({
		label: "Delta Profile",
		format: format(".2f"),
		accessor: (d) => resolveSeriesValue(d, config),
	}),
});

export const registerComparison = (): void => registerSeries("Comparison", {
	component: () => null,
	defaultParams: {},
	defaultYAxis: "right",
	tooltipEntry: (config) => ({
		label: String(config.overlaySymbolId ?? "Comparison"),
		format: format(".2f"),
		accessor: (d: any) => d.close,
	}),
});
