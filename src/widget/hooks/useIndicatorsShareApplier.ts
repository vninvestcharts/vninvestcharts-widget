/**
 * useIndicatorsShareApplier — explicit cross-chart indicator fan-out receiver.
 *
 * Listens for `vnsc-indicators-share` (fired ONLY by the Indicators-tab
 * "apply to all" button). Skips the source chart; merges into live paneState
 * AND the chart's scoped storage key (covers remount/reload). Must run inside
 * VNInvestChartsStateProvider (per-cell paneState).
 */
import { useEffect, useRef } from "react";
import { useVNInvestChartsState } from "../context/VNInvestChartsStateContext";
import { savePaneLayout } from "../../lib/core/hooks/useDynamicPanes";
import {
	INDICATORS_SHARE_EVENT,
	mergeIndicatorsIntoLayout,
	type IndicatorsShareDetail,
} from "../components/settings/model/indicatorShare";

export function useIndicatorsShareApplier(chartId: string | null | undefined): void {
	const { paneState } = useVNInvestChartsState();
	const panesRef = useRef(paneState.panes);
	panesRef.current = paneState.panes;
	const dispatchRef = useRef(paneState.dispatch);
	dispatchRef.current = paneState.dispatch;

	useEffect(() => {
		if (typeof window === "undefined") return;
		const mine = chartId && chartId.length > 0 ? chartId : null;
		const handler = (e: Event) => {
			const detail = (e as CustomEvent<IndicatorsShareDetail>).detail;
			if (!detail || !Array.isArray(detail.indicators) || detail.indicators.length === 0) return;
			if (detail.sourceChartId === mine) return; // source already has them; never self-apply
			const merged = mergeIndicatorsIntoLayout(panesRef.current, detail.indicators);
			if (merged === panesRef.current) return; // nothing new: no dispatch, no write
			dispatchRef.current({ type: "replaceLayout", panes: merged });
			try {
				if (typeof localStorage !== "undefined") {
					savePaneLayout(merged, localStorage, mine);
				}
			} catch {
				// ignore storage errors (private mode)
			}
		};
		window.addEventListener(INDICATORS_SHARE_EVENT, handler);
		return () => window.removeEventListener(INDICATORS_SHARE_EVENT, handler);
	}, [chartId]);
}
