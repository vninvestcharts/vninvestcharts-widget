import React, {
	createContext,
	useContext,
	useMemo,
	useRef,
	useCallback,
	useEffect,
} from "react";
import type { ResidentWindow } from "./chunkStore";
import { createHistoryChunkStore } from "./chunkStore";
import { createSingleWriterLane } from "./singleWriterLane";

interface SharedStoreEntry {
	store: ReturnType<typeof createHistoryChunkStore>;
	lane: ReturnType<typeof createSingleWriterLane>;
	refCount: number;
	/** Per-chart resident windows for union trim */
	residents: Map<string, ResidentWindow>;
}

interface SharedBarStoreContextValue {
	/**
	 * Get or create a shared store for the given cache key.
	 * Returns the shared store and a release function to call on unmount or key change.
	 */
	getOrCreate: (
		cacheKey: string,
		chartId: string,
		initialResident: ResidentWindow,
	) => {
		store: ReturnType<typeof createHistoryChunkStore>;
		lane: ReturnType<typeof createSingleWriterLane>;
		release: () => void;
		updateResident: (resident: ResidentWindow) => void;
		trimToSharedWindow: (
			resident: ResidentWindow,
			maxBars?: number,
			trimLeft?: boolean,
			trimRight?: boolean,
		) => void;
	};
}

const SharedBarStoreContext = createContext<SharedBarStoreContextValue | null>(null);

export function useSharedBarStore(): SharedBarStoreContextValue | null {
	return useContext(SharedBarStoreContext);
}

/**
 * Union of all registered resident windows for a given cache key.
 */
function computeUnion(residents: Map<string, ResidentWindow>): ResidentWindow | null {
	let minStart = Infinity;
	let maxEnd = -Infinity;
	let hasAny = false;
	for (const r of residents.values()) {
		hasAny = true;
		if (r.startMs < minStart) minStart = r.startMs;
		if (r.endMs > maxEnd) maxEnd = r.endMs;
	}
	return hasAny ? { startMs: minStart, endMs: maxEnd } : null;
}

export function SharedBarStoreProvider({ children }: { children: React.ReactNode }) {
	const registryRef = useRef(new Map<string, {
		store: ReturnType<typeof createHistoryChunkStore>;
		lane: ReturnType<typeof createSingleWriterLane>;
		refCount: number;
		residents: Map<string, ResidentWindow>;
	}>());

	const getOrCreate = useCallback((
		cacheKey: string,
		chartId: string,
		initialResident: ResidentWindow,
	) => {
		let entry = registryRef.current.get(cacheKey);
		if (!entry) {
			entry = {
				store: createHistoryChunkStore(),
				lane: createSingleWriterLane(),
				refCount: 0,
				residents: new Map(),
			};
			registryRef.current.set(cacheKey, entry);
		}
		entry.refCount += 1;
		entry.residents.set(chartId, { ...initialResident });

		let released = false;

		const release = () => {
			if (released) return;
			released = true;
			const e = registryRef.current.get(cacheKey);
			if (!e) return;
			e.refCount -= 1;
			e.residents.delete(chartId);
			if (e.refCount === 0) {
				registryRef.current.delete(cacheKey);
			}
		};

		const updateResident = (resident: ResidentWindow) => {
			const e = registryRef.current.get(cacheKey);
			if (e) {
				e.residents.set(chartId, { ...resident });
			}
		};

		const trimToSharedWindow = (
			resident: ResidentWindow,
			maxBars?: number,
			trimLeft = true,
			trimRight = true,
		) => {
			const e = registryRef.current.get(cacheKey);
			if (!e) return;
			// Update this chart's resident before computing union
			e.residents.set(chartId, { ...resident });
			const union = computeUnion(e.residents);
			if (union) {
				// Union trim: trim to the union of all charts' resident windows
				e.store.trimToWindow(union, 120000, true, true);
			}
		};

		return {
			store: entry.store,
			lane: entry.lane,
			release,
			updateResident,
			trimToSharedWindow,
		};
	}, []);

	const value = useMemo(() => ({ getOrCreate }), []);

	return (
		<SharedBarStoreContext.Provider value={value}>
			{children}
		</SharedBarStoreContext.Provider>
	);
}