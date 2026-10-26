/**
 * Nhóm 5/8 — volume & money flow (Volume, OBV, VR, PVT, BRAR, EMV, SMFI, CMF, MFI,
 * ChaikinOscillator, VolOsc, CVD, VWAP).
 */

import { format } from "d3-format";
import BarSeries from "../../series/BarSeries";
import LineSeries from "../../series/LineSeries";
import { resolveSeriesValue } from "../seriesValueResolver";
import { periodFromConfig, registerLineSeries, registerSeries } from "./registryCore";

export const registerVolume = (): void => registerSeries("Volume", {
	component: BarSeries,
	defaultParams: {},
	defaultYAxis: "right",
	tooltipEntry: () => ({
		label: "Volume",
		format: format(".3s"),
		accessor: (d) => d.volume,
	}),
});

export const registerCVDApprox = (): void => registerLineSeries("CVDApprox", {
	component: LineSeries,
	defaultYAxis: "right",
	defaultParams: {},
	tooltipEntry: (config) => ({
		label: "CVD",
		format: format(".0f"),
		accessor: (d) => resolveSeriesValue(d, config),
	}),
});

export const registerCVDRealtime = (): void => registerLineSeries("CVDRealtime", {
	component: LineSeries,
	defaultYAxis: "right",
	defaultParams: {},
	tooltipEntry: (config) => ({
		label: "CVD RT",
		format: format(".0f"),
		accessor: (d) => resolveSeriesValue(d, config),
	}),
});

export const registerSMFI = (): void => registerLineSeries("SMFI", {
	component: LineSeries,
	defaultYAxis: "left",
	defaultParams: {},
	tooltipEntry: (config) => ({
		label: "SMFI",
		format: format(".1f"),
		accessor: (d) => resolveSeriesValue(d, config),
	}),
});

export const registerWhale = (): void => registerSeries("Whale", {
	component: BarSeries,
	defaultParams: { threshold: 50_000 },
	defaultYAxis: "right",
	settingsFields: [
		{ key: "threshold", labelKey: "settings.thresholdUsd", type: "number", defaultValue: 50_000, min: 1000, step: 1000 },
	],
	tooltipEntry: (config) => ({
		label: "Whale",
		format: format(".3s"),
		accessor: (d) => resolveSeriesValue(d, config),
	}),
});

export const registerOBV = (): void => registerLineSeries("OBV", {
	component: LineSeries,
	defaultParams: {},
	defaultYAxis: "right",
	tooltipEntry: (config) => ({
		label: "OBV",
		format: format(".3s"),
		accessor: (d) => resolveSeriesValue(d, config),
	}),
});

export const registerVR = (): void => registerLineSeries("VR", {
	component: LineSeries,
	defaultParams: { period: 26 },
	defaultYAxis: "right",
	settingsFields: [
		{ key: "period", labelKey: "settings.period", type: "number", defaultValue: 26, min: 2, step: 1 },
	],
	tooltipEntry: (config) => ({
		label: `VR(${periodFromConfig(config, 26)})`,
		format: format(".1f"),
		accessor: (d) => resolveSeriesValue(d, config),
	}),
});

export const registerBRAR = (): void => registerLineSeries("BRAR", {
	component: LineSeries,
	defaultParams: { period: 26 },
	defaultYAxis: "right",
	settingsFields: [
		{ key: "period", labelKey: "settings.period", type: "number", defaultValue: 26, min: 2, step: 1 },
	],
	tooltipEntry: (config) => ({
		label: `BRAR(${periodFromConfig(config, 26)})`,
		format: format(".2f"),
		accessor: (d) => resolveSeriesValue(d, config),
	}),
});

export const registerEMV = (): void => registerLineSeries("EMV", {
	component: LineSeries,
	defaultParams: { period: 14 },
	defaultYAxis: "right",
	settingsFields: [
		{ key: "period", labelKey: "settings.period", type: "number", defaultValue: 14, min: 1, step: 1 },
	],
	tooltipEntry: (config) => ({
		label: `EMV(${periodFromConfig(config, 14)})`,
		format: format(".2f"),
		accessor: (d) => resolveSeriesValue(d, config),
	}),
});

export const registerPVT = (): void => registerLineSeries("PVT", {
	component: LineSeries,
	defaultParams: {},
	defaultYAxis: "right",
	tooltipEntry: (config) => ({
		label: "PVT",
		format: format(".2f"),
		accessor: (d) => resolveSeriesValue(d, config),
	}),
});

export const registerCMF = (): void => registerLineSeries("CMF", {
	component: LineSeries,
	defaultParams: { period: 20 },
	defaultYAxis: "left",
	settingsFields: [
		{ key: "period", labelKey: "settings.period", type: "number", defaultValue: 20, min: 1, step: 1 },
	],
	tooltipEntry: (config) => ({
		label: `CMF(${periodFromConfig(config, 20)})`,
		format: format(".2f"),
		accessor: (d) => resolveSeriesValue(d, config),
	}),
});

export const registerChaikinOscillator = (): void => registerLineSeries("ChaikinOscillator", {
	component: LineSeries,
	defaultParams: { fast: 3, slow: 10 },
	defaultYAxis: "left",
	settingsFields: [
		{ key: "fast", labelKey: "settings.fastPeriod", type: "number", defaultValue: 3, min: 1, max: 100, step: 1 },
		{ key: "slow", labelKey: "settings.slowPeriod", type: "number", defaultValue: 10, min: 1, max: 200, step: 1 },
	],
	tooltipEntry: (config) => ({
		label: `Chaikin Oscillator(${config.params?.fast ?? 3},${config.params?.slow ?? 10})`,
		format: format(".2f"),
		accessor: (d) => resolveSeriesValue(d, config),
	}),
});

export const registerMFI = (): void => registerLineSeries("MFI", {
	component: LineSeries,
	defaultParams: { period: 14 },
	defaultYAxis: "left",
	settingsFields: [
		{ key: "period", labelKey: "settings.period", type: "number", defaultValue: 14, min: 1, step: 1 },
	],
	tooltipEntry: (config) => ({
		label: `MFI(${periodFromConfig(config, 14)})`,
		format: format(".1f"),
		accessor: (d) => resolveSeriesValue(d, config),
	}),
});

export const registerVolOsc = (): void => registerLineSeries("VolOsc", {
	component: LineSeries,
	defaultParams: { shortPeriod: 5, longPeriod: 20 },
	defaultYAxis: "left",
	settingsFields: [
		{ key: "shortPeriod", labelKey: "settings.shortPeriod", type: "number", defaultValue: 5, min: 1, step: 1 },
		{ key: "longPeriod", labelKey: "settings.longPeriod", type: "number", defaultValue: 20, min: 1, step: 1 },
	],
	tooltipEntry: (config) => ({
		label: `VolOsc(${(config.params?.shortPeriod as number) ?? 5},${(config.params?.longPeriod as number) ?? 20})`,
		format: format(".1f"),
		accessor: (d) => resolveSeriesValue(d, config),
	}),
});

export const registerVWAP = (): void => registerSeries("VWAP", {
	component: LineSeries,
	defaultParams: { anchor: "session", showBands: true, multiplier: 1, fillMode: "none", fillOpacity: 0.05 },
	defaultYAxis: "right",
	settingsFields: [
		{ key: "multiplier", labelKey: "settings.multiplier", type: "number", defaultValue: 1, min: 1, step: 1 },
		{ key: "fillMode", labelKey: "settings.fillMode", type: "select", defaultValue: "none", options: [
			{ value: "none", labelKey: "settings.fillMode.none" },
			{ value: "solid", labelKey: "settings.fillMode.solid" },
			{ value: "fade", labelKey: "settings.fillMode.fade" },
		]},
		{ key: "fillOpacity", labelKey: "settings.fillOpacity", type: "number", defaultValue: 0.05, min: 0, max: 1, step: 0.05 },
		{ key: "fillColor", labelKey: "settings.fillColor", type: "color", defaultValue: "" },
	],
	tooltipEntry: (config) => ({
		label: "VWAP",
		format: format(".2f"),
		accessor: (d) => resolveSeriesValue(d, config),
	}),
});

export const registerAnchoredVWAP = (): void => registerSeries("AnchoredVWAP", {
	component: LineSeries,
	defaultParams: { anchorTime: 0, showBands: true, multiplier: 1, fillMode: "none", fillOpacity: 0.05 },
	defaultYAxis: "right",
	settingsFields: [
		{ key: "anchorTime", labelKey: "settings.anchorTime", type: "number", defaultValue: 0 },
		{ key: "multiplier", labelKey: "settings.multiplier", type: "number", defaultValue: 1, min: 1, step: 1 },
		{ key: "fillMode", labelKey: "settings.fillMode", type: "select", defaultValue: "none", options: [
			{ value: "none", labelKey: "settings.fillMode.none" },
			{ value: "solid", labelKey: "settings.fillMode.solid" },
			{ value: "fade", labelKey: "settings.fillMode.fade" },
		]},
		{ key: "fillOpacity", labelKey: "settings.fillOpacity", type: "number", defaultValue: 0.05, min: 0, max: 1, step: 0.05 },
		{ key: "fillColor", labelKey: "settings.fillColor", type: "color", defaultValue: "" },
	],
	tooltipEntry: (config) => ({
		label: "Anchored VWAP",
		format: format(".2f"),
		accessor: (d) => resolveSeriesValue(d, config),
	}),
});
