import React, { createContext, useContext, useMemo, useRef, useEffect, useState } from "react";
import type { StockDataAdapter } from "../../lib/types/adapter";
import { createHistoryChunkStore, type HistoryChunkStore, type HistoryPatch, type ResidentWindow } from "./chunkStore";
import { createSingleWriterLane, type SingleWriterLane } from "./singleWriterLane";

/**
 * Cross-chart backfill deduplication (Layer B).
 *
 * Backfill (reconcileVisibleHistoryWindow) calls `adapter.fetchBarsBefore` /
 * `fetchBarsInRange` directly and does NOT go through `RequestCoordinator`
 * (Layer A). When several charts in a MultiChart view the same symbol@tf and
 * pan simultaneously, each fires its own identical request → N× API calls.
 *
 * This context holds an in-flight map keyed by request signature so that
 * concurrent identical backfill requests from different charts share a single
 * network call. It is intentionally SEPARATE from `RequestCoordinator` (which
 * only coordinates initial load / MTF / compare).
 *
 * The dedup key excludes `chartId`: if the underlying adapter returns different
 * data for the same range depending on chartId, dedup must NOT be applied (see
 * test "dedup respects chartId independence").
 */

export type BackfillDedupValue = {
	register(key: string, p: Promise<readonly any[]>): void;
	get(key: string): Promise<readonly any[]> | undefined;
};

const BackfillDedupContext = createContext<BackfillDedupValue | null>(null);

const MAX_DEDUP_ENTRIES = 200;

export function BackfillDedupProvider({ children }: { children: React.ReactNode }) {
	const mapRef = useRef(new Map<string, Promise<readonly any[]>>());
	const value = useMemo<BackfillDedupValue>(() => {
		const evictIfNeeded = () => {
			if (mapRef.current.size > MAX_DEDUP_ENTRIES) {
				const firstKey = mapRef.current.keys().next().value;
				if (firstKey !== undefined) mapRef.current.delete(firstKey as string);
			}
		};
		return {
			register: (k, p) => {
				evictIfNeeded();
				mapRef.current.set(k, p);
				p.finally(() => {
					if (mapRef.current.get(k) === p) {
						mapRef.current.delete(k);
					}
				});
			},
			get: (k) => mapRef.current.get(k),
		};
	}, []);

	return (
		<BackfillDedupContext.Provider value={value}>
			{children}
		</BackfillDedupContext.Provider>
	);
}

export function useBackfillDedup(): BackfillDedupValue | null {
	return useContext(BackfillDedupContext);
}

/**
 * Run `fn` once per `key`. Concurrent callers with the same key share the same
 * promise. When no dedup context is present (SingleChart standalone), `fn`
 * runs normally.
 */
export function withBackfillDedup(
	ctx: BackfillDedupValue | null,
	key: string,
	fn: () => Promise<readonly any[] | null>,
): Promise<readonly any[] | null> {
	if (!ctx) {
		return fn();
	}
	const existing = ctx.get(key);
	if (existing) {
		return existing as Promise<readonly any[] | null>;
	}
	const p = fn();
	ctx.register(key, p as Promise<readonly any[]>);
	return p;
}

function keyForBefore(symbol: string, tf: string, beforeMs: number, n: number): string {
	return `${symbol}|${tf}|before|${beforeMs}|${n}`;
}

function keyForRange(symbol: string, tf: string, fromMs: number, toMs: number): string {
	return `${symbol}|${tf}|range|${fromMs}|${toMs}`;
}

/**
 * Wrap an adapter so that `fetchBarsBefore` / `fetchBarsInRange` participate in
 * cross-chart backfill dedup. The dedup key is derived purely from the request
 * arguments (symbol, tf, range) and deliberately EXCLUDES chartId.
 */
export function dedupWrapAdapter(
	adapter: StockDataAdapter,
	ctx: BackfillDedupValue,
): StockDataAdapter {
	return {
		...adapter,
		fetchBarsBefore: (symbol, tf, before, n?, chartId?) =>
			withBackfillDedup(
				ctx,
				keyForBefore(symbol, tf, before.getTime(), n ?? 0),
				() => adapter.fetchBarsBefore(symbol, tf, before, n, chartId),
			) as Promise<readonly any[]>,
		fetchBarsInRange: (symbol, tf, from, to, chartId?) =>
			withBackfillDedup(
				ctx,
				keyForRange(symbol, tf, from.getTime(), to.getTime()),
				() => adapter.fetchBarsInRange(symbol, tf, from, to, chartId),
			) as Promise<readonly any[]>,
	};
}

/* ===================== SHARED BAR STORE (Phase 3) ===================== */

interface SharedStoreEntry {
	store: ReturnType<typeof createHistoryChunkStore>;
	lane: ReturnType<typeof createSingleWriterLane>;
	refCount: number;
	residents: Map<string, ResidentWindow>;
}

type SharedBarStoreValue = {
	getOrCreate(key: string): SharedStoreEntry;
	release(key: string, subscriberId: string): void;
	registerResident(key: string, subscriberId: string, resident: ResidentWindow): void;
	getUnionResident(key: string): ResidentWindow | null;
	updateResident(key: string, subscriberId: string, resident: ResidentWindow): void;
};

const SharedBarStoreContext = createContext<SharedBarStoreValue | null>(null);

export function SharedBarStoreProvider({ children }: { children: React.ReactNode }) {
	const storesRef = useRef(new Map<string, SharedStoreEntry>());

	const value = useMemo<SharedBarStoreValue>(() => ({
		getOrCreate: (key: string) => {
			let entry = storesRef.current.get(key);
			if (!entry) {
				entry = {
					store: createHistoryChunkStore(),
					lane: createSingleWriterLane(),
					refCount: 0,
					residents: new Map(),
				};
				storesRef.current.set(key, entry);
			}
			entry.refCount++;
			return entry;
		},
		release: (key: string, subscriberId: string) => {
			const entry = storesRef.current.get(key);
			if (!entry) return;
			entry.refCount--;
			entry.residents.delete(subscriberId);
			if (entry.refCount <= 0) {
				storesRef.current.delete(key);
			}
		},
		registerResident: (key: string, subscriberId: string, resident: ResidentWindow) => {
			const entry = storesRef.current.get(key);
			if (entry) {
				entry.residents.set(subscriberId, resident);
			}
		},
		getUnionResident: (key: string) => {
			const entry = storesRef.current.get(key);
			if (!entry || entry.residents.size === 0) return null;
			let minStart = Infinity;
			let maxEnd = -Infinity;
			for (const r of entry.residents.values()) {
				if (!Number.isFinite(r.startMs) || !Number.isFinite(r.endMs)) continue;
				if (r.startMs < minStart) minStart = r.startMs;
				if (r.endMs > maxEnd) maxEnd = r.endMs;
			}
			if (!Number.isFinite(minStart) || !Number.isFinite(maxEnd)) return null;
			return { startMs: minStart, endMs: maxEnd };
		},
		updateResident: (key: string, subscriberId: string, resident: ResidentWindow) => {
			const entry = storesRef.current.get(key);
			if (entry) {
				entry.residents.set(subscriberId, resident);
			}
		},
	}), []);

	return (
		<SharedBarStoreContext.Provider value={value}>
			{children}
		</SharedBarStoreContext.Provider>
	);
}

export function useSharedBarStore(): SharedBarStoreValue | null {
	return useContext(SharedBarStoreContext);
}

// Helper hook for charts to automatically manage shared store lifecycle
export function useSharedBarStoreSubscription(
	key: string,
	subscriberId: string,
	_initialResident?: ResidentWindow,
): { store: ReturnType<typeof createHistoryChunkStore>; lane: ReturnType<typeof createSingleWriterLane> } | null {
	const ctx = useContext(SharedBarStoreContext);
	const [entry, setEntry] = useState<{ store: ReturnType<typeof createHistoryChunkStore>; lane: ReturnType<typeof createSingleWriterLane> } | null>(null);

	useEffect(() => {
		if (!ctx) return;
		const e = ctx.getOrCreate(key);
		// Note: resident is NOT registered here — it is set dynamically
		// by Phase 6 (updateResident in useWidgetData) when the actual visible
		// domain is available, preventing a stale zero-width resident from
		// polluting the union computation.
		setEntry({ store: e.store, lane: e.lane });
		return () => {
			ctx.release(key, subscriberId);
			setEntry(null);
		};
	}, [ctx, key, subscriberId]);

	if (!entry) return null;
	return { store: entry.store, lane: entry.lane };
}