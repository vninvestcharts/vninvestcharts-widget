// Task 09: tab tổng quan — KPI + SVG equity curve thuần (0% lib ngoài).
import { useWidgetI18n } from "../../context/WidgetI18nContext";
import type { BrokerAccount } from "../../../lib/core/trading/types";
import type { TradingAnalytics } from "../../../lib/core/trading/AnalyticsEngine";
import styles from "./TradingBottomPanel.module.css";

export interface AccountSummaryTabProps {
	account: BrokerAccount;
	analytics: TradingAnalytics;
}

const CURVE_WIDTH = 300;
const CURVE_HEIGHT = 80;

function buildCurvePath(points: { timestamp: number; equity: number }[]): string {
	if (points.length === 0) return "";
	if (points.length === 1) return `M 0 ${CURVE_HEIGHT} L ${CURVE_WIDTH} ${CURVE_HEIGHT}`;
	const min = Math.min(...points.map((p) => p.equity));
	const max = Math.max(...points.map((p) => p.equity));
	const span = max - min > 0 ? max - min : 1;
	return points
		.map((p, i) => {
			const x = (i / (points.length - 1)) * CURVE_WIDTH;
			const y = CURVE_HEIGHT - ((p.equity - min) / span) * (CURVE_HEIGHT - 8) - 4;
			return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
		})
		.join(" ");
}

export function AccountSummaryTab({ account, analytics }: AccountSummaryTabProps) {
	const { t } = useWidgetI18n();
	const money = (v: number) => Math.round(v).toLocaleString("en-US");
	const curve = analytics.equityCurve.length > 200 ? analytics.equityCurve.slice(-200) : analytics.equityCurve;
	const path = buildCurvePath(curve);

	return (
		<div data-testid="summary-tab">
			<div className={styles.kpis}>
				<span data-testid="kpi-balance">
					{t("widget.trading.balance", { defaultValue: "Cash" })}: {money(account.balance)}
				</span>
				<span data-testid="kpi-equity">
					{t("widget.trading.equity", { defaultValue: "Equity" })}: {money(account.equity)}
				</span>
				<span data-testid="kpi-trades">
					{t("widget.trading.totalTrades", { defaultValue: "Total trades" })}: {analytics.totalTrades}
				</span>
				<span data-testid="kpi-winrate">
					{t("widget.trading.winRate", { defaultValue: "Win rate" })}: {(analytics.winRate * 100).toFixed(1)}%
				</span>
				<span data-testid="kpi-profitfactor">
					{t("widget.trading.profitFactor", { defaultValue: "Profit factor" })}: {analytics.profitFactor.toFixed(2)}
				</span>
				<span data-testid="kpi-netprofit">
					{t("widget.trading.netProfit", { defaultValue: "Net profit" })}: {analytics.netProfit >= 0 ? "+" : ""}
					{money(analytics.netProfit)}
				</span>
				<span data-testid="kpi-drawdown">
					{t("widget.trading.maxDrawdown", { defaultValue: "Max drawdown" })}: {analytics.maxDrawdownPercent.toFixed(2)}%
				</span>
				<span data-testid="kpi-sharpe">
					{t("widget.trading.sharpeRatio", { defaultValue: "Sharpe" })}: {(analytics.sharpeRatio ?? 0).toFixed(2)}
				</span>
			</div>
			<svg
				data-testid="equity-curve"
				width={CURVE_WIDTH}
				height={CURVE_HEIGHT}
				viewBox={`0 0 ${CURVE_WIDTH} ${CURVE_HEIGHT}`}
			>
				{path !== "" && (
					<>
						<path d={`${path} L ${CURVE_WIDTH} ${CURVE_HEIGHT} L 0 ${CURVE_HEIGHT} Z`} fill="rgba(41,98,255,0.18)" />
						<path d={path} fill="none" stroke="#2962ff" strokeWidth={1.5} />
					</>
				)}
			</svg>
		</div>
	);
}
