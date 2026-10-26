export type {
	CacheCoverageIndex,
	CacheEvictPolicy,
	CacheEvictResult,
	CacheInvalidateReason,
	CacheKey,
	CacheKeyParts,
	CacheReadResult,
	CacheSemanticScope,
	CacheSegmentMeta,
	CacheWriteMeta,
	CacheWriteResult,
	LocalCacheMatrix,
	LocalCacheMatrixFactory,
	TimeRange,
} from "./LocalCacheMatrix";

export { toCacheKey, toCacheSemanticScope } from "./LocalCacheMatrix";

export { LocalCacheMatrixFactoryImpl } from "./IndexedDBCacheMatrix";
export { selectEvictionVictims, measureBarsBytes, planEviction, BYTES_PER_MB } from "./cacheEviction";
export type { EvictCandidate, EvictSnapshot, EvictPlan } from "./cacheEviction";
