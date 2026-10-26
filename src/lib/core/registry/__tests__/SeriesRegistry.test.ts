import { beforeEach, describe, expect, it } from "vitest";
import type { SeriesTypeId } from "../../types/pane-descriptor";
import { getSeries, listRegistered } from "../SeriesRegistry";
import { initRegistry } from "../registerAll";
import { resolveSeriesValueAccessors } from "../../seriesValueResolver";

beforeEach(() => {
	initRegistry();
});

describe("SeriesRegistry", () => {
	it("getSeries('Candlestick') returns a valid entry", () => {
		const entry = getSeries("Candlestick");
		expect(entry.component).toBeDefined();
		expect(typeof entry.tooltipEntry).toBe("function");
	});

	it("getSeries with unknown type throws a clear error", () => {
		expect(() => getSeries("UnknownType" as SeriesTypeId)).toThrow(/unknown type/i);
	});

	it("listRegistered contains all phase 1 types", () => {
		const registered = listRegistered();
		const phaseOneTypes: SeriesTypeId[] = [
			"Candlestick",
			"Volume",
			"EMA",
			"BollingerBand",
			"RSI",
			"MACD",
			"CVDApprox",
			"StrengthElder",
			"Whale",
			"MA",
			"BBI",
			"SAR",
			"OBV",
			"WR",
			"VR",
			"KDJ",
			"CCI",
			"DMI",
			"BIAS",
			"BRAR",
			"MTM",
			"EMV",
			"AO",
			"ROC",
			"TRIX",
			"DMA",
			"PVT",
			"PSY",
			"CR",
		];

		phaseOneTypes.forEach((type) => {
			expect(registered).toContain(type);
		});
	});

	it("every registered entry can resolve non-empty series value accessors", () => {
		listRegistered().forEach((type) => {
			const accessors = resolveSeriesValueAccessors({ type, yAxis: "right" });
			expect(Array.isArray(accessors)).toBe(true);
			expect(accessors.length).toBeGreaterThan(0);
		});
	});

	it("indicator entries expose settings field metadata for the modal", () => {
		expect(getSeries("EMA").settingsFields).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ key: "period", labelKey: "settings.period" }),
			]),
		);
		expect(getSeries("BollingerBand").settingsFields).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ key: "period", labelKey: "settings.period" }),
				expect.objectContaining({ key: "stdDev", labelKey: "settings.stdDev" }),
			]),
		);
		expect(getSeries("MACD").settingsFields).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ key: "fast", labelKey: "settings.fast" }),
				expect.objectContaining({ key: "slow", labelKey: "settings.slow" }),
				expect.objectContaining({ key: "signal", labelKey: "settings.signal" }),
			]),
		);
		expect(getSeries("Whale").settingsFields).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ key: "threshold", labelKey: "settings.thresholdUsd" }),
			]),
		);
		expect(getSeries("KDJ").settingsFields).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ key: "period", labelKey: "settings.period" }),
				expect.objectContaining({ key: "m1", labelKey: "settings.m1" }),
				expect.objectContaining({ key: "m2", labelKey: "settings.m2" }),
			]),
		);
		expect(getSeries("DMA").settingsFields).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ key: "fastPeriod", labelKey: "settings.fastPeriod" }),
				expect.objectContaining({ key: "slowPeriod", labelKey: "settings.slowPeriod" }),
				expect.objectContaining({ key: "signalPeriod", labelKey: "settings.signalPeriod" }),
			]),
		);
		expect(getSeries("CR").settingsFields).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ key: "m1", labelKey: "settings.m1" }),
				expect.objectContaining({ key: "m4", labelKey: "settings.m4" }),
			]),
		);
	});
});
