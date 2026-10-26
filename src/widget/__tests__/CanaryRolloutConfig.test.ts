import { describe, it, expect } from "vitest";
import {
	parseCanaryLevel,
	resolveCanaryLevel,
	makeCanaryGateRecommendation,
	formatCanaryMetrics,
	DEFAULT_CANARY_LEVEL,
	type CanaryMetrics,
} from "../CanaryRolloutConfig";

describe("CanaryRolloutConfig", () => {
	describe("parseCanaryLevel", () => {
		it("accepts valid number levels", () => {
			expect(parseCanaryLevel(10)).toBe(10);
			expect(parseCanaryLevel(30)).toBe(30);
			expect(parseCanaryLevel(100)).toBe(100);
		});

		it("accepts valid string levels", () => {
			expect(parseCanaryLevel("10")).toBe(10);
			expect(parseCanaryLevel("30")).toBe(30);
			expect(parseCanaryLevel("100")).toBe(100);
		});

		it("rejects invalid levels and returns default", () => {
			expect(parseCanaryLevel(50)).toBe(DEFAULT_CANARY_LEVEL);
			expect(parseCanaryLevel(0)).toBe(DEFAULT_CANARY_LEVEL);
			expect(parseCanaryLevel("50")).toBe(DEFAULT_CANARY_LEVEL);
			expect(parseCanaryLevel("invalid")).toBe(DEFAULT_CANARY_LEVEL);
			expect(parseCanaryLevel(null)).toBe(DEFAULT_CANARY_LEVEL);
			expect(parseCanaryLevel(undefined)).toBe(DEFAULT_CANARY_LEVEL);
		});
	});

	describe("resolveCanaryLevel", () => {
		it("returns default when no props or params provided", () => {
			expect(resolveCanaryLevel()).toBe(DEFAULT_CANARY_LEVEL);
			expect(resolveCanaryLevel({})).toBe(DEFAULT_CANARY_LEVEL);
		});

		it("respects props override", () => {
			expect(resolveCanaryLevel({ canaryLevel: 10 })).toBe(10);
			expect(resolveCanaryLevel({ canaryLevel: 30 })).toBe(30);
			expect(resolveCanaryLevel({ canaryLevel: 100 })).toBe(100);
		});

		it("respects URL params", () => {
			const params10 = new URLSearchParams("canaryLevel=10");
			const params30 = new URLSearchParams("canaryLevel=30");
			const params100 = new URLSearchParams("canaryLevel=100");

			expect(resolveCanaryLevel(undefined, params10)).toBe(10);
			expect(resolveCanaryLevel(undefined, params30)).toBe(30);
			expect(resolveCanaryLevel(undefined, params100)).toBe(100);
		});

		it("props override URL params (props take precedence)", () => {
			const params10 = new URLSearchParams("canaryLevel=10");
			const params30 = new URLSearchParams("canaryLevel=30");

			// Props say 30, URL says 10 -> props win
			expect(resolveCanaryLevel({ canaryLevel: 30 }, params10)).toBe(30);

			// Props say 10, URL says 30 -> props win
			expect(resolveCanaryLevel({ canaryLevel: 10 }, params30)).toBe(10);
		});

		it("ignores invalid URL params, respects valid props", () => {
			const invalidParams = new URLSearchParams("canaryLevel=50");
			// Invalid param ignored, props override applies
			expect(resolveCanaryLevel({ canaryLevel: 30 }, invalidParams)).toBe(30);
		});
	});

	describe("makeCanaryGateRecommendation", () => {
		const baseMetrics: CanaryMetrics = {
			visibleBarsTotal: 1000,
			visibleBarsAfterFilter: 100,
			canaryPercentage: 10,
			workersActive: { externalBarsWorker: true, lodWorker: true },
			timestamp: Date.now(),
		};

		it("returns GO when metrics are healthy", () => {
			const metrics: CanaryMetrics = {
				...baseMetrics,
				p95FrameTimeMs: 30,
			};

			const result = makeCanaryGateRecommendation(metrics);
			expect(result.recommendation).toBe("GO");
			expect(result.reason).toContain("acceptable range");
		});

		it("returns NO-GO when p95 frame time exceeds threshold", () => {
			const metrics: CanaryMetrics = {
				...baseMetrics,
				p95FrameTimeMs: 60,
			};

			const result = makeCanaryGateRecommendation(metrics);
			expect(result.recommendation).toBe("NO-GO");
			expect(result.reason).toContain("Frame time");
		});

		it("returns NO-GO when LOD worker disabled at canary level >= 30%", () => {
			const metrics: CanaryMetrics = {
				...baseMetrics,
				canaryPercentage: 30,
				workersActive: { externalBarsWorker: true, lodWorker: false },
				p95FrameTimeMs: 30,
			};

			const result = makeCanaryGateRecommendation(metrics);
			expect(result.recommendation).toBe("NO-GO");
			expect(result.reason).toContain("LOD worker disabled");
		});

		it("allows LOD worker disabled at canary level 10%", () => {
			const metrics: CanaryMetrics = {
				...baseMetrics,
				canaryPercentage: 10,
				workersActive: { externalBarsWorker: true, lodWorker: false },
				p95FrameTimeMs: 30,
			};

			const result = makeCanaryGateRecommendation(metrics);
			expect(result.recommendation).toBe("GO");
		});
	});

	describe("formatCanaryMetrics", () => {
		it("formats basic metrics", () => {
			const metrics: CanaryMetrics = {
				visibleBarsTotal: 1000,
				visibleBarsAfterFilter: 100,
				canaryPercentage: 10,
				workersActive: { externalBarsWorker: true, lodWorker: true },
				timestamp: Date.now(),
			};

			const formatted = formatCanaryMetrics(metrics);
			expect(formatted).toContain("Canary 10%");
			expect(formatted).toContain("[100/1000 bars]");
			expect(formatted).toContain("externalBars:true");
			expect(formatted).toContain("lod:true");
		});

		it("includes optional p95 frame time", () => {
			const metrics: CanaryMetrics = {
				visibleBarsTotal: 1000,
				visibleBarsAfterFilter: 300,
				canaryPercentage: 30,
				workersActive: { externalBarsWorker: true, lodWorker: true },
				p95FrameTimeMs: 42.5,
				timestamp: Date.now(),
			};

			const formatted = formatCanaryMetrics(metrics);
			expect(formatted).toContain("p95=42.5ms");
		});

		it("includes optional request count", () => {
			const metrics: CanaryMetrics = {
				visibleBarsTotal: 1000,
				visibleBarsAfterFilter: 300,
				canaryPercentage: 30,
				workersActive: { externalBarsWorker: true, lodWorker: true },
				requestCount: 15,
				timestamp: Date.now(),
			};

			const formatted = formatCanaryMetrics(metrics);
			expect(formatted).toContain("requests=15");
		});

		it("formats full metrics with all fields", () => {
			const metrics: CanaryMetrics = {
				visibleBarsTotal: 2000,
				visibleBarsAfterFilter: 600,
				canaryPercentage: 30,
				workersActive: { externalBarsWorker: true, lodWorker: false },
				p95FrameTimeMs: 35.2,
				requestCount: 8,
				timestamp: Date.now(),
			};

			const formatted = formatCanaryMetrics(metrics);
			expect(formatted).toContain("Canary 30%");
			expect(formatted).toContain("[600/2000 bars]");
			expect(formatted).toContain("externalBars:true");
			expect(formatted).toContain("lod:false");
			expect(formatted).toContain("p95=35.2ms");
			expect(formatted).toContain("requests=8");
		});
	});
});
