import type { OHLCVBar } from "../../../lib/types/ohlcv";
import type {
	CacheCoverageIndex,
	CacheEvictPolicy,
	CacheEvictResult,
	CacheInvalidateReason,
	CacheKey,
	CacheReadResult,
	CacheSemanticScope,
	CacheSegmentMeta,
	CacheWriteMeta,
	CacheWriteResult,
	LocalCacheMatrix,
	LocalCacheMatrixFactory,
	TimeRange,
} from "./LocalCacheMatrix";
import { measureBarsBytes, planEviction } from "./cacheEviction";

interface CacheManifest {
	schemaVersion: string;
	cacheKey: CacheKey;
	source: string;
	sourceContractVersion: string;
	symbol: string;
	timeframe: string;
	adjustmentPolicy: string;
	instrumentClass: CacheSemanticScope["instrumentClass"];
	sessionModel: CacheSemanticScope["sessionModel"];
	sessionCalendarId?: CacheSemanticScope["sessionCalendarId"];
	timezone: string;
	finalityMode: CacheSemanticScope["finalityMode"];
	correctionLookbackMs?: number;
	createdAt: string;
	lastUpdatedAt: string;
	revision: number;
	segmentCount: number;
	totalBars: number;
	quota: {
		symbolSoftCapMb: number;
		globalQuotaMb: number;
	};
	checksum: {
		algorithm: "sha256";
		manifestHash: string;
	};
}

// A safe fallback database in memory in case IndexedDB is not supported/blocked (e.g. Node test sandbox)
interface MemoryDatabaseState {
	manifests: Map<CacheKey, CacheManifest>;
	coverageIndexes: Map<CacheKey, CacheCoverageIndex>;
	segments: Map<string, { bars: OHLCVBar[]; revision: number }>;
}

const memoryDB: MemoryDatabaseState = {
	manifests: new Map(),
	coverageIndexes: new Map(),
	segments: new Map(),
};

function fnv1a32(input: string): string {
	let hash = 0x811c9dc5;
	for (let i = 0; i < input.length; i += 1) {
		hash ^= input.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(16).padStart(8, "0");
}

function createSegmentChecksum(bars: readonly OHLCVBar[]): string {
	const payload = bars
		.map((bar) => [
			bar.date.getTime(),
			bar.open,
			bar.high,
			bar.low,
			bar.close,
			bar.volume,
		])
		.join("|");
	return fnv1a32(payload);
}

function createManifestChecksum(manifest: Omit<CacheManifest, "checksum">): string {
	return fnv1a32(JSON.stringify(manifest));
}

function normalizeOptionalString(value?: string): string | null {
	return typeof value === "string" && value.length > 0 ? value : null;
}

function normalizeOptionalNumber(value?: number): number | null {
	return typeof value === "number" ? value : null;
}

function semanticScopesEqual(left: CacheSemanticScope | null | undefined, right: CacheSemanticScope | null | undefined): boolean {
	if (!left || !right) {
		return false;
	}

	return left.sourceContractVersion === right.sourceContractVersion
		&& left.instrumentClass === right.instrumentClass
		&& left.sessionModel === right.sessionModel
		&& normalizeOptionalString(left.sessionCalendarId) === normalizeOptionalString(right.sessionCalendarId)
		&& left.timezone === right.timezone
		&& left.finalityMode === right.finalityMode
		&& normalizeOptionalNumber(left.correctionLookbackMs) === normalizeOptionalNumber(right.correctionLookbackMs);
}

function manifestToSemanticScope(manifest: CacheManifest | null): CacheSemanticScope | null {
	if (!manifest) {
		return null;
	}

	return {
		sourceContractVersion: manifest.sourceContractVersion,
		instrumentClass: manifest.instrumentClass,
		sessionModel: manifest.sessionModel,
		sessionCalendarId: manifest.sessionCalendarId,
		timezone: manifest.timezone,
		finalityMode: manifest.finalityMode,
		correctionLookbackMs: manifest.correctionLookbackMs,
	};
}

/**
 * Normalizes an array of ranges by union-merging overlapping or contiguous intervals.
 * Expects ranges to be sorted or will sort them internally.
 */
export function normalizeRanges(ranges: readonly TimeRange[]): readonly TimeRange[] {
	if (ranges.length <= 1) {
		return ranges;
	}

	const sorted = [...ranges].sort((a, b) => a.fromTs - b.fromTs);
	const merged: TimeRange[] = [];

	let current = sorted[0];
	for (let i = 1; i < sorted.length; i += 1) {
		const next = sorted[i];
		// Contiguous or overlapping range check (dedupe/coalescing)
		if (current.toTs >= next.fromTs) {
			current = {
				fromTs: current.fromTs,
				toTs: Math.max(current.toTs, next.toTs),
			};
		} else {
			merged.push(current);
			current = next;
		}
	}
	merged.push(current);

	return merged;
}

/**
 * Computes missing segments (gaps) in targetRange not covered by coverageRanges.
 */
export function computeMissingTimeRanges(
	targetRange: TimeRange,
	coverageRanges: readonly TimeRange[]
): TimeRange[] {
	const intersections: TimeRange[] = [];
	for (const range of coverageRanges) {
		const start = Math.max(targetRange.fromTs, range.fromTs);
		const end = Math.min(targetRange.toTs, range.toTs);
		if (start < end) {
			intersections.push({ fromTs: start, toTs: end });
		}
	}

	if (intersections.length === 0) {
		return [targetRange];
	}

	intersections.sort((a, b) => a.fromTs - b.fromTs);

	const missing: TimeRange[] = [];
	let currentTs = targetRange.fromTs;

	for (const intersect of intersections) {
		if (currentTs < intersect.fromTs) {
			missing.push({ fromTs: currentTs, toTs: intersect.fromTs });
		}
		currentTs = Math.max(currentTs, intersect.toTs);
	}

	if (currentTs < targetRange.toTs) {
		missing.push({ fromTs: currentTs, toTs: targetRange.toTs });
	}

	return missing;
}

/**
 * IndexedDB + InMemory fallback implementation for LocalCacheMatrix
 */
class IndexedDBCacheMatrix implements LocalCacheMatrix {
	private readonly cacheRoot: string;
	private readonly dbName: string;
	private dbPromise: Promise<any> | null = null;
	private useMemoryOnly = false;
	private writeLocks = new Map<CacheKey, Promise<void>>();

	constructor(cacheRoot: string) {
		this.cacheRoot = cacheRoot;
		this.dbName = `VNInvestCharts_Cache_${cacheRoot.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
		// Proactively check if indexedDB is available
		const isBrowser = typeof window !== "undefined";
		const idb = isBrowser ? (window.indexedDB || (window as any).mozIndexedDB || (window as any).webkitIndexedDB || (window as any).msIndexedDB) : null; // ARC-1-keep: legacy bridge
		if (!idb && typeof globalThis !== "undefined" && !(globalThis as any).indexedDB) { // ARC-1-keep: legacy bridge
			this.useMemoryOnly = true;
		}
	}

	private async getDB(): Promise<any> {
		if (this.useMemoryOnly) {
			return null;
		}

		if (this.dbPromise) {
			return this.dbPromise;
		}

		this.dbPromise = new Promise((resolve) => {
			const idb = (globalThis as any).indexedDB // ARC-1-keep: legacy bridge
				|| (typeof window !== "undefined" ? (window.indexedDB || (window as any).mozIndexedDB || (window as any).webkitIndexedDB || (window as any).msIndexedDB) : null); // ARC-1-keep: legacy bridge
			if (!idb) {
				this.useMemoryOnly = true;
				resolve(null);
				return;
			}

			const request = idb.open(this.dbName, 2);

			request.onupgradeneeded = (event: any) => {
				const db = event.target.result;
				if (!db.objectStoreNames.contains("manifests")) {
					db.createObjectStore("manifests", { keyPath: "cacheKey" });
				}
				if (!db.objectStoreNames.contains("coverage_indexes")) {
					db.createObjectStore("coverage_indexes", { keyPath: "cacheKey" });
				}
				if (!db.objectStoreNames.contains("segments")) {
					db.createObjectStore("segments", { keyPath: "segmentKey" });
				}
			};

			request.onsuccess = (event: any) => {
				resolve(event.target.result);
			};

			request.onerror = () => {
				this.useMemoryOnly = true;
				resolve(null);
			};
		});

		return this.dbPromise;
	}

	private async getManifest(cacheKey: CacheKey, db?: any): Promise<CacheManifest | null> {
		const resolvedDb = db ?? await this.getDB();
		if (this.useMemoryOnly || !resolvedDb) {
			return memoryDB.manifests.get(cacheKey) ?? null;
		}

		return new Promise((resolveManifest) => {
			try {
				const tx = resolvedDb.transaction(["manifests"], "readonly");
				const store = tx.objectStore("manifests");
				const req = store.get(cacheKey);
				req.onsuccess = () => resolveManifest((req.result as CacheManifest | undefined) ?? null);
				req.onerror = () => resolveManifest(null);
			} catch {
				resolveManifest(null);
			}
		});
	}

	private async invalidateIfSemanticScopeMismatch(
		cacheKey: CacheKey,
		expectedScope: CacheSemanticScope | undefined,
		manifest: CacheManifest | null,
		coverage: CacheCoverageIndex | null,
	): Promise<boolean> {
		if (!expectedScope) {
			return false;
		}

		if (!manifest && !coverage) {
			return false;
		}

		const manifestScope = manifestToSemanticScope(manifest);
		if (!semanticScopesEqual(manifestScope, expectedScope)) {
			await this.invalidate(cacheKey, "source-contract-changed");
			return true;
		}

		if (coverage && !semanticScopesEqual(coverage.semanticScope, expectedScope)) {
			await this.invalidate(cacheKey, "source-contract-changed");
			return true;
		}

		return false;
	}

	public async getCoverage(cacheKey: CacheKey, expectedScope?: CacheSemanticScope): Promise<CacheCoverageIndex | null> {
		const db = await this.getDB();
		const manifest = await this.getManifest(cacheKey, db);
		let coverage: CacheCoverageIndex | null = null;
		if (this.useMemoryOnly || !db) {
			const memIndex = memoryDB.coverageIndexes.get(cacheKey);
			coverage = memIndex ? memIndex : null;
		} else {
			coverage = await new Promise((resolve) => {
				try {
					const tx = db.transaction(["coverage_indexes"], "readonly");
					const store = tx.objectStore("coverage_indexes");
					const req = store.get(cacheKey);
					req.onsuccess = () => resolve(req.result || null);
					req.onerror = () => resolve(null);
				} catch {
					resolve(null);
				}
			});
		}

		if (await this.invalidateIfSemanticScopeMismatch(cacheKey, expectedScope, manifest, coverage)) {
			return null;
		}

		return coverage;
	}

	public async readRanges(cacheKey: CacheKey, ranges: readonly TimeRange[], expectedScope?: CacheSemanticScope): Promise<CacheReadResult> {
		const coverage = await this.getCoverage(cacheKey, expectedScope);
		if (!coverage || coverage.segments.length === 0) {
			return { bars: [], missingRanges: ranges };
		}

		// 1. Identify which segments we need to read and analyze gaps (missing ranges)
		const neededSegments: CacheSegmentMeta[] = [];
		const allMissingRanges: TimeRange[] = [];

		for (const targetRange of ranges) {
			// Find intersecting segments in our coverage
			for (const seg of coverage.segments) {
				const overlapStart = Math.max(targetRange.fromTs, seg.fromTs);
				const overlapEnd = Math.min(targetRange.toTs, seg.toTs);
				if (overlapStart < overlapEnd) {
					neededSegments.push(seg);
				}
			}

			// Precise Gap Analysis (contract-offline-replay-cache-hit)
			const missingForTarget = computeMissingTimeRanges(targetRange, coverage.ranges);
			allMissingRanges.push(...missingForTarget);
		}

		// 2. Fetch bars from identified segments
		const barsMap = new Map<number, OHLCVBar>();
		const db = await this.getDB();

		if (this.useMemoryOnly || !db) {
			for (const seg of neededSegments) {
				const segmentKey = `${cacheKey}::${seg.fromTs}::${seg.toTs}`;
				const data = memoryDB.segments.get(segmentKey);
				if (data) {
					for (const bar of data.bars) {
						barsMap.set(bar.date.getTime(), bar);
					}
				}
			}
		} else {
			await new Promise<void>((resolveRead) => {
				try {
					const tx = db.transaction(["segments"], "readonly");
					const store = tx.objectStore("segments");
					let pending = neededSegments.length;
					if (pending === 0) {
						resolveRead();
						return;
					}

					for (const seg of neededSegments) {
						const segmentKey = `${cacheKey}::${seg.fromTs}::${seg.toTs}`;
						const req = store.get(segmentKey);
						req.onsuccess = () => {
							const result = req.result;
							if (result && Array.isArray(result.bars)) {
								for (const b of result.bars) {
									// Rehydrate Date object from JSON timestamp
									const date = new Date(b.t);
									barsMap.set(b.t, {
										date,
										open: b.o,
										high: b.h,
										low: b.l,
										close: b.c,
										volume: b.v,
										index: b.index,
										dataIndex: b.dataIndex,
									});
								}
							}
							pending -= 1;
							if (pending === 0) resolveRead();
						};
						req.onerror = () => {
							pending -= 1;
							if (pending === 0) resolveRead();
						};
					}
				} catch {
					resolveRead();
				}
			});
		}

		const sortedBars = Array.from(barsMap.values()).sort((a, b) => a.date.getTime() - b.date.getTime());
		return {
			bars: sortedBars,
			missingRanges: normalizeRanges(allMissingRanges),
		};
	}

	private async withLock(key: CacheKey, fn: () => void | Promise<void>): Promise<void> {
		const prev = this.writeLocks.get(key) ?? Promise.resolve();
		const next = prev.then(fn, fn);
		this.writeLocks.set(key, next);
		try {
			await next;
		} finally {
			if (this.writeLocks.get(key) === next) {
				this.writeLocks.delete(key);
			}
		}
	}

	public async writePatch(
		cacheKey: CacheKey,
		bars: readonly OHLCVBar[],
		meta: CacheWriteMeta
	): Promise<CacheWriteResult> {
		if (bars.length === 0) {
			const index = await this.getCoverage(cacheKey, meta.semanticScope);
			return {
				cacheKey,
				revision: index?.revision ?? 0,
				writtenBarCount: 0,
				affectedRanges: [],
			};
		}

		// 1. Validate, sort and deduplicate bars (Contract Rule: last wins)
		const validated = bars.filter((b) => {
			const t = b.date.getTime();
			return Number.isFinite(t) &&
				Number.isFinite(b.open) &&
				Number.isFinite(b.high) &&
				Number.isFinite(b.low) &&
				Number.isFinite(b.close) &&
				Number.isFinite(b.volume);
		});

		if (validated.length === 0) {
			const index = await this.getCoverage(cacheKey, meta.semanticScope);
			return {
				cacheKey,
				revision: index?.revision ?? 0,
				writtenBarCount: 0,
				affectedRanges: [],
			};
		}

		const sorted = [...validated].sort((a, b) => a.date.getTime() - b.date.getTime());
		const deduplicated: OHLCVBar[] = [];
		for (const bar of sorted) {
			if (deduplicated.length > 0 && deduplicated[deduplicated.length - 1].date.getTime() === bar.date.getTime()) {
				deduplicated[deduplicated.length - 1] = bar;
			} else {
				deduplicated.push(bar);
			}
		}

		const fromTs = deduplicated[0].date.getTime();
		const toTs = deduplicated[deduplicated.length - 1].date.getTime();
		const revision = meta.sessionRevision;

		// 2. Format segment data matching CACHE_FILE_CONTRACT
		const segmentKey = `${cacheKey}::${fromTs}::${toTs}`;
		const segmentData = {
			segmentKey,
			cacheKey,
			revision,
			fromTs,
			toTs,
			bars: deduplicated.map((b) => ({
				t: b.date.getTime(),
				o: b.open,
				h: b.high,
				l: b.low,
				c: b.close,
				v: b.volume,
				index: b.index,
				dataIndex: b.dataIndex,
			})),
		};

		const segmentMeta: CacheSegmentMeta = {
			file: `segments/seg_${fromTs}_${toTs}_${revision}.json`,
			fromTs,
			toTs,
			barCount: deduplicated.length,
			checksum: createSegmentChecksum(deduplicated),
			lastAccessedAt: new Date().toISOString(),
		};

		const db = await this.getDB();

		// 3. Update Manifest and Coverage Index (Atomic Read-Modify-Write)
		// FIX (Phase 1): the read of current coverage/manifest and the write of the
		// next revision MUST happen inside the SAME IndexedDB transaction so that
		// concurrent writePatch calls from different chart instances (sharing the
		// same default DB) serialize and never lose an update. Previously the read
		// (getCoverage/getManifest) ran in a separate transaction, allowing two
		// writers to both observe revision N and clobber each other.
		const buildNext = (
			currentCoverage: CacheCoverageIndex | null,
			existingManifest: CacheManifest | null,
		) => {
			const currentRevision = currentCoverage?.revision ?? 0;
			const nextRevision = currentRevision + 1;

			const currentSegments = currentCoverage?.segments ?? [];
			const updatedSegments = [...currentSegments.filter((s) => s.fromTs !== fromTs || s.toTs !== toTs), segmentMeta];
			const updatedRanges = updatedSegments.map((s) => ({ fromTs: s.fromTs, toTs: s.toTs }));
			const normalized = normalizeRanges(updatedRanges);
			const semanticScope = meta.semanticScope ?? currentCoverage?.semanticScope ?? manifestToSemanticScope(existingManifest) ?? undefined;

			const nextCoverage: CacheCoverageIndex = {
				schemaVersion: "v2",
				cacheKey,
				revision: nextRevision,
				semanticScope,
				ranges: normalized,
				segments: updatedSegments,
			};

			const keyParts = cacheKey.split(":");

			const manifestWithoutChecksum: Omit<CacheManifest, "checksum"> = {
				schemaVersion: "v2",
				cacheKey,
				source: keyParts[0] || "unknown",
				sourceContractVersion: semanticScope?.sourceContractVersion ?? existingManifest?.sourceContractVersion ?? "unknown",
				symbol: keyParts[1] || "unknown",
				timeframe: keyParts[2] || "unknown",
				adjustmentPolicy: keyParts[3] || "unknown",
				instrumentClass: semanticScope?.instrumentClass ?? existingManifest?.instrumentClass ?? "custom",
				sessionModel: semanticScope?.sessionModel ?? existingManifest?.sessionModel ?? "continuous",
				sessionCalendarId: semanticScope?.sessionCalendarId ?? existingManifest?.sessionCalendarId,
				timezone: semanticScope?.timezone ?? existingManifest?.timezone ?? "UTC",
				finalityMode: semanticScope?.finalityMode ?? existingManifest?.finalityMode ?? "immutable",
				correctionLookbackMs: semanticScope?.correctionLookbackMs ?? existingManifest?.correctionLookbackMs,
				createdAt: existingManifest?.createdAt ?? new Date().toISOString(),
				lastUpdatedAt: new Date().toISOString(),
				revision: nextRevision,
				segmentCount: updatedSegments.length,
				totalBars: updatedSegments.reduce((sum, s) => sum + s.barCount, 0),
				quota: {
					symbolSoftCapMb: 250,
					globalQuotaMb: 1536,
				},
			};

			writtenQuota = manifestWithoutChecksum.quota;

			const nextManifest: CacheManifest = {
				...manifestWithoutChecksum,
				checksum: {
					algorithm: "sha256",
					manifestHash: createManifestChecksum(manifestWithoutChecksum),
				},
			};

			return { nextCoverage, nextManifest, revision: nextRevision };
		};

		let writtenRevision = 0;
		let writtenQuota: CacheEvictPolicy = { globalQuotaMb: 1536, symbolSoftCapMb: 250 };

		if (this.useMemoryOnly || !db) {
			// Memory fallback: serialize per-cacheKey (memoryDB is a shared module singleton).
			await this.withLock(cacheKey, () => {
				const { nextCoverage, nextManifest, revision } = buildNext(
					memoryDB.coverageIndexes.get(cacheKey) ?? null,
					memoryDB.manifests.get(cacheKey) ?? null,
				);
				writtenRevision = revision;
				memoryDB.segments.set(segmentKey, { bars: deduplicated, revision });
				memoryDB.coverageIndexes.set(cacheKey, nextCoverage);
				memoryDB.manifests.set(cacheKey, nextManifest);
			});
		} else {
			// IndexedDB path: read coverage + manifest INSIDE the write transaction.
			await new Promise<void>((resolveWrite, rejectWrite) => {
				try {
					const tx = db.transaction(["manifests", "coverage_indexes", "segments"], "readwrite");

					tx.oncomplete = () => resolveWrite();
					tx.onerror = () => rejectWrite(new Error("IndexedDB transaction aborted"));
					tx.onabort = () => rejectWrite(new Error("IndexedDB transaction aborted manually"));

					const manifestStore = tx.objectStore("manifests");
					const coverageStore = tx.objectStore("coverage_indexes");
					const segmentStore = tx.objectStore("segments");

					const covReq = coverageStore.get(cacheKey);
					covReq.onsuccess = () => {
						const currentCoverage = (covReq.result as CacheCoverageIndex | undefined) ?? null;
						const manReq = manifestStore.get(cacheKey);
						manReq.onsuccess = () => {
							const existingManifest = (manReq.result as CacheManifest | undefined) ?? null;
							const { nextCoverage, nextManifest, revision } = buildNext(currentCoverage, existingManifest);
							writtenRevision = revision;
							manifestStore.put(nextManifest);
							coverageStore.put(nextCoverage);
							segmentStore.put(segmentData);
						};
						manReq.onerror = () => rejectWrite(new Error("IndexedDB manifest read failed"));
					};
					covReq.onerror = () => rejectWrite(new Error("IndexedDB coverage read failed"));
				} catch (err) {
					rejectWrite(err);
				}
			});
		}

		// Quota-pressure trigger (F-07): enforce caps after every successful write (no-op when under quota).
		await this.evict(writtenQuota);

		return {
			cacheKey,
			revision: writtenRevision,
			writtenBarCount: deduplicated.length,
			affectedRanges: [{ fromTs, toTs }],
		};
	}

	public async invalidate(cacheKey: CacheKey, reason: CacheInvalidateReason): Promise<void> {
		const db = await this.getDB();
		if (this.useMemoryOnly || !db) {
			memoryDB.manifests.delete(cacheKey);
			memoryDB.coverageIndexes.delete(cacheKey);
			for (const key of memoryDB.segments.keys()) {
				if (key.startsWith(cacheKey)) {
					memoryDB.segments.delete(key);
				}
			}
			return;
		}

		await new Promise<void>((resolveInvalidate) => {
			try {
				const tx = db.transaction(["manifests", "coverage_indexes", "segments"], "readwrite");
				tx.oncomplete = () => resolveInvalidate();
				tx.onerror = () => resolveInvalidate();

				const manifestStore = tx.objectStore("manifests");
				const coverageStore = tx.objectStore("coverage_indexes");
				const segmentStore = tx.objectStore("segments");

				manifestStore.delete(cacheKey);
				coverageStore.delete(cacheKey);

				// Perform a scan deletion in IndexedDB segments
				const req = segmentStore.openCursor();
				req.onsuccess = (event: any) => {
					const cursor = event.target.result;
					if (cursor) {
						const value = cursor.value;
						if (value && value.cacheKey === cacheKey) {
							cursor.delete();
						}
						cursor.continue();
					}
				};
			} catch {
				resolveInvalidate();
			}
		});
	}

	public async evict(policy: CacheEvictPolicy): Promise<CacheEvictResult> {
		const db = await this.getDB();
		if (this.useMemoryOnly || !db) {
			const segmentBytes = new Map<string, number>();
			for (const [segmentKey, data] of memoryDB.segments) {
				segmentBytes.set(segmentKey, measureBarsBytes(data.bars));
			}
			const plan = planEviction({ coverages: [...memoryDB.coverageIndexes.values()], segmentBytes }, policy, normalizeRanges);
			if (plan.victims.length === 0) {
				return { reclaimedBytes: 0, deletedSegmentCount: 0 };
			}
			let deletedSegmentCount = 0;
			for (const victim of plan.victims) {
				if (memoryDB.segments.delete(victim)) deletedSegmentCount += 1;
			}
			for (const [cacheKey, next] of plan.nextCoverages) {
				if (next === null) {
					memoryDB.coverageIndexes.delete(cacheKey);
					memoryDB.manifests.delete(cacheKey);
					continue;
				}
				memoryDB.coverageIndexes.set(cacheKey, next);
				const manifest = memoryDB.manifests.get(cacheKey);
				if (manifest) {
					memoryDB.manifests.set(cacheKey, {
						...manifest,
						segmentCount: next.segments.length,
						totalBars: next.segments.reduce((n, s) => n + s.barCount, 0),
						lastUpdatedAt: new Date().toISOString(),
					});
				}
			}
			return { reclaimedBytes: plan.reclaimedBytes, deletedSegmentCount };
		}

		const readStore = (store: string) => new Promise<any[]>((resolveStore) => {
			try {
				const req = db.transaction(store, "readonly").objectStore(store).getAll();
				req.onsuccess = () => resolveStore(req.result ?? []);
				req.onerror = () => resolveStore([]);
			} catch {
				resolveStore([]);
			}
		});
		const [manifestRows, coverageRows, segmentRows] = await Promise.all([
			readStore("manifests"), readStore("coverage_indexes"), readStore("segments"),
		]);
		const coverages: CacheCoverageIndex[] = coverageRows;
		const segmentBytes = new Map<string, number>();
		for (const s of segmentRows) segmentBytes.set(s.segmentKey, measureBarsBytes(s.bars ?? []));
		const manifests = new Map<CacheKey, any>();
		for (const m of manifestRows) manifests.set(m.cacheKey, m);
		const snapshot = { coverages, segmentBytes, manifests };
		const plan = planEviction(snapshot, policy, normalizeRanges);
		if (plan.victims.length === 0) {
			return { reclaimedBytes: 0, deletedSegmentCount: 0 };
		}
		await new Promise<void>((resolveApply, rejectApply) => {
			try {
				const tx = db.transaction(["manifests", "coverage_indexes", "segments"], "readwrite");
				tx.oncomplete = () => resolveApply();
				tx.onerror = () => rejectApply(new Error("IndexedDB evict transaction aborted"));
				const manifestStore = tx.objectStore("manifests");
				const coverageStore = tx.objectStore("coverage_indexes");
				const segmentStore = tx.objectStore("segments");
				for (const victim of plan.victims) segmentStore.delete(victim);
				for (const [cacheKey, next] of plan.nextCoverages) {
					if (next === null) {
						coverageStore.delete(cacheKey);
						manifestStore.delete(cacheKey);
						continue;
					}
					coverageStore.put(next);
					const manifest = snapshot.manifests.get(cacheKey);
					if (manifest) {
						manifestStore.put({
							...manifest,
							segmentCount: next.segments.length,
							totalBars: next.segments.reduce((n: number, s: { barCount: number }) => n + s.barCount, 0),
							lastUpdatedAt: new Date().toISOString(),
						});
					}
				}
			} catch (err) {
				rejectApply(err);
			}
		});
		return { reclaimedBytes: plan.reclaimedBytes, deletedSegmentCount: plan.victims.length };
	}
}

/**
 * Native factory class matching barrel exports
 */
export class LocalCacheMatrixFactoryImpl implements LocalCacheMatrixFactory {
	public create(cacheRoot: string): LocalCacheMatrix {
		return new IndexedDBCacheMatrix(cacheRoot);
	}
}
