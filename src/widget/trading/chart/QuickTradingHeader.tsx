// QUICKTRADE_PILLS (Option A, 2026-10-18): strip TV-style — 2 pill [Bán <bid>] [Mua <ask>]
// + mắt 👁. Click pill = mở ticket (hoặc đặt lệnh ngay nếu one-click được bật trong
// Settings → Execution). Bỏ collapse / stepper / ⚡ / ⓘ (A1–A3, A5): qty nhập trong ticket,
// spread + synthetic nằm trong tooltip của 2 pill (A2).
// Pure controlled UI: nhận quote qua props, tương tác qua callbacks.
// KHÔNG import broker/OMS/hooks widget (Rule 9: không chạm VNInvestCharts).
import { useWidgetI18n } from "../../context/WidgetI18nContext";
import type { MarketQuote } from "../../../lib/core/trading/MarketDataPort";
import styles from "./QuickTradingHeader.module.css";

export interface QuickTradingHeaderProps {
	symbol: string;
	quote?: MarketQuote | null;
	defaultQuantity?: number;
	lotSize?: number;
	maxQuantity?: number;
	/** A4: đọc từ paper config (context). true = click pill đặt market ngay, không mở ticket. */
	defaultOneClick?: boolean;
	onBuy?: (quantity: number) => void;
	onSell?: (quantity: number) => void;
	onOpenTicket?: (side: "buy" | "sell", quantity: number) => void;
	/** Task M4: ẩn/hiện paper trading của chart (mắt). Bật lại từ Settings. */
	tradingEnabled?: boolean;
	onToggleTradingEnabled?: (enabled: boolean) => void;
	disabled?: boolean;
	spreadUnit?: string;
}

function clampLot(quantity: number, lotSize: number, maxQuantity?: number): number {
	const stepped = Math.max(lotSize, Math.round(quantity / lotSize) * lotSize);
	return maxQuantity != null ? Math.min(stepped, maxQuantity) : stepped;
}

export function QuickTradingHeader({
	symbol,
	quote,
	defaultQuantity,
	lotSize = 100,
	maxQuantity,
	defaultOneClick = false,
	onBuy,
	onSell,
	onOpenTicket,
	tradingEnabled = true,
	onToggleTradingEnabled,
	disabled = false,
	spreadUnit = "đ",
}: QuickTradingHeaderProps) {
	const { t } = useWidgetI18n();
	const hasQuote = quote != null;
	const inactive = disabled || !hasQuote;

	const handleSide = (side: "buy" | "sell") => {
		if (inactive) return;
		// A3: stepper đã bỏ — qty lấy từ lot mặc định; chỉnh số lượng trong ticket.
		const qty = clampLot(defaultQuantity ?? lotSize, lotSize, maxQuantity);
		if (defaultOneClick) {
			if (side === "buy") onBuy?.(qty);
			else onSell?.(qty);
			return;
		}
		if (onOpenTicket) {
			onOpenTicket(side, qty);
			return;
		}
		if (side === "buy") onBuy?.(qty);
		else onSell?.(qty);
	};

	// Fixed decimals by magnitude so buttons never jitter per tick
	// (BTCUSDT 0.1 tick → 1 decimal: "81,312.1").
	const formatPrice = (value: number) => {
		const dp = value >= 1000 ? 1 : value >= 1 ? 2 : 4;
		return new Intl.NumberFormat("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp }).format(value);
	};
	// Spread unit follows the market (crypto quote currency, VN đồng default).
	const effectiveSpreadUnit = spreadUnit && spreadUnit !== "đ" ? spreadUnit : /(USDT|USDC)$/.test(symbol) ? "USDT" : "đ";
	const spreadInfo = (() => {
		if (quote == null || quote.lastPrice <= 0 || !Number.isFinite(quote.spread) || quote.spread < 0) {
			return null;
		}
		const bps = (quote.spread / quote.lastPrice) * 10000;
		return {
			text: `${quote.spread.toLocaleString("en-US")} ${effectiveSpreadUnit}`,
			title: `${t("widget.trading.spread", { defaultValue: "Spread" })}: ${quote.spread} ${effectiveSpreadUnit} (${bps.toFixed(1)} bps)`,
		};
	})();
	// A2: spread + synthetic GỘP vào tooltip của CẢ HAI pill (thay chip DOM cũ).
	const pillTitle =
		spreadInfo == null
			? undefined
			: quote?.isSyntheticSpread
				? `${spreadInfo.title} · ${t("widget.trading.syntheticQuoteHint", {
					defaultValue: "Synthetic Bid/Ask derived from candles (not a real order book)",
				})}`
				: spreadInfo.title;

	return (
		<div className={styles.header} data-testid="quick-trading-header">
			<button
				type="button"
				className={styles.sellBtn}
				data-testid="sell-btn"
				disabled={inactive}
				onClick={() => handleSide("sell")}
				title={pillTitle}
			>
				<span>{t("widget.trading.sell", { defaultValue: "Sell" })}</span>
				<span className={styles.price} data-testid="bid-price">
					{hasQuote ? formatPrice(quote.bidPrice) : t("widget.trading.noQuote", { defaultValue: "No quote" })}
				</span>
			</button>
			<button
				type="button"
				className={styles.buyBtn}
				data-testid="buy-btn"
				disabled={inactive}
				onClick={() => handleSide("buy")}
				title={pillTitle}
			>
				<span>{t("widget.trading.buy", { defaultValue: "Buy" })}</span>
				<span className={styles.price} data-testid="ask-price">
					{hasQuote ? formatPrice(quote.askPrice) : t("widget.trading.noQuote", { defaultValue: "No quote" })}
				</span>
			</button>
			<button
				type="button"
				className={`${styles.toggle} ${styles.eye}`}
				data-testid="paper-visibility-toggle"
				aria-pressed={tradingEnabled}
				disabled={disabled}
				onClick={() => onToggleTradingEnabled?.(!tradingEnabled)}
				title={
					tradingEnabled
						? t("widget.trading.hidePaperTrading", { defaultValue: "Hide paper trading (re-enable in Settings)" })
						: t("widget.trading.showPaperTrading", { defaultValue: "Show paper trading" })
				}
			>
				{tradingEnabled ? "👁" : "🚫"}
			</button>
		</div>
	);
}
