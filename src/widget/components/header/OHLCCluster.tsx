// UIUX_AC_RUNTIME_2026-10-21 — tách cụm O/H/L/C (+Vol) ra khỏi `OHLCHeader`.
//
// LÝ DO: `OHLCHeader.tsx` bị **freeze** ở 850 dòng (`config/fat-file-budget.json`) và đã vượt
// (851) do sóng W4 thêm 2 testid. Thêm cờ `statusLine.showVolume` (fix "cờ chết ở single")
// cần thêm prop + JSX ⇒ không thể nằm trong file fat. Tách cụm này ra file riêng vừa giữ
// budget vừa không đổi hành vi render (`data-testid="ohlc-cluster"` giữ nguyên).
import { formatPrice, formatChangeValue, formatPercent, formatVolume } from "../../utils/numberFormat";
import styles from "../../styles/ohlc-header.module.css";

export interface OHLCClusterData {
	open: number;
	high: number;
	low: number;
	close: number;
	volume?: number;
	change?: number;
	changePercent?: number;
}

export interface OHLCClusterProps {
	ohlcData: OHLCClusterData;
	/** `statusLine.showBarChange` — hiện phần thay đổi (%) bên cạnh cụm. */
	showBarChange?: boolean;
	/** `statusLine.showVolume` — hiện khối lượng. Ở surface single đây là nơi DUY NHẤT hiện Vol. */
	showVolume?: boolean;
}

export function OHLCCluster({ ohlcData, showBarChange = false, showVolume = false }: OHLCClusterProps) {
	const trend = ohlcData.close >= ohlcData.open ? styles.ohlcUp : styles.ohlcDown;
	return (
		<div className={styles.ohlcCluster} data-testid="ohlc-cluster">
			<span className={`${styles.ohlcItem} ${trend}`}><span className={styles.ohlcLabel}>O</span> <span className={styles.ohlcValue}>{formatPrice(ohlcData.open)}</span></span>
			<span className={`${styles.ohlcItem} ${trend}`}><span className={styles.ohlcLabel}>H</span> <span className={styles.ohlcValue}>{formatPrice(ohlcData.high)}</span></span>
			<span className={`${styles.ohlcItem} ${trend}`}><span className={styles.ohlcLabel}>L</span> <span className={styles.ohlcValue}>{formatPrice(ohlcData.low)}</span></span>
			<span className={`${styles.ohlcItem} ${trend}`}><span className={styles.ohlcLabel}>C</span> <span className={styles.ohlcValue}>{formatPrice(ohlcData.close)}</span></span>
			{showVolume && ohlcData.volume !== undefined && (
				<span className={styles.ohlcItem}>
					<span className={styles.ohlcLabel}>Vol</span> <span className={styles.ohlcValue}>{formatVolume(ohlcData.volume)}</span>
				</span>
			)}
			{showBarChange && ohlcData.change !== undefined && (
				<span className={`${styles.ohlcChange} ${ohlcData.change >= 0 ? styles.ohlcUp : styles.ohlcDown}`}>
					{formatChangeValue(ohlcData.change)} ({ohlcData.changePercent !== undefined ? formatPercent(ohlcData.changePercent) : ""})
				</span>
			)}
		</div>
	);
}
