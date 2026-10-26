import { useCallback } from "react";
import type { PortalAdapter } from "@vninvestcharts/engine-react";
import { WorkspaceSerializer } from "../runtime/WorkspaceSerializer";
import type { PaneState } from "../context/VNInvestChartsStateContext";
import type { UseDrawingInteractionReturn } from "@vninvestcharts/engine-react";
import type { PaneDescriptor } from "../../lib/core";
import type { EnrichedDatum } from "../../lib/core/calculators/types";
import type { useWidgetSettings } from "./useWidgetSettings";

export interface WidgetWorkspaceIODeps {
	paneState: PaneState;
	drawingsInteraction: Pick<UseDrawingInteractionReturn, "allDrawings" | "replaceDrawings">;
	settings: ReturnType<typeof useWidgetSettings>;
	activeSymbol: string;
	activeTimeframe: string;
	enrichedData: readonly EnrichedDatum[];
	resolvedPanes: readonly PaneDescriptor[];
	portalAdapter?: PortalAdapter | null;
	/** BL-17: toast-capable feedback; falls back to alert() when absent. */
	notify?: (message: string, tone: "success" | "error") => void;
}

export interface WidgetWorkspaceIO {
	handleExportLayout: () => void;
	handleImportLayout: (layoutJson: string) => void;
	compareLegendSuffix: (paneId: string, seriesIndex: number) => string | undefined;
}

export function useWidgetWorkspaceIO(deps: WidgetWorkspaceIODeps): WidgetWorkspaceIO {
	const { paneState, drawingsInteraction, settings, activeSymbol, activeTimeframe, enrichedData, resolvedPanes, portalAdapter, notify } = deps;

	const feedback = useCallback((message: string, tone: "success" | "error") => {
		if (notify) {
			notify(message, tone);
		} else {
			alert(message);
		}
	}, [notify]);

	const handleExportLayout = useCallback(() => {
		const workspaceSettings = {
			theme: settings.resolvedTheme,
			timezone: settings.activeTimezone,
			timeframe: settings.localTimeframe,
			symbol: activeSymbol,
			maxVisiblePanes: settings.activeMaxVisiblePanes,
			maxVisibleBars: settings.activeMaxVisibleBars,
			showNonTradingDays: settings.activeShowNonTradingDays,
			showDrawingPriceMarkers: settings.activeShowDrawingPriceMarkers,
			enableWhale: settings.activeEnableWhale,
			whaleThreshold: settings.activeWhaleThreshold,
			enableCVD: settings.activeEnableCVD,
			cvdMode: settings.activeCvdMode,
			alertAudioEnabled: settings.activeAlertAudioEnabled,
			overlayTimeframe: settings.overlayTimeframe,
			overlayStyle: settings.overlayStyle,
		};
		const json = WorkspaceSerializer.serialize(
			paneState.panes,
			drawingsInteraction.allDrawings,
			workspaceSettings
		);

		const blob = new Blob([json], { type: "application/json" });
		const url = URL.createObjectURL(blob);
		const container = portalAdapter?.getContainer?.() ?? (typeof document !== "undefined" ? document.body : null);
		if (container) {
			const a = container.ownerDocument.createElement("a");
			a.href = url;
			a.download = `vnsc-workspace-${activeSymbol}-${activeTimeframe}-${Date.now()}.json`;
			a.click();
		}
		URL.revokeObjectURL(url);
	}, [
		paneState.panes,
		drawingsInteraction.allDrawings,
		settings.resolvedTheme,
		settings.activeTimezone,
		settings.localTimeframe,
		activeSymbol,
		activeTimeframe,
		settings.activeMaxVisiblePanes,
		settings.activeMaxVisibleBars,
		settings.activeShowNonTradingDays,
		settings.activeShowDrawingPriceMarkers,
		settings.activeEnableWhale,
		settings.activeWhaleThreshold,
		settings.activeEnableCVD,
		settings.activeCvdMode,
		settings.activeAlertAudioEnabled,
		settings.overlayTimeframe,
		settings.overlayStyle,
		portalAdapter,
	]);

	const handleImportLayout = useCallback((layoutJson: string) => {
		const workspace = WorkspaceSerializer.deserialize(layoutJson);
		if (!workspace) {
			feedback(settings.t("settings.importError") || "Invalid or malformed file", "error");
			return;
		}

		if (workspace.panes && workspace.panes.length > 0) {
			paneState.dispatch({ type: "replaceLayout", panes: workspace.panes });
		}

		if (workspace.drawings) {
			drawingsInteraction.replaceDrawings(workspace.drawings);
		}

		const wsSettings = workspace.settings;
		if (wsSettings.timezone) {
			settings.setLocalTimezone(wsSettings.timezone as any); // ARC-1-keep: legacy bridge
		}
		if (wsSettings.timeframe) {
			settings.handleTimeframeChange(wsSettings.timeframe as any); // ARC-1-keep: legacy bridge
		}
		if (wsSettings.maxVisiblePanes !== undefined) {
			settings.setLocalMaxVisiblePanes(wsSettings.maxVisiblePanes);
		}
		if (wsSettings.maxVisibleBars !== undefined) {
			settings.setLocalMaxVisibleBars(wsSettings.maxVisibleBars);
		}
		if (wsSettings.showNonTradingDays !== undefined) {
			settings.setLocalShowNonTradingDays(wsSettings.showNonTradingDays);
		}
		if (wsSettings.showDrawingPriceMarkers !== undefined) {
			settings.setLocalShowDrawingPriceMarkers(wsSettings.showDrawingPriceMarkers);
		}
		if (wsSettings.enableWhale !== undefined) {
			settings.setLocalEnableWhale(wsSettings.enableWhale);
		}
		if (wsSettings.whaleThreshold !== undefined) {
			settings.setLocalWhaleThreshold(wsSettings.whaleThreshold);
		}
		if (wsSettings.enableCVD !== undefined) {
			settings.setLocalEnableCVD(wsSettings.enableCVD);
		}
		if (wsSettings.cvdMode !== undefined) {
			settings.setLocalCvdMode(wsSettings.cvdMode);
		}
		if (wsSettings.alertAudioEnabled !== undefined) {
			settings.setLocalAlertAudioEnabled(wsSettings.alertAudioEnabled);
		}
		if (wsSettings.overlayTimeframe !== undefined) {
			settings.setOverlayTimeframe(wsSettings.overlayTimeframe);
		}
		if (wsSettings.overlayStyle !== undefined) {
			settings.setOverlayStyle(wsSettings.overlayStyle);
		}
		if (wsSettings.theme) {
			const container = portalAdapter?.getContainer?.() ?? (typeof document !== "undefined" ? document.body : null);
			if (container) {
				const root = container.ownerDocument.documentElement;
				root.setAttribute("data-chart-theme", wsSettings.theme);
				if (settings.themeState.theme !== wsSettings.theme) {
					settings.themeState.toggleTheme();
				}
			}
		}

		feedback(settings.t("settings.importSuccess") || "Workspace imported successfully!", "success");
	}, [paneState, drawingsInteraction, settings, portalAdapter, feedback]);

	// Compute % change suffix for comparison overlays in the legend
	const compareLegendSuffix = useCallback((paneId: string, seriesIndex: number): string | undefined => {
		const data = enrichedData;
		if (!data || data.length < 2) return undefined;
		const pane = resolvedPanes.find((p) => p.id === paneId);
		if (!pane) return undefined;
		const series = pane.series[seriesIndex];
		if (!series || series.type !== "Comparison" || !series.overlaySymbolId) return undefined;
		const symbolId = series.overlaySymbolId;
		const firstClose = (data[0] as any)?.symbolData?.[symbolId]?.close as number | undefined; // ARC-1-keep: legacy bridge
		const lastClose = (data[data.length - 1] as any)?.symbolData?.[symbolId]?.close as number | undefined; // ARC-1-keep: legacy bridge
		if (firstClose == null || lastClose == null || firstClose === 0) return undefined;
		const change = ((lastClose - firstClose) / firstClose) * 100;
		return `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`;
	}, [enrichedData, resolvedPanes]);

	return { handleExportLayout, handleImportLayout, compareLegendSuffix };
}
