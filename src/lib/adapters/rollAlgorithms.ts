/**
 * Roll Algorithms - Pure TypeScript Implementation
 *
 * Shared between client and server for continuous futures roll adjustment.
 * Supports three methods: Ratio, Panama (Cumulative Difference), Backward Ratio.
 *
 * These are pure functions with no side effects - fully testable.
 */

import type { KLineBar } from "./DataAdapter";
import type { RollMethod, RollPoint, FuturesContract } from "./ContinuousContractTypes";

/** Result of roll adjustment computation */
export interface RollAdjustmentResult {
	/** Adjusted bars */
	bars: KLineBar[];
	/** Roll points with adjustment details */
	rollPoints: RollPoint[];
	/** Total cumulative adjustment (for Panama) */
	totalCumulativeAdjustment: number;
	/** Warnings during computation */
	warnings: string[];
}

/** Input for roll computation */
export interface RollComputationInput {
	/** Contracts in chronological order */
	contracts: FuturesContract[];
	/** Raw bars for each contract (keyed by contract symbol) */
	contractBars: Map<string, KLineBar[]>;
	/** Roll configuration */
	config: {
		rollMethod: RollMethod;
		adjustVolumes: boolean;
	};
	/** Requested time range */
	from: number;
	to: number;
}

/**
 * Compute roll adjustments for a chain of futures contracts
 *
 * This is the core algorithm - pure, deterministic, and fully testable.
 */
export function computeRollAdjustment(input: RollComputationInput): RollAdjustmentResult {
	const { contracts, contractBars, config, from, to } = input;
	const { rollMethod, adjustVolumes } = config;

	const allBars: KLineBar[] = [];
	const rollPoints: RollPoint[] = [];
	const warnings: string[] = [];

	let cumulativeAdjustment = 0;
	let currentRatioFactor = 1; // For ratio method
	let currentPriceOffset = 0; // For Panama method

	// Process each contract in chronological order
	for (let i = 0; i < contracts.length; i++) {
		const contract = contracts[i];
		const bars = contractBars.get(contract.symbol) ?? [];

		// Filter to contract's trading period and requested range
		const contractStart = Math.max(contract.firstTradeDate, from);
		const contractEnd = Math.min(contract.lastTradeDate, to);

		let relevantBars = bars.filter(
			(b) => b.timestamp >= contractStart && b.timestamp <= contractEnd
		);

		if (relevantBars.length === 0) {
			warnings.push(`No data for contract ${contract.symbol} in range [${new Date(contractStart).toISOString()}, ${new Date(contractEnd).toISOString()}]`);
			continue;
		}

		// Apply cumulative adjustment from previous rolls
		if (i > 0) {
			relevantBars = applyCumulativeAdjustment(relevantBars, rollMethod, currentRatioFactor, currentPriceOffset, adjustVolumes);
		}

		allBars.push(...relevantBars);

		// Compute roll point to next contract
		if (i < contracts.length - 1) {
			const nextContract = contracts[i + 1];
			const nextBars = contractBars.get(nextContract.symbol) ?? [];

			const rollDate = contract.lastTradeDate;

			// Find bars at roll boundary
			const fromBar = findBarAtOrBefore(relevantBars, rollDate);
			const toBar = findBarAtOrAfter(nextBars, rollDate);

			if (fromBar && toBar) {
				const fromPrice = fromBar.close;
				const toPrice = toBar.close;

				// Find raw bars for correct roll ratio calculations
				const fromBarRaw = findBarAtOrBefore(bars, rollDate);
				const rawFromPrice = fromBarRaw ? fromBarRaw.close : fromPrice;
				const rawToPrice = toPrice;

				let adjustmentFactor = 1;
				let priceOffset = 0;

				if (rollMethod === "ratio") {
					adjustmentFactor = rawFromPrice / rawToPrice;
					currentRatioFactor *= adjustmentFactor;
				} else if (rollMethod === "panama") {
					priceOffset = rawFromPrice - rawToPrice;
					currentPriceOffset += priceOffset;
					cumulativeAdjustment += priceOffset;
				} else if (rollMethod === "backward-ratio") {
					adjustmentFactor = rawToPrice / rawFromPrice;
					currentRatioFactor *= adjustmentFactor;
				}

				const adjustedFromPrice = fromPrice;
				let adjustedToPrice = toPrice;

				if (rollMethod === "ratio") {
					adjustedToPrice = toPrice * currentRatioFactor;
				} else if (rollMethod === "panama") {
					adjustedToPrice = toPrice + currentPriceOffset;
				} else if (rollMethod === "backward-ratio") {
					adjustedToPrice = toPrice / currentRatioFactor;
				}

				rollPoints.push({
					timestamp: rollDate,
					fromContract: contract.symbol,
					toContract: nextContract.symbol,
					fromPrice: adjustedFromPrice,
					toPrice: adjustedToPrice,
					adjustmentFactor: rollMethod === "panama" ? priceOffset : adjustmentFactor,
					cumulativeAdjustment,
					method: rollMethod,
				});
			} else {
				warnings.push(`Could not determine roll prices at ${new Date(rollDate).toISOString()} for ${contract.symbol} -> ${nextContract.symbol}`);
			}
		}
	}

	// Sort and deduplicate
	allBars.sort((a, b) => a.timestamp - b.timestamp);
	const dedupedBars = deduplicateBars(allBars);

	return {
		bars: dedupedBars,
		rollPoints,
		totalCumulativeAdjustment: cumulativeAdjustment,
		warnings,
	};
}

/**
 * Apply cumulative adjustment to bars based on roll method
 */
function applyCumulativeAdjustment(
	bars: KLineBar[],
	method: RollMethod,
	ratioFactor: number,
	priceOffset: number,
	adjustVolumes: boolean
): KLineBar[] {
	return bars.map(bar => {
		let { open, high, low, close, volume } = bar;

		if (method === "ratio") {
			open *= ratioFactor;
			high *= ratioFactor;
			low *= ratioFactor;
			close *= ratioFactor;
			if (adjustVolumes) {
				volume = Math.round(volume / ratioFactor);
			}
		} else if (method === "panama") {
			open += priceOffset;
			high += priceOffset;
			low += priceOffset;
			close += priceOffset;
			// Volume unchanged for Panama
		} else if (method === "backward-ratio") {
			open /= ratioFactor;
			high /= ratioFactor;
			low /= ratioFactor;
			close /= ratioFactor;
			if (adjustVolumes) {
				volume = Math.round(volume * ratioFactor);
			}
		}

		return { ...bar, open, high, low, close, volume };
	});
}

/**
 * Find bar at or before timestamp
 */
function findBarAtOrBefore(bars: KLineBar[], timestamp: number): KLineBar | null {
	let result: KLineBar | null = null;
	for (const bar of bars) {
		if (bar.timestamp <= timestamp) {
			result = bar;
		} else {
			break;
		}
	}
	return result;
}

/**
 * Find bar at or after timestamp
 */
function findBarAtOrAfter(bars: KLineBar[], timestamp: number): KLineBar | null {
	for (const bar of bars) {
		if (bar.timestamp >= timestamp) {
			return bar;
		}
	}
	return null;
}

/**
 * Deduplicate bars at same timestamp (keep highest volume)
 */
function deduplicateBars(bars: KLineBar[]): KLineBar[] {
	const seen = new Map<number, KLineBar>();
	for (const bar of bars) {
		const existing = seen.get(bar.timestamp);
		if (!existing || bar.volume > existing.volume) {
			seen.set(bar.timestamp, bar);
		}
	}
	return Array.from(seen.values()).sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Compute roll adjustment for a single roll point (for testing)
 */
export function computeSingleRollAdjustment(
	fromPrice: number,
	toPrice: number,
	method: RollMethod
): { factor: number; offset: number } {
	if (method === "ratio" && toPrice === 0) {
		throw new Error("toPrice cannot be zero for ratio roll adjustment");
	}
	if (method === "backward-ratio" && fromPrice === 0) {
		throw new Error("fromPrice cannot be zero for backward-ratio roll adjustment");
	}
	switch (method) {
		case "ratio":
			return { factor: fromPrice / toPrice, offset: 0 };
		case "panama":
			return { factor: 1, offset: fromPrice - toPrice };
		case "backward-ratio":
			return { factor: toPrice / fromPrice, offset: 0 };
		default:
			throw new Error(`Unknown roll method: ${method}`);
	}
}

/**
 * Verify no price gaps at roll dates
 * Returns true if all roll transitions are smooth (gap < threshold)
 */
export function verifyNoPriceGaps(
	rollPoints: RollPoint[],
	thresholdPercent: number = 0.1 // 0.1% default threshold
): { passed: boolean; gaps: Array<{ rollPoint: RollPoint; gapPercent: number }> } {
	const gaps = rollPoints.map(rp => {
		const gapPercent = Math.abs((rp.fromPrice - rp.toPrice) / rp.fromPrice) * 100;
		return { rollPoint: rp, gapPercent };
	});

	const maxGap = Math.max(...gaps.map(g => g.gapPercent), 0);
	return {
		passed: maxGap <= thresholdPercent,
		gaps,
	};
}

/**
 * Generate synthetic contract chain for testing
 */
export function generateTestContractChain(
	rootSymbol: string,
	count: number,
	startDate: number,
	intervalDays: number = 90
): FuturesContract[] {
	const contracts: FuturesContract[] = [];
	const monthCodes = ["F", "G", "H", "J", "K", "M", "N", "Q", "U", "V", "X", "Z"];

	for (let i = 0; i < count; i++) {
		const firstTrade = startDate + i * intervalDays * 24 * 60 * 60 * 1000;
		const expiry = firstTrade + intervalDays * 24 * 60 * 60 * 1000;
		const lastTrade = expiry - 3 * 24 * 60 * 60 * 1000;
		const monthCode = monthCodes[i % 12];
		const year = Math.floor((startDate / (365 * 24 * 60 * 60 * 1000)) + i / 4) % 100;

		contracts.push({
			symbol: `${rootSymbol}${year.toString().padStart(2, "0")}${monthCode}`,
			rootSymbol,
			expiry,
			firstTradeDate: firstTrade,
			lastTradeDate: lastTrade,
			monthCode,
			year,
			tickSize: 0.1,
			multiplier: 100000,
			exchange: "VNX",
		});
	}

	return contracts;
}

/**
 * Generate test bars with known roll gap for verification
 */
export function generateTestBarsWithRollGap(
	contracts: FuturesContract[],
	rollMethod: RollMethod,
	gapPercent: number = 0
): Map<string, KLineBar[]> {
	const barsMap = new Map<string, KLineBar[]>();
	let basePrice = 1000;

	for (let i = 0; i < contracts.length; i++) {
		const contract = contracts[i];
		const bars: KLineBar[] = [];
		const days = Math.ceil((contract.lastTradeDate - contract.firstTradeDate) / (24 * 60 * 60 * 1000));

		// Apply gap at roll (except first contract)
		if (i > 0 && gapPercent !== 0) {
			const gapFactor = 1 + gapPercent / 100;
			if (rollMethod === "ratio") {
				basePrice *= gapFactor;
			} else if (rollMethod === "panama") {
				basePrice += basePrice * gapPercent / 100;
			}
		}

		for (let d = 0; d < days; d++) {
			const timestamp = contract.firstTradeDate + d * 24 * 60 * 60 * 1000;
			const date = new Date(timestamp);
			if (date.getDay() === 0 || date.getDay() === 6) continue; // Skip weekends

			const volatility = 0.01;
			const change = (Math.random() - 0.5) * 2 * volatility * basePrice;
			basePrice = Math.max(10, basePrice + change);

			const open = basePrice * (1 + (Math.random() - 0.5) * 0.003);
			const close = basePrice * (1 + (Math.random() - 0.5) * 0.003);
			const high = Math.max(open, close) * (1 + Math.random() * 0.003);
			const low = Math.min(open, close) * (1 - Math.random() * 0.003);
			const volume = Math.floor(10000 + Math.random() * 50000);

			bars.push({ timestamp, open, high, low, close, volume });
		}

		barsMap.set(contract.symbol, bars);
	}

	return barsMap;
}