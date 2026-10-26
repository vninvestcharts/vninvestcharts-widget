// Task 09: tab nhật ký — render ring buffer (cap 200, trống thì rỗng).
// PanelLogEntry định nghĩa tại đây để tránh circular import (SSOT cho hook/context).
import styles from "./TradingBottomPanel.module.css";

export interface PanelLogEntry {
	timestamp: number;
	message: string;
}

export interface TradingLogTabProps {
	log: PanelLogEntry[];
}

export function TradingLogTab({ log }: TradingLogTabProps) {
	return (
		<div className={styles.logList} data-testid="log-tab">
			{log.map((entry, index) => (
				<div key={`${entry.timestamp}-${index}`} data-testid={`log-row-${index}`}>
					{new Date(entry.timestamp).toLocaleString()} — {entry.message}
				</div>
			))}
		</div>
	);
}
