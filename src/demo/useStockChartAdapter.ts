import { useMemo, useRef } from "react";

import type { CanonicalFetchResult, CoverageFragment, DataAdapter, SourceSemanticsDescriptor } from "../lib/adapters";
import type { StockDataAdapter } from "../lib/types/adapter";
import type { OHLCVBar } from "../lib/types/ohlcv";
import type { ActiveSource } from "./components/DataSourceSwitcher";

const DEFAULT_PAGE_LIMIT = 300;

type UseStockChartAdapterArgs = {
	activeSource: ActiveSource;
	dataAdapter: DataAdapter;
	selectedSymbol: string;
	useWidgetOwnedHistory: boolean;
	widgetData: readonly OHLCVBar[];
	backfillPageLimit: number;
};

function resolveEffectiveMaxBarsPerRequest(
	requestedBars: number,
	sourceSemantics: SourceSemanticsDescriptor,
) {
	const requested = Math.max(1, Math.floor(requestedBars));
	const sourceLimit = sourceSemantics.maxBarsPerRequest;
	if (typeof sourceLimit !== "number" || !Number.isFinite(sourceLimit) || sourceLimit <= 0) {
		return requested;
	}

	return Math.min(requested, Math.floor(sourceLimit));
}

function cloneWidgetBar(bar: OHLCVBar): OHLCVBar {
	return {
		...bar,
		date: new Date(bar.date),
	};
}

function mapKLineBarToWidgetBar(
	bar: {
		timestamp: number;
		open: number;
		high: number;
		low: number;
		close: number;
		volume: number;
	},
	index: number,
): OHLCVBar {
	return {
		date: new Date(bar.timestamp),
		open: bar.open,
		high: bar.high,
		low: bar.low,
		close: bar.close,
		volume: bar.volume,
		index,
		dataIndex: index,
	};
}

function buildExactRangeBackwardCoverage(
	bars: readonly OHLCVBar[],
	before: Date,
	limit: number,
	sourceSemantics: SourceSemanticsDescriptor,
): readonly CoverageFragment[] | null {
	if (sourceSemantics.coverageMode !== "exact-range" || !sourceSemantics.supportsBackwardAnchor) {
		return null;
	}

	const anchorTs = before.getTime();
	if (!Number.isFinite(anchorTs)) {
		return null;
	}

	if (bars.length === 0) {
		return [{ fromTs: 0, toTs: anchorTs, status: "unresolved", reason: "boundary-exhausted" }];
	}

	const oldestTs = bars[0]?.date.getTime();
	const newestTs = bars[bars.length - 1]?.date.getTime();
	if (!Number.isFinite(oldestTs) || !Number.isFinite(newestTs)) {
		return null;
	}

	return [{ fromTs: oldestTs, toTs: newestTs, status: "covered" }];
}

function buildExactRangeWindowCoverage(
	bars: readonly OHLCVBar[],
	from: Date,
	to: Date,
	sourceSemantics: SourceSemanticsDescriptor,
): readonly CoverageFragment[] | null {
	if (sourceSemantics.coverageMode !== "exact-range" || !sourceSemantics.supportsExactRangeFetch) {
		return null;
	}

	const fromTs = from.getTime();
	const toTs = to.getTime();
	if (!Number.isFinite(fromTs) || !Number.isFinite(toTs) || toTs < fromTs) {
		return null;
	}

	if (bars.length === 0) {
		return [{ fromTs, toTs, status: "unresolved", reason: "boundary-exhausted" }];
	}

	const firstTs = bars[0]?.date.getTime();
	const lastTs = bars[bars.length - 1]?.date.getTime();
	if (!Number.isFinite(firstTs) || !Number.isFinite(lastTs)) {
		return null;
	}

	return [{ fromTs: firstTs, toTs: lastTs, status: "covered" }];
}

function createFallbackSemantics(activeSource: ActiveSource, dataAdapter: DataAdapter): SourceSemanticsDescriptor {
	if (dataAdapter.name === "binance" || activeSource === "binance") {
		return {
			sourceId: "binance",
			sourceContractVersion: "binance-klines-v1",
			instrumentClass: "crypto",
			coverageMode: "exact-range",
			sessionModel: "continuous",
			timezone: "UTC",
			supportsExactRangeFetch: true,
			supportsBackwardAnchor: true,
			supportsForwardAnchor: false,
			supportsLiveBars: true,
			maxBarsPerRequest: 1000,
			finalityMode: "near-now-provisional",
			expectedGapReasons: ["not-fetched", "source-no-data", "rate-limited", "boundary-exhausted"],
		};
	}

	if (dataAdapter.name === "vnstocks" || activeSource === "vninvest") {
		return {
			sourceId: "vnstocks",
			sourceContractVersion: "vnstocks-window-v1",
			instrumentClass: "equity",
			coverageMode: "window-hint",
			sessionModel: "exchange-calendar",
			timezone: "Asia/Ho_Chi_Minh",
			sessionCalendarId: "vn-exchange-calendar",
			supportsExactRangeFetch: false,
			supportsBackwardAnchor: true,
			supportsForwardAnchor: false,
			supportsLiveBars: true,
			maxBarsPerRequest: 3650,
			finalityMode: "historically-correctable",
			expectedGapReasons: ["not-fetched", "market-closed", "source-no-data", "rate-limited", "boundary-exhausted"],
		};
	}

	return {
		sourceId: dataAdapter.name,
		sourceContractVersion: "local-archive-v1",
		instrumentClass: "custom",
		coverageMode: "finite-snapshot",
		sessionModel: "continuous",
		timezone: "UTC",
		supportsExactRangeFetch: false,
		supportsBackwardAnchor: true,
		supportsForwardAnchor: false,
		supportsLiveBars: false,
		finalityMode: "immutable",
		expectedGapReasons: ["not-fetched", "source-no-data", "boundary-exhausted", "retention-trimmed", "cache-corrupted"],
	};
}

export function useStockChartAdapter({
	activeSource,
	dataAdapter,
	selectedSymbol,
	useWidgetOwnedHistory,
	widgetData,
	backfillPageLimit,
}: UseStockChartAdapterArgs): StockDataAdapter {
	const widgetDataRef = useRef(widgetData);
	widgetDataRef.current = widgetData;
	const sourceSemantics = useMemo(
		() => dataAdapter.getSourceSemantics?.() ?? createFallbackSemantics(activeSource, dataAdapter),
		[activeSource, dataAdapter],
	);

	return useMemo<StockDataAdapter>(() => {
		const lastBackfillCoverageMap = new Map<string, readonly CoverageFragment[]>();
		const lastRangeCoverageMap = new Map<string, readonly CoverageFragment[]>();

		async function callGetBars(params: Parameters<DataAdapter["getBars"]>[0]): Promise<CanonicalFetchResult> {
			if (dataAdapter.getBarsCanonical) {
				return dataAdapter.getBarsCanonical(params);
			}
			const result = await dataAdapter.getBars(params);
			return { ...result, coverage: [] };
		}

		return {
			getSourceSemantics() {
				return sourceSemantics;
			},
			async fetchBarsInRange(symbol: string, timeframeValue: string, _from: Date, _to: Date, chartId?: string) {
				if (useWidgetOwnedHistory) {
					const scope = chartId ?? "__global__";
					const key = `${scope}:${symbol.toUpperCase()}:${timeframeValue}`;
					lastRangeCoverageMap.delete(key);
					if (dataAdapter.fetchBarsInRange) {
					// Forward chartId for adapters that support cursor-scoped backfill
					// (VNInvestDataAdapter uses position 5 as chartId for snapshotIds scoping).
					// BinanceAdapter uses position 5 as AbortSignal — we skip forwarding for it
					// to avoid passing a string where AbortSignal is expected.
						const bars = activeSource !== "binance"
							? await (dataAdapter as any).fetchBarsInRange(symbol, timeframeValue, _from, _to, chartId)
							: await dataAdapter.fetchBarsInRange(symbol, timeframeValue, _from, _to);
						const mappedBars = bars.map(mapKLineBarToWidgetBar);
						const coverage = buildExactRangeWindowCoverage(mappedBars, _from, _to, sourceSemantics);
						if (coverage) lastRangeCoverageMap.set(key, coverage);
						return mappedBars;
					}

					const result = await callGetBars({
						type: "init",
						symbol,
						interval: timeframeValue,
						timestamp: null,
						limit: backfillPageLimit,
					});
					if (result.coverage.length > 0) lastRangeCoverageMap.set(key, result.coverage);
					return result.bars.map(mapKLineBarToWidgetBar);
				}

				return widgetDataRef.current.map(cloneWidgetBar);
			},
			async fetchBarsBefore(symbol: string, timeframeValue: string, before: Date, limit = DEFAULT_PAGE_LIMIT, chartId?: string) {
				if (useWidgetOwnedHistory) {
					const scope = chartId ?? "__global__";
					const key = `${scope}:${symbol.toUpperCase()}:${timeframeValue}`;
					lastBackfillCoverageMap.delete(key);
					if (dataAdapter.fetchBarsBefore) {
					// Forward chartId for adapters that support cursor-scoped backfill
						const bars = activeSource !== "binance"
							? await (dataAdapter as any).fetchBarsBefore(symbol, timeframeValue, before, limit, chartId)
							: await dataAdapter.fetchBarsBefore(symbol, timeframeValue, before, limit);
						const mappedBars = bars.map(mapKLineBarToWidgetBar);
						const coverage = buildExactRangeBackwardCoverage(mappedBars, before, limit, sourceSemantics);
						if (coverage) lastBackfillCoverageMap.set(key, coverage);
						return mappedBars;
					}

					const result = await callGetBars({
						type: "backward",
						symbol,
						interval: timeframeValue,
						timestamp: before.valueOf(),
						limit,
					});
					if (result.coverage.length > 0) lastBackfillCoverageMap.set(key, result.coverage);
					return result.bars.map(mapKLineBarToWidgetBar);
				}

				return widgetDataRef.current
					.filter((bar) => bar.date < before)
					.slice(-limit)
					.map(cloneWidgetBar);
			},
			subscribeToBar(symbol, timeframe, onBar) {
				if (useWidgetOwnedHistory && typeof (dataAdapter as any).subscribeToBar === "function") {
					return (dataAdapter as any).subscribeToBar(symbol, timeframe, onBar);
				}
				return () => undefined;
			},
			subscribeToTrades(symbol, onTrade) {
				if (useWidgetOwnedHistory && typeof (dataAdapter as any).subscribeToTrades === "function") {
					return (dataAdapter as any).subscribeToTrades(symbol, onTrade);
				}
				return () => undefined;
			},
			subscribeToOrderbook(symbol, onUpdate) {
				if (useWidgetOwnedHistory && typeof (dataAdapter as any).subscribeToOrderbook === "function") {
					return (dataAdapter as any).subscribeToOrderbook(symbol, onUpdate);
				}
				return () => undefined;
			},
			async searchSymbols() {
				return [{ symbol: selectedSymbol, name: selectedSymbol, exchange: activeSource === "vninvest" ? "VNINVEST" : "BINANCE" }];
			},
			getLastBackfillCoverage(symbol?: string, timeframe?: string, chartId?: string) {
				if (!symbol || !timeframe) {
					if (lastBackfillCoverageMap.size > 0) {
						return lastBackfillCoverageMap.values().next().value ?? null;
					}
					return null;
				}
				const scope = chartId ?? "__global__";
				const key = `${scope}:${symbol.toUpperCase()}:${timeframe}`;
				return lastBackfillCoverageMap.get(key) ?? null;
			},
			getLastRangeCoverage(symbol?: string, timeframe?: string, chartId?: string) {
				if (!symbol || !timeframe) {
					if (lastRangeCoverageMap.size > 0) {
						return lastRangeCoverageMap.values().next().value ?? null;
					}
					return null;
				}
				const scope = chartId ?? "__global__";
				const key = `${scope}:${symbol.toUpperCase()}:${timeframe}`;
				return lastRangeCoverageMap.get(key) ?? null;
			},
		};
	}, [activeSource, backfillPageLimit, dataAdapter, selectedSymbol, sourceSemantics, useWidgetOwnedHistory]);
}