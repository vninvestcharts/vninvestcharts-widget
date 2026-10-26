import { useEffect, useRef } from "react";
import type { WidgetChartHandle } from "../utils/widgetHelpers";

export interface UseWorkspaceReplayOwnerLatchOptions {
	chartHandles: ReadonlyMap<string, WidgetChartHandle>;
	activeChartId: string | null;
	sessionOwnerId: string | null;
	claimSessionOwner: (chartId: string) => void;
	stopAll: () => void;
	intervalMs?: number;
}

function isSessionActive(handle: WidgetChartHandle | undefined): boolean {
	return handle?.getReplayState?.()?.sessionActive === true;
}

/**
 * A6: keeps the workspace replay owner aligned with the chart that actually
 * owns an active session. It never claims on behalf of a stopped session:
 * after the owner is lost it stops everything once and waits for idle.
 */
export function useWorkspaceReplayOwnerLatch(options: UseWorkspaceReplayOwnerLatchOptions): void {
	const optionsRef = useRef(options);
	optionsRef.current = options;
	const suppressedRef = useRef(false);
	const intervalMs = options.intervalMs ?? 250;

	useEffect(() => {
		const tick = () => {
			const { chartHandles, activeChartId, sessionOwnerId, claimSessionOwner, stopAll } = optionsRef.current;
			const activeIds = [...chartHandles]
				.filter(([, handle]) => isSessionActive(handle))
				.map(([chartId]) => chartId);
			const hasActive = activeIds.length > 0;

			if (sessionOwnerId) {
				if (activeIds.includes(sessionOwnerId)) {
					suppressedRef.current = false;
					return;
				}
				if (hasActive && !suppressedRef.current) {
					suppressedRef.current = true;
					stopAll();
				}
				if (!hasActive) suppressedRef.current = false;
				return;
			}

			if (suppressedRef.current) {
				if (!hasActive) suppressedRef.current = false;
				return;
			}
			if (!hasActive) return;

			const target = activeChartId && activeIds.includes(activeChartId) ? activeChartId : activeIds[0];
			if (target) claimSessionOwner(target);
		};

		const id = setInterval(tick, intervalMs);
		return () => clearInterval(id);
	}, [intervalMs]);
}
