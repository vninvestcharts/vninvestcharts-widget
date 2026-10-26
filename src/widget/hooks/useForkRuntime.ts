import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	type EngineInstance,
	type VisibleRange as EngineVisibleRange,
	type EngineOverlayState,
	type EngineOverlayInputs,
	type EngineOverlayDrawingPrimitiveInput,
	type PaneRuntimeSnapshot,
	type CrosshairMode,
	resolvePaneDataIndexAtPixel,
	resolvePaneValueAtPixel,
	createDateTimeIndexMap,
} from "@vninvestcharts/engine-core";
import type { CrosshairPayload, ClockAdapter } from "@vninvestcharts/engine-react";
import { type PaneDescriptor } from "../../lib/core";
import { type EnrichedDatum } from "../../lib/core/calculators/types";
import { formatAxisPrice } from "../../lib/utils/axisPriceFormat";
import {
	type WidgetPaneRuntimeSnapshot,
	type WidgetCoordinateBridge,
	type WidgetRuntimeCapabilities,
	areRuntimeCapabilitiesEqual,
	arePaneSnapshotsEqual,
	dateFormat,
	dailyAxisFormat,
	isWidgetTestEnvironment,
	FORK_DEGRADE_PIXEL_CHECK_DELAY_MS,
	FORK_DEGRADE_PIXEL_RECHECK_DELAY_MS,
	FORK_DEGRADE_REQUIRED_BLANK_CHECKS,
	CHART_MARGIN,
	type ForkXAxisTick,
	type ForkXAxisHoverLabel,
} from "../utils/widgetHelpers";
import { createDrawingContextMenuItems, createCanvasContextMenuItems } from "@vninvestcharts/engine-drawing";
import { resolveForkHoverLabel, resolveForkTickLabel } from "../utils/xAxisTickFormatter";
import { dispatchToggleFavoritesBar } from "@vninvestcharts/engine-react";
import {
	areVisibleDomainsEqual,
	areEngineVisibleRangesEqual,
	isForkRangeTraceEnabled,
} from "../visibleRangeDiagnostics";
import { clampIndex } from "../visibleRangeBridge";
import { resolveTimeframeMs } from "../history/historyDataUtils";
import type { MagnetSensitivity } from "@vninvestcharts/engine-drawing";
import type { DrawingObject } from "@vninvestcharts/engine-drawing";
import type { DrawingWorkspaceController } from "@vninvestcharts/engine-react";
import { resolveHoveredPaneId } from "../paneInteractionUtils";
import { createSelectedPriceLabelsInput } from "../drawingPriceLabelInputs";
import { createForkDrawingPrimitiveInputs, createForkDrawingScales, resolveRenderableForkDrawings } from "../ForkDrawingsOverlay";
import { reconcileForkDrawingIndexAnchors } from "../forkAnchorReconciliation";
import { useClockAdapter } from "./useClockAdapter";
import { buildEngineDataSource, buildPineSeriesData } from "../utils/pineSeriesData";

export interface UseForkRuntimeOptions {
	useForkRuntime: boolean;
	plotData: readonly EnrichedDatum[];
	enrichedData: readonly EnrichedDatum[];
	bars: readonly any[];
	visiblePanes: readonly PaneDescriptor[];
	size: { width: number; height: number };
	scaleSlotDomains: Record<string, [number, number]>;
	activeHeights: number[];
	engineInstanceRef: React.MutableRefObject<EngineInstance | null>;
	forkEngineInstance: EngineInstance | null;
	setForkEngineInstance: React.Dispatch<React.SetStateAction<EngineInstance | null>>;
	forkVisibleRange: EngineVisibleRange | null;
	setForkVisibleRange: React.Dispatch<React.SetStateAction<EngineVisibleRange | null>>;
	forkVisibleRangeRef: React.MutableRefObject<EngineVisibleRange | null>;
	forkPaneSnapshotsRef: React.MutableRefObject<readonly WidgetPaneRuntimeSnapshot[]>;
	paneSnapshots: readonly WidgetPaneRuntimeSnapshot[];
	setPaneSnapshots: React.Dispatch<React.SetStateAction<readonly WidgetPaneRuntimeSnapshot[]>>;
	snapshotRevision: number;
	incrementSnapshotRevision: () => void;
	onPaneSnapshotsChange: ((snapshots: readonly WidgetPaneRuntimeSnapshot[]) => void) | undefined;
	onVisibleDomainChange: ((domain: [Date | number, Date | number]) => void) | undefined;
	controlledXExtents: readonly [Date | number, Date | number] | undefined;
	internalXExtents: readonly [Date | number, Date | number] | undefined;
	setInternalXExtents: React.Dispatch<React.SetStateAction<readonly [Date | number, Date | number] | undefined>>;
	symbol: string | undefined;
	localRange: string | undefined;
	showNonTradingDays: boolean;
	chartSurfaceReady: boolean;
	emitCoordinateBridge: (snapshots: readonly WidgetPaneRuntimeSnapshot[], range: EngineVisibleRange | null) => void;
	pendingForkVisibleRangeRef: React.MutableRefObject<EngineVisibleRange | null>;
	pendingForkVisibleRangeRafRef: React.MutableRefObject<number | null>;
	lastStableForkSpanRef: React.MutableRefObject<number | null>;
	pendingHistoryPatchRef: React.MutableRefObject<any>;
	lastEmittedPaneSnapshotsRef: React.MutableRefObject<readonly WidgetPaneRuntimeSnapshot[]>;
	lastPaneSnapshotsSubscriberRef: React.MutableRefObject<((snapshots: readonly WidgetPaneRuntimeSnapshot[]) => void) | undefined>;
	resolvedLegacyVisibleRangeRef: React.MutableRefObject<any>;
	drawingUiEnabled: boolean;
	isEditingText: boolean;
	drawingWorkspace: DrawingWorkspaceController;
	resolvedDrawings: readonly DrawingObject[];
	resolvedSelectedDrawing: DrawingObject | null;
	resolvedForkSingleSelection: DrawingObject | null;
	onSelectedDrawingChange: ((drawing: DrawingObject | null) => void) | undefined;
	magnetSensitivity: MagnetSensitivity;
	/** P2: crosshair display mode (cross | dot | magnet). Applied to the engine on ready + change. */
	crosshairMode?: CrosshairMode;
	forkMovableSelectionIds: readonly string[];
	activeForkManipulationDrawing: DrawingObject | null;
	forkSelectionModifierPressed: boolean;
	closeForkDrawingContextMenu: () => void;
	setForkDrawingContextMenu: (menu: any) => void;
	onContextMenu: ((payload: any, nativeEvent: any) => void) | undefined;
	onClick: ((payload: any, nativeEvent: any) => void) | undefined;
	forkAltShortcutPressedRef: React.MutableRefObject<boolean>;
	copySelectedDrawing: () => void;
	pasteCopiedDrawing: () => void;
	bringSelectedToFront: () => void;
	sendSelectedToBack: () => void;
	updateForkReadonlySelection: (drawing: DrawingObject | null) => void;
	updateForkReadonlySelectionByIds: (ids: readonly string[]) => void;
	onRuntimeDegraded: ((reason: "fork-no-render-output") => void) | undefined;
	resolvedTheme: any;
	activeLocale: string;
	forkCameraEnvelopeMode: string;
	setForkCameraEnvelopeMode: React.Dispatch<React.SetStateAction<string>>;
	handleForkVisibleRangeChange: (range: any) => void;
	activeTimeframe: string;
	enableCVD: boolean;
	cvdMode: string;
	externalCvdSeries: any[];
	cvdData: any[];
	whaleEvents: any[];
	showDrawingPriceMarkers: boolean;
	resolvedForkPriceMarkerSelection: DrawingObject | null;
	forkOverlayState: EngineOverlayState | null;
	setForkOverlayState: React.Dispatch<React.SetStateAction<EngineOverlayState | null>>;
	measurementEnabled: boolean;
	forkRenderableDrawings: readonly DrawingObject[];
	forkPointerOwnerRef: React.MutableRefObject<any>;
	claimForkPointerOwner: (owner: any) => void;
	releaseForkPointerOwner: (owner: any) => void;
	handleForkPointerDown: (event: any) => void;
	handleForkPointerMove: (event: any) => void;
	handleForkPointerUp: (event: any) => void;
	handleForkPointerLeave: (event: any) => void;
	handleForkClick: (event: any) => void;
	handleForkContextMenu: (event: any) => void;
	handleForkHostContextMenu: (event: any) => void;
	clockAdapter?: ClockAdapter;
	handleForkDrawingClick: (event: any) => void;
	cancelForkInteraction: () => void;
	forkSurfaceCursor: string;
	forkPreviewRevision: number;
	forkManipulationActive: boolean;
	forkManipulationActiveRef?: React.MutableRefObject<boolean>;
	forkRubberBandSelection: any;
	forkDrawingContextMenu: any;
	resolvedForkPrimitiveSelection: DrawingObject | null;
	dateFormatPattern?: "yyyy-mm-dd" | "dd/mm/yyyy" | "mm/dd/yyyy";
	/** B4: X-axis clock (12h / 24h) driven by the `scales.timeFormat` setting. */
	timeFormat?: "24h" | "12h";
	onRuntimeCapabilitiesChange?: (caps: WidgetRuntimeCapabilities) => void;
	t: (key: string) => string;
	containerRef: React.RefObject<HTMLDivElement | null>;
	legacyPaneSnapshots: readonly WidgetPaneRuntimeSnapshot[];
	legacyChartScale: import("../runtime/IRuntimeEngine").IRuntimeScale;
	visibleDomainRef: React.MutableRefObject<[Date, Date] | null>;
	requestVisibleHistoryWindowSync: any;
	onPaneHover?: (paneId: string | null) => void;
	onCrosshairChange?: (crosshair: CrosshairPayload) => void;
	hoveredPaneId: string | null;
	setHoveredPaneId: React.Dispatch<React.SetStateAction<string | null>>;
	hoveredPaneIdRef: React.MutableRefObject<string | null>;
	activeSymbol?: string;
	adapterLabel: string;
	forkChartRenderContextValue: any;
	forkStockChartContextValue: any;
	replayTradeMarkerFn?: (
		visibleRange: EngineVisibleRange,
		paneSnapshots: readonly PaneRuntimeSnapshot[],
	) => EngineOverlayDrawingPrimitiveInput[] | null;
	/** When set and .current is true, wall-clock gap extension is suppressed (replay mode). */
	replayActiveRef?: React.MutableRefObject<boolean>;
}

export interface UseForkRuntimeReturn {
	forkChartRenderContextValue: any;
	forkStockChartContextValue: any;
	forkXAxisTicks: ForkXAxisTick[];
	forkXAxisHoverLabel: ForkXAxisHoverLabel | undefined;
	forkHoveredDatum: EnrichedDatum | undefined;
	effectiveForkVisibleRange: EngineVisibleRange | null;
	forkDrawingPrimitiveInputs: any[];
	shouldLockForkPan: boolean;
	forkOverlayInputs: EngineOverlayInputs;
	engineDataSource: any;
	runtimeCapabilities: WidgetRuntimeCapabilities;
	paneSnapshotMap: Map<string, WidgetPaneRuntimeSnapshot>;
	forkDrawingContextMenuDrawing: DrawingObject | null;
	forkDrawingContextMenuItems: readonly any[];
	forkCanvasContextMenuItems: readonly any[];
	handleEngineReady: (engine: EngineInstance) => void;
	handleForkOverlayStateChange: (overlayState: EngineOverlayState) => void;
	emitHoveredPaneId: (paneId: string | null) => void;
	handleWidgetPointerMove: (event: any) => void;
	handleWidgetPointerLeave: () => void;
	forkDegradeNotifiedRef: React.MutableRefObject<boolean>;
}

export function useForkRuntime({
	useForkRuntime,
	plotData,
	bars,
	visiblePanes,
	scaleSlotDomains,
	engineInstanceRef,
	forkEngineInstance,
	setForkEngineInstance,
	forkVisibleRange,
	setForkVisibleRange,
	forkVisibleRangeRef,
	forkPaneSnapshotsRef,
	paneSnapshots,
	setPaneSnapshots,
	snapshotRevision,
	incrementSnapshotRevision,
	onPaneSnapshotsChange,
	onVisibleDomainChange,
	controlledXExtents,
	internalXExtents,
	setInternalXExtents,
	symbol,
	localRange,
	showNonTradingDays,
	chartSurfaceReady,
	emitCoordinateBridge,
	pendingForkVisibleRangeRef,
	pendingForkVisibleRangeRafRef,
	lastStableForkSpanRef,
	pendingHistoryPatchRef,
	lastEmittedPaneSnapshotsRef,
	lastPaneSnapshotsSubscriberRef,
	resolvedLegacyVisibleRangeRef,
	drawingUiEnabled,
	isEditingText,
	drawingWorkspace,
	resolvedDrawings,
	resolvedSelectedDrawing,
	resolvedForkSingleSelection,
	onSelectedDrawingChange,
	forkDrawingContextMenu,
	forkRenderableDrawings,
	forkPreviewRevision,
	forkManipulationActive,
	forkManipulationActiveRef,
	magnetSensitivity,
	crosshairMode = "cross",
	dateFormatPattern = "yyyy-mm-dd",
	timeFormat = "24h",
	forkMovableSelectionIds,
	activeForkManipulationDrawing,
	forkSelectionModifierPressed,
	closeForkDrawingContextMenu,
	clockAdapter,
	setForkDrawingContextMenu,
	onContextMenu,
	onClick,
	forkAltShortcutPressedRef,
	copySelectedDrawing,
	pasteCopiedDrawing,
	bringSelectedToFront,
	sendSelectedToBack,
	onRuntimeDegraded,
	resolvedTheme,
	setForkCameraEnvelopeMode,
	activeTimeframe,
	showDrawingPriceMarkers,
	resolvedForkPriceMarkerSelection,
	forkOverlayState,
	setForkOverlayState,
	measurementEnabled,
	forkPointerOwnerRef,
	t,
	containerRef,
	legacyPaneSnapshots,
	legacyChartScale,
	visibleDomainRef,
	requestVisibleHistoryWindowSync,
	onPaneHover,
	onCrosshairChange,
	setHoveredPaneId,
	hoveredPaneIdRef,
	activeSymbol,
	adapterLabel,
	resolvedForkPrimitiveSelection,
	onRuntimeCapabilitiesChange,
	forkChartRenderContextValue,
	forkStockChartContextValue,
	replayTradeMarkerFn,
	replayActiveRef,
}: UseForkRuntimeOptions): UseForkRuntimeReturn {
	const lastRuntimeCapabilitiesRef = useRef<WidgetRuntimeCapabilities | null>(null);
	const lastRuntimeCapabilitiesSubscriberRef = useRef<typeof onRuntimeCapabilitiesChange>(undefined);
	const [forkDegradeNotified, setForkDegradeNotified] = useState(false);
	const forkDegradeNotifiedRef = useRef(false);

	const effectiveForkVisibleRange = useMemo<EngineVisibleRange | null>(() => {
		const vr = (() => {
			const engine = engineInstanceRef.current;
			const range = engine?.getVisibleRange();
			if (!range || Math.abs(range.to - range.from) <= 1e-6) return null;
			return range;
		})() ?? forkVisibleRangeRef.current;
		if (vr) {
			return vr;
		}

		if (plotData.length === 0) {
			return null;
		}

		return {
			from: 0,
			to: Math.max(1, plotData.length),
		};
	}, [snapshotRevision, plotData.length, engineInstanceRef, forkVisibleRangeRef]);



	const shouldLockForkPan = useMemo(
		() => useForkRuntime
			&& drawingUiEnabled
			&& (
				drawingWorkspace.state.activeTool !== "cursor"
				|| drawingWorkspace.interaction.drawingState.type === "drawing"
				|| drawingWorkspace.interaction.drawingState.type === "moving"
				|| drawingWorkspace.interaction.drawingState.type === "resizing"
				|| forkManipulationActive
				|| (forkManipulationActiveRef?.current ?? false)
				|| drawingWorkspace.state.selectedIds.length > 0
			),
		[drawingUiEnabled, drawingWorkspace.interaction.drawingState.type, drawingWorkspace.state.activeTool, forkManipulationActive, forkManipulationActiveRef, useForkRuntime, drawingWorkspace.state.selectedIds.length],
	);

	const forkDrawingPrimitiveInputs = useMemo(() => {
		const engine = engineInstanceRef.current;
		const enginePaneSnapshots = engine?.getPaneSnapshots() ?? paneSnapshots;
		const engineVisibleRange = engine?.getVisibleRange() ?? effectiveForkVisibleRange;

		let reconciledDrawings = forkRenderableDrawings;
		let reconciledSelectedDrawing = resolvedSelectedDrawing;
		if (plotData.length > 0) {
			const timeIndexMap = createDateTimeIndexMap(plotData);
			const reconciled = reconcileForkDrawingIndexAnchors(forkRenderableDrawings, timeIndexMap);
			reconciledDrawings = reconciled.drawings;
			if (resolvedSelectedDrawing) {
				const reconciledSelected = reconcileForkDrawingIndexAnchors([resolvedSelectedDrawing], timeIndexMap);
				reconciledSelectedDrawing = reconciledSelected.drawings[0] ?? null;
			}
		}

		return createForkDrawingPrimitiveInputs({
			drawings: reconciledDrawings,
			selectedDrawing: reconciledSelectedDrawing,
			selectedDrawingIds: drawingWorkspace.state.selectedIds,
			paneSnapshots: enginePaneSnapshots,
			visibleRange: engineVisibleRange,
			plotData,
			isEditingText,
		});
	}, [snapshotRevision, plotData, forkRenderableDrawings, resolvedSelectedDrawing, drawingWorkspace.state.selectedIds, engineInstanceRef, isEditingText]);

	// Rollback safety feature flag: fallback to old array-based approach if true
	const DISABLE_LIVE_DRAWING_PROVIDER = false;

	// Live primitive provider for engine-driven drawing sync (ADR-0013)
	// Called synchronously inside engine render loop with live visibleRange + paneSnapshots
	// Must NOT depend on visibleRange, paneSnapshots, or snapshotRevision to maintain stability
	const drawingPrimitivesProvider = useCallback(
		(
			visibleRange: EngineVisibleRange,
			enginePaneSnapshots: readonly PaneRuntimeSnapshot[]
		) => {
			if (DISABLE_LIVE_DRAWING_PROVIDER) {
				return null;
			}
			if (!visibleRange || plotData.length === 0 || enginePaneSnapshots.length === 0) {
				return null;
			}

			let reconciledDrawings = forkRenderableDrawings;
			let reconciledSelectedDrawing = resolvedSelectedDrawing;
			const timeIndexMap = createDateTimeIndexMap(plotData);
			const reconciled = reconcileForkDrawingIndexAnchors(forkRenderableDrawings, timeIndexMap);
			reconciledDrawings = reconciled.drawings;
			if (resolvedSelectedDrawing) {
				const reconciledSelected = reconcileForkDrawingIndexAnchors([resolvedSelectedDrawing], timeIndexMap);
				reconciledSelectedDrawing = reconciledSelected.drawings[0] ?? null;
			}

			const drawingInputs = createForkDrawingPrimitiveInputs({
				drawings: reconciledDrawings,
				selectedDrawing: reconciledSelectedDrawing,
				selectedDrawingIds: drawingWorkspace.state.selectedIds,
				paneSnapshots: enginePaneSnapshots,
				visibleRange,
				plotData,
				isEditingText,
			});

			const tradeMarkers = replayTradeMarkerFn?.(visibleRange, enginePaneSnapshots) ?? [];

			return drawingInputs && tradeMarkers.length > 0
				? [...drawingInputs, ...tradeMarkers]
				: drawingInputs ?? (tradeMarkers.length > 0 ? tradeMarkers : null);
		},
		[forkRenderableDrawings, resolvedSelectedDrawing, drawingWorkspace.state.selectedIds, plotData, isEditingText, replayTradeMarkerFn]
	);

	const reconciledForkPriceMarkerSelection = useMemo(() => {
		if (!resolvedForkPriceMarkerSelection || plotData.length === 0) {
			return resolvedForkPriceMarkerSelection;
		}
		const timeIndexMap = createDateTimeIndexMap(plotData);
		const reconciled = reconcileForkDrawingIndexAnchors([resolvedForkPriceMarkerSelection], timeIndexMap);
		return reconciled.drawings[0] ?? null;
	}, [resolvedForkPriceMarkerSelection, plotData]);

	const forkOverlayInputs = useMemo<EngineOverlayInputs>(() => ({
		measurementEnabled: Boolean((measurementEnabled ?? false) || shouldLockForkPan),
		selectedPriceLabels: createSelectedPriceLabelsInput(
			reconciledForkPriceMarkerSelection,
			Boolean(showDrawingPriceMarkers),
			visiblePanes[0]?.id ?? null,
		),
		drawingPrimitives: DISABLE_LIVE_DRAWING_PROVIDER ? forkDrawingPrimitiveInputs : null,
		drawingPrimitivesProvider: DISABLE_LIVE_DRAWING_PROVIDER ? undefined : drawingPrimitivesProvider,
	}), [drawingPrimitivesProvider, forkDrawingPrimitiveInputs, measurementEnabled, reconciledForkPriceMarkerSelection, shouldLockForkPan, showDrawingPriceMarkers, visiblePanes]);


	const pineSeries = useMemo(() => buildPineSeriesData(visiblePanes, plotData), [visiblePanes, plotData]);
	const engineDataSource = useMemo(() => buildEngineDataSource({ adapterLabel, activeSymbol, activeTimeframe }, pineSeries), [adapterLabel, activeSymbol, activeTimeframe, pineSeries]);

	const runtimeCapabilities = useMemo<WidgetRuntimeCapabilities>(() => ({
		engineRuntime: "fork",
		forkSupported: useForkRuntime,
		paneToolbar: true,
		paneSplitters: true,
		chartCanvasOverlays: useForkRuntime ? (forkChartRenderContextValue !== null && !forkDegradeNotified) : true,
		measurementOverlay: true,
		drawingOverlays: true,
	}), [forkChartRenderContextValue, useForkRuntime, forkDegradeNotified]);

	useEffect(() => {
		const subscriberChanged = lastRuntimeCapabilitiesSubscriberRef.current !== onRuntimeCapabilitiesChange;
		if (!subscriberChanged && areRuntimeCapabilitiesEqual(lastRuntimeCapabilitiesRef.current, runtimeCapabilities)) {
			return;
		}

		lastRuntimeCapabilitiesRef.current = runtimeCapabilities;
		lastRuntimeCapabilitiesSubscriberRef.current = onRuntimeCapabilitiesChange;
		onRuntimeCapabilitiesChange?.(runtimeCapabilities);
	}, [onRuntimeCapabilitiesChange, runtimeCapabilities]);

	// B3: visible-range emit removed — useWidgetData.handleForkVisibleRangeChange
	// (engine callback with timeRange + dedup) is the single emit path (SY-04).
	// forkVisibleRange state stays for render/overlay consumption only.

	const MAX_EXTENDED_BARS = 100;
	const handleEngineReady = useCallback((engine: EngineInstance) => {
		engineInstanceRef.current = engine;
		if (typeof window !== "undefined") {
			(window as any).__VN_ENGINE__ = engine; // ARC-1-keep: legacy bridge
		}
		setForkCameraEnvelopeMode(engine.getCameraState().envelopeMode ?? "shared");

		const dataLength = bars.length > 0 ? bars.length : plotData.length;
		if (dataLength > 0) {
			const defaultVisibleBars = 100;
			const fromIdx = Math.max(0, dataLength - defaultVisibleBars);

			// Extend right edge to show blank space between last bar and wall-clock now
			let extendedTo = dataLength;
			if (!replayActiveRef?.current) {
				const activeData = plotData.length > 0 ? plotData : bars;
				const lastBar = activeData.length > 0 ? activeData[activeData.length - 1] : null;
				const lastBarMs = lastBar?.date?.getTime();
				if (lastBarMs) {
					const gapMs = Date.now() - lastBarMs;
					if (gapMs > 0) {
						const tfMs = resolveTimeframeMs(activeTimeframe as any); // ARC-1-keep: legacy bridge
						if (tfMs > 0 && gapMs > tfMs * 1.5) {
							const gapBars = Math.min(Math.ceil(gapMs / tfMs), MAX_EXTENDED_BARS);
							extendedTo = dataLength + gapBars;
						}
					}
				}
			}
			const defaultRange: EngineVisibleRange = { from: fromIdx, to: extendedTo };
			forkVisibleRangeRef.current = defaultRange;

			const initialVisibleRange = engine.getVisibleRange();
			const initialRangeSpan = initialVisibleRange ? Math.abs(initialVisibleRange.to - initialVisibleRange.from) : 0;
			const shouldUseInitialVisibleRange = Boolean(initialVisibleRange)
				&& !(dataLength > 2 && initialRangeSpan <= 1);
			if (shouldUseInitialVisibleRange && initialVisibleRange) {
				forkVisibleRangeRef.current = initialVisibleRange;
				setForkVisibleRange((currentRange) => (
					areEngineVisibleRangesEqual(currentRange, initialVisibleRange)
						? currentRange
						: initialVisibleRange
				));
			} else {
				setForkVisibleRange((currentRange) => (
					areEngineVisibleRangesEqual(currentRange, defaultRange)
						? currentRange
						: defaultRange
				));
			}
		} else {
			// Do not force a 1-bar defaultRange state when loading.
			// Let the data engine initialize the viewport natively once data is loaded.
			forkVisibleRangeRef.current = null;
			setForkVisibleRange(null);
		}
		incrementSnapshotRevision();
		setForkEngineInstance(engine);
	}, [bars.length, plotData.length, incrementSnapshotRevision, setForkCameraEnvelopeMode, setForkEngineInstance, setForkVisibleRange, forkVisibleRangeRef, engineInstanceRef]);

	// P2: push crosshair display mode + drawing magnet sensitivity into the
	// engine. Setters are idempotent (early-return when unchanged), so this is
	// safe to re-run on engine-instance change without render loops.
	useEffect(() => {
		const engine = forkEngineInstance ?? engineInstanceRef.current;
		if (!engine || !useForkRuntime) return;
		try {
			engine.setCrosshairMode?.(crosshairMode);
			engine.setCrosshairMagnet?.(magnetSensitivity);
		} catch {
			// Engine without P2a API (stale dist) — crosshair stays default.
		}
	}, [forkEngineInstance, crosshairMode, magnetSensitivity, useForkRuntime, engineInstanceRef]);

	useEffect(() => {
		const engine = engineInstanceRef.current;
		if (!engine || !useForkRuntime || plotData.length === 0) return;

		if (forkVisibleRangeRef.current === null) {
			const dataLength = plotData.length;
			const defaultVisibleBars = 100;
			const fromIdx = Math.max(0, dataLength - defaultVisibleBars);

			// Extend right edge to show blank space between last bar and wall-clock now
			let extendedTo = dataLength;
			const hasWallClockGap = !replayActiveRef?.current;
			if (hasWallClockGap) {
				const lastBarMs = plotData[plotData.length - 1]?.date?.getTime();
				if (lastBarMs) {
					const gapMs = Date.now() - lastBarMs;
					if (gapMs > 0) {
						const tfMs = resolveTimeframeMs(activeTimeframe as any); // ARC-1-keep: legacy bridge
						if (tfMs > 0 && gapMs > tfMs * 1.5) {
							const gapBars = Math.min(Math.ceil(gapMs / tfMs), MAX_EXTENDED_BARS);
							extendedTo = dataLength + gapBars;
						}
					}
				}
			}
			const defaultRange: EngineVisibleRange = { from: fromIdx, to: extendedTo };

			forkVisibleRangeRef.current = defaultRange;
			setForkVisibleRange(defaultRange);
			engine.zoomToRange(defaultRange);
			// Always enable followLatest so the chart shows the latest data on startup.
			// setCameraState clears _zoomToRangeActive (set by zoomToRange) and triggers
			// syncCameraAfterDataChange which auto-scrolls to the right edge.
			// Without this, _zoomToRangeActive blocks auto-scroll (KernelEngine line 794),
			// freezing the viewport at the initial range — showing historical data instead
			// of the latest bar.
			// V-06: 3-bar right breathing room so the last candle never touches the
			// price axis (followLatest keeps the gap on live append).
			engine.setCameraState({ followLatest: true, rightOffsetBars: 3 });
		}
	}, [plotData.length, useForkRuntime, forkEngineInstance, activeTimeframe, replayActiveRef]);

	useEffect(() => {
		const engine = engineInstanceRef.current;
		if (!engine || !useForkRuntime) return;

		const anyOverlayNeedsNormalization = visiblePanes.some((p) =>
			p.series.some((s) => s.overlaySymbolId && s.normalizeToBaseline === true),
		);
		if (typeof engine.setAxisLabelFormatters === "function") {
			// Right axis always shows full grouped numbers ("84,000", never
			// "84.00K"); normalized compare mode keeps the % readout.
			engine.setAxisLabelFormatters({
				right: anyOverlayNeedsNormalization
					? (v: number) => {
						const sign = v >= 0 ? "+" : "";
						return `${sign}${v.toFixed(2)}%`;
					}
					: formatAxisPrice,
			});
		}
	}, [visiblePanes, useForkRuntime, engineInstanceRef]);

	const emitHoveredPaneId = useCallback((paneId: string | null) => {
		if (hoveredPaneIdRef.current === paneId) {
			return;
		}

		hoveredPaneIdRef.current = paneId;
		setHoveredPaneId(paneId);
		onPaneHover?.(paneId);
	}, [onPaneHover, setHoveredPaneId, hoveredPaneIdRef]);

	const handleWidgetPointerMove = useCallback((event: any) => {
		if (useForkRuntime && forkPointerOwnerRef.current !== null) {
			return;
		}

		const activeSnapshots = useForkRuntime ? paneSnapshots : legacyPaneSnapshots;
		const resolvedId = resolveHoveredPaneId(event, activeSnapshots);
		emitHoveredPaneId(resolvedId);
	}, [emitHoveredPaneId, legacyPaneSnapshots, paneSnapshots, useForkRuntime, forkPointerOwnerRef]);

	const handleWidgetPointerLeave = useCallback(() => {
		if (useForkRuntime && forkPointerOwnerRef.current !== null) {
			return;
		}

		emitHoveredPaneId(null);
	}, [emitHoveredPaneId, useForkRuntime, forkPointerOwnerRef]);

	const handleForkOverlayStateChange = useCallback((overlayState: EngineOverlayState) => {
		setForkOverlayState(overlayState);
		// Sync crosshair to remote charts: send X (dataIndex) and Y (price at mouse position)
		if (onCrosshairChange) {
			if (overlayState.crosshair) {
				const crosshairState = overlayState.crosshair;
				const dataIndex = crosshairState.dataIndex;
				const datum = (dataIndex !== null && dataIndex >= 0 && dataIndex < plotData.length)
					? plotData[dataIndex]
					: null;
				if (datum && dataIndex != null) {
					// Compute price at mouse Y from engine pane snapshots
					let price = datum.close;
					const engine = engineInstanceRef.current;
					if (engine && crosshairState.paneId != null && Number.isFinite(crosshairState.y)) {
						const snapshots = engine.getPaneSnapshots();
						const hoveredSnapshot = snapshots.find(s => s.paneId === crosshairState.paneId);
						if (hoveredSnapshot) {
							const rightSlot = Object.keys(hoveredSnapshot.scaleSlotStates).find(
								id => hoveredSnapshot.scaleSlotStates[id]?.side === "right"
							);
							if (rightSlot) {
								const mousePrice = resolvePaneValueAtPixel(hoveredSnapshot, rightSlot, crosshairState.y);
								if (mousePrice !== null) {
									price = mousePrice;
								}
							}
						}
					}
					onCrosshairChange({
						timestamp: datum.date.getTime(),
						xIndexFloat: crosshairState.xIndexFloat ?? dataIndex + 0.5,
						price,
						symbol,
						isHovering: true,
					});
				}
			} else {
				onCrosshairChange({
					timestamp: 0,
					isHovering: false,
				});
			}
		}
	}, [setForkOverlayState, onCrosshairChange, plotData, symbol, engineInstanceRef]);

	const forkHoveredDatum = useMemo(() => {
		const hoveredDataIndex = forkOverlayState?.hoveredDataIndex ?? null;
		if (hoveredDataIndex === null || plotData.length === 0) {
			return undefined;
		}

		return plotData[clampIndex(hoveredDataIndex, plotData.length)];
	}, [forkOverlayState, plotData]);



	const forkXAxisTicks = useMemo(() => {
		if (!useForkRuntime || !forkOverlayState || plotData.length === 0) {
			return [] as ForkXAxisTick[];
		}

		const engine = engineInstanceRef.current;
		const activeVisibleRange = (() => {
			const range = engine?.getVisibleRange();
			if (!range || Math.abs(range.to - range.from) <= 1e-6) return null;
			return range;
		})() ?? effectiveForkVisibleRange ?? { from: 0, to: Math.max(1, plotData.length) };
		const fromIndex = clampIndex(activeVisibleRange.from, plotData.length);
		const toIndexExclusive = Math.min(plotData.length, Math.max(fromIndex + 1, Math.ceil(activeVisibleRange.to)));
		const visibleBarCount = Math.max(1, toIndexExclusive - fromIndex);

		const estimateLabelWidth = (label: string): number => label.length * 6 + 8;
		const collisionThreshold = 12;
		let lastLabelEnd = -Infinity;
		// TV-style day tracking: same-day ticks show time only (no "16/09 16/09").
		let prevDayKey: string | null = null;
		let prevKeptLabel: string | null = null;
		const out: ForkXAxisTick[] = [];

		for (const tick of forkOverlayState.xAxisTicks) {
			const datum = plotData[clampIndex(tick.dataIndex, plotData.length)];
			if (!datum) {
				continue;
			}

			const resolved = resolveForkTickLabel(datum.date, activeTimeframe, visibleBarCount, dateFormatPattern, prevDayKey, timeFormat);
			prevDayKey = resolved.dayKey;
			// Safety net (all modes incl. monthYear): never keep adjacent duplicates.
			if (resolved.label === prevKeptLabel) {
				continue;
			}
			const tickLabel: string = resolved.label;
			const labelWidth = estimateLabelWidth(tickLabel);
			const halfWidth = labelWidth / 2;
			const labelStart = tick.x - halfWidth;
			const labelEnd = tick.x + halfWidth;

			if (labelStart < lastLabelEnd + collisionThreshold) {
				continue;
			}

			lastLabelEnd = labelEnd;
			prevKeptLabel = tickLabel;

			out.push({
				key: tick.key,
				x: tick.x,
				label: tickLabel,
			});
		}

		return out;
	}, [activeTimeframe, effectiveForkVisibleRange, forkOverlayState, plotData, useForkRuntime, snapshotRevision, engineInstanceRef, dateFormatPattern, timeFormat]);

	const forkXAxisHoverLabel = useMemo<ForkXAxisHoverLabel | undefined>(() => {
		if (!useForkRuntime || !forkOverlayState?.crosshair || plotData.length === 0) {
			return undefined;
		}

		const hoveredIndex = forkOverlayState.crosshair.dataIndex;
		if (hoveredIndex === null) {
			return undefined;
		}

		const datum = plotData[clampIndex(hoveredIndex, plotData.length)];
		if (!datum) {
			return undefined;
		}

		return {
			x: forkOverlayState.crosshair.x,
			// AB-06: nhãn hover theo `scales.timeFormat` (như trục X) — xem resolveForkHoverLabel.
			label: resolveForkHoverLabel(datum.date, activeTimeframe, dateFormatPattern, timeFormat),
		};
	}, [activeTimeframe, forkOverlayState, plotData, useForkRuntime, dateFormatPattern, timeFormat]);

	useEffect(() => {
		if (!useForkRuntime || !chartSurfaceReady || paneSnapshots.length === 0 || plotData.length === 0 || typeof window === "undefined") {
			forkDegradeNotifiedRef.current = false;
			setForkDegradeNotified(false);
			return;
		}

		const timers: number[] = [];
		const runPixelCheck = (blankChecks: number) => {
			if (forkDegradeNotifiedRef.current) {
				return;
			}

			const root = containerRef.current;
			if (!root) {
				return;
			}

			const canvas = root.querySelector('canvas[data-vn-kline-engine="canvas"]') as HTMLCanvasElement | null;
			if (!canvas || canvas.width <= 1 || canvas.height <= 1) {
				return;
			}

			const context = canvas.getContext("2d", { willReadFrequently: true });
			if (!context || typeof context.getImageData !== "function") {
				return;
			}

			const buffer = context.getImageData(0, 0, canvas.width, canvas.height).data;
			let hasRenderedPixels = false;
			for (let index = 3; index < buffer.length; index += 4) {
				if ((buffer[index] ?? 0) > 0) {
					hasRenderedPixels = true;
					break;
				}
			}

			if (hasRenderedPixels) {
				return;
			}

			const nextBlankChecks = blankChecks + 1;
			if (nextBlankChecks < FORK_DEGRADE_REQUIRED_BLANK_CHECKS) {
				timers.push(setTimeout(() => {
					runPixelCheck(nextBlankChecks);
				}, FORK_DEGRADE_PIXEL_RECHECK_DELAY_MS));
				return;
			}

			if (!hasRenderedPixels) {
				forkDegradeNotifiedRef.current = true;
				setForkDegradeNotified(true);
				onRuntimeDegraded?.("fork-no-render-output");
			}
		};

		timers.push(setTimeout(() => {
			runPixelCheck(0);
		}, FORK_DEGRADE_PIXEL_CHECK_DELAY_MS));

		return () => {
			timers.forEach((timer) => clearTimeout(timer));
		};
	}, [chartSurfaceReady, onRuntimeDegraded, paneSnapshots.length, plotData.length, containerRef, useForkRuntime]);

	// Use clock adapter for timers
	const { setTimeout, clearTimeout } = useClockAdapter({ clockAdapter });

	const forkDrawingContextMenuDrawing = useMemo(() => {
		if (!forkDrawingContextMenu || forkDrawingContextMenu.drawingId === null) {
			return null;
		}

		return resolvedDrawings.find((drawing) => drawing.id === forkDrawingContextMenu.drawingId) ?? resolvedSelectedDrawing;
	}, [forkDrawingContextMenu, resolvedDrawings, resolvedSelectedDrawing]);

	const forkDrawingContextMenuItems = useMemo(() => {
		if (!forkDrawingContextMenuDrawing) {
			return [];
		}

		return createDrawingContextMenuItems(
			forkDrawingContextMenuDrawing,
			drawingWorkspace.state.clipboard !== null,
			{
				copy: t("drawing.copy"),
				paste: t("drawing.paste"),
				bringToFront: t("drawing.bringToFront"),
				sendToBack: t("drawing.sendToBack"),
				bringForward: t("drawing.bringForward"),
				sendBackward: t("drawing.sendBackward"),
				duplicate: t("drawing.duplicate"),
				lock: t("drawing.lock"),
				unlock: t("drawing.unlock"),
				hide: t("drawing.hide"),
				show: t("drawing.show"),
				selectGroup: t("drawing.selectGroup"),
				deleteGroup: t("drawing.deleteGroup"),
			},
			{
				copySelectedDrawing,
				pasteCopiedDrawing,
				bringSelectedToFront,
				sendSelectedToBack,
				bringSelectedForward: () => drawingWorkspace.interaction.bringSelectedForward?.(),
				sendSelectedBackward: () => drawingWorkspace.interaction.sendSelectedBackward?.(),
				duplicateSelected: () => drawingWorkspace.interaction.duplicateSelected?.(),
				toggleSelectedLock: (locked) => drawingWorkspace.interaction.toggleSelectedLock?.(locked),
				toggleSelectedVisible: (visible) => drawingWorkspace.interaction.toggleSelectedVisible?.(visible),
				selectGroup: (groupId) => drawingWorkspace.interaction.selectGroup(groupId),
				deleteGroup: (groupId) => drawingWorkspace.interaction.deleteGroup(groupId),
			},
		);
	}, [bringSelectedToFront, copySelectedDrawing, drawingWorkspace, forkDrawingContextMenuDrawing, pasteCopiedDrawing, sendSelectedToBack, t]);

	// P3-b: canvas menu items (empty-chart right-click, drawingId null).
	const forkCanvasContextMenuItems = useMemo(() => {
		if (!forkDrawingContextMenu || forkDrawingContextMenu.drawingId !== null) {
			return [];
		}

		return createCanvasContextMenuItems(
			drawingWorkspace.state.clipboard !== null,
			{
				paste: t("drawing.paste"),
				toggleFavoritesBar: `${t("toolbar.toggleFavoritesBar")} (Alt+S)`,
			},
			{
				pasteCopiedDrawing,
				toggleFavoritesBar: dispatchToggleFavoritesBar,
			},
		);
	}, [drawingWorkspace, forkDrawingContextMenu, pasteCopiedDrawing, t]);

	const paneSnapshotMap = useMemo(
		() => new Map(paneSnapshots.map((snapshot) => [snapshot.paneId, snapshot] as const)),
		[paneSnapshots]
	);

	return {
		forkChartRenderContextValue,
		forkStockChartContextValue,
		forkXAxisTicks,
		forkXAxisHoverLabel,
		forkHoveredDatum,
		effectiveForkVisibleRange,
		forkDrawingPrimitiveInputs,
		shouldLockForkPan,
		forkOverlayInputs,
		engineDataSource,
		runtimeCapabilities,
		paneSnapshotMap,
		forkDrawingContextMenuDrawing,
		forkDrawingContextMenuItems,
		forkCanvasContextMenuItems,
		handleEngineReady,
		handleForkOverlayStateChange,
		emitHoveredPaneId,
		handleWidgetPointerMove,
		handleWidgetPointerLeave,
		forkDegradeNotifiedRef,
	};
}