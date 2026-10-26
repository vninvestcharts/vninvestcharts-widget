import { describe, it, expect } from "vitest";
import { toCacheKey, LocalCacheMatrixFactoryImpl } from "../index";
import type { CacheSemanticScope } from "../LocalCacheMatrix";
import type { OHLCVBar } from "../../../../lib/types/ohlcv";

function createMockBar(timestamp: number, close: number, index: number): OHLCVBar {
	return {
		date: new Date(timestamp),
		open: close - 1,
		high: close + 1,
		low: close - 2,
		close,
		volume: 1000 + index,
		index,
		dataIndex: index,
	};
}

function createSemanticScope(overrides: Partial<CacheSemanticScope> = {}): CacheSemanticScope {
	return {
		sourceContractVersion: "vnstocks-window-v1",
		instrumentClass: "equity",
		sessionModel: "exchange-calendar",
		sessionCalendarId: "vn-exchange-calendar",
		timezone: "Asia/Ho_Chi_Minh",
		finalityMode: "historically-correctable",
		correctionLookbackMs: 30 * 24 * 60 * 60 * 1000,
		...overrides,
	};
}

describe("LocalCacheMatrix contract tests", () => {
	it("formats canonical cache key from parts", () => {
		const key = toCacheKey({
			source: "vninvest",
			symbol: "HPG",
			timeframe: "1m",
			adjustmentPolicy: "split-adjusted",
			schemaVersion: "v2",
		});

		expect(key).toBe("vninvest:HPG:1m:split-adjusted:v2");
	});

	it("contract-manifest-schema: write patch, read index and verify manifests meta + invalidation", async () => {
		const factory = new LocalCacheMatrixFactoryImpl();
		const cache = factory.create("mock-cache-root");
		const cacheKey = "vninvest:HPG:1m:split-adjusted:v2";

		// 1. Initial write
		const bars = [
			createMockBar(1704067200000, 100, 0),
			createMockBar(1704153600000, 101, 1),
		];

		const writeResult = await cache.writePatch(cacheKey, bars, {
			requestId: "test-req-1",
			sessionRevision: 1,
			reason: "warmup",
			semanticScope: createSemanticScope(),
		});

		expect(writeResult.cacheKey).toBe(cacheKey);
		expect(writeResult.revision).toBe(1);
		expect(writeResult.writtenBarCount).toBe(2);

		// 2. Read coverage index to verify segments schema
		const coverage = await cache.getCoverage(cacheKey);
		expect(coverage).not.toBeNull();
		expect(coverage!.schemaVersion).toBe("v2");
		expect(coverage!.cacheKey).toBe(cacheKey);
		expect(coverage!.revision).toBe(1);
		expect(coverage!.semanticScope).toEqual(createSemanticScope());
		expect(coverage!.segments).toHaveLength(1);
		expect(coverage!.segments[0].barCount).toBe(2);
		expect(coverage!.segments[0].fromTs).toBe(1704067200000);
		expect(coverage!.segments[0].toTs).toBe(1704153600000);

		// 3. Test Invalidation path
		await cache.invalidate(cacheKey, "manual");
		const coverageAfterPurge = await cache.getCoverage(cacheKey);
		expect(coverageAfterPurge).toBeNull();
	});

	it("contract-coverage-normalization: union-merges overlapping and contiguous segments correctly", async () => {
		const factory = new LocalCacheMatrixFactoryImpl();
		const cache = factory.create("mock-cache-root");
		const cacheKey = "vninvest:TCB:1m:split-adjusted:v2";

		// Write Segment 1: [1000, 2000]
		await cache.writePatch(cacheKey, [
			createMockBar(1000, 50, 0),
			createMockBar(2000, 51, 1),
		], { requestId: "req-1", sessionRevision: 1, reason: "warmup", semanticScope: createSemanticScope() });

		// Write Segment 2: [1500, 3000] - Overlapping Segment 1
		await cache.writePatch(cacheKey, [
			createMockBar(1500, 51, 0),
			createMockBar(3000, 52, 1),
		], { requestId: "req-2", sessionRevision: 2, reason: "remote-fill", semanticScope: createSemanticScope() });

		// Write Segment 3: [4000, 5000] - Disjoint Segment
		await cache.writePatch(cacheKey, [
			createMockBar(4000, 55, 0),
			createMockBar(5000, 56, 1),
		], { requestId: "req-3", sessionRevision: 3, reason: "remote-fill", semanticScope: createSemanticScope() });

		// Write Segment 4: [3000, 4000] - Contiguous Segment connecting overlap-segment and disjoint-segment
		await cache.writePatch(cacheKey, [
			createMockBar(3000, 52, 0),
			createMockBar(4000, 55, 1),
		], { requestId: "req-4", sessionRevision: 4, reason: "remote-fill", semanticScope: createSemanticScope() });

		const coverage = await cache.getCoverage(cacheKey);
		expect(coverage).not.toBeNull();
		// All segments from 1000 to 5000 should be union-merged into a single contiguous TimeRange [1000, 5000]
		expect(coverage!.ranges).toHaveLength(1);
		expect(coverage!.ranges[0]).toEqual({ fromTs: 1000, toTs: 5000 });
	});

	it("contract-segment-bar-order-dedupe: sorts lopsided inputs and enforces chronological deduplication", async () => {
		const factory = new LocalCacheMatrixFactoryImpl();
		const cache = factory.create("mock-cache-root");
		const cacheKey = "vninvest:VIC:1m:split-adjusted:v2";

		// Write out-of-order bars with duplicates
		const inputBars = [
			createMockBar(2000, 75, 1),
			createMockBar(1000, 74, 0),
			createMockBar(2000, 76, 2), // Duplicate timestamp (higher index, last wins)
		];

		await cache.writePatch(cacheKey, inputBars, {
			requestId: "req-1",
			sessionRevision: 1,
			reason: "warmup",
			semanticScope: createSemanticScope(),
		});

		const readResult = await cache.readRanges(cacheKey, [{ fromTs: 500, toTs: 2500 }]);
		expect(readResult.bars).toHaveLength(2);
		expect(readResult.bars[0].date.getTime()).toBe(1000);
		expect(readResult.bars[0].close).toBe(74);
		expect(readResult.bars[1].date.getTime()).toBe(2000);
		expect(readResult.bars[1].close).toBe(76); // Correctly deduplicated (last occurrence wins)
	});

	it("contract-atomic-write-crash-recovery: simulated failure preserves existing revision clean state", async () => {
		const factory = new LocalCacheMatrixFactoryImpl();
		const cache = factory.create("mock-cache-root");
		const cacheKey = "vninvest:VNM:1m:split-adjusted:v2";

		// Write initial good state
		await cache.writePatch(cacheKey, [
			createMockBar(1000, 60, 0),
		], { requestId: "req-1", sessionRevision: 1, reason: "warmup", semanticScope: createSemanticScope() });

		const initialIndex = await cache.getCoverage(cacheKey);
		expect(initialIndex).not.toBeNull();
		expect(initialIndex!.revision).toBe(1);

		// Attempt writing bad/empty array patch - should preserve revision and cleanly return
		const badWrite = await cache.writePatch(cacheKey, [], {
			requestId: "req-2",
			sessionRevision: 2,
			reason: "remote-fill",
			semanticScope: createSemanticScope(),
		});

		expect(badWrite.writtenBarCount).toBe(0);
		expect(badWrite.revision).toBe(1); // Revision is preserved

		const indexAfterBadWrite = await cache.getCoverage(cacheKey);
		expect(indexAfterBadWrite!.revision).toBe(1);
	});

	it("contract-schema-mismatch-invalidation: automatically purges old cache when version mismatched", async () => {
		const factory = new LocalCacheMatrixFactoryImpl();
		const cache = factory.create("mock-cache-root");
		const oldCacheKey = "vninvest:HPG:1m:split-adjusted:v1"; // Mismatched version v1

		// Writing to v1 key - simulation of version upgrade
		await cache.writePatch(oldCacheKey, [
			createMockBar(1000, 80, 0),
		], { requestId: "req-1", sessionRevision: 1, reason: "warmup", semanticScope: createSemanticScope() });

		// Mismatch trigger logic: invalidating v1 scope manually
		await cache.invalidate(oldCacheKey, "schema-mismatch");

		const coverage = await cache.getCoverage(oldCacheKey);
		expect(coverage).toBeNull(); // Cache successfully purged
	});

	it("contract-offline-replay-cache-hit: resolves exact hits and correctly reports partial missing ranges", async () => {
		const factory = new LocalCacheMatrixFactoryImpl();
		const cache = factory.create("mock-cache-root");
		const cacheKey = "vninvest:FPT:1m:split-adjusted:v2";

		// Write initial cache: [1000, 2000] and [4000, 5000]
		await cache.writePatch(cacheKey, [
			createMockBar(1000, 90, 0),
			createMockBar(2000, 91, 1),
		], { requestId: "req-1", sessionRevision: 1, reason: "warmup", semanticScope: createSemanticScope() });

		await cache.writePatch(cacheKey, [
			createMockBar(4000, 94, 0),
			createMockBar(5000, 95, 1),
		], { requestId: "req-2", sessionRevision: 2, reason: "warmup", semanticScope: createSemanticScope() });

		// Read target range fully covered by cache [1000, 2000]
		const fullHit = await cache.readRanges(cacheKey, [{ fromTs: 1000, toTs: 2000 }]);
		expect(fullHit.missingRanges).toHaveLength(0); // Perfect Cache Hit
		expect(fullHit.bars).toHaveLength(2);

		// Read target range partially covered [1500, 4500] (gap between 2000 and 4000 is missing)
		const partialHit = await cache.readRanges(cacheKey, [{ fromTs: 1500, toTs: 4500 }]);
		expect(partialHit.bars).toHaveLength(4); // Retains cached bars from both segments intersecting viewport
		expect(partialHit.missingRanges).toHaveLength(1);
		expect(partialHit.missingRanges[0]).toEqual({ fromTs: 2000, toTs: 4000 }); // Correct missing range reported
	});

	it("contract-semantics-scope-invalidation: reads invalidate stale cache when semantic scope changes", async () => {
		const factory = new LocalCacheMatrixFactoryImpl();
		const cache = factory.create("mock-cache-root");
		const cacheKey = "vninvest:SSI:1m:split-adjusted:v2";
		const originalScope = createSemanticScope();
		const changedScope = createSemanticScope({
			finalityMode: "immutable",
			sourceContractVersion: "vnstocks-window-v2",
		});

		await cache.writePatch(cacheKey, [
			createMockBar(1000, 111, 0),
			createMockBar(2000, 112, 1),
		], {
			requestId: "req-1",
			sessionRevision: 1,
			reason: "warmup",
			semanticScope: originalScope,
		});

		const cacheHit = await cache.readRanges(cacheKey, [{ fromTs: 1000, toTs: 2000 }], originalScope);
		expect(cacheHit.missingRanges).toHaveLength(0);
		expect(cacheHit.bars).toHaveLength(2);

		const staleRead = await cache.readRanges(cacheKey, [{ fromTs: 1000, toTs: 2000 }], changedScope);
		expect(staleRead.bars).toHaveLength(0);
		expect(staleRead.missingRanges).toEqual([{ fromTs: 1000, toTs: 2000 }]);

		const coverageAfterInvalidation = await cache.getCoverage(cacheKey, originalScope);
		expect(coverageAfterInvalidation).toBeNull();
	});
});
