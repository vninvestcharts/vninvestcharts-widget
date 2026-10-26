import type { SourceSemanticsDescriptor } from "../../../lib/adapters";
import type { OHLCVBar } from "../../../lib/types/ohlcv";

export interface CacheKeyParts {
	readonly source: string;
	readonly symbol: string;
	readonly timeframe: string;
	readonly adjustmentPolicy: string;
	readonly schemaVersion: string;
}

export type CacheKey = string;

export interface TimeRange {
	readonly fromTs: number;
	readonly toTs: number;
}

export interface CacheSegmentMeta {
	readonly file: string;
	readonly fromTs: number;
	readonly toTs: number;
	readonly barCount: number;
	readonly checksum: string;
	readonly lastAccessedAt: string;
}

export interface CacheSemanticScope {
	readonly sourceContractVersion: SourceSemanticsDescriptor["sourceContractVersion"];
	readonly instrumentClass: SourceSemanticsDescriptor["instrumentClass"];
	readonly sessionModel: SourceSemanticsDescriptor["sessionModel"];
	readonly sessionCalendarId?: SourceSemanticsDescriptor["sessionCalendarId"];
	readonly timezone: SourceSemanticsDescriptor["timezone"];
	readonly finalityMode: SourceSemanticsDescriptor["finalityMode"];
	readonly correctionLookbackMs?: SourceSemanticsDescriptor["correctionLookbackMs"];
}

export interface CacheCoverageIndex {
	readonly schemaVersion: string;
	readonly cacheKey: CacheKey;
	readonly revision: number;
	readonly semanticScope?: CacheSemanticScope;
	readonly ranges: readonly TimeRange[];
	readonly segments: readonly CacheSegmentMeta[];
}

export interface CacheReadResult {
	readonly bars: readonly OHLCVBar[];
	readonly missingRanges: readonly TimeRange[];
}

export interface CacheWriteMeta {
	readonly requestId: string;
	readonly sessionRevision: number;
	readonly reason: "remote-fill" | "warmup" | "repair";
	readonly semanticScope?: CacheSemanticScope;
}

export interface CacheWriteResult {
	readonly cacheKey: CacheKey;
	readonly revision: number;
	readonly writtenBarCount: number;
	readonly affectedRanges: readonly TimeRange[];
}

export type CacheInvalidateReason =
	| "schema-mismatch"
	| "adjustment-policy-changed"
	| "source-contract-changed"
	| "manual";

export interface CacheEvictPolicy {
	readonly globalQuotaMb: number;
	readonly symbolSoftCapMb: number;
}

export interface CacheEvictResult {
	readonly reclaimedBytes: number;
	readonly deletedSegmentCount: number;
}

/**
 * Runtime abstraction for local file-cache matrix.
 *
 * Notes:
 * - readRanges must not throw on cache misses; it should return missingRanges.
 * - writePatch is expected to enforce validation + dedupe + sort before commit.
 */
export interface LocalCacheMatrix {
	getCoverage(cacheKey: CacheKey, expectedScope?: CacheSemanticScope): Promise<CacheCoverageIndex | null>;
	readRanges(cacheKey: CacheKey, ranges: readonly TimeRange[], expectedScope?: CacheSemanticScope): Promise<CacheReadResult>;
	writePatch(cacheKey: CacheKey, bars: readonly OHLCVBar[], meta: CacheWriteMeta): Promise<CacheWriteResult>;
	invalidate(cacheKey: CacheKey, reason: CacheInvalidateReason): Promise<void>;
	evict(policy: CacheEvictPolicy): Promise<CacheEvictResult>;
}

export interface LocalCacheMatrixFactory {
	create(cacheRoot: string): LocalCacheMatrix;
}

/**
 * Canonical cache key formatter matching CACHE_FILE_CONTRACT.
 */
export function toCacheKey(parts: CacheKeyParts): CacheKey {
	return [
		parts.source,
		parts.symbol,
		parts.timeframe,
		parts.adjustmentPolicy,
		parts.schemaVersion,
	].join(":");
}

export function toCacheSemanticScope(sourceSemantics: SourceSemanticsDescriptor): CacheSemanticScope {
	return {
		sourceContractVersion: sourceSemantics.sourceContractVersion,
		instrumentClass: sourceSemantics.instrumentClass,
		sessionModel: sourceSemantics.sessionModel,
		sessionCalendarId: sourceSemantics.sessionCalendarId,
		timezone: sourceSemantics.timezone,
		finalityMode: sourceSemantics.finalityMode,
		correctionLookbackMs: sourceSemantics.correctionLookbackMs,
	};
}
