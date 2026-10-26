import { describe, it, expect } from "vitest";
import {
	validateRollbackSafety,
	createEmergencyRollbackTrigger,
	formatRollbackEvent,
	type RollbackSnapshot,
	type RollbackEvent,
} from "../CanaryRollbackHelper";

describe("CanaryRollbackHelper", () => {
	// Helper to create mock snapshot
	function createSnapshot(
		level: 10 | 30 | 100,
		barCount: number,
		timestamp = Date.now(),
	): RollbackSnapshot {
		return {
			level,
			barCount,
			workersActive: {
				externalBarsWorker: true,
				lodWorker: true,
			},
			timestamp,
		};
	}

	describe("validateRollbackSafety", () => {
		it("returns safe=true for normal rollback (100% → 30% with fewer bars)", () => {
			const before = createSnapshot(100, 1000);
			const after = createSnapshot(30, 300);

			const result = validateRollbackSafety(before, after);

			expect(result.safe).toBe(true);
			expect(result.potentialDataLoss).toBe(false);
			expect(result.barCountDifference).toBe(-700);
			expect(result.suggestedAction).toBe("MONITOR");
		});

		it("returns safe=true for rollback 30% → 10%", () => {
			const before = createSnapshot(30, 500);
			const after = createSnapshot(10, 100);

			const result = validateRollbackSafety(before, after);

			expect(result.safe).toBe(true);
			expect(result.potentialDataLoss).toBe(false);
			expect(result.suggestedAction).toBe("MONITOR");
		});

		it("detects data loss: rollback 100% → 30% but bar count increased", () => {
			const before = createSnapshot(100, 1000);
			const after = createSnapshot(30, 1500); // Unexpected: should have fewer bars at 30%

			const result = validateRollbackSafety(before, after);

			expect(result.safe).toBe(false);
			expect(result.potentialDataLoss).toBe(true);
			expect(result.barCountDifference).toBe(500);
			expect(result.suggestedAction).toBe("INVESTIGATE");
			expect(result.reason).toContain("Unexpected bar loss");
		});

		it("detects worker state mismatch during rollback", () => {
			const before = createSnapshot(100, 1000);
			const after = createSnapshot(30, 300);
			after.workersActive.lodWorker = false; // Worker state changed unexpectedly

			const result = validateRollbackSafety(before, after);

			expect(result.safe).toBe(false);
			expect(result.potentialDataLoss).toBe(false);
			expect(result.suggestedAction).toBe("DISABLE_WORKER");
			expect(result.reason).toContain("Worker state changed");
		});

		it("handles edge case: rollback to same level", () => {
			const before = createSnapshot(30, 500);
			const after = createSnapshot(30, 500);

			const result = validateRollbackSafety(before, after);

			expect(result.safe).toBe(true);
			expect(result.barCountDifference).toBe(0);
		});

		it("allows bar count changes during non-rollback transitions", () => {
			// Forward transition (not a rollback): 10% → 30%
			const before = createSnapshot(10, 100);
			const after = createSnapshot(30, 300); // More bars is expected when advancing

			const result = validateRollbackSafety(before, after);

			expect(result.safe).toBe(true);
			expect(result.barCountDifference).toBe(200);
		});
	});

	describe("createEmergencyRollbackTrigger", () => {
		it("recommends immediate rollback from 100% to 30%", () => {
			const rec = createEmergencyRollbackTrigger(100);

			expect(rec.targetLevel).toBe(30);
			expect(rec.severity).toBe("CRITICAL");
			expect(rec.recommendation).toContain("IMMEDIATE");
		});

		it("recommends rollback from 30% to 10%", () => {
			const rec = createEmergencyRollbackTrigger(30);

			expect(rec.targetLevel).toBe(10);
			expect(rec.severity).toBe("HIGH");
			expect(rec.recommendation).toContain("URGENT");
		});

		it("recommends worker disable at 10% (cannot rollback further)", () => {
			const rec = createEmergencyRollbackTrigger(10);

			expect(rec.targetLevel).toBe(10);
			expect(rec.severity).toBe("HIGH");
			expect(rec.recommendation).toContain("disable");
		});
	});

	describe("formatRollbackEvent", () => {
		it("formats safe rollback event", () => {
			const before = createSnapshot(100, 1000);
			const after = createSnapshot(30, 300);
			const validation = validateRollbackSafety(before, after);

			const event: RollbackEvent = {
				previousLevel: 100,
				newLevel: 30,
				beforeMetrics: before,
				afterMetrics: after,
				validation,
				severity: "INFO",
				timestamp: Date.now(),
			};

			const formatted = formatRollbackEvent(event);

			expect(formatted).toContain("Canary Rollback");
			expect(formatted).toContain("100%");
			expect(formatted).toContain("30%");
			expect(formatted).toContain("SAFE");
			expect(formatted).toContain("INFO");
			expect(formatted).toContain("MONITOR");
		});

		it("formats unsafe rollback event with severity", () => {
			const before = createSnapshot(100, 1000);
			const after = createSnapshot(30, 1500);
			const validation = validateRollbackSafety(before, after);

			const event: RollbackEvent = {
				previousLevel: 100,
				newLevel: 30,
				beforeMetrics: before,
				afterMetrics: after,
				validation,
				severity: "CRITICAL",
				timestamp: Date.now(),
			};

			const formatted = formatRollbackEvent(event);

			expect(formatted).toContain("UNSAFE");
			expect(formatted).toContain("CRITICAL");
			expect(formatted).toContain("INVESTIGATE");
			expect(formatted).toContain("+500"); // Bar count difference
		});

		it("includes negative bar count in format", () => {
			const before = createSnapshot(100, 1000);
			const after = createSnapshot(30, 300);
			const validation = validateRollbackSafety(before, after);

			const event: RollbackEvent = {
				previousLevel: 100,
				newLevel: 30,
				beforeMetrics: before,
				afterMetrics: after,
				validation,
				severity: "INFO",
				timestamp: Date.now(),
			};

			const formatted = formatRollbackEvent(event);

			expect(formatted).toContain("-700"); // Negative bar count (safe)
		});
	});
});
