/**
 * H-01 — VNInvestDataAdapter
 *
 * Thin facade over VNInvestClient that exposes typed domain methods for
 * whale events and dark-flow signals consumed by widget overlays.
 *
 * Architecture note: This layer lives in src/demo/dataSources/ rather than
 * src/widget/ due to the tech-debt-INT-01 decision (widget migration deferred).
 * Widget props (enableWhale, enableCVD, darkFlowStrength, darkFlowSignalType)
 * are already exposed in VNInvestCharts.tsx and wired from LibraryShowcaseDemo.
 */

import type { VNInvestClient } from "../../widget/adapters/VNInvestClient";
import type { WhaleAlert } from "../../lib/types/vninvest";
import type {
	WhaleSide,
	WhaleSizeClass,
	DarkFlowResult,
	DarkFlowSignalType,
} from "../vninvest/types";

// ── Public types ─────────────────────────────────────────────────────────────

/** Normalised whale order event returned by getWhaleEvents(). */
export interface WhaleEvent {
	/** ISO 8601 timestamp string. */
	ts: string;
	side: WhaleSide;
	/** Matched order value in VND. */
	value: number;
	/** Order size classification. */
	severity: WhaleSizeClass;
	/**
	 * Normalised score in [0, 1].
	 * score = min(1, value / (10 × threshold))
	 */
	score: number;
	price: number;
}

export interface GetWhaleEventsOptions {
	/** Minimum matched_value to include (default: 1_000_000 VND). */
	threshold?: number;
	/** Only include events with ts ≥ since (Unix ms). */
	since?: number;
}

// ── Class ────────────────────────────────────────────────────────────────────

export class VNInvestDataAdapter {
	constructor(private readonly client: VNInvestClient) {}

	/**
	 * H-01: Fetch whale order events for a symbol and map them to the canonical
	 * WhaleEvent shape used by widget overlays.
	 *
	 * Returns an empty array on network or auth error; never throws.
	 */
	async getWhaleEvents(
		symbol: string,
		opts?: GetWhaleEventsOptions,
	): Promise<WhaleEvent[]> {
		const feed = await this.client.getWhaleFeed(symbol).catch(() => null);
		if (!feed || !Array.isArray(feed.whale_orders)) return [];

		const threshold = opts?.threshold ?? 1_000_000;

		return feed.whale_orders
			.filter((order) => order.matched_value >= threshold)
			.filter((order) => {
				if (opts?.since === undefined) return true;
				return new Date(order.ts).getTime() >= opts.since;
			})
			.map((order) => ({
				ts: order.ts,
				side: order.side,
				value: order.matched_value,
				severity: order.size_class,
				score: Math.min(1, order.matched_value / (10 * threshold)),
				price: order.price,
			}));
	}

	/**
	 * Follow-up whale-alerts: fetch native alert list for a symbol.
	 *
	 * Returns an empty array on network or auth error, or when the backend serves
	 * the legacy summary contract (no alerts); never throws.
	 */
	async getWhaleAlerts(symbol: string): Promise<WhaleAlert[]> {
		const feed = await this.client.getWhaleFeed(symbol).catch(() => null);
		if (!feed || !Array.isArray(feed.alerts)) return [];
		return feed.alerts;
	}

	/**
	 * H-04: Fetch dark flow strength and signal type from the order-flow endpoint.
	 *
	 * Returns null on network or auth error; never throws.
	 */
	async getDarkFlowStrength(
		symbol: string,
		window: "5m" | "15m" | "30m" | "1h" = "30m",
	): Promise<DarkFlowResult | null> {
		const flow = await this.client.getOrderFlow(symbol, window).catch(() => null);
		return flow?.dark_flow ?? null;
	}

	/**
	 * H-04: Convenience method returning just the signal type string,
	 * defaulting to "none" when no data is available.
	 */
	async getDarkFlowSignalType(
		symbol: string,
	): Promise<DarkFlowSignalType> {
		const result = await this.getDarkFlowStrength(symbol);
		return result?.signal_type ?? "none";
	}
}
