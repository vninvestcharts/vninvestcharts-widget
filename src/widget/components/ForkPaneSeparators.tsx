import { type WidgetPaneRuntimeSnapshot } from "../utils/widgetHelpers";
import styles from "../styles/fork-overlays.module.css";

export interface ForkPaneSeparatorsProps {
	paneSnapshots: readonly WidgetPaneRuntimeSnapshot[];
	/** Pane whose bottom edge meets the X-axis strip (no separator there). */
	lastPaneId?: string;
}

/**
 * UI-C: 1px TradingView-style separators between stacked subpanes.
 * Widget-only (reads engine paneSnapshots, draws DOM lines, no engine change).
 */
export function ForkPaneSeparators({
	paneSnapshots,
	lastPaneId,
}: ForkPaneSeparatorsProps) {
	if (paneSnapshots.length < 2) {
		return null;
	}

	const resolvedLastId = lastPaneId ?? paneSnapshots[paneSnapshots.length - 1]?.paneId;

	return (
		<>
			{paneSnapshots.map((snapshot) => {
				if (snapshot.paneId === resolvedLastId) {
					return null;
				}
				const bottom = snapshot.bounds.top + snapshot.bounds.height;
				return (
					<div
						key={`pane-separator-${snapshot.paneId}`}
						data-pane-separator={snapshot.paneId}
						className={styles.forkPaneSeparator}
						style={{ top: bottom }}
						aria-hidden="true"
					/>
				);
			})}
		</>
	);
}
