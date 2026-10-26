import type { ActiveSource } from "./components/DataSourceSwitcher";

export interface HistorySchedulerState {
	activeSource: ActiveSource;
	warmupInFlight: boolean;
	backfillInFlight: boolean;
	liveBarsLength: number;
}

export function canRunHistoryScheduler(state: HistorySchedulerState): boolean {
	return state.activeSource !== "offline" && !state.warmupInFlight && !state.backfillInFlight && state.liveBarsLength > 0;
}