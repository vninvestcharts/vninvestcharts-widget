import { useCallback, useEffect, useMemo, useState } from "react";
import type React from "react";
import type { PriceScaleMode } from "@vninvestcharts/engine-core";
import { findAxisSlotAt, isLogScaleAvailable } from "../utils/axisHit";
import type { PriceScaleMenuState } from "../components/canvas/PriceScaleMenu";
import { shouldAcceptSettingsEvent } from "../components/settings/storageKeys";
import type { WidgetPaneRuntimeSnapshot } from "../utils/widgetHelpers";
import type { EnrichedDatum } from "../../lib/core/calculators/types";

/** Minimal engine surface P2b needs (structural — no EngineInstance import). */
export interface ScaleOverlayEngine {
	zoomToRange(range: { from: number; to: number }): void;
	setPriceScaleMode(mode: PriceScaleMode, scaleSlotId?: string): void;
	/** A3: invert the price axis for one scale slot (default "price-right"). */
	setPriceScaleInverted?(inverted: boolean, scaleSlotId?: string): void;
	/** W0 Task 0.3: move the price axis gutter (default "price-right" slot). */
	setPriceAxisPosition?(side: "left" | "right", scaleSlotId?: string): void;
	resetYAxisZoom(scaleSlotId?: string): void;
	hitTestDrawingPrimitive?(localX: number, localY: number): unknown;
}

export interface ScaleOverlaysOptions {
	enabled: boolean;
	snapshots: readonly WidgetPaneRuntimeSnapshot[];
	plotData: readonly EnrichedDatum[];
	/** Fork visible range ({from,to} indices) — drives the scrollbar window. */
	visibleRange: { from: number; to: number } | null;
	getEngine: () => ScaleOverlayEngine | null | undefined;
	/**
	 * Alt-shortcut latch (replay passthrough). When held, right-click always
	 * falls through — even on an axis (locked pointer contract).
	 */
	altPressedRef?: React.RefObject<boolean>;
	/** Own chart id for settings-sync filtering (absent = single-chart legacy). */
	chartId?: string | null;
}

const modeStorageKey = (paneId: string) => `vnsc_priceScaleMode:${paneId}`;
const invertedStorageKey = (paneId: string) => `vnsc_priceScaleInverted:${paneId}`;

function readStoredMode(paneId: string): PriceScaleMode | null {
	try {
		const raw = typeof localStorage !== "undefined" ? localStorage.getItem(modeStorageKey(paneId)) : null;
		return raw === "log" || raw === "percent" || raw === "linear" ? raw : null;
	} catch {
		return null;
	}
}

function readStoredInverted(paneId: string): boolean | null {
	try {
		const raw = typeof localStorage !== "undefined" ? localStorage.getItem(invertedStorageKey(paneId)) : null;
		if (raw === "true") return true;
		if (raw === "false") return false;
		return null;
	} catch {
		return null;
	}
}

/** Main price slot of a pane: prefers a "price" slot, else first right slot, else first. */
export function resolveMainPriceSlotId(snapshot: WidgetPaneRuntimeSnapshot): string | null {
	const states = snapshot.scaleSlotStates as Record<string, { side?: string } | undefined> | undefined;
	const bounds = snapshot.scaleSlotBounds as Record<string, unknown> | undefined;
	const ids = [...new Set([...Object.keys(states ?? {}), ...Object.keys(bounds ?? {})])];
	return ids.find((id) => id.toLowerCase().includes("price"))
		?? ids.find((id) => states?.[id]?.side === "right")
		?? ids[0]
		?? null;
}

export interface ScaleOverlays {
	priceMenu: PriceScaleMenuState | null;
	/** Right-click handler: opens the scale menu when on a Y axis, else false (caller falls through). */
	openMenuAt: (localX: number, localY: number, clientX: number, clientY: number, flip?: { right?: number; bottom?: number }) => boolean;
	/**
	 * Surface onContextMenu wrapper: routes axis right-clicks to the scale
	 * menu, everything else to the drawing canvas menu fallback.
	 */
	handleSurfaceContextMenu: (event: React.MouseEvent<HTMLDivElement>, fallback: (event: React.MouseEvent<HTMLDivElement>) => void) => void;
	closeMenu: () => void;
	applyMenuMode: (mode: PriceScaleMode) => void;
	resetMenuZoom: () => void;
	/** Footer mirror: main price-pane mode as linear (Auto UI) + applier. */
	mainSlotMode: PriceScaleMode;
	applyMainSlotMode: (mode: PriceScaleMode) => void;
	/** Scrollbar navigator props (null when disabled/empty). */
	scrollbar: {
		dataLength: number;
		from: number;
		to: number;
		onWindowChange: (from: number, to: number) => void;
	} | null;
}

export function useScaleOverlays(options: ScaleOverlaysOptions): ScaleOverlays {
	const { enabled, snapshots, plotData, visibleRange, getEngine, altPressedRef, chartId } = options;
	const [priceMenu, setPriceMenu] = useState<PriceScaleMenuState | null>(null);
	const [slotModes, setSlotModes] = useState<Record<string, PriceScaleMode>>({});

	// Re-apply persisted per-pane modes whenever snapshots (re)appear.
	// setPriceScaleMode is idempotent engine-side — no render loops.
	useEffect(() => {
		if (!enabled) return;
		const engine = getEngine();
		if (!engine) return;
		for (const snapshot of snapshots) {
			const stored = readStoredMode(snapshot.paneId);
			if (stored) {
				const slotId = resolveMainPriceSlotId(snapshot);
				if (slotId) {
					try {
						engine.setPriceScaleMode(stored, slotId);
					} catch {
						// Stale engine without P2a API — ignore.
					}
					setSlotModes((prev) => (prev[slotId] === stored ? prev : { ...prev, [slotId]: stored }));
				}
			}
			// A3: re-apply the persisted inversion on (re)mount, mirroring the
			// price-scale mode above. try/catch keeps a stale engine alive.
			const storedInverted = readStoredInverted(snapshot.paneId);
			if (storedInverted !== null) {
				const slotId = resolveMainPriceSlotId(snapshot);
				if (slotId) {
					try {
						engine.setPriceScaleInverted?.(storedInverted, slotId);
					} catch {
						// Stale engine without A3 API — ignore.
					}
				}
			}
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [enabled, snapshots]);

	const applyMode = useCallback((paneId: string, slotId: string, mode: PriceScaleMode) => {
		const engine = getEngine();
		try {
			engine?.setPriceScaleMode(mode, slotId);
		} catch {
			// Stale engine — persist only.
		}
		try {
			if (typeof localStorage !== "undefined") {
				localStorage.setItem(modeStorageKey(paneId), mode);
			}
		} catch {
			// Private mode — state only.
		}
		setSlotModes((prev) => (prev[slotId] === mode ? prev : { ...prev, [slotId]: mode }));
	}, [getEngine]);

	const mainSlot = useMemo(() => {
		const pricePane = snapshots.find((s) => s.paneId === "price") ?? snapshots[0];
		if (!pricePane) return null;
		const slotId = resolveMainPriceSlotId(pricePane);
		return slotId ? { paneId: pricePane.paneId, slotId } : null;
	}, [snapshots]);

	const mainSlotMode: PriceScaleMode = (mainSlot && slotModes[mainSlot.slotId]) ?? "linear";

	const applyMainSlotMode = useCallback((mode: PriceScaleMode) => {
		if (!mainSlot) return;
		applyMode(mainSlot.paneId, mainSlot.slotId, mode);
	}, [applyMode, mainSlot]);

	useEffect(() => {
		const handleSync = (e: Event) => {
			const custom = e as CustomEvent<any>;
			if (!shouldAcceptSettingsEvent(chartId ?? null, custom.detail?.chartId ?? null)) return;
			const state = custom.detail?.state ?? custom.detail;
			const mode = state?.scales?.priceScaleMode;
			if (mode && mainSlot) {
				const mapped: PriceScaleMode = mode === "logarithmic" ? "log" : mode === "percentage" ? "percent" : "linear";
				if (slotModes[mainSlot.slotId] !== mapped) {
					applyMainSlotMode(mapped);
				}
			}
			const inverted = state?.scales?.invertScale;
			if (typeof inverted === "boolean" && mainSlot) {
				try {
					getEngine()?.setPriceScaleInverted?.(inverted, mainSlot.slotId);
				} catch {
					// Stale engine — ignore.
				}
			}
			// W0 Task 0.3: priceAxisPosition reaches the engine like invertScale.
			const axisPosition = state?.scales?.priceAxisPosition;
			if ((axisPosition === "left" || axisPosition === "right") && mainSlot) {
				try {
					getEngine()?.setPriceAxisPosition?.(axisPosition, mainSlot.slotId);
				} catch {
					// Stale engine — ignore.
				}
			}
		};
		if (typeof window !== "undefined") {
			window.addEventListener("vnsc-settings-sync", handleSync);
			return () => window.removeEventListener("vnsc-settings-sync", handleSync);
		}
	}, [mainSlot, slotModes, applyMainSlotMode, chartId]);

	const openMenuAt = useCallback((localX: number, localY: number, clientX: number, clientY: number, flip?: { right?: number; bottom?: number }) => {
		if (!enabled) return false;
		const hit = findAxisSlotAt(snapshots, localX, localY);
		if (!hit) return false;
		const flipRight = typeof flip?.right === "number" && Number.isFinite(flip.right) ? flip.right : undefined;
		const flipBottom = typeof flip?.bottom === "number" && Number.isFinite(flip.bottom) ? flip.bottom : undefined;
		setPriceMenu({
			x: clientX,
			y: clientY,
			paneId: hit.paneId,
			scaleSlotId: hit.scaleSlotId,
			mode: slotModes[hit.scaleSlotId] ?? "linear",
			logAvailable: isLogScaleAvailable(hit.domain),
			// CHART_CLAMP: viewport-space box of the owning chart surface —
			// keeps the menu inside its own chart (multi-cell neighbors paint
			// above an overflowing panel and clip it).
			flipRight,
			flipBottom,
		});
		return true;
	}, [enabled, snapshots, slotModes]);

	const closeMenu = useCallback(() => setPriceMenu(null), []);

	const handleSurfaceContextMenu = useCallback((event: React.MouseEvent<HTMLDivElement>, fallback: (event: React.MouseEvent<HTMLDivElement>) => void) => {
		// Alt+right-click is the replay-shortcut passthrough (locked contract) —
		// never swallow it into the scale menu, even on an axis. Covers both the
		// native flag and the keydown-latch fallback (contextmenu may lose altKey).
		if (event.altKey || altPressedRef?.current === true) {
			fallback(event);
			return;
		}
		const rect = event.currentTarget.getBoundingClientRect();
		const localX = event.clientX - rect.left;
		const localY = event.clientY - rect.top;
		// Object precedence (mirrors openForkContextMenuAtPosition): a drawing
		// under the cursor owns the menu; the axis menu is region fallback.
		// Action-handle hits don't count (they fall to the canvas menu there too).
		try {
			const hit = getEngine()?.hitTestDrawingPrimitive?.(localX, localY) as
				| { drawingId?: unknown; key?: unknown; actionHandle?: unknown } | null | undefined;
			if (hit && !hit.actionHandle && (hit.drawingId ?? hit.key)) {
				fallback(event);
				return;
			}
		} catch {
			// Hit-test unavailable — continue to axis routing.
		}
		// P2: right-click on a Y axis opens the price-scale menu;
		// elsewhere falls through to the drawing canvas menu.
		// CHART_CLAMP: forward the surface box (viewport coords, same space as
		// clientX/Y) so the menu flips inside its own chart in multi-grid.
		let flip: { right?: number; bottom?: number } | undefined;
		try {
			const surface = event.currentTarget?.getBoundingClientRect?.() as
				| { right?: unknown; bottom?: unknown }
				| undefined;
			const right = typeof surface?.right === "number" ? surface.right : NaN;
			const bottom = typeof surface?.bottom === "number" ? surface.bottom : NaN;
			if (Number.isFinite(right) || Number.isFinite(bottom)) {
				flip = {
					right: Number.isFinite(right) ? (right as number) : undefined,
					bottom: Number.isFinite(bottom) ? (bottom as number) : undefined,
				};
			}
		} catch {
			flip = undefined;
		}
		if (openMenuAt(localX, localY, event.clientX, event.clientY, flip)) {
			event.preventDefault();
			return;
		}
		fallback(event);
	}, [openMenuAt, getEngine, altPressedRef]);

	const applyMenuMode = useCallback((mode: PriceScaleMode) => {
		setPriceMenu((menu) => {
			if (menu) applyMode(menu.paneId, menu.scaleSlotId, mode);
			return menu;
		});
	}, [applyMode]);

	const resetMenuZoom = useCallback(() => {
		setPriceMenu((menu) => {
			if (!menu) return menu;
			try {
				getEngine()?.resetYAxisZoom(menu.scaleSlotId);
			} catch {
				// Stale engine — ignore.
			}
			return menu;
		});
	}, [getEngine]);

	const scrollbar = useMemo(() => {
		if (!enabled || plotData.length === 0) return null;
		const dataLength = plotData.length;
		const from = visibleRange ? Math.max(0, Math.floor(visibleRange.from)) : Math.max(0, dataLength - 100);
		const to = visibleRange ? Math.min(dataLength, Math.ceil(visibleRange.to)) : dataLength;
		if (!(to > from)) return null;
		return {
			dataLength,
			from,
			to,
			onWindowChange: (nextFrom: number, nextTo: number) => {
				try {
					getEngine()?.zoomToRange({ from: nextFrom, to: nextTo });
				} catch {
					// Stale engine — ignore.
				}
			},
		};
	}, [enabled, plotData.length, visibleRange, getEngine]);

	return {
		priceMenu,
		openMenuAt,
		handleSurfaceContextMenu,
		closeMenu,
		applyMenuMode,
		resetMenuZoom,
		mainSlotMode,
		applyMainSlotMode,
		scrollbar,
	};
}
