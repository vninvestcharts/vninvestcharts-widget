export interface SymbolDataEntry {
	open: number;
	high: number;
	low: number;
	close: number;
	volume: number;
}

/**
 * Compute % change for each overlay bar relative to a baseline price.
 *
 * @param overlayBars - Aligned overlay OHLCV bars (same length as primary)
 * @param basePrice   - Baseline price (typically primary close at index 0)
 * @param baselineIndex - Which bar index is the baseline anchor (default 0)
 * @returns Normalized % values per bar index: ((close - basePrice) / basePrice) * 100
 */
export function computeNormalizedPrices(
	overlayBars: readonly SymbolDataEntry[],
	basePrice: number,
	baselineIndex = 0,
): number[] {
	if (overlayBars.length === 0 || basePrice === 0) {
		return [];
	}
	return overlayBars.map((bar, i) => {
		if (i === baselineIndex) return 0;
		return ((bar.close - basePrice) / basePrice) * 100;
	});
}

/**
 * Takes the primary bars + overlay bars by symbol and produces
 * per-index symbolData and normalizedPrices ready to merge into EnrichedDatum.
 *
 * @param primaryBars - Primary symbol OHLCV bars
 * @param overlaysBySymbol - Overlay symbolId → aligned OHLCV bars
 * @param baselineIndex - Bar index used as baseline anchor (default 0)
 * @param primarySymbolKey - When set, the PRIMARY symbol also gets an entry in
 *   `normalizedPrices` under this key (percent change from the anchor bar).
 *   Without it the primary is only the DENOMINATOR (`basePrice`) and never
 *   appears as a value — which is correct for a Comparison overlay, and wrong
 *   for a Baseline chart, whose whole subject IS the primary series.
 *   A3: this is the one knob that makes Baseline readable off the same,
 *   already-proven writer instead of a second normaliser.
 * @returns symbolData and normalizedPrices maps per index
 */
export function normalizePricesToBaseline(
	primaryBars: readonly SymbolDataEntry[],
	overlaysBySymbol: Record<string, readonly SymbolDataEntry[]>,
	baselineIndex = 0,
	filterSymbolIds?: Set<string>,
	primarySymbolKey?: string,
): {
	symbolData: Record<string, SymbolDataEntry>[];
	normalizedPrices: Record<string, number>[];
} {
	if (primaryBars.length === 0) {
		return { symbolData: [], normalizedPrices: [] };
	}

	const basePrice = primaryBars[baselineIndex]?.close ?? 0;
	const barCount = primaryBars.length;

	const symbolData: Record<string, SymbolDataEntry>[] = [];
	const normalizedPrices: Record<string, number>[] = [];

	const symbolIds = filterSymbolIds
		? Object.keys(overlaysBySymbol).filter((s) => filterSymbolIds.has(s))
		: Object.keys(overlaysBySymbol);

	for (let i = 0; i < barCount; i++) {
		const barSymbolData: Record<string, SymbolDataEntry> = {};
		const barNormalizedPrices: Record<string, number> = {};

		for (const symbolId of symbolIds) {
			const bars = overlaysBySymbol[symbolId];
			if (!bars || bars.length <= i) continue;

			barSymbolData[symbolId] = {
				open: bars[i].open,
				high: bars[i].high,
				low: bars[i].low,
				close: bars[i].close,
				volume: bars[i].volume,
			};

			if (basePrice !== 0) {
				if (i === baselineIndex) {
					barNormalizedPrices[symbolId] = 0;
				} else {
					barNormalizedPrices[symbolId] = ((bars[i].close - basePrice) / basePrice) * 100;
				}
			}
		}

		symbolData.push(barSymbolData);
		normalizedPrices.push(barNormalizedPrices);
	}

	// Primary symbol as a VALUE (A3 Baseline). Written last so a real overlay
	// ticker can never be shadowed by it, and only for the reserved key the
	// engine accessor reads.
	if (primarySymbolKey && basePrice !== 0) {
		for (let i = 0; i < barCount; i++) {
			normalizedPrices[i][primarySymbolKey] = i === baselineIndex
				? 0
				: ((primaryBars[i].close - basePrice) / basePrice) * 100;
		}
	}

	return { symbolData, normalizedPrices };
}
