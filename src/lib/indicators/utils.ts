export function numericExtent(values: readonly number[]): [number, number] {
	const finiteValues = values.filter((value) => Number.isFinite(value));
	if (finiteValues.length === 0) {
		return [0, 1];
	}

	const minValue = Math.min(...finiteValues);
	const maxValue = Math.max(...finiteValues);
	if (minValue === maxValue) {
		return [minValue - 1, maxValue + 1];
	}
	return [minValue, maxValue];
}

export function collectNumbers(value: unknown, collected: number[] = []): number[] {
	if (Array.isArray(value)) {
		for (const item of value) {
			collectNumbers(item, collected);
		}
		return collected;
	}

	if (typeof value === "number" && Number.isFinite(value)) {
		collected.push(value);
		return collected;
	}

	if (value && typeof value === "object") {
		for (const item of Object.values(value as Record<string, unknown>)) {
			collectNumbers(item, collected);
		}
	}

	return collected;
}

export function emaSeries(values: readonly number[], period: number): number[] {
	if (values.length === 0) {
		return [];
	}

	const smoothing = 2 / (Math.max(period, 1) + 1);
	const series: number[] = [];
	let previousEma = values[0] ?? 0;

	for (let index = 0; index < values.length; index += 1) {
		const current = values[index] ?? previousEma;
		if (index === 0) {
			previousEma = current;
			series.push(current);
			continue;
		}

		previousEma = (current - previousEma) * smoothing + previousEma;
		series.push(previousEma);
	}

	return series;
}

export function smaSeries(values: readonly number[], period: number): number[] {
	if (values.length === 0) {
		return [];
	}

	const window = Math.max(period, 1);
	const series: number[] = [];
	let rollingSum = 0;

	for (let index = 0; index < values.length; index += 1) {
		rollingSum += values[index] ?? 0;
		if (index >= window) {
			rollingSum -= values[index - window] ?? 0;
		}

		const divisor = Math.min(index + 1, window);
		series.push(rollingSum / divisor);
	}

	return series;
}

// ── CE15/CE16 compute functions ───────────────────────────────────────────────

export interface PriceBar {
	open?: number;
	close: number;
	high: number;
	low: number;
	volume: number;
	date?: Date;
}

export interface KdjSeriesResult {
	k: number[];
	d: number[];
	j: number[];
}

export interface DmiSeriesResult {
	plusDI: number[];
	minusDI: number[];
	adx: number[];
}

export interface BrarSeriesResult {
	ar: number[];
	br: number[];
}

export interface MtmSeriesResult {
	mtm: number[];
	signal: number[];
}

export interface EmvSeriesResult {
	emv: number[];
	signal: number[];
}

export interface TrixSeriesResult {
	trix: number[];
	signal: number[];
}

export interface DmaSeriesResult {
	ddd: number[];
	ama: number[];
}

export interface PsySeriesResult {
	psy: number[];
	signal: number[];
}

export interface CrSeriesResult {
	cr: number[];
	ma1: number[];
	ma2: number[];
	ma3: number[];
	ma4: number[];
}

export function bbiSeries(bars: readonly PriceBar[]): number[] {
	const close = bars.map((b) => b.close);
	const ma3 = smaSeries(close, 3);
	const ma6 = smaSeries(close, 6);
	const ma12 = smaSeries(close, 12);
	const ma24 = smaSeries(close, 24);
	return close.map((_, i) => (ma3[i]! + ma6[i]! + ma12[i]! + ma24[i]!) / 4);
}

export function sarSeries(
	bars: readonly PriceBar[],
	afStep = 0.02,
	afMax = 0.2,
): number[] {
	if (bars.length < 2) {
		return bars.map(() => NaN);
	}

	const result: number[] = new Array(bars.length).fill(NaN) as number[];
	let isUpTrend = bars[1]!.close > bars[0]!.close;
	let af = afStep;
	let ep = isUpTrend ? bars[0]!.high : bars[0]!.low;
	let sar = isUpTrend ? bars[0]!.low : bars[0]!.high;

	result[0] = sar;

	for (let i = 1; i < bars.length; i++) {
		const bar = bars[i]!;
		const prevSar = sar;

		// Calculate new SAR
		sar = prevSar + af * (ep - prevSar);

		if (isUpTrend) {
			// SAR must be below prior two lows
			sar = Math.min(sar, bars[i - 1]!.low);
			if (i >= 2) sar = Math.min(sar, bars[i - 2]!.low);

			if (bar.low < sar) {
				// Trend reversal: down
				isUpTrend = false;
				sar = ep;
				ep = bar.low;
				af = afStep;
			} else {
				if (bar.high > ep) {
					ep = bar.high;
					af = Math.min(af + afStep, afMax);
				}
			}
		} else {
			// SAR must be above prior two highs
			sar = Math.max(sar, bars[i - 1]!.high);
			if (i >= 2) sar = Math.max(sar, bars[i - 2]!.high);

			if (bar.high > sar) {
				// Trend reversal: up
				isUpTrend = true;
				sar = ep;
				ep = bar.high;
				af = afStep;
			} else {
				if (bar.low < ep) {
					ep = bar.low;
					af = Math.min(af + afStep, afMax);
				}
			}
		}

		result[i] = sar;
	}

	return result;
}

export function obvSeries(bars: readonly PriceBar[]): number[] {
	const result: number[] = [0];
	for (let i = 1; i < bars.length; i++) {
		const delta =
			bars[i]!.close > bars[i - 1]!.close
				? bars[i]!.volume
				: bars[i]!.close < bars[i - 1]!.close
					? -bars[i]!.volume
					: 0;
		result.push(result[i - 1]! + delta);
	}
	return result;
}

export function wrSeries(bars: readonly PriceBar[], period = 14): number[] {
	return bars.map((_, i) => {
		if (i < period - 1) return NaN;
		const slice = bars.slice(i - period + 1, i + 1);
		const hh = Math.max(...slice.map((b) => b.high));
		const ll = Math.min(...slice.map((b) => b.low));
		if (hh === ll) return -50;
		return ((hh - bars[i]!.close) / (hh - ll)) * -100;
	});
}

export function vrSeries(bars: readonly PriceBar[], period = 26): number[] {
	return bars.map((_, i) => {
		if (i < period) return NaN;
		const slice = bars.slice(i - period + 1, i + 1);
		let up = 0, down = 0, flat = 0;
		for (let j = 1; j < slice.length; j++) {
			if (slice[j]!.close > slice[j - 1]!.close) up += slice[j]!.volume;
			else if (slice[j]!.close < slice[j - 1]!.close) down += slice[j]!.volume;
			else flat += slice[j]!.volume;
		}
		const denom = down + flat * 0.5;
		if (denom === 0) return 100;
		return ((up + flat * 0.5) / denom) * 100;
	});
}

function isFiniteNumber(value: number): boolean {
	return Number.isFinite(value);
}

export function emaSeriesSkipNaN(values: readonly number[], period: number): number[] {
	if (values.length === 0) {
		return [];
	}

	const smoothing = 2 / (Math.max(period, 1) + 1);
	const series: number[] = new Array(values.length).fill(NaN) as number[];
	let previousEma: number | undefined;

	for (let index = 0; index < values.length; index += 1) {
		const current = values[index] ?? NaN;
		if (!isFiniteNumber(current)) {
			if (previousEma !== undefined) {
				series[index] = previousEma;
			}
			continue;
		}

		if (previousEma === undefined) {
			previousEma = current;
		} else {
			previousEma = (current - previousEma) * smoothing + previousEma;
		}
		series[index] = previousEma;
	}

	return series;
}

export function smaSeriesSkipNaN(values: readonly number[], period: number): number[] {
	if (values.length === 0) {
		return [];
	}

	const window = Math.max(period, 1);
	const series: number[] = new Array(values.length).fill(NaN) as number[];
	const queue: number[] = [];
	let rollingSum = 0;
	let finiteCount = 0;

	for (let index = 0; index < values.length; index += 1) {
		const current = values[index] ?? NaN;
		queue.push(current);
		if (isFiniteNumber(current)) {
			rollingSum += current;
			finiteCount += 1;
		}

		if (queue.length > window) {
			const removed = queue.shift() ?? NaN;
			if (isFiniteNumber(removed)) {
				rollingSum -= removed;
				finiteCount -= 1;
			}
		}

		if (queue.length === window && finiteCount === window) {
			series[index] = rollingSum / window;
		}
	}

	return series;
}

export function wilderSeries(values: readonly number[], period: number): number[] {
	if (values.length === 0) {
		return [];
	}

	const window = Math.max(period, 1);
	const series: number[] = new Array(values.length).fill(NaN) as number[];
	if (values.length < window) {
		return series;
	}

	let rollingSum = 0;
	for (let index = 0; index < window; index += 1) {
		rollingSum += values[index] ?? 0;
	}

	let previous = rollingSum / window;
	series[window - 1] = previous;

	for (let index = window; index < values.length; index += 1) {
		const current = values[index] ?? 0;
		previous = previous + ((current - previous) / window);
		series[index] = previous;
	}

	return series;
}

export function wilderSeriesSkipNaN(values: readonly number[], period: number): number[] {
	if (values.length === 0) {
		return [];
	}

	const window = Math.max(period, 1);
	const series: number[] = new Array(values.length).fill(NaN) as number[];
	let previous: number | undefined;

	for (let index = 0; index < values.length; index += 1) {
		const current = values[index] ?? NaN;
		if (!isFiniteNumber(current)) {
			if (previous !== undefined) {
				series[index] = previous;
			}
			continue;
		}

		if (previous === undefined) {
			previous = current;
		} else {
			previous = previous + ((current - previous) / window);
		}
		series[index] = previous;
	}

	return series;
}

function midpointSeries(bars: readonly PriceBar[]): number[] {
	return bars.map((bar) => (bar.high + bar.low) / 2);
}

function typicalPriceSeries(bars: readonly PriceBar[]): number[] {
	return bars.map((bar) => (bar.high + bar.low + bar.close) / 3);
}

function meanAbsoluteDeviationSeries(values: readonly number[], period: number): number[] {
	if (values.length === 0) {
		return [];
	}

	const window = Math.max(period, 1);
	const series: number[] = new Array(values.length).fill(NaN) as number[];
	for (let index = window - 1; index < values.length; index += 1) {
		const slice = values.slice(index - window + 1, index + 1);
		const mean = slice.reduce((sum, value) => sum + (value ?? 0), 0) / slice.length;
		const deviation = slice.reduce((sum, value) => sum + Math.abs((value ?? 0) - mean), 0) / slice.length;
		series[index] = deviation;
	}

	return series;
}

function risingVolumeColor(values: readonly number[], index: number): string | undefined {
	const current = values[index];
	if (!isFiniteNumber(current)) {
		return undefined;
	}
	const previous = values[index - 1];
	if (!isFiniteNumber(previous)) {
		return "#089981";
	}
	return current >= previous ? "#089981" : "#f23645";
}

export function aoColorSeries(values: readonly number[]): Array<string | undefined> {
	return values.map((_, index) => risingVolumeColor(values, index));
}

export function kdjSeries(bars: readonly PriceBar[], period = 9, m1 = 3, m2 = 3): KdjSeriesResult {
	const rsv: number[] = new Array(bars.length).fill(NaN) as number[];
	for (let index = Math.max(period - 1, 0); index < bars.length; index += 1) {
		const slice = bars.slice(index - period + 1, index + 1);
		const highestHigh = Math.max(...slice.map((bar) => bar.high));
		const lowestLow = Math.min(...slice.map((bar) => bar.low));
		const range = highestHigh - lowestLow;
		if (range === 0) {
			rsv[index] = 50;
			continue;
		}
		rsv[index] = ((bars[index]!.close - lowestLow) / range) * 100;
	}

	const k = emaSeriesSkipNaN(rsv, m1);
	const d = emaSeriesSkipNaN(k, m2);
	const j = k.map((value, index) => {
		const dValue = d[index];
		if (!isFiniteNumber(value) || !isFiniteNumber(dValue)) {
			return NaN;
		}
		return (3 * value) - (2 * dValue);
	});

	return { k, d, j };
}

export function cciSeries(bars: readonly PriceBar[], period = 20): number[] {
	const tp = typicalPriceSeries(bars);
	const sma = smaSeries(tp, period);
	const mad = meanAbsoluteDeviationSeries(tp, period);
	return tp.map((value, index) => {
		if (index < Math.max(period - 1, 0)) {
			return NaN;
		}
		const meanDeviation = mad[index];
		const average = sma[index];
		if (!isFiniteNumber(meanDeviation) || meanDeviation === 0 || !isFiniteNumber(average)) {
			return 0;
		}
		return (value - average) / (0.015 * meanDeviation);
	});
}

export function dmiSeries(bars: readonly PriceBar[], period = 14): DmiSeriesResult {
	if (bars.length === 0) {
		return { plusDI: [], minusDI: [], adx: [] };
	}

	const tr: number[] = new Array(bars.length).fill(NaN) as number[];
	const plusDm: number[] = new Array(bars.length).fill(NaN) as number[];
	const minusDm: number[] = new Array(bars.length).fill(NaN) as number[];
	tr[0] = bars[0]!.high - bars[0]!.low;
	plusDm[0] = 0;
	minusDm[0] = 0;

	for (let index = 1; index < bars.length; index += 1) {
		const current = bars[index]!;
		const previous = bars[index - 1]!;
		const upMove = current.high - previous.high;
		const downMove = previous.low - current.low;
		plusDm[index] = upMove > downMove && upMove > 0 ? upMove : 0;
		minusDm[index] = downMove > upMove && downMove > 0 ? downMove : 0;
		tr[index] = Math.max(
			current.high - current.low,
			Math.abs(current.high - previous.close),
			Math.abs(current.low - previous.close),
		);
	}

	const smoothTr = wilderSeries(tr, period);
	const smoothPlus = wilderSeries(plusDm, period);
	const smoothMinus = wilderSeries(minusDm, period);

	const plusDI = smoothTr.map((value, index) => {
		if (!isFiniteNumber(value) || value === 0) {
			return NaN;
		}
		return ((smoothPlus[index] ?? 0) / value) * 100;
	});
	const minusDI = smoothTr.map((value, index) => {
		if (!isFiniteNumber(value) || value === 0) {
			return NaN;
		}
		return ((smoothMinus[index] ?? 0) / value) * 100;
	});
	const dx = plusDI.map((plus, index) => {
		const minus = minusDI[index];
		if (!isFiniteNumber(plus) || !isFiniteNumber(minus)) {
			return NaN;
		}
		const denominator = plus + minus;
		if (denominator === 0) {
			return 0;
		}
		return (Math.abs(plus - minus) / denominator) * 100;
	});
	const adx = wilderSeriesSkipNaN(dx, period);

	return { plusDI, minusDI, adx };
}

export function biasSeries(bars: readonly PriceBar[], period = 6): number[] {
	const closes = bars.map((bar) => bar.close);
	const movingAverage = smaSeries(closes, period);
	return closes.map((value, index) => {
		const average = movingAverage[index];
		if (!isFiniteNumber(average) || average === 0) {
			return NaN;
		}
		return ((value - average) / average) * 100;
	});
}

export function brarSeries(bars: readonly PriceBar[], period = 26): BrarSeriesResult {
	if (bars.length === 0) {
		return { ar: [], br: [] };
	}

	const ar: number[] = new Array(bars.length).fill(NaN) as number[];
	const br: number[] = new Array(bars.length).fill(NaN) as number[];

	for (let index = period; index < bars.length; index += 1) {
		let arNumerator = 0;
		let arDenominator = 0;
		let brNumerator = 0;
		let brDenominator = 0;

		for (let offset = 0; offset < period; offset += 1) {
			const currentIndex = index - period + 1 + offset;
			const current = bars[currentIndex]!;
			const open = current.open ?? current.close;
			const previous = bars[currentIndex - 1]!;
			arNumerator += Math.max(current.high - open, 0);
			arDenominator += Math.max(open - current.low, 0);
			brNumerator += Math.max(current.high - previous.close, 0);
			brDenominator += Math.max(previous.close - current.low, 0);
		}

		ar[index] = arDenominator === 0 ? 0 : (arNumerator / arDenominator) * 100;
		br[index] = brDenominator === 0 ? 0 : (brNumerator / brDenominator) * 100;
	}

	return { ar, br };
}

export function mtmSeries(bars: readonly PriceBar[], period = 6, signalPeriod = 6): MtmSeriesResult {
	const closes = bars.map((bar) => bar.close);
	const mtm: number[] = new Array(bars.length).fill(NaN) as number[];
	for (let index = period; index < closes.length; index += 1) {
		mtm[index] = closes[index]! - closes[index - period]!;
	}
	return {
		mtm,
		signal: smaSeriesSkipNaN(mtm, signalPeriod),
	};
}

export function emvSeries(bars: readonly PriceBar[], period = 14): EmvSeriesResult {
	if (bars.length === 0) {
		return { emv: [], signal: [] };
	}

	const emv: number[] = new Array(bars.length).fill(NaN) as number[];
	for (let index = 1; index < bars.length; index += 1) {
		const current = bars[index]!;
		const previous = bars[index - 1]!;
		const currentMid = (current.high + current.low) / 2;
		const previousMid = (previous.high + previous.low) / 2;
		const range = current.high - current.low;
		if (range === 0 || current.volume === 0) {
			emv[index] = 0;
			continue;
		}
		const boxRatio = current.volume / range;
		emv[index] = (currentMid - previousMid) / boxRatio;
	}

	return {
		emv,
		signal: smaSeriesSkipNaN(emv, period),
	};
}

export function aoSeries(bars: readonly PriceBar[]): number[] {
	const midpoints = midpointSeries(bars);
	const sma5 = smaSeries(midpoints, 5);
	const sma34 = smaSeries(midpoints, 34);
	return midpoints.map((_, index) => (sma5[index] ?? 0) - (sma34[index] ?? 0));
}

export function rocSeries(bars: readonly PriceBar[], period = 12): number[] {
	const closes = bars.map((bar) => bar.close);
	const result: number[] = new Array(closes.length).fill(NaN) as number[];
	for (let index = period; index < closes.length; index += 1) {
		const previous = closes[index - period]!;
		result[index] = previous === 0 ? 0 : ((closes[index]! - previous) / previous) * 100;
	}
	return result;
}

export function trixSeries(bars: readonly PriceBar[], period = 12, signalPeriod = 9): TrixSeriesResult {
	const closes = bars.map((bar) => bar.close);
	const ema1 = emaSeries(closes, period);
	const ema2 = emaSeries(ema1, period);
	const ema3 = emaSeries(ema2, period);
	const trix: number[] = new Array(closes.length).fill(NaN) as number[];
	for (let index = 1; index < ema3.length; index += 1) {
		const previous = ema3[index - 1];
		const current = ema3[index];
		if (!isFiniteNumber(previous) || !isFiniteNumber(current) || previous === 0) {
			continue;
		}
		trix[index] = ((current - previous) / previous) * 100;
	}
	return {
		trix,
		signal: emaSeriesSkipNaN(trix, signalPeriod),
	};
}

export function dmaSeries(bars: readonly PriceBar[], fastPeriod = 10, slowPeriod = 50, signalPeriod = 10): DmaSeriesResult {
	const closes = bars.map((bar) => bar.close);
	const fast = smaSeries(closes, fastPeriod);
	const slow = smaSeries(closes, slowPeriod);
	const ddd = closes.map((_, index) => (fast[index] ?? 0) - (slow[index] ?? 0));
	return {
		ddd,
		ama: smaSeriesSkipNaN(ddd, signalPeriod),
	};
}

export function pvtSeries(bars: readonly PriceBar[]): number[] {
	if (bars.length === 0) {
		return [];
	}

	const result: number[] = new Array(bars.length).fill(NaN) as number[];
	result[0] = 0;
	let cumulative = 0;
	for (let index = 1; index < bars.length; index += 1) {
		const previous = bars[index - 1]!.close;
		const current = bars[index]!;
		const change = previous === 0 ? 0 : (current.volume * (current.close - previous)) / previous;
		cumulative += change;
		result[index] = cumulative;
	}
	return result;
}

export function psySeries(bars: readonly PriceBar[], period = 12, signalPeriod = 6): PsySeriesResult {
	const closes = bars.map((bar) => bar.close);
	const psy: number[] = new Array(closes.length).fill(NaN) as number[];
	for (let index = period; index < closes.length; index += 1) {
		const slice = closes.slice(index - period + 1, index + 1);
		let upCount = 0;
		for (let offset = 1; offset < slice.length; offset += 1) {
			if (slice[offset]! > slice[offset - 1]!) {
				upCount += 1;
			}
		}
		psy[index] = (upCount / period) * 100;
	}

	return {
		psy,
		signal: smaSeriesSkipNaN(psy, signalPeriod),
	};
}

export function crSeries(bars: readonly PriceBar[], period = 26, m1 = 10, m2 = 20, m3 = 40, m4 = 60): CrSeriesResult {
	const cr: number[] = new Array(bars.length).fill(NaN) as number[];
	for (let index = period; index < bars.length; index += 1) {
		let numerator = 0;
		let denominator = 0;
		for (let offset = 0; offset < period; offset += 1) {
			const currentIndex = index - period + 1 + offset;
			const current = bars[currentIndex]!;
			const previous = bars[currentIndex - 1]!;
			const hm = (current.high + previous.high + previous.low + previous.close) / 4;
			numerator += Math.max(current.high - hm, 0);
			denominator += Math.max(hm - current.low, 0);
		}
		cr[index] = denominator === 0 ? 0 : (numerator / denominator) * 100;
	}

	return {
		cr,
		ma1: smaSeriesSkipNaN(cr, m1),
		ma2: smaSeriesSkipNaN(cr, m2),
		ma3: smaSeriesSkipNaN(cr, m3),
		ma4: smaSeriesSkipNaN(cr, m4),
	};
}

export function rsiSeries(values: readonly number[], period: number): number[] {
	if (values.length === 0) {
		return [];
	}

	const window = Math.max(period, 1);
	const series: number[] = [50];
	let averageGain = 0;
	let averageLoss = 0;

	for (let index = 1; index < values.length; index += 1) {
		const change = (values[index] ?? 0) - (values[index - 1] ?? 0);
		const gain = Math.max(change, 0);
		const loss = Math.max(-change, 0);

		if (index <= window) {
			averageGain += gain;
			averageLoss += loss;
			const divisor = Math.min(index, window);
			const gainAverage = averageGain / divisor;
			const lossAverage = averageLoss / divisor;
			const relativeStrength = lossAverage === 0 ? Number.POSITIVE_INFINITY : gainAverage / lossAverage;
			series.push(100 - (100 / (1 + relativeStrength)));
			continue;
		}

		averageGain = ((averageGain * (window - 1)) + gain) / window;
		averageLoss = ((averageLoss * (window - 1)) + loss) / window;
		const relativeStrength = averageLoss === 0 ? Number.POSITIVE_INFINITY : averageGain / averageLoss;
		series.push(100 - (100 / (1 + relativeStrength)));
	}

	return series;
}

export interface MacdSeriesResult {
	macd: number[];
	signal: number[];
	histogram: number[];
}

export function macdSeries(values: readonly number[], fastPeriod: number, slowPeriod: number, signalPeriod: number): MacdSeriesResult {
	const fastEma = emaSeries(values, fastPeriod);
	const slowEma = emaSeries(values, slowPeriod);
	const macd = values.map((_, index) => (fastEma[index] ?? 0) - (slowEma[index] ?? 0));
	const signal = emaSeries(macd, signalPeriod);
	const histogram = macd.map((value, index) => value - (signal[index] ?? 0));

	return { macd, signal, histogram };
}

export interface BollingerSeriesResult {
	upper: number[];
	middle: number[];
	lower: number[];
}

function rollingStandardDeviation(values: readonly number[], period: number): number[] {
	if (values.length === 0) {
		return [];
	}

	const window = Math.max(period, 1);
	const series: number[] = [];

	for (let index = 0; index < values.length; index += 1) {
		const startIndex = Math.max(0, index - window + 1);
		const slice = values.slice(startIndex, index + 1);
		const mean = slice.reduce((sum, value) => sum + (value ?? 0), 0) / slice.length;
		const variance = slice.reduce((sum, value) => {
			const delta = (value ?? 0) - mean;
			return sum + (delta * delta);
		}, 0) / slice.length;
		series.push(Math.sqrt(variance));
	}

	return series;
}

export function bollingerSeries(values: readonly number[], period: number, multiplier: number): BollingerSeriesResult {
	const middle = smaSeries(values, period);
	const deviation = rollingStandardDeviation(values, period);
	const upper = middle.map((value, index) => value + ((deviation[index] ?? 0) * multiplier));
	const lower = middle.map((value, index) => value - ((deviation[index] ?? 0) * multiplier));

	return { upper, middle, lower };
}

// ── CE26 additions ────────────────────────────────────────────────────────────

export function trueRangeSeries(bars: readonly PriceBar[]): number[] {
	if (bars.length === 0) {
		return [];
	}
	const tr: number[] = new Array(bars.length).fill(NaN) as number[];
	tr[0] = (bars[0].high ?? 0) - (bars[0].low ?? 0);
	for (let i = 1; i < bars.length; i++) {
		const high = bars[i].high ?? 0;
		const low = bars[i].low ?? 0;
		const prevClose = bars[i - 1].close ?? 0;
		tr[i] = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
	}
	return tr;
}

export function atrSeries(bars: readonly PriceBar[], period: number): number[] {
	const tr = trueRangeSeries(bars);
	return wilderSeries(tr, period);
}

export function wmaSeries(values: readonly number[], period: number): number[] {
	if (values.length === 0) {
		return [];
	}
	const window = Math.max(period, 1);
	const series: number[] = new Array(values.length).fill(NaN) as number[];
	const weightSum = (window * (window + 1)) / 2;

	for (let i = window - 1; i < values.length; i++) {
		let sum = 0;
		for (let j = 0; j < window; j++) {
			sum += (values[i - j] ?? 0) * (window - j);
		}
		series[i] = sum / weightSum;
	}
	return series;
}

export function vwmaSeries(bars: readonly PriceBar[], period: number): number[] {
	if (bars.length === 0) {
		return [];
	}
	const window = Math.max(period, 1);
	const series: number[] = new Array(bars.length).fill(NaN) as number[];

	for (let i = window - 1; i < bars.length; i++) {
		let closeVolumeSum = 0;
		let volumeSum = 0;
		for (let j = 0; j < window; j++) {
			const bar = bars[i - j];
			const close = bar.close ?? 0;
			const vol = bar.volume ?? 0;
			closeVolumeSum += close * vol;
			volumeSum += vol;
		}
		series[i] = volumeSum > 0 ? closeVolumeSum / volumeSum : NaN;
	}
	return series;
}

export function hmaSeries(values: readonly number[], period: number): number[] {
	if (values.length === 0) {
		return [];
	}
	const halfPeriod = Math.floor(period / 2);
	const sqrtPeriod = Math.floor(Math.sqrt(period));

	const wmaHalf = wmaSeries(values, halfPeriod);
	const wmaFull = wmaSeries(values, period);

	const raw: number[] = new Array(values.length).fill(NaN) as number[];
	for (let i = 0; i < values.length; i++) {
		const wh = wmaHalf[i];
		const wf = wmaFull[i];
		if (wh !== undefined && wf !== undefined && !isNaN(wh) && !isNaN(wf)) {
			raw[i] = 2 * wh - wf;
		}
	}

	return wmaSeries(raw, sqrtPeriod);
}

export function demaSeries(values: readonly number[], period: number): number[] {
	if (values.length === 0) {
		return [];
	}
	const ema1 = emaSeries(values, period);
	const ema2 = emaSeries(ema1, period);
	const series: number[] = new Array(values.length).fill(NaN) as number[];
	for (let i = 0; i < values.length; i++) {
		const val1 = ema1[i];
		const val2 = ema2[i];
		if (val1 !== undefined && val2 !== undefined) {
			series[i] = 2 * val1 - val2;
		}
	}
	return series;
}

export function temaSeries(values: readonly number[], period: number): number[] {
	if (values.length === 0) {
		return [];
	}
	const ema1 = emaSeries(values, period);
	const ema2 = emaSeries(ema1, period);
	const ema3 = emaSeries(ema2, period);
	const series: number[] = new Array(values.length).fill(NaN) as number[];
	for (let i = 0; i < values.length; i++) {
		const val1 = ema1[i];
		const val2 = ema2[i];
		const val3 = ema3[i];
		if (val1 !== undefined && val2 !== undefined && val3 !== undefined) {
			series[i] = 3 * val1 - 3 * val2 + val3;
		}
	}
	return series;
}

export interface MARibbonSeriesResult {
	[key: string]: number[];
}

export function maRibbonSeries(
	values: readonly number[],
	type: "SMA" | "EMA" = "EMA",
	periods: readonly number[] = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50],
): MARibbonSeriesResult {
	const result: MARibbonSeriesResult = {};
	for (const p of periods) {
		const series = type === "SMA" ? smaSeries(values, p) : emaSeries(values, p);
		result[`ma${p}`] = series;
	}
	return result;
}

export interface IchimokuSeriesResult {
	tenkan: number[];
	kijun: number[];
	senkouA: number[];
	senkouB: number[];
	chikou: number[];
}

export function ichimokuSeries(
	bars: readonly PriceBar[],
	tenkanPeriod = 9,
	kijunPeriod = 26,
	senkouBPeriod = 52,
	displacement = 26,
): IchimokuSeriesResult {
	const len = bars.length;
	const tenkan: number[] = new Array(len).fill(NaN) as number[];
	const kijun: number[] = new Array(len).fill(NaN) as number[];
	const senkouA: number[] = new Array(len).fill(NaN) as number[];
	const senkouB: number[] = new Array(len).fill(NaN) as number[];
	const chikou: number[] = new Array(len).fill(NaN) as number[];

	const highs = bars.map((b) => b.high ?? 0);
	const lows = bars.map((b) => b.low ?? 0);
	const closes = bars.map((b) => b.close);

	const highest = (values: readonly number[], period: number) => {
		const res: number[] = new Array(len).fill(NaN) as number[];
		for (let i = period - 1; i < len; i++) {
			let max = values[i];
			for (let j = 1; j < period; j++) {
				if (values[i - j] > max) {
					max = values[i - j];
				}
			}
			res[i] = max;
		}
		return res;
	};

	const lowest = (values: readonly number[], period: number) => {
		const res: number[] = new Array(len).fill(NaN) as number[];
		for (let i = period - 1; i < len; i++) {
			let min = values[i];
			for (let j = 1; j < period; j++) {
				if (values[i - j] < min) {
					min = values[i - j];
				}
			}
			res[i] = min;
		}
		return res;
	};

	const highTenkan = highest(highs, tenkanPeriod);
	const lowTenkan = lowest(lows, tenkanPeriod);
	const highKijun = highest(highs, kijunPeriod);
	const lowKijun = lowest(lows, kijunPeriod);
	const highSenkouB = highest(highs, senkouBPeriod);
	const lowSenkouB = lowest(lows, senkouBPeriod);

	for (let i = 0; i < len; i++) {
		tenkan[i] = (highTenkan[i]! + lowTenkan[i]!) / 2;
		kijun[i] = (highKijun[i]! + lowKijun[i]!) / 2;
	}

	for (let i = 0; i < len; i++) {
		const sourceIdx = i - displacement;
		if (sourceIdx >= 0) {
			const tVal = tenkan[sourceIdx];
			const kVal = kijun[sourceIdx];
			if (!isNaN(tVal) && !isNaN(kVal)) {
				senkouA[i] = (tVal + kVal) / 2;
			}
			const bHigh = highSenkouB[sourceIdx];
			const bLow = lowSenkouB[sourceIdx];
			if (!isNaN(bHigh) && !isNaN(bLow)) {
				senkouB[i] = (bHigh + bLow) / 2;
			}
		}

		const targetIdx = i + displacement;
		if (targetIdx < len) {
			chikou[i] = closes[targetIdx];
		}
	}

	return { tenkan, kijun, senkouA, senkouB, chikou };
}

export interface SupertrendSeriesResult {
	supertrend: number[];
	direction: number[];
	upperBand: number[];
	lowerBand: number[];
}

export function supertrendSeries(
	bars: readonly PriceBar[],
	period = 10,
	multiplier = 3,
): SupertrendSeriesResult {
	const len = bars.length;
	const supertrend: number[] = new Array(len).fill(NaN) as number[];
	const direction: number[] = new Array(len).fill(NaN) as number[];
	const upperBand: number[] = new Array(len).fill(NaN) as number[];
	const lowerBand: number[] = new Array(len).fill(NaN) as number[];

	if (len === 0) {
		return { supertrend, direction, upperBand, lowerBand };
	}

	const atr = atrSeries(bars, period);
	const closes = bars.map((b) => b.close);

	let prevTrend = 1;
	let prevUpper = 0;
	let prevLower = 0;

	for (let i = 0; i < len; i++) {
		const bar = bars[i];
		const high = bar.high ?? 0;
		const low = bar.low ?? 0;
		const close = bar.close ?? 0;
		const hl2 = (high + low) / 2;
		const currentAtr = atr[i];

		if (currentAtr === undefined || isNaN(currentAtr)) {
			continue;
		}

		const basicUpper = hl2 + multiplier * currentAtr;
		const basicLower = hl2 - multiplier * currentAtr;

		if (i === 0) {
			upperBand[i] = basicUpper;
			lowerBand[i] = basicLower;
			direction[i] = 1;
			supertrend[i] = basicLower;
			prevUpper = basicUpper;
			prevLower = basicLower;
			continue;
		}

		const prevClose = closes[i - 1] ?? 0;

		const currentUpper = (basicUpper < prevUpper || prevClose > prevUpper) ? basicUpper : prevUpper;
		const currentLower = (basicLower > prevLower || prevClose < prevLower) ? basicLower : prevLower;

		upperBand[i] = currentUpper;
		lowerBand[i] = currentLower;

		let currentTrend = prevTrend;
		if (close > currentUpper) {
			currentTrend = 1;
		} else if (close < currentLower) {
			currentTrend = -1;
		}

		direction[i] = currentTrend;
		supertrend[i] = currentTrend === 1 ? currentLower : currentUpper;

		prevTrend = currentTrend;
		prevUpper = currentUpper;
		prevLower = currentLower;
	}

	return { supertrend, direction, upperBand, lowerBand };
}

export interface KeltnerSeriesResult {
	upper: number[];
	middle: number[];
	lower: number[];
}

export function keltnerSeries(
	bars: readonly PriceBar[],
	period = 20,
	atrPeriod = 10,
	multiplier = 2,
): KeltnerSeriesResult {
	const len = bars.length;
	const upper: number[] = new Array(len).fill(NaN) as number[];
	const middle: number[] = new Array(len).fill(NaN) as number[];
	const lower: number[] = new Array(len).fill(NaN) as number[];

	const closes = bars.map((b) => b.close);
	const ema = emaSeries(closes, period);
	const atr = atrSeries(bars, atrPeriod);

	for (let i = 0; i < len; i++) {
		const mid = ema[i];
		const currentAtr = atr[i];
		if (mid !== undefined && currentAtr !== undefined && !isNaN(currentAtr)) {
			middle[i] = mid;
			upper[i] = mid + multiplier * currentAtr;
			lower[i] = mid - multiplier * currentAtr;
		}
	}

	return { upper, middle, lower };
}

export interface DonchianSeriesResult {
	upper: number[];
	middle: number[];
	lower: number[];
}

export function donchianSeries(
	bars: readonly PriceBar[],
	period = 20,
): DonchianSeriesResult {
	const len = bars.length;
	const upper: number[] = new Array(len).fill(NaN) as number[];
	const middle: number[] = new Array(len).fill(NaN) as number[];
	const lower: number[] = new Array(len).fill(NaN) as number[];

	const highs = bars.map((b) => b.high ?? 0);
	const lows = bars.map((b) => b.low ?? 0);

	for (let i = period - 1; i < len; i++) {
		let maxHigh = highs[i];
		let minLow = lows[i];
		for (let j = 1; j < period; j++) {
			if (highs[i - j] > maxHigh) {
				maxHigh = highs[i - j];
			}
			if (lows[i - j] < minLow) {
				minLow = lows[i - j];
			}
		}
		upper[i] = maxHigh;
		lower[i] = minLow;
		middle[i] = (maxHigh + minLow) / 2;
	}

	return { upper, middle, lower };
}

export function chaikinVolSeries(
	bars: readonly PriceBar[],
	period = 10,
): number[] {
	const len = bars.length;
	const res: number[] = new Array(len).fill(NaN) as number[];
	if (len === 0) {
		return res;
	}

	const hl = bars.map((b) => (b.high ?? 0) - (b.low ?? 0));
	const emaHL = emaSeries(hl, period);

	for (let i = period; i < len; i++) {
		const emaCurr = emaHL[i];
		const emaPrev = emaHL[i - period];
		if (emaCurr !== undefined && emaPrev !== undefined && emaPrev !== 0) {
			res[i] = ((emaCurr - emaPrev) / emaPrev) * 100;
		}
	}

	return res;
}

export function stdDevSeries(
	values: readonly number[],
	period = 20,
): number[] {
	const len = values.length;
	const res: number[] = new Array(len).fill(NaN) as number[];
	if (len < period) {
		return res;
	}

	const sma = smaSeries(values, period);

	for (let i = period - 1; i < len; i++) {
		const mean = sma[i]!;
		let sumSq = 0;
		for (let j = 0; j < period; j++) {
			const val = values[i - j] ?? 0;
			sumSq += Math.pow(val - mean, 2);
		}
		res[i] = Math.sqrt(sumSq / period);
	}

	return res;
}

export function historicalVolSeries(
	values: readonly number[],
	period = 20,
	annualize = true,
): number[] {
	const len = values.length;
	const res: number[] = new Array(len).fill(NaN) as number[];
	if (len <= 1) {
		return res;
	}

	const logReturns: number[] = new Array(len).fill(NaN) as number[];
	for (let i = 1; i < len; i++) {
		const prev = values[i - 1] ?? 0;
		const curr = values[i] ?? 0;
		logReturns[i] = prev > 0 && curr > 0 ? Math.log(curr / prev) : 0;
	}

	const stdDev = stdDevSeries(logReturns, period);
	const multiplier = annualize ? Math.sqrt(252) * 100 : 100;

	for (let i = 0; i < len; i++) {
		const val = stdDev[i];
		if (val !== undefined && !isNaN(val)) {
			res[i] = val * multiplier;
		}
	}

	return res;
}

export function choppinessIndexSeries(
	bars: readonly PriceBar[],
	period = 14,
): number[] {
	const len = bars.length;
	const res: number[] = new Array(len).fill(NaN) as number[];
	if (len < period) {
		return res;
	}

	const tr = trueRangeSeries(bars);
	const highs = bars.map((b) => b.high ?? 0);
	const lows = bars.map((b) => b.low ?? 0);

	const log10Period = Math.log10(period);

	for (let i = period - 1; i < len; i++) {
		let sumTr = 0;
		let highestHigh = highs[i];
		let lowestLow = lows[i];

		for (let j = 0; j < period; j++) {
			sumTr += tr[i - j] ?? 0;
			if (highs[i - j] > highestHigh) {
				highestHigh = highs[i - j];
			}
			if (lows[i - j] < lowestLow) {
				lowestLow = lows[i - j];
			}
		}

		const range = highestHigh - lowestLow;
		if (range > 0 && sumTr > 0) {
			res[i] = 100 * (Math.log10(sumTr / range) / log10Period);
		} else {
			res[i] = 0;
		}
	}

	return res;
}

export function cmfSeries(bars: readonly PriceBar[], period = 20): number[] {
	const len = bars.length;
	const res: number[] = new Array(len).fill(NaN) as number[];
	if (len === 0) return res;

	const mfv: number[] = new Array(len).fill(0);
	for (let i = 0; i < len; i++) {
		const bar = bars[i];
		const high = bar.high;
		const low = bar.low;
		const close = bar.close;
		const vol = bar.volume;
		const range = high - low;
		if (range > 0) {
			mfv[i] = (((close - low) - (high - close)) / range) * vol;
		} else {
			mfv[i] = 0;
		}
	}

	for (let i = period - 1; i < len; i++) {
		let sumMfv = 0;
		let sumVol = 0;
		for (let j = 0; j < period; j++) {
			sumMfv += mfv[i - j]!;
			sumVol += bars[i - j].volume;
		}
		res[i] = sumVol > 0 ? sumMfv / sumVol : 0;
	}
	return res;
}

export function mfiSeries(bars: readonly PriceBar[], period = 14): number[] {
	const len = bars.length;
	const res: number[] = new Array(len).fill(NaN) as number[];
	if (len < period) return res;

	const tp = bars.map((b) => (b.high + b.low + b.close) / 3);
	const mf = bars.map((b, i) => tp[i]! * b.volume);

	for (let i = period - 1; i < len; i++) {
		let positiveMF = 0;
		let negativeMF = 0;
		for (let j = 0; j < period; j++) {
			const idx = i - j;
			if (idx - 1 >= 0) {
				if (tp[idx]! > tp[idx - 1]!) {
					positiveMF += mf[idx]!;
				} else if (tp[idx]! < tp[idx - 1]!) {
					negativeMF += mf[idx]!;
				}
			}
		}
		const sumMF = positiveMF + negativeMF;
		res[i] = sumMF > 0 ? (positiveMF / sumMF) * 100 : 50;
	}
	return res;
}

export function volOscSeries(bars: readonly PriceBar[], shortPeriod = 5, longPeriod = 20): number[] {
	const len = bars.length;
	const res: number[] = new Array(len).fill(NaN) as number[];
	if (len === 0) return res;

	const volumes = bars.map((b) => b.volume);
	const shortVol = smaSeries(volumes, shortPeriod);
	const longVol = smaSeries(volumes, longPeriod);

	for (let i = 0; i < len; i++) {
		const sv = shortVol[i];
		const lv = longVol[i];
		if (sv !== undefined && lv !== undefined && !isNaN(sv) && !isNaN(lv) && lv > 0) {
			res[i] = ((sv - lv) / lv) * 100;
		}
	}
	return res;
}

export interface VwapSeriesResult {
	vwap: number[];
	upper1: number[];
	lower1: number[];
	upper2: number[];
	lower2: number[];
	upper3: number[];
	lower3: number[];
}

function toUTCDate(d: any): Date {
	return d instanceof Date ? d : new Date(d);
}

function isNewSession(currDate: Date, prevDate: Date, anchor: "session" | "week" | "month"): boolean {
	if (anchor === "session") {
		return currDate.getUTCDate() !== prevDate.getUTCDate() ||
			currDate.getUTCMonth() !== prevDate.getUTCMonth() ||
			currDate.getUTCFullYear() !== prevDate.getUTCFullYear();
	}
	if (anchor === "week") {
		return currDate.getUTCDay() < prevDate.getUTCDay() ||
			(currDate.getTime() - prevDate.getTime()) > 7 * 24 * 60 * 60 * 1000;
	}
	if (anchor === "month") {
		return cumMonthDiff(currDate, prevDate) > 0;
	}
	return false;
}

function cumMonthDiff(d1: Date, d2: Date): number {
	return (d1.getUTCFullYear() - d2.getUTCFullYear()) * 12 + d1.getUTCMonth() - d2.getUTCMonth();
}

export function vwapSeries(
	bars: readonly PriceBar[],
	anchor: "session" | "week" | "month" = "session",
	showBands = true,
	multiplier = 1,
): VwapSeriesResult {
	const len = bars.length;
	const result: VwapSeriesResult = {
		vwap: new Array(len).fill(NaN),
		upper1: new Array(len).fill(NaN),
		lower1: new Array(len).fill(NaN),
		upper2: new Array(len).fill(NaN),
		lower2: new Array(len).fill(NaN),
		upper3: new Array(len).fill(NaN),
		lower3: new Array(len).fill(NaN),
	};

	if (len === 0) return result;

	const tp = bars.map((b) => (b.high + b.low + b.close) / 3);

	let cumPv = 0;
	let cumVol = 0;
	let cumPv2 = 0;

	for (let i = 0; i < len; i++) {
		const bar = bars[i];
		const currentTp = tp[i]!;
		const currentVol = bar.volume;

		if (i > 0) {
			const prevDate = toUTCDate(bars[i - 1].date);
			const currDate = toUTCDate(bar.date);
			if (isNewSession(currDate, prevDate, anchor)) {
				cumPv = 0;
				cumVol = 0;
				cumPv2 = 0;
			}
		}

		cumPv += currentTp * currentVol;
		cumVol += currentVol;
		cumPv2 += currentTp * currentTp * currentVol;

		if (cumVol > 0) {
			const vwapVal = cumPv / cumVol;
			result.vwap[i] = vwapVal;

			if (showBands) {
				const variance = (cumPv2 / cumVol) - (vwapVal * vwapVal);
				const sd = Math.sqrt(Math.max(variance, 0));
				const m = multiplier;
				result.upper1[i] = vwapVal + m * 1 * sd;
				result.lower1[i] = vwapVal - m * 1 * sd;
				result.upper2[i] = vwapVal + m * 2 * sd;
				result.lower2[i] = vwapVal - m * 2 * sd;
				result.upper3[i] = vwapVal + m * 3 * sd;
				result.lower3[i] = vwapVal - m * 3 * sd;
			}
		}
	}

	return result;
}

export function anchoredVwapSeries(
	bars: readonly PriceBar[],
	anchorTime: number,
	showBands = true,
	multiplier = 1,
): VwapSeriesResult {
	const len = bars.length;
	const result: VwapSeriesResult = {
		vwap: new Array(len).fill(NaN),
		upper1: new Array(len).fill(NaN),
		lower1: new Array(len).fill(NaN),
		upper2: new Array(len).fill(NaN),
		lower2: new Array(len).fill(NaN),
		upper3: new Array(len).fill(NaN),
		lower3: new Array(len).fill(NaN),
	};

	if (len === 0) return result;

	const tp = bars.map((b) => (b.high + b.low + b.close) / 3);

	let cumPv = 0;
	let cumVol = 0;
	let cumPv2 = 0;
	let anchoredStarted = false;

	for (let i = 0; i < len; i++) {
		const bar = bars[i];
		const currentTp = tp[i]!;
		const currentVol = bar.volume;
		const barTime = bar.date
			? (bar.date instanceof Date ? bar.date.getTime() : new Date(bar.date).getTime())
			: 0;

		if (!anchoredStarted && barTime >= anchorTime) {
			anchoredStarted = true;
		}

		if (!anchoredStarted) {
			continue;
		}

		cumPv += currentTp * currentVol;
		cumVol += currentVol;
		cumPv2 += currentTp * currentTp * currentVol;

		if (cumVol > 0) {
			const vwapVal = cumPv / cumVol;
			result.vwap[i] = vwapVal;

			if (showBands) {
				const variance = (cumPv2 / cumVol) - (vwapVal * vwapVal);
				const sd = Math.sqrt(Math.max(variance, 0));
				const m = multiplier;
				result.upper1[i] = vwapVal + m * 1 * sd;
				result.lower1[i] = vwapVal - m * 1 * sd;
				result.upper2[i] = vwapVal + m * 2 * sd;
				result.lower2[i] = vwapVal - m * 2 * sd;
				result.upper3[i] = vwapVal + m * 3 * sd;
				result.lower3[i] = vwapVal - m * 3 * sd;
			}
		}
	}

	return result;
}

function smmaSeries(values: number[], period: number): number[] {
	const res: number[] = new Array(values.length).fill(NaN);
	if (values.length < period) return res;

	let sum = 0;
	for (let i = 0; i < period; i++) {
		sum += values[i]!;
	}
	res[period - 1] = sum / period;

	for (let i = period; i < values.length; i++) {
		res[i] = (res[i - 1]! * (period - 1) + values[i]!) / period;
	}
	return res;
}

function shiftSeries(values: number[], shift: number): number[] {
	const res: number[] = new Array(values.length).fill(NaN);
	for (let i = shift; i < values.length; i++) {
		res[i] = values[i - shift]!;
	}
	return res;
}

export interface AlligatorSeriesResult {
	jaw: number[];
	teeth: number[];
	lips: number[];
}

export function alligatorSeries(
	bars: readonly PriceBar[],
	jawPeriod = 13,
	jawShift = 8,
	teethPeriod = 8,
	teethShift = 5,
	lipsPeriod = 5,
	lipsShift = 3,
): AlligatorSeriesResult {
	const len = bars.length;
	const result: AlligatorSeriesResult = {
		jaw: new Array(len).fill(NaN),
		teeth: new Array(len).fill(NaN),
		lips: new Array(len).fill(NaN),
	};
	if (len === 0) return result;

	const median = bars.map((b) => (b.high + b.low) / 2);

	const rawJaw = smmaSeries(median, jawPeriod);
	const rawTeeth = smmaSeries(median, teethPeriod);
	const rawLips = smmaSeries(median, lipsPeriod);

	result.jaw = shiftSeries(rawJaw, jawShift);
	result.teeth = shiftSeries(rawTeeth, teethShift);
	result.lips = shiftSeries(rawLips, lipsShift);

	return result;
}

export interface FractalsSeriesResult {
	bearish: number[];
	bullish: number[];
}

export function fractalsSeries(bars: readonly PriceBar[]): FractalsSeriesResult {
	const len = bars.length;
	const result: FractalsSeriesResult = {
		bearish: new Array(len).fill(NaN),
		bullish: new Array(len).fill(NaN),
	};

	if (len < 5) return result;

	const highs = bars.map((b) => b.high);
	const lows = bars.map((b) => b.low);

	for (let i = 2; i < len - 2; i++) {
		const h = highs[i]!;
		const l = lows[i]!;

		if (h > highs[i - 2]! && h > highs[i - 1]! && h > highs[i + 1]! && h > highs[i + 2]!) {
			result.bearish[i] = h;
		}

		if (l < lows[i - 2]! && l < lows[i - 1]! && l < lows[i + 1]! && l < lows[i + 2]!) {
			result.bullish[i] = l;
		}
	}

	return result;
}

export interface GatorSeriesResult {
	upper: number[];
	lower: number[];
}

export function gatorSeries(
	bars: readonly PriceBar[],
	jawPeriod = 13,
	jawShift = 8,
	teethPeriod = 8,
	teethShift = 5,
	lipsPeriod = 5,
	lipsShift = 3,
): GatorSeriesResult {
	const len = bars.length;
	const result: GatorSeriesResult = {
		upper: new Array(len).fill(NaN),
		lower: new Array(len).fill(NaN),
	};
	if (len === 0) return result;

	const alli = alligatorSeries(bars, jawPeriod, jawShift, teethPeriod, teethShift, lipsPeriod, lipsShift);

	for (let i = 0; i < len; i++) {
		const jawVal = alli.jaw[i];
		const teethVal = alli.teeth[i];
		const lipsVal = alli.lips[i];

		if (jawVal !== undefined && teethVal !== undefined && lipsVal !== undefined &&
			!isNaN(jawVal) && !isNaN(teethVal) && !isNaN(lipsVal)) {
			result.upper[i] = Math.abs(jawVal - teethVal);
			result.lower[i] = -Math.abs(teethVal - lipsVal);
		}
	}

	return result;
}

export function acSeries(bars: readonly PriceBar[]): number[] {
	const len = bars.length;
	const res: number[] = new Array(len).fill(NaN) as number[];
	if (len < 34) return res;

	const median = bars.map((b) => (b.high + b.low) / 2);
	const sma5 = smaSeries(median, 5);
	const sma34 = smaSeries(median, 34);

	const ao: number[] = new Array(len).fill(NaN);
	for (let i = 0; i < len; i++) {
		if (i < 33) {
			continue;
		}
		const s5 = sma5[i];
		const s34 = sma34[i];
		if (s5 !== undefined && s34 !== undefined && !isNaN(s5) && !isNaN(s34)) {
			ao[i] = s5 - s34;
		}
	}

	const smaAo5 = smaSeriesSkipNaN(ao, 5);
	for (let i = 0; i < len; i++) {
		const aoVal = ao[i];
		const smaVal = smaAo5[i];
		if (aoVal !== undefined && smaVal !== undefined && !isNaN(aoVal) && !isNaN(smaVal)) {
			res[i] = aoVal - smaVal;
		}
	}

	return res;
}

export interface PivotSeriesResult {
	pp: number[];
	r1: number[];
	s1: number[];
	r2: number[];
	s2: number[];
	r3: number[];
	s3: number[];
}

export function pivotStandardSeries(
	bars: readonly PriceBar[],
	type: "standard" | "fibonacci" | "camarilla" | "woodie" | "demark" = "standard",
): PivotSeriesResult {
	const len = bars.length;
	const result: PivotSeriesResult = {
		pp: new Array(len).fill(NaN),
		r1: new Array(len).fill(NaN),
		s1: new Array(len).fill(NaN),
		r2: new Array(len).fill(NaN),
		s2: new Array(len).fill(NaN),
		r3: new Array(len).fill(NaN),
		s3: new Array(len).fill(NaN),
	};

	if (len === 0) return result;

	interface DailyRange {
		open: number;
		high: number;
		low: number;
		close: number;
	}

	const dailyRanges: Array<{ dateKey: string; range: DailyRange }> = [];
	let currentKey = "";
	let currentOpen = 0;
	let currentHigh = -Infinity;
	let currentLow = Infinity;
	let currentClose = 0;

	for (let i = 0; i < len; i++) {
		const bar = bars[i];
		const date = toUTCDate(bar.date);
		const dateKey = `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}-${date.getUTCDate()}`;

		if (dateKey !== currentKey) {
			if (currentKey !== "") {
				dailyRanges.push({
					dateKey: currentKey,
					range: { open: currentOpen, high: currentHigh, low: currentLow, close: currentClose },
				});
			}
			currentKey = dateKey;
			currentOpen = bar.open ?? bar.close;
			currentHigh = bar.high;
			currentLow = bar.low;
		} else {
			currentHigh = Math.max(currentHigh, bar.high);
			currentLow = Math.min(currentLow, bar.low);
		}
		currentClose = bar.close;
	}
	if (currentKey !== "") {
		dailyRanges.push({
			dateKey: currentKey,
			range: { open: currentOpen, high: currentHigh, low: currentLow, close: currentClose },
		});
	}

	for (let i = 0; i < len; i++) {
		const date = toUTCDate(bars[i].date);
		const dateKey = `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}-${date.getUTCDate()}`;
		const dayIdx = dailyRanges.findIndex((d) => d.dateKey === dateKey);

		if (dayIdx > 0) {
			const prevDay = dailyRanges[dayIdx - 1]!.range;
			const H = prevDay.high;
			const L = prevDay.low;
			const C = prevDay.close;
			const O = prevDay.open;

			let pp = 0;
			let r1 = NaN;
			let s1 = NaN;
			let r2 = NaN;
			let s2 = NaN;
			let r3 = NaN;
			let s3 = NaN;

			if (type === "standard") {
				pp = (H + L + C) / 3;
				r1 = 2 * pp - L;
				s1 = 2 * pp - H;
				r2 = pp + (H - L);
				s2 = pp - (H - L);
				r3 = H + 2 * (pp - L);
				s3 = L - 2 * (H - pp);
			} else if (type === "fibonacci") {
				pp = (H + L + C) / 3;
				r1 = pp + 0.382 * (H - L);
				s1 = pp - 0.382 * (H - L);
				r2 = pp + 0.618 * (H - L);
				s2 = pp - 0.618 * (H - L);
				r3 = pp + 1.000 * (H - L);
				s3 = pp - 1.000 * (H - L);
			} else if (type === "camarilla") {
				pp = (H + L + C) / 3;
				r1 = C + 1.1 * (H - L) / 12;
				s1 = C - 1.1 * (H - L) / 12;
				r2 = C + 1.1 * (H - L) / 6;
				s2 = C - 1.1 * (H - L) / 6;
				r3 = C + 1.1 * (H - L) / 4;
				s3 = C - 1.1 * (H - L) / 4;
			} else if (type === "woodie") {
				pp = (H + L + 2 * C) / 4;
				r1 = 2 * pp - L;
				s1 = 2 * pp - H;
				r2 = pp + (H - L);
				s2 = pp - (H - L);
				r3 = H + 2 * (pp - L);
				s3 = L - 2 * (H - pp);
			} else if (type === "demark") {
				let X = 0;
				if (C < O) {
					X = H + 2 * L + C;
				} else if (C > O) {
					X = 2 * H + L + C;
				} else {
					X = H + L + 2 * C;
				}
				pp = X / 4;
				r1 = X / 2 - L;
				s1 = X / 2 - H;
			}

			result.pp[i] = pp;
			result.r1[i] = r1;
			result.s1[i] = s1;
			result.r2[i] = r2;
			result.s2[i] = s2;
			result.r3[i] = r3;
			result.s3[i] = s3;
		}
	}

	return result;
}

export function pivotHighLowSeries(
	bars: readonly PriceBar[],
	lookback = 10,
	type: "standard" | "fibonacci" = "standard",
): PivotSeriesResult {
	const len = bars.length;
	const result: PivotSeriesResult = {
		pp: new Array(len).fill(NaN),
		r1: new Array(len).fill(NaN),
		s1: new Array(len).fill(NaN),
		r2: new Array(len).fill(NaN),
		s2: new Array(len).fill(NaN),
		r3: new Array(len).fill(NaN),
		s3: new Array(len).fill(NaN),
	};

	if (len < lookback) return result;

	const highs = bars.map((b) => b.high);
	const lows = bars.map((b) => b.low);

	for (let i = lookback; i < len; i++) {
		let H = highs[i - lookback]!;
		let L = lows[i - lookback]!;
		for (let j = 1; j < lookback; j++) {
			H = Math.max(H, highs[i - lookback + j]!);
			L = Math.min(L, lows[i - lookback + j]!);
		}
		const C = bars[i - 1].close;

		let pp = 0;
		let r1 = NaN;
		let s1 = NaN;
		let r2 = NaN;
		let s2 = NaN;
		let r3 = NaN;
		let s3 = NaN;

		if (type === "standard") {
			pp = (H + L + C) / 3;
			r1 = 2 * pp - L;
			s1 = 2 * pp - H;
			r2 = pp + (H - L);
			s2 = pp - (H - L);
			r3 = H + 2 * (pp - L);
			s3 = L - 2 * (H - pp);
		} else if (type === "fibonacci") {
			pp = (H + L + C) / 3;
			r1 = pp + 0.382 * (H - L);
			s1 = pp - 0.382 * (H - L);
			r2 = pp + 0.618 * (H - L);
			s2 = pp - 0.618 * (H - L);
			r3 = pp + 1.000 * (H - L);
			s3 = pp - 1.000 * (H - L);
		}

		result.pp[i] = pp;
		result.r1[i] = r1;
		result.s1[i] = s1;
		result.r2[i] = r2;
		result.s2[i] = s2;
		result.r3[i] = r3;
		result.s3[i] = s3;
	}

	return result;
}

export function synthesizeTicksFromBar(
	bar: PriceBar,
	tickSize: number
): Array<{ symbol: string; timestamp: number; price: number; size: number; side: "buy" | "sell" }> {
	const ticks: Array<{ symbol: string; timestamp: number; price: number; size: number; side: "buy" | "sell" }> = [];
	const high = bar.high;
	const low = bar.low;
	const open = bar.open ?? bar.close;
	const close = bar.close;
	const volume = bar.volume;
	const ts = bar.date instanceof Date ? bar.date.getTime() : Date.now();

	const safeTickSize = tickSize > 0 ? tickSize : 0.01;
	const priceRange = high - low;
	const steps = Math.max(1, Math.round(priceRange / safeTickSize)) + 1;
	const volumePerStep = volume / steps;

	const isUp = close >= open;
	const side = isUp ? "buy" : "sell";

	for (let i = 0; i < steps; i++) {
		const price = Math.round((low + i * safeTickSize) / safeTickSize) * safeTickSize;
		ticks.push({
			symbol: "FALLBACK",
			timestamp: ts,
			price,
			size: volumePerStep,
			side: side,
		});
	}

	return ticks;
}

export interface TPOBlock {
	price: number;
	letter: string;      // A, B, C... (30-min periods)
	volume: number;      // volume at this price in this period
	timeStart: number;
	timeEnd: number;
}

export interface MarketProfileData {
	tpoBlocks: TPOBlock[];
	poc: number;         // Point of Control - price with most TPOs
	valueAreaHigh: number;   // 70% volume/TPO range high
	valueAreaLow: number;    // 70% volume/TPO range low
	initialBalanceHigh: number;  // First 2 periods high
	initialBalanceLow: number;   // First 2 periods low
	profileHigh: number;
	profileLow: number;
}

export function computeMarketProfile(
	ticks: Array<{ timestamp: number; price: number; size: number; side: "buy" | "sell" }>,
	sessionStart: number,
	sessionEnd: number,
	tickSize: number,
	tpoPeriodMinutes: number = 30
): MarketProfileData {
	if (ticks.length === 0) {
		return {
			tpoBlocks: [],
			poc: 0,
			valueAreaHigh: 0,
			valueAreaLow: 0,
			initialBalanceHigh: 0,
			initialBalanceLow: 0,
			profileHigh: 0,
			profileLow: 0,
		};
	}

	const safeTickSize = tickSize > 0 ? tickSize : 0.01;
	const periodMs = tpoPeriodMinutes * 60 * 1000;

	// 1. Group ticks into TPO periods
	const periodsMap = new Map<number, Array<{ price: number; size: number; side: "buy" | "sell" }>>();
	let profileHigh = Number.NEGATIVE_INFINITY;
	let profileLow = Number.POSITIVE_INFINITY;

	for (const tick of ticks) {
		const relativeTime = tick.timestamp - sessionStart;
		const periodIndex = Math.max(0, Math.floor(relativeTime / periodMs));
		if (!periodsMap.has(periodIndex)) {
			periodsMap.set(periodIndex, []);
		}
		periodsMap.get(periodIndex)!.push(tick);
		if (tick.price > profileHigh) profileHigh = tick.price;
		if (tick.price < profileLow) profileLow = tick.price;
	}

	const tpoBlocks: TPOBlock[] = [];
	const priceTposMap = new Map<number, Set<number>>();
	const priceVolumeMap = new Map<number, number>();

	for (const [periodIndex, periodTicks] of periodsMap.entries()) {
		const letterIndex = periodIndex % 26;
		const prefix = Math.floor(periodIndex / 26) > 0 ? String(Math.floor(periodIndex / 26)) : "";
		const letter = prefix + String.fromCharCode(65 + letterIndex);

		const periodPricesMap = new Map<number, number>(); // roundedPrice -> volume
		for (const tick of periodTicks) {
			const roundedPrice = Math.round(tick.price / safeTickSize) * safeTickSize;
			periodPricesMap.set(roundedPrice, (periodPricesMap.get(roundedPrice) || 0) + tick.size);
			priceVolumeMap.set(roundedPrice, (priceVolumeMap.get(roundedPrice) || 0) + tick.size);
		}

		for (const [price, volume] of periodPricesMap.entries()) {
			tpoBlocks.push({
				price,
				letter,
				volume,
				timeStart: sessionStart + periodIndex * periodMs,
				timeEnd: sessionStart + (periodIndex + 1) * periodMs,
			});

			if (!priceTposMap.has(price)) {
				priceTposMap.set(price, new Set());
			}
			priceTposMap.get(price)!.add(periodIndex);
		}
	}

	// Calculate POC
	let poc = 0;
	let maxTpos = -1;
	let maxVolAtPoc = -1;
	for (const [price, periodIndices] of priceTposMap.entries()) {
		const tpoCount = periodIndices.size;
		const vol = priceVolumeMap.get(price) || 0;
		if (tpoCount > maxTpos || (tpoCount === maxTpos && vol > maxVolAtPoc)) {
			maxTpos = tpoCount;
			maxVolAtPoc = vol;
			poc = price;
		}
	}

	// Calculate Value Area (70% of TPOs)
	const prices = Array.from(priceTposMap.keys()).sort((a, b) => a - b);
	const totalTpos = prices.reduce((acc, p) => acc + (priceTposMap.get(p)?.size ?? 0), 0);
	const targetTpos = Math.round(totalTpos * 0.70);

	let vaHigh = poc;
	let vaLow = poc;

	if (prices.length > 1) {
		let pocIndex = prices.indexOf(poc);
		if (pocIndex === -1) pocIndex = 0;
		let left = pocIndex;
		let right = pocIndex;
		let currentTpos = priceTposMap.get(poc)?.size ?? 0;

		while (currentTpos < targetTpos && (left > 0 || right < prices.length - 1)) {
			let upTpos = 0;
			for (let i = 1; i <= 2; i++) {
				if (right + i < prices.length) {
					upTpos += priceTposMap.get(prices[right + i])!.size;
				}
			}
			let downTpos = 0;
			for (let i = 1; i <= 2; i++) {
				if (left - i >= 0) {
					downTpos += priceTposMap.get(prices[left - i])!.size;
				}
			}

			if (upTpos >= downTpos && right < prices.length - 1) {
				right += 1;
				currentTpos += priceTposMap.get(prices[right])!.size;
			} else if (left > 0) {
				left -= 1;
				currentTpos += priceTposMap.get(prices[left])!.size;
			} else if (right < prices.length - 1) {
				right += 1;
				currentTpos += priceTposMap.get(prices[right])!.size;
			}
		}

		vaHigh = prices[right];
		vaLow = prices[left];
	}

	// Initial Balance: High and Low of first 2 periods
	const ibTicks = ticks.filter(t => {
		const relTime = t.timestamp - sessionStart;
		const periodIndex = Math.floor(relTime / periodMs);
		return periodIndex === 0 || periodIndex === 1;
	});
	let initialBalanceHigh = profileHigh;
	let initialBalanceLow = profileLow;
	if (ibTicks.length > 0) {
		initialBalanceHigh = Math.max(...ibTicks.map(t => t.price));
		initialBalanceLow = Math.min(...ibTicks.map(t => t.price));
	}

	return {
		tpoBlocks,
		poc,
		valueAreaHigh: vaHigh,
		valueAreaLow: vaLow,
		initialBalanceHigh,
		initialBalanceLow,
		profileHigh,
		profileLow,
	};
}

export interface VolumeProfileLevel {
	price: number;
	volume: number;
	buyVolume: number;
	sellVolume: number;
}

export interface VolumeProfileData {
	priceLevels: VolumeProfileLevel[];
	poc: number;
	valueAreaHigh: number;
	valueAreaLow: number;
	highVolumeNodes: number[];  // local maxima
	lowVolumeNodes: number[];   // local minima
}

export function computeVolumeProfile(
	data: Array<{ timestamp: number; price: number; size: number; side: "buy" | "sell" }> | PriceBar[],
	priceTickSize: number,
	range?: { from: number; to: number }
): VolumeProfileData {
	const safeTickSize = priceTickSize > 0 ? priceTickSize : 0.01;

	let ticks: Array<{ timestamp: number; price: number; size: number; side: "buy" | "sell" }> = [];
	if (data.length > 0) {
		if ("close" in data[0]) {
			const bars = data as PriceBar[];
			for (const bar of bars) {
				ticks.push(...synthesizeTicksFromBar(bar, safeTickSize));
			}
		} else {
			ticks = data as Array<{ timestamp: number; price: number; size: number; side: "buy" | "sell" }>;
		}
	}

	if (range) {
		ticks = ticks.filter(t => t.price >= range.from && t.price <= range.to);
	}

	if (ticks.length === 0) {
		return {
			priceLevels: [],
			poc: 0,
			valueAreaHigh: 0,
			valueAreaLow: 0,
			highVolumeNodes: [],
			lowVolumeNodes: [],
		};
	}

	const aggMap = new Map<number, { volume: number; buyVolume: number; sellVolume: number }>();
	for (const tick of ticks) {
		const roundedPrice = Math.round(tick.price / safeTickSize) * safeTickSize;
		if (!aggMap.has(roundedPrice)) {
			aggMap.set(roundedPrice, { volume: 0, buyVolume: 0, sellVolume: 0 });
		}
		const level = aggMap.get(roundedPrice)!;
		level.volume += tick.size;
		if (tick.side === "buy") {
			level.buyVolume += tick.size;
		} else {
			level.sellVolume += tick.size;
		}
	}

	const priceLevels: VolumeProfileLevel[] = Array.from(aggMap.entries()).map(([price, val]) => ({
		price,
		volume: val.volume,
		buyVolume: val.buyVolume,
		sellVolume: val.sellVolume,
	})).sort((a, b) => a.price - b.price);

	let poc = 0;
	let maxVolume = -1;
	for (const lvl of priceLevels) {
		if (lvl.volume > maxVolume) {
			maxVolume = lvl.volume;
			poc = lvl.price;
		}
	}

	const totalVolume = priceLevels.reduce((sum, l) => sum + l.volume, 0);
	const targetVolume = totalVolume * 0.70;

	let vaHigh = poc;
	let vaLow = poc;

	if (priceLevels.length > 1) {
		let pocIndex = priceLevels.findIndex(l => l.price === poc);
		if (pocIndex === -1) pocIndex = 0;
		let left = pocIndex;
		let right = pocIndex;
		let currentVolume = priceLevels[pocIndex].volume;

		while (currentVolume < targetVolume && (left > 0 || right < priceLevels.length - 1)) {
			const upVol = right + 1 < priceLevels.length ? priceLevels[right + 1].volume : 0;
			const downVol = left - 1 >= 0 ? priceLevels[left - 1].volume : 0;

			if (upVol >= downVol && right < priceLevels.length - 1) {
				right += 1;
				currentVolume += priceLevels[right].volume;
			} else if (left > 0) {
				left -= 1;
				currentVolume += priceLevels[left].volume;
			} else if (right < priceLevels.length - 1) {
				right += 1;
				currentVolume += priceLevels[right].volume;
			}
		}

		vaHigh = priceLevels[right].price;
		vaLow = priceLevels[left].price;
	}

	const highVolumeNodes: number[] = [];
	const lowVolumeNodes: number[] = [];
	const avgVolume = totalVolume / priceLevels.length;

	for (let i = 1; i < priceLevels.length - 1; i++) {
		const prev = priceLevels[i - 1].volume;
		const curr = priceLevels[i].volume;
		const next = priceLevels[i + 1].volume;

		if (curr > prev && curr > next && curr > avgVolume) {
			highVolumeNodes.push(priceLevels[i].price);
		}
		if (curr < prev && curr < next && curr < avgVolume) {
			lowVolumeNodes.push(priceLevels[i].price);
		}
	}

	return {
		priceLevels,
		poc,
		valueAreaHigh: vaHigh,
		valueAreaLow: vaLow,
		highVolumeNodes,
		lowVolumeNodes,
	};
}

export interface FootprintLevel {
	price: number;
	bidVolume: number;
	askVolume: number;
	delta: number;        // ask - bid
	deltaPercent: number; // delta / (bid + ask) * 100
	totalVolume: number;
}

export interface FootprintBar {
	timestamp: number;
	open: number;
	high: number;
	low: number;
	close: number;
	priceLevels: FootprintLevel[];
}

export function computeFootprintBars(
	data: Array<{ timestamp: number; price: number; size: number; side: "buy" | "sell" }> | PriceBar[],
	barIntervalMs: number,
	priceTickSize: number
): FootprintBar[] {
	const safeTickSize = priceTickSize > 0 ? priceTickSize : 0.01;

	let ticks: Array<{ timestamp: number; price: number; size: number; side: "buy" | "sell" }> = [];
	if (data.length > 0) {
		if ("close" in data[0]) {
			const bars = data as PriceBar[];
			for (const bar of bars) {
				ticks.push(...synthesizeTicksFromBar(bar, safeTickSize));
			}
		} else {
			ticks = data as Array<{ timestamp: number; price: number; size: number; side: "buy" | "sell" }>;
		}
	}

	if (ticks.length === 0) {
		return [];
	}

	const barsMap = new Map<number, Array<{ timestamp: number; price: number; size: number; side: "buy" | "sell" }>>();
	for (const tick of ticks) {
		const barTime = Math.floor(tick.timestamp / barIntervalMs) * barIntervalMs;
		if (!barsMap.has(barTime)) {
			barsMap.set(barTime, []);
		}
		barsMap.get(barTime)!.push(tick);
	}

	const sortedBarTimes = Array.from(barsMap.keys()).sort((a, b) => a - b);
	const footprintBars: FootprintBar[] = [];

	for (const barTime of sortedBarTimes) {
		const bTicks = barsMap.get(barTime)!.sort((a, b) => a.timestamp - b.timestamp);
		const open = bTicks[0].price;
		const close = bTicks[bTicks.length - 1].price;
		const high = Math.max(...bTicks.map(t => t.price));
		const low = Math.min(...bTicks.map(t => t.price));

		const levelMap = new Map<number, { bidVolume: number; askVolume: number }>();
		for (const tick of bTicks) {
			const roundedPrice = Math.round(tick.price / safeTickSize) * safeTickSize;
			if (!levelMap.has(roundedPrice)) {
				levelMap.set(roundedPrice, { bidVolume: 0, askVolume: 0 });
			}
			const lvl = levelMap.get(roundedPrice)!;
			if (tick.side === "buy") {
				lvl.askVolume += tick.size;
			} else {
				lvl.bidVolume += tick.size;
			}
		}

		const priceLevels: FootprintLevel[] = Array.from(levelMap.entries()).map(([price, val]) => {
			const totalVolume = val.askVolume + val.bidVolume;
			const delta = val.askVolume - val.bidVolume;
			const deltaPercent = totalVolume > 0 ? (delta / totalVolume) * 100 : 0;
			return {
				price,
				bidVolume: val.bidVolume,
				askVolume: val.askVolume,
				delta,
				deltaPercent,
				totalVolume,
			};
		}).sort((a, b) => a.price - b.price);

		footprintBars.push({
			timestamp: barTime,
			open,
			high,
			low,
			close,
			priceLevels,
		});
	}

	return footprintBars;
}

export interface DeltaProfileData {
	cumulativeDelta: number[];      // cumulative sum of (askVol - bidVol) per bar
	barDelta: number[];             // delta per bar
	deltaSMA: number[];             // SMA of bar delta
	divergenceSignals: {            // price vs delta divergence
		index: number;
		type: "bullish" | "bearish";
	}[];
}

export function computeDeltaProfile(
	footprintBars: FootprintBar[],
	smaPeriod: number = 14
): DeltaProfileData {
	const count = footprintBars.length;
	const barDelta = new Array<number>(count).fill(0);
	const cumulativeDelta = new Array<number>(count).fill(0);

	let runningSum = 0;
	for (let i = 0; i < count; i++) {
		const bar = footprintBars[i];
		const d = bar.priceLevels.reduce((sum, lvl) => sum + lvl.delta, 0);
		barDelta[i] = d;
		runningSum += d;
		cumulativeDelta[i] = runningSum;
	}

	const deltaSMA = smaSeries(barDelta, smaPeriod);

	const divergenceSignals: Array<{ index: number; type: "bullish" | "bearish" }> = [];
	const lookback = 3;

	const localLows: number[] = [];
	const localHighs: number[] = [];

	for (let i = lookback; i < count - lookback; i++) {
		let isLocalLow = true;
		for (let j = i - lookback; j <= i + lookback; j++) {
			if (footprintBars[j].low < footprintBars[i].low) {
				isLocalLow = false;
				break;
			}
		}
		if (isLocalLow) {
			localLows.push(i);
		}

		let isLocalHigh = true;
		for (let j = i - lookback; j <= i + lookback; j++) {
			if (footprintBars[j].high > footprintBars[i].high) {
				isLocalHigh = false;
				break;
			}
		}
		if (isLocalHigh) {
			localHighs.push(i);
		}
	}

	for (let k = 1; k < localLows.length; k++) {
		const prevIdx = localLows[k - 1];
		const currIdx = localLows[k];
		if (
			footprintBars[currIdx].low < footprintBars[prevIdx].low &&
			cumulativeDelta[currIdx] > cumulativeDelta[prevIdx]
		) {
			divergenceSignals.push({ index: currIdx, type: "bullish" });
		}
	}

	for (let k = 1; k < localHighs.length; k++) {
		const prevIdx = localHighs[k - 1];
		const currIdx = localHighs[k];
		if (
			footprintBars[currIdx].high > footprintBars[prevIdx].high &&
			cumulativeDelta[currIdx] < cumulativeDelta[prevIdx]
		) {
			divergenceSignals.push({ index: currIdx, type: "bearish" });
		}
	}

	return {
		cumulativeDelta,
		barDelta,
		deltaSMA,
		divergenceSignals,
	};
}