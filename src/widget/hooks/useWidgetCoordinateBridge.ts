import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
	type WidgetPaneRuntimeSnapshot,
	type WidgetCoordinateBridge,
} from '../utils/widgetHelpers';
import {
	createForkChartRenderContextValue,
	createForkStockChartContextValue,
} from '../utils/coordinateBridge';
import type { VisibleRange as EngineVisibleRange, EngineInstance } from '@vninvestcharts/engine-core';
import type { VisibleRange, PaneDescriptor } from '../../lib/core';
import {
	mergePaneSnapshotDomains,
	arePaneSnapshotsEqual,
} from '../utils/widgetHelpers';
import { areEngineVisibleRangesEqual, isForkRangeTraceEnabled, traceForkRange } from '../visibleRangeDiagnostics';
import type { StorageAdapter } from "@vninvestcharts/engine-react";

import { createPaneSpecsFromDescriptors } from '@vninvestcharts/engine-core';
import type { EnrichedDatum } from '../../lib/core/calculators/types';
import { ChartScaleAdapter } from '../runtime/ChartScaleAdapter';
import { ForkRuntimeAdapter } from '../runtime/ForkRuntimeAdapter';
import type { IRuntimeScale } from '../runtime/IRuntimeEngine';

interface UseWidgetCoordinateBridgeOptions {
  useForkRuntime: boolean;
  plotData: readonly EnrichedDatum[];
  enrichedData: readonly EnrichedDatum[];
  bars: readonly any[];
  visiblePanes: readonly PaneDescriptor[];
  size: { width: number; height: number };
  scaleSlotDomains: Record<string, [number, number]>;
  activeHeights: number[];
  forkEngineInstance: EngineInstance | null;
  forkVisibleRange: EngineVisibleRange | null;
  setForkVisibleRange: React.Dispatch<React.SetStateAction<EngineVisibleRange | null>>;
  forkVisibleRangeRef: React.MutableRefObject<EngineVisibleRange | null>;
  forkPaneSnapshotsRef: React.MutableRefObject<readonly WidgetPaneRuntimeSnapshot[]>;
  paneSnapshots: readonly WidgetPaneRuntimeSnapshot[];
  setPaneSnapshots: React.Dispatch<React.SetStateAction<readonly WidgetPaneRuntimeSnapshot[]>>;
  snapshotRevision: number;
  incrementSnapshotRevision: () => void;
  legacyVisibleRange: VisibleRange | null;
  setLegacyVisibleRange: React.Dispatch<React.SetStateAction<VisibleRange | null>>;
  onCoordinateBridgeChange: ((bridge: WidgetCoordinateBridge | null) => void) | undefined;
  onPaneSnapshotsChange: ((snapshots: readonly WidgetPaneRuntimeSnapshot[]) => void) | undefined;
  onVisibleDomainChange: ((domain: [Date | number, Date | number]) => void) | undefined;
  onVisibleRangeChange: ((range: VisibleRange) => void) | undefined;
  controlledXExtents: readonly [Date | number, Date | number] | undefined;
  internalXExtents: readonly [Date | number, Date | number] | undefined;
  setInternalXExtents: React.Dispatch<React.SetStateAction<readonly [Date | number, Date | number] | undefined>>;
  symbol: string | undefined;
  localRange: string | undefined;
  showNonTradingDays: boolean;
  chartSurfaceReady: boolean;
  pendingForkVisibleRangeRef: React.MutableRefObject<EngineVisibleRange | null>;
  pendingForkVisibleRangeRafRef: React.MutableRefObject<number | null>;
  lastStableForkSpanRef: React.MutableRefObject<number | null>;
  pendingHistoryPatchRef: React.MutableRefObject<any>;
  lastEmittedPaneSnapshotsRef: React.MutableRefObject<readonly WidgetPaneRuntimeSnapshot[]>;
  lastPaneSnapshotsSubscriberRef: React.MutableRefObject<((snapshots: readonly WidgetPaneRuntimeSnapshot[]) => void) | undefined>;
  resolvedLegacyVisibleRangeRef: React.MutableRefObject<VisibleRange | null>;
  engineInstanceRef: React.MutableRefObject<EngineInstance | null>;
  storageAdapter?: StorageAdapter;
}

interface UseWidgetCoordinateBridgeReturn {
  legacyCoordinateBridge: WidgetCoordinateBridge | null;
  forkChartRenderContextValue: ReturnType<typeof createForkChartRenderContextValue> | null;
  forkStockChartContextValue: ReturnType<typeof createForkStockChartContextValue> | null;
  legacyPaneSnapshots: readonly WidgetPaneRuntimeSnapshot[];
  resolvedLegacyVisibleRange: VisibleRange | null;
  paneSnapshotMap: Map<string, WidgetPaneRuntimeSnapshot>;
  emitPaneSnapshots: (nextSnapshots: readonly WidgetPaneRuntimeSnapshot[]) => void;
  handleVisibleDomainChange: (domain: [Date | number, Date | number]) => void;
  emitCoordinateBridge: (snapshots: readonly WidgetPaneRuntimeSnapshot[], range: EngineVisibleRange | null) => void;
  /**
   * Typed `IRuntimeScale`, not `any` (2026-10-05). This is what makes removing the unread
   * `xScale` field a compiler-checked change instead of a grep claim: while this was `any`,
   * `tsc` could not see a read of a field that does not exist. See `IRuntimeEngine.ts`.
   */
  legacyChartScale: IRuntimeScale;
}

/** Stable empty pane snapshots for the fork lane. See the legacyPaneSnapshots memo. */
const EMPTY_PANE_SNAPSHOTS: readonly WidgetPaneRuntimeSnapshot[] = [];

export function useWidgetCoordinateBridge({
	useForkRuntime,
	plotData,
	enrichedData,
	visiblePanes,
	size,
	scaleSlotDomains,
	activeHeights,
	forkEngineInstance,
	forkVisibleRange,
	setForkVisibleRange,
	forkVisibleRangeRef,
	forkPaneSnapshotsRef,
	paneSnapshots,
	setPaneSnapshots,
	snapshotRevision,
	incrementSnapshotRevision,
	legacyVisibleRange,
	setLegacyVisibleRange,
	onCoordinateBridgeChange,
	onPaneSnapshotsChange,
	onVisibleDomainChange,
	onVisibleRangeChange,
	controlledXExtents,
	internalXExtents,
	setInternalXExtents,
	symbol,
	localRange,
	showNonTradingDays,
	chartSurfaceReady,
	pendingForkVisibleRangeRef,
	pendingForkVisibleRangeRafRef,
	lastStableForkSpanRef,
	pendingHistoryPatchRef,
	lastEmittedPaneSnapshotsRef,
	lastPaneSnapshotsSubscriberRef,
	resolvedLegacyVisibleRangeRef,
	engineInstanceRef,
	storageAdapter,
}: UseWidgetCoordinateBridgeOptions): UseWidgetCoordinateBridgeReturn {
	const legacyAdapter = useMemo(() => new ChartScaleAdapter(), []);
	const forkAdapter = useMemo(() => new ForkRuntimeAdapter(), []);
	const activeAdapter = useMemo(() => (useForkRuntime ? forkAdapter : legacyAdapter), [useForkRuntime, forkAdapter, legacyAdapter]);

	const computedXExtents = useMemo(() => {
		if (enrichedData.length === 0) return undefined;
		const firstBar = enrichedData[0];
		const lastBar = enrichedData[enrichedData.length - 1];
		const lastBarMs = lastBar.date.getTime();
		const rightEdgeMs = Math.max(lastBarMs, Date.now());
		// Ensure at least 60s span when both edges coincide (single bar)
		const effectiveRightMs = firstBar.date.getTime() === lastBarMs
			? Math.max(rightEdgeMs, lastBarMs + 60_000)
			: rightEdgeMs;
		return [firstBar.date, new Date(effectiveRightMs)] as [Date, Date];
	}, [enrichedData]);

	const legacyChartScale = useMemo(() => {
		// NOT gated on the lane, and that is deliberate. Plan v5 G2.1 assumed this memo
		// was legacy-only and proposed an early return on fork. Measurement says
		// otherwise: VNInvestCharts.tsx reads legacyChartScale.usesDiscontinuousScale,
		// .data and .xAccessor outside the legacy JSX branch, so returning null here
		// crashed 135 tests. Only legacyPaneSnapshots turned out to be gate-able.
		const result = legacyAdapter.getChartScale({
			plotData,
			enrichedData,
			controlledXExtents: controlledXExtents ?? internalXExtents,
			computedXExtents,
			showNonTradingDays,
		});
		return result;
	}, [legacyAdapter, plotData, enrichedData, controlledXExtents, internalXExtents, computedXExtents, showNonTradingDays]);

	const defaultLegacyVisibleRange = useMemo<VisibleRange | null>(() => {
		if (plotData.length === 0) return null;
		return {
			startIndex: 0,
			endIndex: plotData.length - 1,
			startDate: plotData[0].date,
			endDate: plotData[plotData.length - 1].date,
			timeRange: { from: plotData[0].date.getTime(), to: plotData[plotData.length - 1].date.getTime() },
			barCount: plotData.length,
		};
	}, [plotData]);

	const resolvedLegacyVisibleRange = legacyVisibleRange ?? defaultLegacyVisibleRange;
	resolvedLegacyVisibleRangeRef.current = resolvedLegacyVisibleRange;

	const emitCoordinateBridge = useCallback((
		nextPaneSnapshots: readonly WidgetPaneRuntimeSnapshot[],
		nextVisibleRange: EngineVisibleRange | null,
	) => {
		onCoordinateBridgeChange?.(activeAdapter.createCoordinateBridge({
			paneSnapshots: nextPaneSnapshots,
			visibleRange: useForkRuntime ? nextVisibleRange : resolvedLegacyVisibleRange,
			plotData,
		}));
	}, [onCoordinateBridgeChange, activeAdapter, useForkRuntime, resolvedLegacyVisibleRange, plotData]);

	// Legacy pane snapshots
	//
	// G2: gated on the lane. The module-level EMPTY constant is load-bearing, not
	// cosmetic: the legacy/fork handover effect at ~:371 lists legacyPaneSnapshots in
	// its dependency array, so returning a fresh [] here would re-fire that effect on
	// every render while on fork.
	const legacyPaneSnapshots = useMemo(
		() => (useForkRuntime
			? EMPTY_PANE_SNAPSHOTS
			: legacyAdapter.buildPaneSnapshots({
				visiblePanes: visiblePanes as any[], // ARC-1-keep: legacy bridge
				activeHeights,
				size,
				scaleSlotDomains,
			})),
		[useForkRuntime, legacyAdapter, activeHeights, scaleSlotDomains, size, visiblePanes],
	);

	// Legacy coordinate bridge
	//
	// Also NOT gated, for a different reason than legacyChartScale: this one is handed
	// to useChartImperativeHandle, which is reachable on both lanes. Nulling it broke
	// the replay gate there. Its JSX uses at VNInvestCharts.tsx:2744+ are inside the
	// DynamicChart branch, but the imperative handle is not.
	const legacyCoordinateBridge = useMemo(
		() => legacyAdapter.createCoordinateBridge({
			paneSnapshots: legacyPaneSnapshots,
			visibleRange: resolvedLegacyVisibleRange,
			plotData,
		}),
		[legacyAdapter, legacyPaneSnapshots, plotData, resolvedLegacyVisibleRange]
	);

	// Fork chart render context
	const forkChartRenderContextValue = useMemo(
		() => createForkChartRenderContextValue({
			paneSnapshots: (() => {
				const engine = engineInstanceRef.current;
				if (!engine) return null;
				const sn = engine.getPaneSnapshots();
				if (!sn || sn.length === 0) return null;
				return sn;
			})() ?? paneSnapshots,
			visibleRange: (() => {
				const engine = engineInstanceRef.current;
				if (!engine) return null;
				const range = engine.getVisibleRange();
				if (!range || Math.abs(range.to - range.from) <= 1e-6) return null;
				return range;
			})() ?? forkVisibleRange,
			plotData,
			width: size.width,
			height: size.height,
		}),
		[paneSnapshots, plotData, size.height, size.width, snapshotRevision, forkVisibleRange, forkEngineInstance]
	);

	// Fork stock chart context
	const forkStockChartContextValue = useMemo(
		() => createForkStockChartContextValue({
			paneSnapshots,
			plotData,
			chartRenderContextValue: forkChartRenderContextValue,
			width: size.width,
			height: size.height,
			generateSubscriptionId: () => {
				return Date.now() + Math.random();
			},
		}),
		[forkChartRenderContextValue, paneSnapshots, plotData, size.height, size.width]
	);

	// Pane snapshot map
	const paneSnapshotMap = useMemo(
		() => new Map(paneSnapshots.map((snapshot) => [snapshot.paneId, snapshot] as const)),
		[paneSnapshots]
	);

	// Handle visible domain change
	const handleVisibleDomainChange = useCallback((domain: [Date | number, Date | number]) => {
		onVisibleDomainChange?.(domain);
		if (controlledXExtents === undefined && symbol) {
			try {
				storageAdapter?.setItem(`vninvest:chart-state:${symbol}`, JSON.stringify({
					range: localRange,
					xExtents: [
						domain[0] instanceof Date ? domain[0].getTime() : domain[0],
						domain[1] instanceof Date ? domain[1].getTime() : domain[1]
					]
				}));
			} catch (e) {
				console.warn('Failed to save chart state to storage:', e);
			}
		}
	}, [onVisibleDomainChange, controlledXExtents, symbol, localRange]);

	// Emit pane snapshots
	const emitPaneSnapshots = useCallback((nextSnapshots: readonly WidgetPaneRuntimeSnapshot[]) => {
		const preferSnapshotPriceDomains = useForkRuntime;
		if (isForkRangeTraceEnabled() && useForkRuntime) {
			const firstSnapshot = nextSnapshots[0];
			const sampleSlotId = 'price-right';
			(window as unknown as { __VN_RAW_PRICE_DOMAIN__?: readonly [number, number] | null }).__VN_RAW_PRICE_DOMAIN__ = firstSnapshot?.scaleSlotStates?.[sampleSlotId]?.domain ?? null;
			traceForkRange('pane-domain-merge', {
				preferSnapshotPriceDomains,
				snapshotDomain: firstSnapshot?.scaleSlotStates?.[sampleSlotId]?.domain ?? null,
				fallbackDomain: scaleSlotDomains[sampleSlotId] ?? null,
			});
		}
		const mergedSnapshots = mergePaneSnapshotDomains(nextSnapshots, scaleSlotDomains, {
			preferSnapshotPriceDomains,
		});
		const subscriberChanged = lastPaneSnapshotsSubscriberRef.current !== onPaneSnapshotsChange;
		const snapshotsChanged = !arePaneSnapshotsEqual(lastEmittedPaneSnapshotsRef.current, mergedSnapshots);
		if (useForkRuntime) {
			forkPaneSnapshotsRef.current = mergedSnapshots;
		}
		setPaneSnapshots((currentSnapshots) => {
			if (arePaneSnapshotsEqual(currentSnapshots, mergedSnapshots)) {
				return currentSnapshots;
			}
			return mergedSnapshots;
		});
		if (snapshotsChanged || subscriberChanged) {
			lastEmittedPaneSnapshotsRef.current = mergedSnapshots;
			lastPaneSnapshotsSubscriberRef.current = onPaneSnapshotsChange;
			onPaneSnapshotsChange?.(mergedSnapshots);
		}
		if (useForkRuntime) {
			const pendingRange = pendingForkVisibleRangeRef.current;
			if (pendingRange) {
				pendingForkVisibleRangeRef.current = null;
				if (pendingForkVisibleRangeRafRef.current !== null && typeof cancelAnimationFrame === 'function') {
					cancelAnimationFrame(pendingForkVisibleRangeRafRef.current);
				}
				pendingForkVisibleRangeRafRef.current = null;
				forkVisibleRangeRef.current = pendingRange;
				setForkVisibleRange((currentRange: EngineVisibleRange | null) => (areEngineVisibleRangesEqual(currentRange, pendingRange) ? currentRange : pendingRange));
				incrementSnapshotRevision();
				emitCoordinateBridge(mergedSnapshots, pendingRange);
				return;
			}
			emitCoordinateBridge(mergedSnapshots, forkVisibleRangeRef.current);
			return;
		}
		emitCoordinateBridge(mergedSnapshots, null);
	}, [emitCoordinateBridge, incrementSnapshotRevision, onPaneSnapshotsChange, scaleSlotDomains, useForkRuntime]);

	const paneSnapshotsRef = useRef(paneSnapshots);
	paneSnapshotsRef.current = paneSnapshots;

	// Effect: chart surface ready / fork cleanup
	const wasChartSurfaceReadyRef = useRef(chartSurfaceReady);
	useEffect(() => {
		if (!chartSurfaceReady) {
			const wasReady = wasChartSurfaceReadyRef.current;
			wasChartSurfaceReadyRef.current = false;
			const alreadyClean =
				forkPaneSnapshotsRef.current.length === 0 &&
				paneSnapshotsRef.current.length === 0;

			if (alreadyClean) return;

			// Always preserve forkVisibleRangeRef — initialXExtents or fork defaultRange
			// already set it; resetting here causes fight loop (cached range → reset → default → re-render → repeat).
			forkPaneSnapshotsRef.current = [];
			lastStableForkSpanRef.current = null;
			pendingForkVisibleRangeRef.current = null;
			pendingHistoryPatchRef.current = null;
			if (pendingForkVisibleRangeRafRef.current !== null && typeof cancelAnimationFrame === 'function') {
				cancelAnimationFrame(pendingForkVisibleRangeRafRef.current);
			}
			pendingForkVisibleRangeRafRef.current = null;

			if (!alreadyClean) {
				onCoordinateBridgeChange?.(null);
				setPaneSnapshots([]);
				incrementSnapshotRevision();
			}
			return;
		}

		wasChartSurfaceReadyRef.current = true;

		if (useForkRuntime) {
			if (forkPaneSnapshotsRef.current.length === 0) {
				onCoordinateBridgeChange?.(null);
				setPaneSnapshots((currentSnapshots) => (currentSnapshots.length === 0 ? currentSnapshots : []));
			}
			return;
		}
		const alreadyCleanLegacy =
			forkPaneSnapshotsRef.current.length === 0 &&
			forkVisibleRangeRef.current === null &&
			arePaneSnapshotsEqual(paneSnapshotsRef.current, legacyPaneSnapshots);

		forkPaneSnapshotsRef.current = [];
		forkVisibleRangeRef.current = null;
		lastStableForkSpanRef.current = null;
		pendingForkVisibleRangeRef.current = null;
		pendingHistoryPatchRef.current = null;
		if (pendingForkVisibleRangeRafRef.current !== null && typeof cancelAnimationFrame === 'function') {
			cancelAnimationFrame(pendingForkVisibleRangeRafRef.current);
		}
		pendingForkVisibleRangeRafRef.current = null;

		if (!alreadyCleanLegacy) {
			emitPaneSnapshots(legacyPaneSnapshots);
			incrementSnapshotRevision();
		}
	}, [chartSurfaceReady, emitPaneSnapshots, legacyPaneSnapshots, onCoordinateBridgeChange, useForkRuntime, incrementSnapshotRevision]);

	// Effect: fork snapshot merge
	useEffect(() => {
		if (!useForkRuntime) return;

		const currentForkSnapshots = forkPaneSnapshotsRef.current;
		if (currentForkSnapshots.length === 0) return;

		const preferSnapshotPriceDomains = true;
		const mergedSnapshots = mergePaneSnapshotDomains(currentForkSnapshots, scaleSlotDomains, {
			preferSnapshotPriceDomains,
		});
		if (arePaneSnapshotsEqual(currentForkSnapshots, mergedSnapshots)) return;

		forkPaneSnapshotsRef.current = mergedSnapshots;
		setPaneSnapshots((currentSnapshots) => (
			arePaneSnapshotsEqual(currentSnapshots, mergedSnapshots)
				? currentSnapshots
				: mergedSnapshots
		));

		const subscriberChanged = lastPaneSnapshotsSubscriberRef.current !== onPaneSnapshotsChange;
		const snapshotsChanged = !arePaneSnapshotsEqual(lastEmittedPaneSnapshotsRef.current, mergedSnapshots);
		if (snapshotsChanged || subscriberChanged) {
			lastEmittedPaneSnapshotsRef.current = mergedSnapshots;
			lastPaneSnapshotsSubscriberRef.current = onPaneSnapshotsChange;
			onPaneSnapshotsChange?.(mergedSnapshots);
		}

		emitCoordinateBridge(mergedSnapshots, forkVisibleRangeRef.current);
	}, [emitCoordinateBridge, onPaneSnapshotsChange, scaleSlotDomains, useForkRuntime]);

	return {
		legacyCoordinateBridge,
		forkChartRenderContextValue,
		forkStockChartContextValue,
		legacyPaneSnapshots,
		resolvedLegacyVisibleRange,
		paneSnapshotMap,
		emitPaneSnapshots,
		handleVisibleDomainChange,
		emitCoordinateBridge,
		legacyChartScale,
	};
}

export type { UseWidgetCoordinateBridgeOptions, UseWidgetCoordinateBridgeReturn };