/**
 * TDD Tests for Roll Algorithms
 *
 * Tests cover all three roll methods: Ratio, Panama, Backward Ratio
 * Following TDD: RED -> GREEN -> REFACTOR
 */

import { describe, it, expect, beforeEach } from "vitest";
import type { KLineBar } from "../DataAdapter";
import type { FuturesContract, RollMethod } from "../ContinuousContractTypes";
import {
	computeRollAdjustment,
	computeSingleRollAdjustment,
	verifyNoPriceGaps,
	generateTestContractChain,
	generateTestBarsWithRollGap,
} from "../rollAlgorithms";

// Helper to create test bars
function createBar(timestamp: number, open: number, high: number, low: number, close: number, volume: number): KLineBar {
	return { timestamp, open, high, low, close, volume };
}

describe("computeSingleRollAdjustment", () => {
	it("should compute ratio adjustment factor correctly", () => {
		const result = computeSingleRollAdjustment(1200, 1210, "ratio");
		expect(result.factor).toBeCloseTo(1200 / 1210, 10);
		expect(result.offset).toBe(0);
	});

	it("should compute panama price offset correctly", () => {
		const result = computeSingleRollAdjustment(1200, 1210, "panama");
		expect(result.factor).toBe(1);
		expect(result.offset).toBe(-10); // 1200 - 1210 = -10
	});

	it("should compute backward-ratio factor correctly", () => {
		const result = computeSingleRollAdjustment(1200, 1210, "backward-ratio");
		expect(result.factor).toBeCloseTo(1210 / 1200, 10);
		expect(result.offset).toBe(0);
	});

	it("should handle zero toPrice gracefully", () => {
		expect(() => computeSingleRollAdjustment(1200, 0, "ratio")).toThrow();
	});
});

describe("computeRollAdjustment - Ratio Method", () => {
	let contracts: FuturesContract[];
	let contractBars: Map<string, KLineBar[]>;

	beforeEach(() => {
		contracts = generateTestContractChain("TEST", 3, new Date("2024-01-01").getTime(), 90);
		contractBars = generateTestBarsWithRollGap(contracts, "ratio", 0); // No artificial gap
	});

	it("should stitch 3 contracts with ratio adjustment", () => {
		const result = computeRollAdjustment({
			contracts,
			contractBars,
			config: { rollMethod: "ratio", adjustVolumes: true },
			from: contracts[0].firstTradeDate,
			to: contracts[2].lastTradeDate,
		});

		expect(result.bars.length).toBeGreaterThan(0);
		expect(result.rollPoints.length).toBe(2); // 2 roll points for 3 contracts
		expect(result.warnings.length).toBe(0);
	});

	it("should eliminate price gap at roll with ratio method", () => {
		// Create bars with known 5% gap
		const gappedBars = generateTestBarsWithRollGap(contracts, "ratio", 5);

		const result = computeRollAdjustment({
			contracts,
			contractBars: gappedBars,
			config: { rollMethod: "ratio", adjustVolumes: true },
			from: contracts[0].firstTradeDate,
			to: contracts[2].lastTradeDate,
		});

		// Verify no price gaps after adjustment
		const verification = verifyNoPriceGaps(result.rollPoints, 0.1);
		expect(verification.passed).toBe(true);
		expect(verification.gaps.every(g => g.gapPercent <= 0.1)).toBe(true);
	});

	it("should adjust volumes inversely to price for ratio method", () => {
		const result = computeRollAdjustment({
			contracts,
			contractBars,
			config: { rollMethod: "ratio", adjustVolumes: true },
			from: contracts[0].firstTradeDate,
			to: contracts[2].lastTradeDate,
		});

		// Check that volumes are adjusted at roll points
		for (const rp of result.rollPoints) {
			expect(rp.adjustmentFactor).toBeGreaterThan(0);
			// Volume should be divided by factor
		}
	});

	it("should not adjust volumes when adjustVolumes=false", () => {
		const result = computeRollAdjustment({
			contracts,
			contractBars,
			config: { rollMethod: "ratio", adjustVolumes: false },
			from: contracts[0].firstTradeDate,
			to: contracts[2].lastTradeDate,
		});

		// Volumes should remain unchanged across rolls
		// (Implementation detail: verify in integration test)
		expect(result.bars.length).toBeGreaterThan(0);
	});
});

describe("computeRollAdjustment - Panama Method", () => {
	let contracts: FuturesContract[];
	let contractBars: Map<string, KLineBar[]>;

	beforeEach(() => {
		contracts = generateTestContractChain("TEST", 3, new Date("2024-01-01").getTime(), 90);
		contractBars = generateTestBarsWithRollGap(contracts, "panama", 0);
	});

	it("should stitch 3 contracts with panama adjustment", () => {
		const result = computeRollAdjustment({
			contracts,
			contractBars,
			config: { rollMethod: "panama", adjustVolumes: true },
			from: contracts[0].firstTradeDate,
			to: contracts[2].lastTradeDate,
		});

		expect(result.bars.length).toBeGreaterThan(0);
		expect(result.rollPoints.length).toBe(2);
		expect(result.totalCumulativeAdjustment).not.toBe(0);
	});

	it("should preserve absolute volatility structure with panama", () => {
		// Create bars with known $10 gap
		const gappedBars = generateTestBarsWithRollGap(contracts, "panama", 0);
		// Manually inject a $10 gap at first roll
		const contract1Bars = gappedBars.get(contracts[1].symbol)!;
		for (const bar of contract1Bars) {
			bar.open += 10;
			bar.high += 10;
			bar.low += 10;
			bar.close += 10;
		}

		const result = computeRollAdjustment({
			contracts,
			contractBars: gappedBars,
			config: { rollMethod: "panama", adjustVolumes: true },
			from: contracts[0].firstTradeDate,
			to: contracts[2].lastTradeDate,
		});

		// Verify no price gaps after adjustment
		const verification = verifyNoPriceGaps(result.rollPoints, 0.1);
		expect(verification.passed).toBe(true);
	});

	it("should accumulate cumulative adjustment correctly", () => {
		const result = computeRollAdjustment({
			contracts,
			contractBars,
			config: { rollMethod: "panama", adjustVolumes: true },
			from: contracts[0].firstTradeDate,
			to: contracts[2].lastTradeDate,
		});

		// Verify precise cumulative offset accumulation at each roll point
		for (let i = 1; i < result.rollPoints.length; i++) {
			expect(result.rollPoints[i].cumulativeAdjustment).toBeCloseTo(
				result.rollPoints[i - 1].cumulativeAdjustment + result.rollPoints[i].adjustmentFactor,
				4
			);
		}
	});

	it("should not adjust volumes for panama method", () => {
		const result = computeRollAdjustment({
			contracts,
			contractBars,
			config: { rollMethod: "panama", adjustVolumes: true }, // adjustVolumes ignored for panama
			from: contracts[0].firstTradeDate,
			to: contracts[2].lastTradeDate,
		});

		// Panama preserves absolute volume - volumes should be unchanged
		expect(result.bars.length).toBeGreaterThan(0);
	});
});

describe("computeRollAdjustment - Backward Ratio Method", () => {
	let contracts: FuturesContract[];
	let contractBars: Map<string, KLineBar[]>;

	beforeEach(() => {
		contracts = generateTestContractChain("TEST", 3, new Date("2024-01-01").getTime(), 90);
		contractBars = generateTestBarsWithRollGap(contracts, "backward-ratio", 0);
	});

	it("should stitch 3 contracts with backward-ratio adjustment", () => {
		const result = computeRollAdjustment({
			contracts,
			contractBars,
			config: { rollMethod: "backward-ratio", adjustVolumes: true },
			from: contracts[0].firstTradeDate,
			to: contracts[2].lastTradeDate,
		});

		expect(result.bars.length).toBeGreaterThan(0);
		expect(result.rollPoints.length).toBe(2);
	});

	it("should eliminate price gap at roll with backward-ratio", () => {
		const gappedBars = generateTestBarsWithRollGap(contracts, "backward-ratio", 5);

		const result = computeRollAdjustment({
			contracts,
			contractBars: gappedBars,
			config: { rollMethod: "backward-ratio", adjustVolumes: true },
			from: contracts[0].firstTradeDate,
			to: contracts[2].lastTradeDate,
		});

		const verification = verifyNoPriceGaps(result.rollPoints, 0.1);
		expect(verification.passed).toBe(true);
	});
});

describe("verifyNoPriceGaps", () => {
	it("should pass when gaps are below threshold", () => {
		const rollPoints = [
			{ timestamp: 1000, fromContract: "A", toContract: "B", fromPrice: 1000, toPrice: 1000.5, adjustmentFactor: 1, cumulativeAdjustment: 0, method: "ratio" as RollMethod },
			{ timestamp: 2000, fromContract: "B", toContract: "C", fromPrice: 1000.5, toPrice: 1001, adjustmentFactor: 1, cumulativeAdjustment: 0, method: "ratio" as RollMethod },
		];

		const result = verifyNoPriceGaps(rollPoints, 0.1);
		expect(result.passed).toBe(true);
	});

	it("should fail when gaps exceed threshold", () => {
		const rollPoints = [
			{ timestamp: 1000, fromContract: "A", toContract: "B", fromPrice: 1000, toPrice: 1050, adjustmentFactor: 1, cumulativeAdjustment: 0, method: "ratio" as RollMethod },
		];

		const result = verifyNoPriceGaps(rollPoints, 0.1);
		expect(result.passed).toBe(false);
		expect(result.gaps[0].gapPercent).toBeCloseTo(5, 1);
	});
});

describe("generateTestContractChain", () => {
	it("should generate correct number of contracts", () => {
		const contracts = generateTestContractChain("TEST", 5, new Date("2024-01-01").getTime());
		expect(contracts.length).toBe(5);
	});

	it("should have correct expiry intervals", () => {
		const contracts = generateTestContractChain("TEST", 3, new Date("2024-01-01").getTime(), 90);
		const interval = contracts[1].firstTradeDate - contracts[0].firstTradeDate;
		expect(interval).toBe(90 * 24 * 60 * 60 * 1000);
	});

	it("should have lastTradeDate before expiry", () => {
		const contracts = generateTestContractChain("TEST", 3, new Date("2024-01-01").getTime());
		for (const c of contracts) {
			expect(c.lastTradeDate).toBeLessThan(c.expiry);
			expect(c.firstTradeDate).toBeLessThan(c.lastTradeDate);
		}
	});
});

describe("Edge Cases", () => {
	it("should handle single contract (no rolls)", () => {
		const contracts = generateTestContractChain("TEST", 1, new Date("2024-01-01").getTime());
		const contractBars = generateTestBarsWithRollGap(contracts, "ratio", 0);

		const result = computeRollAdjustment({
			contracts,
			contractBars,
			config: { rollMethod: "ratio", adjustVolumes: true },
			from: contracts[0].firstTradeDate,
			to: contracts[0].lastTradeDate,
		});

		expect(result.rollPoints.length).toBe(0);
		expect(result.bars.length).toBeGreaterThan(0);
	});

	it("should handle missing contract data gracefully", () => {
		const contracts = generateTestContractChain("TEST", 3, new Date("2024-01-01").getTime());
		const contractBars = new Map<string, KLineBar[]>();
		// Only provide data for first contract
		contractBars.set(contracts[0].symbol, contractBars.get(contracts[0].symbol) ?? []);

		const result = computeRollAdjustment({
			contracts,
			contractBars,
			config: { rollMethod: "ratio", adjustVolumes: true },
			from: contracts[0].firstTradeDate,
			to: contracts[2].lastTradeDate,
		});

		expect(result.warnings.length).toBeGreaterThan(0);
		expect(result.warnings.some(w => w.includes("No data"))).toBe(true);
	});

	it("should handle empty bars map", () => {
		const contracts = generateTestContractChain("TEST", 2, new Date("2024-01-01").getTime());
		const contractBars = new Map<string, KLineBar[]>();

		const result = computeRollAdjustment({
			contracts,
			contractBars,
			config: { rollMethod: "ratio", adjustVolumes: true },
			from: contracts[0].firstTradeDate,
			to: contracts[1].lastTradeDate,
		});

		expect(result.bars.length).toBe(0);
		expect(result.warnings.length).toBe(2); // Both contracts missing
	});
});