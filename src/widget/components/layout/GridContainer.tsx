import React, { useMemo, useCallback, useState, useEffect, useRef } from "react";
import { GridLayout, SlotConfig } from "../../grid/types";
import { VNInvestCharts, type VNInvestChartsProps, type VNInvestChartsRef } from "../../VNInvestCharts";
import { type CorporateEvent } from "../events/CorporateEventsOverlay";
import { type DrawingOperation } from "@vninvestcharts/engine-react";
import { CellPricePaneHeader } from "./CellPricePaneHeader";
import type { Timeframe } from "@vninvestcharts/engine-react";
import type { WidgetChartHandle } from "../../utils/widgetHelpers";
import type { FullChartHandle } from "../../types/fullChartHandle";
import type { DrawingWorkspaceController } from "@vninvestcharts/engine-react";
import { PaneHeader } from "../../../lib/core/PaneHeader";
import { useSyncContextShare } from "../../context/SyncContextShare";
import { useWebGLFreezeThaw } from "../../hooks/useIntersectionObserver";
import { MemoryBudgetManager } from "../../grid/MemoryBudgetManager";
import { GridChartRegistry } from "../../grid/GridChartRegistry";
import type { MultiChartConfig } from "../../VNInvestMultiCharts";
import { useViewportBreakpoint } from "../../hooks/useViewportBreakpoint";
import { MobileChartCarousel } from "../mobile/MobileChartCarousel";
import { GridSlotErrorBoundary } from "./GridSlotErrorBoundary";
import { DrawingConflictNotice } from "./DrawingConflictNotice";
import { withDrawingSourceSymbol, shouldApplyRemoteDrawing, shouldNotifyDrawingConflict } from "../../utils/drawingSync";
import { isContainedEcho } from "../../utils/rangeSync";
import styles from "./GridContainer.module.css";
import { useWidgetI18n } from "../../context/WidgetI18nContext";
import { getTrackPixelValue, calculateAriaValues } from "./gridSplitterMath";
import { useGridSplitterDrag } from "./useGridSplitterDrag";
import { WorkspaceSettingsProvider } from "../settings/WorkspaceSettingsContext";
const CHART_AXIS_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316", "#6366f1"];

/**
 * TRADEMARK_FIX: style contract for the price-pane header wrapper.
 * Keeps the left axis/rail clearance from `paneHeaderStyle` but forces the
 * designed full-bleed right side (⚙ margin-right:88px + trademark absolute
 * right:12px overlay the right Y gutter). Insetting the right side dragged
 * the trademark ~48px off the edge in multi-chart cells.
 */
export function resolvePriceHeaderWrapStyle(
	paneHeaderStyle: React.CSSProperties | undefined,
): React.CSSProperties {
	return { ...(paneHeaderStyle ?? {}), paddingRight: 0, width: "100%", boxSizing: "border-box" };
}
// Phase 0: instrumentation session
let instrumentationSessionId: string | null = null;

function startLayoutSession(chartIds: string[]) {
	instrumentationSessionId = crypto.randomUUID();
	const detail = { sessionId: instrumentationSessionId, chartCount: chartIds.length };
	performance.mark('layout-session-start', { detail });
	window.__INST_SESSION_ID = instrumentationSessionId;
	return instrumentationSessionId;
}
interface GridContainerProps {
  charts: MultiChartConfig[];
  layout: GridLayout;
  activeChartId: string | null;
	syncSettings: {
    visibleRange: boolean;
    crosshair: boolean;
    drawings: boolean;
    symbolLinks: boolean;
    timeframe: boolean;
    chartType: boolean;
    replay: boolean;
    time: boolean;
  };
  defaultChartProps: Partial<VNInvestChartsProps>;
  resizeAdapter?: VNInvestChartsProps["resizeAdapter"];
  keyboardAdapter?: VNInvestChartsProps["keyboardAdapter"];
  clockAdapter?: VNInvestChartsProps["clockAdapter"];
  storageAdapter?: VNInvestChartsProps["storageAdapter"];
  portalAdapter?: VNInvestChartsProps["portalAdapter"];
  registryAdapter?: VNInvestChartsProps["registryAdapter"];
  // Portal SSOT (Pre-P2)
  portalRoot?: HTMLElement | null;
  shadowRoot?: ShadowRoot | null;
  chartRefs: React.MutableRefObject<Map<string, React.RefObject<FullChartHandle | null>>>;
  chartHandles: React.MutableRefObject<Map<string, FullChartHandle>>;
  setActiveChart: (chartId: string) => void;
  addChart: (config: MultiChartConfig, row?: number, col?: number) => void;
  // Hover emitter refs for OHLC hover tooltip
  hoverEmitterRefs?: React.MutableRefObject<Map<string, React.RefObject<{ current: unknown } | null>> | { emitterMap?: Map<string, unknown> }>;
  onDrawingWorkspaceChange?: (chartId: string, workspace: DrawingWorkspaceController) => void;
  onLayoutChange?: (layout: GridLayout) => void;
  onChartConfigChange?: (chartId: string, updates: Partial<MultiChartConfig>) => void;
  onSymbolSearchClick?: (chartId: string) => void;
  onComparisonChange?: (chartId: string, overlays: any[]) => void;
  showSymbolBadges?: boolean;
  syncOverrideMap?: Record<string, Record<string, boolean>>;
  onToggleSyncOverride?: (chartId: string, type: string) => void;
  showCorporateEvents?: boolean;
  corporateEvents?: readonly CorporateEvent[];
	activeTool?: string;
	/** Khi true, Alt+click luôn chọn replay start bar (truyền từ showReplayBar của multi-chart). */
	replaySelectionEnabled?: boolean;
	/** UI-D2: controlled maximize. Khi undefined, GridContainer tự quản lý nội bộ. */
	maximizedChartId?: string | null;
	onMaximizedChange?: (chartId: string | null) => void;
}

const getHoverEmitterRef = (hoverEmitterRefs: any, chartId: string) => {
	if (!hoverEmitterRefs?.current) return { current: null };
	const map = hoverEmitterRefs.current.emitterMap || hoverEmitterRefs.current;
	if (map && typeof map.get === "function") {
		return map.get(chartId) ?? { current: null };
	}
	return { current: null };
};
function resolveSlotBoundsFromTemplate(areaName: string, templateAreas?: string[]) {
	if (!templateAreas || templateAreas.length === 0) {
		return { rowStart: 1, rowEnd: 1, colStart: 1, colEnd: 1 };
	}
	let minRow = 99, maxRow = -99, minCol = 99, maxCol = -99;
	templateAreas.forEach((rowStr, rIndex) => {
		const cols = rowStr.split(/\s+/);
		cols.forEach((colName, cIndex) => {
			if (colName === areaName) {
				minRow = Math.min(minRow, rIndex + 1);
				maxRow = Math.max(maxRow, rIndex + 1);
				minCol = Math.min(minCol, cIndex + 1);
				maxCol = Math.max(maxCol, cIndex + 1);
			}
		});
	});
	if (minRow === 99) return { rowStart: 1, rowEnd: 1, colStart: 1, colEnd: 1 };
	return {
		rowStart: minRow,
		rowEnd: maxRow,
		colStart: minCol,
		colEnd: maxCol
	};
}
interface GridChartSlotProps {
	chartId: string;
	index: number;
	chartConfig: MultiChartConfig;
	isActive: boolean;
	isSelected: boolean;
	areaName: string;
	chartRef: React.RefObject<FullChartHandle | null>;
	chartRefs: React.MutableRefObject<Map<string, React.RefObject<FullChartHandle | null>>>;
	chartHandles: React.MutableRefObject<Map<string, FullChartHandle>>;
	frozenSnapshots: Map<string, ImageBitmap | HTMLCanvasElement | null>;
	setFrozenSnapshots: React.Dispatch<React.SetStateAction<Map<string, ImageBitmap | HTMLCanvasElement | null>>>;
	hoverEmitterRefs?: GridContainerProps["hoverEmitterRefs"];
	defaultChartProps: Partial<VNInvestChartsProps>;
	resizeAdapter?: VNInvestChartsProps["resizeAdapter"];
	keyboardAdapter?: VNInvestChartsProps["keyboardAdapter"];
	clockAdapter?: VNInvestChartsProps["clockAdapter"];
	storageAdapter?: VNInvestChartsProps["storageAdapter"];
	portalAdapter?: VNInvestChartsProps["portalAdapter"];
	registryAdapter?: VNInvestChartsProps["registryAdapter"];
	portalRoot?: HTMLElement | null;
	shadowRoot?: ShadowRoot | null;
	syncContext: any;
	syncSettings: any;
	setActiveChart: (chartId: string) => void;
	chartIds: string[];
	layout: GridLayout;
	onDrawingWorkspaceChange?: (chartId: string, workspace: DrawingWorkspaceController) => void;
	onSplitterPointerDown?: (e: React.PointerEvent<HTMLDivElement>, type: 'row' | 'col', index: number) => void;
	onSplitterKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>, type: 'row' | 'col', index: number) => void;
	onSplitterDoubleClick?: (type: 'row' | 'col') => void;
	onChartConfigChange?: (chartId: string, updates: Partial<MultiChartConfig>) => void;
	onSymbolSearchClick?: (chartId: string) => void;
	onComparisonChange?: (chartId: string, overlays: any[]) => void;
	isMobile?: boolean;
	showSymbolBadges?: boolean;
	syncOverrides?: Record<string, boolean>;
	onToggleSyncOverride?: (chartId: string, type: string) => void;
	showCorporateEvents?: boolean;
	corporateEvents?: readonly CorporateEvent[];
	isMaximized?: boolean;
	toggleMaximize?: (chartId: string) => void;
	trackSizes?: { rows: string[]; cols: string[] };
	containerEl?: HTMLDivElement | null;
	/** Khi true, Alt+click luôn chọn replay start bar (truyền từ showReplayBar của multi-chart). */
	replaySelectionEnabled?: boolean;
	/** UI-D2: controlled maximize. Khi undefined, GridContainer tự quản lý nội bộ. */
	maximizedChartId?: string | null;
	onMaximizedChange?: (chartId: string | null) => void;
}

const GridChartSlot: React.FC<GridChartSlotProps> = ({
	chartId,
	index,
	chartConfig,
	isActive,
	isSelected,
	areaName,
	chartRef,
	chartRefs,
	chartHandles,
	frozenSnapshots,
	setFrozenSnapshots,
	hoverEmitterRefs,
	defaultChartProps,
	resizeAdapter,
	keyboardAdapter,
	clockAdapter,
	storageAdapter,
	portalAdapter,
	registryAdapter,
	portalRoot,
	shadowRoot,
	syncContext,
	syncSettings,
	setActiveChart,
	chartIds,
	layout,
	onDrawingWorkspaceChange,
	onSplitterPointerDown,
	onSplitterKeyDown,
	onSplitterDoubleClick,
	onChartConfigChange,
	onSymbolSearchClick,
	onComparisonChange,
	isMobile = false,
	showSymbolBadges = true,
	syncOverrides,
	onToggleSyncOverride,
	showCorporateEvents,
	corporateEvents,
	isMaximized = false,
	toggleMaximize,
	trackSizes,
	containerEl,
	replaySelectionEnabled,
}) => {
	const { t } = useWidgetI18n();
	const { ref: observerRef, isFrozen, isThawing, visibilityState } = useWebGLFreezeThaw({
		freezeThreshold: 0.5,
		thawThreshold: 0.1,
		debounceMs: 100,
		onFreeze: async () => {
			await MemoryBudgetManager.freezeContext(chartId);
			const handle = chartHandles.current.get(chartId);
			if (handle && handle._frozenSnapshot) {
				setFrozenSnapshots(prev => {
					const next = new Map(prev);
					if (handle._frozenSnapshot) next.set(chartId, handle._frozenSnapshot);
					return next;
				});
			}
		},
		onThaw: async () => {
			await MemoryBudgetManager.thawContext(chartId);
			setFrozenSnapshots(prev => {
				const next = new Map(prev);
				next.delete(chartId);
				return next;
			});
		},
	});

	// Ref-based sync settings guard — no re-registration on toggle
	const syncSettingsRef = useRef(syncSettings);
	syncSettingsRef.current = syncSettings;
	const chartConfigRef = useRef(chartConfig);
	chartConfigRef.current = chartConfig;
	const syncOverridesRef = useRef(syncOverrides);
	syncOverridesRef.current = syncOverrides;

	// Flags to block echo loops: when a remote update is being applied,
	// the engine fires onXxxChange which must NOT re-broadcast.
	const isApplyingRemoteRangeRef = useRef(false);
	const isApplyingRemoteCrosshairRef = useRef(false);
	// F2/Q5: late-joiner catch-up — last synced range + one-shot request state.
	const rangeCatchupRef = useRef<{ lastRange: any; didRequest: boolean; remoteApplied: boolean }>({
		lastRange: null, didRequest: false, remoteApplied: false,
	});

	const handleSymbolChange = useCallback((symbol: string) => {
		onChartConfigChange?.(chartId, { symbol });
		if (syncSettingsRef.current.symbolLinks && chartConfigRef.current?.symbolLinkGroup && syncOverridesRef.current?.symbol !== false) {
			syncContext?.setGroupSymbol(chartConfigRef.current.symbolLinkGroup, symbol);
		}
	}, [onChartConfigChange, chartId, syncContext]);

	const handleTimeframeChange = useCallback((timeframe: string) => {
		const prevTf = chartConfigRef.current?.timeframe;
		if (prevTf === timeframe) return;
		onChartConfigChange?.(chartId, { timeframe: timeframe as Timeframe });
		if (syncSettingsRef.current.timeframe && syncOverridesRef.current?.timeframe !== false) {
			syncContext?.setTimeframe?.(chartId, timeframe as Timeframe);
		}
	}, [onChartConfigChange, chartId, syncContext]);

	const handleChartTypeChange = useCallback((chartType: string) => {
		const prevType = chartConfigRef.current?.engineState?.chartType;
		if (prevType === chartType) return;
		onChartConfigChange?.(chartId, {
			engineState: {
				...(chartConfigRef.current?.engineState || {}),
				chartType,
			}
		});
		if (syncSettingsRef.current.chartType && syncOverridesRef.current?.chartType !== false) {
			syncContext?.setChartType?.(chartId, chartType);
		}
	}, [onChartConfigChange, chartId, syncContext]);
	const handleVisibleRangeChange = useCallback((range: any) => {
		// P1-H: consume the one-shot marker NOW (original timing) but judge by
		// content below — only a true timestamp match is an echo.
		const hadPendingRemote = isApplyingRemoteRangeRef.current;
		if (hadPendingRemote) {
			isApplyingRemoteRangeRef.current = false;
		}
		if (syncSettingsRef.current.visibleRange && syncOverridesRef.current?.visibleRange !== false) {
			// F2/Q5: first emit attempts catch-up BEFORE intent. The answer (if any)
			// lands synchronously, so an adopted range suppresses own broadcast —
			// else a newcomer would clobber the active chart with its default view.
			if (!rangeCatchupRef.current.didRequest && syncContext) {
				rangeCatchupRef.current.didRequest = true;
				rangeCatchupRef.current.remoteApplied = false;
				syncContext.requestVisibleRange(chartId);
				if (rangeCatchupRef.current.remoteApplied) return;
			}
			const from = range.startDate instanceof Date ? range.startDate.getTime() : typeof range.startDate === 'number' ? range.startDate : 0;
			const to = range.endDate instanceof Date ? range.endDate.getTime() : typeof range.endDate === 'number' ? range.endDate : 0;
			if (from > 0 && to > 0) {
				const timeframe = (chartConfigRef.current?.timeframe ?? "1m") as string;
				const sourceTimeframe = timeframe;
				const startIndex = typeof range.startIndex === 'number' ? range.startIndex : 0;
				const barCount = typeof range.barCount === 'number' ? range.barCount : 0;
				const plotData = chartRef.current?.getPlotData?.();
				const totalBars = Array.isArray(plotData) ? plotData.length : 0;
				const relativePosition = totalBars > 0
					? { startRatio: Math.max(0, Math.min(1, startIndex / totalBars)), spanRatio: Math.min(1, Math.max(0, barCount / totalBars)) }
					: undefined;
				const payload: any = {
					chartId,
					timeRange: { from, to },
					timeframe,
					sourceTimeframe,
				};
				if (relativePosition) payload.relativePosition = relativePosition;
				if (hadPendingRemote && isContainedEcho(payload.timeRange, rangeCatchupRef.current.lastRange?.timeRange)) return;
				rangeCatchupRef.current.lastRange = payload;
				syncContext?.setVisibleRange(chartId, payload);
			}
		}
	}, [chartId, syncContext]);
	const handleCrosshairChange = useCallback((crosshair: any) => {
		if (isApplyingRemoteCrosshairRef.current) {
			isApplyingRemoteCrosshairRef.current = false;
			return;
		}
		if (syncSettingsRef.current.crosshair && syncOverridesRef.current?.crosshair !== false) {
			syncContext?.setCrosshair(chartId, crosshair);
		}
	}, [chartId, syncContext]);
	const handleSyncDrawing = useCallback((op: DrawingOperation) => {
		// R2-d: per-drawing Local Only never leaves the origin chart.
		if ((op as { syncInLayout?: unknown }).syncInLayout === false) return;
		if (syncSettingsRef.current.drawings && syncOverridesRef.current?.drawings !== false) {
			// E1/Q2: stamp the origin symbol so receivers keep drawings symbol-local.
			// A3: stamp the origin chartId so engine fan-out excludes the source
			// (no self-echo). Falls back to authorId when absent (legacy).
			syncContext?.syncDrawing?.({ ...withDrawingSourceSymbol(op, chartConfigRef.current?.symbol), chartId });
		}
	}, [syncContext, chartId]);
	// F1: discrete time-anchor emit (double-click empty chart area upstream).
	const handleTimeAnchor = useCallback((timestamp: number) => {
		if (syncSettingsRef.current.time && syncOverridesRef.current?.time !== false) {
			syncContext?.setTimeAnchor?.(chartId, timestamp);
		}
	}, [chartId, syncContext]);
	const handleDrawingWorkspaceChange = useCallback((workspace: any) => {
		onDrawingWorkspaceChange?.(chartId, workspace);
	}, [onDrawingWorkspaceChange, chartId]);
	const handleComparisonChange = useCallback((overlays: any[]) => {
		onComparisonChange?.(chartId, overlays);
	}, [onComparisonChange, chartId]);
	const handleToggleLayout = useCallback(() => {
		setActiveChart(chartId);
		toggleMaximize?.(chartId);
	}, [setActiveChart, toggleMaximize, chartId]);
	const handleRenderPaneToolbar = useCallback(({ pane, snapshot, hovered, actions, paneHeaderStyle }: any) => {
		if (pane.id === "price" || pane.pinned) {
			// TRADEMARK_FIX: PricePaneHeader's right cluster (⚙ + trademark)
			// is DESIGNED to overlay the right Y gutter (settings
			// margin-right:88px, trademark absolute right:12px). Insetting it
			// with paneHeaderStyle.paddingRight dragged the trademark ~48px
			// off the edge — so the wrapper keeps ONLY the left clearance
			// (axis rail) and restores the designed full-bleed right side.
			// Generic PaneHeader (Vol/indicators) keeps both paddings.
			return (
				<div style={resolvePriceHeaderWrapStyle(paneHeaderStyle)}>
					<CellPricePaneHeader
						pane={pane}
						symbol={chartConfigRef.current?.symbol ?? layout.slots[0]?.symbol ?? "VNM"}
						timeframe={(chartConfigRef.current?.timeframe as Timeframe) ?? (layout.slots[0]?.timeframe as Timeframe) ?? "1m"}
						chartId={chartId}
						isActive={isActive}
						symbolLinkGroup={chartConfigRef.current?.symbolLinkGroup}
						hoverEmitterRef={getHoverEmitterRef(hoverEmitterRefs, chartId)}
						actions={actions}
						storageAdapter={storageAdapter}
						onSettingsClick={() => chartRef.current?.openSettings?.()}
						onSymbolSearchClick={() => onSymbolSearchClick?.(chartId)}
					/>
				</div>
			);
		}
		return (
			<PaneHeader
				pane={pane}
				onToggleVisible={actions.toggleVisibility}
				onRemove={actions.removePane}
				onAddSeries={actions.addSeries}
				style={paneHeaderStyle}
			/>
		);
	}, [chartId, isActive, hoverEmitterRefs, getHoverEmitterRef, onSymbolSearchClick, layout.slots]);
	// Synchronize group assignment in SyncContext
	useEffect(() => {
		if (syncContext && chartId) {
			syncContext.assignToGroup(chartId, chartConfig?.symbolLinkGroup ?? null);
		}
	}, [syncContext, chartId, chartConfig?.symbolLinkGroup]);
	// Subscribe to group symbol updates
	useEffect(() => {
		const groupId = chartConfig?.symbolLinkGroup;
		if (syncContext && chartId && groupId) {
			const unsubscribe = syncContext.onGroupSymbolChange(groupId, (symbol: string) => {
				if (chartConfig.symbol !== symbol) {
					onChartConfigChange?.(chartId, { symbol });
				}
			});
			return unsubscribe;
		}
	}, [syncContext, chartId, chartConfig?.symbolLinkGroup, chartConfig?.symbol, onChartConfigChange]);
	// E2: latest drawing conflict to surface (notify-only; engine LWW auto-applies).
	const [drawingConflict, setDrawingConflict] = useState<null | { drawingId: string }>(null);
	// Subscribe to drawing conflict notifications
	useEffect(() => {
		if (!syncContext?.onDrawingConflict || !syncSettingsRef.current.drawings) return;
		return syncContext.onDrawingConflict((info: any) => {
			if (shouldNotifyDrawingConflict(info, chartConfigRef.current?.symbol, isActive)) {
				setDrawingConflict({ drawingId: info.drawingId });
			}
		});
	}, [syncContext, chartId, isActive]);
	// Register chart handle with SyncContext via ref (replaces dead onChartReady callback)
	useEffect(() => {
		if (!syncContext || !chartId) return;

		const guarded: any = {
			get id() {
				const latest = chartRef.current;
				return latest?.id ?? chartId;
			},
			get symbol() {
				const latest = chartRef.current;
				return latest?.symbol ?? "";
			},
			get timeframe() {
				const latest = chartRef.current;
				return latest?.timeframe ?? "1m";
			},
			setTimeframe: (tf: string, srcId?: string) => {
				const isRemote = srcId !== undefined && srcId !== chartId;
				if (isRemote && (!syncSettingsRef.current.timeframe || syncOverridesRef.current?.timeframe === false)) return;
				onChartConfigChange?.(chartId, { timeframe: tf as Timeframe });
				const latest = chartRef.current;
				latest?.setTimeframe?.(tf as Timeframe, srcId);
			},
			setChartType: (ct: string, srcId?: string) => {
				const isRemote = srcId !== undefined && srcId !== chartId;
				if (isRemote && (!syncSettingsRef.current.chartType || syncOverridesRef.current?.chartType === false)) return;
				onChartConfigChange?.(chartId, {
					engineState: { ...(chartConfigRef.current?.engineState || {}), chartType: ct }
				});
				const latest = chartRef.current;
				latest?.setChartType?.(ct, srcId);
			},
			setVisibleRange: (range: import("@vninvestcharts/engine-react").VisibleRangePayload, srcId?: string) => {
				const isRemote = srcId !== undefined && srcId !== chartId;
				if (isRemote && (!syncSettingsRef.current.visibleRange || syncOverridesRef.current?.visibleRange === false)) {
					return;
				}
				if (isRemote) {
					isApplyingRemoteRangeRef.current = true;
					rangeCatchupRef.current.remoteApplied = true;
					// A synced chart needs no catch-up (F2): mark requested so a
					// later first emit is treated as genuine intent, not mount-zoom.
					rangeCatchupRef.current.didRequest = true;
					if (range.timeRange) rangeCatchupRef.current.lastRange = range;
				}
				const latest = chartRef.current;
				latest?.setVisibleRange?.(range, srcId);
			},
			setCrosshair: (crosshair: any, srcId?: string) => {
				const isRemote = srcId !== undefined && srcId !== chartId;
				if (isRemote && (!syncSettingsRef.current.crosshair || syncOverridesRef.current?.crosshair === false)) return;
				if (isRemote) {
					isApplyingRemoteCrosshairRef.current = true;
				}
				const latest = chartRef.current;
				latest?.setCrosshair?.(crosshair, srcId);
			},
			syncDrawing: (op: DrawingOperation) => {
				if (!syncSettingsRef.current.drawings) return;
				// R2-d: per-drawing Local Only (forward contract — no toolbar UI yet).
				if ((op as { syncInLayout?: unknown }).syncInLayout === false) return;
				// E1/Q2: symbol-local drawings — drop other-symbol ops (legacy ops pass).
				if (!shouldApplyRemoteDrawing((op as { symbol?: unknown }).symbol, chartConfigRef.current?.symbol)) return;
				const latest = chartRef.current;
				latest?.syncDrawing?.(op);
			},
			// F1/spec §2.4: center-only apply (zoom kept); induced range echo is
			// swallowed by the imperative remote flag (no anchor meta exists).
			setTimeAnchor: (payload: any, srcId?: string) => {
				const isRemote = srcId !== undefined && srcId !== chartId;
				if (isRemote && (!syncSettingsRef.current.time || syncOverridesRef.current?.time === false)) return;
				// An anchored chart is synced (F2): no catch-up needed afterwards.
				if (isRemote) rangeCatchupRef.current.didRequest = true;
				const latest = chartRef.current;
				latest?.setTimeAnchor?.(payload, srcId);
			},
			// Replay methods (delegated to chart handle)
			getReplayState: () => {
				const latest = chartRef.current;
				return latest?.getReplayState?.() ?? { playing: false, speed: 1, currentBar: 0, totalBars: 0 };
			},
			replayPlay: () => {
				const latest = chartRef.current;
				latest?.replayPlay?.();
			},
			replayPause: () => {
				const latest = chartRef.current;
				latest?.replayPause?.();
			},
			replayStepForward: () => {
				const latest = chartRef.current;
				latest?.replayStepForward?.();
			},
			replayStepBack: () => {
				const latest = chartRef.current;
				latest?.replayStepBack?.();
			},
			replayRewind: () => {
				const latest = chartRef.current;
				latest?.replayRewind?.();
			},
			replayStop: () => {
				const latest = chartRef.current;
				latest?.replayStop?.();
			},
			replaySetSpeed: (speed: number) => {
				const latest = chartRef.current;
				latest?.replaySetSpeed?.(speed);
			},
			replaySeek: (barIndex: number) => {
				const latest = chartRef.current;
				latest?.replaySeek?.(barIndex);
			},
			replaySelectStartBar: () => {
				const latest = chartRef.current;
				latest?.replaySelectStartBar?.();
			},
			replayCancelSelection: () => {
				const latest = chartRef.current;
				latest?.replayCancelSelection?.();
			},
			replaySeekByTimestamp: (ts: number) => {
				const latest = chartRef.current;
				latest?.replaySeekByTimestamp?.(ts);
			},
			getReplayTotalPnl: () => {
				const latest = chartRef.current;
				return latest?.getReplayTotalPnl?.();
			},
			getReplayAnalytics: () => {
				const latest = chartRef.current;
				return latest?.getReplayAnalytics?.();
			},
			getReplayAwaitingStartBar: () => {
				const latest = chartRef.current;
				return latest?.getReplayAwaitingStartBar?.() ?? false;
			},
			addCompareSymbol: (symbolId: string) => {
				chartRef.current?.addCompareSymbol?.(symbolId);
			},
			removeCompareSymbol: (symbolId: string) => {
				const latest = chartRef.current;
				latest?.removeCompareSymbol?.(symbolId);
			},
			getCompareOverlaySymbols: () => {
				const latest = chartRef.current;
				return latest?.getCompareOverlaySymbols?.() ?? [];
			},
			getCompareOverlayEntries: () => {
				const latest = chartRef.current;
				return latest?.getCompareOverlayEntries?.() ?? [];
			},
			updateCompareOverlay: (symbolId: string, partial: Record<string, unknown>) => {
				const latest = chartRef.current;
				latest?.updateCompareOverlay?.(symbolId, partial);
			},
			freeze: async () => {
				const latest = chartRef.current;
				if (latest?.freeze) {
					await latest.freeze();
				}
				if (guarded._frozenSnapshot) {
					setFrozenSnapshots(prev => {
						const next = new Map(prev);
						next.set(chartId, guarded._frozenSnapshot);
						return next;
					});
				}
			},
			thaw: async () => {
				const latest = chartRef.current;
				if (latest?.thaw) {
					await latest.thaw();
				}
				setFrozenSnapshots(prev => {
					const next = new Map(prev);
					next.delete(chartId);
					return next;
				});
			},
			captureSnapshot: async () => {
				const latest = chartRef.current;
				return latest?.captureSnapshot?.();
			},
			restoreFromSnapshot: async (snapshot: any) => {
				const latest = chartRef.current;
				return latest?.restoreFromSnapshot?.(snapshot);
			},
		};
		chartHandles.current.set(chartId, guarded);
		syncContext.registerChart(chartId, guarded);
		GridChartRegistry.register(chartId, guarded);
		return () => {
			syncContext.unregisterChart(chartId);
			chartHandles.current.delete(chartId);
			GridChartRegistry.unregister(chartId);
		};
	}, [chartId, syncContext]);
	// F2/Q5: answer late-joiner catch-up — ACTIVE chart only, from its last
	// synced range. Targeted delivery (no storm, no throttle coupling — the
	// answer must land synchronously inside the request cascade). No stored
	// range (or opted out) = stay silent (safe default).
	useEffect(() => {
		if (!syncContext || !chartId) return;
		return syncContext.onVisibleRangeRequest(chartId, (requesterId: string) => {
			if (!isActive) return;
			const stored = rangeCatchupRef.current.lastRange;
			if (!stored?.timeRange) return;
			if (syncOverridesRef.current?.visibleRange === false) return;
			syncContext.respondVisibleRange(requesterId, chartId, stored);
		});
	}, [syncContext, chartId, isActive]);
	// Determine if splitters are needed for this slot
	const slotConfig = useMemo(() => {
		const config = layout.slots.find(s => s.id === chartId);
		if (config) return config;
		if (layout.areas) {
			const entry = Object.entries(layout.areas).find(([key, val]) => val.id === chartId || key === chartId);
			if (entry) {
				return {
					...entry[1],
					...resolveSlotBoundsFromTemplate(entry[0], layout.templateAreas)
				};
			}
		}
		return undefined;
	}, [layout.slots, layout.areas, layout.templateAreas, chartId]);
	const showBottomSplitter = slotConfig && slotConfig.rowEnd < layout.rows;
	const showRightSplitter = slotConfig && slotConfig.colEnd < layout.cols;
	return (
		<div
			ref={isMobile ? null : observerRef}
			className={`${styles.slot} ${isSelected ? styles.active : ""} ${(!isMobile && isFrozen) ? styles.frozen : ""} ${(!isMobile && isThawing) ? styles.thawing : ""}`}
			style={isMobile ? { width: "100%", height: "100%" } : {
				gridArea: areaName,
				zIndex: isMaximized ? 100 : layout.areas?.[areaName]?.zIndex ?? 1,
				...(isMaximized ? { position: 'absolute', inset: 0 } : {}),
			}}
			onClick={() => setActiveChart(chartId)}
			onKeyDown={(e) => {
				// UX-01: never hijack keys aimed at an interactive child, and never
				// trap Tab. Tab/Shift+Tab must leave the grid in DOM order; only the
				// cell itself (roving tabindex target) reacts to arrows/Enter/Space.
				if (e.target !== e.currentTarget) return;
				const idx = chartIds.indexOf(chartId);
				if (e.key === "ArrowRight" || e.key === "ArrowDown") {
					e.preventDefault();
					const nextId = chartIds[(idx + 1) % chartIds.length];
					setActiveChart(nextId);
					requestAnimationFrame(() => {
						document.querySelector<HTMLElement>(`[data-chart-id="${nextId}"]`)?.focus();
					});
				} else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
					e.preventDefault();
					const prevId = chartIds[(idx - 1 + chartIds.length) % chartIds.length];
					setActiveChart(prevId);
					requestAnimationFrame(() => {
						document.querySelector<HTMLElement>(`[data-chart-id="${prevId}"]`)?.focus();
					});
				} else if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					setActiveChart(chartId);
				}
			}}
			role="gridcell"
			// Roving tabindex: exactly one cell is reachable with Tab (the active
			// one, or the first when nothing is active), so the grid is entered once
			// and exited again instead of trapping focus.
			tabIndex={isActive || index === 0 ? 0 : -1}
			aria-label={`Chart ${chartId}${chartConfig?.symbol ? ` - ${chartConfig.symbol}` : ""}${isActive ? ", active" : ""}`}
			aria-selected={isActive}
			data-chart-id={chartId}
			data-visibility={visibilityState}
		>
			<>
				<VNInvestCharts
					ref={chartRef}
					id={chartId}
					active={isActive}
					isActiveChart={isActive}
					symbol={chartConfig?.symbol || layout.slots[0]?.symbol || "VNM"}
					timeframe={(chartConfig?.timeframe as Timeframe) || (layout.slots[0]?.timeframe as Timeframe) || "1m"}
					engineRuntime={defaultChartProps.engineRuntime ?? "fork"}
					adapter={defaultChartProps.adapter}
					theme={defaultChartProps.theme}
					onThemePresetChange={defaultChartProps.onThemePresetChange}
					locale={defaultChartProps.locale}
					timezone={defaultChartProps.timezone}
					defaultTimezone={defaultChartProps.defaultTimezone}
					resizeAdapter={resizeAdapter}
					keyboardAdapter={keyboardAdapter}
					clockAdapter={clockAdapter}
					storageAdapter={storageAdapter}
					portalAdapter={portalAdapter}
					registryAdapter={registryAdapter}
					portalRoot={portalRoot}
					shadowRoot={shadowRoot}
					adsEnabled={false}
					showHeader={false}
					showFooter={false}
					// DOCK_SSOT_B3 (S2-fix): pin false — cell KHÔNG được mount dock rail
					// của riêng nó khi single surface đã default-on (`showDock !== false`).
					// Dock thuộc workspace (slot → RightDockRail ngoài cells). Đo staging
					// 2026-10-19 (Deploy B): không có khoá này, mỗi pane mount 1 rail —
					// 5 wrapper (4 pane + 1 workspace); flyout trong pane bị pane content
					// phủ. GridContainer liệt kê prop tường minh (không spread
					// defaultChartProps) nên khoá phải nằm ở đây, không phải mergedChartProps.
					showDock={false}
					showTimeScrollbar={defaultChartProps.showTimeScrollbar ?? false}
					// DOCK_FIX: grid cells mount no drawing rail of their own (the
					// rail lives at multi level). Pin false so the shared docked
					// key can never indent a phantom 44px strip / shift overlays.
					showToolbar={false}
					isMobile={isMobile}
					syncOverrides={syncOverrides}
					showCorporateEvents={showCorporateEvents}
					corporateEvents={corporateEvents}
					corporateEventsMode={defaultChartProps.corporateEventsMode}
					tenantPat={defaultChartProps.tenantPat}
					licenseKey={defaultChartProps.licenseKey}
					upgradeUrl={defaultChartProps.upgradeUrl}
					debugTier={defaultChartProps.debugTier}
					onLicenseDiagnostic={defaultChartProps.onLicenseDiagnostic}
					authHandler={defaultChartProps.authHandler}
					symbolLinkGroup={chartConfig?.symbolLinkGroup}
					axisLabelColor={CHART_AXIS_COLORS[index % CHART_AXIS_COLORS.length]}
					initialEngineState={chartConfig?.engineState}
					frozenSnapshot={frozenSnapshots.get(chartId) ?? null}
					hoverEmitterRef={getHoverEmitterRef(hoverEmitterRefs, chartId)}
					onSymbolChange={handleSymbolChange}
					onTimeframeChange={handleTimeframeChange}
					onChartTypeChange={handleChartTypeChange}
					onVisibleRangeChange={handleVisibleRangeChange}
					onCrosshairChange={handleCrosshairChange}
					onSyncDrawing={handleSyncDrawing}
					onTimeAnchor={handleTimeAnchor}
					onDrawingWorkspaceChange={handleDrawingWorkspaceChange}
					onComparisonChange={handleComparisonChange}
					renderPaneToolbar={handleRenderPaneToolbar}
					replaySelectionEnabled={replaySelectionEnabled}
					replayInstanceId={defaultChartProps.replayInstanceId}
					onToggleLayout={handleToggleLayout}
					isSoloMode={isMaximized}
				/>
				{drawingConflict && (
					<DrawingConflictNotice onDismiss={() => setDrawingConflict(null)} />
				)}
				{!isMobile && showBottomSplitter && slotConfig && trackSizes && (() => {
					const ri = slotConfig.rowEnd - 1;
					const px = getTrackPixelValue(trackSizes, 'row', ri, containerEl ?? null);
					const totalPx = containerEl?.clientHeight ?? (layout.rows * 300);
					const aria = calculateAriaValues(px, totalPx);
					return (
						<div
							className={styles.rowSplitter}
							onPointerDown={(e) => onSplitterPointerDown?.(e, 'row', ri)}
							onKeyDown={(e) => onSplitterKeyDown?.(e, 'row', ri)}
							onDoubleClick={() => onSplitterDoubleClick?.('row')}
							tabIndex={0}
							role="separator"
							aria-orientation="horizontal"
							aria-valuenow={aria.valueNow}
							aria-valuemin={aria.valueMin}
							aria-valuemax={aria.valueMax}
							aria-valuetext={t("grid.splitter.valuePercent", { percent: aria.valueNow })}
							aria-label={t("grid.splitter.resizeRow", { row: slotConfig.rowEnd })}
							title={t("grid.splitter.resetTracks")}
						/>
					);
				})()}
				{!isMobile && showRightSplitter && slotConfig && trackSizes && (() => {
					const ci = slotConfig.colEnd - 1;
					const px = getTrackPixelValue(trackSizes, 'col', ci, containerEl ?? null);
					const totalPx = containerEl?.clientWidth ?? (layout.cols * 300);
					const aria = calculateAriaValues(px, totalPx);
					return (
						<div
							className={styles.colSplitter}
							onPointerDown={(e) => onSplitterPointerDown?.(e, 'col', ci)}
							onKeyDown={(e) => onSplitterKeyDown?.(e, 'col', ci)}
							onDoubleClick={() => onSplitterDoubleClick?.('col')}
							tabIndex={0}
							role="separator"
							aria-orientation="vertical"
							aria-valuenow={aria.valueNow}
							aria-valuemin={aria.valueMin}
							aria-valuemax={aria.valueMax}
							aria-valuetext={t("grid.splitter.valuePercent", { percent: aria.valueNow })}
							aria-label={t("grid.splitter.resizeColumn", { column: slotConfig.colEnd })}
							title={t("grid.splitter.resetTracks")}
						/>
					);
				})()}
			</>
		</div>
	);
};

export const GridContainer: React.FC<GridContainerProps> = ({
	charts,
	layout,
	activeChartId,
	syncSettings,
	defaultChartProps,
	resizeAdapter,
	keyboardAdapter,
	clockAdapter,
	storageAdapter,
	portalAdapter,
	registryAdapter,
	portalRoot,
	shadowRoot,
	chartRefs,
	chartHandles,
	setActiveChart,
	addChart,
	hoverEmitterRefs,
	onDrawingWorkspaceChange,
	onLayoutChange,
	onChartConfigChange,
	onSymbolSearchClick,
	onComparisonChange,
	showSymbolBadges = true,
	syncOverrideMap,
	onToggleSyncOverride,
	showCorporateEvents,
	corporateEvents,
	activeTool,
	maximizedChartId: controlledMaximizedChartId,
	onMaximizedChange,
}) => {
	const { syncContext } = useSyncContextShare();
	const containerRef = useRef<HTMLDivElement | null>(null);
	// UX-04: measure the grid itself, not the page. A workspace embedded in a
	// narrow sidebar on a wide screen must resolve to the compact layout.
	const viewportMode = useViewportBreakpoint(containerRef);

	const [internalMaximizedChartId, setInternalMaximizedChartId] = useState<string | null>(null);
	const maximizedChartId = controlledMaximizedChartId ?? internalMaximizedChartId;
	const toggleMaximize = useCallback((id: string) => {
		const next = (controlledMaximizedChartId ?? internalMaximizedChartId) === id ? null : id;
		if (controlledMaximizedChartId !== undefined) {
			onMaximizedChange?.(next);
		} else {
			setInternalMaximizedChartId(next);
		}
	}, [controlledMaximizedChartId, internalMaximizedChartId, onMaximizedChange]);

	useEffect(() => {
		const h = (e: KeyboardEvent) => {
			if (e.altKey && e.key === 'Enter' && activeChartId) { e.preventDefault(); toggleMaximize(activeChartId); }
		};
		window.addEventListener('keydown', h);
		return () => window.removeEventListener('keydown', h);
	}, [activeChartId, toggleMaximize]);

	// Splitter logic for resizing grid tracks via unified hook
	const {
		trackSizes,
		handlePointerDown: handleSplitterPointerDown,
		handleKeyDown: handleSplitterKeyDown,
		handleDoubleClick: handleSplitterDoubleClick,
	} = useGridSplitterDrag({
		containerRef,
		layout,
		onLayoutChange,
	});

	// Track frozen snapshots for each chart
	const [frozenSnapshots, setFrozenSnapshots] = useState<Map<string, ImageBitmap | HTMLCanvasElement | null>>(new Map());

	// Start performance monitoring on mount
	useEffect(() => {
		MemoryBudgetManager.startPerformanceMonitoring();
		return () => {
			MemoryBudgetManager.stopPerformanceMonitoring();
		};
	}, []);

	// Build grid template areas from layout
	const gridTemplateAreas = useMemo(() => {
		if (!layout.templateAreas || layout.templateAreas.length === 0) {
			// Fallback to symmetric grid
			const rows = layout.rows;
			const cols = layout.cols;
			return Array(rows).fill(null).map((_, r) =>
				Array(cols).fill(null).map((_, c) => `chart-${r * cols + c + 1}`).join(" ")
			);
		}
		return layout.templateAreas;
	}, [layout.templateAreas, layout.rows, layout.cols]);

	// Build grid template rows/columns
	const gridTemplateRows = useMemo(() => {
		return layout.rowSizes.length > 0 ? layout.rowSizes.join(" ") : `repeat(${layout.rows}, 1fr)`;
	}, [layout.rowSizes, layout.rows]);

	const gridTemplateColumns = useMemo(() => {
		return layout.colSizes.length > 0 ? layout.colSizes.join(" ") : `repeat(${layout.cols}, 1fr)`;
	}, [layout.colSizes, layout.cols]);

	// Create a map of chart configs by ID
	const chartConfigMap = useMemo(() => {
		const map = new Map<string, any>();
		charts.forEach(c => map.set(c.id, c));
		return map;
	}, [charts]);

	// Get all unique chart IDs from layout — always use slot IDs
	// (area keys are CSS grid area names, NOT chart IDs)
	const chartIds = useMemo(() => {
		return layout.slots.map(slot => slot.id);
	}, [layout.slots]);

	const visibleChartIds = chartIds;

	// Phase 0: detect layout change → start session
	const prevLayoutRef = useRef(layout);

	useEffect(() => {
		if (prevLayoutRef.current !== layout) {
			startLayoutSession(chartIds);
			prevLayoutRef.current = layout;
		}
	}, [layout, chartIds]);

	// Render chart slots with IntersectionObserver for WebGL freeze/thaw
	const renderChartSlots = useMemo(() => {
		// Phase 0: measure layout-change
		if (instrumentationSessionId) {
			performance.measure(`layout-change:${instrumentationSessionId}`, {
				start: 'layout-session-start',
				detail: { sessionId: instrumentationSessionId, chartCount: chartIds.length }
			});
		}
		return visibleChartIds.map((chartId) => {
			const index = chartIds.indexOf(chartId);
			const chartConfig = chartConfigMap.get(chartId);
			// BUG-3 fix: strict active. Khi activeChartId === null (chưa chọn chart) →
			// KHÔNG chart nào là active → không chart nào feed bars vào shared order book
			// (tránh trộn bars nhiều symbol). isSelected (line dưới) giữ highlight chart được chọn.
			const isActive = activeChartId === chartId;
			// Outline only the explicitly chosen chart (not all slots on first load).
			const isSelected = activeChartId != null && activeChartId === chartId;
			const areaEntry = layout.areas
				? Object.entries(layout.areas).find(([_, config]) => config.id === chartId)
				: undefined;
			const areaName = areaEntry ? areaEntry[0] : `chart-${index + 1}`;

			// Create ref for this chart
			if (!chartRefs.current.has(chartId)) {
				chartRefs.current.set(chartId, React.createRef<FullChartHandle>());
			}
			const chartRef = chartRefs.current.get(chartId)!;

			return (
				<GridSlotErrorBoundary key={chartId} chartId={chartId}>
					<GridChartSlot
						chartId={chartId}
						index={index}
						chartConfig={chartConfig}
						isActive={isActive}
						isSelected={isSelected}
						areaName={areaName}
						chartRef={chartRef}
						chartRefs={chartRefs}
						chartHandles={chartHandles}
						frozenSnapshots={frozenSnapshots}
						setFrozenSnapshots={setFrozenSnapshots}
						hoverEmitterRefs={hoverEmitterRefs}
						defaultChartProps={defaultChartProps}
						resizeAdapter={resizeAdapter}
						keyboardAdapter={keyboardAdapter}
						clockAdapter={clockAdapter}
						storageAdapter={storageAdapter}
						portalAdapter={portalAdapter}
						registryAdapter={registryAdapter}
						syncContext={syncContext}
						syncSettings={syncSettings}
						setActiveChart={setActiveChart}
						chartIds={chartIds}
						layout={layout}
						onDrawingWorkspaceChange={onDrawingWorkspaceChange}
						onSplitterPointerDown={handleSplitterPointerDown}
						onSplitterKeyDown={handleSplitterKeyDown}
						onSplitterDoubleClick={handleSplitterDoubleClick}
						onChartConfigChange={onChartConfigChange}
						onSymbolSearchClick={onSymbolSearchClick}
						onComparisonChange={onComparisonChange}
						showSymbolBadges={showSymbolBadges}
						syncOverrides={syncOverrideMap?.[chartId]}
						onToggleSyncOverride={onToggleSyncOverride}
						showCorporateEvents={showCorporateEvents}
						corporateEvents={corporateEvents}
						isMaximized={maximizedChartId === chartId}
						toggleMaximize={toggleMaximize}
						trackSizes={trackSizes}
						containerEl={containerRef.current}
					/>
				</GridSlotErrorBoundary>
			);
		});
	}, [
		maximizedChartId,
		showCorporateEvents,
		corporateEvents,
		onToggleSyncOverride,
		syncOverrideMap,
		chartIds,
		visibleChartIds,
		chartConfigMap,
		activeChartId,
		layout,
		chartRefs,
		chartHandles,
		setActiveChart,
		syncContext,
		syncSettings,
		defaultChartProps,
		resizeAdapter,
		keyboardAdapter,
		clockAdapter,
		storageAdapter,
		portalAdapter,
		registryAdapter,
		frozenSnapshots,
		hoverEmitterRefs,
		onDrawingWorkspaceChange,
		handleSplitterPointerDown,
		handleSplitterKeyDown,
		handleSplitterDoubleClick,
		trackSizes,
		onChartConfigChange,
		onSymbolSearchClick,
		onComparisonChange,
		showSymbolBadges,
	]);

	if (viewportMode === "mobile") {
		const activeIndex = chartIds.indexOf(activeChartId ?? "");
		const safeActiveIndex = activeIndex === -1 ? 0 : activeIndex;
		return (
			// P0-5 (Batch B): the measured element must exist in BOTH branches.
			// The desktop branch owns `containerRef` (`:1153`); without it here the
			// ResizeObserver keeps watching a detached node and the workspace stays
			// stuck in the mobile carousel after the window grows again.
			<div ref={containerRef} style={{ width: "100%", height: "100%" }}>
				<WorkspaceSettingsProvider chartIds={chartIds} storageAdapter={storageAdapter}>
					<MobileChartCarousel
						charts={charts}
						activeIndex={safeActiveIndex}
						activeTool={activeTool}
						onChange={(index) => {
							const targetId = chartIds[index];
							if (targetId) {
								setActiveChart(targetId);
							}
						}}
						renderChart={(config, isActive) => {
							const chartId = config.id;
							const index = chartIds.indexOf(chartId);
							const chartConfig = chartConfigMap.get(chartId);
							if (!chartRefs.current.has(chartId)) {
								chartRefs.current.set(chartId, React.createRef<FullChartHandle>());
							}
							const chartRef = chartRefs.current.get(chartId)!;
							return (
								<GridSlotErrorBoundary key={chartId} chartId={chartId}>
									<GridChartSlot
										chartId={chartId}
										index={index}
										chartConfig={chartConfig}
										isActive={isActive}
										isSelected={isActive}
										areaName=""
										chartRef={chartRef}
										chartRefs={chartRefs}
										chartHandles={chartHandles}
										frozenSnapshots={frozenSnapshots}
										setFrozenSnapshots={setFrozenSnapshots}
										hoverEmitterRefs={hoverEmitterRefs}
										defaultChartProps={defaultChartProps}
										resizeAdapter={resizeAdapter}
										keyboardAdapter={keyboardAdapter}
										clockAdapter={clockAdapter}
										storageAdapter={storageAdapter}
										portalAdapter={portalAdapter}
										registryAdapter={registryAdapter}
										syncContext={syncContext}
										syncSettings={syncSettings}
										setActiveChart={setActiveChart}
										chartIds={chartIds}
										layout={layout}
										onDrawingWorkspaceChange={onDrawingWorkspaceChange}
										onChartConfigChange={onChartConfigChange}
										onSymbolSearchClick={onSymbolSearchClick}
										onComparisonChange={onComparisonChange}
										isMobile={true}
										showSymbolBadges={showSymbolBadges}
										syncOverrides={syncOverrideMap?.[chartId]}
										onToggleSyncOverride={onToggleSyncOverride}
										showCorporateEvents={showCorporateEvents}
										corporateEvents={corporateEvents}
									/>
								</GridSlotErrorBoundary>
							);
						}}
					/>
				</WorkspaceSettingsProvider>
			</div>
		);
	}

	return (
		<div
			ref={containerRef}
			className={styles.gridContainer}
			style={maximizedChartId ? { position: 'relative', width: "100%", flex: 1, minHeight: 0 } : {
				display: "grid", gridTemplateAreas: gridTemplateAreas.map(row => `"${row}"`).join(" "),
				gridTemplateRows: trackSizes.rows.join(" "), gridTemplateColumns: trackSizes.cols.join(" "),
				width: "100%", flex: 1, minHeight: 0, gap: "4px",
			}}
			role="grid"
			aria-label="Multi-chart grid"
		>
			<WorkspaceSettingsProvider chartIds={chartIds} storageAdapter={storageAdapter}>
				{renderChartSlots}
			</WorkspaceSettingsProvider>
			{!maximizedChartId && gridTemplateAreas.flatMap((row, r) => row.split(/\s+/).reduce<React.ReactNode[]>((acc, cell, c) => {
				if (cell === '.') acc.push(<div key={`empty-${r}-${c}`} className={styles.emptySlot} style={{ gridRow: `${r+1}`, gridColumn: `${c+1}` }} onClick={() => addChart({ id: crypto.randomUUID(), symbol: 'VNM', timeframe: '1m' }, r, c)} role="button" tabIndex={0} aria-label="Add chart to empty slot" onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); addChart({ id: crypto.randomUUID(), symbol: 'VNM', timeframe: '1m' }, r, c); } }}><span style={{ fontSize: 24 }}>+</span></div>);
				return acc;
			}, []))}
		</div>
	);
};

export default GridContainer;
