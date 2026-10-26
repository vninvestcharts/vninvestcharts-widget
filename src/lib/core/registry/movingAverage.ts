/**
 * Nhóm 2/8 — moving average và biến thể (SMA/EMA/WMA/HMA/DEMA/TEMA/VWMA, DMA,
 * BBI, ribbon).
 */

import { format } from "d3-format";
import LineSeries from "../../series/LineSeries";
import { resolveSeriesValue } from "../seriesValueResolver";
import { periodFromConfig, registerLineSeries, registerSeries } from "./registryCore";

export const registerEMA = (): void => registerLineSeries("EMA", {
	component: LineSeries,
	defaultParams: { period: 20 },
	settingsFields: [
		{ key: "period", labelKey: "settings.period", type: "number", defaultValue: 20, min: 1, step: 1 },
	],
	tooltipEntry: (config) => ({
		label: `EMA(${periodFromConfig(config, 20)})`,
		format: format(".2f"),
		accessor: (d) => resolveSeriesValue(d, config),
	}),
});

export const registerMA = (): void => registerLineSeries("MA", {
	component: LineSeries,
	defaultParams: { period: 20 },
	settingsFields: [
		{ key: "period", labelKey: "settings.period", type: "number", defaultValue: 20, min: 1, step: 1 },
	],
	tooltipEntry: (config) => ({
		label: `MA(${periodFromConfig(config, 20)})`,
		format: format(".2f"),
		accessor: (d) => resolveSeriesValue(d, config),
	}),
});

export const registerBBI = (): void => registerLineSeries("BBI", {
	component: LineSeries,
	defaultParams: {},
	defaultYAxis: "right",
	tooltipEntry: (config) => ({
		label: "BBI",
		format: format(".2f"),
		accessor: (d) => resolveSeriesValue(d, config),
	}),
});

export const registerWMA = (): void => registerLineSeries("WMA", {
	component: LineSeries,
	defaultParams: { period: 9 },
	defaultYAxis: "right",
	settingsFields: [
		{ key: "period", labelKey: "settings.period", type: "number", defaultValue: 9, min: 1, step: 1 },
	],
	tooltipEntry: (config) => ({
		label: `WMA(${periodFromConfig(config, 9)})`,
		format: format(".2f"),
		accessor: (d) => resolveSeriesValue(d, config),
	}),
});

export const registerVWMA = (): void => registerLineSeries("VWMA", {
	component: LineSeries,
	defaultParams: { period: 20 },
	defaultYAxis: "right",
	settingsFields: [
		{ key: "period", labelKey: "settings.period", type: "number", defaultValue: 20, min: 1, step: 1 },
	],
	tooltipEntry: (config) => ({
		label: `VWMA(${periodFromConfig(config, 20)})`,
		format: format(".2f"),
		accessor: (d) => resolveSeriesValue(d, config),
	}),
});

export const registerHMA = (): void => registerLineSeries("HMA", {
	component: LineSeries,
	defaultParams: { period: 9 },
	defaultYAxis: "right",
	settingsFields: [
		{ key: "period", labelKey: "settings.period", type: "number", defaultValue: 9, min: 1, step: 1 },
	],
	tooltipEntry: (config) => ({
		label: `HMA(${periodFromConfig(config, 9)})`,
		format: format(".2f"),
		accessor: (d) => resolveSeriesValue(d, config),
	}),
});

export const registerDEMA = (): void => registerLineSeries("DEMA", {
	component: LineSeries,
	defaultParams: { period: 9 },
	defaultYAxis: "right",
	settingsFields: [
		{ key: "period", labelKey: "settings.period", type: "number", defaultValue: 9, min: 1, step: 1 },
	],
	tooltipEntry: (config) => ({
		label: `DEMA(${periodFromConfig(config, 9)})`,
		format: format(".2f"),
		accessor: (d) => resolveSeriesValue(d, config),
	}),
});

export const registerTEMA = (): void => registerLineSeries("TEMA", {
	component: LineSeries,
	defaultParams: { period: 9 },
	defaultYAxis: "right",
	settingsFields: [
		{ key: "period", labelKey: "settings.period", type: "number", defaultValue: 9, min: 1, step: 1 },
	],
	tooltipEntry: (config) => ({
		label: `TEMA(${periodFromConfig(config, 9)})`,
		format: format(".2f"),
		accessor: (d) => resolveSeriesValue(d, config),
	}),
});

export const registerMARibbon = (): void => registerSeries("MARibbon", {
	component: LineSeries,
	defaultParams: { type: "EMA", periods: [5, 10, 15, 20, 25, 30, 35, 40, 45, 50] },
	defaultYAxis: "right",
	tooltipEntry: (config) => ({
		label: "MA Ribbon",
		format: format(".2f"),
		accessor: (d) => resolveSeriesValue(d, config),
	}),
});

export const registerDMA = (): void => registerLineSeries("DMA", {
	component: LineSeries,
	defaultParams: { fastPeriod: 10, slowPeriod: 50, signalPeriod: 10 },
	defaultYAxis: "right",
	settingsFields: [
		{ key: "fastPeriod", labelKey: "settings.fastPeriod", type: "number", defaultValue: 10, min: 1, step: 1 },
		{ key: "slowPeriod", labelKey: "settings.slowPeriod", type: "number", defaultValue: 50, min: 1, step: 1 },
		{ key: "signalPeriod", labelKey: "settings.signalPeriod", type: "number", defaultValue: 10, min: 1, step: 1 },
	],
	tooltipEntry: (config) => ({
		label: "DMA",
		format: format(".2f"),
		accessor: (d) => resolveSeriesValue(d, config),
	}),
});
