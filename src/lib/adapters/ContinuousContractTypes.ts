/**
 * Continuous Futures Contract Types
 *
 * Defines types for continuous futures contracts with roll logic and back-adjustment.
 * Supports multiple roll methods: Ratio, Panama (Cumulative Difference), Backward Ratio.
 */

import type { KLineBar } from "./DataAdapter";

/** Futures contract metadata */
export interface FuturesContract {
	/** Unique contract identifier (e.g., "VN30F2409", "VN30F2412") */
	symbol: string;
	/** Underlying symbol (e.g., "VN30F") */
	rootSymbol: string;
	/** Expiry date (Unix ms) */
	expiry: number;
	/** First trading date (Unix ms) */
	firstTradeDate: number;
	/** Last trading date (Unix ms) - typically a few days before expiry */
	lastTradeDate: number;
	/** Contract month code (F, G, H, J, K, M, N, Q, U, V, X, Z) */
	monthCode: string;
	/** Contract year (2-digit) */
	year: number;
	/** Tick size */
	tickSize: number;
	/** Contract multiplier */
	multiplier: number;
	/** Exchange */
	exchange: string;
}

/** Continuous contract configuration */
export interface ContinuousContractConfig {
	/** Root symbol for the continuous contract (e.g., "VN30F1M" for front month) */
	rootSymbol: string;
	/** Roll method to use */
	rollMethod: RollMethod;
	/** Roll trigger: days before expiry or volume-based */
	rollTrigger: RollTrigger;
	/** Days before expiry to roll (if rollTrigger === "days-before-expiry") */
	rollDaysBeforeExpiry?: number;
	/** Volume threshold for volume-based roll (if rollTrigger === "volume") */
	volumeThreshold?: number;
	/** Whether to adjust volumes during back-adjustment */
	adjustVolumes: boolean;
	/** Custom roll calendar (overrides auto-detection) */
	customRollDates?: number[]; // Unix ms timestamps
}

/** Roll adjustment methods */
export type RollMethod =
	| "ratio"           // Ratio adjustment (multiply prior contract)
	| "panama"          // Panama / Cumulative Difference (add difference)
	| "backward-ratio"; // Backward ratio (adjust forward contract)

/** Roll trigger types */
export type RollTrigger =
	| "days-before-expiry"  // Roll N days before expiry
	| "volume"              // Roll when next contract volume exceeds current
	| "open-interest"       // Roll when next contract OI exceeds current
	| "custom";             // Use customRollDates

/** Roll point information */
export interface RollPoint {
	/** Timestamp of roll (Unix ms) */
	timestamp: number;
	/** Expiring contract symbol */
	fromContract: string;
	/** New contract symbol */
	toContract: string;
	/** Price of expiring contract at roll */
	fromPrice: number;
	/** Price of new contract at roll */
	toPrice: number;
	/** Adjustment factor applied */
	adjustmentFactor: number;
	/** Cumulative adjustment up to this point (for Panama) */
	cumulativeAdjustment: number;
	/** Roll method used */
	method: RollMethod;
}

/** Continuous contract metadata returned by adapter */
export interface ContinuousContractMetadata {
	/** Root symbol */
	rootSymbol: string;
	/** All contracts in the chain */
	contracts: FuturesContract[];
	/** Roll points in chronological order */
	rollPoints: RollPoint[];
	/** Current active contract */
	activeContract: string;
	/** Next roll date (Unix ms) */
	nextRollDate: number | null;
	/** Total cumulative adjustment (for Panama method) */
	totalCumulativeAdjustment: number;
	/** Data range available */
	dataRange: {
		from: number;
		to: number;
	};
}

/** Parameters for fetching continuous contract bars */
export interface GetContinuousBarsParams {
	/** Continuous contract root symbol (e.g., "VN30F1M") */
	rootSymbol: string;
	/** Timeframe/interval */
	interval: string;
	/** Fetch type */
	type: "init" | "forward" | "backward";
	/** Anchor timestamp for backward fetch */
	timestamp: number | null;
	/** Maximum bars to return */
	limit: number;
	/** Abort signal */
	signal?: AbortSignal;
	/** Override roll config for this request */
	rollConfig?: Partial<ContinuousContractConfig>;
}

/** Result with continuous contract bars and metadata */
export interface GetContinuousBarsResult {
	/** Adjusted continuous bars */
	bars: KLineBar[];
	/** Whether more historical data available */
	hasMore: boolean;
	/** Metadata about the continuous contract */
	metadata: ContinuousContractMetadata;
	/** Roll points within the returned range */
	rollPointsInRange: RollPoint[];
}

/** Server-side stitching request (BFF) */
export interface StitchContinuousRequest {
	rootSymbol: string;
	interval: string;
	from: number;
	to: number;
	rollConfig: ContinuousContractConfig;
}

/** Server-side stitching response (BFF) */
export interface StitchContinuousResponse {
	bars: KLineBar[];
	metadata: ContinuousContractMetadata;
	rollPoints: RollPoint[];
	/** Source contracts used */
	sourceContracts: string[];
	/** Any warnings (e.g., missing data gaps) */
	warnings: string[];
}

/** Futures contract calendar entry */
export interface ContractCalendarEntry {
	rootSymbol: string;
	contracts: FuturesContract[];
	/** Typical roll schedule (e.g., "quarterly", "monthly", "serial") */
	rollSchedule: "monthly" | "quarterly" | "serial" | "custom";
	/** Exchange trading hours */
	tradingHours: {
		timezone: string;
		sessions: Array<{
			open: string; // HH:mm
			close: string; // HH:mm
			days: number[]; // 0=Sun, 1=Mon, ...
		}>;
	};
}

/** Default roll configurations for known VN futures */
export const DEFAULT_VN_FUTURES_ROLL_CONFIG: Record<string, ContinuousContractConfig> = {
	"VN30F1M": {
		rootSymbol: "VN30F",
		rollMethod: "ratio",
		rollTrigger: "days-before-expiry",
		rollDaysBeforeExpiry: 3,
		adjustVolumes: true,
	},
	"VN30F1M-panama": {
		rootSymbol: "VN30F",
		rollMethod: "panama",
		rollTrigger: "days-before-expiry",
		rollDaysBeforeExpiry: 3,
		adjustVolumes: true,
	},
	"VN30F3M": {
		rootSymbol: "VN30F",
		rollMethod: "ratio",
		rollTrigger: "days-before-expiry",
		rollDaysBeforeExpiry: 5,
		adjustVolumes: true,
	},
};