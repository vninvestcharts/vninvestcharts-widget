import type { ChartRange } from "./chartRange";

interface WidgetVisibleDomainAuthorityOptions {
	useWidgetOwnedHistory: boolean;
	range: ChartRange;
	pendingChartRangeSync: boolean;
}

interface PendingChartRangeSyncOptions {
	useWidgetOwnedHistory: boolean;
	rangeSatisfied: boolean;
}

interface WidgetOwnedHistoryOptions {
	activeSource: string;
	dataAdapterName: string;
}

export function shouldUseWidgetOwnedHistory({
	activeSource,
	dataAdapterName,
}: WidgetOwnedHistoryOptions) {
	return (
		(activeSource === "binance" && dataAdapterName === "binance")
		|| (activeSource === "vninvest" && dataAdapterName === "vninvest")
	);
}

export function resolvePendingChartRangeSync({
	useWidgetOwnedHistory,
	rangeSatisfied,
}: PendingChartRangeSyncOptions) {
	if (!useWidgetOwnedHistory) {
		return !rangeSatisfied;
	}

	return false;
}

export function shouldRetainDemoVisibleDomainControl({
	useWidgetOwnedHistory,
}: WidgetVisibleDomainAuthorityOptions) {
	return !useWidgetOwnedHistory;
}

export function shouldReleaseDemoVisibleDomainControl({
	useWidgetOwnedHistory,
}: WidgetVisibleDomainAuthorityOptions) {
	return useWidgetOwnedHistory;
}