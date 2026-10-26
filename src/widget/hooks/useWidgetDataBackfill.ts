import { useCallback, useRef, useEffect } from "react";
import {
	type EngineInstance,
	type EngineHistoryPatch,
	type EngineHistorySnapshot,
	type VisibleRange as EngineVisibleRange,
} from "@vninvestcharts/engine-core";
import { type StockDataAdapter, type Timeframe } from "../../lib/types/adapter";
import { type OHLCVBar } from "../../lib/types/ohlcv";
import { type WidgetPaneRuntimeSnapshot } from "../utils/widgetHelpers";
import { getCalendar } from "../../lib/calendars";
import {
	computeLoadedHistoryWindow,
	filterBarsForFinalityMerge,
	resolveTimeframeMs,
	type FinalityMergeOptions,
} from "../history/historyDataUtils";
import { computeResidentTarget, computeMissingSegments, computeTrimWindow, prioritizeMissingSegments } from "../history/historyWindowPlanner";
import { coalesceAndAdjustSegment, toInflightRequestKey } from "../history/requestCoalescing";
import { useBackfillDedup, dedupWrapAdapter } from "../history/BackfillDedupContext";
import { traceForkRange, areVisibleDomainsEqual } from "../visibleRangeDiagnostics";

export interface UseWidgetDataBackfillProps {
	adapter: StockDataAdapter;
	activeSymbol: string;
	activeTimeframe: Timeframe;
	activeCacheKey: string;
	activeCacheSemanticScope: string | undefined;
	activeSourceSemantics: any;
	isControlledHistorySession: boolean;
	loading: boolean;
	useForkRuntime?: boolean;
	engineInstanceRef: React.RefObject<EngineInstance | null>;
	forkVisibleRangeRef: React.MutableRefObject<EngineVisibleRange | null>;
	forkVisibleRange: EngineVisibleRange | null;
	setForkVisibleRange: React.Dispatch<React.SetStateAction<EngineVisibleRange | null>>;
	incrementSnapshotRevision: () => void;
	emitCoordinateBridge: (snapshots: readonly WidgetPaneRuntimeSnapshot[], range: EngineVisibleRange) => void;
	forkPaneSnapshotsRef: React.MutableRefObject<readonly WidgetPaneRuntimeSnapshot[]>;
	paneSnapshots: readonly WidgetPaneRuntimeSnapshot[];
	historyMinResidentBars?: number;
	onHistorySyncBusyChange?: (busy: boolean) => void;
	chartId?: string;

	// Shared State & Refs
	bars: readonly OHLCVBar[];
	setBars: React.Dispatch<React.SetStateAction<readonly OHLCVBar[]>>;
	historyBackfillBeforeRef: React.MutableRefObject<number | null>;
	historyForwardAfterRef: React.MutableRefObject<number | null>;
	consecutiveEmptyBackfillRef: React.MutableRefObject<number>;
	pendingHistoryPatchRef: React.MutableRefObject<EngineHistoryPatch | null>;
	activeHistoryRequestKeyRef: React.MutableRefObject<string>;
	activeHistorySessionRevisionRef: React.MutableRefObject<number>;
	historyChunkStoreRef: React.MutableRefObject<any>;
	historyMergeLaneRef: React.MutableRefObject<any>;
	cacheMatrixRef: React.MutableRefObject<any>;
	liveEdgeMsRef: React.MutableRefObject<number | null>;
	prevVisibleSpanMsRef: React.MutableRefObject<number | null>;
	prevVisibleStartMsRef: React.MutableRefObject<number | null>;
	maxInflightRef: React.MutableRefObject<number>;
	debounceMsRef: React.MutableRefObject<number>;
	chunkBarsRef: React.MutableRefObject<number>;
	retentionFactorRef: React.MutableRefObject<number>;
	overfetchRatioRef: React.MutableRefObject<number>;
	queueDepthRef: React.MutableRefObject<number>;
	activeRequestsRef: React.MutableRefObject<Set<Promise<any>>>;
	abortControllersRef: React.MutableRefObject<Map<string, AbortController>>;
	historySyncBusyRef: React.MutableRefObject<boolean>;
	historyWindowSyncInFlightRef: React.MutableRefObject<boolean>;
	pendingVisibleDomainRef: React.MutableRefObject<[Date, Date] | null>;
	visibleDomainRef: React.MutableRefObject<[Date, Date] | null>;
	lastQueuedVisibleDomainRef: React.MutableRefObject<[Date, Date] | null>;

	// Helper Callbacks
	isHistorySessionRequestCurrent: (requestKey: string, sessionRevision: number, signal?: AbortSignal) => boolean;
	runHistoryMergeLane: <T>(writer: () => T | Promise<T>) => Promise<T>;
	syncHistoryBusyState: () => void;
	isTestEnv: boolean;
	EMPTY_BACKFILL_LOCK_THRESHOLD: number;
}

export function useWidgetDataBackfill({
	adapter,
	activeSymbol,
	activeTimeframe,
	activeCacheKey,
	activeCacheSemanticScope,
	activeSourceSemantics,
	isControlledHistorySession,
	loading,
	useForkRuntime = false,
	engineInstanceRef,
	forkVisibleRangeRef,
	forkVisibleRange,
	setForkVisibleRange,
	incrementSnapshotRevision,
	emitCoordinateBridge,
	forkPaneSnapshotsRef,
	paneSnapshots,
	historyMinResidentBars,
	onHistorySyncBusyChange,
	chartId,

	bars,
	setBars,
	historyBackfillBeforeRef,
	historyForwardAfterRef,
	consecutiveEmptyBackfillRef,
	pendingHistoryPatchRef,
	activeHistoryRequestKeyRef,
	activeHistorySessionRevisionRef,
	historyChunkStoreRef,
	historyMergeLaneRef,
	cacheMatrixRef,
	liveEdgeMsRef,
	prevVisibleSpanMsRef,
	prevVisibleStartMsRef,
	maxInflightRef,
	debounceMsRef,
	chunkBarsRef,
	retentionFactorRef,
	overfetchRatioRef,
	queueDepthRef,
	activeRequestsRef,
	abortControllersRef,
	historySyncBusyRef,
	historyWindowSyncInFlightRef,
	pendingVisibleDomainRef,
	visibleDomainRef,
	lastQueuedVisibleDomainRef,

	isHistorySessionRequestCurrent,
	runHistoryMergeLane,
	syncHistoryBusyState,
	isTestEnv,
	EMPTY_BACKFILL_LOCK_THRESHOLD,
}: UseWidgetDataBackfillProps) {
	const dedupCtx = useBackfillDedup();
	const effectiveAdapter = dedupCtx ? dedupWrapAdapter(adapter, dedupCtx) : adapter;

	const reconcileVisibleHistoryWindow = useCallback(async (visibleDomain: [Date, Date]) => {
		const workingBars = historyChunkStoreRef.current.toSnapshot().bars;
		const forkRange = forkVisibleRangeRef.current || forkVisibleRange;
		if (isControlledHistorySession || (loading && workingBars.length === 0)) {
			return;
		}

		const residentMaxBars = 120000;
		const requestKey = activeHistoryRequestKeyRef.current;
		const sessionRevision = activeHistorySessionRevisionRef.current;
		const timeframeMs = resolveTimeframeMs(activeTimeframe);

		let adjustedVisibleStartMs = visibleDomain[0].getTime();
		let adjustedVisibleEndMs = visibleDomain[1].getTime();

		const currentForkRange = forkVisibleRangeRef.current || forkVisibleRange;
		if (useForkRuntime && currentForkRange && workingBars.length > 0) {
			const minRange = Math.min(currentForkRange.from, currentForkRange.to);
			const maxRange = Math.max(currentForkRange.from, currentForkRange.to);
			if (minRange < 0) {
				const originalStartMs = adjustedVisibleStartMs;
				adjustedVisibleStartMs = workingBars[0].date.getTime() + minRange * timeframeMs;
			}
			if (maxRange > workingBars.length) {
				const rawEndMs = workingBars[0].date.getTime() + maxRange * timeframeMs;
				// When viewport extends past right edge of loaded data, use Date.now()
				// for backfill detection so the right-side gap is detected up to NOW.
				// liveEdgeMs (last loaded bar) is only used for trimming/display, not
				// for computing the resident target — otherwise we under-fetch forward.
				const detectionEdgeCap = Date.now();
				adjustedVisibleEndMs = Math.min(rawEndMs, detectionEdgeCap);
			}
		}

		const HISTORY_MIN_RESIDENT_BARS = 240;
		const minimumResidentSpanMs = timeframeMs * (historyMinResidentBars ?? HISTORY_MIN_RESIDENT_BARS);
		const visibleSpanMs = Math.max(
			timeframeMs,
			minimumResidentSpanMs,
			adjustedVisibleEndMs - adjustedVisibleStartMs,
		);
		const visibleBarCount = Math.max(1, Math.round(visibleSpanMs / timeframeMs));

		const currentVisibleSpanMs = adjustedVisibleEndMs - adjustedVisibleStartMs;
		const isZoomIn = prevVisibleSpanMsRef.current !== null && currentVisibleSpanMs < prevVisibleSpanMsRef.current;
		prevVisibleSpanMsRef.current = currentVisibleSpanMs;

		const visibleStartMs = visibleDomain[0].getTime();
		const isMovingLeft = prevVisibleStartMsRef.current !== null && visibleStartMs < prevVisibleStartMsRef.current;
		prevVisibleStartMsRef.current = visibleStartMs;

		const isPast = liveEdgeMsRef.current !== null && adjustedVisibleEndMs < liveEdgeMsRef.current - 2 * timeframeMs;

		const liveEdgeMs = liveEdgeMsRef.current;
		// Detection target: use Date.now() as cap so right-side backfill detects gaps up to NOW
		// (liveEdgeMs = last loaded bar timestamp is too stale for forward detection)
		const detectionEdgeMs = Date.now();
		let targetWindow = computeResidentTarget(
			{ startMs: adjustedVisibleStartMs, endMs: adjustedVisibleEndMs },
			visibleSpanMs,
			visibleBarCount,
			activeSourceSemantics ?? undefined,
			retentionFactorRef.current,
			detectionEdgeMs,
		);
		// CRITICAL: Ensure resident target extends to current date so forward
		// backfill detects gaps up to NOW, not just to visibleEnd + padding.
		// Without this, computeMissingSegments returns a smaller right-side
		// segment (or none at all), and forward fetch never reaches Date.now().
		targetWindow = {
			...targetWindow,
			endMs: Math.max(targetWindow.endMs, detectionEdgeMs),
		};
		if (isZoomIn && isPast && liveEdgeMs !== null) {
			targetWindow = {
				...targetWindow,
				endMs: Math.max(targetWindow.endMs, liveEdgeMs),
			};
		}

		if (workingBars.length === 0) {
			return;
		}

		const loadedWindow = computeLoadedHistoryWindow(workingBars);
		if (!loadedWindow) {
			return;
		}


		const sourceSemantics = activeSourceSemantics ?? undefined;
		const calendar = getCalendar(sourceSemantics?.sessionCalendarId);
		const rawMissingSegments = computeMissingSegments(targetWindow, loadedWindow, sourceSemantics, calendar ?? undefined);

		const finalityMergeOpts: FinalityMergeOptions | null = sourceSemantics
			? {
				finalityMode: sourceSemantics.finalityMode,
				nowMs: Date.now(),
				provisionalWindowMs: timeframeMs,
				correctionLookbackMs: sourceSemantics.correctionLookbackMs,
			}
			: null;
		const fetchableMissingSegments = rawMissingSegments.filter((segment) => segment.reason === "not-fetched");
		if (fetchableMissingSegments.length === 0) {
			// Use detectionEdgeMs (Date.now()) for trim so we don't remove bars loaded up to NOW
			// liveEdgeMs (last loaded bar) is too stale when backfill hasn't reached current time
			let resolvedResidentTarget = computeResidentTarget(
				{ startMs: adjustedVisibleStartMs, endMs: adjustedVisibleEndMs },
				visibleSpanMs,
				visibleBarCount,
				sourceSemantics,
				retentionFactorRef.current,
				detectionEdgeMs,
			);
			// CRITICAL: Ensure resident target extends to current date so trim
			// window never removes bars from the right edge during zoom cycles.
			resolvedResidentTarget = {
				...resolvedResidentTarget,
				endMs: Math.max(resolvedResidentTarget.endMs, detectionEdgeMs),
			};
			if (liveEdgeMs !== null && adjustedVisibleEndMs < liveEdgeMs) {
				resolvedResidentTarget = {
					...resolvedResidentTarget,
					endMs: Math.max(resolvedResidentTarget.endMs, liveEdgeMs),
				};
			}
			const trimPatch = historyChunkStoreRef.current.trimToWindow(computeTrimWindow(resolvedResidentTarget), residentMaxBars, !isMovingLeft, isMovingLeft);
			if (trimPatch !== null) {
				setBars(historyChunkStoreRef.current.toSnapshot().bars);
			}
			return;
		}

		const priorityQueue = prioritizeMissingSegments(fetchableMissingSegments, {
			startMs: adjustedVisibleStartMs,
			endMs: adjustedVisibleEndMs,
		});

		queueDepthRef.current = priorityQueue.length;
		const promises: Promise<any>[] = [];

		for (const rawSegment of priorityQueue) {
			if (activeRequestsRef.current.size >= maxInflightRef.current) {
				break;
			}

			const segment = coalesceAndAdjustSegment(rawSegment, abortControllersRef.current.keys());
			if (!segment) {
				continue;
			}

			const controller = new AbortController();
			const controllerKey = toInflightRequestKey(segment);
			abortControllersRef.current.set(controllerKey, controller);

			let requestPromise: Promise<any> = Promise.resolve();

			if (segment.side === "left") {
				const beforeTimestamp = segment.to;
				if (beforeTimestamp && historyBackfillBeforeRef.current !== beforeTimestamp) {
					requestPromise = (async () => {
						try {
							const targetRange = { fromTs: segment.from!, toTs: beforeTimestamp };
							const cacheRead = isTestEnv
								? { bars: [], missingRanges: [targetRange] }
								: await cacheMatrixRef.current.readRanges(activeCacheKey, [targetRange], activeCacheSemanticScope);

							if (!isHistorySessionRequestCurrent(requestKey, sessionRevision, controller.signal)) {
								return;
							}

							if (cacheRead.bars.length > 0) {
								await runHistoryMergeLane(() => {
									if (!isHistorySessionRequestCurrent(requestKey, sessionRevision, controller.signal)) {
										return;
									}

									historyChunkStoreRef.current.prepend(cacheRead.bars);
									// Update live edge after prepend (tail doesn't change, but keep ref current)
									const snapshot = historyChunkStoreRef.current.toSnapshot();
									if (snapshot.bars.length > 0 && liveEdgeMsRef.current === null) {
										liveEdgeMsRef.current = snapshot.bars[snapshot.bars.length - 1].date.getTime();
									}
									// CRITICAL: Use detectionEdgeMs (Date.now()) for resident target
									let resolvedResidentTarget = computeResidentTarget(
										{ startMs: adjustedVisibleStartMs, endMs: adjustedVisibleEndMs },
										visibleSpanMs,
										visibleBarCount,
										sourceSemantics,
										retentionFactorRef.current,
										detectionEdgeMs,
									);
									resolvedResidentTarget = {
										...resolvedResidentTarget,
										endMs: Math.max(resolvedResidentTarget.endMs, detectionEdgeMs),
									};
									if (liveEdgeMsRef.current !== null && adjustedVisibleEndMs < liveEdgeMsRef.current) {
										resolvedResidentTarget = {
											...resolvedResidentTarget,
											endMs: Math.max(resolvedResidentTarget.endMs, liveEdgeMsRef.current),
										};
									}
									historyChunkStoreRef.current.trimToWindow(computeTrimWindow(resolvedResidentTarget), residentMaxBars, false, true);
									setBars(historyChunkStoreRef.current.toSnapshot().bars);
								});
							}

							if (cacheRead.missingRanges.length > 0) {
								for (const missing of cacheRead.missingRanges) {
									const safeBeforeTs = Math.min(missing.toTs, Date.now());
									let olderBars: readonly any[] = [];
									try {
										olderBars = await (chartId !== undefined
											? effectiveAdapter.fetchBarsBefore(
												activeSymbol,
												activeTimeframe,
												new Date(safeBeforeTs),
												chunkBarsRef.current,
												chartId,
											)
											: effectiveAdapter.fetchBarsBefore(
												activeSymbol,
												activeTimeframe,
												new Date(safeBeforeTs),
												chunkBarsRef.current,
											)
										) ?? [];
									} catch (fetchError: any) {
										if (fetchError?.name === "AbortError" || controller.signal.aborted) {
											return;
										}
										console.error("Failed to fetch older bars:", fetchError);
										break;
									}

									if (!isHistorySessionRequestCurrent(requestKey, sessionRevision, controller.signal)) {
										return;
									}

									const backwardCoverage = (chartId !== undefined
										? adapter.getLastBackfillCoverage?.(activeSymbol, activeTimeframe, chartId)
										: adapter.getLastBackfillCoverage?.(activeSymbol, activeTimeframe)
									) ?? null;
									const backwardBoundaryStopTs = backwardCoverage?.reduce<number | null>((currentValue, fragment) => {
										if (fragment.status !== "unresolved" || fragment.reason !== "boundary-exhausted") {
											return currentValue;
										}
										return currentValue === null ? fragment.toTs : Math.min(currentValue, fragment.toTs);
									}, null) ?? null;
									const boundaryExhaustedByCoverage = backwardCoverage !== null && backwardCoverage.some((fragment) => (
										fragment.status === "unresolved"
										&& fragment.reason === "boundary-exhausted"
										&& fragment.toTs <= beforeTimestamp
									));
									const hasOlderBars = olderBars.some((bar) => bar.date.getTime() < missing.toTs);

									if (!hasOlderBars) {
										consecutiveEmptyBackfillRef.current += 1;
										const shouldLock = consecutiveEmptyBackfillRef.current >= EMPTY_BACKFILL_LOCK_THRESHOLD;
										if (shouldLock) {
											historyBackfillBeforeRef.current = backwardBoundaryStopTs ?? beforeTimestamp;
										}
										traceForkRange(shouldLock ? "left-boundary-exhausted" : "left-boundary-open", {
											beforeTimestamp,
											missingRange: missing,
											olderBarsLength: olderBars.length,
											backwardCoverage,
											backwardBoundaryStopTs,
											consecutiveEmptyCount: consecutiveEmptyBackfillRef.current,
										});
									} else {
										await runHistoryMergeLane(() => {
											if (!isHistorySessionRequestCurrent(requestKey, sessionRevision, controller.signal)) {
												return;
											}

											totalBarsFetchedRef.current += olderBars.length;
											const barsToMerge = finalityMergeOpts
												? filterBarsForFinalityMerge(olderBars, historyChunkStoreRef.current.toSnapshot().bars, finalityMergeOpts)
												: olderBars;
											const prependPatch = historyChunkStoreRef.current.prepend(barsToMerge);

											// Update live edge after prepend (tail doesn't change, but keep ref current)
											const snapshot = historyChunkStoreRef.current.toSnapshot();
											if (snapshot.bars.length > 0 && liveEdgeMsRef.current === null) {
												liveEdgeMsRef.current = snapshot.bars[snapshot.bars.length - 1].date.getTime();
											}

											// CRITICAL: Use detectionEdgeMs (Date.now()) for resident target
											let resolvedResidentTarget = computeResidentTarget(
												{ startMs: adjustedVisibleStartMs, endMs: adjustedVisibleEndMs },
												visibleSpanMs,
												visibleBarCount,
												sourceSemantics,
												retentionFactorRef.current,
												detectionEdgeMs,
											);
											resolvedResidentTarget = {
												...resolvedResidentTarget,
												endMs: Math.max(resolvedResidentTarget.endMs, detectionEdgeMs),
											};
											if (liveEdgeMsRef.current !== null && adjustedVisibleEndMs < liveEdgeMsRef.current) {
												resolvedResidentTarget = {
													...resolvedResidentTarget,
													endMs: Math.max(resolvedResidentTarget.endMs, liveEdgeMsRef.current),
												};
											}
											historyChunkStoreRef.current.trimToWindow(computeTrimWindow(resolvedResidentTarget), residentMaxBars, false, true);

											pendingHistoryPatchRef.current = {
												kind: "prepend",
												snapshot: historyChunkStoreRef.current.toSnapshot() as unknown as EngineHistorySnapshot,
												prependedCount: prependPatch.prependedCount,
												appendedCount: 0,
												trimmedFromHead: prependPatch.trimmedFromHead,
												trimmedFromTail: prependPatch.trimmedFromTail,
											};
											setBars(historyChunkStoreRef.current.toSnapshot().bars);
										});

										consecutiveEmptyBackfillRef.current = 0;
										// Boundary lock chỉ nên fire cho empty result (xử lý bởi EMPTY_BACKFILL_LOCK_THRESHOLD),
										// không lock trên successful fetch — nếu không pan tiếp theo sẽ bị skip
										// vì historyBackfillBeforeRef === loaded.startMs === segment.to.
										historyBackfillBeforeRef.current = null;
										traceForkRange(boundaryExhaustedByCoverage ? "left-boundary-exhausted" : "left-boundary-open", {
											beforeTimestamp,
											missingRange: missing,
											olderBarsLength: olderBars.length,
											backwardCoverage,
											backwardBoundaryStopTs,
										});

										try {
											if (!isTestEnv && !(olderBars as any).isFallback) { // ARC-1-keep: legacy bridge
												await cacheMatrixRef.current.writePatch(activeCacheKey, olderBars, {
													requestId: `fill-before-${Date.now()}`,
													sessionRevision,
													reason: "remote-fill",
													semanticScope: activeCacheSemanticScope,
												});
											}
										} catch (cacheError) {
											console.error("Failed to write backfill bars to cache:", cacheError);
										}
									}
								}
							}
						} finally {
							abortControllersRef.current.delete(controllerKey);
							activeRequestsRef.current.delete(requestPromise);
							syncHistoryBusyState();
							if (
								!controller.signal.aborted &&
								activeHistoryRequestKeyRef.current === requestKey &&
								activeHistorySessionRevisionRef.current === sessionRevision
							) {
								const latestDomain = visibleDomainRef.current ?? visibleDomain;
								void reconcileVisibleHistoryWindow(latestDomain);
							}
						}
					})();

					activeRequestsRef.current.add(requestPromise);
					syncHistoryBusyState();
					promises.push(requestPromise);
				}
			} else {
				const afterTimestamp = segment.from;
				if (afterTimestamp && historyForwardAfterRef.current !== afterTimestamp) {
					requestPromise = (async () => {
						try {
							const targetRange = { fromTs: afterTimestamp, toTs: segment.to! };
							const cacheRead = isTestEnv
								? { bars: [], missingRanges: [targetRange] }
								: await cacheMatrixRef.current.readRanges(activeCacheKey, [targetRange], activeCacheSemanticScope);

							if (!isHistorySessionRequestCurrent(requestKey, sessionRevision, controller.signal)) {
								return;
							}

							if (cacheRead.bars.length > 0) {
								await runHistoryMergeLane(() => {
									if (!isHistorySessionRequestCurrent(requestKey, sessionRevision, controller.signal)) {
										return;
									}

									historyChunkStoreRef.current.append(cacheRead.bars);
									// Update live edge after cache append
									const snapshot = historyChunkStoreRef.current.toSnapshot();
									if (snapshot.bars.length > 0) {
										liveEdgeMsRef.current = snapshot.bars[snapshot.bars.length - 1].date.getTime();
									}
									// CRITICAL: Use detectionEdgeMs (Date.now()) for resident target
									let resolvedResidentTarget = computeResidentTarget(
										{ startMs: adjustedVisibleStartMs, endMs: adjustedVisibleEndMs },
										visibleSpanMs,
										visibleBarCount,
										sourceSemantics,
										retentionFactorRef.current,
										detectionEdgeMs,
									);
									resolvedResidentTarget = {
										...resolvedResidentTarget,
										endMs: Math.max(resolvedResidentTarget.endMs, detectionEdgeMs),
									};
									if (liveEdgeMsRef.current !== null && adjustedVisibleEndMs < liveEdgeMsRef.current) {
										resolvedResidentTarget = {
											...resolvedResidentTarget,
											endMs: Math.max(resolvedResidentTarget.endMs, liveEdgeMsRef.current),
										};
									}
									historyChunkStoreRef.current.trimToWindow(computeTrimWindow(resolvedResidentTarget), residentMaxBars, true, false);
									setBars(historyChunkStoreRef.current.toSnapshot().bars);
								});
							}

							if (cacheRead.missingRanges.length > 0) {
								for (const missing of cacheRead.missingRanges) {
									const safeToTs = Math.min(missing.toTs, Date.now());
									let newerBars: readonly any[] = [];
									try {
										newerBars = await (chartId !== undefined
											? effectiveAdapter.fetchBarsInRange(
												activeSymbol,
												activeTimeframe,
												new Date(missing.fromTs),
												new Date(safeToTs),
												chartId,
											)
											: effectiveAdapter.fetchBarsInRange(
												activeSymbol,
												activeTimeframe,
												new Date(missing.fromTs),
												new Date(safeToTs),
											)
										) ?? [];
									} catch (fetchError: any) {
										if (fetchError?.name === "AbortError" || controller.signal.aborted) {
											return;
										}
										console.error("Failed to fetch newer bars:", fetchError);
										break;
									}

									if (!isHistorySessionRequestCurrent(requestKey, sessionRevision, controller.signal)) {
										return;
									}

									const rangeCoverage = (chartId !== undefined
										? adapter.getLastRangeCoverage?.(activeSymbol, activeTimeframe, chartId)
										: adapter.getLastRangeCoverage?.(activeSymbol, activeTimeframe)
									) ?? null;
									const rangeBoundaryStopTs = rangeCoverage?.reduce<number | null>((currentValue, fragment) => {
										if (fragment.status !== "unresolved" || fragment.reason !== "boundary-exhausted") {
											return currentValue;
										}
										return currentValue === null ? fragment.fromTs : Math.max(currentValue, fragment.fromTs);
									}, null) ?? null;
									const boundaryExhaustedByCoverage = rangeCoverage !== null && rangeCoverage.some((fragment) => (
										fragment.status === "unresolved"
										&& fragment.reason === "boundary-exhausted"
										&& fragment.toTs >= missing.toTs
									));
									const hasNewerBars = newerBars.some((bar) => bar.date.getTime() > missing.fromTs);

									if (!hasNewerBars) {
										historyForwardAfterRef.current = rangeBoundaryStopTs ?? afterTimestamp;
										traceForkRange("right-boundary-exhausted", {
											afterTimestamp,
											missingRange: missing,
											newerBarsLength: newerBars.length,
											rangeCoverage,
											rangeBoundaryStopTs,
										});
										continue;
									}

									await runHistoryMergeLane(() => {
										if (!isHistorySessionRequestCurrent(requestKey, sessionRevision, controller.signal)) {
											return;
										}

										totalBarsFetchedRef.current += newerBars.length;
										const newerBarsToMerge = finalityMergeOpts
											? filterBarsForFinalityMerge(newerBars, historyChunkStoreRef.current.toSnapshot().bars, finalityMergeOpts)
											: newerBars;
										const appendPatch = historyChunkStoreRef.current.append(newerBarsToMerge);

										// Update live edge so next backfill cycle uses correct timestamp
										const snapshot = historyChunkStoreRef.current.toSnapshot();
										if (snapshot.bars.length > 0) {
											liveEdgeMsRef.current = snapshot.bars[snapshot.bars.length - 1].date.getTime();
										}

										// CRITICAL: Use detectionEdgeMs (Date.now()) for resident target so
										// the trim window extends to current date and never removes bars
										// from the right edge during zoom cycles.
										let resolvedResidentTarget = computeResidentTarget(
											{ startMs: adjustedVisibleStartMs, endMs: adjustedVisibleEndMs },
											visibleSpanMs,
											visibleBarCount,
											sourceSemantics,
											retentionFactorRef.current,
											detectionEdgeMs,
										);
										resolvedResidentTarget = {
											...resolvedResidentTarget,
											endMs: Math.max(resolvedResidentTarget.endMs, detectionEdgeMs),
										};
										if (liveEdgeMsRef.current !== null && adjustedVisibleEndMs < liveEdgeMsRef.current) {
											resolvedResidentTarget = {
												...resolvedResidentTarget,
												endMs: Math.max(resolvedResidentTarget.endMs, liveEdgeMsRef.current),
											};
										}
										historyChunkStoreRef.current.trimToWindow(computeTrimWindow(resolvedResidentTarget), residentMaxBars, true, false);

										pendingHistoryPatchRef.current = {
											kind: "append",
											snapshot: historyChunkStoreRef.current.toSnapshot() as unknown as EngineHistorySnapshot,
											prependedCount: 0,
											appendedCount: appendPatch.appendedCount,
											trimmedFromHead: appendPatch.trimmedFromHead,
											trimmedFromTail: appendPatch.trimmedFromTail,
										};
										setBars(historyChunkStoreRef.current.toSnapshot().bars);
									});

									// Same rationale as left-side: forward lock chỉ fire cho empty result,
									// không lock trên successful fetch.
									historyForwardAfterRef.current = null;
									traceForkRange(boundaryExhaustedByCoverage ? "right-boundary-exhausted" : "right-boundary-open", {
										afterTimestamp,
										missingRange: missing,
										newerBarsLength: newerBars.length,
										rangeCoverage,
										rangeBoundaryStopTs,
									});

									try {
										if (!isTestEnv && !(newerBars as any).isFallback) { // ARC-1-keep: legacy bridge
											await cacheMatrixRef.current.writePatch(activeCacheKey, newerBars, {
												requestId: `fill-range-${Date.now()}`,
												sessionRevision,
												reason: "remote-fill",
												semanticScope: activeCacheSemanticScope,
											});
										}
									} catch (cacheError) {
										console.error("Failed to write forward bars to cache:", cacheError);
									}
								}
							}
						} finally {
							abortControllersRef.current.delete(controllerKey);
							activeRequestsRef.current.delete(requestPromise);
							syncHistoryBusyState();
							if (
								!controller.signal.aborted &&
								activeHistoryRequestKeyRef.current === requestKey &&
								activeHistorySessionRevisionRef.current === sessionRevision
							) {
								const latestDomain = visibleDomainRef.current ?? visibleDomain;
								void reconcileVisibleHistoryWindow(latestDomain);
							}
						}
					})();

					activeRequestsRef.current.add(requestPromise);
					syncHistoryBusyState();
					promises.push(requestPromise);
				}
			}
		}
	}, [
		activeSymbol,
		activeTimeframe,
		activeCacheSemanticScope,
		activeSourceSemantics,
		adapter,
		loading,
		forkVisibleRange,
		syncHistoryBusyState,
		isHistorySessionRequestCurrent,
		runHistoryMergeLane,
	]);

	const queueVisibleHistoryWindowSync = useCallback((visibleDomain: [Date, Date], force = false) => {
		const isSameAsLastQueued = lastQueuedVisibleDomainRef.current !== null
			&& areVisibleDomainsEqual(lastQueuedVisibleDomainRef.current, visibleDomain);
		if (historyWindowSyncInFlightRef.current) {
			if (
				!force
				&& isSameAsLastQueued
				&& pendingVisibleDomainRef.current !== null
				&& areVisibleDomainsEqual(pendingVisibleDomainRef.current, visibleDomain)
			) {
				return;
			}

			lastQueuedVisibleDomainRef.current = visibleDomain;
			pendingVisibleDomainRef.current = visibleDomain;
			return;
		}
		if (!force && isSameAsLastQueued) {
			return;
		}


		lastQueuedVisibleDomainRef.current = visibleDomain;
		pendingVisibleDomainRef.current = visibleDomain;

		historyWindowSyncInFlightRef.current = true;
		syncHistoryBusyState();

		const runSync = () => {
			void (async () => {
				try {
					const nextVisibleDomain = pendingVisibleDomainRef.current;
					pendingVisibleDomainRef.current = null;
					if (nextVisibleDomain) {
						await reconcileVisibleHistoryWindow(nextVisibleDomain);
					}
				} finally {
					historyWindowSyncInFlightRef.current = false;
					syncHistoryBusyState();
					const queuedVisibleDomain = pendingVisibleDomainRef.current;
					if (queuedVisibleDomain) {
						pendingVisibleDomainRef.current = null;
						queueVisibleHistoryWindowSync(queuedVisibleDomain, true);
					}
				}
			})();
		};

		if (isTestEnv || debounceMsRef.current <= 0) {
			runSync();
		} else {
			setTimeout(runSync, debounceMsRef.current);
		}
	}, [reconcileVisibleHistoryWindow, syncHistoryBusyState]);

	const requestVisibleHistoryWindowSync = useCallback((
		visibleDomain: [Date, Date],
		options?: {
			force?: boolean;
			updateVisibleDomainRef?: boolean;
		},
	) => {
		const { force = false, updateVisibleDomainRef = false } = options ?? {};
		if (updateVisibleDomainRef) {
			visibleDomainRef.current = visibleDomain;
		}

		if (isControlledHistorySession) {
			return false;
		}

		queueVisibleHistoryWindowSync(visibleDomain, force);
		return true;
	}, [isControlledHistorySession, queueVisibleHistoryWindowSync]);

	const totalBarsFetchedRef = useRef(0);

	return {
		reconcileVisibleHistoryWindow,
		queueVisibleHistoryWindowSync,
		requestVisibleHistoryWindowSync,
		totalBarsFetchedRef,
	};
}
