import type { WidgetPaneRuntimeSnapshot } from "./widgetHelpers";

export interface AxisSlotHit {
	paneId: string;
	scaleSlotId: string;
	side: "left" | "right";
	/** Current slot domain (for the log-availability guard). */
	domain?: readonly [number, number];
}

function inBounds(
	bounds: { left: number; top: number; width: number; height: number } | undefined,
	x: number,
	y: number,
): boolean {
	if (!bounds || bounds.width <= 0 || bounds.height <= 0) return false;
	return x >= bounds.left && x <= bounds.left + bounds.width
		&& y >= bounds.top && y <= bounds.top + bounds.height;
}

/**
 * P2 (W1): mirror of the engine `findScaleSlotAt` — map a chart-local point
 * to the Y-axis scale slot under it (for the price-scale context menu).
 * Returns null for plot/time-axis/empty regions. Total function.
 */
export function findAxisSlotAt(
	snapshots: readonly WidgetPaneRuntimeSnapshot[] | null | undefined,
	localX: number,
	localY: number,
): AxisSlotHit | null {
	if (!Array.isArray(snapshots) || !Number.isFinite(localX) || !Number.isFinite(localY)) {
		return null;
	}
	for (const snapshot of snapshots) {
		if (!snapshot) continue;
		const boundsMap = snapshot.scaleSlotBounds as Record<string, { left: number; top: number; width: number; height: number }> | undefined;
		if (!boundsMap) continue;
		for (const [slotId, bounds] of Object.entries(boundsMap)) {
			if (!inBounds(bounds, localX, localY)) continue;
			const state = (snapshot.scaleSlotStates as Record<string, { side?: string; domain?: readonly [number, number] } | undefined> | undefined)?.[slotId];
			const side = state?.side === "left" ? "left" : "right";
			return { paneId: snapshot.paneId, scaleSlotId: slotId, side, domain: state?.domain };
		}
	}
	return null;
}

/** Log scale needs a strictly positive domain (engine falls back + warns otherwise). */
export function isLogScaleAvailable(domain: readonly [number, number] | undefined): boolean {
	if (!domain || domain.length < 2) return false;
	const [min, max] = domain;
	return typeof min === "number" && typeof max === "number" && min > 0 && max > 0;
}
