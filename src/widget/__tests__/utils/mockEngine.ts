import { vi } from "vitest";
import {
	hitTestOverlayPrimitive,
	resolvePanePixelAtDataIndex,
	resolvePanePixelAtValue,
	type EngineOverlayDrawingPrimitiveState,
	type EngineOverlayInputs,
	type PaneRuntimeSnapshot,
} from "@vninvestcharts/engine-core";

import { DEFAULT_PANES } from "@lib/core/types/pane-descriptor";
import { computePaneScaleSlotDomains } from "@lib/core/paneScaleSlotDomains";

// Fork engine snapshots (shared test data)
export const forkEngineSnapshots = [
	{
		paneId: "price",
		bounds: { left: 0, top: 0, width: 1200, height: 420 },
		plotBounds: { left: 0, top: 28, width: 1200, height: 392 },
		axisBounds: {
			right: { left: 1152, top: 0, width: 48, height: 420 },
		},
		headerAnchor: { left: 0, top: 0, width: 1200 },
		labelAnchor: { left: 0, top: 0, height: 420 },
		scaleSlotBounds: { "price-right": { left: 1152, top: 0, width: 48, height: 420 } },
		scaleSlotStates: { "price-right": { side: "right", mode: "auto", visible: true, domain: [98, 107] } },
	},
	{
		paneId: "volume",
		bounds: { left: 0, top: 420, width: 1200, height: 180 },
		plotBounds: { left: 0, top: 448, width: 1200, height: 152 },
		axisBounds: {
			right: { left: 1152, top: 420, width: 48, height: 180 },
		},
		headerAnchor: { left: 0, top: 420, width: 1200 },
		labelAnchor: { left: 0, top: 420, height: 180 },
		scaleSlotBounds: { "volume-right": { left: 1152, top: 420, width: 48, height: 180 } },
		scaleSlotStates: { "volume-right": { side: "right", mode: "auto", visible: true, domain: [1200, 1500] } },
	},
] as const satisfies readonly PaneRuntimeSnapshot[];

export const engineHostPropsHistory: Array<Record<string, unknown>> = [];
export const mockVisibleRange = { from: 0, to: 2 };

export type MockEngineHostPointerContext = {
  paneId: string | null;
  clientX: number;
  clientY: number;
  localX: number;
  localY: number;
  pointerType: string;
  buttons: number;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
};

export function mergeTestPaneSnapshotDomains(data: readonly Record<string, unknown>[]) {
	const scaleSlotDomains = computePaneScaleSlotDomains(
		DEFAULT_PANES.filter((pane) => pane.visible),
    data as never,
	);

	return forkEngineSnapshots.map((snapshot) => {
		const scaleSlotStates = Object.fromEntries(
			Object.entries(snapshot.scaleSlotStates).map(([scaleSlotId, state]) => [
				scaleSlotId,
				{
					...state,
					domain: scaleSlotDomains[scaleSlotId] ?? state.domain,
				},
			]),
		);

		return {
			...snapshot,
			scaleSlotStates,
		} satisfies PaneRuntimeSnapshot;
	});
}

export function resolveDrawingPointIndex(data: readonly { date: Date }[], pointTime: number) {
	return data.findIndex((datum) => datum.date.getTime() === pointTime);
}

export function resolveTrendLineBodyPoint(
	data: readonly { date: Date }[],
	drawing: { points: readonly { x: number; y: number }[] },
	visibleRange: { from: number; to: number },
) {
	const priceSnapshot = mergeTestPaneSnapshotDomains(data).find((snapshot) => snapshot.paneId === "price");
	const firstPoint = drawing.points[0];
	const secondPoint = drawing.points[1];
	if (!priceSnapshot || !firstPoint || !secondPoint) {
		return null;
	}

	const firstIndex = resolveDrawingPointIndex(data, firstPoint.x);
	const secondIndex = resolveDrawingPointIndex(data, secondPoint.x);
	if (firstIndex < 0 || secondIndex < 0) {
		return null;
	}

	const firstX = resolvePanePixelAtDataIndex(priceSnapshot, visibleRange, firstIndex + 0.5, data.length);
	const secondX = resolvePanePixelAtDataIndex(priceSnapshot, visibleRange, secondIndex + 0.5, data.length);
	const firstY = resolvePanePixelAtValue(priceSnapshot, "price-right", firstPoint.y);
	const secondY = resolvePanePixelAtValue(priceSnapshot, "price-right", secondPoint.y);
	if (firstX === null || secondX === null || firstY === null || secondY === null) {
		return null;
	}

	return {
		x: Math.round((firstX + secondX) / 2),
		y: Math.round((firstY + secondY) / 2),
	};
}

export function resolveTrendLinePointPixel(
	data: readonly { date: Date }[],
	visibleRange: { from: number; to: number },
	dataIndex: number,
	price: number,
) {
	const priceSnapshot = mergeTestPaneSnapshotDomains(data).find((snapshot) => snapshot.paneId === "price");
	if (!priceSnapshot) {
		return null;
	}

	const x = resolvePanePixelAtDataIndex(priceSnapshot, visibleRange, dataIndex + 0.5, data.length);
	const y = resolvePanePixelAtValue(priceSnapshot, "price-right", price);
	if (x === null || y === null) {
		return null;
	}

	return {
		x: Math.round(x),
		y: Math.round(y),
	};
}

export function resolveTrendLineLockHandlePoint(
	data: readonly { date: Date }[],
	drawing: { points: readonly { x: number; y: number }[] },
	visibleRange: { from: number; to: number },
) {
	const priceSnapshot = mergeTestPaneSnapshotDomains(data).find((snapshot) => snapshot.paneId === "price");
	const firstPoint = drawing.points[0];
	const secondPoint = drawing.points[1];
	if (!priceSnapshot || !firstPoint || !secondPoint) {
		return null;
	}

	const firstIndex = resolveDrawingPointIndex(data, firstPoint.x);
	const secondIndex = resolveDrawingPointIndex(data, secondPoint.x);
	if (firstIndex < 0 || secondIndex < 0) {
		return null;
	}

	const firstX = resolvePanePixelAtDataIndex(priceSnapshot, visibleRange, firstIndex + 0.5, data.length);
	const secondX = resolvePanePixelAtDataIndex(priceSnapshot, visibleRange, secondIndex + 0.5, data.length);
	const firstY = resolvePanePixelAtValue(priceSnapshot, "price-right", firstPoint.y);
	const secondY = resolvePanePixelAtValue(priceSnapshot, "price-right", secondPoint.y);
	if (firstX === null || secondX === null || firstY === null || secondY === null) {
		return null;
	}

	return {
		x: Math.round(Math.min(firstX, secondX) - 14),
		y: Math.round(Math.min(firstY, secondY) - 14),
	};
}

/** Shared spy-able mock engine exposed to contract tests */
export const mockEngineSetHistorySnapshot = vi.fn<[unknown, unknown?]>();

export const mockEngineInstance = {
	mount: vi.fn(),
	dispose: vi.fn(),
	setPaneSpecs: vi.fn(),
	setDataSource: vi.fn(),
	setEnrichedData: vi.fn(),
	setHistorySnapshot: mockEngineSetHistorySnapshot,
	setCameraState: vi.fn(),
	setOverlayInputs: vi.fn(),
	getCameraState: vi.fn(() => ({ barSpacePx: 8, rightOffsetBars: 0, followLatest: true })),
	getDirtyMask: vi.fn(() => 0),
	getLastFlushedMask: vi.fn(() => 0),
	getAxisGridRendererCalls: vi.fn(() => 0),
	resetAxisGridRendererCalls: vi.fn(),
	isMounted: vi.fn(() => true),
	addListener: vi.fn(),
	removeListener: vi.fn(),
	setTheme: vi.fn(),
	setLocale: vi.fn(),
	setVisibleRange: vi.fn(),
	zoomToRange: vi.fn(),
	getVisibleRange: vi.fn(() => mockVisibleRange),
	getPaneSnapshots: vi.fn(() => forkEngineSnapshots),
	hitTestDrawingPrimitive: vi.fn((localX: number, localY: number) => {
		const overlayInputs = [...engineHostPropsHistory]
			.map((props) => props.overlayInputs as EngineOverlayInputs | undefined)
			.findLast((value) => (value?.drawingPrimitives?.length ?? 0) > 0)
      ?? [...engineHostPropsHistory]
      	.map((props) => props.overlayInputs as EngineOverlayInputs | undefined)
      	.findLast(Boolean);
		const drawingPrimitives = overlayInputs?.drawingPrimitives ?? [];

		for (let index = drawingPrimitives.length - 1; index >= 0; index -= 1) {
			const primitive = drawingPrimitives[index];
			const snapshot = forkEngineSnapshots.find((candidate) => candidate.paneId === primitive?.paneId);
			if (!primitive || !snapshot) {
				continue;
			}

			const { plotBounds } = snapshot;
			if (
				localX < plotBounds.left
        || localX > plotBounds.left + plotBounds.width
        || localY < plotBounds.top
        || localY > plotBounds.top + plotBounds.height
			) {
				continue;
			}

			const hit = hitTestOverlayPrimitive(primitive.primitive, localX - plotBounds.left, localY - plotBounds.top, {
				chartWidth: plotBounds.width,
				chartHeight: plotBounds.height,
				tolerance: 6,
			});
			if (hit) {
				return {
					key: primitive.key,
					paneId: primitive.paneId,
					scaleSlotId: primitive.scaleSlotId,
					primitive: primitive.primitive,
					selected: primitive.selected,
					drawingId: primitive.drawingId,
					actionHandle: primitive.actionHandle,
					clipToPane: primitive.clipToPane,
				} satisfies EngineOverlayDrawingPrimitiveState;
			}
		}

		return null;
	}),
};

export function resolveMockForkHoveredPaneId(localX: number, localY: number) {
	const hoveredSnapshot = forkEngineSnapshots.find((snapshot) => {
		const right = snapshot.bounds.left + snapshot.bounds.width;
		const bottom = snapshot.bounds.top + snapshot.bounds.height;
		return localX >= snapshot.bounds.left && localX <= right && localY >= snapshot.bounds.top && localY <= bottom;
	});

	return hoveredSnapshot?.paneId ?? null;
}

export function resolveMockForkHoveredDataIndex(localX: number, localY: number) {
	const hoveredSnapshot = forkEngineSnapshots.find((snapshot) => {
		const right = snapshot.plotBounds.left + snapshot.plotBounds.width;
		const bottom = snapshot.plotBounds.top + snapshot.plotBounds.height;
		return localX >= snapshot.plotBounds.left && localX <= right && localY >= snapshot.plotBounds.top && localY <= bottom;
	});

	if (!hoveredSnapshot) {
		return null;
	}

	const ratio = (localX - hoveredSnapshot.plotBounds.left) / Math.max(1, hoveredSnapshot.plotBounds.width);
	const dataIndex = Math.round(mockVisibleRange.from + ratio * (mockVisibleRange.to - mockVisibleRange.from));
	return Math.min(mockVisibleRange.to, Math.max(mockVisibleRange.from, dataIndex));
}

export function createMockMeasurementState(enabled: boolean) {
	if (!enabled) {
		return null;
	}

	return {
		enabled: true,
		hoverPoint: null,
		draft: null,
		committed: {
			paneId: "price",
			scaleSlotId: "price-right",
			start: { paneId: "price", scaleSlotId: "price-right", index: 0, price: 100, x: 120, y: 188 },
			end: { paneId: "price", scaleSlotId: "price-right", index: 1, price: 106, x: 1080, y: 132 },
		},
	};
}

export function createMockDrawingPriceLabelsState(overlayInputs?: EngineOverlayInputs) {
	const selectedPriceLabels = overlayInputs?.selectedPriceLabels;
	if (!selectedPriceLabels || selectedPriceLabels.markers.length === 0) {
		return null;
	}

	const primaryMarker = selectedPriceLabels.markers[0];
	if (!primaryMarker) {
		return null;
	}

	return {
		drawingId: selectedPriceLabels.drawingId,
		paneId: selectedPriceLabels.paneId,
		scaleSlotId: selectedPriceLabels.scaleSlotId,
		highlighted: selectedPriceLabels.highlighted,
		labels: [
			{
				key: primaryMarker.key,
				price: primaryMarker.price + 5.25,
				y: 156,
				side: "right" as const,
				fill: selectedPriceLabels.fill,
				stroke: selectedPriceLabels.stroke,
				textColor: selectedPriceLabels.textColor,
			},
		],
	};
}

export function createMockForkOverlayState(
	overrides?: {
    crosshair?: { x: number; y: number; paneId: string | null; dataIndex: number | null } | null;
    hoveredPaneId?: string | null;
    hoveredDataIndex?: number | null;
    measurement?: ReturnType<typeof createMockMeasurementState>;
    drawingPriceLabels?: ReturnType<typeof createMockDrawingPriceLabelsState>;
  },
	overlayInputs?: EngineOverlayInputs,
) {
	return {
		crosshair: overrides?.crosshair ?? null,
		hoveredPaneId: overrides?.hoveredPaneId ?? null,
		hoveredDataIndex: overrides?.hoveredDataIndex ?? null,
		xAxisTicks: [
			{ key: "volume-0", x: 120, dataIndex: 0 },
			{ key: "volume-1", x: 1080, dataIndex: 1 },
		],
		measurement: overrides?.measurement ?? createMockMeasurementState(Boolean(overlayInputs?.measurementEnabled)),
		drawingPriceLabels: overrides?.drawingPriceLabels ?? createMockDrawingPriceLabelsState(overlayInputs),
		drawingPrimitives: overlayInputs?.drawingPrimitives?.map((primitive) => ({
			key: primitive.key,
			paneId: primitive.paneId,
			scaleSlotId: primitive.scaleSlotId,
			primitive: primitive.primitive,
			selected: primitive.selected,
			drawingId: primitive.drawingId,
			actionHandle: primitive.actionHandle,
			clipToPane: primitive.clipToPane,
		})) ?? [],
	};
}
