/**
 * BE-01/BE-03/BE-04b — Native backend shape mappings (verified live 2026-09-21).
 *
 * The backend serves shapes that differ from the legacy ok-wrapped contracts:
 * bars limit max 1000, tape as {symbol, trades[]}, order-flow without `ok`.
 * This module holds the clamps and mappers so VNInvestClient stays within budget.
 * Only derivable fields are mapped — nothing is fabricated (see mapNativeTape notes).
 */

import type {
	DarkFlowSignalType,
	OrderFlowResponse,
	OrderFlowSignal,
	TapeEntry,
	TapeResponse,
	WhaleAlert,
	WhaleFeedResponse,
	WhaleOrderSummary,
} from "../../lib/types/vninvest";

/** Backend `_OHLCV_BAR_LIMIT_MAX` — requests above it get HTTP 400 LIMIT_EXCEEDED. */
export const BARS_LIMIT_MAX = 1000;

/** Clamp any caller-supplied bars limit into the backend-accepted range. */
export function clampBarsLimit(raw: number | undefined): number | undefined {
	if (raw == null) return raw;
	if (!Number.isFinite(raw)) return BARS_LIMIT_MAX;
	return Math.max(1, Math.min(BARS_LIMIT_MAX, Math.floor(raw)));
}

const ORDER_FLOW_WINDOW_MINUTES: Record<string, number> = { "5m": 5, "15m": 15, "30m": 30, "1h": 60 };

const DARK_FLOW_SIGNAL_TYPES: readonly string[] = ["none", "absorption", "iceberg", "twap_bot", "mixed"];

function parseDarkFlowSignalType(value: unknown): DarkFlowSignalType {
	return typeof value === "string" && DARK_FLOW_SIGNAL_TYPES.includes(value)
		? (value as DarkFlowSignalType)
		: "none";
}

function asFiniteNumber(value: unknown): number | null {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim() !== "") {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : null;
	}
	return null;
}

function mapNativeSignal(s: Record<string, unknown>): OrderFlowSignal {
	return {
		id: typeof s["id"] === "number" || typeof s["id"] === "string" ? s["id"] : -1,
		symbol: typeof s["symbol"] === "string" ? s["symbol"] : "",
		signal_type: typeof s["signal_type"] === "string" ? s["signal_type"] : "unknown",
		strength: asFiniteNumber(s["strength"]) ?? 0,
		confidence: asFiniteNumber(s["confidence"]) ?? 0,
		tick_rate: asFiniteNumber(s["tick_rate"]) ?? 0,
		small_order_ratio: asFiniteNumber(s["small_order_ratio"]) ?? 0,
		cvd_at_signal: asFiniteNumber(s["cvd_at_signal"]),
		price_at_signal: asFiniteNumber(s["price_at_signal"]),
		created_at: typeof s["created_at"] === "string" ? s["created_at"] : "",
		event_id: typeof s["event_id"] === "string" ? s["event_id"] : null,
		severity: typeof s["severity"] === "string" ? s["severity"] : undefined,
	};
}

/**
 * Map the native order-flow shape (no `ok` wrapper) into OrderFlowResponse.
 * Series the backend does not send (cvd_series) stay empty — never fabricated.
 */
export function mapNativeOrderFlow(obj: Record<string, unknown>, window: string): OrderFlowResponse {
	const rawSignals = Array.isArray(obj["signals"]) ? (obj["signals"] as Record<string, unknown>[]) : [];
	const darkRaw = (obj["dark_flow"] as Record<string, unknown> | undefined) ?? {};
	const latestRaw = (obj["latest_signal"] as Record<string, unknown> | undefined) ?? null;
	return {
		ok: true,
		symbol: typeof obj["symbol"] === "string" ? obj["symbol"] : "",
		window: typeof obj["window"] === "string" ? (obj["window"] as string) : window,
		window_minutes: ORDER_FLOW_WINDOW_MINUTES[window] ?? 30,
		latest_signal: latestRaw ? mapNativeSignal(latestRaw) : null,
		signals: rawSignals.map(mapNativeSignal),
		cvd_series: [],
		dark_flow: {
			signal_type: parseDarkFlowSignalType(darkRaw["signal_type"]),
			strength: asFiniteNumber(darkRaw["strength"]) ?? 0,
			confidence: asFiniteNumber(darkRaw["confidence"]) ?? 0,
			components: (darkRaw["components"] as Record<string, unknown> | undefined),
			triggered_at: typeof darkRaw["triggered_at"] === "string" ? (darkRaw["triggered_at"] as string) : null,
		},
		tick_rate: (obj["tick_rate"] as Record<string, unknown> | undefined) ?? {},
		size_distribution: (obj["size_distribution"] as Record<string, unknown> | undefined) ?? {},
	};
}

const ZERO_WHALE_SUMMARY: WhaleOrderSummary = {
	buy_value: 0,
	sell_value: 0,
	shark_buy: 0,
	shark_sell: 0,
	whale_buy: 0,
	whale_sell: 0,
	small_buy: 0,
	small_sell: 0,
};

/**
 * Map the native whale-feed shape ({symbol, alerts[]}, verified live 2026-09-21)
 * into WhaleFeedResponse. Alerts are passed through verbatim (no price/volume on
 * the wire — never coerced into WhaleOrder); orders/summary stay empty-zero so the
 * summary table renders an honest empty state while the alerts list shows data.
 */
export function mapNativeWhaleFeed(obj: Record<string, unknown>): WhaleFeedResponse {
	const rawAlerts = Array.isArray(obj["alerts"]) ? (obj["alerts"] as Record<string, unknown>[]) : [];
	const alerts: WhaleAlert[] = rawAlerts.map((a) => ({
		id: typeof a["id"] === "string" ? a["id"] : "",
		alert_type: typeof a["alert_type"] === "string" ? a["alert_type"] : "signal",
		severity: typeof a["severity"] === "string" ? a["severity"] : "",
		title: typeof a["title"] === "string" ? a["title"] : "",
		value: typeof a["value"] === "string" || typeof a["value"] === "number" ? a["value"] : null,
		direction: typeof a["direction"] === "string" ? a["direction"] : "",
		triggered_at: typeof a["triggered_at"] === "string" ? a["triggered_at"] : "",
	}));
	return {
		symbol: typeof obj["symbol"] === "string" ? obj["symbol"] : "",
		whale_orders: [],
		summary: { ...ZERO_WHALE_SUMMARY },
		alerts,
	};
}

/**
 * Map the native tape shape ({symbol, trades:[{time,ts,price,volume,side,match_type}]})
 * into TapeResponse. `value` is derived (price × volume); `id` is client-generated
 * (allowed by TapeEntry docs); `is_whale` defaults false — whale highlighting needs
 * a threshold the mapping layer does not own.
 */
export function mapNativeTape(obj: Record<string, unknown>): TapeResponse {
	const rawTrades = Array.isArray(obj["trades"]) ? (obj["trades"] as Record<string, unknown>[]) : [];
	const entries: TapeEntry[] = rawTrades.map((t, index) => {
		const price = asFiniteNumber(t["price"]) ?? 0;
		const volume = asFiniteNumber(t["volume"]) ?? 0;
		const sideRaw = typeof t["side"] === "string" ? t["side"].toLowerCase() : "";
		const side: TapeEntry["side"] = sideRaw === "buy" || sideRaw === "sell" ? sideRaw : "unknown";
		const ts = typeof t["ts"] === "string" ? t["ts"] : (typeof t["time"] === "string" ? t["time"] : "");
		return {
			id: `${ts}|${price}|${volume}|${index}`,
			ts,
			price,
			volume,
			value: price * volume,
			side,
			is_whale: false,
		};
	});
	return {
		ok: true,
		symbol: typeof obj["symbol"] === "string" ? obj["symbol"] : "",
		entries,
	};
}

