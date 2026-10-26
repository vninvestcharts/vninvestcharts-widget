import type { StockDataAdapter, Timeframe, Unsubscribe, Trade, OrderbookSnapshot, SymbolInfo } from "../../lib/types/adapter";
import type { OHLCVBar } from "../../lib/types/ohlcv";
import type { CoverageFragment, SourceSemanticsDescriptor, GapReason } from "@vninvestcharts/engine-core";
import type { VNInvestDataSource } from "../dataSources";
import { getOfflineDemoBars, INTERVAL_MS_MAP } from "../demoData";

const offlineBarsCache = new Map<string, readonly OHLCVBar[]>();
const API_CACHE_DAYS = 3650;

export class DemoVNInvestStockDataAdapter implements StockDataAdapter {
	private readonly _apiCache = new Map<string, readonly OHLCVBar[]>();
	private readonly _loading = new Map<string, Promise<readonly OHLCVBar[]>>();

	constructor(private readonly source: VNInvestDataSource) {}

	private async getBars(symbol: string, tf: string): Promise<readonly OHLCVBar[]> {
		const cacheKey = `${symbol}|${tf}`;
		const cached = this._apiCache.get(cacheKey);
		if (cached) return cached;

		const inflight = this._loading.get(cacheKey);
		if (inflight) return inflight;

		const promise = this._fetchBars(symbol, tf, cacheKey);
		this._loading.set(cacheKey, promise);
		return promise;
	}

	private async _fetchBars(symbol: string, tf: string, cacheKey: string): Promise<readonly OHLCVBar[]> {
		try {
			let bars = await Promise.race([
				this.source.loadBars(symbol, { timeframe: tf, days: API_CACHE_DAYS }),
				new Promise<never>((_, reject) => setTimeout(() => reject(new Error("API_TIMEOUT")), 5000)),
			]);

			const isIntraday = tf.endsWith("m") || tf.endsWith("h") || tf.endsWith("H") || tf === "none";
			if (bars.length < 2 && isIntraday) {
				try {
					const dailyBars = await Promise.race([
						this.source.loadBars(symbol, { timeframe: "D", days: API_CACHE_DAYS }),
						new Promise<never>((_, reject) => setTimeout(() => reject(new Error("API_TIMEOUT")), 5000)),
					]);
					if (dailyBars.length >= 2) {
						const intervalMs = INTERVAL_MS_MAP[tf] ?? 3600000;
						const upSampled: typeof bars = [];
						for (const dBar of dailyBars) {
							const dDate = new Date(dBar.date);
							// Set base time to 9:00 AM local time (2:00 AM UTC for GMT+7)
							dDate.setUTCHours(2, 0, 0, 0);
							const baseTime = dDate.getTime();

							// Market session: 6 hours (9:00 - 15:00)
							const sessionDurationMs = 6 * 3600000;
							const steps = Math.max(1, Math.floor(sessionDurationMs / intervalMs));

							for (let step = 0; step < steps; step++) {
								const barTime = new Date(baseTime + step * intervalMs);
								upSampled.push({
									date: barTime,
									open: dBar.open,
									high: dBar.high,
									low: dBar.low,
									close: dBar.close,
									volume: Math.round(dBar.volume / steps),
								});
							}
						}bars = upSampled;
					}
				} catch (upSampleErr) {}
			}

			if (bars.length < 2) {
				const offline = this.getOfflineBars(tf);
				const fallback = [...offline];
				(fallback as any).isFallback = true;
				this._apiCache.set(cacheKey, fallback);
				this._loading.delete(cacheKey);
				return fallback;
			}
			const mapped = bars.map((b, i) => ({
				date: b.date, open: b.open, high: b.high,
				low: b.low, close: b.close, volume: b.volume,
				index: i, dataIndex: i,
			}));
			this._apiCache.set(cacheKey, mapped);
			this._loading.delete(cacheKey);
			return mapped;
		} catch (err) {
			const bars = this.getOfflineBars(tf);
			const fallback = [...bars];
			(fallback as any).isFallback = true;
			this._apiCache.set(cacheKey, fallback);
			this._loading.delete(cacheKey);
			return fallback;
		}
	}

	private getOfflineBars(tf: string): readonly OHLCVBar[] {
		const cached = offlineBarsCache.get(tf);
		if (cached) {
			return cached;
		}
		const intervalMs = INTERVAL_MS_MAP[tf] ?? 60_000;
		const now = Date.now();
		const raw = getOfflineDemoBars();
		const shifted = raw.map((bar, i) => {
			const shiftedDate = new Date(now - (raw.length - 1 - i) * intervalMs);
			return {
				date: shiftedDate,
				open: bar.open,
				high: bar.high,
				low: bar.low,
				close: bar.close,
				volume: bar.volume,
				index: i,
				dataIndex: i,
			};
		});
		(shifted as any).isFallback = true;
		offlineBarsCache.set(tf, shifted);return shifted;
	}

	async fetchBarsInRange(symbol: string, tf: Timeframe, from: Date, to: Date): Promise<readonly OHLCVBar[]> {
		const all = await this.getBars(symbol, tf);
		const filtered = all.filter(b => b.date >= from && b.date <= to).map((b, i) => ({ ...b, index: i, dataIndex: i }));
		if ((all as any).isFallback) {
			(filtered as any).isFallback = true;
		}
		return filtered;
	}

	async fetchBarsBefore(symbol: string, tf: Timeframe, before: Date, limit?: number): Promise<readonly OHLCVBar[]> {
		const all = await this.getBars(symbol, tf);
		const filtered = all.filter(b => b.date < before).slice(-(limit ?? 300)).map((b, i) => ({ ...b, index: i, dataIndex: i }));
		if ((all as any).isFallback) {
			(filtered as any).isFallback = true;
		}
		return filtered;
	}

	subscribeToBar(): Unsubscribe {
		return () => {};
	}

	subscribeToTrades(): Unsubscribe {
		return () => {};
	}

	subscribeToOrderbook(): Unsubscribe {
		return () => {};
	}

	async searchSymbols(query: string): Promise<readonly SymbolInfo[]> {
		const results = await this.source.searchSymbols(query);
		return results.map(r => ({
			symbol: r.symbol,
			name: r.company_name,
			exchange: r.exchange,
		}));
	}

	getSourceSemantics(): SourceSemanticsDescriptor {
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
			expectedGapReasons: [
				"market-closed",
				"source-no-data",
				"rate-limited",
				"boundary-exhausted",
			] as readonly GapReason[],
		};
	}
}
