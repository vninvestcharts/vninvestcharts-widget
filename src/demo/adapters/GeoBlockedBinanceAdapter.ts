import type { BinanceAdapter } from "../../lib/adapters/BinanceAdapter";
import type { StockDataAdapter, Timeframe, Unsubscribe } from "../../lib/types/adapter";
import type { OHLCVBar } from "../../lib/types/ohlcv";
import { getOfflineDemoBars } from "../demoData";
import type { BinanceStockDataAdapter } from "./BinanceStockDataAdapter";

export type GeoBlockedStatus = "live" | "geo-blocked" | "offline";

/**
 * Demo-shell wrapper that keeps crypto charts usable where Binance answers
 * HTTP 451 (regional block). The lib BinanceAdapter already latches that signal
 * (isRegionBlocked) and degrades to empty results; this wrapper serves the
 * offline CSV slice instead — once per status transition, loudly — so users see
 * demo data with a visible status instead of an empty chart + console spam.
 *
 * Demo-only (Rule 8): no widget/production behavior changes.
 */
export class GeoBlockedBinanceAdapter implements StockDataAdapter {
	readonly name = "binance-geo-fallback";
	private warned = false;
	private forceOffline = false;
	private onStatus: ((status: GeoBlockedStatus) => void) | null = null;

	constructor(
		private readonly inner: BinanceStockDataAdapter,
		private readonly libAdapter: Pick<BinanceAdapter, "isRegionBlocked">,
	) {}

	/** Explicit offline toggle (same pattern as Library/MultiCharts demos). */
	setForceOffline(offline: boolean): void {
		this.forceOffline = offline;
		this.emitStatus();
	}

	onStatusChange(cb: (status: GeoBlockedStatus) => void): void {
		this.onStatus = cb;
	}

	getStatus(): GeoBlockedStatus {
		if (this.forceOffline) return "offline";
		if (this.libAdapter.isRegionBlocked()) return "geo-blocked";
		return "live";
	}

	private emitStatus(): void {
		this.onStatus?.(this.getStatus());
	}

	/**
	 * Serve the offline CSV inside the requested window.
	 *
	 * The bundled CSV is a fixed historical slice (2016-02-09 .. 2016-04-19),
	 * so filtering it by the caller's dates returns nothing: the chart asks for
	 * a window around `now`, which never intersects 2016. The chart then renders
	 * empty and every drawing interaction silently no-ops, because point
	 * resolution has no coordinate domain to work with.
	 *
	 * So the timestamps are re-anchored onto the requested window instead of
	 * filtered against it. `DemoVNInvestStockDataAdapter` does the same thing
	 * (shifting onto `Date.now()`), and keeping both fallbacks consistent means
	 * the demo behaves the same whether the geo-blocked Binance path or the
	 * VNInvest demo path serves the data.
	 */
	private offlineSlice(from: Date, to: Date): OHLCVBar[] {
		const raw = getOfflineDemoBars();
		if (raw.length === 0) return [];

		const fromMs = from.getTime();
		const toMs = to.getTime();
		const stepMs = (toMs - fromMs) / raw.length;

		// Anchor the last bar to `to` and walk backwards, so the slice always
		// lands inside the window the caller asked for.
		return raw.map((bar, i) => {
			const offsetFromEnd = raw.length - 1 - i;
			const date = new Date(toMs - offsetFromEnd * stepMs);
			return {
				date,
				open: bar.open,
				high: bar.high,
				low: bar.low,
				close: bar.close,
				volume: bar.volume,
				index: i,
				dataIndex: i,
			};
		});
	}

	private serveOffline(reason: string): void {
		if (!this.warned) {
			this.warned = true;
			console.warn(`[demo] Binance unavailable in this region (451) — serving offline CSV. ${reason}`);
		}
		this.emitStatus();
	}

	async fetchBarsInRange(symbol: string, timeframe: Timeframe, from: Date, to: Date): Promise<readonly OHLCVBar[]> {
		if (this.forceOffline) {
			this.emitStatus();
			return this.offlineSlice(from, to);
		}
		if (this.libAdapter.isRegionBlocked()) {
			this.serveOffline("latched from earlier 451");
			return this.offlineSlice(from, to);
		}
		const bars = await this.inner.fetchBarsInRange(symbol, timeframe, from, to);
		if (bars.length === 0 && this.libAdapter.isRegionBlocked()) {
			this.serveOffline("empty result with 451 latch");
			return this.offlineSlice(from, to);
		}
		this.emitStatus();
		return bars;
	}

	async fetchBarsBefore(symbol: string, timeframe: Timeframe, before: Date, limit?: number): Promise<readonly OHLCVBar[]> {
		if (this.forceOffline || this.libAdapter.isRegionBlocked()) {
			if (!this.forceOffline) this.serveOffline("latched from earlier 451");
			else this.emitStatus();
			return this.offlineSlice(new Date(before.getTime() - 90 * 86_400_000), before).slice(-(limit ?? 500));
		}
		const bars = await this.inner.fetchBarsBefore(symbol, timeframe, before, limit);
		if (bars.length === 0 && this.libAdapter.isRegionBlocked()) {
			this.serveOffline("empty result with 451 latch");
			return this.offlineSlice(new Date(before.getTime() - 90 * 86_400_000), before).slice(-(limit ?? 500));
		}
		this.emitStatus();
		return bars;
	}

	subscribeToBar(symbol: string, timeframe: Timeframe, onBar: (bar: OHLCVBar) => void): Unsubscribe {
		if (this.forceOffline || this.libAdapter.isRegionBlocked()) {
			// Static CSV has no live ticks — no-op (warned once on the fetch path).
			return () => {};
		}
		try {
			return this.inner.subscribeToBar(symbol, timeframe, onBar);
		} catch {
			return () => {};
		}
	}

	subscribeToTrades(): Unsubscribe {
		return () => {};
	}

	subscribeToOrderbook(): Unsubscribe {
		return () => {};
	}

	async searchSymbols() {
		return this.inner.searchSymbols();
	}

	getSourceSemantics() {
		return this.inner.getSourceSemantics();
	}
}
