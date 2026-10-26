import type { OHLCVBar } from "../../lib/types/ohlcv";

export interface ExternalBarsNormalizationResult {
	bars: OHLCVBar[];
	invalidCount: number;
	firstError: string | null;
}

export function buildExternalDataValidationError(result: ExternalBarsNormalizationResult): Error | null {
	if (result.invalidCount <= 0) {
		return null;
	}

	const suffix = result.firstError ? ` First error: ${result.firstError}` : "";
	return new Error(`External data contains ${result.invalidCount} invalid bars.${suffix}`);
}

export function normalizeExternalBar(bar: unknown, index: number): OHLCVBar {
	if (!bar || typeof bar !== "object") {
		throw new Error("Invalid bar format");
	}
	const record = bar as Record<string, unknown>;

	let date: Date | null = null;
	const rawDate = record.date ?? record.time ?? record.timestamp ?? record.t;
	if (rawDate instanceof Date) {
		date = rawDate;
	} else if (typeof rawDate === "number" || typeof rawDate === "string") {
		date = new Date(rawDate);
	}
	if (!date || isNaN(date.getTime())) {
		throw new Error(`Invalid bar date: ${JSON.stringify(rawDate)}`);
	}

	const openVal = record.open ?? record.o;
	const highVal = record.high ?? record.h;
	const lowVal = record.low ?? record.l;
	const closeVal = record.close ?? record.c;
	const volumeVal = record.volume ?? record.v ?? 0;

	const open = typeof openVal === "number" ? openVal : parseFloat(String(openVal));
	const high = typeof highVal === "number" ? highVal : parseFloat(String(highVal));
	const low = typeof lowVal === "number" ? lowVal : parseFloat(String(lowVal));
	const close = typeof closeVal === "number" ? closeVal : parseFloat(String(closeVal));
	const volume = typeof volumeVal === "number" ? volumeVal : parseFloat(String(volumeVal));

	if (isNaN(open) || isNaN(high) || isNaN(low) || isNaN(close) || isNaN(volume)) {
		throw new Error(`Invalid OHLCV numeric values: ${JSON.stringify(bar)}`);
	}

	return {
		date,
		open,
		high,
		low,
		close,
		volume,
		buyVolume: record.buyVolume !== undefined ? Number(record.buyVolume) : undefined,
		sellVolume: record.sellVolume !== undefined ? Number(record.sellVolume) : undefined,
		foreignBuy: record.foreignBuy !== undefined ? Number(record.foreignBuy) : undefined,
		foreignSell: record.foreignSell !== undefined ? Number(record.foreignSell) : undefined,
		openInterest: record.openInterest !== undefined ? Number(record.openInterest) : undefined,
		index: record.index !== undefined ? Number(record.index) : index,
		dataIndex: record.dataIndex !== undefined ? Number(record.dataIndex) : index,
	};
}

export function normalizeExternalBars(data: readonly unknown[] | undefined | null): ExternalBarsNormalizationResult {
	if (!data || !Array.isArray(data)) {
		return {
			bars: [],
			invalidCount: 0,
			firstError: null,
		};
	}

	const bars: OHLCVBar[] = [];
	let invalidCount = 0;
	let firstError: string | null = null;
	for (let index = 0; index < data.length; index += 1) {
		const bar = data[index];
		try {
			bars.push(normalizeExternalBar(bar, index));
		} catch (err) {
			invalidCount += 1;
			if (firstError === null) {
				const detail = err instanceof Error ? err.message : String(err);
				firstError = `index=${index}; reason=${detail}`;
			}
		}
	}

	const sortedBars = [...bars].sort((left, right) => left.date.getTime() - right.date.getTime());
	const dedupedBars: OHLCVBar[] = [];
	for (const bar of sortedBars) {
		const barTime = bar.date.getTime();
		const lastBar = dedupedBars[dedupedBars.length - 1];
		if (lastBar && lastBar.date.getTime() === barTime) {
			dedupedBars[dedupedBars.length - 1] = bar;
			continue;
		}

		dedupedBars.push(bar);
	}

	const normalizedBars = dedupedBars.map((bar, index) => ({
		...bar,
		index,
		dataIndex: index,
	}));

	return {
		bars: normalizedBars,
		invalidCount,
		firstError,
	};
}