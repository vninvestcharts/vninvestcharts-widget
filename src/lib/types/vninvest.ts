/**
 * Shared VNInvest domain type definitions.
 *
 * This module is the canonical home for cross-layer types used by
 * widget/core/lib modules. Demo should consume these types, not own them.
 */

export interface TechnicalIndicators {
	bias?: number;
	rsi14?: number;
	sma20?: number;
	sma50?: number;
	sma200?: number;
	ema9?: number;
	ema21?: number;
	macd?: number;
	macd_signal?: number;
	macd_histogram?: number;
	atr_14?: number;
	bb_upper?: number;
	bb_middle?: number;
	bb_lower?: number;
	volume_sma20?: number;
}

export interface ChartPoint {
	/** ISO 8601 date string */
	date: string;
	open: number;
	high: number;
	low: number;
	close: number;
	volume: number;
}

export interface ChartResponse {
	symbol: string;
	days: number;
	timeframe: string;
	points: ChartPoint[];
	technical?: TechnicalIndicators;
}

export interface StockItem {
	symbol: string;
	company_name: string;
	exchange: string;
	sector?: string;
}

export interface TickerResponse {
	symbol: string;
	current_price: number;
	change_pct: number;
	volume: number;
	market_phase: string;
}

export type WhaleSizeClass = "small" | "shark" | "whale";
export type WhaleSide = "buy" | "sell";

export interface WhaleOrder {
	/** ISO 8601 timestamp string */
	ts: string;
	price: number;
	volume: number;
	matched_value: number;
	side: WhaleSide;
	size_class: WhaleSizeClass;
}

export interface WhaleOrderSummary {
	buy_value: number;
	sell_value: number;
	shark_buy: number;
	shark_sell: number;
	whale_buy: number;
	whale_sell: number;
	small_buy: number;
	small_sell: number;
}

export interface WhaleFeedResponse {
	symbol: string;
	whale_orders: WhaleOrder[];
	summary: WhaleOrderSummary;
	/**
	 * Native backend alerts (GET /realtime/whale-feed/{symbol}/, verified live 2026-09-21).
	 * Present when the server returns `{symbol, alerts[]}` instead of the legacy
	 * `{summary, whale_orders}` contract. Rendered as a notification list — never
	 * coerced into WhaleOrder (alerts carry no price/volume).
	 */
	alerts?: WhaleAlert[];
}

/** One native whale/signal alert from GET /realtime/whale-feed/{symbol}/. */
export interface WhaleAlert {
	/** UUID string. */
	id: string;
	/** e.g. "signal" | "whale". */
	alert_type: string;
	/** e.g. "low" | "medium" | "high". */
	severity: string;
	title: string;
	/** Score-ish string on signal alerts — NOT a VND value. Kept raw. */
	value: string | number | null;
	/** e.g. "buy" | "sell". */
	direction: string;
	/** ISO 8601 timestamp string. */
	triggered_at: string;
}

export interface IntradayTrade {
	/** HH:MM:SS time string */
	time: string;
	price: number;
	volume: number;
	side: WhaleSide;
}

export interface IntradayResponse {
	symbol: string;
	trades: IntradayTrade[];
}

export interface APIError {
	detail: string;
}

// Order Flow / CVD / Dark Flow

/** One intraday CVD bucket from compute_cvd_series. */
export interface CVDPoint {
	/** ISO 8601 datetime - today + bucket start time. */
	bucket_ts: string;
	buy_value: number;
	sell_value: number;
	/** Net delta for this bucket (buy_value - sell_value). */
	cvd: number;
	/** Running cumulative delta from session start. */
	cumulative_cvd: number;
}

export type DarkFlowSignalType = "none" | "absorption" | "iceberg" | "twap_bot" | "mixed";

/** Dark flow strength result from detect_dark_flow. */
export interface DarkFlowResult {
	signal_type: DarkFlowSignalType;
	/** 0-100 composite strength score. */
	strength: number;
	/** 0-1 confidence. */
	confidence: number;
	components?: Record<string, unknown>;
	triggered_at?: string | null;
}

export interface OrderFlowSignal {
	// BE-04b: native backend uses UUID string ids and omits severity on signals —
	// relaxed (verified live 2026-09-21). Numeric ids from the legacy contract still fit.
	id: number | string;
	symbol: string;
	signal_type: string;
	strength: number;
	confidence: number;
	tick_rate: number;
	small_order_ratio: number;
	cvd_at_signal: number | null;
	price_at_signal: number | null;
	created_at: string;
	event_id: string | null;
	severity?: string;
}

/** Response from GET /api/stock-management/stocks/<symbol>/order-flow/. */
export interface OrderFlowResponse {
	ok: boolean;
	symbol: string;
	window: string;
	window_minutes: number;
	latest_signal: OrderFlowSignal | null;
	signals: OrderFlowSignal[];
	cvd_series: CVDPoint[];
	dark_flow: DarkFlowResult;
	tick_rate: Record<string, unknown>;
	size_distribution: Record<string, unknown>;
}

// Slice O: Tape Reading

/** A single intraday tape entry (one matched trade or large order). */
export interface TapeEntry {
	/** Unique identifier for React keying (server id or client-generated). */
	id: string;
	/** ISO 8601 timestamp of the trade. */
	ts: string;
	/** Trade price. */
	price: number;
	/** Volume in shares/contracts. */
	volume: number;
	/** Trade value in VND (raw, not billions). */
	value: number;
	/** Direction of the aggressive side. */
	side: "buy" | "sell" | "unknown";
	/** True when value exceeds whale threshold - triggers highlight. */
	is_whale: boolean;
}

/** HTTP envelope for GET /core/v1/market-data/intraday-tape/ */
export interface TapeResponse {
	ok: boolean;
	symbol: string;
	entries: TapeEntry[];
}

// Slice I: AI Advisory

/** Decision signal returned by AI advisory session. */
export type AdvisoryDecision =
	| "STRONG_BUY"
	| "BUY"
	| "HOLD"
	| "SELL"
	| "STRONG_SELL";

/** Per-agent score within an advisory session response. */
export interface AgentScore {
	/** Agent identifier: "whale" | "tech" | "risk" | "sentiment". */
	name: string;
	/** Portfolio weight (0-1), e.g. 0.4 for whale agent. */
	weight: number;
	/** Raw score in [−100, 100]. Positive = bullish. */
	score: number;
	/** Signal label for this agent. */
	signal: AdvisoryDecision;
	/** Markdown-formatted explanation from this agent. */
	explanation: string;
}

/** Full advisory result returned from POST /api/stock_ai_advisory_session/. */
export interface AdvisoryResult {
	/** Aggregated decision across all agents. */
	decision: AdvisoryDecision;
	/** Aggregate confidence in [0, 1]. */
	confidence: number;
	/** Weighted composite score in [−100, 100]. */
	weighted_score: number;
	/** Per-agent breakdown - typically 4 agents. */
	agents: readonly AgentScore[];
	/** Markdown summary explanation. */
	explanation: string;
	/** ISO 8601 UTC timestamp when the analysis was triggered. */
	triggered_at: string;
}

/** HTTP envelope for POST /api/stock_ai_advisory_session/ (legacy, 404 on current backend). */
export interface AdvisorySessionResponse {
	ok: boolean;
	symbol: string;
	result?: AdvisoryResult;
	/** Error message when ok is false. */
	error?: string;
}

// Slice A-followup: native AI advisory session (decision A, verified live 2026-09-21)

/** Decision block inside aggregate — actions are lowercase backend values. */
export interface AdvisoryDecisionBlock {
	action: string | null;
	risk: string | null;
	score_band: string | null;
	score: number | null;
}

/** Aggregate block of the native advisory session payload. */
export interface AdvisoryAggregate {
	advisory_id: string;
	session_date: string;
	selected_trade_date: string;
	contract_version: string;
	decision: AdvisoryDecisionBlock;
}

/** One analysis component (indicator/flow/summary) of the native session. */
export interface AdvisoryComponent {
	id: number;
	symbol: string;
	component_type: string;
	indicator_name: string;
	status: string;
	confidence_score: number;
	suggested_action: string;
	rationale_text: string;
	timeframe: string;
	include_in_summary: boolean;
	is_deleted: boolean;
	created_at: string;
	updated_at: string;
}

/** Executive summary built from active components. */
export interface AdvisoryExecutiveSummary {
	symbol: string;
	session_date: string;
	strategy_action: string | null;
	risk_level: string | null;
	overall_confidence: number | null;
	score_band: string | null;
	summary_text: string;
	component_ids: number[];
	active_components_count: number;
	source: string;
}

/** Native record fields spread at session top level by the backend. */
export interface AdvisoryRecordFields {
	status?: string;
	advisory_text?: string | null;
	ai_model?: string | null;
	tokens_used?: number | null;
	strategy_action?: string | null;
	risk_level?: string | null;
	confidence_score?: number | null;
}

/**
 * GET /core/v1/stock-management/stocks/{symbol}/ai-advisory-session/ response.
 * Empty state: `{queued: false, reason: "no_advisory_data", advisory: null, ...}`.
 * Record state: advisory/aggregate/components/executive_summary populated.
 */
export interface AdvisorySessionV2 extends AdvisoryRecordFields {
	queued: boolean;
	symbol: string;
	contract_version: string;
	reason?: string | null;
	message?: string | null;
	advisory: Record<string, unknown> | null;
	aggregate: AdvisoryAggregate | null;
	components: AdvisoryComponent[];
	deleted_components: AdvisoryComponent[];
	executive_summary: AdvisoryExecutiveSummary | null;
	executive_summaries: AdvisoryExecutiveSummary[];
	user_ai_provider: string | null;
	effective_ai_provider: string | null;
	effective_ai_model: string | null;
	effective_ai_source: string | null;
}

// Historical chart data

/** Raw API chart point before normalization - fields may be null. */
export interface NullableChartPoint {
	/** ISO 8601 date string */
	date: string;
	open: number | null;
	high: number | null;
	low: number | null;
	close: number | null;
	volume: number | null;
}

export interface RawOHLCVBar {
	date: Date;
	open: number;
	high: number;
	low: number;
	close: number;
	volume: number;
	technical?: Partial<TechnicalIndicators>;
}