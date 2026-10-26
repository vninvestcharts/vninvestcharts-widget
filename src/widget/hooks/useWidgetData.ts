import { useState, useEffect, useMemo, useRef, useCallback, useContext } from "react";
import { DataProviderContext } from "../context/DataProviderContext";
import { DataProviderAdapterWrapper } from "../adapters/DataProviderAdapterWrapper";
import { type EngineInstance, type EngineHistoryPatch, type EngineHistorySnapshot, type VisibleRange as EngineVisibleRange } from "@vninvestcharts/engine-core";
import { type StockDataAdapter, type Timeframe } from "../../lib/types/adapter";
import { ContinuousFuturesStockDataAdapter } from "../adapters/ContinuousFuturesStockDataAdapter";
import { type OHLCVBar } from "../../lib/types/ohlcv";
import { type EnrichedDatum, type VolumeProfileData } from "../../lib/core/calculators/types";
import { type WhaleOrder } from "../../lib/types/vninvest";
import { type WidgetPaneRuntimeSnapshot, type WidgetHistorySessionMode, type WidgetHistorySessionState, isWidgetTestEnvironment, HISTORY_MIN_RESIDENT_BARS, resolveVisiblePanes, HISTORY_BACKFILL_PAGE_LIMIT, FALLBACK_ADAPTER } from "../utils/widgetHelpers";
import { enrichDataWithCanonicalStore } from "../../lib/core/calculators/enrichDataWithCanonicalStore";
import { buildIndicatorSeriesKey } from "../../lib/core/seriesValueResolver";
import { createCanonicalSeriesStore } from "@vninvestcharts/engine-core";
import { applyCanaryFilter } from "../canaryBarFiltering";
import { resolveCanaryLevel, type CanaryMetrics, makeCanaryGateRecommendation, formatCanaryMetrics, type CanaryLevel } from "../CanaryRolloutConfig";
import { type RollbackSnapshot, type RollbackEvent, validateRollbackSafety, formatRollbackEvent } from "../CanaryRollbackHelper";
import { resolveBackfillWorkerFlags } from "../BackfillWorkerFlags";
import { useExternalBarsNormalization } from "../history/useExternalBarsNormalization";
import { buildExternalDataValidationError } from "../history/externalBarsNormalization";
import { createHistoryChunkStore } from "../history/chunkStore";
import { hashEnrichedData } from "../utils/enrichedHash";
import { toWidgetError, withRetry } from "../utils/widgetErrors";
import { computeProgressiveHTFData, mapWhaleEventsToBars, useAsyncVolumeProfiles } from "./useWidgetDataEnrichment";
import { createHookLogger } from "../../lib/utils/logger";

const log = createHookLogger("useWidgetData");
import { createSingleWriterLane } from "../history/singleWriterLane";
import { toCacheKey, toCacheSemanticScope, LocalCacheMatrixFactoryImpl } from "../history/cache";
import { buildHistorySessionRequestKey, buildSourceRevisionKey } from "../history/sessionGuards";
import { mergeBarPagesByDate, resolveInitialFetchWindow, resolveTimeframeMs } from "../history/historyDataUtils";
import { computeResidentTarget, computeTrimWindow, resolveResidentRetentionFactor } from "../history/historyWindowPlanner";
import { useWidgetDataBackfill } from "./useWidgetDataBackfill";
import { computeAdaptiveInflightControllerState } from "../history/inflightController";
import { useRequestCoordinator } from "../history/RequestCoordinator";
import { useSharedBarStoreSubscription, useSharedBarStore } from "../history/BackfillDedupContext";
import { areVisibleDomainsEqual, areEngineVisibleRangesEqual } from "../visibleRangeDiagnostics";
import { resolveOverflowHistoryQueueState } from "../visibleRangePolicies";
import { normalizeVisibleRangeForEngine, resolveForkVisibleRangeFromDateExtents, asTimeValue, normalizeForkVisibleRange } from "../visibleRangeBridge";

export interface UseWidgetDataProps {
	/**
	 * 1.3b: ordered list of Pine series types currently on the chart ("" when there is none).
	 * `hashEnrichedData` below hashes date/OHLCV only, so it cannot see `indicatorValues`; without
	 * this signal, adding or removing a Pine script leaves the engine holding a stale enriched
	 * array even though React state has the new values.
	 */
	pineSeriesSignature?: string;
	/**
	 * Bumped by `usePineScriptRestore` when saved Pine scripts have actually been registered.
	 *
	 * Restore is asynchronous (the registry is behind a dynamic import), so it can finish AFTER
	 * the first enrichment pass. That pass computes indicator values through
	 * `computeIndicatorComputationResult.ts:193`, where a `getPinePlugin` miss falls through to
	 * `materializeIndicatorValues` and yields `undefined` for every pine series — and the result
	 * is then cached in `canonicalStore` under a `transformKey` that carries no registry state.
	 * Merely re-running the memo would therefore re-read the poisoned cache. Threading this
	 * counter into the store's deps makes the store itself be recreated, which is the
	 * invalidation mechanism: `canonicalStore` is a `useMemo` over `[symbol, timeframe]`, so a
	 * new version identity produces a fresh, empty store and `enrichedData` (which depends on it)
	 * recomputes against the now-populated plugin registry.
	 */
	pineRestoreVersion?: number;
	data?: readonly OHLCVBar[] | null;
	symbol?: string;
	timeframe?: Timeframe;
	canaryLevel?: CanaryLevel;
	backfillWorkerFlags?: any;
	localCacheRoot?: string;
	onBarsChange?: (bars: readonly OHLCVBar[]) => void;
	onHistorySyncBusyChange?: (busy: boolean) => void;
	onCanaryGateDecision?: (decision: any) => void;
	onCanaryRollbackEvent?: (event: any) => void;
	enableWhale?: boolean;
	whaleOrders?: readonly WhaleOrder[] | null;
	historyMinResidentBars?: number;

	useForkRuntime?: boolean;
	engineInstanceRef: React.RefObject<EngineInstance | null>;
	forkEngineInstance?: EngineInstance | null;
	forkVisibleRangeRef: React.MutableRefObject<EngineVisibleRange | null>;
	forkVisibleRange: EngineVisibleRange | null;
	setForkVisibleRange: React.Dispatch<React.SetStateAction<EngineVisibleRange | null>>;
	incrementSnapshotRevision: () => void;
	emitCoordinateBridge: (snapshots: readonly WidgetPaneRuntimeSnapshot[], range: EngineVisibleRange) => void;
	forkPaneSnapshotsRef: React.MutableRefObject<readonly WidgetPaneRuntimeSnapshot[]>;
	paneSnapshots: readonly WidgetPaneRuntimeSnapshot[];
	panes?: readonly any[];
	adapter?: StockDataAdapter;
	onVisibleRangeChange?: (range: any) => void;
	onVisibleDomainChange?: (domain: [Date, Date]) => void;
	controlledXExtents?: readonly [Date | number, Date | number];
	initialXExtents?: readonly [Date | number, Date | number];
	sharedPlotDataRef?: React.MutableRefObject<readonly EnrichedDatum[]>;
	authHandler?: any;
	pendingForkVisibleRangeRef: React.MutableRefObject<EngineVisibleRange | null>;
	pendingForkVisibleRangeRafRef: React.MutableRefObject<number | null>;
	lastStableForkSpanRef: React.MutableRefObject<number | null>;
	pendingHistoryPatchRef: React.MutableRefObject<any>;
	pendingSyncTimeRangeRef?: React.MutableRefObject<{ from: number, to: number } | null>;
	overlayTimeframe?: string;
	searchParams?: URLSearchParams;
	id?: string;
	isActiveChart?: boolean;
	// When replay is active the VNInvestCharts fork camera effect is the sole
	// data feed (it pushes the replay slice). Suppress this full-dataset feed
	// during replay so the engine never draws the full data on a separate
	// animation frame — that interleaving causes the per-tick full-chart flash.
	replayActiveRef?: React.MutableRefObject<boolean>;
}

export function useWidgetData({
	pineSeriesSignature = "",
	pineRestoreVersion = 0,
	data,
	symbol,
	timeframe,
	canaryLevel,
	backfillWorkerFlags,
	localCacheRoot,
	onBarsChange,
	onHistorySyncBusyChange,
	onCanaryGateDecision,
	onCanaryRollbackEvent,
	enableWhale = false,
	whaleOrders,
	historyMinResidentBars,

	useForkRuntime = false,
	engineInstanceRef,
	forkEngineInstance,
	forkVisibleRangeRef,
	forkVisibleRange,
	setForkVisibleRange,
	incrementSnapshotRevision,
	emitCoordinateBridge,
	forkPaneSnapshotsRef,
	paneSnapshots,
	panes,
	adapter,
	onVisibleRangeChange,
	onVisibleDomainChange,
	controlledXExtents,
	initialXExtents,
	sharedPlotDataRef,
	authHandler,
	pendingForkVisibleRangeRef,
	pendingForkVisibleRangeRafRef,
	lastStableForkSpanRef,
	pendingHistoryPatchRef,
	pendingSyncTimeRangeRef,
	overlayTimeframe,
	searchParams,
	id,
	isActiveChart,
	replayActiveRef,
}: UseWidgetDataProps) {
	const hasExternalData = Array.isArray(data);
	const resolvedBackfillWorkerFlags = useMemo(() => resolveBackfillWorkerFlags(backfillWorkerFlags, searchParams), [backfillWorkerFlags, searchParams]);

	const provider = useContext(DataProviderContext);
	const effectiveAdapter = useMemo(() => {
		if (provider) {
			return new DataProviderAdapterWrapper(provider);
		}
		return adapter ?? FALLBACK_ADAPTER;
	}, [provider, adapter]);

	const activeAdapter = useMemo(() => {
		if (symbol && (symbol === "VN30F1M" || symbol === "VN30F3M")) {
			return new ContinuousFuturesStockDataAdapter(symbol, effectiveAdapter);
		}
		return effectiveAdapter;
	}, [symbol, effectiveAdapter]);

	const coordinator = useRequestCoordinator();

	/**
	 * DATA-03: stable cache namespace for an adapter instance.
	 * Uses the class name plus a non-secret base/apiBase so two adapters that
	 * differ only by tenant or endpoint never collide. Raw PAT is never read.
	 */
	const getAdapterScope = useCallback((adapter: StockDataAdapter): string => {
		const ctor = (adapter as { constructor?: { name?: string } })?.constructor?.name || "Adapter";
		const withBase = adapter as StockDataAdapter & { apiBase?: string; getBase?: () => string };
		let base = "";
		try {
			base = withBase.apiBase || withBase.getBase?.() || "";
		} catch {
			base = "";
		}
		// Strip credentials/query so the key can never carry a token.
		const safeBase = base.replace(/\/\/[^/@]*@/, "//").replace(/[?#].*$/, "").replace(/\/+$/, "");
		return `${ctor}@${safeBase}`;
	}, []);

	const coordinatedFetch = useCallback((
		fetchSymbol: string,
		fetchTf: string,
		fetchFrom: Date,
		fetchTo: Date,
		fetchCallerId?: string,
		priority: number = 10,
		fetchSignal?: AbortSignal,
	): Promise<readonly OHLCVBar[]> => {
		const callerId = fetchCallerId || fetchSymbol;
		// BL-10: single choke point — retryable failures (fetch/timeout) retry
		// with backoff; auth/validation fail fast; abort never retries.
		// Test env uses zero-delay backoff (microtask-resolved): contract tests
		// flush microtasks only, so production-scale timers would stall error
		// surfacing under test. Retry BEHAVIOR (attempts/fail-fast) is locked
		// by widgetErrors tests.
		const testEnv = isWidgetTestEnvironment();
		// DATA-03: a stable, non-secret identifier of the data source so the
		// coordinator never shares cache / in-flight dedup across two adapters
		// (e.g. two tenants in the same browser).
		const adapterScope = getAdapterScope(activeAdapter);
		return withRetry(
			() => coordinator.enqueue<readonly OHLCVBar[]>(
				(s) => activeAdapter.fetchBarsInRange(fetchSymbol, fetchTf, fetchFrom, fetchTo, callerId, s),
				{ symbol: fetchSymbol, timeframe: fetchTf, from: fetchFrom, to: fetchTo, chartId: callerId, scope: adapterScope },
				priority,
				callerId,
				fetchSignal,
			).catch((error: unknown) => {
				throw toWidgetError(error, "DATA_FETCH");
			}),
			{ attempts: 3, baseMs: testEnv ? 0 : 400, maxMs: testEnv ? 0 : 4000, signal: fetchSignal },
		);
	}, [activeAdapter, coordinator]);

	useEffect(() => {
		if (effectiveAdapter && typeof (effectiveAdapter as any).setAuthHandler === "function" && authHandler) { // ARC-1-keep: legacy bridge
			(effectiveAdapter as any).setAuthHandler(authHandler); // ARC-1-keep: legacy bridge
		}
	}, [effectiveAdapter, authHandler]);
	const { result: normalizedExternalBars, pending: externalBarsNormalizationPending } = useExternalBarsNormalization(data ?? undefined, hasExternalData, resolvedBackfillWorkerFlags.enableExternalBarsNormalizationWorker);
	const historySessionMode: WidgetHistorySessionMode = hasExternalData ? "controlled" : "uncontrolled";

	const [bars, _setBars] = useState<readonly OHLCVBar[]>(normalizedExternalBars.bars);
	const setBars: React.Dispatch<React.SetStateAction<readonly OHLCVBar[]>> = useCallback((next) => {
		if (typeof next === "function") {
			_setBars(next);
			return;
		}
		if (next.length > 5000) {
			// Large bar set — log is intentionally omitted to avoid console noise
		}
		_setBars(next);
	}, []);
	const [loading, setLoading] = useState(() => !hasExternalData || externalBarsNormalizationPending);
	const [error, setError] = useState<Error | null>(() => externalBarsNormalizationPending ? null : buildExternalDataValidationError(normalizedExternalBars));
	// UX-05: user-facing recovery. The error state tells the user to retry, so
	// it must be able to. Bumping this re-runs the existing initial-load effect
	// (same abort controller + history session machinery as the first load)
	// rather than inventing a second load path. In `controlled` history mode
	// data is owned by the host, so there is nothing to reload here.
	const [reloadNonce, setReloadNonce] = useState(0);
	const reload = useCallback(() => setReloadNonce((n) => n + 1), []);

	const resolvedCanaryLevel = useMemo(() => resolveCanaryLevel({ canaryLevel }), [canaryLevel]);
	const canaryFilteredBars = useMemo(() => applyCanaryFilter(bars, resolvedCanaryLevel), [bars, resolvedCanaryLevel]);
	const prevCanaryLevelRef = useRef<10 | 30 | 100>(resolvedCanaryLevel);

	// Phase 0: PerformanceObserver for FCP
	const fcpObserverStartedRef = useRef(false);
	useEffect(() => {
		if (typeof PerformanceObserver === 'undefined' || fcpObserverStartedRef.current) return;
		fcpObserverStartedRef.current = true;
		const paintObserver = new PerformanceObserver(list => {
			for (const entry of list.getEntries()) {
				if (entry.name === 'first-contentful-paint') {
					const sid = window.__INST_SESSION_ID; // typed via windowAugmentation.d.ts

					paintObserver.disconnect();
				}
			}
		});
		paintObserver.observe({ type: 'paint', buffered: true });
		return () => { paintObserver.disconnect(); fcpObserverStartedRef.current = false; };
	}, []);

	useEffect(() => {
		const previousLevel = prevCanaryLevelRef.current;
		if (previousLevel !== resolvedCanaryLevel && onCanaryGateDecision) {
			const metrics: CanaryMetrics = {
				visibleBarsTotal: bars.length,
				visibleBarsAfterFilter: canaryFilteredBars.length,
				canaryPercentage: resolvedCanaryLevel,
				workersActive: {
					externalBarsWorker: resolvedBackfillWorkerFlags.enableExternalBarsNormalizationWorker,
					lodWorker: resolvedBackfillWorkerFlags.enableCandlestickLodWorker,
				},
				timestamp: Date.now(),
			};

			const { recommendation, reason } = makeCanaryGateRecommendation(metrics);

			onCanaryGateDecision({
				previousLevel,
				currentLevel: resolvedCanaryLevel,
				metrics: {
					visibleBarsTotal: metrics.visibleBarsTotal,
					visibleBarsAfterFilter: metrics.visibleBarsAfterFilter,
					workersActive: metrics.workersActive,
				},
				recommendation,
				reason,
			});

		// (Canary Gate decision logged via onCanaryGateDecision callback)
		}
	}, [resolvedCanaryLevel, bars.length, canaryFilteredBars.length, resolvedBackfillWorkerFlags, onCanaryGateDecision]);

	// Canary Rollback Detection
	const prevCanaryMetricsRef = useRef<RollbackSnapshot | null>(null);
	useEffect(() => {
		const previousLevel = prevCanaryLevelRef.current;
		const isRollingBack = resolvedCanaryLevel < previousLevel;

		if (isRollingBack && onCanaryRollbackEvent) {
			const beforeMetrics: RollbackSnapshot = prevCanaryMetricsRef.current || {
				level: previousLevel,
				barCount: bars.length,
				workersActive: {
					externalBarsWorker: resolvedBackfillWorkerFlags.enableExternalBarsNormalizationWorker,
					lodWorker: resolvedBackfillWorkerFlags.enableCandlestickLodWorker,
				},
				timestamp: Date.now(),
			};

			const afterMetrics: RollbackSnapshot = {
				level: resolvedCanaryLevel,
				barCount: canaryFilteredBars.length,
				workersActive: {
					externalBarsWorker: resolvedBackfillWorkerFlags.enableExternalBarsNormalizationWorker,
					lodWorker: resolvedBackfillWorkerFlags.enableCandlestickLodWorker,
				},
				timestamp: Date.now(),
			};

			const validation = validateRollbackSafety(beforeMetrics, afterMetrics);
			const severity = validation.safe
				? (previousLevel === 100 ? "INFO" : "HIGH")
				: "CRITICAL";

			const rollbackEvent: RollbackEvent = {
				previousLevel,
				newLevel: resolvedCanaryLevel,
				beforeMetrics,
				afterMetrics,
				validation,
				severity,
				timestamp: Date.now(),
			};

			onCanaryRollbackEvent(rollbackEvent);

		// (Rollback event logged via onCanaryRollbackEvent callback)
		}

		prevCanaryMetricsRef.current = {
			level: resolvedCanaryLevel,
			barCount: canaryFilteredBars.length,
			workersActive: {
				externalBarsWorker: resolvedBackfillWorkerFlags.enableExternalBarsNormalizationWorker,
				lodWorker: resolvedBackfillWorkerFlags.enableCandlestickLodWorker,
			},
			timestamp: Date.now(),
		};
		prevCanaryLevelRef.current = resolvedCanaryLevel;
	}, [resolvedCanaryLevel, canaryFilteredBars.length, resolvedBackfillWorkerFlags, onCanaryRollbackEvent]);

	// History Sync Refs & State
	const visibleDomainRef = useRef<[Date, Date] | null>(null);
	const lastQueuedVisibleDomainRef = useRef<[Date, Date] | null>(null);
	const lastQueuedOverflowHistoryKeyRef = useRef<string | null>(null);
	const lastAppliedForkControlledExtentsKeyRef = useRef<string | null>(null);
	const lastAppliedInitialExtentsKeyRef = useRef<string | null>(null);
	const historyWindowSyncInFlightRef = useRef(false);
	const pendingVisibleDomainRef = useRef<[Date, Date] | null>(null);
	const historyBackfillBeforeRef = useRef<number | null>(null);
	const historyForwardAfterRef = useRef<number | null>(null);
	const consecutiveEmptyBackfillRef = useRef<number>(0);
	const EMPTY_BACKFILL_LOCK_THRESHOLD = 3;
	// pendingHistoryPatchRef passed from props
	const activeHistoryRequestKeyRef = useRef("");
	const activeHistorySessionRevisionRef = useRef(0);
	const isTestEnv = isWidgetTestEnvironment();

	const historySessionRef = useRef<WidgetHistorySessionState>({
		requestKey: "",
		mode: historySessionMode,
		revision: 0,
	});

	// Phase 3: refs for history store/lane (fallback to local store if no shared provider)
	const historyChunkStoreRef = useRef(createHistoryChunkStore());
	const historyMergeLaneRef = useRef(createSingleWriterLane());

	// EXPERIMENT TOGGLE: when false, the persistent IndexedDB cache is fully bypassed
	// so every load fetches fresh from the network (used to verify correctness without cache).
	const USE_PERSISTENT_CACHE = false;
	const cacheMatrixRef = useRef(new LocalCacheMatrixFactoryImpl().create(localCacheRoot ?? "local-cache-root"));
	const liveEdgeMsRef = useRef<number | null>(null);
	const prevVisibleSpanMsRef = useRef<number | null>(null);
	const prevVisibleStartMsRef = useRef<number | null>(null);
	const isMovingLeftRef = useRef(false);
	const prevBarsRef = useRef<readonly OHLCVBar[]>([]);
	const prevEnrichedDataRef = useRef<readonly EnrichedDatum[]>([]);
	const prevEnrichedHashRef = useRef<string>("");
	const prevPineSignatureRef = useRef<string>("");

	const maxInflightRef = useRef(2);
	const debounceMsRef = useRef(120);
	const chunkBarsRef = useRef(isWidgetTestEnvironment() ? HISTORY_BACKFILL_PAGE_LIMIT : 5000);
	const retentionFactorRef = useRef(3.0);
	const overfetchRatioRef = useRef(0.0);
	const queueDepthRef = useRef(0);

	const lastFrameTimeRef = useRef<number | null>(null);
	const frameTimesRef = useRef<number[]>([]);
	const inflightControllerStateRef = useRef({
		highFrameTimeCount: 0,
		lowFrameTimeCount: 0,
		highOverfetchCount: 0,
	});
	const [forkCameraEnvelopeMode, setForkCameraEnvelopeMode] = useState<"shared" | "extended">("shared");
	// lastStableForkSpanRef, pendingForkVisibleRangeRef, pendingForkVisibleRangeRafRef passed from props
	const onVisibleRangeChangeRef = useRef(onVisibleRangeChange);
	onVisibleRangeChangeRef.current = onVisibleRangeChange;
	const onVisibleDomainChangeRef = useRef(onVisibleDomainChange);
	onVisibleDomainChangeRef.current = onVisibleDomainChange;
	const activeRequestsRef = useRef<Set<Promise<any>>>(new Set());
	const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
	const historySyncBusyRef = useRef(false);

	const emitHistorySyncBusy = useCallback((busy: boolean) => {
		if (historySyncBusyRef.current === busy) {
			return;
		}
		historySyncBusyRef.current = busy;
		onHistorySyncBusyChange?.(busy);
	}, [onHistorySyncBusyChange]);

	const syncHistoryBusyState = useCallback(() => {
		emitHistorySyncBusy(historyWindowSyncInFlightRef.current || activeRequestsRef.current.size > 0);
	}, [emitHistorySyncBusy]);

	const isHistorySessionRequestCurrent = useCallback((requestKey: string, sessionRevision: number, signal?: AbortSignal) => {
		if (signal?.aborted) {
			return false;
		}
		return activeHistoryRequestKeyRef.current === requestKey
			&& activeHistorySessionRevisionRef.current === sessionRevision;
	}, []);

	const runHistoryMergeLane = useCallback(<T, >(writer: () => T | Promise<T>) => {
		return historyMergeLaneRef.current.run(writer);
	}, []);

	const resetHistorySessionControllerRefs = () => {
		visibleDomainRef.current = null;
		lastQueuedVisibleDomainRef.current = null;
		lastQueuedOverflowHistoryKeyRef.current = null;
		lastAppliedForkControlledExtentsKeyRef.current = null;
		lastAppliedInitialExtentsKeyRef.current = null;
		historyWindowSyncInFlightRef.current = false;
		pendingVisibleDomainRef.current = null;
		pendingHistoryPatchRef.current = null;
		historyBackfillBeforeRef.current = null;
		historyForwardAfterRef.current = null;
		consecutiveEmptyBackfillRef.current = 0;
		liveEdgeMsRef.current = null;
		prevVisibleSpanMsRef.current = null;
		prevVisibleStartMsRef.current = null;

		for (const controller of abortControllersRef.current.values()) {
			controller.abort();
		}
		abortControllersRef.current.clear();
		activeRequestsRef.current.clear();
		queueDepthRef.current = 0;
	};

	// Controlled Mode synchronizer
	useEffect(() => {
		if (historySessionMode !== "controlled") {
			return;
		}
		pendingHistoryPatchRef.current = null;
		if (externalBarsNormalizationPending) {
			setLoading(true);
			setError(null);
			return;
		}
		setBars(normalizedExternalBars.bars);
		setError(buildExternalDataValidationError(normalizedExternalBars));
		setLoading(false);
	}, [historySessionMode, normalizedExternalBars, externalBarsNormalizationPending]);

	useEffect(() => {
		onBarsChange?.(bars);
	}, [bars, onBarsChange]);

	const activeSymbol = symbol ?? "BTCUSDT";
	const activeTimeframe = timeframe ?? "1h";

	const adapterLabel = useMemo(() => {
		const candidate = (activeAdapter as unknown as Record<string, unknown>).label;
		return typeof candidate === "string" && candidate.length > 0 ? candidate : "widget-adapter";
	}, [activeAdapter]);

	const activeSourceSemantics = useMemo(() => activeAdapter.getSourceSemantics?.() ?? null, [activeAdapter]);
	const activeCacheSemanticScope = useMemo(
		() => (activeSourceSemantics ? toCacheSemanticScope(activeSourceSemantics) : undefined),
		[activeSourceSemantics],
	);

	const activeCacheKey = useMemo(() => {
		return toCacheKey({
			source: adapterLabel,
			symbol: activeSymbol,
			timeframe: activeTimeframe,
			adjustmentPolicy: "split-adjusted",
			schemaVersion: "v3",
		});
	}, [adapterLabel, activeSymbol, activeTimeframe]);

	// Phase 3: Subscribe to shared bar store for this cache key.
	// Auto-releases on key change/unmount. Wire store/lane to refs used by existing code.
	const sharedStore = useSharedBarStoreSubscription(activeCacheKey, id ?? "single");

	// Phase 6: Shared bar store context for union resident computation
	const sharedBarStore = useSharedBarStore();

	// Wire shared store/lane to refs used by existing code paths
	useEffect(() => {
		if (sharedStore) {
			historyChunkStoreRef.current = sharedStore.store;
			historyMergeLaneRef.current = sharedStore.lane;
		}
	}, [sharedStore]);

	// Phase 6: update shared store resident when visible range changes (pan)
	useEffect(() => {
		if (!sharedBarStore || !visibleDomainRef.current) return;
		sharedBarStore.updateResident(activeCacheKey, id ?? "single", {
			startMs: visibleDomainRef.current[0].getTime(),
			endMs: visibleDomainRef.current[1].getTime(),
		});
	}, [forkVisibleRange, sharedBarStore, activeCacheKey, id]);

	const activeSourceRevisionKey = useMemo(
		() => buildSourceRevisionKey(adapterLabel, activeSourceSemantics),
		[adapterLabel, activeSourceSemantics],
	);

	const activeHistoryRequestKey = useMemo(
		() => buildHistorySessionRequestKey(activeSymbol, activeTimeframe, activeSourceRevisionKey),
		[activeSymbol, activeTimeframe, activeSourceRevisionKey],
	);
	const historySession = historySessionRef.current;
	if (historySession.requestKey !== activeHistoryRequestKey || historySession.mode !== historySessionMode) {
		const nextSession = {
			requestKey: activeHistoryRequestKey,
			mode: historySessionMode,
			revision: historySession.revision + 1,
		};
		historySessionRef.current = nextSession;
		resetHistorySessionControllerRefs();
	}

	const currentHistorySessionRequestKey = historySessionRef.current.requestKey;
	const currentHistorySessionRevision = historySessionRef.current.revision;
	const isControlledHistorySession = historySessionRef.current.mode === "controlled";

	activeHistoryRequestKeyRef.current = currentHistorySessionRequestKey;
	activeHistorySessionRevisionRef.current = currentHistorySessionRevision;

	useEffect(() => {
		syncHistoryBusyState();
	}, [currentHistorySessionRequestKey, currentHistorySessionRevision, syncHistoryBusyState]);

	// FIX: reset pan-direction flag on symbol/timeframe change so new live ticks aren't trimmed
	useEffect(() => {
		isMovingLeftRef.current = false;
	}, [currentHistorySessionRevision]);

	const backfill = useWidgetDataBackfill({
		adapter: activeAdapter,
		activeSymbol,
		activeTimeframe,
		activeCacheKey,
		activeCacheSemanticScope: activeCacheSemanticScope as any, // ARC-1-keep: legacy bridge
		activeSourceSemantics,
		isControlledHistorySession,
		loading,
		useForkRuntime,
		engineInstanceRef,
		forkVisibleRangeRef,
		forkVisibleRange,
		setForkVisibleRange,
		incrementSnapshotRevision,
		emitCoordinateBridge,
		forkPaneSnapshotsRef,
		paneSnapshots,
		historyMinResidentBars,
		chartId: id,

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
	});

	useEffect(() => {
		const isTest = isWidgetTestEnvironment();
		if (isTest) {
			return undefined;
		}
		let rafId: number;
		const trackFPS = () => {
			const now = performance.now();
			if (lastFrameTimeRef.current !== null) {
				const delta = now - lastFrameTimeRef.current;
				if (delta < 200) {
					frameTimesRef.current.push(delta);
					if (frameTimesRef.current.length > 300) {
						frameTimesRef.current.shift();
					}
				}
			}
			lastFrameTimeRef.current = now;
			rafId = requestAnimationFrame(trackFPS);
		};
		rafId = requestAnimationFrame(trackFPS);
		return () => cancelAnimationFrame(rafId);
	}, []);

	useEffect(() => {
		const isTest = isWidgetTestEnvironment();
		if (isTest) {
			return; // Disable loop in unit tests to protect timers
		}

		const intervalId = setInterval(() => {
			const samples = frameTimesRef.current;
			let p95 = 16.6; // Default 60 FPS
			if (samples.length >= 10) {
				const sorted = [...samples].sort((a, b) => a - b);
				p95 = sorted[Math.floor(sorted.length * 0.95)] ?? p95;
			}

			const visibleBarCount = forkVisibleRange
				? Math.max(1, Math.round(Math.abs(forkVisibleRange.to - forkVisibleRange.from)))
				: 100;
			const overfetchRatio = backfill.totalBarsFetchedRef.current / Math.max(1, visibleBarCount);
			overfetchRatioRef.current = overfetchRatio;

			const nextControllerState = computeAdaptiveInflightControllerState(
				{
					maxInflight: maxInflightRef.current,
					debounceMs: debounceMsRef.current,
					chunkBars: chunkBarsRef.current,
					retentionFactor: retentionFactorRef.current,
					highFrameTimeCount: inflightControllerStateRef.current.highFrameTimeCount,
					lowFrameTimeCount: inflightControllerStateRef.current.lowFrameTimeCount,
					highOverfetchCount: inflightControllerStateRef.current.highOverfetchCount,
				},
				{
					frameP95Ms: p95,
					queueDepth: queueDepthRef.current,
					overfetchRatio,
				},
				resolveResidentRetentionFactor(visibleBarCount, activeSourceSemantics ?? undefined),
			);

			// Phase 4: active chart keeps a higher concurrency floor so its backfill
			// wins over background charts. Background charts are throttled to 1.
			maxInflightRef.current = isActiveChart
				? Math.max(2, nextControllerState.maxInflight)
				: 1;
			debounceMsRef.current = nextControllerState.debounceMs;
			chunkBarsRef.current = nextControllerState.chunkBars;
			retentionFactorRef.current = nextControllerState.retentionFactor;
			inflightControllerStateRef.current = {
				highFrameTimeCount: nextControllerState.highFrameTimeCount,
				lowFrameTimeCount: nextControllerState.lowFrameTimeCount,
				highOverfetchCount: nextControllerState.highOverfetchCount,
			};
		}, 500);

		return () => clearInterval(intervalId);
	}, [activeSourceSemantics, forkVisibleRange, isActiveChart]);
	useEffect(() => {
		if (isControlledHistorySession) {
			return undefined;
		}

		const controller = new AbortController();
		let unsubscribe: (() => void) | null = null;
		let disposed = false;
		const sessionRevision = currentHistorySessionRevision;
		const requestKey = currentHistorySessionRequestKey;

		historyChunkStoreRef.current.replaceAll([]);
		setBars([]);
		setLoading(true);
		setError(null);

		const engine = engineInstanceRef.current;
		if (engine && "setCameraState" in engine) {
			engine.setCameraState({ followLatest: true, rightOffsetBars: 0 });
		}

		const { from, to } = resolveInitialFetchWindow(activeTimeframe);
		const targetRange = { fromTs: from.getTime(), toTs: to.getTime() };

		const startInitialLoad = async () => {
			try {
				const cacheRead = (isTestEnv || !USE_PERSISTENT_CACHE)
					? { bars: [], missingRanges: [targetRange] }
					: await cacheMatrixRef.current.readRanges(activeCacheKey, [targetRange], activeCacheSemanticScope);
				if (
					disposed
					|| !isHistorySessionRequestCurrent(requestKey, sessionRevision, controller.signal)
				) {
					return;
				}

				pendingHistoryPatchRef.current = null;

				await runHistoryMergeLane(() => {
					if (!isHistorySessionRequestCurrent(requestKey, sessionRevision, controller.signal)) {
						return;
					}

					historyChunkStoreRef.current.replaceAll(cacheRead.bars);
				});

				for (const missing of cacheRead.missingRanges) {
					// Phase 0: fetch start
					const fetchMarkId = `${activeSymbol}:${activeTimeframe}:${missing.fromTs}`;
					const sessionId = window.__INST_SESSION_ID; // typed via windowAugmentation.d.ts
					performance.mark(`fetch-start:${fetchMarkId}`, {
						detail: { sessionId, chartId: activeSymbol, symbol: activeSymbol, timeframe: activeTimeframe }
					});

					const nextBars = await (coordinatedFetch(
						activeSymbol,
						activeTimeframe,
						new Date(missing.fromTs),
						new Date(missing.toTs),
						id,
						10,
						controller.signal,
					)) ?? [];

					// Phase 0: fetch end + measure
					performance.mark(`fetch-end:${fetchMarkId}`, {
						detail: { sessionId, chartId: activeSymbol, symbol: activeSymbol, timeframe: activeTimeframe }
					});
					performance.measure(`chart-data-fetch:${activeSymbol}`, {
						start: `fetch-start:${fetchMarkId}`,
						end: `fetch-end:${fetchMarkId}`,
						detail: { sessionId, chartId: activeSymbol, symbol: activeSymbol, timeframe: activeTimeframe }
					});

					if (
						disposed
						|| !isHistorySessionRequestCurrent(requestKey, sessionRevision, controller.signal)
					) {
						return;
					}

					if (nextBars.length > 0) {
						await runHistoryMergeLane(() => {
							if (!isHistorySessionRequestCurrent(requestKey, sessionRevision, controller.signal)) {
								return;
							}

							historyChunkStoreRef.current.append(nextBars);
						});
						if (!isTestEnv && USE_PERSISTENT_CACHE && !(nextBars as any).isFallback) { // ARC-1-keep: legacy bridge
							await cacheMatrixRef.current.writePatch(activeCacheKey, nextBars, {
								requestId: `init-req-${Date.now()}`,
								sessionRevision,
								reason: "warmup",
								semanticScope: activeCacheSemanticScope,
							});
						}
					}
				}
				const replaced = historyChunkStoreRef.current.toSnapshot();
				if (replaced.bars.length > 0) {
					liveEdgeMsRef.current = replaced.bars[replaced.bars.length - 1].date.getTime();
				}
				// FIX: reset pan-direction flag on initial load so live ticks don't get trimmed
				isMovingLeftRef.current = false;
				// Phase 0: render-data start
				const sessionId = window.__INST_SESSION_ID; // typed via windowAugmentation.d.ts
				performance.mark(`render-start:${activeSymbol}`, {
					detail: { sessionId, chartId: activeSymbol, symbol: activeSymbol }
				});
				setBars(replaced.bars);
				// Phase 0: render-data end (after React commit via rAF)
				requestAnimationFrame(() => {
					performance.mark(`render-end:${activeSymbol}`, {
						detail: { sessionId, chartId: activeSymbol, symbol: activeSymbol }
					});
					performance.measure(`render-data:${activeSymbol}`, {
						start: `render-start:${activeSymbol}`,
						end: `render-end:${activeSymbol}`,
						detail: { sessionId, chartId: activeSymbol, symbol: activeSymbol }
					});
				});
				setLoading(false);

				// Phase 5: background warm-up — pre-fetch neighbor ranges for seamless panning
				void (async () => {
					if (disposed || replaced.bars.length < 2) return;
					const firstMs = replaced.bars[0].date.getTime();
					const lastMs = replaced.bars[replaced.bars.length - 1].date.getTime();
					const loadedSpan = lastMs - firstMs;
					if (loadedSpan <= 0) return;

					const warmRanges: Array<{ from: Date; to: Date }> = [
						{ from: new Date(Math.max(1, firstMs - loadedSpan)), to: new Date(firstMs) },
						{ from: new Date(lastMs), to: new Date(lastMs + loadedSpan) },
					];

					for (const range of warmRanges) {
						if (disposed || controller.signal.aborted) break;
						try {
							const warmBars = await coordinatedFetch(
								activeSymbol, activeTimeframe,
								range.from, range.to,
								id, 1, controller.signal,
							);
							if (disposed || !warmBars || warmBars.length === 0) continue;
							await runHistoryMergeLane(() => {
								if (disposed) return;
								historyChunkStoreRef.current.append(warmBars);
							});
							if (!isTestEnv && USE_PERSISTENT_CACHE) {
								await cacheMatrixRef.current.writePatch(activeCacheKey, warmBars as any, { // ARC-1-keep: legacy bridge
									requestId: `warmup-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
									sessionRevision,
									reason: "warmup",
									semanticScope: activeCacheSemanticScope,
								});
							}
							// FIX: propagate warmup bars to React state so plotData/enrichedData advance
							setBars(historyChunkStoreRef.current.toSnapshot().bars);
						} catch {
							// Silent fallthrough
						}
					}
				})();

				if (useForkRuntime) {
					const activeEngine = engineInstanceRef.current;
					const activeRange = activeEngine?.getVisibleRange();
					let initialVisibleDomain: [Date, Date] | null = null;
					if (activeRange) {
						const normalized = normalizeForkVisibleRange(activeRange, replaced.bars as any); // ARC-1-keep: legacy bridge
						if (normalized) {
							initialVisibleDomain = [normalized.startDate, normalized.endDate] as [Date, Date];
						}
					}
					if (!initialVisibleDomain) {
						const firstLoadedBar = replaced.bars[0];
						const lastLoadedBar = replaced.bars[replaced.bars.length - 1];
						if (firstLoadedBar && lastLoadedBar) {
							initialVisibleDomain = [firstLoadedBar.date, lastLoadedBar.date] as [Date, Date];
						}
					}
					if (initialVisibleDomain) {
						backfill.requestVisibleHistoryWindowSync(initialVisibleDomain, { updateVisibleDomainRef: true });
					}
				}

				if (disposed || !isHistorySessionRequestCurrent(requestKey, sessionRevision, controller.signal)) {
					return;
				}

				const residentMaxBars = 120000;
				try {
					const sub = activeAdapter.subscribeToBar(activeSymbol, activeTimeframe, (nextBar: any) => {
						if (disposed || !isHistorySessionRequestCurrent(requestKey, sessionRevision, controller.signal)) {
							return;
						}

						void runHistoryMergeLane(() => {
							if (!isHistorySessionRequestCurrent(requestKey, sessionRevision, controller.signal)) {
								return;
							}

							historyChunkStoreRef.current.append([nextBar]);
							liveEdgeMsRef.current = nextBar.date.getTime();

							// FIX: reset pan-direction flag on live tick so trimRight=false (keep new bars)
							isMovingLeftRef.current = false;

							if (visibleDomainRef.current) {
								const liveTimeframeMs = resolveTimeframeMs(activeTimeframe);
								const liveMinimumResidentSpanMs = liveTimeframeMs * (historyMinResidentBars ?? HISTORY_MIN_RESIDENT_BARS);
								const liveVisibleSpanMs = Math.max(
									liveTimeframeMs,
									liveMinimumResidentSpanMs,
									visibleDomainRef.current[1].getTime() - visibleDomainRef.current[0].getTime(),
								);
								const liveVisibleBarCount = Math.max(1, Math.round(liveVisibleSpanMs / Math.max(liveTimeframeMs, 1)));
								// Phase 6: update shared store resident and use union visible domain
								const residentVisible = (() => {
									const currentVisible = {
										startMs: visibleDomainRef.current[0].getTime(),
										endMs: visibleDomainRef.current[1].getTime(),
									};
									if (sharedBarStore) {
										sharedBarStore.updateResident(activeCacheKey, id ?? "single", currentVisible);
										const unionRes = sharedBarStore.getUnionResident(activeCacheKey);
										if (unionRes) return unionRes;
									}
									return currentVisible;
								})();
								let liveResidentTarget = computeResidentTarget(
									residentVisible,
									liveVisibleSpanMs,
									liveVisibleBarCount,
									activeSourceSemantics ?? undefined,
									retentionFactorRef.current,
								);
								if (liveEdgeMsRef.current !== null && visibleDomainRef.current[1].getTime() < liveEdgeMsRef.current) {
									liveResidentTarget = {
										...liveResidentTarget,
										endMs: Math.max(liveResidentTarget.endMs, liveEdgeMsRef.current),
									};
								}
								// GAP 3 fix: pass trimLeft/trimRight based on pan direction to protect newly loaded bars
								const trimLeft = !isMovingLeftRef.current;  // Chỉ trim left nếu KHÔNG dịch sang trái
								const trimRight = isMovingLeftRef.current;  // Chỉ trim right nếu ĐANG dịch sang trái
								historyChunkStoreRef.current.trimToWindow(computeTrimWindow(liveResidentTarget), residentMaxBars, trimLeft, trimRight);
							}
							setBars(historyChunkStoreRef.current.toSnapshot().bars);
						});

						if (!isTestEnv && USE_PERSISTENT_CACHE && !((historyChunkStoreRef.current.toSnapshot().bars) as any).isFallback) { // ARC-1-keep: legacy bridge
							void cacheMatrixRef.current.writePatch(activeCacheKey, [nextBar], {
								requestId: `live-tick-${Date.now()}`,
								sessionRevision,
								reason: "warmup",
								semanticScope: activeCacheSemanticScope,
							});
						}
					});

					if (disposed) {
						sub?.();
					} else {
						unsubscribe = sub;
					}
				} catch (subscribeError) {
					if (
						!disposed
						&& isHistorySessionRequestCurrent(requestKey, sessionRevision, controller.signal)
					) {
						setError(subscribeError instanceof Error ? subscribeError : new Error(String(subscribeError)));
					}
				}
			} catch (err: any) {
				if (
					disposed
					|| !isHistorySessionRequestCurrent(requestKey, sessionRevision, controller.signal)
				) {
					return;
				}
				setLoading(false);
				setError(err instanceof Error ? err : new Error(String(err)));
			}
		};

		const loadingFallback = setTimeout(() => { log.log("[widget-data] loadingFallback 25s timeout — forcing loading=false"); if (!disposed) setLoading(false); }, 25000);
		void startInitialLoad().finally(() => { clearTimeout(loadingFallback); });

		return () => {
			disposed = true;
			clearTimeout(loadingFallback);
			controller.abort();
			unsubscribe?.();
		};
	}, [
		activeAdapter,
		activeSymbol,
		activeTimeframe,
		currentHistorySessionRequestKey,
		currentHistorySessionRevision,
		isControlledHistorySession,
		isHistorySessionRequestCurrent,
		runHistoryMergeLane,
		// UX-05: retry re-enters this effect on purpose.
		reloadNonce,
	]);

	// Enrichment and indicator mapping
	const visiblePanes = useMemo(() => resolveVisiblePanes(panes), [panes]);

	const [mtfBarsByTimeframe, setMtfBarsByTimeframe] = useState<Record<string, readonly OHLCVBar[]>>({});
	const mtfBarsRef = useRef<Record<string, readonly OHLCVBar[]>>({});
	const mtfFetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		if (!symbol || canaryFilteredBars.length === 0 || !activeAdapter) return;

		const requiredTimeframes = new Set<string>();
		visiblePanes.forEach((pane) => {
			pane.series.forEach((s) => {
				if (s.params?.timeframe && s.params.timeframe !== "Same as chart" && s.params.timeframe !== timeframe) {
					requiredTimeframes.add(s.params.timeframe as string);
				}
			});
		});

		// Scan for VolumeProfile series to implement lower timeframe backfilling logic
		const hasVolumeProfile = visiblePanes.some((pane) =>
			pane.series.some((s) => s.type === "VolumeProfile")
		);

		if (hasVolumeProfile) {
			const currentTfMs = resolveTimeframeMs(timeframe as Timeframe);
			const oneDayMs = resolveTimeframeMs("1d" as Timeframe);
			const fifteenMinMs = resolveTimeframeMs("15m" as Timeframe);

			if (currentTfMs >= oneDayMs) {
				requiredTimeframes.add("5m");
			} else if (currentTfMs > fifteenMinMs) {
				requiredTimeframes.add("1m");
			}
		}

		if (overlayTimeframe && overlayTimeframe !== "Same as chart" && overlayTimeframe !== timeframe) {
			const ltfMs = resolveTimeframeMs(timeframe as Timeframe);
			const htfMs = resolveTimeframeMs(overlayTimeframe as Timeframe);
			if (htfMs / ltfMs <= 24) {
				requiredTimeframes.add(overlayTimeframe);
			} else {
				log.warn(`Overlay timeframe ratio too large (${overlayTimeframe} vs ${timeframe}), disabling overlay.`);
			}
		}

		if (requiredTimeframes.size === 0) {
			if (Object.keys(mtfBarsByTimeframe).length > 0) {
				mtfBarsRef.current = {};
				setMtfBarsByTimeframe({});
			}
			return;
		}

		// Skip timeframes already loaded with sufficient coverage
		const cached = mtfBarsRef.current;
		const missingTimeframes = new Set<string>();
		const toMs = canaryFilteredBars[canaryFilteredBars.length - 1].date.getTime();
		const fromMs = canaryFilteredBars[0].date.getTime();

		for (const tf of requiredTimeframes) {
			const existing = cached[tf];
			if (existing && existing.length > 0) {
				const existFrom = existing[0].date.getTime();
				const existTo = existing[existing.length - 1].date.getTime();
				if (existFrom <= fromMs && existTo >= toMs) {
					continue;
				}
			}
			missingTimeframes.add(tf);
		}

		if (missingTimeframes.size === 0) {
			return;
		}

		// Debounce: wait 300ms after last layout change before fetching
		if (mtfFetchTimerRef.current !== null) {
			clearTimeout(mtfFetchTimerRef.current);
		}

		let active = true;

		mtfFetchTimerRef.current = setTimeout(async () => {
			mtfFetchTimerRef.current = null;
			const nextMtfBars: Record<string, readonly OHLCVBar[]> = { ...cached };
			let hasChanges = false;

			for (const tf of missingTimeframes) {
				if (!active) break;
				try {
					const tfMs = resolveTimeframeMs(tf as Timeframe);
					const paddedFrom = new Date(fromMs - tfMs * 100);
					const toDate = new Date(toMs);
					const resultBars = await coordinatedFetch(symbol, tf as Timeframe, paddedFrom, toDate, undefined, 5);
					if (resultBars && resultBars.length > 0) {
						nextMtfBars[tf] = resultBars;
						hasChanges = true;
					}
				} catch (err) {
					log.error(`Failed to fetch MTF bars for timeframe ${tf}:`, err);
				}
			}
			if (active && hasChanges) {
				mtfBarsRef.current = nextMtfBars;
				setMtfBarsByTimeframe(nextMtfBars);
			}
		}, 300);

		return () => {
			active = false;
			if (mtfFetchTimerRef.current !== null) {
				clearTimeout(mtfFetchTimerRef.current);
				mtfFetchTimerRef.current = null;
			}
		};
	}, [symbol, timeframe, canaryFilteredBars, visiblePanes, activeAdapter]);

	const compareBarsBySymbolRef = useRef<Record<string, readonly OHLCVBar[]>>({});
	const [compareBarsBySymbol, setCompareBarsBySymbol] = useState<Record<string, readonly OHLCVBar[]>>({});
	const [compareStatusBySymbol, setCompareStatusBySymbol] = useState<Record<string, "idle" | "loading" | "loaded" | "error">>({});

	const setCompareBars = useCallback((next: Record<string, readonly OHLCVBar[]>) => {
		compareBarsBySymbolRef.current = next;
		setCompareBarsBySymbol(next);
	}, []);

	useEffect(() => {
		if (!symbol || canaryFilteredBars.length === 0 || !activeAdapter) return;

		const requiredSymbols = new Set<string>();
		visiblePanes.forEach((pane) => {
			pane.series.forEach((s) => {
				if (s.type === "StrengthRelative") {
					const comp = (s.params?.compareSymbol as string) || "VNINDEX";
					requiredSymbols.add(comp);
				}
				if (typeof s.overlaySymbolId === "string" && s.overlaySymbolId.length > 0) {
					requiredSymbols.add(s.overlaySymbolId);
				}
			});
		});

		if (requiredSymbols.size === 0) {
			if (Object.keys(compareBarsBySymbolRef.current).length > 0) {
				setCompareBars({});
				setCompareStatusBySymbol({});
			}
			return;
		}

		let active = true;
		const fromDate = canaryFilteredBars[0].date;
		const toDate = canaryFilteredBars[canaryFilteredBars.length - 1].date;

		// Set loading state for all required symbols
		setCompareStatusBySymbol((prev) => {
			const next: Record<string, "idle" | "loading" | "loaded" | "error"> = { ...prev };
			for (const compSymbol of requiredSymbols) {
				if (next[compSymbol] !== "loaded") {
					next[compSymbol] = "loading";
				}
			}
			return next;
		});

		const fetchMissing = async () => {
			const existingCache = compareBarsBySymbolRef.current;
			const nextCompareBars: Record<string, readonly OHLCVBar[]> = { ...existingCache };
			const nextStatus: Record<string, "idle" | "loading" | "loaded" | "error"> = {};
			let hasChanges = false;

			for (const compSymbol of requiredSymbols) {
				nextStatus[compSymbol] = "loading";
				try {
					const tfMs = resolveTimeframeMs(timeframe as Timeframe);
					const paddedFrom = new Date(fromDate.getTime() - tfMs * 100);

					const existing = existingCache[compSymbol];
					if (existing && existing.length > 0) {
						const existingFrom = existing[0].date.getTime();
						const existingTo = existing[existing.length - 1].date.getTime();
						const neededFrom = paddedFrom.getTime();
						const neededTo = toDate.getTime();

						if (existingFrom <= neededFrom && existingTo >= neededTo) {
							nextStatus[compSymbol] = "loaded";
							continue;
						}

						if (neededFrom < existingFrom) {
							const fetchFrom = new Date(neededFrom);
							const fetchTo = new Date(existingFrom - tfMs);
							const missingBars = await coordinatedFetch(
								compSymbol, timeframe as Timeframe, fetchFrom, fetchTo, undefined, 3
							);
							if (missingBars && missingBars.length > 0) {
								nextCompareBars[compSymbol] = mergeBarPagesByDate(missingBars, existing);
								hasChanges = true;
							} else {
								nextCompareBars[compSymbol] = existing;
							}
						}
						nextStatus[compSymbol] = "loaded";
					} else {
						const resultBars = await coordinatedFetch(compSymbol, timeframe as Timeframe, paddedFrom, toDate, undefined, 3);
						if (resultBars && resultBars.length > 0) {
							nextCompareBars[compSymbol] = resultBars;
							hasChanges = true;
							nextStatus[compSymbol] = "loaded";
						} else {
							nextStatus[compSymbol] = "error";
						}
					}
				} catch (err) {
					log.error(`Failed to fetch comparison bars for symbol ${compSymbol}:`, err);
					nextStatus[compSymbol] = "error";
				}
			}
			if (active) {
				if (hasChanges) {
					setCompareBars(nextCompareBars);
				}
				setCompareStatusBySymbol(nextStatus);
			}
		};

		fetchMissing();
		return () => {
			active = false;
		};
	}, [symbol, timeframe, canaryFilteredBars, visiblePanes, activeAdapter, setCompareBars]);

	// BL-01: worker-backed VolumeProfile computation lives in useWidgetDataEnrichment.
	const asyncVolumeProfiles = useAsyncVolumeProfiles({
		symbol,
		canaryFilteredBars,
		mtfBarsByTimeframe,
		visiblePanes,
	});

	const canonicalStore = useMemo(() => {
		return createCanonicalSeriesStore<{
			plan: any;
			result: any;
			aoColors: (string | undefined)[];
		}>();
		// `pineRestoreVersion` belongs here on purpose. See the prop's docblock: a late async
		// restore means enrichment may already have cached `undefined` values for pine series,
		// and those cache entries are keyed by a transform hash that knows nothing about the
		// plugin registry. Recreating the store is what discards them; `enrichedData` below
		// depends on `canonicalStore`, so it recomputes for free.
	}, [symbol, timeframe, pineRestoreVersion]);

	const enrichedData = useMemo<EnrichedDatum[]>(() => {
		return enrichDataWithCanonicalStore(canaryFilteredBars, {
			series: visiblePanes.flatMap((pane) => pane.series),
			canonicalStore,
			sourceId: symbol ?? "unknown",
			timeframe: timeframe ?? "unknown",
			mtfBars: mtfBarsByTimeframe as any, // ARC-1-keep: legacy bridge
			compareBarsBySymbol: compareBarsBySymbol as any, // ARC-1-keep: legacy bridge
			asyncVolumeProfiles,
		});
	}, [canaryFilteredBars, visiblePanes, canonicalStore, symbol, timeframe, mtfBarsByTimeframe, compareBarsBySymbol, asyncVolumeProfiles]);

	const enrichedDataWithHtf = useMemo(() => {
		if (!overlayTimeframe || overlayTimeframe === "Same as chart" || overlayTimeframe === timeframe) {
			return enrichedData;
		}
		const htfData = computeProgressiveHTFData(canaryFilteredBars, timeframe ?? "1h", overlayTimeframe);
		return enrichedData.map((d, i) => {
			if (htfData[i]) {
				return { ...d, htf: htfData[i] };
			}
			return d;
		});
	}, [enrichedData, canaryFilteredBars, timeframe, overlayTimeframe]);

	const plotData = useMemo<EnrichedDatum[]>(() => enrichedDataWithHtf.filter((datum): datum is EnrichedDatum => Boolean(datum && datum.date)), [enrichedDataWithHtf]);
	const plotDataRef = useRef<readonly EnrichedDatum[]>(plotData);
	plotDataRef.current = plotData;
	if (sharedPlotDataRef) {
		sharedPlotDataRef.current = plotData;
	}
	const plotDataLengthRef = useRef<number>(plotData.length);
	plotDataLengthRef.current = plotData.length;

	// External/internal whale event mapping (BL-01: builder in useWidgetDataEnrichment).
	const whaleEvents = useMemo(
		() => mapWhaleEventsToBars({ enableWhale, whaleOrders, plotData }),
		[enableWhale, whaleOrders, plotData],
	);

	// Unified effect: push enriched data + snapshot to engine on every data change.
	// Uses setHistorySnapshot (handles prepend/append camera shift via patch).
	// The visibleRange emit inside setHistorySnapshot keeps React state in sync
	// (replaces the redundant setEnrichedData call — see KernelEngine.ts setHistorySnapshot).
	useEffect(() => {
		const engine = engineInstanceRef.current;
		if (!engine || !useForkRuntime || !("setHistorySnapshot" in engine)) {
			// BLACKSCREEN-FIX: do NOT consume prev refs here. Marking data as
			// "seen" without pushing poisons the hash check below: when the
			// engine becomes ready, prevHash === nextHash with identical refs
			// and the push is skipped forever → black chart with zero errors.
			// (The replay-skip branch below intentionally keeps refs current.)
			return;
		}

		// During replay, the fork camera effect is the only data feed (it pushes
		// the replay slice via setEnrichedData). If we also push the full dataset
		// here, the engine flushes a full-data frame on a different animation
		// frame than the slice frame, producing the per-tick full-chart flash.
		// Skip the full feed while replay is active; keep prev refs current so
		// resuming after replay stays consistent.
		if (replayActiveRef?.current) {
			prevBarsRef.current = bars;
			prevEnrichedDataRef.current = enrichedData;
			prevEnrichedHashRef.current = hashEnrichedData(enrichedData);
			prevPineSignatureRef.current = pineSeriesSignature;
			return;
		}

		const prevBars = prevBarsRef.current;
		const nextBars = bars;
		const prevEnriched = prevEnrichedDataRef.current;
		const nextEnriched = enrichedData;
		const prevHash = prevEnrichedHashRef.current;
		const nextHash = hashEnrichedData(enrichedData);
		const prevPineSignature = prevPineSignatureRef.current;
		prevBarsRef.current = bars;
		prevEnrichedDataRef.current = enrichedData;
		prevEnrichedHashRef.current = nextHash;
		prevPineSignatureRef.current = pineSeriesSignature;

		// 1.3b: see the prop docblock. The Pine series list is the only cheap signal that
		// survives a bars-unchanged, indicator-changed update.
		if (prevBars === nextBars && prevHash === nextHash && prevPineSignature === pineSeriesSignature) {
			return;
		}

		const barsChanged = prevBars !== nextBars;
		const patch = pendingHistoryPatchRef.current;
		pendingHistoryPatchRef.current = null;

		let prependedCount = 0;
		let appendedCount = 0;
		if (barsChanged) {
			if (patch?.prependedCount) {
				prependedCount = patch.prependedCount;
			} else if (prevBars.length > 0 && nextBars.length > prevBars.length) {
				const prevFirstTime = prevBars[0]?.date?.getTime();
				if (typeof prevFirstTime === "number") {
					const nextIndex = nextBars.findIndex((d) => d?.date?.getTime() === prevFirstTime);
					if (nextIndex > 0) {
						prependedCount = nextIndex;
					}
				}
			}
			// Detect appended bars: if last timestamp moved forward
			if (patch?.appendedCount) {
				appendedCount = patch.appendedCount;
			} else if (prevBars.length > 0 && nextBars.length > prevBars.length) {
				const prevLastTime = prevBars[prevBars.length - 1]?.date?.getTime();
				const nextLastTime = nextBars[nextBars.length - 1]?.date?.getTime();
				if (typeof prevLastTime === "number" && typeof nextLastTime === "number" && nextLastTime > prevLastTime) {
					appendedCount = nextBars.length - prevBars.length;
				}
			}
		}

		if (prependedCount > 0 && !pendingSyncTimeRangeRef?.current) {
			const cameraState = engine.getCameraState();
			if (!cameraState.followLatest) {
				const currentRange = forkVisibleRangeRef.current || forkVisibleRange;
				if (currentRange) {
					const newRange = {
						from: currentRange.from + prependedCount,
						to: currentRange.to + prependedCount,
					};
					forkVisibleRangeRef.current = newRange;

					setForkVisibleRange((currentRange) => (areEngineVisibleRangesEqual(currentRange, newRange) ? currentRange : newRange));

					incrementSnapshotRevision();

					if (newRange.from < 0 && historyBackfillBeforeRef.current === null) {
						const normalized = normalizeForkVisibleRange(newRange, nextBars as any); // ARC-1-keep: legacy bridge
						if (normalized) {
							const nextDomain = [normalized.startDate, normalized.endDate] as [Date, Date];
							backfill.requestVisibleHistoryWindowSync(nextDomain, { force: true });
						}
					}
				}
			}
		}

		// Append shift: when bars are appended at the right edge, shift the range
		// to keep the newly appended candles visible. Only applies when anchor was
		// at or near the data edge (mirrors engine's gestureAnchorTo logic).
		if (appendedCount > 0 && !pendingSyncTimeRangeRef?.current) {
			const cameraState = engine.getCameraState();
			if (!cameraState.followLatest) {
				const currentRange = forkVisibleRangeRef.current || forkVisibleRange;
				if (currentRange) {
					const dataLength = nextBars.length;
					const wasAtEdge = currentRange.to >= dataLength - appendedCount - 1;
					if (wasAtEdge) {
						const newRange = {
							from: currentRange.from + appendedCount,
							to: currentRange.to + appendedCount,
						};
						forkVisibleRangeRef.current = newRange;
						setForkVisibleRange((currentRange) => (areEngineVisibleRangesEqual(currentRange, newRange) ? currentRange : newRange));
						incrementSnapshotRevision();
					}
				}
			}
		}

		const rawSnapshot = historyChunkStoreRef.current.toSnapshot();
		const snapshot: EngineHistorySnapshot = {
			...rawSnapshot,
			bars: nextEnriched as any, // ARC-1-keep: legacy bridge
		};
		let enginePatch: EngineHistoryPatch | null = null;
		if (patch) {
			enginePatch = {
				...patch,
				prependedCount,
				appendedCount,
			};
		} else if (prependedCount > 0 || appendedCount > 0) {
			enginePatch = {
				kind: prependedCount > 0 ? "prepend" : "append" as const,
				snapshot,
				prependedCount,
				appendedCount,
				trimmedFromHead: 0,
				trimmedFromTail: 0,
			};
		}
		(engine as EngineInstance & { setHistorySnapshot: (s: EngineHistorySnapshot, patch?: EngineHistoryPatch | null) => void }).setHistorySnapshot(snapshot, enginePatch);
	}, [bars, enrichedData, useForkRuntime, forkEngineInstance, incrementSnapshotRevision, backfill.requestVisibleHistoryWindowSync]);

	const handleForkVisibleRangeChange = useCallback((range: EngineVisibleRange) => {
		const previousVisibleRange = forkVisibleRangeRef.current;
		const previousVisibleDomain = visibleDomainRef.current;
		const rangeSpan = Math.abs(range.to - range.from);
		if (rangeSpan <= 3) {
			// Tiny range suppressed
		}
		const dataLength = plotDataLengthRef.current;
		const backfillBusy = !isControlledHistorySession && (historyWindowSyncInFlightRef.current || activeRequestsRef.current.size > 0);

		// Auto-reset historyBackfillBeforeRef khi user pan sâu hơn boundary cũ.
		// Nếu lockedMs được set do rate-limit (không phải true boundary), user có
		// thể unlock bằng cách kéo chart sang trái vượt qua vị trí đó. Counter
		// cũng được reset để không accumulate sang vùng mới.
		const lockedMs = historyBackfillBeforeRef.current;
		if (lockedMs !== null && !isControlledHistorySession) {
			const normalizedRangeFrom = Math.min(range.from, range.to);
			if (normalizedRangeFrom < 0) {
				const currentBars = plotDataRef.current;
				const firstBarMs = currentBars.length > 0 ? (currentBars[0] as any)?.date?.getTime?.() ?? null : null; // ARC-1-keep: legacy bridge
				if (firstBarMs !== null) {
					const timeframeMsEst = currentBars.length > 1
						? (((currentBars[currentBars.length - 1] as any)?.date?.getTime?.() ?? 0) - ((currentBars[0] as any)?.date?.getTime?.() ?? 0)) // ARC-1-keep: legacy bridge
							/ (currentBars.length - 1)
						: 3600000;
					const viewportLeftMs = firstBarMs + normalizedRangeFrom * timeframeMsEst;
					if (viewportLeftMs < lockedMs) {
						historyBackfillBeforeRef.current = null;
						consecutiveEmptyBackfillRef.current = 0;
					}
				}
			}
		}

		// Auto-reset historyForwardAfterRef khi user pan/zoom sang trái (viewport right edge moves left)
		// Nếu lockedMs được set do exhausted boundary, user có thể unlock bằng cách kéo chart sang trái
		// hoặc zoom out làm viewport right edge lùi lại. Counter cũng được reset.
		const forwardLockedMs = historyForwardAfterRef.current;
		if (forwardLockedMs !== null && !isControlledHistorySession) {
			const normalizedRangeTo = Math.max(range.from, range.to);
			const currentBars = plotDataRef.current;
			const lastBarMs = currentBars.length > 0 ? (currentBars[currentBars.length - 1] as any)?.date?.getTime?.() ?? null : null; // ARC-1-keep: legacy bridge
			if (lastBarMs !== null) {
				const timeframeMsEst = currentBars.length > 1
					? (((currentBars[currentBars.length - 1] as any)?.date?.getTime?.() ?? 0) - ((currentBars[0] as any)?.date?.getTime?.() ?? 0)) // ARC-1-keep: legacy bridge
						/ (currentBars.length - 1)
					: 3600000;
				const viewportRightMs = lastBarMs + normalizedRangeTo * timeframeMsEst;
				if (viewportRightMs < forwardLockedMs) {
					historyForwardAfterRef.current = null;
					consecutiveEmptyBackfillRef.current = 0;
				}
			}
		}

		const leftBoundaryReached = !isControlledHistorySession && historyBackfillBeforeRef.current !== null;
		const rightBoundaryReached = !isControlledHistorySession && historyForwardAfterRef.current !== null;

		const stabilizedRange = range;
		const stabilizedMin = Math.min(stabilizedRange.from, stabilizedRange.to);
		const stabilizedMax = Math.max(stabilizedRange.from, stabilizedRange.to);

		const overflowQueueState = resolveOverflowHistoryQueueState(
			stabilizedRange,
			dataLength,
			leftBoundaryReached,
			rightBoundaryReached,
			lastQueuedOverflowHistoryKeyRef.current,
		);

		// Proactively trigger right-side backfill when viewport is at/near the right edge
		// of loaded data and boundary is not exhausted. This ensures forward backfill
		// works when panning left (viewport right edge moves away from data edge).
		const atRightEdge = dataLength > 0 && stabilizedMax >= dataLength - 5; // within 5 bars of right edge
		const rightBoundaryNotExhausted = !rightBoundaryReached;
		if (atRightEdge && rightBoundaryNotExhausted && visibleDomainRef.current) {
			// Force a backfill sync to fetch forward to Date.now()
			backfill.requestVisibleHistoryWindowSync(visibleDomainRef.current, { force: true });
		}

		// CRITICAL: After every visible range change (zoom/pan), trigger a backfill
		// check to detect and fill missing candles between last loaded bar and Date.now().
		// This ensures right-side backfill works like left-side backfill — automatically
		// filling gaps after every interaction, not just when at the right edge.
		if (!isControlledHistorySession && visibleDomainRef.current && rightBoundaryNotExhausted) {
			const currentBars = plotDataRef.current;
			if (currentBars.length > 0) {
				const lastBarMs = currentBars[currentBars.length - 1].date.getTime();
				const nowMs = Date.now();
				const timeframeMsEst = currentBars.length > 1
					? (currentBars[currentBars.length - 1].date.getTime() - currentBars[0].date.getTime()) / (currentBars.length - 1)
					: 3600000;
				// If there's a gap of more than 2 bars between last loaded bar and now,
				// trigger a backfill to fetch the missing candles.
				if (nowMs - lastBarMs > 2 * timeframeMsEst) {
					backfill.requestVisibleHistoryWindowSync(visibleDomainRef.current, { force: true });
				}
			}
		}

		if (stabilizedMin >= 0 && stabilizedMax <= dataLength) {
			lastStableForkSpanRef.current = Math.max(1, stabilizedMax - stabilizedMin);
		}
		const nextEnvelopeMode = engineInstanceRef.current?.getCameraState().envelopeMode ?? "shared";
		setForkCameraEnvelopeMode((currentMode) => (currentMode === nextEnvelopeMode ? currentMode : nextEnvelopeMode));
		pendingForkVisibleRangeRef.current = stabilizedRange;
		const commitPendingRange = () => {
			const pendingRange = pendingForkVisibleRangeRef.current;

			if (!pendingRange) {
				return;
			}

			// When a remote sync is pending (backfill in progress), skip this
			// state update — the pending sync effect will call zoomToRange
			// with the correct range directly, avoiding a shifted intermediate render.
			if (pendingSyncTimeRangeRef?.current) {
				pendingForkVisibleRangeRef.current = null;
				return;
			}

			pendingForkVisibleRangeRef.current = null;
			forkVisibleRangeRef.current = pendingRange;
			setForkVisibleRange((currentRange) => (areEngineVisibleRangesEqual(currentRange, pendingRange) ? currentRange : pendingRange));
			incrementSnapshotRevision();
			emitCoordinateBridge(forkPaneSnapshotsRef.current, pendingRange);
		};

		if (pendingForkVisibleRangeRafRef.current === null) {
			const schedule = () => {
				pendingForkVisibleRangeRafRef.current = null;
				commitPendingRange();
			};

			if (typeof requestAnimationFrame === "function") {
				pendingForkVisibleRangeRafRef.current = requestAnimationFrame(schedule);
				if (typeof queueMicrotask === "function") {
					queueMicrotask(() => {
						if (pendingForkVisibleRangeRef.current === null) {
							return;
						}

						if (pendingForkVisibleRangeRafRef.current !== null && typeof cancelAnimationFrame === "function") {
							cancelAnimationFrame(pendingForkVisibleRangeRafRef.current);
						}

						schedule();
					});
				}
			} else {
				schedule();
			}
		}

		const normalizedRange = normalizeForkVisibleRange(stabilizedRange, plotDataRef.current);
		if (!normalizedRange) {
			return;
		}

		const visibleDomain = [normalizedRange.startDate, normalizedRange.endDate] as [Date, Date];
		visibleDomainRef.current = visibleDomain;

		// Track pan direction for live subscription trim logic (GAP 3 fix)
		const visibleStartMs = visibleDomain[0].getTime();
		const isMovingLeft = prevVisibleStartMsRef.current !== null && visibleStartMs < prevVisibleStartMsRef.current;
		prevVisibleStartMsRef.current = visibleStartMs;
		isMovingLeftRef.current = isMovingLeft;

		const normalizedEngineRange = normalizeVisibleRangeForEngine(normalizedRange, plotDataRef.current.length);
		if (!normalizedEngineRange) {
			return;
		}

		// Calculate relative viewport position for cross-chart sync with different data ranges
		const plotData = plotDataRef.current;
		if (plotData.length > 1 && normalizedRange.timeRange) {
			const dataStartMs = plotData[0].date.getTime();
			const dataEndMs = plotData[plotData.length - 1].date.getTime();
			const dataSpanMs = dataEndMs - dataStartMs;
			const visibleStartMs = normalizedRange.timeRange.from;
			const visibleEndMs = normalizedRange.timeRange.to;
			const visibleSpanMs = visibleEndMs - visibleStartMs;

			if (dataSpanMs > 0) {
				normalizedRange.relativePosition = {
					startRatio: Math.max(0, Math.min(1, (visibleStartMs - dataStartMs) / dataSpanMs)),
					spanRatio: Math.max(0, Math.min(1, visibleSpanMs / dataSpanMs)),
				};
			}
		}

		const visibleRangeChanged = !areEngineVisibleRangesEqual(previousVisibleRange, stabilizedRange);
		const visibleDomainChanged = !areVisibleDomainsEqual(previousVisibleDomain, visibleDomain);
		if (visibleDomainChanged) {
			lastQueuedOverflowHistoryKeyRef.current = null;
		}
		if (visibleRangeChanged) {
			onVisibleRangeChangeRef.current?.(normalizedRange);
		}
		if (visibleDomainChanged) {
			onVisibleDomainChangeRef.current?.(visibleDomain);
		}
		if (visibleDomainChanged || overflowQueueState.shouldForceQueue) {
			const queuedVisibleHistorySync = backfill.requestVisibleHistoryWindowSync(visibleDomain, {
				force: overflowQueueState.shouldForceQueue,
			});
			if (queuedVisibleHistorySync && overflowQueueState.shouldForceQueue) {
				lastQueuedOverflowHistoryKeyRef.current = overflowQueueState.overflowKey;
			}
		}
	}, [emitCoordinateBridge, incrementSnapshotRevision, backfill.requestVisibleHistoryWindowSync, isControlledHistorySession, setForkVisibleRange, forkVisibleRange]);

	useEffect(() => {
		if (!useForkRuntime) {
			lastAppliedForkControlledExtentsKeyRef.current = null;
			return;
		}

		if (!controlledXExtents) {
			lastAppliedForkControlledExtentsKeyRef.current = null;
			return;
		}

		if (plotData.length === 0) {
			return;
		}

		const key = `${asTimeValue(controlledXExtents[0])}:${asTimeValue(controlledXExtents[1])}`;
		if (lastAppliedForkControlledExtentsKeyRef.current === key) {
			return;
		}

		const engine = engineInstanceRef.current;
		if (!engine) {
			return;
		}

		const nextRange = resolveForkVisibleRangeFromDateExtents(controlledXExtents, plotData);
		if (!nextRange) {
			return;
		}

		const isKeyChanged = lastAppliedForkControlledExtentsKeyRef.current !== key;
		lastAppliedForkControlledExtentsKeyRef.current = key;

		const normalizedRange = normalizeForkVisibleRange(nextRange, plotData);
		if (!normalizedRange) {
			return;
		}

		const visibleDomain = [normalizedRange.startDate, normalizedRange.endDate] as [Date, Date];
		backfill.requestVisibleHistoryWindowSync(visibleDomain, { force: true, updateVisibleDomainRef: true });

		if (!isKeyChanged && areEngineVisibleRangesEqual(forkVisibleRangeRef.current, nextRange)) {
			return;
		}

		pendingForkVisibleRangeRef.current = null;
		forkVisibleRangeRef.current = nextRange;
		setForkVisibleRange((currentRange) => (areEngineVisibleRangesEqual(currentRange, nextRange) ? currentRange : nextRange));
		incrementSnapshotRevision();
		engine.zoomToRange(nextRange);
	}, [controlledXExtents, plotData, backfill.requestVisibleHistoryWindowSync, useForkRuntime, incrementSnapshotRevision]);

	useEffect(() => {
		if (isTestEnv) {
			return;
		}

		if (!useForkRuntime || !initialXExtents || plotData.length === 0) {
			return;
		}

		const key = `${asTimeValue(initialXExtents[0])}:${asTimeValue(initialXExtents[1])}`;
		if (lastAppliedInitialExtentsKeyRef.current === key) {
			return;
		}

		const engine = engineInstanceRef.current;
		if (!engine) {
			return;
		}

		const nextRange = resolveForkVisibleRangeFromDateExtents(initialXExtents, plotData);
		if (!nextRange) {
			return;
		}

		const rangeSpan = Math.abs(nextRange.to - nextRange.from);
		if (rangeSpan <= 3) {
			return;
		}

		const isFirstApply = lastAppliedInitialExtentsKeyRef.current === null;
		lastAppliedInitialExtentsKeyRef.current = key;

		const normalizedRange = normalizeForkVisibleRange(nextRange, plotData);
		if (!normalizedRange) {
			return;
		}

		const visibleDomain = [normalizedRange.startDate, normalizedRange.endDate] as [Date, Date];
		backfill.requestVisibleHistoryWindowSync(visibleDomain, { force: true, updateVisibleDomainRef: true });

		pendingForkVisibleRangeRef.current = null;
		forkVisibleRangeRef.current = nextRange;
		setForkVisibleRange((currentRange) => (areEngineVisibleRangesEqual(currentRange, nextRange) ? currentRange : nextRange));
		incrementSnapshotRevision();
		engine.zoomToRange(nextRange);
		// Re-anchor to latest so chart opens on "now"; guarded so live-tick expansion never yanks a history-browsing user (see AUDIT_LEDGER CHART_INITIAL_TAIL_ANCHOR).
		if (isFirstApply || engine.getCameraState().followLatest) engine.setCameraState({ followLatest: true, rightOffsetBars: 0 });
	}, [initialXExtents, plotData.length > 0, useForkRuntime, incrementSnapshotRevision]);

	useEffect(() => {
		return () => {
			pendingForkVisibleRangeRef.current = null;
			if (pendingForkVisibleRangeRafRef.current !== null && typeof cancelAnimationFrame === "function") {
				cancelAnimationFrame(pendingForkVisibleRangeRafRef.current);
			}
			pendingForkVisibleRangeRafRef.current = null;
		};
	}, []);

	return {
		bars,
		setBars,
		loading,
		setLoading,
		error,
		setError,
		reload,
		compareStatusBySymbol,
		canaryFilteredBars,
		resolvedCanaryLevel,
		enrichedData: enrichedDataWithHtf,
		plotData,
		plotDataRef,
		plotDataLengthRef,
		whaleEvents,
		activeSymbol,
		activeTimeframe,
		activeCacheKey,
		activeCacheSemanticScope,
		activeSourceSemantics,
		activeSourceRevisionKey,
		activeHistoryRequestKey,
		isControlledHistorySession,
		requestVisibleHistoryWindowSync: backfill.requestVisibleHistoryWindowSync,
		reconcileVisibleHistoryWindow: backfill.reconcileVisibleHistoryWindow,
		totalBarsFetchedRef: backfill.totalBarsFetchedRef,
		consecutiveEmptyBackfillRef,
		historyBackfillBeforeRef,
		historyForwardAfterRef,
		pendingHistoryPatchRef,
		visibleDomainRef,
		pendingVisibleDomainRef,
		lastQueuedVisibleDomainRef,
		resetHistorySessionControllerRefs,
		liveEdgeMsRef,
		historySessionRef,
		forkCameraEnvelopeMode,
		setForkCameraEnvelopeMode,
		handleForkVisibleRangeChange,
		adapterLabel,
	};
}


