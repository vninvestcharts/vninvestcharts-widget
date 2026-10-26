// Task 07: RiskCalculatorView — R:R, lãi/lỗ dự kiến, % rủi ro tài khoản.
// Pure presentational: mọi số liệu tính từ props, không đọc broker/OMS.
import { useWidgetI18n } from "../../context/WidgetI18nContext";

export interface RiskCalculatorViewProps {
	entryPrice: number;
	quantity: number;
	takeProfitPrice?: number;
	stopLossPrice?: number;
	contractMultiplier?: number;
	accountEquity: number;
}

function formatMoney(value: number): string {
	return Math.round(value).toLocaleString("en-US");
}

export function RiskCalculatorView({
	entryPrice,
	quantity,
	takeProfitPrice,
	stopLossPrice,
	contractMultiplier = 1,
	accountEquity,
}: RiskCalculatorViewProps) {
	const { t } = useWidgetI18n();
	if (takeProfitPrice == null && stopLossPrice == null) return null;
	const tpDelta = takeProfitPrice != null ? Math.abs(takeProfitPrice - entryPrice) : 0;
	const slDelta = stopLossPrice != null ? Math.abs(entryPrice - stopLossPrice) : 0;
	const profit = tpDelta * quantity * contractMultiplier;
	const loss = slDelta * quantity * contractMultiplier;
	const ratio = slDelta > 0 ? tpDelta / slDelta : null;
	const riskPercent = accountEquity > 0 ? (loss / accountEquity) * 100 : 0;
	return (
		<div>
			<div>
				<span>{t("widget.trading.riskReward", { defaultValue: "R:R" })}</span>
				<span>{ratio == null ? "—" : `1 : ${ratio.toFixed(2)}`}</span>
			</div>
			{takeProfitPrice != null && (
				<div>
					<span>{t("widget.trading.estProfit", { defaultValue: "Est. profit" })}</span>
					<span>+{formatMoney(profit)}</span>
				</div>
			)}
			{stopLossPrice != null && (
				<div>
					<span>{t("widget.trading.estLoss", { defaultValue: "Est. loss" })}</span>
					<span>-{formatMoney(loss)}</span>
				</div>
			)}
			{stopLossPrice != null && (
				<div>
					<span>{t("widget.trading.accountRisk", { defaultValue: "Account risk" })}</span>
					<span>{riskPercent.toFixed(2)}%</span>
				</div>
			)}
		</div>
	);
}
