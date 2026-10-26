import { useCallback, useEffect, useRef, useState } from 'react';
import { evaluateRuntimePolicy, type RequestedWidgetRuntime, type ResolvedWidgetRuntime, type WidgetRuntimeReasonCode } from '../runtimePolicy';
import type { WidgetRuntimeCapabilities, WidgetRuntimeResolutionReason } from '../utils/widgetHelpers';
import type { VNInvestChartsProps } from '../VNInvestCharts';

interface UseWidgetRuntimeOptions {
  engineRuntime?: RequestedWidgetRuntime;
  drawingUiEnabled: boolean;
  drawingActiveTool?: string;
  selectedDrawingType: string | null;
  onRuntimeResolved?: (runtime: ResolvedWidgetRuntime, reason: WidgetRuntimeResolutionReason) => void;
}

interface UseWidgetRuntimeReturn {
  useForkRuntime: boolean;
  /** Narrowed to fork since the legacy lane was removed 2026-10-03 (G4). */
  effectiveRuntime: 'fork';
  runtimeReason: WidgetRuntimeResolutionReason;
  runtimeCapabilities: WidgetRuntimeCapabilities;
  contentRuntimeKey: string;
  handleRuntimeDegraded: (reason: 'fork-no-render-output') => void;
}

export function useWidgetRuntime({
	engineRuntime,
	drawingUiEnabled,
	drawingActiveTool,
	selectedDrawingType,
	onRuntimeResolved,
}: UseWidgetRuntimeOptions): UseWidgetRuntimeReturn {
	const runtimePolicy = evaluateRuntimePolicy({
		engineRuntime,
		drawingUiEnabled,
		drawingActiveTool,
		selectedDrawingType,
	});

	const resolvedRequestedRuntime = runtimePolicy.resolvedRuntime;
	const resolvedRequestedReason = runtimePolicy.reasonCode;

	const lastNotifiedRuntimeResolutionRef = useRef<{
    runtime: ResolvedWidgetRuntime;
    reason: WidgetRuntimeResolutionReason;
  } | null>(null);

	const [effectiveRuntime, setEffectiveRuntime] = useState<'fork'>(resolvedRequestedRuntime);
	const [effectiveRuntimeReason, setEffectiveRuntimeReason] = useState<WidgetRuntimeResolutionReason>(resolvedRequestedReason);

	// Sync state when runtime policy resolves a different target runtime or reason
	const [prevRequestedRuntime, setPrevRequestedRuntime] = useState(resolvedRequestedRuntime);
	const [prevRequestedReason, setPrevRequestedReason] = useState(resolvedRequestedReason);
	if (resolvedRequestedRuntime !== prevRequestedRuntime || resolvedRequestedReason !== prevRequestedReason) {
		setPrevRequestedRuntime(resolvedRequestedRuntime);
		setPrevRequestedReason(resolvedRequestedReason);
		setEffectiveRuntime(resolvedRequestedRuntime);
		setEffectiveRuntimeReason(resolvedRequestedReason);
	}

	useEffect(() => {
		const previous = lastNotifiedRuntimeResolutionRef.current;
		if (previous && previous.runtime === effectiveRuntime && previous.reason === effectiveRuntimeReason) {
			return;
		}

		lastNotifiedRuntimeResolutionRef.current = {
			runtime: effectiveRuntime,
			reason: effectiveRuntimeReason,
		};
		onRuntimeResolved?.(effectiveRuntime, effectiveRuntimeReason);
	}, [effectiveRuntime, effectiveRuntimeReason, onRuntimeResolved]);

	const handleRuntimeDegraded = useCallback((_reason: 'fork-no-render-output') => {
		// Runtime degradation handling - can be extended for auto-fallback
	}, []);

	const useForkRuntime = effectiveRuntime === 'fork';
	const contentRuntimeKey = `${effectiveRuntime}-${false}`; // showNonTradingDays handled elsewhere

	const runtimeCapabilities: WidgetRuntimeCapabilities = {
		engineRuntime: 'fork',
		forkSupported: useForkRuntime,
		paneToolbar: true,
		paneSplitters: true,
		chartCanvasOverlays: true,
		measurementOverlay: true,
		drawingOverlays: true,
	};

	return {
		useForkRuntime,
		effectiveRuntime,
		runtimeReason: effectiveRuntimeReason,
		runtimeCapabilities,
		contentRuntimeKey,
		handleRuntimeDegraded,
	};
}

export type { UseWidgetRuntimeOptions, UseWidgetRuntimeReturn };