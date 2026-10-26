import { describe, it, expect } from "vitest";
import { LocalCacheMatrixFactoryImpl, selectEvictionVictims } from "../index";
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

function createSemanticScope(): CacheSemanticScope {
	return {
		sourceContractVersion: "vnstocks-window-v1",
		instrumentClass: "equity",
		sessionModel: "exchange-calendar",
		sessionCalendarId: "vn-exchange-calendar",
		timezone: "Asia/Ho_Chi_Minh",
		finalityMode: "historically-correctable",
		correctionLookbackMs: 30 * 24 * 60 * 60 * 1000,
	};
}

const SCOPE = { requestId: "evict-req", sessionRevision: 1, reason: "warmup", semanticScope: createSemanticScope() } as const;

describe("IndexedDBCacheMatrix.evict (F-07)", () => {
	it("t1: evict on empty matrix reclaims nothing", async () => {
		const cache = new LocalCacheMatrixFactoryImpl().create("evict-empty-root");
		const result = await cache.evict({ globalQuotaMb: 1, symbolSoftCapMb: 1 });
		expect(result).toEqual({ reclaimedBytes: 0, deletedSegmentCount: 0 });
	});

	it("t2: zero quota evicts every segment and reports real bytes", async () => {
		const cache = new LocalCacheMatrixFactoryImpl().create("evict-zero-root");
		const cacheKey = "EVICT:ZERO:1m:split-adjusted:v2";
		await cache.writePatch(cacheKey, [
			createMockBar(1000, 50, 0),
			createMockBar(2000, 51, 1),
		], { ...SCOPE });
		await cache.writePatch(cacheKey, [
			createMockBar(3000, 52, 0),
			createMockBar(4000, 53, 1),
		], { ...SCOPE, requestId: "evict-req-2", sessionRevision: 2 });

		const result = await cache.evict({ globalQuotaMb: 0, symbolSoftCapMb: 0 });
		expect(result.deletedSegmentCount).toBe(2);
		expect(result.reclaimedBytes).toBeGreaterThan(0);

		expect(await cache.getCoverage(cacheKey)).toBeNull();
		const read = await cache.readRanges(cacheKey, [{ fromTs: 500, toTs: 4500 }]);
		expect(read.bars).toHaveLength(0);
		expect(read.missingRanges).toEqual([{ fromTs: 500, toTs: 4500 }]);
	});

	it("t3: generous quota evicts nothing and keeps data intact", async () => {
		const cache = new LocalCacheMatrixFactoryImpl().create("evict-keep-root");
		const cacheKey = "EVICT:KEEP:1m:split-adjusted:v2";
		await cache.writePatch(cacheKey, [
			createMockBar(1000, 60, 0),
		], { ...SCOPE });

		const result = await cache.evict({ globalQuotaMb: 1536, symbolSoftCapMb: 250 });
		expect(result).toEqual({ reclaimedBytes: 0, deletedSegmentCount: 0 });

		const coverage = await cache.getCoverage(cacheKey);
		expect(coverage).not.toBeNull();
		expect(coverage!.segments).toHaveLength(1);
	});

	it("t4: victim selection is oldest-first with fromTs tiebreak", () => {
		const victims = selectEvictionVictims([
			{ cacheKey: "EVICT:K", fromTs: 3000, toTs: 4000, lastAccessedAt: "2026-10-24T00:00:00.002Z", byteSize: 100 },
			{ cacheKey: "EVICT:K", fromTs: 1000, toTs: 2000, lastAccessedAt: "2026-10-24T00:00:00.001Z", byteSize: 100 },
			{ cacheKey: "EVICT:K", fromTs: 2000, toTs: 3000, lastAccessedAt: "2026-10-24T00:00:00.001Z", byteSize: 100 },
		], { globalQuotaMb: 0, symbolSoftCapMb: 0 }, new Map([["EVICT:K", 300]]));
		expect(victims).toEqual([
			"EVICT:K::1000::2000",
			"EVICT:K::2000::3000",
			"EVICT:K::3000::4000",
		]);
	});
});
