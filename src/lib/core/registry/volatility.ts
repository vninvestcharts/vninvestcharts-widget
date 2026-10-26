/**
 * Nhóm 3/8 — dải biến động và độ phân tán (Bollinger, Keltner, Donchian,
 * ChaikinVol, StdDev, HV).
 */

import { format } from "d3-format";
import BollingerSeries from "../../series/BollingerSeries";
import LineSeries from "../../series/LineSeries";
import { resolveSeriesValue } from "../seriesValueResolver";
import { periodFromConfig, registerLineSeries, registerSeries } from "./registryCore";

export const registerBollingerBand = (): void => registerSeries("BollingerBand", {
	component: BollingerSeries,
	defaultParams: { period: 20, stdDev: 2, fillMode: "none", fillOpacity: 0.15 },
	defaultYAxis: "right",
	settingsFields: [
		{ key: "period", labelKey: "settings.period", type: "number", defaultValue: 20, min: 5, step: 1 },
		{ key: "stdDev", labelKey: "settings.stdDev", type: "number", defaultValue: 2, min: 0.5, step: 0.5 },
		{ key: "fillMode", labelKey: "settings.fillMode", type: "select", defaultValue: "none", options: [
			{ value: "none", labelKey: "settings.fillMode.none" },
			{ value: "solid", labelKey: "settings.fillMode.solid" },
			{ value: "fade", labelKey: "settings.fillMode.fade" },
		]},
		{ key: "fillOpacity", labelKey: "settings.fillOpacity", type: "number", defaultValue: 0.15, min: 0, max: 1, step: 0.05 },
		{ key: "fillColor", labelKey: "settings.fillColor", type: "color", defaultValue: "" },
	],
	tooltipEntry: (config) => ({
		label: `BB(${periodFromConfig(config, 20)},${config.params?.stdDev ?? 2})`,
		format: format(".2f"),
		accessor: (d) => resolveSeriesValue(d, config),
	}),
});

// Alias for BollingerBands (plural) - used in demos
export const registerBollingerBands = (): void => registerSeries("BollingerBands", {
	component: BollingerSeries,
	defaultParams: { period: 20, stdDev: 2, fillMode: "none", fillOpacity: 0.15 },
	defaultYAxis: "right",
	settingsFields: [
		{ key: "period", labelKey: "settings.period", type: "number", defaultValue: 20, min: 5, step: 1 },
		{ key: "stdDev", labelKey: "settings.stdDev", type: "number", defaultValue: 2, min: 0.5, step: 0.5 },
		{ key: "fillMode", labelKey: "settings.fillMode", type: "select", defaultValue: "none", options: [
			{ value: "none", labelKey: "settings.fillMode.none" },
			{ value: "solid", labelKey: "settings.fillMode.solid" },
			{ value: "fade", labelKey: "settings.fillMode.fade" },
		]},
		{ key: "fillOpacity", labelKey: "settings.fillOpacity", type: "number", defaultValue: 0.15, min: 0, max: 1, step: 0.05 },
		{ key: "fillColor", labelKey: "settings.fillColor", type: "color", defaultValue: "" },
	],
	tooltipEntry: (config) => ({
		label: `BB(${periodFromConfig(config, 20)},${config.params?.stdDev ?? 2})`,
		format: format(".2f"),
		accessor: (d) => resolveSeriesValue(d, config),
	}),
});

export const registerKeltner = (): void => registerSeries("Keltner", {
	component: LineSeries,
	defaultParams: { period: 20, atrPeriod: 10, multiplier: 2, fillMode: "none", fillOpacity: 0.06 },
	defaultYAxis: "right",
	settingsFields: [
		{ key: "period", labelKey: "settings.period", type: "number", defaultValue: 20, min: 1, step: 1 },
		{ key: "atrPeriod", labelKey: "settings.atrPeriod", type: "number", defaultValue: 10, min: 1, step: 1 },
		{ key: "multiplier", labelKey: "settings.multiplier", type: "number", defaultValue: 2, min: 1, step: 1 },
		{ key: "fillMode", labelKey: "settings.fillMode", type: "select", defaultValue: "none", options: [
			{ value: "none", labelKey: "settings.fillMode.none" },
			{ value: "solid", labelKey: "settings.fillMode.solid" },
			{ value: "fade", labelKey: "settings.fillMode.fade" },
		]},
		{ key: "fillOpacity", labelKey: "settings.fillOpacity", type: "number", defaultValue: 0.06, min: 0, max: 1, step: 0.05 },
		{ key: "fillColor", labelKey: "settings.fillColor", type: "color", defaultValue: "" },
	],
	tooltipEntry: (config) => ({
		label: `Keltner(${periodFromConfig(config, 20)})`,
		format: format(".2f"),
		accessor: (d) => resolveSeriesValue(d, config),
	}),
});

export const registerDonchian = (): void => registerSeries("Donchian", {
	component: LineSeries,
	defaultParams: { period: 20, fillMode: "none", fillOpacity: 0.06 },
	defaultYAxis: "right",
	settingsFields: [
		{ key: "period", labelKey: "settings.period", type: "number", defaultValue: 20, min: 1, step: 1 },
		{ key: "fillMode", labelKey: "settings.fillMode", type: "select", defaultValue: "none", options: [
			{ value: "none", labelKey: "settings.fillMode.none" },
			{ value: "solid", labelKey: "settings.fillMode.solid" },
			{ value: "fade", labelKey: "settings.fillMode.fade" },
		]},
		{ key: "fillOpacity", labelKey: "settings.fillOpacity", type: "number", defaultValue: 0.06, min: 0, max: 1, step: 0.05 },
		{ key: "fillColor", labelKey: "settings.fillColor", type: "color", defaultValue: "" },
	],
	tooltipEntry: (config) => ({
		label: `Donchian(${periodFromConfig(config, 20)})`,
		format: format(".2f"),
		accessor: (d) => resolveSeriesValue(d, config),
	}),
});

export const registerChaikinVol = (): void => registerLineSeries("ChaikinVol", {
	component: LineSeries,
	defaultParams: { period: 10 },
	defaultYAxis: "left",
	settingsFields: [
		{ key: "period", labelKey: "settings.period", type: "number", defaultValue: 10, min: 1, step: 1 },
	],
	tooltipEntry: (config) => ({
		label: `ChaikinVol(${periodFromConfig(config, 10)})`,
		format: format(".1f"),
		accessor: (d) => resolveSeriesValue(d, config),
	}),
});

export const registerStdDev = (): void => registerLineSeries("StdDev", {
	component: LineSeries,
	defaultParams: { period: 20 },
	defaultYAxis: "left",
	settingsFields: [
		{ key: "period", labelKey: "settings.period", type: "number", defaultValue: 20, min: 1, step: 1 },
	],
	tooltipEntry: (config) => ({
		label: `StdDev(${periodFromConfig(config, 20)})`,
		format: format(".2f"),
		accessor: (d) => resolveSeriesValue(d, config),
	}),
});

export const registerHV = (): void => registerLineSeries("HV", {
	component: LineSeries,
	defaultParams: { period: 20, annualize: true },
	defaultYAxis: "left",
	settingsFields: [
		{ key: "period", labelKey: "settings.period", type: "number", defaultValue: 20, min: 1, step: 1 },
	],
	tooltipEntry: (config) => ({
		label: `HV(${periodFromConfig(config, 20)})`,
		format: format(".1f"),
		accessor: (d) => resolveSeriesValue(d, config),
	}),
});
