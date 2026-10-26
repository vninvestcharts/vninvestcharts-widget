/**
 * useChartImperativeHandle — imperative chart API extracted verbatim from
 * VNInvestCharts (pure refactor slice, zero behavior change).
 *
 * The factory body is an exact move of the former `useImperativeHandle` block;
 * every outer binding it touches arrives via `ctx` (no stale/deleted refs).
 * No deps array (as before) — the handle is rebuilt every render.
 *
 * NOTE: ctx fields are intentionally `any`-typed (mechanical extraction;
 * the source file itself is `any`-tolerant, e.g. `forwardRef<any, ...>`).
 * Gradual typing is follow-up work, not this slice.
 */
import { useImperativeHandle } from "react";
import type {
	CrosshairPayload,
	DrawingData,
	DrawingOperation,
	VisibleRangePayload,
} from "@vninvestcharts/engine-react";
import type { ThemeConfig } from "../theme/ThemeConfig";
import type { EnrichedDatum } from "../../lib/core/calculators/types";
import type { SeriesConfig } from "../../lib/core";
import { clampIndex } from "../visibleRangeBridge";
import { resolveCrosshairPrice, resolveLocalXIndexFromTimestamp } from "../utils/crosshairSync";
import { resolveSyncIndexes, resolveAnchorIndexes } from "../utils/rangeSync";
import { normalizeForkVisibleRange } from "../visibleRangeBridge";
import { createDrawingObject } from "@vninvestcharts/engine-drawing";
import { syncPointToDrawingPoint } from "../utils/drawingSync";
import { createWidgetCoordinateBridge } from "../utils/coordinateBridge";
import { applyTheme, readThemeFromElement } from "../theme/applyTheme";

export interface ChartImperativeHandleContext {
	props: any;
	localSymbol: any;
	settings: any;
	isForkRuntime: any;
	engineInstanceRef: any;
	dataResult: any;
	resolvedLegacyVisibleRange: any;
	paneState: any;
	comparisonState: any;
	drawingsResult: any;
	replay: any;
	/**
	 * W1.4 — single entitlement source for image export. When false, the public
	 * `saveAsImage()` ref method is a no-op, so a host integration cannot bypass the
	 * UI gate. Same shape as `canUseReplay` above: **required boolean, truthy check**
	 * ⇒ `undefined` counts as not granted (fail-closed).
	 */
	canExportImage: boolean;
	/** Called instead of exporting when the tier does not grant it. */
	onExportBlocked?: () => void;
	/**
	 * AUTH-03: single entitlement source for replay. Every mutating replay entry
	 * point is a no-op when false, so a Free tier cannot drive replay through the
	 * imperative ref even if it bypasses the UI gate.
	 */
	canUseReplay: boolean;
	replayTrading: any;
	replayAwaitingStartBar: any;
	setLegacyVisibleRange: any;
	setChartType: any;
	setIsFrozen: any;
	isFrozen: any;
	openAlertsModal: any;
	setReplayAwaitingStartBar: any;
	isRemoteVisibleRangeRef: any;
	lastRemoteRangeRef: any;
	pendingSyncTimeRangeRef: any;
	visibleRangeTimeoutRef: any;
	isRemoteCrosshairRef: any;
	isRemoteDrawingChangeRef: any;
	syncDrawingHandlersRef: any;
	syncViewportHandlersRef: any;
	replayBarVisibleRef: any;
	replayAwaitingStartBarRef: any;
	suppressReplayTickRef: any;
	onDataChangeCallbacks: any;
	onIndicatorsChangeCallbacks: any;
	containerRef: any;
	handleSaveTemplate: any;
	handleLoadTemplate: any;
	legacyPaneSnapshots: any;
	paneSnapshots: any;
	legacyCoordinateBridge: any;
	CHART_TYPE_MAP: any;
}

export function useChartImperativeHandle(ref: any, ctx: ChartImperativeHandleContext): void {
	// AUTH-03: neutral command used when the tier does not grant replay.
	const noop = () => {};
	const {
		props,
		localSymbol,
		settings,
		isForkRuntime,
		engineInstanceRef,
		dataResult,
		resolvedLegacyVisibleRange,
		paneState,
		comparisonState,
		drawingsResult,
		replay,
		canUseReplay,
		// W1.4: gate export ảnh ở public API (xem interface ở trên).
		canExportImage,
		onExportBlocked,
		replayTrading,
		replayAwaitingStartBar,
		setLegacyVisibleRange,
		setChartType,
		setIsFrozen,
		isFrozen,
		openAlertsModal,
		setReplayAwaitingStartBar,
		isRemoteVisibleRangeRef,
		lastRemoteRangeRef,
		pendingSyncTimeRangeRef,
		visibleRangeTimeoutRef,
		isRemoteCrosshairRef,
		isRemoteDrawingChangeRef,
		syncDrawingHandlersRef,
		syncViewportHandlersRef,
		replayBarVisibleRef,
		replayAwaitingStartBarRef,
		suppressReplayTickRef,
		onDataChangeCallbacks,
		onIndicatorsChangeCallbacks,
		containerRef,
		handleSaveTemplate,
		handleLoadTemplate,
		legacyPaneSnapshots,
		paneSnapshots,
		legacyCoordinateBridge,
		CHART_TYPE_MAP,
	} = ctx;

	useImperativeHandle(ref, () => {
		const handleObj = {
			id: props.id || "",
			symbol: localSymbol || "",
			timeframe: settings.localTimeframe,
			getVisibleRange: () => {
				if (isForkRuntime) {
					const engine = engineInstanceRef.current;
					const range = engine?.getVisibleRange() ?? null;
					if (!range) return { startIndex: 0, endIndex: 0, startDate: new Date(0), endDate: new Date(0), barCount: 0 };
					return {
						startIndex: Math.round(range.from),
						endIndex: Math.round(range.to),
						startDate: dataResult.plotData[clampIndex(range.from, dataResult.plotData.length)]?.date ?? new Date(0),
						endDate: dataResult.plotData[clampIndex(range.to, dataResult.plotData.length)]?.date ?? new Date(0),
						barCount: Math.round(range.to - range.from),
					};
				}
				const legacyRange = resolvedLegacyVisibleRange;
				if (!legacyRange) return { startIndex: 0, endIndex: 0, startDate: new Date(0), endDate: new Date(0), barCount: 0 };
				return {
					startIndex: legacyRange.startIndex,
					endIndex: legacyRange.endIndex,
					startDate: legacyRange.startDate || new Date(0),
					endDate: legacyRange.endDate || new Date(0),
					barCount: legacyRange.barCount || 0,
				};
			},
			setVisibleRange: (range: any, sourceChartId?: string) => {
				const isRemote = sourceChartId !== undefined && sourceChartId !== props.id;
				if (isRemote) {
					isRemoteVisibleRangeRef.current = true;
					if (visibleRangeTimeoutRef.current) {
						clearTimeout(visibleRangeTimeoutRef.current);
						visibleRangeTimeoutRef.current = undefined;
					}
				}
				if (range.timeRange) {
					const plotData = dataResult.plotData;
					const fromTs = range.timeRange.from;
					const toTs = range.timeRange.to;

					const earliestMs = plotData.length > 0 ? plotData[0].date.getTime() : 0;
					const isLeftBoundaryExhausted = dataResult.historyBackfillBeforeRef.current !== null;

					if (plotData.length === 0 || (fromTs < earliestMs && !isLeftBoundaryExhausted)) {
						pendingSyncTimeRangeRef.current = { from: fromTs, to: toTs };
						if (plotData.length > 0) {
							dataResult.requestVisibleHistoryWindowSync([new Date(fromTs), new Date(toTs)], { force: true });
						}
						// Prevent followLatest from snapping to right edge while backfill loads.
						// Without this, the non-active chart's engine keeps followLatest=true (default)
						// and every data update triggers auto-scroll to right edge, overriding the sync.
						if (isForkRuntime) {
							const engine = engineInstanceRef.current;
							if (engine) {
								engine.setCameraState({ followLatest: false });
							}
						}
						// SY-12/B2: pending must not hang forever (backfill may never cover
						// the range). 5s fallback clears the stash + releases the remote
						// guard. Shared ref: cleared early by pending effect / newer range.
						if (visibleRangeTimeoutRef.current) {
							clearTimeout(visibleRangeTimeoutRef.current);
						}
						visibleRangeTimeoutRef.current = setTimeout(() => {
							pendingSyncTimeRangeRef.current = null;
							isRemoteVisibleRangeRef.current = false;
							visibleRangeTimeoutRef.current = undefined;
						}, 5000);
						// Guard stays true until pending sync effect fires or timeout above
						return;
					}

					// TV Date Range semantics (spec §2.1, B1): absolute timestamps are
					// PRIMARY (same calendar dates on every chart). relativePosition
					// ratio is only a fallback when timestamps miss local data.
					const resolved = resolveSyncIndexes(
						plotData.map((d: any) => d.date.getTime()),
						{ fromTs, toTs, relativePosition: range.relativePosition },
					);
					let { fromIdx, toIdx } = resolved;
					if (fromIdx < 0) fromIdx = 0;
					if (toIdx < 0) toIdx = plotData.length - 1;
					if (fromIdx >= toIdx || plotData.length === 0) {
						if (isRemote) {
							visibleRangeTimeoutRef.current = setTimeout(() => {
								isRemoteVisibleRangeRef.current = false;
							}, 200);
						}
						// Prevent followLatest from snapping to right edge while range is invalid.
						if (isForkRuntime && isRemote) {
							const engine = engineInstanceRef.current;
							if (engine) {
								engine.setCameraState({ followLatest: false });
							}
						}
						return;
					}
					if (isRemote) {
						visibleRangeTimeoutRef.current = setTimeout(() => {
							isRemoteVisibleRangeRef.current = false;
							lastRemoteRangeRef.current = null;
						}, 200);
					}
					if (isForkRuntime) {
						const engine = engineInstanceRef.current;
						if (engine) {
						// B2/SY-03: remote-led view is history-led — never followLatest,
						// or the next tick/append auto-scrolls to right edge (Gap 2).
							if (isRemote) {
								engine.setCameraState({ followLatest: false });
								// P1-H: record applied timestamps for content-based echo suppression.
								// Anchor applies record too (same invariant: a remote-led view that
								// re-emits its anchored range is echoing, not panning).
								lastRemoteRangeRef.current = { from: fromTs, to: toTs };
							}
							// Sync convention fix: fromIdx/toIdx are INCLUSIVE rendered bars
							// but zoomToRange is half-open [from, to) — raw toIdx drops a
							// bar per hop and ratchets synced charts to max zoom-in.
							engine.zoomToRange({ from: fromIdx, to: toIdx + 1 });
							// Applied range supersedes any older pending stash (else stale
							// pending keeps skipping local commits downstream).
							pendingSyncTimeRangeRef.current = null;
						} else {
							pendingSyncTimeRangeRef.current = null;
						}
					} else {
						setLegacyVisibleRange({
							startIndex: fromIdx,
							endIndex: toIdx,
							startDate: plotData[fromIdx]?.date ?? new Date(fromTs),
							endDate: plotData[toIdx]?.date ?? new Date(toTs),
							timeRange: { from: fromTs, to: toTs },
							barCount: toIdx - fromIdx,
						});
						pendingSyncTimeRangeRef.current = null;
					}
				} else if (isForkRuntime) {
					if (isRemote) {
						visibleRangeTimeoutRef.current = setTimeout(() => {
							isRemoteVisibleRangeRef.current = false;
						}, 200);
					}
					const engine = engineInstanceRef.current;
					if (engine) {
						const from = range.from ?? range.startIndex;
						const to = range.to ?? range.endIndex;
						// B2/SY-03: same invariant as the timeRange happy-path above.
						if (isRemote) {
							engine.setCameraState({ followLatest: false });
						}
						engine.zoomToRange({ from, to });
					}
				} else {
					// Ensure range has timeRange
					const rangeWithTimeRange = range.timeRange ? range : {
						...range,
						timeRange: {
							from: range.startDate?.getTime?.() ?? range.startDate ?? 0,
							to: range.endDate?.getTime?.() ?? range.endDate ?? 0,
						},
					};
					setLegacyVisibleRange(rangeWithTimeRange);
				}
			},
			fitToData: () => {
				if (isForkRuntime) {
					const engine = engineInstanceRef.current;
					if (engine) {
						engine.zoomToRange({
							from: 0,
							to: dataResult.plotData.length - 1,
						});
					}
				} else {
					setLegacyVisibleRange({
						startIndex: 0,
						endIndex: dataResult.plotData.length - 1,
						startDate: dataResult.plotData[0]?.date ?? new Date(0),
						endDate: dataResult.plotData[dataResult.plotData.length - 1]?.date ?? new Date(0),
						timeRange: {
							from: dataResult.plotData[0]?.date.getTime() ?? 0,
							to: dataResult.plotData[dataResult.plotData.length - 1]?.date.getTime() ?? 0,
						},
						barCount: dataResult.plotData.length,
					});
				}
			},
			zoomIn: () => {
				if (isForkRuntime) {
					const engine = engineInstanceRef.current;
					if (engine) {
						const range = engine.getVisibleRange();
						if (range) {
							const span = range.to - range.from;
							const center = range.from + span / 2;
							const nextSpan = Math.max(10, span / 1.2);
							engine.zoomToRange({
								from: center - nextSpan / 2,
								to: center + nextSpan / 2,
							});
						}
					}
				} else {
					const range = resolvedLegacyVisibleRange;
					if (range) {
						const span = range.endIndex - range.startIndex;
						const center = range.startIndex + span / 2;
						const nextSpan = Math.max(10, span / 1.2);
						setLegacyVisibleRange({
							...range,
							startIndex: Math.round(center - nextSpan / 2),
							endIndex: Math.round(center + nextSpan / 2),
							barCount: Math.round(nextSpan),
						});
					}
				}
			},
			zoomOut: () => {
				if (isForkRuntime) {
					const engine = engineInstanceRef.current;
					if (engine) {
						const range = engine.getVisibleRange();
						if (range) {
							const span = range.to - range.from;
							const center = range.from + span / 2;
							const nextSpan = span * 1.2;
							engine.zoomToRange({
								from: center - nextSpan / 2,
								to: center + nextSpan / 2,
							});
						}
					}
				} else {
					const range = resolvedLegacyVisibleRange;
					if (range) {
						const span = range.endIndex - range.startIndex;
						const center = range.startIndex + span / 2;
						const nextSpan = span * 1.2;
						setLegacyVisibleRange({
							...range,
							startIndex: Math.round(center - nextSpan / 2),
							endIndex: Math.round(center + nextSpan / 2),
							barCount: Math.round(nextSpan),
						});
					}
				}
			},
			// B4/SY-07: ChartHandle parity — engine always passes the origin id.
			// Receive-only path (sole caller: GridContainer remote proxy), so the echo flag is always set below.
			setCrosshair: (crosshair: CrosshairPayload, sourceChartId?: string) => {
				if (isForkRuntime) {
					const engine = engineInstanceRef.current;
					if (!engine) return;
					const { timestamp, xIndexFloat: remoteXIndexFloat, isHovering } = crosshair;
					if (!isHovering || (timestamp == null && remoteXIndexFloat == null) || dataResult.plotData.length === 0) {
						isRemoteCrosshairRef.current = true;
						engine.setCrosshairPos(null);
						return;
					}

					let resolvedXIndexFloat: number | null;
					if (remoteXIndexFloat != null && timestamp != null) {
						// Resolve local index from timestamp (source index is NOT valid on target chart
						// when charts have different data). See REAL-06. The source xIndexFloat's
						// fractional part carries the cursor's position inside the source bar, which we
						// reuse so the mirrored crosshair sits at the exact cursor position (tz-immune).
						const sourceFraction = remoteXIndexFloat - Math.floor(remoteXIndexFloat);
						resolvedXIndexFloat = resolveLocalXIndexFromTimestamp(dataResult.plotData, timestamp, sourceFraction);
					} else if (timestamp != null) {
						resolvedXIndexFloat = resolveLocalXIndexFromTimestamp(dataResult.plotData, timestamp);
					} else {
						resolvedXIndexFloat = null;
					}

					if (resolvedXIndexFloat == null) {
						isRemoteCrosshairRef.current = true;
						engine.setCrosshairPos(null);
						return;
					}

					const visibleRange = engine.getVisibleRange();
					if (visibleRange) {
						const dataIndex = Math.floor(resolvedXIndexFloat);
						// Prevent crosshair line on borders if the target timestamp is not in the visible window
						const fromIdx = Math.max(0, Math.floor(visibleRange.from));
						const toIdx = Math.min(dataResult.plotData.length - 1, Math.ceil(visibleRange.to));
						if (fromIdx <= toIdx) {
							const fromTime = dataResult.plotData[fromIdx].date.getTime();
							const toTime = dataResult.plotData[toIdx].date.getTime();
							const barDuration = dataResult.plotData[1]
								? (dataResult.plotData[1].date.getTime() - dataResult.plotData[0].date.getTime())
								: 60000;
							if (timestamp < fromTime - barDuration || timestamp > toTime + barDuration) {
								isRemoteCrosshairRef.current = true;
								engine.setCrosshairPos(null);
								return;
							}
						}

						const fromIdxRaw = Math.floor(visibleRange.from);
						const toIdxRaw = Math.ceil(visibleRange.to);
						if (dataIndex < fromIdxRaw || dataIndex > toIdxRaw) {
							isRemoteCrosshairRef.current = true;
							engine.setCrosshairPos(null);
							return;
						}
					}

					const panes = engine.getPaneSnapshots();
					const primaryPane = panes[0];
					if (!primaryPane) {
						isRemoteCrosshairRef.current = true;
						engine.setCrosshairPos({ x: 0, y: 0 });
						return;
					}

					const x = engine.dataIndexToPixelX(primaryPane.paneId, resolvedXIndexFloat);
					if (x === null) {
						isRemoteCrosshairRef.current = true;
						engine.setCrosshairPos(null);
						return;
					}
					const localDatum = dataResult.plotData[Math.floor(resolvedXIndexFloat)];
					const displayPrice = resolveCrosshairPrice(crosshair, localSymbol, localDatum?.close ?? null);
					let y: number | null = null;
					if (displayPrice != null) {
						const rightSlot = Object.keys(primaryPane.scaleSlotStates).find(id => primaryPane.scaleSlotStates[id]?.side === "right");
						if (rightSlot) y = engine.priceToPixelY(primaryPane.paneId, rightSlot, displayPrice);
					}
					if (y === null) {
						y = primaryPane.plotBounds.top + primaryPane.plotBounds.height / 2;
					}
					isRemoteCrosshairRef.current = true;
					engine.setCrosshairPos({ x, y });
				}
			},
			clearCrosshair: () => {
				if (isForkRuntime) {
					engineInstanceRef.current?.setCrosshairPos(null);
				}
			},
			// F1/spec §2.4: center the CURRENT span on the timestamp (zoom kept).
			setTimeAnchor: (payload: { timestamp: number }) => {
				if (!isForkRuntime) return;
				const engine = engineInstanceRef.current;
				const plotData = dataResult.plotData;
				if (!engine || plotData.length === 0) return;
				const visible = engine.getVisibleRange?.();
				const span = visible ? Math.max(1, Math.round(visible.to - visible.from)) : plotData.length - 1;
				const { fromIdx, toIdx } = resolveAnchorIndexes(plotData.map((d: any) => d.date.getTime()), payload.timestamp, span);
				isRemoteVisibleRangeRef.current = true; // swallow the induced range echo (else the leader collapses to our span)
				engine.setCameraState({ followLatest: false });
				// P1-H: record the anchored view in the SAME normalized form a
				// future echo will carry (half-open [fromIdx, toIdx) — matching
				// by raw timestamps would miss by one bar and leak the echo).
				const anchoredEchoForm = normalizeForkVisibleRange({ from: fromIdx, to: toIdx }, plotData as any)?.timeRange; // ARC-1-keep: legacy bridge
				if (anchoredEchoForm) {
					lastRemoteRangeRef.current = { from: anchoredEchoForm.from, to: anchoredEchoForm.to };
				}
				engine.zoomToRange({ from: fromIdx, to: toIdx });
				if (visibleRangeTimeoutRef.current) clearTimeout(visibleRangeTimeoutRef.current);
				visibleRangeTimeoutRef.current = setTimeout(() => { isRemoteVisibleRangeRef.current = false; visibleRangeTimeoutRef.current = undefined; }, 200);
			},
			createDrawing: async (type: any, data: Partial<DrawingData>) => {
				const workspace = drawingsResult.drawingWorkspace;
				if (!workspace) return "";
				const newId = `drawing-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

				const map: Record<string, string> = {
					trendline: "trendLine",
					hline: "hLine",
					vline: "vLine",
					fibonacci: "fibonacci",
					text: "text",
					ray: "ray",
					pattern: "abcdPattern",
					pitchfork: "pitchfork",
					cycle: "cyclicLines",
					measure: "dateAndPriceRange",
				};
				const internalTool = map[type] || type;

				const drawing = createDrawingObject(internalTool as any, (data as any).points || [], { // ARC-1-keep: legacy bridge
					id: newId,
					...data
				} as any); // ARC-1-keep: legacy bridge
				const nextDrawings = [...workspace.state.drawings, drawing];
				workspace.interaction.replaceDrawings(nextDrawings);
				return newId;
			},
			updateDrawing: (drawingId: string, data: Partial<DrawingData>) => {
				const workspace = drawingsResult.drawingWorkspace;
				if (!workspace) return;
				const nextDrawings = workspace.state.drawings.map((d: any) => {
					if (d.id === drawingId) {
						return { ...d, ...data };
					}
					return d;
				});
				workspace.interaction.replaceDrawings(nextDrawings);
			},
			deleteDrawing: (drawingId: string) => {
				const workspace = drawingsResult.drawingWorkspace;
				if (!workspace) return;
				const nextDrawings = workspace.state.drawings.filter((d: any) => d.id !== drawingId);
				workspace.interaction.replaceDrawings(nextDrawings);
			},
			getDrawings: () => {
				return drawingsResult.drawingWorkspace ? [...drawingsResult.drawingWorkspace.state.drawings] as any[] : []; // ARC-1-keep: legacy bridge
			},
			setActiveTool: (tool: any) => {
				const workspace = drawingsResult.drawingWorkspace;
				if (!workspace) return;
				const map: Record<string, string | null> = {
					trendline: "trendLine",
					hline: "hLine",
					vline: "vLine",
					fibonacci: "fibonacci",
					text: "text",
					ray: "ray",
					pattern: "abcdPattern",
					pitchfork: "pitchfork",
					cycle: "cyclicLines",
					measure: "dateAndPriceRange",
					cursor: "cursor",
				};
				const targetTool = tool ? (map[tool] || tool) : "cursor";
				workspace.setActiveTool(targetTool as any); // ARC-1-keep: legacy bridge
			},
			setSymbolLinkGroup: (groupId: any) => {
				// No-op or call props callback
			},
			getSymbolLinkGroup: () => null,
			getEngineState: () => {
				return engineInstanceRef.current?.getPaneSnapshots() ?? {};
			},
			setEngineState: (state: any) => {
				// Restore snapshots
			},
			freeze: () => {
				setIsFrozen(true);
			},
			thaw: () => {
				setIsFrozen(false);
			},
			getMemoryUsage: () => {
				const webglContexts = isFrozen ? 0 : 1;
				const pointsCount = dataResult.plotData.length;
				const indicatorsCount = paneState.panes.reduce((acc: number, p: any) => acc + (p.indicators?.length || 0), 0);
				const heapSize = isFrozen
					? 2 * 1024 * 1024
					: 20 * 1024 * 1024 + pointsCount * 50 * 1024 + indicatorsCount * 2 * 1024 * 1024;
				return { heapSize, webglContexts };
			},

			// Snapshot-based freeze/thaw (ADR-0011)
			captureSnapshot: async () => {
				if (isForkRuntime && engineInstanceRef.current) {
					return engineInstanceRef.current.captureSnapshot();
				}
				throw new Error('Snapshot capture only supported in fork runtime');
			},

			restoreFromSnapshot: async (snapshot: ImageBitmap | HTMLCanvasElement) => {
				if (isForkRuntime && engineInstanceRef.current) {
					return engineInstanceRef.current.restoreFromSnapshot(snapshot);
				}
				throw new Error('Snapshot restore only supported in fork runtime');
			},

			destroy: () => {
				// Unregister
			},
			// Sync methods (for MultiCharts orchestration)
			syncDrawing: (operation: DrawingOperation) => {
				if (props.syncOverrides?.drawings === false) return;
				// Broadcast drawing operation to other charts in sync group via SyncContext
				// This is called by MultiCharts when it receives a drawing operation from another chart
				// The operation is applied locally via the drawing workspace
				const workspace = drawingsResult.drawingWorkspace;
				if (!workspace) return;

				isRemoteDrawingChangeRef.current = true;

				const mapPt = (p: any) => syncPointToDrawingPoint(p);

				switch (operation.type) {
					case 'create':
						if (operation.data) {
							const mappedPts = (operation.data.points || []).map(mapPt);
							const newDrawing = createDrawingObject(
						operation.data.type as any, // ARC-1-keep: legacy bridge
						mappedPts as any, // ARC-1-keep: legacy bridge
						{ id: operation.drawingId, ...operation.data } as any // ARC-1-keep: legacy bridge
							);
							const nextDrawings = [...workspace.state.drawings, newDrawing];
							workspace.interaction.replaceDrawings(nextDrawings);
						}
						break;
					case 'update': {
						const opData = operation.data;
						if (opData) {
							const syncStyle = opData.style || {};
							const localStyle: Record<string, any> = {};
							if (syncStyle.color !== undefined) localStyle.stroke = syncStyle.color;
							if (syncStyle.lineWidth !== undefined) localStyle.strokeWidth = syncStyle.lineWidth;
							if (syncStyle.lineStyle !== undefined) localStyle.strokeDasharray = syncStyle.lineStyle;
							if (syncStyle.fillColor !== undefined) localStyle.fill = syncStyle.fillColor;
							if (syncStyle.opacity !== undefined) localStyle.opacity = syncStyle.opacity;
							if (syncStyle.fontSize !== undefined) localStyle.fontSize = syncStyle.fontSize;
							if (syncStyle.fontFamily !== undefined) localStyle.fontFamily = syncStyle.fontFamily;
							const nextDrawings = workspace.state.drawings.map((d: any) => {
								if (d.id === operation.drawingId) {
									return { ...d, ...opData, style: { ...d.style, ...localStyle }, points: (opData.points || []).map(mapPt) };
								}
								return d;
							});
							workspace.interaction.replaceDrawings(nextDrawings);
						}
						break;
					}
					case 'delete':
						const nextDrawings = workspace.state.drawings.filter((d: any) => d.id !== operation.drawingId);
						workspace.interaction.replaceDrawings(nextDrawings);
						break;
					case 'move-point': {
						const pts = operation.data?.points;
						if (pts) {
							const nextDrawings = workspace.state.drawings.map((d: any) => {
								if (d.id === operation.drawingId) {
									return { ...d, points: pts.map(mapPt) };
								}
								return d;
							});
							workspace.interaction.replaceDrawings(nextDrawings);
						}
						break;
					}
						break;
				}
				syncDrawingHandlersRef.current.forEach((h: any) => h(operation));
			},
			syncViewport: (payload: VisibleRangePayload | CrosshairPayload) => {
				// Broadcast viewport changes (visible range + crosshair) to other charts in sync group
				// This is called by MultiCharts when it receives a viewport update from another chart
				if ('timeRange' in payload) {
					if (props.syncOverrides?.visibleRange === false) return;
					// VisibleRangePayload - sync visible range
					// Convert Unix timestamps to data indices
					const range = payload as VisibleRangePayload;
					const plotData = dataResult.plotData;
					const fromTs = range.timeRange.from;
					const toTs = range.timeRange.to;
					let fromIdx = plotData.findIndex((d: any) => d.date.getTime() >= fromTs);
					let toIdx = -1;
					for (let i = plotData.length - 1; i >= 0; i--) {
						if (plotData[i].date.getTime() <= toTs) {
							toIdx = i;
							break;
						}
					}
					if (fromIdx < 0) fromIdx = 0;
					if (toIdx < 0) toIdx = plotData.length - 1;
					if (isForkRuntime) {
						const engine = engineInstanceRef.current;
						if (engine) {
						// Same half-open convention as setVisibleRange above:
						// toIdx is the last rendered bar (inclusive) → +1.
							engine.zoomToRange({
								from: fromIdx,
								to: toIdx + 1,
							});
						}
					} else {
						setLegacyVisibleRange({
							startIndex: fromIdx,
							endIndex: toIdx,
							startDate: plotData[fromIdx]?.date ?? new Date(fromTs),
							endDate: plotData[toIdx]?.date ?? new Date(toTs),
							timeRange: { from: fromTs, to: toTs },
							barCount: toIdx - fromIdx,
						});
					}
				} else {
					// CrosshairPayload - sync crosshair
					if (props.syncOverrides?.crosshair === false) return;
					const crosshairPayload = payload as CrosshairPayload;
					if (isForkRuntime) {
						const engine = engineInstanceRef.current;
						if (!engine) return;
						const { timestamp, xIndexFloat: remoteXIndexFloat, price, isHovering } = crosshairPayload;
						if (!isHovering || (timestamp == null && remoteXIndexFloat == null)) {
							isRemoteCrosshairRef.current = true;
							engine.setCrosshairPos(null);
							return;
						}
						const plotData = dataResult.plotData;

						let resolvedXIndexFloat: number | null;
						if (remoteXIndexFloat != null && timestamp != null) {
							// Resolve local index from timestamp (source index is NOT valid on target chart
							// when charts have different data). See REAL-06. Reuse the source bar fraction
							// so the mirrored crosshair sits at the exact cursor position (tz-immune).
							const sourceFraction = remoteXIndexFloat - Math.floor(remoteXIndexFloat);
							resolvedXIndexFloat = resolveLocalXIndexFromTimestamp(plotData, timestamp, sourceFraction);
						} else if (timestamp != null) {
							resolvedXIndexFloat = resolveLocalXIndexFromTimestamp(plotData, timestamp);
						} else {
							resolvedXIndexFloat = null;
						}

						if (resolvedXIndexFloat == null) {
							isRemoteCrosshairRef.current = true;
							engine.setCrosshairPos(null);
							return;
						}

						const panes = engine.getPaneSnapshots();
						const visibleRange = engine.getVisibleRange();
						if (visibleRange) {
							const fromIdx = Math.floor(visibleRange.from);
							const toIdx = Math.ceil(visibleRange.to);
							if (resolvedXIndexFloat < fromIdx || resolvedXIndexFloat > toIdx) {
								isRemoteCrosshairRef.current = true;
								engine.setCrosshairPos(null);
								return;
							}
						}
						const primaryPane = panes[0];
						if (!primaryPane) {
							isRemoteCrosshairRef.current = true;
							engine.setCrosshairPos({ x: 0, y: 0 });
							return;
						}
						const x = engine.dataIndexToPixelX(primaryPane.paneId, resolvedXIndexFloat);
						if (x === null) {
							isRemoteCrosshairRef.current = true;
							engine.setCrosshairPos(null);
							return;
						}
						let y: number | null = null;
						if (price != null) {
							const rightSlot = Object.keys(primaryPane.scaleSlotStates).find(
								id => primaryPane.scaleSlotStates[id]?.side === "right"
							);
							if (rightSlot) {
								y = engine.priceToPixelY(primaryPane.paneId, rightSlot, price);
							}
						}
						if (y === null) {
							y = primaryPane.plotBounds.top + primaryPane.plotBounds.height / 2;
						}
						isRemoteCrosshairRef.current = true;
						engine.setCrosshairPos({ x, y });
					}
				}
				syncViewportHandlersRef.current.forEach((h: any) => h(payload));
			},
			onSyncDrawing: (handler: (operation: DrawingOperation) => void) => {
				syncDrawingHandlersRef.current.add(handler);
				return () => { syncDrawingHandlersRef.current.delete(handler); };
			},
			onSyncViewport: (handler: (payload: VisibleRangePayload | CrosshairPayload) => void) => {
				syncViewportHandlersRef.current.add(handler);
				return () => { syncViewportHandlersRef.current.delete(handler); };
			},
			setTimeframe: (tf: string, sourceChartId?: string) => {
				if (sourceChartId && sourceChartId === (props.id || "")) return;
				if (sourceChartId && props.syncOverrides?.timeframe === false) return;
				if (settings.localTimeframe === tf) return;
				if (sourceChartId) {
					settings.setLocalTimeframe(tf as any); // ARC-1-keep: legacy bridge
				} else {
					settings.handleTimeframeChange(tf as any); // ARC-1-keep: legacy bridge
				}
			},
			setChartType: (ct: string, sourceChartId?: string) => {
				if (sourceChartId && sourceChartId === (props.id || "")) return;
				if (sourceChartId && props.syncOverrides?.chartType === false) return;
				setChartType(ct);
				const seriesType = CHART_TYPE_MAP[ct];
				if (seriesType) {
					paneState.dispatch({ type: "updateSeriesType", paneId: "price", seriesType, seriesIndex: 0 });
				}
				// Only fire onChartTypeChange for local invocations (no sourceChartId).
				// Remote sync calls already propagate via syncContext; firing here would
				// create a re-broadcast cycle that drops updates on row 2+ charts.
				if (!sourceChartId) {
					props.onChartTypeChange?.(ct);
				}
			}
		};
		return {
			...handleObj,
			getHandle: () => handleObj,
			getVisibleRange: handleObj.getVisibleRange,
			setVisibleRange: handleObj.setVisibleRange,
			getPaneSnapshots: () => {
				if (isForkRuntime) {
					const engine = engineInstanceRef.current;
					return engine?.getPaneSnapshots() ?? [];
				}
				return legacyPaneSnapshots;
			},
			getCoordinateBridge: () => {
				if (isForkRuntime) {
					const engine = engineInstanceRef.current;
					const range = engine?.getVisibleRange() ?? null;
					return createWidgetCoordinateBridge({
						paneSnapshots,
						visibleRange: range,
						plotData: dataResult.plotData,
						engineRuntime: "fork",
						pixelRatio: props.pixelRatio,
					});
				}
				return legacyCoordinateBridge;
			},
			getDrawingWorkspace: () => drawingsResult.drawingWorkspace,
			exportDrawings: () => {
				return drawingsResult.drawingWorkspace ? [...drawingsResult.drawingWorkspace.state.drawings] : [];
			},
			getDrawings: () => {
				const workspace = drawingsResult.drawingWorkspace;
				if (!workspace) return [];
				// Convert DrawingObject[] to DrawingData[]
				return workspace.state.drawings.map((d: any) => ({
					id: d.id,
					type: d.type,
					symbol: d.symbol,
					timeframe: d.timeframe,
					points: d.points.map((p: any) => ({ timestamp: p.timestamp, price: p.price })),
					style: d.style,
					label: d.label,
					locked: d.locked,
					zIndex: d.zIndex,
				}));
			},
			importDrawings: (drawingsToImport: DrawingData[]) => {
				// Convert DrawingData[] to DrawingObject[]
				const drawingObjects = drawingsToImport.map((d: any) => createDrawingObject(
					d.type as any, // ARC-1-keep: legacy bridge
					d.points as any, // ARC-1-keep: legacy bridge
					{ id: d.id, ...d } as any // ARC-1-keep: legacy bridge
				));
				drawingsResult.drawingWorkspace?.interaction.replaceDrawings(drawingObjects);
			},
			theme: settings.resolvedTheme,
			toggleTheme: settings.themeState.toggleTheme,
			isFullscreen: settings.isFullscreen,
			toggleFullscreen: settings.handleFullscreenToggle,
			// W1.4: gate ở public API. Host integration gọi
			// `handle.saveAsImage()` không đi qua header nên gate ở UI là không đủ.
			// Fail-closed: `canExportImage` là boolean BẮT BUỘC và kiểm tra truthy,
			// nên `undefined` (quên truyền) cũng bị chặn — y hệt `canUseReplay`.
			saveAsImage: canExportImage ? settings.handleSnapshot : () => onExportBlocked?.(),

			saveTemplate: handleSaveTemplate,
			loadTemplate: handleLoadTemplate,
			openSettings: () => settings.setLocalSettingsOpen(true),
			openAlerts: () => openAlertsModal(),
			cycleMagnet: () => {
				settings.setMagnetSensitivity((prev: any) => {
					if (prev === "off") return "weak";
					if (prev === "weak") return "normal";
					if (prev === "normal") return "strong";
					return "off";
				});
			},
			getMagnetSensitivity: () => {
				const sens = settings.magnetSensitivity;
				if (sens === "strong") return 3;
				if (sens === "normal") return 2;
				if (sens === "weak") return 1;
				return 0;
			},
			setTheme: (config: ThemeConfig) => {
				const el = containerRef.current;
				if (!el) return;
				applyTheme(el, config);
				// Sync engine theme with grid properties from CSS
				const engine = engineInstanceRef.current;
				if (engine?.setTheme) {
					const style = getComputedStyle(el);
					const read = (name: string) => style.getPropertyValue(name).trim();
					engine.setTheme({
						mode: config.mode,
						axisLabelColor: props.axisLabelColor,
						gridColor: read("--vnsc-color-grid") || undefined,
						gridDash: read("--vnsc-grid-dash") || undefined,
						gridWidth: Number(read("--vnsc-grid-width")) || undefined,
						crosshairColor: config.mode === "dark" ? "rgba(121,141,166,0.55)" : "rgba(93,110,135,0.65)",
					});
				}
			},
			getTheme: () => {
				const el = containerRef.current;
				if (!el) return { mode: "dark" as const };
				return readThemeFromElement(el);
			},
			getPlotData: () => dataResult.plotData,
			getActiveIndicators: () => paneState.panes.flatMap((p: any) => p.series),
			onDataChange: (cb: (data: EnrichedDatum[]) => void) => {
				onDataChangeCallbacks.current.add(cb);
				return () => { onDataChangeCallbacks.current.delete(cb); };
			},
			onIndicatorsChange: (cb: (indicators: SeriesConfig[]) => void) => {
				onIndicatorsChangeCallbacks.current.add(cb);
				return () => { onIndicatorsChangeCallbacks.current.delete(cb); };
			},
			// Replay control methods (for multi-chart orchestration).
			// AUTH-03: read-only accessors always work; every mutating command is
			// fail-closed unless the tier grants replay.
			getReplayState: () => ({
				playing: replay.playing,
				speed: replay.speed,
				currentBar: replay.currentBar,
				totalBars: replay.totalBars,
				currentBarTimestamp: replay.currentBarTimestamp,
				sessionActive: replay.sessionActive,
			}),
			replayPlay: canUseReplay ? replay.onReplayPlay : noop,
			replayPause: canUseReplay ? replay.onReplayPause : noop,
			replayStop: canUseReplay ? replay.onReplayStop : noop,
			replayStepForward: canUseReplay ? replay.onReplayStepForward : noop,
			replayStepBack: canUseReplay ? replay.onReplayStepBack : noop,
			replayRewind: canUseReplay ? replay.onReplayRewind : noop,
			replaySetSpeed: canUseReplay ? replay.onReplaySpeedChange : noop,
			replaySeek: canUseReplay ? replay.onReplaySeek : noop,
			replaySeekByTimestamp: (timestamp: number) => {
				if (!canUseReplay) return;
				// R3.1: bus-applied seek — suppress the controller-tick echo.
				if (suppressReplayTickRef) suppressReplayTickRef.current = true;
				// R1-b: a bus-applied seek is remote-led — neither followLatest
				// (sliced data would auto-scroll) nor pan propagation (Q6 loop).
				isRemoteVisibleRangeRef.current = true;
				if (visibleRangeTimeoutRef.current) clearTimeout(visibleRangeTimeoutRef.current);
				visibleRangeTimeoutRef.current = setTimeout(() => {
					isRemoteVisibleRangeRef.current = false;
					visibleRangeTimeoutRef.current = undefined;
				}, 200);
				const seekEngine = engineInstanceRef.current;
				if (seekEngine) seekEngine.setCameraState({ followLatest: false });
				replay.onReplaySeekByDate(timestamp);
			},
			// R1.2: enter selection mode only — no magic seek to epoch (date=0).
			replaySelectStartBar: () => {
				if (!canUseReplay) return;
				replayBarVisibleRef.current = true;
				replayAwaitingStartBarRef.current = true;
				setReplayAwaitingStartBar(true);
			},
			replayCancelSelection: () => {
				// Cancelling is always allowed so a locked tier can still clean up.
				replayBarVisibleRef.current = false;
				replayAwaitingStartBarRef.current = false;
				setReplayAwaitingStartBar(false);
			},
			getReplayTotalPnl: () => replayTrading.totalPnl,
			getReplayAnalytics: () => replayTrading.analytics,
			getReplayAwaitingStartBar: () => replayAwaitingStartBar,
			addIndicator: (config: SeriesConfig) => {
				const targetPaneId = "price";
				paneState.dispatch({
					type: "addSeries",
					paneId: targetPaneId,
					series: config,
				});
			},
			addCompareSymbol: (symbolId: string) => {
				comparisonState.addSymbol(symbolId);
			},
			removeCompareSymbol: (symbolId: string) => comparisonState.removeSymbol(symbolId),
			getCompareOverlaySymbols: () => comparisonState.overlays.map((o: any) => o.symbolId),
			getCompareOverlayEntries: () => comparisonState.overlays.map((o: any) => ({
				symbolId: o.symbolId,
				normalizeToBaseline: o.normalizeToBaseline,
				visible: o.visible,
				color: o.color,
				yAxis: o.yAxis,
				lineWidth: o.lineWidth,
			})),
			updateCompareOverlay: (symbolId: string, partial: Record<string, unknown>) => {
				comparisonState.updateOverlay(symbolId, partial as any); // ARC-1-keep: legacy bridge
			},
		};
	});
}
