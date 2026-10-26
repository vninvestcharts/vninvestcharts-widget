import { type EngineOverlayState } from "@vninvestcharts/engine-core";
import { type WidgetPaneRuntimeSnapshot, priceFormat } from "../utils/widgetHelpers";
import styles from "../styles/fork-overlays.module.css";

export interface ForkYAxisCrosshairLabelsProps {
	overlayState: EngineOverlayState | null;
	isDark: boolean;
	paneSnapshots: readonly WidgetPaneRuntimeSnapshot[];
	labelColorByPane?: ReadonlyMap<string, string>;
}

export function ForkYAxisCrosshairLabels({
	overlayState,
	isDark,
	paneSnapshots,
	labelColorByPane,
}: ForkYAxisCrosshairLabelsProps) {
	const crosshair = overlayState?.crosshair;
	if (!crosshair) {
		return null;
	}

	const { y } = crosshair;
	const defaultTextColor = isDark ? "#d1d4dc" : "#64748b";

	const labels: React.ReactNode[] = [];

	for (const snapshot of paneSnapshots) {
		const { plotBounds, axisBounds, scaleSlotStates } = snapshot;
		if (y < plotBounds.top || y > plotBounds.top + plotBounds.height) {
			continue;
		}

		const visibleScaleSlots = Object.entries(scaleSlotStates).filter(
			([, state]) => state.visible && state.domain
				&& Number.isFinite(state.domain[0]) && Number.isFinite(state.domain[1]),
		);
		if (visibleScaleSlots.length === 0) {
			continue;
		}

		for (const [scaleSlotId, scaleSlotState] of visibleScaleSlots) {
			const [minValue, maxValue] = scaleSlotState.domain!;
			if (maxValue === minValue || !Number.isFinite(maxValue) || !Number.isFinite(minValue)) {
				continue;
			}

			const ratio = (y - plotBounds.top) / plotBounds.height;
			const value = maxValue - ratio * (maxValue - minValue);

			const paneColor = labelColorByPane?.get(snapshot.paneId);
			const labelColor = paneColor ?? defaultTextColor;
			const isLeftAxis = scaleSlotState.side === "left";
			const leftAxisBounds = axisBounds?.left;

			labels.push(
				<div
					key={`y-crosshair-${snapshot.paneId}-${scaleSlotId}`}
					className={`${styles.forkYAxisLabel} ${snapshot.paneId !== "price" ? styles.forkYAxisLabelIndicator : ""}`}
					style={{
						top: y,
						...(isLeftAxis && leftAxisBounds
							? {
								left: leftAxisBounds.left + leftAxisBounds.width,
								textAlign: "right" as const,
								transform: "translateY(-50%) translateX(-100%)",
							}
							: {
								left: plotBounds.left + plotBounds.width,
								transform: "translateY(-50%)",
							}),
						color: labelColor,
						border: `1px solid ${paneColor ?? (isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.1)")}`,
					}}
				>
					{priceFormat(value)}
				</div>,
			);
		}
	}

	return labels.length > 0 ? <>{labels}</> : null;
}
