/**
 * Nhóm 6/8 — hệ thống xu hướng (SAR, DMI, Ichimoku, Supertrend, Alligator/Gator,
 * HTF overlay).
 */

import { format } from "d3-format";
import HTFOverlaySeries from "../../series/HTFOverlaySeries";
import LineSeries from "../../series/LineSeries";
import SARSeries from "../../series/SARSeries";
import { resolveSeriesValue } from "../seriesValueResolver";
import { periodFromConfig, registerLineSeries, registerSeries } from "./registryCore";

export const registerSAR = (): void => registerSeries("SAR", {
	component: SARSeries,
	defaultParams: { afStep: 0.02, afMax: 0.2 },
	defaultYAxis: "right",
	settingsFields: [
		{ key: "afStep", labelKey: "settings.afStep", type: "number", defaultValue: 0.02, min: 0.001, step: 0.001 },
		{ key: "afMax", labelKey: "settings.afMax", type: "number", defaultValue: 0.2, min: 0.01, step: 0.01 },
	],
	tooltipEntry: (config) => ({
		label: "SAR",
		format: format(".2f"),
		accessor: (d) => resolveSeriesValue(d, config),
	}),
});

export const registerDMI = (): void => registerLineSeries("DMI", {
	component: LineSeries,
	defaultParams: { period: 14 },
	defaultYAxis: "left",
	settingsFields: [
		{ key: "period", labelKey: "settings.period", type: "number", defaultValue: 14, min: 2, step: 1 },
	],
	tooltipEntry: (config) => ({
		label: `DMI(${periodFromConfig(config, 14)})`,
		format: format(".2f"),
		accessor: (d) => resolveSeriesValue(d, config),
	}),
});

export const registerIchimoku = (): void => registerSeries("Ichimoku", {
	component: LineSeries,
	defaultParams: { tenkan: 9, kijun: 26, senkouB: 52, displacement: 26, fillMode: "none", fillOpacity: 0.12 },
	defaultYAxis: "right",
	settingsFields: [
		{ key: "tenkan", labelKey: "settings.tenkan", type: "number", defaultValue: 9, min: 1, step: 1 },
		{ key: "kijun", labelKey: "settings.kijun", type: "number", defaultValue: 26, min: 1, step: 1 },
		{ key: "senkouB", labelKey: "settings.senkouB", type: "number", defaultValue: 52, min: 1, step: 1 },
		{ key: "displacement", labelKey: "settings.displacement", type: "number", defaultValue: 26, min: 0, step: 1 },
		{ key: "fillMode", labelKey: "settings.fillMode", type: "select", defaultValue: "none", options: [
			{ value: "none", labelKey: "settings.fillMode.none" },
			{ value: "solid", labelKey: "settings.fillMode.solid" },
			{ value: "fade", labelKey: "settings.fillMode.fade" },
		]},
		{ key: "fillOpacity", labelKey: "settings.fillOpacity", type: "number", defaultValue: 0.12, min: 0, max: 1, step: 0.05 },
		{ key: "fillColor", labelKey: "settings.fillColor", type: "color", defaultValue: "" },
	],
	tooltipEntry: (config) => ({
		label: "Ichimoku",
		format: format(".2f"),
		accessor: (d) => resolveSeriesValue(d, config),
	}),
});

export const registerSupertrend = (): void => registerSeries("Supertrend", {
	component: LineSeries,
	defaultParams: { period: 10, multiplier: 3, fillMode: "none", fillOpacity: 0.08 },
	defaultYAxis: "right",
	settingsFields: [
		{ key: "period", labelKey: "settings.period", type: "number", defaultValue: 10, min: 1, step: 1 },
		{ key: "multiplier", labelKey: "settings.multiplier", type: "number", defaultValue: 3, min: 1, step: 1 },
		{ key: "fillMode", labelKey: "settings.fillMode", type: "select", defaultValue: "none", options: [
			{ value: "none", labelKey: "settings.fillMode.none" },
			{ value: "solid", labelKey: "settings.fillMode.solid" },
			{ value: "fade", labelKey: "settings.fillMode.fade" },
		]},
		{ key: "fillOpacity", labelKey: "settings.fillOpacity", type: "number", defaultValue: 0.08, min: 0, max: 1, step: 0.05 },
		{ key: "fillColor", labelKey: "settings.fillColor", type: "color", defaultValue: "" },
	],
	tooltipEntry: (config) => ({
		label: `Supertrend(${periodFromConfig(config, 10)},${config.params?.multiplier ?? 3})`,
		format: format(".2f"),
		accessor: (d) => resolveSeriesValue(d, config),
	}),
});

export const registerAlligator = (): void => registerSeries("Alligator", {
	component: LineSeries,
	defaultParams: { jawPeriod: 13, jawShift: 8, teethPeriod: 8, teethShift: 5, lipsPeriod: 5, lipsShift: 3 },
	defaultYAxis: "right",
	settingsFields: [
		{ key: "jawPeriod", labelKey: "settings.jawPeriod", type: "number", defaultValue: 13, min: 1, step: 1 },
		{ key: "jawShift", labelKey: "settings.jawShift", type: "number", defaultValue: 8, min: 0, step: 1 },
		{ key: "teethPeriod", labelKey: "settings.teethPeriod", type: "number", defaultValue: 8, min: 1, step: 1 },
		{ key: "teethShift", labelKey: "settings.teethShift", type: "number", defaultValue: 5, min: 0, step: 1 },
		{ key: "lipsPeriod", labelKey: "settings.lipsPeriod", type: "number", defaultValue: 5, min: 1, step: 1 },
		{ key: "lipsShift", labelKey: "settings.lipsShift", type: "number", defaultValue: 3, min: 0, step: 1 },
	],
	tooltipEntry: (config) => ({
		label: "Alligator",
		format: format(".2f"),
		accessor: (d) => resolveSeriesValue(d, config),
	}),
});

export const registerGator = (): void => registerSeries("Gator", {
	component: LineSeries,
	defaultParams: { jawPeriod: 13, jawShift: 8, teethPeriod: 8, teethShift: 5, lipsPeriod: 5, lipsShift: 3 },
	defaultYAxis: "left",
	settingsFields: [
		{ key: "jawPeriod", labelKey: "settings.jawPeriod", type: "number", defaultValue: 13, min: 1, step: 1 },
		{ key: "jawShift", labelKey: "settings.jawShift", type: "number", defaultValue: 8, min: 0, step: 1 },
		{ key: "teethPeriod", labelKey: "settings.teethPeriod", type: "number", defaultValue: 8, min: 1, step: 1 },
		{ key: "teethShift", labelKey: "settings.teethShift", type: "number", defaultValue: 5, min: 0, step: 1 },
		{ key: "lipsPeriod", labelKey: "settings.lipsPeriod", type: "number", defaultValue: 5, min: 1, step: 1 },
		{ key: "lipsShift", labelKey: "settings.lipsShift", type: "number", defaultValue: 3, min: 0, step: 1 },
	],
	tooltipEntry: (config) => ({
		label: "Gator",
		format: format(".2f"),
		accessor: (d) => resolveSeriesValue(d, config),
	}),
});

export const registerHTFOverlay = (): void => registerSeries("HTFOverlay", {
	component: HTFOverlaySeries,
	defaultParams: { overlayStyle: "candle" },
	defaultYAxis: "right",
	tooltipEntry: (config) => ({
		label: `HTF(${config.params?.timeframe ?? ""})`,
		format: format(".2f"),
		accessor: (d: any) => d.htf?.close,
	}),
});
