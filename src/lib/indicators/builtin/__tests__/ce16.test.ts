import { describe, expect, it } from "vitest";
import {
	aoColorSeries,
	aoSeries,
	biasSeries,
	brarSeries,
	cciSeries,
	crSeries,
	dmaSeries,
	dmiSeries,
	emvSeries,
	kdjSeries,
	mtmSeries,
	pvtSeries,
	psySeries,
	rocSeries,
	trixSeries,
	type PriceBar,
} from "../../utils";

function makeBar(close: number, high = close + 1, low = close - 1, volume = 1_000, open = close): PriceBar {
	return { open, close, high, low, volume };
}

function constantBars(length: number, close = 10): PriceBar[] {
	return Array.from({ length }, () => makeBar(close, close, close, 1_000, close));
}

describe("CE16 indicator compute helpers", () => {
	it("KDJ stays within the normal range on steady data", () => {
		const bars = Array.from({ length: 40 }, (_, index) => makeBar(10 + index, 11 + index, 9 + index, 1_000));
		const result = kdjSeries(bars);
		expect(result.k.length).toBe(40);
		expect(result.k.filter(Number.isFinite).every((value) => value >= 0 && value <= 100)).toBe(true);
	});

	it("CCI returns zero when price equals its moving average", () => {
		const result = cciSeries(constantBars(30), 20);
		expect(result[29]).toBe(0);
	});

	it("DMI keeps +DI and -DI within a sane ceiling", () => {
		const bars = Array.from({ length: 40 }, (_, index) => makeBar(20 + index, 21 + index, 19 + index, 1_000));
		const result = dmiSeries(bars);
		expect(result.plusDI.length).toBe(40);
		expect(result.minusDI.length).toBe(40);
		expect(result.plusDI.every((value, index) => !Number.isFinite(value) || value + (result.minusDI[index] ?? 0) <= 200)).toBe(true);
	});

	it("BIAS is zero on flat data", () => {
		expect(biasSeries(constantBars(20), 6)[19]).toBe(0);
	});

	it("BRAR produces finite output after warmup", () => {
		const bars = Array.from({ length: 50 }, (_, index) => makeBar(20 + index, 22 + index, 18 + index, 1_000, 19 + index));
		const result = brarSeries(bars);
		expect(Number.isFinite(result.ar[49] ?? NaN)).toBe(true);
		expect(Number.isFinite(result.br[49] ?? NaN)).toBe(true);
	});

	it("MTM yields a finite signal line", () => {
		const bars = Array.from({ length: 30 }, (_, index) => makeBar(20 + index, 21 + index, 19 + index, 1_000));
		const result = mtmSeries(bars);
		expect(result.mtm.length).toBe(30);
		expect(Number.isFinite(result.signal[29] ?? NaN)).toBe(true);
	});

	it("EMV yields a finite signal line", () => {
		const bars = Array.from({ length: 30 }, (_, index) => makeBar(20 + index, 22 + index, 18 + index, 1_000));
		const result = emvSeries(bars);
		expect(result.emv.length).toBe(30);
		expect(Number.isFinite(result.signal[29] ?? NaN)).toBe(true);
	});

	it("AO color switches with direction", () => {
		expect(aoColorSeries([1, 2, 1])).toEqual(["#089981", "#089981", "#f23645"]);
	});

	it("ROC is zero on flat data", () => {
		expect(rocSeries(constantBars(20), 12)[19]).toBe(0);
	});

	it("TRIX produces a finite signal line", () => {
		const bars = Array.from({ length: 60 }, (_, index) => makeBar(20 + index, 21 + index, 19 + index, 1_000));
		const result = trixSeries(bars);
		expect(result.trix.length).toBe(60);
		expect(Number.isFinite(result.signal[59] ?? NaN)).toBe(true);
	});

	it("DMA produces both lines", () => {
		const bars = Array.from({ length: 60 }, (_, index) => makeBar(30 + index, 31 + index, 29 + index, 1_000));
		const result = dmaSeries(bars);
		expect(result.ddd.length).toBe(60);
		expect(result.ama.length).toBe(60);
	});

	it("PVT is zero on flat data", () => {
		expect(pvtSeries(constantBars(10))[9]).toBe(0);
	});

	it("PSY returns a finite signal line", () => {
		const bars = Array.from({ length: 40 }, (_, index) => makeBar(20 + index, 21 + index, 19 + index, 1_000));
		const result = psySeries(bars);
		expect(result.psy.length).toBe(40);
		expect(Number.isFinite(result.signal[39] ?? NaN)).toBe(true);
	});

	it("CR is zero on flat data", () => {
		const result = crSeries(constantBars(60));
		expect(result.cr[59]).toBe(0);
	});
});