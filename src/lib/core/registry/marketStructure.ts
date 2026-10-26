/**
 * Nhóm 7/8 — cấu trúc thị trường (pivot, fractal, sóng Wyckoff).
 */

import { format } from "d3-format";
import LineSeries from "../../series/LineSeries";
import { resolveSeriesValue } from "../seriesValueResolver";
import { registerLineSeries, registerSeries } from "./registryCore";

export const registerWyckoffWave = (): void => registerLineSeries("WyckoffWave", {
	component: LineSeries,
	defaultYAxis: "right",
	defaultParams: { thresholdPercent: 1 },
	settingsFields: [
		{ key: "thresholdPercent", labelKey: "settings.thresholdPercent", type: "number", defaultValue: 1, min: 0.1, step: 0.1 },
	],
	tooltipEntry: (config) => ({
		label: `Wyckoff(${config.params?.thresholdPercent ?? 1}%)`,
		format: format(".2f"),
		accessor: (d) => resolveSeriesValue(d, config),
	}),
});

export const registerFractals = (): void => registerSeries("Fractals", {
	component: LineSeries,
	defaultParams: {},
	defaultYAxis: "right",
	tooltipEntry: (config) => ({
		label: "Fractals",
		format: format(".2f"),
		accessor: (d) => resolveSeriesValue(d, config),
	}),
});

export const registerPivotStandard = (): void => registerSeries("PivotStandard", {
	component: LineSeries,
	defaultParams: { pivotType: 0 },
	defaultYAxis: "right",
	settingsFields: [
		{ key: "pivotType", labelKey: "settings.pivotType", type: "number", defaultValue: 0, min: 0, max: 4, step: 1 },
	],
	tooltipEntry: (config) => ({
		label: "Pivot Standard",
		format: format(".2f"),
		accessor: (d) => resolveSeriesValue(d, config),
	}),
});

export const registerPivotHighLow = (): void => registerSeries("PivotHighLow", {
	component: LineSeries,
	defaultParams: { lookback: 10, pivotType: 0 },
	defaultYAxis: "right",
	settingsFields: [
		{ key: "lookback", labelKey: "settings.lookback", type: "number", defaultValue: 10, min: 1, step: 1 },
		{ key: "pivotType", labelKey: "settings.pivotType", type: "number", defaultValue: 0, min: 0, max: 1, step: 1 },
	],
	tooltipEntry: (config) => ({
		label: "Pivot HL",
		format: format(".2f"),
		accessor: (d) => resolveSeriesValue(d, config),
	}),
});
