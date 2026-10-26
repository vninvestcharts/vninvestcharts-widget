/**
 * Nhóm 4/8 — oscillator / momentum (RSI, MACD, CCI, KDJ, WR, ROC, TRIX, PSY, CR,
 * AC, BIAS, MTM, AO, CI, độ lệch tương đối).
 */

import { format } from "d3-format";
import BarSeries from "../../series/BarSeries";
import ElderRaySeries from "../../series/ElderRaySeries";
import LineSeries from "../../series/LineSeries";
import MACDSeries from "../../series/MACDSeries";
import RSISeries from "../../series/RSISeries";
import { resolveSeriesValue } from "../seriesValueResolver";
import { periodFromConfig, registerLineSeries, registerSeries } from "./registryCore";

export const registerRSI = (): void => registerSeries("RSI", {
	component: RSISeries,
	defaultParams: { period: 14 },
	defaultYAxis: "left",
	settingsFields: [
		{ key: "period", labelKey: "settings.period", type: "number", defaultValue: 14, min: 2, step: 1 },
	],
	tooltipEntry: (config) => ({
		label: `RSI(${periodFromConfig(config, 14)})`,
		format: format(".1f"),
		accessor: (d) => resolveSeriesValue(d, config),
	}),
});

export const registerMACD = (): void => registerSeries("MACD", {
	component: MACDSeries,
	defaultParams: { fast: 12, slow: 26, signal: 9 },
	defaultYAxis: "right",
	settingsFields: [
		{ key: "fast", labelKey: "settings.fast", type: "number", defaultValue: 12, min: 1, step: 1 },
		{ key: "slow", labelKey: "settings.slow", type: "number", defaultValue: 26, min: 1, step: 1 },
		{ key: "signal", labelKey: "settings.signal", type: "number", defaultValue: 9, min: 1, step: 1 },
	],
	tooltipEntry: (config) => ({
		label: "MACD",
		format: format(".2f"),
		accessor: (d) => resolveSeriesValue(d, config),
	}),
});

export const registerStrengthElder = (): void => registerSeries("StrengthElder", {
	component: ElderRaySeries,
	defaultParams: {},
	defaultYAxis: "right",
	tooltipEntry: (config) => ({
		label: "Strength",
		format: format(".2f"),
		accessor: (d) => resolveSeriesValue(d, config),
	}),
});

export const registerStrengthRelative = (): void => registerLineSeries("StrengthRelative", {
	component: LineSeries,
	defaultYAxis: "right",
	defaultParams: { compareSymbol: "VNINDEX", period: 14 },
	settingsFields: [
		{ key: "compareSymbol", labelKey: "settings.compareSymbol", type: "text", defaultValue: "VNINDEX" } as any,
		{ key: "period", labelKey: "settings.period", type: "number", defaultValue: 14, min: 1, step: 1 },
	],
	tooltipEntry: (config) => ({
		label: `RS(${config.params?.compareSymbol || "VNINDEX"},${periodFromConfig(config, 14)})`,
		format: format(".3f"),
		accessor: (d) => resolveSeriesValue(d, config),
	}),
});

export const registerWR = (): void => registerLineSeries("WR", {
	component: LineSeries,
	defaultParams: { period: 14 },
	defaultYAxis: "left",
	settingsFields: [
		{ key: "period", labelKey: "settings.period", type: "number", defaultValue: 14, min: 2, step: 1 },
	],
	tooltipEntry: (config) => ({
		label: `WR(${periodFromConfig(config, 14)})`,
		format: format(".1f"),
		accessor: (d) => resolveSeriesValue(d, config),
	}),
});

export const registerKDJ = (): void => registerLineSeries("KDJ", {
	component: LineSeries,
	defaultParams: { period: 9, m1: 3, m2: 3 },
	defaultYAxis: "left",
	settingsFields: [
		{ key: "period", labelKey: "settings.period", type: "number", defaultValue: 9, min: 2, step: 1 },
		{ key: "m1", labelKey: "settings.m1", type: "number", defaultValue: 3, min: 1, step: 1 },
		{ key: "m2", labelKey: "settings.m2", type: "number", defaultValue: 3, min: 1, step: 1 },
	],
	tooltipEntry: (config) => ({
		label: `KDJ(${periodFromConfig(config, 9)},${typeof config.params?.m1 === "number" ? config.params.m1 : 3},${typeof config.params?.m2 === "number" ? config.params.m2 : 3})`,
		format: format(".2f"),
		accessor: (d) => resolveSeriesValue(d, config),
	}),
});

export const registerCCI = (): void => registerLineSeries("CCI", {
	component: LineSeries,
	defaultParams: { period: 20 },
	defaultYAxis: "left",
	settingsFields: [
		{ key: "period", labelKey: "settings.period", type: "number", defaultValue: 20, min: 2, step: 1 },
	],
	tooltipEntry: (config) => ({
		label: `CCI(${periodFromConfig(config, 20)})`,
		format: format(".2f"),
		accessor: (d) => resolveSeriesValue(d, config),
	}),
});

export const registerBIAS = (): void => registerLineSeries("BIAS", {
	component: LineSeries,
	defaultParams: { period: 6 },
	defaultYAxis: "right",
	settingsFields: [
		{ key: "period", labelKey: "settings.period", type: "number", defaultValue: 6, min: 1, step: 1 },
	],
	tooltipEntry: (config) => ({
		label: `BIAS(${periodFromConfig(config, 6)})`,
		format: format(".2f"),
		accessor: (d) => resolveSeriesValue(d, config),
	}),
});

export const registerMTM = (): void => registerLineSeries("MTM", {
	component: LineSeries,
	defaultParams: { period: 6, signalPeriod: 6 },
	defaultYAxis: "right",
	settingsFields: [
		{ key: "period", labelKey: "settings.period", type: "number", defaultValue: 6, min: 1, step: 1 },
		{ key: "signalPeriod", labelKey: "settings.signalPeriod", type: "number", defaultValue: 6, min: 1, step: 1 },
	],
	tooltipEntry: (config) => ({
		label: `MTM(${periodFromConfig(config, 6)})`,
		format: format(".2f"),
		accessor: (d) => resolveSeriesValue(d, config),
	}),
});

export const registerAO = (): void => registerSeries("AO", {
	component: BarSeries,
	defaultParams: {},
	defaultYAxis: "right",
	tooltipEntry: (config) => ({
		label: "AO",
		format: format(".2f"),
		accessor: (d) => resolveSeriesValue(d, config),
	}),
});

export const registerROC = (): void => registerLineSeries("ROC", {
	component: LineSeries,
	defaultParams: { period: 12 },
	defaultYAxis: "right",
	settingsFields: [
		{ key: "period", labelKey: "settings.period", type: "number", defaultValue: 12, min: 1, step: 1 },
	],
	tooltipEntry: (config) => ({
		label: `ROC(${periodFromConfig(config, 12)})`,
		format: format(".2f"),
		accessor: (d) => resolveSeriesValue(d, config),
	}),
});

export const registerTRIX = (): void => registerLineSeries("TRIX", {
	component: LineSeries,
	defaultParams: { period: 12, signalPeriod: 9 },
	defaultYAxis: "right",
	settingsFields: [
		{ key: "period", labelKey: "settings.period", type: "number", defaultValue: 12, min: 1, step: 1 },
		{ key: "signalPeriod", labelKey: "settings.signalPeriod", type: "number", defaultValue: 9, min: 1, step: 1 },
	],
	tooltipEntry: (config) => ({
		label: `TRIX(${periodFromConfig(config, 12)})`,
		format: format(".2f"),
		accessor: (d) => resolveSeriesValue(d, config),
	}),
});

export const registerPSY = (): void => registerLineSeries("PSY", {
	component: LineSeries,
	defaultParams: { period: 12, signalPeriod: 6 },
	defaultYAxis: "left",
	settingsFields: [
		{ key: "period", labelKey: "settings.period", type: "number", defaultValue: 12, min: 1, step: 1 },
		{ key: "signalPeriod", labelKey: "settings.signalPeriod", type: "number", defaultValue: 6, min: 1, step: 1 },
	],
	tooltipEntry: (config) => ({
		label: `PSY(${periodFromConfig(config, 12)})`,
		format: format(".2f"),
		accessor: (d) => resolveSeriesValue(d, config),
	}),
});

export const registerCR = (): void => registerLineSeries("CR", {
	component: LineSeries,
	defaultParams: { period: 26, m1: 10, m2: 20, m3: 40, m4: 60 },
	defaultYAxis: "right",
	settingsFields: [
		{ key: "period", labelKey: "settings.period", type: "number", defaultValue: 26, min: 1, step: 1 },
		{ key: "m1", labelKey: "settings.m1", type: "number", defaultValue: 10, min: 1, step: 1 },
		{ key: "m2", labelKey: "settings.m2", type: "number", defaultValue: 20, min: 1, step: 1 },
		{ key: "m3", labelKey: "settings.m3", type: "number", defaultValue: 40, min: 1, step: 1 },
		{ key: "m4", labelKey: "settings.m4", type: "number", defaultValue: 60, min: 1, step: 1 },
	],
	tooltipEntry: (config) => ({
		label: `CR(${periodFromConfig(config, 26)})`,
		format: format(".2f"),
		accessor: (d) => resolveSeriesValue(d, config),
	}),
});

export const registerCI = (): void => registerLineSeries("CI", {
	component: LineSeries,
	defaultParams: { period: 14 },
	defaultYAxis: "left",
	settingsFields: [
		{ key: "period", labelKey: "settings.period", type: "number", defaultValue: 14, min: 2, step: 1 },
	],
	tooltipEntry: (config) => ({
		label: `CI(${periodFromConfig(config, 14)})`,
		format: format(".1f"),
		accessor: (d) => resolveSeriesValue(d, config),
	}),
});

export const registerAC = (): void => registerLineSeries("AC", {
	component: LineSeries,
	defaultParams: {},
	defaultYAxis: "left",
	tooltipEntry: (config) => ({
		label: "AC",
		format: format(".4f"),
		accessor: (d) => resolveSeriesValue(d, config),
	}),
});
