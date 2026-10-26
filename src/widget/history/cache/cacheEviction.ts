import type {
	CacheCoverageIndex,
	CacheEvictPolicy,
	CacheKey,
} from "./LocalCacheMatrix";

/** Một segment ứng viên bị đuổi, kèm kích thước đo thật (bytes serialized). */
export interface EvictCandidate {
	readonly cacheKey: CacheKey;
	readonly fromTs: number;
	readonly toTs: number;
	readonly lastAccessedAt: string;
	readonly byteSize: number;
}

export const BYTES_PER_MB = 1024 * 1024;

/** Đo kích thước serialized của bars (JSON length). Bars là plain data nên không throw. */
export function measureBarsBytes(bars: readonly unknown[]): number {
	return JSON.stringify(bars ?? []).length;
}

function candidateKey(c: EvictCandidate): string {
	return `${c.cacheKey}::${c.fromTs}::${c.toTs}`;
}

function byAge(a: EvictCandidate, b: EvictCandidate): number {
	if (a.lastAccessedAt !== b.lastAccessedAt) return a.lastAccessedAt < b.lastAccessedAt ? -1 : 1;
	return a.fromTs - b.fromTs;
}

/**
 * Chọn nạn nhân đuổi theo quota: per-key soft cap trước, global cap sau,
 * oldest-first (tiebreak fromTs). Trả về segmentKey (`cacheKey::fromTs::toTs`).
 * Pure — test khóa thứ tự mà không cần IndexedDB (xem AC4).
 */
export function selectEvictionVictims(
	candidates: readonly EvictCandidate[],
	policy: CacheEvictPolicy,
	usageByKey: ReadonlyMap<CacheKey, number>,
): string[] {
	const victims: string[] = [];
	const dropped = new Set<string>();
	let remainingTotal = 0;
	for (const used of usageByKey.values()) remainingTotal += used;

	const byKey = new Map<CacheKey, EvictCandidate[]>();
	for (const c of candidates) {
		const list = byKey.get(c.cacheKey) ?? [];
		list.push(c);
		byKey.set(c.cacheKey, list);
	}

	const softCap = policy.symbolSoftCapMb * BYTES_PER_MB;
	for (const [key, list] of byKey) {
		let used = usageByKey.get(key) ?? list.reduce((n, c) => n + c.byteSize, 0);
		for (const c of [...list].sort(byAge)) {
			if (used <= softCap) break;
			victims.push(candidateKey(c));
			dropped.add(candidateKey(c));
			used -= c.byteSize;
			remainingTotal -= c.byteSize;
		}
	}

	const globalCap = policy.globalQuotaMb * BYTES_PER_MB;
	if (remainingTotal > globalCap) {
		const rest = candidates.filter((c) => !dropped.has(candidateKey(c))).sort(byAge);
		for (const c of rest) {
			if (remainingTotal <= globalCap) break;
			victims.push(candidateKey(c));
			remainingTotal -= c.byteSize;
		}
	}
	return victims;
}

/** Rebuild coverage sau khi xóa: lọc segment chết, chuẩn hóa ranges. Hết segment → null. */
export function rebuildCoverageAfterEviction(
	coverage: CacheCoverageIndex,
	victimKeys: ReadonlySet<string>,
	normalizeRanges: (ranges: readonly { fromTs: number; toTs: number }[]) => readonly { fromTs: number; toTs: number }[],
): CacheCoverageIndex | null {
	const kept = coverage.segments.filter((s) => !victimKeys.has(`${coverage.cacheKey}::${s.fromTs}::${s.toTs}`));
	if (kept.length === 0) return null;
	return {
		...coverage,
		ranges: normalizeRanges(kept.map((s) => ({ fromTs: s.fromTs, toTs: s.toTs }))) as CacheCoverageIndex["ranges"],
		segments: kept,
	};
}

/** Snapshot thuần dữ liệu để lập kế hoạch đuổi (không chạm store). */
export interface EvictSnapshot {
	readonly coverages: readonly CacheCoverageIndex[];
	readonly segmentBytes: ReadonlyMap<string, number>;
}

export interface EvictPlan {
	readonly victims: string[];
	readonly reclaimedBytes: number;
	readonly nextCoverages: Map<CacheKey, CacheCoverageIndex | null>;
}

/**
 * Lập kế hoạch đuổi đầy đủ: nạn nhân + bytes thu hồi + coverage sau xóa.
 * Pure — cả 2 path (memory/IndexedDB) dùng chung, chỉ khác tầng I/O ở caller.
 */
export function planEviction(
	snapshot: EvictSnapshot,
	policy: CacheEvictPolicy,
	normalizeRanges: (ranges: readonly { fromTs: number; toTs: number }[]) => readonly { fromTs: number; toTs: number }[],
): EvictPlan {
	const candidates: EvictCandidate[] = [];
	const usageByKey = new Map<CacheKey, number>();
	for (const cov of snapshot.coverages) {
		let used = 0;
		for (const seg of cov.segments) {
			const bs = snapshot.segmentBytes.get(`${cov.cacheKey}::${seg.fromTs}::${seg.toTs}`) ?? 0;
			used += bs;
			candidates.push({ cacheKey: cov.cacheKey, fromTs: seg.fromTs, toTs: seg.toTs, lastAccessedAt: seg.lastAccessedAt, byteSize: bs });
		}
		usageByKey.set(cov.cacheKey, used);
	}
	const victims = selectEvictionVictims(candidates, policy, usageByKey);
	const victimSet = new Set(victims);
	let reclaimedBytes = 0;
	for (const c of candidates) {
		if (victimSet.has(`${c.cacheKey}::${c.fromTs}::${c.toTs}`)) reclaimedBytes += c.byteSize;
	}
	const nextCoverages = new Map<CacheKey, CacheCoverageIndex | null>();
	for (const cov of snapshot.coverages) {
		nextCoverages.set(cov.cacheKey, rebuildCoverageAfterEviction(cov, victimSet, normalizeRanges));
	}
	return { victims, reclaimedBytes, nextCoverages };
}
