import { useState, useCallback, useEffect, useRef } from "react";
import { COMPARISON_COLORS } from "../constants/comparison";
import { overrideSeriesStyle, clearSeriesStyleOverride } from "../../lib/core";

const STORAGE_KEY = "vninvestcharts-widget-comparison-overlays";
const MAX_OVERLAYS = 8;

export interface ComparisonOverlayEntry {
	symbolId: string;
	normalizeToBaseline: boolean;
	visible: boolean;
	color: string;
	yAxis: "left" | "right";
	lineWidth: number;
	lineStyle: "solid" | "dashed" | "dotted";
	fillArea: boolean;
}

export interface UseComparisonStateResult {
	/** Stable per-mount identity. Feed to comparisonSeriesId to build this chart's series ids. */
	scope: string;
	overlays: ComparisonOverlayEntry[];
	addSymbol: (symbolId: string, options?: {
		normalizeToBaseline?: boolean;
		color?: string;
		yAxis?: "left" | "right";
		lineWidth?: number;
		lineStyle?: "solid" | "dashed" | "dotted";
		fillArea?: boolean;
	}) => void;
	removeSymbol: (symbolId: string) => void;
	toggleVisibility: (symbolId: string) => void;
	updateOverlay: (symbolId: string, partial: Partial<ComparisonOverlayEntry>) => void;
}

function storageKeyFor(storageId?: string | null): string {
	return storageId ? `${STORAGE_KEY}:${storageId}` : STORAGE_KEY;
}

function loadOverlays(key: string): ComparisonOverlayEntry[] {
	try {
		const raw = localStorage.getItem(key);
		if (!raw) return [];
		return JSON.parse(raw) as ComparisonOverlayEntry[];
	} catch {
		return [];
	}
}

function saveOverlays(key: string, overlays: ComparisonOverlayEntry[]) {
	try {
		localStorage.setItem(key, JSON.stringify(overlays));
	} catch {
	}
}

/**
 * Registry key for a comparison overlay's series.
 *
 * This key is read back by `paneScaleSlotDomains.ts` via
 * `getSeriesStyleOverride(series.id)`, so the string built here and the series `id`
 * built in `VNInvestCharts` must be identical. They used to be written out twice, one
 * at each site, and nothing tied them together - which is how they drifted before.
 * Export one function and call it from both.
 *
 * Not scoped by `storageId`, and that is the point.
 *
 * `storageId` is a user-supplied prop: optional, undocumented as unique, and `""` is
 * falsy while a real id is not. Keying a per-chart identity off it produced two charts
 * colliding on one slot - both when they shared an id and when they shared none - and
 * the collision was invisible because nothing failed.
 *
 * The registry this used to feed is a *global* store, and per-chart state in a global
 * store is what the whole chain of audit findings kept coming back to. So the identity
 * now comes from the mount itself, which cannot collide, and the key stays stable for
 * the life of the hook so the engine keeps seeing one series across re-renders.
 */
let comparisonInstanceSeq = 0;

export function createComparisonScope(): string {
	comparisonInstanceSeq += 1;
	return `m${comparisonInstanceSeq}`;
}

export function comparisonSeriesId(scope: string, symbolId: string): string {
	return `compare-${scope}-${symbolId}`;
}

function pickColor(existingColors: string[]): string {
	for (const c of COMPARISON_COLORS) {
		if (!existingColors.includes(c)) return c;
	}
	return COMPARISON_COLORS[existingColors.length % COMPARISON_COLORS.length];
}

export function useComparisonState(storageId?: string | null): UseComparisonStateResult {
	const key = storageKeyFor(storageId);
	const [overlays, setOverlays] = useState<ComparisonOverlayEntry[]>(() => loadOverlays(key));

	// One identity per mount, used to build the series ids. Not derived from storageId,
	// which is user-supplied and therefore not a reliable identity - two charts can pass
	// the same one, or none at all.
	//
	// useState rather than a ref: the lazy initializer runs exactly once and never
	// re-runs, which is what a ref hand-roll would have to reimplement - and a ref here
	// would widen the type to `string | null` and leak that into every consumer.
	const [scope] = useState(createComparisonScope);

	// storageId identifies the chart. If it changes on a mounted hook, the in-memory
	// overlays belong to the previous chart and must be replaced by the new one's, or
	// the first saveOverlays below writes chart A's symbols into chart B's slot.
	// useState's initializer only runs once, so the swap has to be explicit.
	const prevStorageId = useRef(storageId);
	useEffect(() => {
		if (prevStorageId.current === storageId) return;
		prevStorageId.current = storageId;
		setOverlays(loadOverlays(key));
	}, [storageId, key]);

	useEffect(() => {
		saveOverlays(key, overlays);
	}, [key, overlays]);

	// There is deliberately no effect writing comparison overlays into the global
	// series-style registry.
	//
	// That registry is process-wide, and comparison overlays are per-chart. Writing them
	// there is what produced a five-round chain of audit findings: shared key (F1), shared
	// value, and finally `paneScaleSlotDomains.ts:38`, the one production reader of these
	// overrides, consulting it for Y-axis inclusion - so a sibling chart toggling its
	// overlay off removed this chart's overlay from this chart's axis while this chart
	// still drew it. Measured: domain [49,51] to undefined.
	//
	// Nothing is lost by not writing. Rendering never read the registry - it reads the
	// series config, which VNInvestCharts.tsx:405,408 already populates with color and
	// visible from this state - and these overlays are persisted per chart by
	// saveOverlays above, so the demo's global style snapshot was storing them twice.

	const addSymbol = useCallback((symbolId: string, options?: {
		normalizeToBaseline?: boolean;
		color?: string;
		yAxis?: "left" | "right";
		lineWidth?: number;
		lineStyle?: "solid" | "dashed" | "dotted";
		fillArea?: boolean;
	}) => {
		setOverlays((prev) => {
			if (prev.some((o) => o.symbolId === symbolId)) return prev;
			if (prev.length >= MAX_OVERLAYS) return prev;
			const existingColors = prev.map((o) => o.color);
			const color = options?.color ?? pickColor(existingColors);
			return [
				...prev,
				{
					symbolId,
					normalizeToBaseline: options?.normalizeToBaseline ?? false,
					visible: true,
					color,
					yAxis: options?.yAxis ?? "left",
					lineWidth: options?.lineWidth ?? 2,
					lineStyle: options?.lineStyle ?? "solid",
					fillArea: options?.fillArea ?? false,
				},
			];
		});
	}, []);

	const removeSymbol = useCallback((symbolId: string) => {
		setOverlays((prev) => {
			const next = prev.filter((o) => o.symbolId !== symbolId);
			if (next.length === prev.length) return prev;
			// Deliberately does NOT touch the registry.
			//
			// An earlier version called clearSeriesStyleOverride here, which strips the
			// style of every chart sharing the key - the reachable form of the bug, since
			// it needs only one click rather than an unmount. Routing it through the
			// holder count instead double-decrements: the state change below already
			// re-runs the effect, whose cleanup releases the removed key exactly once.
			//
			// So the registry follows the effect, and only the effect.
			return next;
		});
		// storageId is in the key now, so it belongs in the deps: this callback decides
		// nothing about the key any more, but keeping the dep documents that the id is
		// what scopes it.
	}, [storageId]);

	const toggleVisibility = useCallback((symbolId: string) => {
		setOverlays((prev) => {
			const next = prev.map((o) =>
				o.symbolId === symbolId ? { ...o, visible: !o.visible } : o
			);
			return next;
		});
	}, []);

	const updateOverlay = useCallback((symbolId: string, partial: Partial<ComparisonOverlayEntry>) => {
		setOverlays((prev) => {
			const next = prev.map((o) =>
				o.symbolId === symbolId ? { ...o, ...partial } : o
			);
			return next;
		});
	}, []);

	return { overlays, scope, addSymbol, removeSymbol, toggleVisibility, updateOverlay };
}
