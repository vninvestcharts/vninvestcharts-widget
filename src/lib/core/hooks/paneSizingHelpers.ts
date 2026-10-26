import type { PaneDescriptor } from "../types/pane-descriptor";

export const MIN_PRICE_PANE_HEIGHT = 80;
export const MIN_VOLUME_PANE_HEIGHT = 36;
export const MIN_INDICATOR_PANE_HEIGHT = 48;
export const MIN_GENERIC_PANE_HEIGHT = 40;

export function getPaneMinHeight(pane: PaneDescriptor): number {
	if (typeof pane.minHeight === "number" && pane.minHeight > 0) return pane.minHeight;
	if (pane.id === "price") return MIN_PRICE_PANE_HEIGHT;
	if (pane.id === "volume") return MIN_VOLUME_PANE_HEIGHT;
	if (pane.id === "momentum" || pane.id === "orderflow" || pane.id === "strength") return MIN_INDICATOR_PANE_HEIGHT;
	return MIN_GENERIC_PANE_HEIGHT;
}

function getVisiblePanes(panes: readonly PaneDescriptor[]): PaneDescriptor[] {
	return panes.filter((pane) => pane.visible);
}

export function calculatePaneHeights(panes: readonly PaneDescriptor[], available: number): number[] {
	const visible = getVisiblePanes(panes);
	if (visible.length === 0) return [];
	const n = visible.length;
	const heights: number[] = new Array(n).fill(0);
	let allocated = 0;
	for (let i = n - 1; i >= 1; i--) {
		const minH = getPaneMinHeight(visible[i]);
		const raw = Math.round(visible[i].heightRatio * available);
		const h = Math.max(raw, minH);
		heights[i] = h;
		allocated += h;
	}
	const minPrice = getPaneMinHeight(visible[0]);
	heights[0] = Math.max(available - allocated, minPrice);
	return heights;
}

export function calculateSplitterBounds(
	topPane: PaneDescriptor,
	bottomPane: PaneDescriptor,
	topHeight: number,
	bottomHeight: number,
): { minDeltaY: number; maxDeltaY: number } {
	const minTop = getPaneMinHeight(topPane);
	const minBottom = getPaneMinHeight(bottomPane);
	const minDeltaY = minTop - topHeight;
	const maxDeltaY = bottomHeight - minBottom;
	return { minDeltaY, maxDeltaY };
}

export function applySplitterDelta(
	heights: readonly number[],
	splitterIndex: number,
	deltaY: number,
	visiblePanes: readonly PaneDescriptor[],
): number[] {
	const result = [...heights];
	const a = splitterIndex;
	const b = splitterIndex + 1;
	if (b >= heights.length) return result;
	if (a < 0 || a >= visiblePanes.length || b >= visiblePanes.length) return result;
	const { minDeltaY, maxDeltaY } = calculateSplitterBounds(visiblePanes[a], visiblePanes[b], heights[a], heights[b]);
	const clamped = Math.max(minDeltaY, Math.min(maxDeltaY, deltaY));
	result[a] = heights[a] + clamped;
	result[b] = heights[b] - clamped;
	return result;
}

export function equalizePairHeights(
	heights: readonly number[],
	splitterIndex: number,
	visiblePanes: readonly PaneDescriptor[],
): number[] {
	const result = [...heights];
	const a = splitterIndex;
	const b = splitterIndex + 1;
	if (b >= heights.length) return result;
	const total = heights[a] + heights[b];
	let half = Math.round(total / 2);
	const minA = visiblePanes[a] ? getPaneMinHeight(visiblePanes[a]) : 0;
	const minB = visiblePanes[b] ? getPaneMinHeight(visiblePanes[b]) : 0;
	if (half < minA) half = minA;
	if (total - half < minB) half = total - minB;
	half = Math.max(minA, Math.min(total - minB, half));
	result[a] = half;
	result[b] = total - half;
	return result;
}
