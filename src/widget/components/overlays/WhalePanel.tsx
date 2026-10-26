/**
 * WP-05: WhalePanel — moved from src/demo/components/
 * Display shark/whale/small buy/sell money flow.
 * Widget-scoped: uses useWidgetI18n(), .vnsc- prefix.
 */
import { useWidgetI18n } from "../../context/WidgetI18nContext";
import type { WhaleFeedResponse } from "../../../lib/types/vninvest";
import { PremiumFeatureGate } from "../PremiumFeatureGate";
import styles from "../../styles/whale-panel.module.css";

export interface WhalePanelProps {
	data: WhaleFeedResponse | null;
}

function formatBillion(value: number): string {
	const billion = value / 1_000_000_000;
	return `${billion.toFixed(2)}`;
}

function WhalePanelContent({ data }: WhalePanelProps) {
	const { t } = useWidgetI18n();

	if (!data) {
		return null;
	}

	const { summary } = data;

	const rows: Array<{ label: string; buy: number; sell: number }> = [
		{ label: t("whale.whale", { defaultValue: "Whale" }) ?? "Whale", buy: summary.whale_buy, sell: summary.whale_sell },
		{ label: t("whale.shark", { defaultValue: "Shark" }) ?? "Shark", buy: summary.shark_buy, sell: summary.shark_sell },
		{ label: t("whale.small", { defaultValue: "Small" }) ?? "Small", buy: summary.small_buy, sell: summary.small_sell },
	];

	const net = summary.buy_value - summary.sell_value;

	return (
		<div className={styles.panel} data-testid="whale-panel">
			<div className={styles.title}>
				{t("whale.title", { defaultValue: "Whale Flow" })}
			</div>
			<div className={`${styles.net} ${net >= 0 ? styles.netPositive : styles.netNegative}`}>
				{net >= 0 ? "+" : ""}{formatBillion(net)} tỷ
			</div>
			<table className={styles.table}>
				<thead>
					<tr>
						<th></th>
						<th>{t("whale.buy", { defaultValue: "Buy" })}</th>
						<th>{t("whale.sell", { defaultValue: "Sell" })}</th>
					</tr>
				</thead>
				<tbody>
					{rows.map((row) => (
						<tr key={row.label}>
							<td className={styles.rowLabel}>{row.label}</td>
							<td className={styles.buy}>{formatBillion(row.buy)}</td>
							<td className={styles.sell}>{formatBillion(row.sell)}</td>
						</tr>
					))}
				</tbody>
			</table>
			{data.alerts && data.alerts.length > 0 ? (
				<div style={{ marginTop: "10px" }}>
					<div className={styles.title} style={{ fontSize: "12px", marginBottom: "6px" }}>
						{t("whale.alerts", { defaultValue: "Alerts" })}
					</div>
					<div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "220px", overflowY: "auto" }}>
						{data.alerts.map((alert) => (
							<div
								key={alert.id || `${alert.triggered_at}-${alert.title}`}
								data-testid="whale-alert-row"
								style={{
									fontSize: "11px",
									color: "#c0c0c0",
									borderLeft: `2px solid ${alert.direction === "buy" ? "#22a85e" : alert.direction === "sell" ? "#c0392b" : "#6c757d"}`,
									paddingLeft: "8px",
									lineHeight: "1.5",
								}}
							>
								<div style={{ fontWeight: 600, color: "#e8e8e8" }}>{alert.title}</div>
								<div style={{ color: "#808080" }}>
									{alert.severity}{alert.direction ? ` · ${alert.direction}` : ""}
									{alert.triggered_at ? ` · ${alert.triggered_at}` : ""}
								</div>
							</div>
						))}
					</div>
				</div>
			) : null}
		</div>
	);
}

export function WhalePanel({ data }: WhalePanelProps) {
	return (
		<PremiumFeatureGate feature="isWhalePanelEnabled">
			<WhalePanelContent data={data} />
		</PremiumFeatureGate>
	);
}