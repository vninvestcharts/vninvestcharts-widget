/**
 * ContinuousContractAdapter - Client-side adapter for continuous futures contracts
 *
 * Implements DataAdapter interface for seamless integration with chart widget.
 * Delegates heavy stitching computation to BFF (ContinuousContractAdapter.server.ts)
 * but provides local roll logic for immediate feedback and offline capability.
 */

import type {
	DataAdapter,
	KLineBar,
	GetBarsParams,
	GetBarsResult,
	CanonicalFetchResult,
} from "./DataAdapter";
import type {
	SourceSemanticsDescriptor,
	CoverageFragment,
	GapReason,
	FinalityMode,
	CoverageMode,
	SessionModel,
} from "@vninvestcharts/engine-core";
import type {
	ContinuousContractConfig,
	ContinuousContractMetadata,
	GetContinuousBarsParams,
	GetContinuousBarsResult,
	RollMethod,
	RollPoint,
	FuturesContract,
	DEFAULT_VN_FUTURES_ROLL_CONFIG,
} from "./ContinuousContractTypes";
import { DEFAULT_VN_FUTURES_ROLL_CONFIG as DEFAULT_CONFIG } from "./ContinuousContractTypes";
import { createAdapterLogger } from '../utils/logger';

const log = createAdapterLogger('continuous-contract');

/** BFF endpoint for server-side stitching */
const BFF_ENDPOINT = "/api/continuous-futures/stitch";

/** In-memory cache for contract metadata */
const metadataCache = new Map<string, ContinuousContractMetadata>();

/** In-memory cache for stitched bars (by rootSymbol + interval + range) */
const barsCache = new Map<string, KLineBar[]>();

export class ContinuousContractAdapter implements DataAdapter {
	readonly name = "continuous-futures";

	private config: ContinuousContractConfig;
	private rootSymbol: string;
	private fetchRawBars?: (symbol: string, timeframe: string, from: Date, to: Date) => Promise<readonly KLineBar[]>;

	constructor(
		rootSymbol: string,
		config?: Partial<ContinuousContractConfig>,
		fetchRawBars?: (symbol: string, timeframe: string, from: Date, to: Date) => Promise<readonly KLineBar[]>
	) {
		this.rootSymbol = rootSymbol;
		// Merge with defaults
		const defaultConfig = DEFAULT_CONFIG[rootSymbol] ?? DEFAULT_CONFIG["VN30F1M"];
		this.config = { ...defaultConfig, ...config, rootSymbol };
		this.fetchRawBars = fetchRawBars;
	}

	/** Get the continuous contract configuration */
	getConfig(): ContinuousContractConfig {
		return { ...this.config };
	}

	/** Update roll configuration */
	setConfig(config: Partial<ContinuousContractConfig>): void {
		this.config = { ...this.config, ...config };
		// Invalidate cache on config change
		metadataCache.delete(this.rootSymbol);
	}

	async getBars(params: GetBarsParams): Promise<GetBarsResult> {
		const continuousParams = this.mapToContinuousParams(params);
		const result = await this.fetchContinuousBars(continuousParams);
		return {
			bars: result.bars,
			hasMore: result.hasMore,
		};
	}

	async getBarsCanonical(params: GetBarsParams): Promise<CanonicalFetchResult> {
		const continuousParams = this.mapToContinuousParams(params);
		const result = await this.fetchContinuousBars(continuousParams);
		const coverage = this.buildCoverage(result, continuousParams);
		return {
			bars: result.bars,
			hasMore: result.hasMore,
			coverage,
		};
	}

	async fetchBarsInRange?(
		symbol: string,
		timeframe: string,
		from: Date,
		to: Date,
		signal?: AbortSignal
	): Promise<readonly KLineBar[]> {
		const params: GetContinuousBarsParams = {
			rootSymbol: symbol,
			interval: timeframe,
			type: "init",
			timestamp: null,
			limit: Math.ceil((to.getTime() - from.getTime()) / this.intervalToMs(timeframe)) + 100,
			signal,
		};
		const result = await this.fetchContinuousBars(params);
		return result.bars.filter(
			(bar) => bar.timestamp >= from.getTime() && bar.timestamp <= to.getTime()
		);
	}

	async fetchBarsBefore?(
		symbol: string,
		timeframe: string,
		before: Date,
		limit?: number,
		signal?: AbortSignal
	): Promise<readonly KLineBar[]> {
		const params: GetContinuousBarsParams = {
			rootSymbol: symbol,
			interval: timeframe,
			type: "backward",
			timestamp: before.getTime(),
			limit: limit ?? 500,
			signal,
		};
		const result = await this.fetchContinuousBars(params);
		return result.bars;
	}

	getSourceSemantics(): SourceSemanticsDescriptor {
		return {
			sourceId: this.name,
			sourceContractVersion: "continuous-futures-v1",
			instrumentClass: "futures",
			coverageMode: "window-hint",
			sessionModel: "exchange-calendar",
			timezone: "Asia/Ho_Chi_Minh",
			sessionCalendarId: "vn-futures-calendar",
			supportsExactRangeFetch: true,
			supportsBackwardAnchor: true,
			supportsForwardAnchor: false,
			supportsLiveBars: true,
			maxBarsPerRequest: 5000,
			finalityMode: "historically-correctable" as FinalityMode,
			correctionLookbackMs: 7 * 24 * 60 * 60 * 1000, // 1 week
			expectedGapReasons: [
				"not-fetched",
				"market-closed",
				"source-no-data",
				"rate-limited",
				"boundary-exhausted",
				"roll-gap",
			],
		};
	}

	/**
	 * Fetch continuous contract bars - tries BFF first, falls back to local computation
	 */
	private async fetchContinuousBars(params: GetContinuousBarsParams): Promise<GetContinuousBarsResult> {
		const cacheKey = this.getCacheKey(params);

		// Check cache first
		const cached = barsCache.get(cacheKey);
		if (cached && params.type !== "backward") {
			const metadata = await this.getMetadata();
			return {
				bars: cached.slice(-params.limit),
				hasMore: cached.length > params.limit,
				metadata,
				rollPointsInRange: [],
			};
		}

		// Try BFF (server-side stitching)
		try {
			const bffResult = await this.fetchFromBFF(params);
			if (bffResult) {
				this.cacheBars(cacheKey, bffResult.bars);
				return bffResult;
			}
		} catch (error) {
			log.warn('[ContinuousContractAdapter] BFF fetch failed, falling back to local:', error);
		}

		// Fallback: Local computation (requires individual contract data)
		return this.computeLocally(params);
	}

	/**
	 * Fetch from BFF endpoint
	 */
	private async fetchFromBFF(params: GetContinuousBarsParams): Promise<GetContinuousBarsResult | null> {
		const metadata = await this.getMetadata();
		const from = params.type === "backward" && params.timestamp
			? params.timestamp - params.limit * this.intervalToMs(params.interval)
			: metadata.dataRange.from;
		const to = params.type === "backward" && params.timestamp
			? params.timestamp
			: metadata.dataRange.to;

		const request: RequestInit = {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				rootSymbol: params.rootSymbol,
				interval: params.interval,
				from,
				to,
				rollConfig: this.config,
			} satisfies import("./ContinuousContractTypes").StitchContinuousRequest),
			signal: params.signal,
		};

		const response = await fetch(BFF_ENDPOINT, request);
		if (!response.ok) {
			throw new Error(`BFF error: ${response.status}`);
		}

		const data = await response.json() as import("./ContinuousContractTypes").StitchContinuousResponse;
		return {
			bars: data.bars,
			hasMore: data.bars.length >= params.limit,
			metadata: data.metadata,
			rollPointsInRange: data.rollPoints,
		};
	}

	/**
	 * Local computation fallback - stitches contracts client-side
	 * Requires individual contract data to be available via another adapter
	 */
	private async computeLocally(params: GetContinuousBarsParams): Promise<GetContinuousBarsResult> {
		const metadata = await this.getMetadata();
		if (!this.fetchRawBars) {
			log.warn('[ContinuousContractAdapter] fetchRawBars not provided, cannot compute locally');
			return {
				bars: [],
				hasMore: false,
				metadata,
				rollPointsInRange: [],
			};
		}

		const fromMs = params.type === "backward" && params.timestamp
			? params.timestamp - params.limit * this.intervalToMs(params.interval)
			: metadata.dataRange.from;
		const toMs = params.type === "backward" && params.timestamp
			? params.timestamp
			: metadata.dataRange.to;

		// Select contracts that overlap with requested range
		const relevantContracts = metadata.contracts.filter(
			(c) => c.lastTradeDate >= fromMs && c.firstTradeDate <= toMs
		);

		if (relevantContracts.length === 0) {
			return {
				bars: [],
				hasMore: false,
				metadata,
				rollPointsInRange: [],
			};
		}

		// Fetch raw bars for each contract
		const contractBars = new Map<string, KLineBar[]>();
		await Promise.all(
			relevantContracts.map(async (c) => {
				try {
					const bars = await this.fetchRawBars!(c.symbol, params.interval, new Date(fromMs), new Date(toMs));
					contractBars.set(c.symbol, [...bars]);
				} catch (err) {
					log.error(`Failed to fetch raw bars for contract ${c.symbol}:`, err);
				}
			})
		);

		const { computeRollAdjustment } = await import("./rollAlgorithms");
		const stitchResult = computeRollAdjustment({
			contracts: relevantContracts,
			contractBars,
			config: {
				rollMethod: this.config.rollMethod,
				adjustVolumes: this.config.adjustVolumes,
			},
			from: fromMs,
			to: toMs,
		});

		return {
			bars: stitchResult.bars,
			hasMore: stitchResult.bars.length >= params.limit,
			metadata: {
				...metadata,
				totalCumulativeAdjustment: stitchResult.totalCumulativeAdjustment,
			},
			rollPointsInRange: stitchResult.rollPoints,
		};
	}

	/**
	 * Get or fetch continuous contract metadata
	 */
	async getMetadata(): Promise<ContinuousContractMetadata> {
		if (metadataCache.has(this.rootSymbol)) {
			return metadataCache.get(this.rootSymbol)!;
		}

		// Try to fetch from BFF
		try {
			const response = await fetch(`${BFF_ENDPOINT}/metadata?rootSymbol=${this.rootSymbol}`);
			if (response.ok) {
				const metadata = await response.json() as ContinuousContractMetadata;
				metadataCache.set(this.rootSymbol, metadata);
				return metadata;
			}
		} catch {
			// Fall through to synthetic metadata
		}

		// Generate synthetic metadata for development
		const metadata = this.generateSyntheticMetadata();
		metadataCache.set(this.rootSymbol, metadata);
		return metadata;
	}

	/**
	 * Generate synthetic metadata for development/testing
	 */
	private generateSyntheticMetadata(): ContinuousContractMetadata {
		const now = Date.now();
		const contracts: FuturesContract[] = [
			{
				symbol: "VN30F2409",
				rootSymbol: "VN30F",
				expiry: new Date("2024-09-19").getTime(),
				firstTradeDate: new Date("2024-06-20").getTime(),
				lastTradeDate: new Date("2024-09-16").getTime(),
				monthCode: "U",
				year: 24,
				tickSize: 0.1,
				multiplier: 100000,
				exchange: "VNX",
			},
			{
				symbol: "VN30F2412",
				rootSymbol: "VN30F",
				expiry: new Date("2024-12-19").getTime(),
				firstTradeDate: new Date("2024-09-20").getTime(),
				lastTradeDate: new Date("2024-12-16").getTime(),
				monthCode: "Z",
				year: 24,
				tickSize: 0.1,
				multiplier: 100000,
				exchange: "VNX",
			},
			{
				symbol: "VN30F2503",
				rootSymbol: "VN30F",
				expiry: new Date("2025-03-20").getTime(),
				firstTradeDate: new Date("2024-12-20").getTime(),
				lastTradeDate: new Date("2025-03-17").getTime(),
				monthCode: "H",
				year: 25,
				tickSize: 0.1,
				multiplier: 100000,
				exchange: "VNX",
			},
		];

		// Generate roll points
		const rollPoints: RollPoint[] = [];
		let cumulativeAdjustment = 0;

		for (let i = 0; i < contracts.length - 1; i++) {
			const fromContract = contracts[i];
			const toContract = contracts[i + 1];
			const rollDate = fromContract.lastTradeDate;
			const fromPrice = 1200 + i * 10; // Synthetic prices
			const toPrice = 1210 + i * 10;

			let adjustmentFactor = 1;
			const method: RollMethod = this.config.rollMethod;

			if (method === "ratio") {
				adjustmentFactor = fromPrice / toPrice;
			} else if (method === "panama") {
				adjustmentFactor = fromPrice - toPrice;
				cumulativeAdjustment += adjustmentFactor;
			} else if (method === "backward-ratio") {
				adjustmentFactor = toPrice / fromPrice;
			}

			rollPoints.push({
				timestamp: rollDate,
				fromContract: fromContract.symbol,
				toContract: toContract.symbol,
				fromPrice,
				toPrice,
				adjustmentFactor,
				cumulativeAdjustment,
				method,
			});
		}

		return {
			rootSymbol: this.rootSymbol,
			contracts,
			rollPoints,
			activeContract: contracts[contracts.length - 1].symbol,
			nextRollDate: contracts[contracts.length - 1].lastTradeDate,
			totalCumulativeAdjustment: cumulativeAdjustment,
			dataRange: {
				from: contracts[0].firstTradeDate,
				to: now,
			},
		};
	}

	/**
	 * Build coverage fragments for canonical fetch
	 */
	private buildCoverage(
		result: GetContinuousBarsResult,
		params: GetContinuousBarsParams
	): readonly CoverageFragment[] {
		const { bars, metadata } = result;

		if (bars.length === 0) {
			if (params.type === "backward" && params.timestamp !== null) {
				return [
					{ fromTs: 0, toTs: params.timestamp, status: "unresolved", reason: "boundary-exhausted" },
				];
			}
			return [{ fromTs: 0, toTs: Date.now(), status: "unresolved", reason: "source-no-data" }];
		}

		const oldestTs = bars[0].timestamp;
		const newestTs = bars[bars.length - 1].timestamp;
		const covered: CoverageFragment = { fromTs: oldestTs, toTs: newestTs, status: "covered" };

		const fragments: CoverageFragment[] = [covered];

		// Gap before oldest
		if (oldestTs > metadata.dataRange.from) {
			fragments.unshift({
				fromTs: metadata.dataRange.from,
				toTs: oldestTs,
				status: "unresolved",
				reason: "not-fetched",
			});
		}

		// Gap after newest (if hasMore is false)
		if (!result.hasMore && newestTs < metadata.dataRange.to) {
			fragments.push({
				fromTs: newestTs,
				toTs: metadata.dataRange.to,
				status: "unresolved",
				reason: "boundary-exhausted",
			});
		}

		// Add roll-gap fragments if any roll points in range
		for (const rollPoint of result.rollPointsInRange) {
			// Roll points are instantaneous, but we can mark them
			fragments.push({
				fromTs: rollPoint.timestamp,
				toTs: rollPoint.timestamp + 1,
				status: "covered",
				reason: "roll-gap",
			});
		}

		return fragments.sort((a, b) => a.fromTs - b.fromTs);
	}

	private mapToContinuousParams(params: GetBarsParams): GetContinuousBarsParams {
		return {
			rootSymbol: params.symbol,
			interval: params.interval,
			type: params.type,
			timestamp: params.timestamp,
			limit: params.limit,
			signal: params.signal,
		};
	}

	private getCacheKey(params: GetContinuousBarsParams): string {
		return `${params.rootSymbol}|${params.interval}|${params.type}|${params.timestamp ?? "init"}|${params.limit}`;
	}

	private cacheBars(key: string, bars: KLineBar[]): void {
		// Limit cache size
		if (barsCache.size > 50) {
			const firstKey = barsCache.keys().next().value;
			if (firstKey) barsCache.delete(firstKey);
		}
		barsCache.set(key, bars);
	}

	private intervalToMs(interval: string): number {
		switch (interval) {
			case "1m": return 60_000;
			case "3m": return 180_000;
			case "5m": return 300_000;
			case "15m": return 900_000;
			case "30m": return 1_800_000;
			case "1h":
			case "1H": return 3_600_000;
			case "2H": return 7_200_000;
			case "4h":
			case "4H": return 14_400_000;
			case "D":
			case "1D":
			case "1d": return 86_400_000;
			case "W":
			case "1W":
			case "1w": return 604_800_000;
			default: return 86_400_000;
		}
	}
}

/**
 * Factory function to create adapter for a continuous contract
 */
export function createContinuousContractAdapter(
	rootSymbol: string,
	config?: Partial<ContinuousContractConfig>
): ContinuousContractAdapter {
	return new ContinuousContractAdapter(rootSymbol, config);
}

/**
 * Get available continuous contract configurations
 */
export function getAvailableContinuousContracts(): string[] {
	return Object.keys(DEFAULT_CONFIG);
}