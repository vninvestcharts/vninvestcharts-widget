import React, { useCallback, useMemo } from "react";
import { IndicatorLegend } from "../../../lib/core";
import type { SeriesTypeId } from "../../../lib/core/types/pane-descriptor";
import type { PaneDescriptor } from "../../../lib/core";
import type { EnrichedDatum } from "../../../lib/core/calculators/types";
import { IconEye, IconEyeOff, IconSettings, IconX } from "../../components/common/Icons";
import { buildLegendSeriesValue } from "./overlayHelpers";

export interface LegendChrome {
	icons: {
		eye: React.ReactNode;
		eyeOff: React.ReactNode;
		edit: React.ReactNode;
		remove: React.ReactNode;
	};
	labels: {
		showIndicatorTitle: string;
		hideIndicatorTitle: string;
		removeIndicatorTitle: string;
		editIndicatorTitle: string;
		showIndicatorAriaLabel: (seriesLabel: string) => string;
		hideIndicatorAriaLabel: (seriesLabel: string) => string;
		removeIndicatorAriaLabel: (seriesLabel: string) => string;
		editIndicatorAriaLabel: (seriesLabel: string) => string;
	};
}

// Shared legend chrome (icons + i18n labels) so the embedded legend and the
// statusline compare node render byte-identical chips. Split from
// useWidgetOverlays (D0 headroom).
export function useLegendChrome(t: (key: string) => string): LegendChrome {
	return useMemo(() => ({
		icons: {
			eye: <IconEye size={10} />,
			eyeOff: <IconEyeOff size={10} />,
			edit: <IconSettings size={10} />,
			remove: <IconX size={10} />,
		},
		labels: {
			showIndicatorTitle: t("legend.show"),
			hideIndicatorTitle: t("legend.hide"),
			removeIndicatorTitle: t("legend.remove"),
			editIndicatorTitle: t("legend.edit"),
			showIndicatorAriaLabel: (seriesLabel: string) => `${t("legend.show")} ${seriesLabel}`,
			hideIndicatorAriaLabel: (seriesLabel: string) => `${t("legend.hide")} ${seriesLabel}`,
			removeIndicatorAriaLabel: (seriesLabel: string) => `${t("legend.remove")}: ${seriesLabel}`,
			editIndicatorAriaLabel: (seriesLabel: string) => `${t("legend.edit")}: ${seriesLabel}`,
		},
	}), [t]);
}

export interface CompareLegendNodeDeps {
	compareLegendSlot: "embedded" | "statusline";
	visiblePanes: readonly PaneDescriptor[];
	legendPanes?: readonly PaneDescriptor[];
	localizePane: (pane: PaneDescriptor) => PaneDescriptor;
	legendSeriesSuffix?: (paneId: string, seriesIndex: number) => string | undefined;
	handlePaneToggleSeries: (paneId: string, seriesType: SeriesTypeId, seriesIndex?: number) => void;
	handlePaneRemoveSeries: (paneId: string, seriesType: SeriesTypeId, seriesIndex?: number) => void;
	handlePaneEditSeries: (paneId: string) => void;
	legendChrome: LegendChrome;
	hoveredDatum?: EnrichedDatum | null;
}

// Compare-only legend node for the statusline slot. Split from
// useWidgetOverlays (D0 headroom).
export function useCompareLegendNode(deps: CompareLegendNodeDeps): (paneId: string) => React.ReactNode {
	const {
		compareLegendSlot, visiblePanes, legendPanes, localizePane, legendSeriesSuffix,
		handlePaneToggleSeries, handlePaneRemoveSeries, handlePaneEditSeries,
		legendChrome, hoveredDatum,
	} = deps;

	return useCallback((paneId: string): React.ReactNode => {
		if (compareLegendSlot !== "statusline") return null;
		const pane = visiblePanes.find((p) => p.id === paneId);
		if (!pane) return null;
		const legendPane = legendPanes?.find((lp) => lp.id === paneId) ?? localizePane(pane);
		if (!legendPane.series.some((s) => String(s.type) === "Comparison")) return null;
		const paneSuffix = legendSeriesSuffix ? (idx: number) => legendSeriesSuffix(pane.id, idx) : undefined;
		return (
			<IndicatorLegend
				pane={legendPane}
				onToggleSeries={(seriesType, seriesIndex) => handlePaneToggleSeries(pane.id, seriesType, seriesIndex)}
				onRemoveSeries={(seriesType, seriesIndex) => handlePaneRemoveSeries(pane.id, seriesType, seriesIndex)}
				onEditSeries={() => handlePaneEditSeries(pane.id)}
				icons={legendChrome.icons}
				labels={legendChrome.labels}
				seriesSuffix={paneSuffix}
				seriesValue={hoveredDatum ? (_seriesType, idx) => buildLegendSeriesValue(hoveredDatum, legendPane.series[idx]) : undefined}
				embedded
				visibleTypes={["Comparison"]}
			/>
		);
	}, [compareLegendSlot, visiblePanes, legendPanes, localizePane, legendSeriesSuffix, handlePaneToggleSeries, handlePaneRemoveSeries, handlePaneEditSeries, legendChrome, hoveredDatum]);
}
