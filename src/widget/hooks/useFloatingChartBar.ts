/**
 * useFloatingChartBar — pan callbacks + action passthrough for FloatingChartBar.
 *
 * Pan reuses the scale-overlays SSOT (`scrollbar.onWindowChange`,
 * useScaleOverlays.ts:250-268) clamped by `clampWindow`. Zoom/fit/toggle are
 * pure passthrough of call-site closures (imperative handle via fan-out ref,
 * GridContainer.toggleMaximize) — zero duplicated math in this file.
 */

import { useCallback, useMemo } from "react";
import { clampWindow } from "../components/canvas/TimeAxisScrollbar";

export interface FloatingBarScrollbar {
	dataLength: number;
	from: number;
	to: number;
	onWindowChange: (from: number, to: number) => void;
}

export interface UseFloatingChartBarInput {
	zoomIn: () => void;
	zoomOut: () => void;
	fitToData: () => void;
	scrollbar: FloatingBarScrollbar | null;
	onToggleLayout?: () => void;
	isSoloMode?: boolean;
}

export interface UseFloatingChartBarOutput {
	onZoomIn: () => void;
	onZoomOut: () => void;
	onPanLeft: () => void;
	onPanRight: () => void;
	onFitToData: () => void;
	onToggleLayout?: () => void;
	isSoloMode?: boolean;
	panDisabled: boolean;
}

// QUYET DINH UX (khong co SSOT) — TC-9/TC-10 lock hanh vi, giong cam bien TradingView.
const PAN_STEP_RATIO = 0.20;

export function useFloatingChartBar(input: UseFloatingChartBarInput): UseFloatingChartBarOutput {
	const { zoomIn, zoomOut, fitToData, scrollbar, onToggleLayout, isSoloMode } = input;

	const panLeft = useCallback(() => {
		if (!scrollbar) return;
		// A6: span <= 2 -> Math.round cho 0 = dead click; clamp toi thieu 1 bar.
		const step = Math.max(1, Math.round((scrollbar.to - scrollbar.from) * PAN_STEP_RATIO));
		const next = clampWindow(scrollbar.from - step, scrollbar.to - step, scrollbar.dataLength);
		scrollbar.onWindowChange(next.from, next.to);
	}, [scrollbar]);

	const panRight = useCallback(() => {
		if (!scrollbar) return;
		const step = Math.max(1, Math.round((scrollbar.to - scrollbar.from) * PAN_STEP_RATIO));
		const next = clampWindow(scrollbar.from + step, scrollbar.to + step, scrollbar.dataLength);
		scrollbar.onWindowChange(next.from, next.to);
	}, [scrollbar]);

	return useMemo(() => ({
		onZoomIn: zoomIn,
		onZoomOut: zoomOut,
		onPanLeft: panLeft,
		onPanRight: panRight,
		onFitToData: fitToData,
		onToggleLayout,
		isSoloMode,
		panDisabled: scrollbar === null,
	}), [zoomIn, zoomOut, panLeft, panRight, fitToData, onToggleLayout, isSoloMode, scrollbar]);
}
