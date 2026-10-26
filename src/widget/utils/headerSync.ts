// Header-driven timeframe changes (Slice D3 — SY-09).
// A header/topbar timeframe pick must propagate exactly like a chart-driven
// change: apply locally, then fan out via the engine (which excludes the
// source chart and scopes by SymbolLink group since D1). Pure function,
// unit-tested — the widget counterpart of the guarded engine fan-out.

export interface HeaderTimeframeDeps {
	getHandle: (chartId: string) => { setTimeframe?: (timeframe: any, sourceChartId?: string) => void } | undefined;
	broadcastTimeframe?: (chartId: string, timeframe: string) => void;
	onConfigChange: (chartId: string, timeframe: string) => void;
	/** syncSettings.timeframe (global toggle). */
	syncEnabled: boolean;
	/** syncOverrideMap?.[chartId]?.timeframe === false (source opted out). */
	sourceOptedOut: boolean;
}

export function applyHeaderTimeframe(chartId: string, timeframe: string, deps: HeaderTimeframeDeps): void {
	// Local apply (unchanged pre-D3 behavior) + config state.
	deps.getHandle(chartId)?.setTimeframe?.(timeframe);
	deps.onConfigChange(chartId, timeframe);
	// D3: propagate unless the channel is off or the source opted out.
	if (!deps.syncEnabled || deps.sourceOptedOut) return;
	deps.broadcastTimeframe?.(chartId, timeframe);
}
