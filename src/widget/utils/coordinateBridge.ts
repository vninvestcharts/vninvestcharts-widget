import { scaleLinear } from "d3-scale";
import {
	createDateTimeIndexMap,
	createPaneProjector,
	resolvePanePixelAtDataIndex,
	resolvePanePixelAtValue,
	type VisibleRange as EngineVisibleRange,
} from "@vninvestcharts/engine-core";
import { resolvePointAnchor } from "@vninvestcharts/engine-drawing";
import {
	type WidgetCoordinateBridge,
	type WidgetPaneRuntimeSnapshot,
	CHART_MARGIN,
	resolvePreferredScaleSlotId,
	resolveForkChartConfigScaleSlotId,
	findPlotDataIndexByTime,
} from "./widgetHelpers";
import {
	normalizeVisibleRangeForEngine,
	normalizeEngineVisibleRange,
	normalizeVisibleRangeFork,
	findNearestDateIndex,
} from "../visibleRangeBridge";
import { type VisibleRange } from "../../lib/core";
import { type EnrichedDatum } from "../../lib/core/calculators/types";
import type { Point } from "@vninvestcharts/engine-drawing";
import type { MeasurementCoordinateInput, MeasurementCoordinatePixelInput } from "@vninvestcharts/engine-drawing";
import { type ChartRenderContextValue } from "../../lib/core/canvas/ChartRenderContext";
import { type StockChartContextValue } from "../../lib/StockChartContext";
import type { ResolvedWidgetRuntime } from "../runtimePolicy";

export function createWidgetCoordinateBridge(
	paneSnapshotsOrOptions: readonly WidgetPaneRuntimeSnapshot[] | {
		paneSnapshots: readonly WidgetPaneRuntimeSnapshot[];
		visibleRange: EngineVisibleRange | VisibleRange | null;
		plotData: readonly EnrichedDatum[];
		engineRuntime?: ResolvedWidgetRuntime;
		pixelRatio?: number;
	},
	visibleRangeArg?: EngineVisibleRange | VisibleRange | null,
	plotDataArg?: readonly EnrichedDatum[],
	engineRuntimeArg: ResolvedWidgetRuntime = "fork",
	pixelRatioArg?: number
): WidgetCoordinateBridge | null {
	let paneSnapshots: readonly WidgetPaneRuntimeSnapshot[];
	let visibleRange: EngineVisibleRange | VisibleRange | null;
	let plotData: readonly EnrichedDatum[];
	let engineRuntime: ResolvedWidgetRuntime;
	let pixelRatio: number | undefined;

	if (paneSnapshotsOrOptions && !Array.isArray(paneSnapshotsOrOptions) && "paneSnapshots" in paneSnapshotsOrOptions) {
		paneSnapshots = paneSnapshotsOrOptions.paneSnapshots;
		visibleRange = paneSnapshotsOrOptions.visibleRange;
		plotData = paneSnapshotsOrOptions.plotData;
		engineRuntime = paneSnapshotsOrOptions.engineRuntime ?? "fork";
		pixelRatio = paneSnapshotsOrOptions.pixelRatio;
	} else {
		paneSnapshots = paneSnapshotsOrOptions as readonly WidgetPaneRuntimeSnapshot[];
		visibleRange = visibleRangeArg ?? null;
		plotData = plotDataArg ?? [];
		engineRuntime = engineRuntimeArg;
		pixelRatio = pixelRatioArg;
	}

	// AC-9(a) DECISION: keep both branches, do not collapse them. Since the 0.1.0
	// narrowing, `engineRuntime` is typed `ResolvedWidgetRuntime` (= "fork"), so the
	// `:` arms below are unreachable *by type*. They are retained deliberately:
	// `normalizeVisibleRangeForEngine` still has a live caller
	// (`useWidgetData.ts:1612`), and deleting the comparison here would change which
	// normaliser runs for any future caller that passes the value dynamically. Removing
	// them is a behaviour change that needs its own plan, not a side effect of the
	// narrowing. Verified unreachable-by-type with:
	//   node scripts/rg.mjs src 'engineRuntime ===' --include-ext=.ts
	// -> 2 real comparisons in THIS file (the two above), plus widgetEquality.ts:147
	//    (bridge diffing, unrelated) and runtimePolicy.ts:71 (an `=== undefined`
	//    check, unrelated). The grep also matches this comment, which is why the
	//    count is 5 and not 2 - do not treat that as a fifth call site.
	const normalizedVisibleRange = engineRuntime === "fork"
		? normalizeVisibleRangeFork(visibleRange as EngineVisibleRange | null, plotData.length)
		: normalizeVisibleRangeForEngine(visibleRange, plotData.length);

	if (!normalizedVisibleRange || plotData.length === 0 || paneSnapshots.length === 0) {
		return null;
	}

	// Capture pixelRatio in a closure-friendly way
	const capturedPixelRatio = pixelRatio ?? 1;

	const paneSnapshotMap = new Map(paneSnapshots.map((snapshot) => [snapshot.paneId, snapshot] as const));
	const timeIndexMap = createDateTimeIndexMap(plotData);
	const projectorCache = new Map<string, ReturnType<typeof createPaneProjector>>();
	const useCenteredIndexProjection = engineRuntime === "fork";

	const resolvePaneProjector = (snapshot: WidgetPaneRuntimeSnapshot, resolvedScaleSlotId: string) => {
		const cacheKey = `${snapshot.paneId}::${resolvedScaleSlotId}`;
		const cached = projectorCache.get(cacheKey);
		if (cached) {
			return cached;
		}

		const projector = createPaneProjector(snapshot, normalizedVisibleRange, resolvedScaleSlotId);
		projectorCache.set(cacheKey, projector);
		return projector;
	};

	const resolveWidgetChartPoint = (
		snapshot: WidgetPaneRuntimeSnapshot,
		resolvedScaleSlotId: string,
		x: number,
		y: number,
	): Point | undefined => {
		const projector = resolvePaneProjector(snapshot, resolvedScaleSlotId);
		const fractionalIndex = (() => {
			const projected = projector.pixelXToIndex(x);
			if (projected !== null) {
				return useCenteredIndexProjection ? projected - 0.5 : projected;
			}

			if (snapshot.plotBounds.width <= 0) {
				return null;
			}

			const from = Math.min(normalizedVisibleRange.from, normalizedVisibleRange.to);
			const to = Math.max(normalizedVisibleRange.from, normalizedVisibleRange.to);
			const span = Math.max(1e-6, to - from);
			const ratio = (x - snapshot.plotBounds.left) / snapshot.plotBounds.width;
			const index = from + ratio * span;
			return useCenteredIndexProjection ? index - 0.5 : index;
		})();
		if (fractionalIndex === null) {
			return undefined;
		}

		const timestamp = timeIndexMap.resolveTimeByIndex(fractionalIndex);
		const value = (() => {
			const projected = projector.pixelYToValue(y);
			if (projected !== null) {
				return projected;
			}

			const domain = snapshot.scaleSlotStates[resolvedScaleSlotId]?.domain;
			const hasFiniteDomain = Array.isArray(domain)
				&& domain.length >= 2
				&& Number.isFinite(domain[0])
				&& Number.isFinite(domain[1])
				&& domain[0] !== domain[1]
				&& snapshot.plotBounds.height > 0;
			if (!hasFiniteDomain) {
				return null;
			}

			const ratio = (snapshot.plotBounds.top + snapshot.plotBounds.height - y) / snapshot.plotBounds.height;
			return domain[0] + ratio * (domain[1] - domain[0]);
		})();
		if (timestamp === null || !Number.isFinite(timestamp) || value === null) {
			return undefined;
		}

		return {
			x: timestamp,
			y: value,
			xIndexFloat: fractionalIndex,
			timeMsHint: timestamp,
			yPrice: value,
		};
	};

	const resolveWidgetPointPixel = (
		snapshot: WidgetPaneRuntimeSnapshot,
		resolvedScaleSlotId: string,
		point: Point,
	) => {
		const anchor = resolvePointAnchor(point);
		const projector = resolvePaneProjector(snapshot, resolvedScaleSlotId);
		const fractionalDataIndex = typeof anchor.xIndexFloat === "number" && Number.isFinite(anchor.xIndexFloat)
			? anchor.xIndexFloat
			: (typeof anchor.timeMsHint === "number" ? timeIndexMap.resolveIndexByTime(anchor.timeMsHint) : null);
		const x = fractionalDataIndex === null
			? null
			: (() => {
				const targetIndex = useCenteredIndexProjection ? fractionalDataIndex + 0.5 : fractionalDataIndex;
				const projected = projector.indexToPixelX(targetIndex);
				if (projected !== null) {
					return projected;
				}

				const from = Math.min(normalizedVisibleRange.from, normalizedVisibleRange.to);
				const to = Math.max(normalizedVisibleRange.from, normalizedVisibleRange.to);
				const span = Math.max(1e-6, to - from);
				const ratio = (targetIndex - from) / span;
				return snapshot.plotBounds.left + ratio * snapshot.plotBounds.width;
			})();
		const y = typeof anchor.yPrice === "number" ? projector.valueToPixelY(anchor.yPrice) : null;
		if (x === null || y === null) {
			return undefined;
		}

		return {
			x,
			y,
		};
	};
	return {
		engineRuntime,
		paneSnapshots,
		visibleRange: normalizedVisibleRange,
		resolveChartPoint: ({ paneId, x, y, scaleSlotId }) => {
			const snapshot = paneSnapshotMap.get(paneId);
			if (!snapshot) {
				return undefined;
			}

			const resolvedScaleSlotId = resolvePreferredScaleSlotId(snapshot, scaleSlotId);
			if (!resolvedScaleSlotId) {
				return undefined;
			}

			return resolveWidgetChartPoint(snapshot, resolvedScaleSlotId, x, y);
		},
		chartPointToPixel: ({ paneId, point, scaleSlotId }) => {
			const snapshot = paneSnapshotMap.get(paneId);
			if (!snapshot) {
				return undefined;
			}

			const resolvedScaleSlotId = resolvePreferredScaleSlotId(snapshot, scaleSlotId);
			if (!resolvedScaleSlotId) {
				return undefined;
			}

			return resolveWidgetPointPixel(snapshot, resolvedScaleSlotId, point);
		},
		resolveMeasurementPoint: ({ paneId, x, y, scaleSlotId }: MeasurementCoordinateInput) => {
			const snapshot = paneSnapshotMap.get(paneId);
			if (!snapshot) {
				return undefined;
			}

			const resolvedScaleSlotId = resolvePreferredScaleSlotId(snapshot, scaleSlotId);
			if (!resolvedScaleSlotId) {
				return undefined;
			}

			const chartPoint = resolveWidgetChartPoint(snapshot, resolvedScaleSlotId, x, y);
			if (!chartPoint) {
				return undefined;
			}

			const index = findPlotDataIndexByTime(chartPoint.x, plotData);
			const datum = index >= 0 ? plotData[index] : undefined;
			if (!datum?.date) {
				return undefined;
			}

			return {
				index,
				date: datum.date,
				price: chartPoint.y,
			};
		},
		measurementPointToPixel: ({ paneId, point, scaleSlotId }: MeasurementCoordinatePixelInput) => {
			const snapshot = paneSnapshotMap.get(paneId);
			if (!snapshot) {
				return undefined;
			}

			const resolvedScaleSlotId = resolvePreferredScaleSlotId(snapshot, scaleSlotId);
			if (!resolvedScaleSlotId) {
				return undefined;
			}

			return resolveWidgetPointPixel(snapshot, resolvedScaleSlotId, {
				x: point.date.getTime(),
				y: point.price,
				timeMsHint: point.date.getTime(),
				yPrice: point.price,
			});
		},
	};
}

export function createForkChartRenderContextValue({
	paneSnapshots,
	visibleRange,
	plotData,
	width,
	height,
	pixelRatio,
}: {
	paneSnapshots: readonly WidgetPaneRuntimeSnapshot[];
	visibleRange: EngineVisibleRange | null;
	plotData: readonly EnrichedDatum[];
	width: number;
	height: number;
	pixelRatio?: number;
}): ChartRenderContextValue | null {
	const normalizedVisibleRange = normalizeEngineVisibleRange(visibleRange, plotData.length);
	if (!normalizedVisibleRange || paneSnapshots.length === 0 || plotData.length === 0) {
		return null;
	}

	const primaryPaneSnapshot = paneSnapshots[0];
	const primaryScaleSlotId = resolvePreferredScaleSlotId(primaryPaneSnapshot);
	const startDatum = plotData[normalizedVisibleRange.from];
	const endDatum = plotData[normalizedVisibleRange.to - 1];
	if (!primaryScaleSlotId || !startDatum?.date || !endDatum?.date) {
		return null;
	}

	const visibleBarCount = Math.max(1, normalizedVisibleRange.to - normalizedVisibleRange.from);
	const candleWidth = Math.max(1, primaryPaneSnapshot.plotBounds.width / visibleBarCount);
	const timeIndexMap = createDateTimeIndexMap(plotData);

	// Create the result object using a function to ensure proper scoping
	const createResult = (pixelRatioValue: number): ChartRenderContextValue => ({
		xScale: (value: Date) => {
			const ts = value.getTime();
			const resolvedIndex = timeIndexMap.resolveIndexByTime(ts);
			const dataIndex = resolvedIndex !== null ? resolvedIndex : findNearestDateIndex(plotData, ts);
			const x = resolvePanePixelAtDataIndex(primaryPaneSnapshot, normalizedVisibleRange, dataIndex + 0.5, plotData.length);
			return x ?? Number.NaN;
		},
		xScaleByIndex: (index: number) => {
			const x = resolvePanePixelAtDataIndex(primaryPaneSnapshot, normalizedVisibleRange, index + 0.5, plotData.length);
			return x ?? Number.NaN;
		},
		yScale: (value: number) => {
			const y = resolvePanePixelAtValue(primaryPaneSnapshot, primaryScaleSlotId, value);
			return y ?? Number.NaN;
		},
		plotData: plotData as unknown as readonly Record<string, unknown>[],
		candleWidth,
		devicePixelRatio: pixelRatioValue,
		visibleRange: {
			startIndex: normalizedVisibleRange.from,
			endIndex: normalizedVisibleRange.to - 1,
			startDate: startDatum.date,
			endDate: endDatum.date,
			timeRange: { from: startDatum.date.getTime(), to: endDatum.date.getTime() },
			barCount: visibleBarCount,
		},
		width,
		height,
	});

	const capturedPixelRatio = pixelRatio ?? 1;
	return createResult(capturedPixelRatio);
}

export function createForkStockChartContextValue(
	paneSnapshotsOrOptions: readonly WidgetPaneRuntimeSnapshot[] | {
		paneSnapshots: readonly WidgetPaneRuntimeSnapshot[];
		plotData: readonly EnrichedDatum[];
		chartRenderContextValue: ChartRenderContextValue | null;
		width: number;
		height: number;
		generateSubscriptionId: () => number;
		pixelRatio?: number;
	},
	plotDataArg?: readonly EnrichedDatum[],
	chartRenderContextValueArg?: ChartRenderContextValue | null,
	widthArg?: number,
	heightArg?: number,
	generateSubscriptionIdArg?: () => number,
	pixelRatioArg?: number
): StockChartContextValue {
	let paneSnapshots: readonly WidgetPaneRuntimeSnapshot[];
	let plotData: readonly EnrichedDatum[];
	let chartRenderContextValue: ChartRenderContextValue | null;
	let width: number;
	let height: number;
	let generateSubscriptionId: () => number;
	let pixelRatio: number | undefined;

	if (paneSnapshotsOrOptions && !Array.isArray(paneSnapshotsOrOptions) && "paneSnapshots" in paneSnapshotsOrOptions) {
		paneSnapshots = paneSnapshotsOrOptions.paneSnapshots;
		plotData = paneSnapshotsOrOptions.plotData;
		chartRenderContextValue = paneSnapshotsOrOptions.chartRenderContextValue;
		width = paneSnapshotsOrOptions.width;
		height = paneSnapshotsOrOptions.height;
		generateSubscriptionId = paneSnapshotsOrOptions.generateSubscriptionId;
		pixelRatio = paneSnapshotsOrOptions.pixelRatio;
	} else {
		paneSnapshots = paneSnapshotsOrOptions as readonly WidgetPaneRuntimeSnapshot[];
		plotData = plotDataArg ?? [];
		chartRenderContextValue = chartRenderContextValueArg ?? null;
		width = widthArg ?? 0;
		height = heightArg ?? 0;
		generateSubscriptionId = generateSubscriptionIdArg ?? (() => Date.now() + Math.random());
		pixelRatio = pixelRatioArg;
	}

	const capturedPixelRatio = pixelRatio ?? 1;
	const chartConfig = {
		pixelRatio: capturedPixelRatio,
	};
	const chartConfigMapped = paneSnapshots.map((snapshot, index) => {
		const scaleSlotId = resolveForkChartConfigScaleSlotId(snapshot);
		const scaleSlotDomain = scaleSlotId ? snapshot.scaleSlotStates[scaleSlotId]?.domain : undefined;
		const yScale = scaleLinear();
		if (Array.isArray(scaleSlotDomain) && scaleSlotDomain.length >= 2 && Number.isFinite(scaleSlotDomain[0]) && Number.isFinite(scaleSlotDomain[1]) && scaleSlotDomain[0] !== scaleSlotDomain[1]) {
			yScale.domain([scaleSlotDomain[0], scaleSlotDomain[1]]).range([snapshot.plotBounds.height, 0]);
		} else {
			yScale.domain([0, 1]).range([snapshot.plotBounds.height, 0]);
		}

		return {
			id: index,
			paneId: snapshot.paneId,
			yScaleId: scaleSlotId ?? undefined,
			origin: [snapshot.plotBounds.left, snapshot.plotBounds.top] as [number, number],
			padding: 0,
			yScale,
			yExtents: [] as any[], // ARC-1-keep: legacy bridge
			width: snapshot.plotBounds.width,
			height: snapshot.plotBounds.height,
		};
	});

	return {
		plotData: plotData as unknown as any[], // ARC-1-keep: legacy bridge
		fullData: plotData as unknown as any[], // ARC-1-keep: legacy bridge
		chartConfig: chartConfigMapped,
		xScale: chartRenderContextValue?.xScale ?? (() => Number.NaN),
		xAccessor: (datum: unknown) => (datum as { date?: Date | number })?.date ?? new Date(0),
		displayXAccessor: (datum: unknown) => (datum as { date?: Date | number })?.date ?? new Date(0),
		width,
		height,
		chartCanvasType: "svg",
		margin: CHART_MARGIN,
		ratio: chartConfig.pixelRatio ?? 1,
		subscribe: () => undefined,
		unsubscribe: () => undefined,
		generateSubscriptionId,
		getMutableState: () => ({}),
		setCursorClass: () => undefined,
		redraw: () => undefined,
		amIOnTop: () => true,
	};
}
