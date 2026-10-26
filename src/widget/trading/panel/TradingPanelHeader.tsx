// Task 09: header panel — trạng thái + tóm tắt tài khoản + nạp vốn (PaperCapitalDialog).
import { useState } from "react";
import { useWidgetI18n } from "../../context/WidgetI18nContext";
import type { BrokerAccount, TradingPosition } from "../../../lib/core/trading/types";
import { DEFAULT_PAPER_BALANCE_USD, DEFAULT_PAPER_BALANCE_VND } from "../../../lib/core/trading/MarketRules";
import { IconSave, IconSettings, IconUndo } from "../../components/common/Icons";
import { PaperCapitalDialog } from "./PaperCapitalDialog";
import { PaperSettingsModal } from "./PaperSettingsModal";
import { MarketFallbackBanner } from "./MarketFallbackBanner";
import { resolveMarketProfile } from "../../../lib/core/trading/MarketRules";
import { DEFAULT_PAPER_RUNTIME_CONFIG, type PaperRuntimeConfig } from "../config/paperRuntimeConfig";
import styles from "./TradingBottomPanel.module.css";

export interface TradingPanelHeaderProps {
	account: BrokerAccount;
	positions: TradingPosition[];
	realizedPnl: number;
	ordersMargin: number;
	onResetAccount: (initialBalance?: number) => void;
	onExportCsv: () => void;
	paperConfig?: PaperRuntimeConfig;
	onSavePaperConfig?: (config: Partial<PaperRuntimeConfig>) => void;
	/** S4: symbol for the market-fallback banner (unclassified → VN_SPOT). */
	symbol?: string | null;
}

export const MARGIN_SAFE_THRESHOLD = 150;
export const MARGIN_WARNING_THRESHOLD = 100;

export function TradingPanelHeader({ account, positions, realizedPnl, ordersMargin, onResetAccount, onExportCsv, paperConfig, onSavePaperConfig, symbol }: TradingPanelHeaderProps) {
	const { t } = useWidgetI18n();
	const [confirming, setConfirming] = useState(false);
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [perChartOverride, setPerChartOverride] = useState(false);
	const unrealized = positions.reduce((sum, p) => sum + p.unrealizedPnl, 0);
	const marginLevel = account.marginUsed > 0 ? (account.equity / account.marginUsed) * 100 : null;
	const money = (v: number) => Math.round(v).toLocaleString("en-US");
	const unrealizedPill =
		unrealized > 0 ? styles.pnlPillPositive : unrealized < 0 ? styles.pnlPillNegative : styles.pnlPillNeutral;
	const marginBadge =
		marginLevel == null
			? null
			: marginLevel >= MARGIN_SAFE_THRESHOLD
				? { cls: styles.marginBadgeSafe, label: t("widget.trading.marginSafe", { defaultValue: "Safe" }) }
				: marginLevel >= MARGIN_WARNING_THRESHOLD
					? { cls: styles.marginBadgeWarning, label: t("widget.trading.marginWarning", { defaultValue: "Warning" }) }
					: { cls: styles.marginBadgeDanger, label: t("widget.trading.marginDanger", { defaultValue: "Danger" }) };

	return (
		<div className={styles.panelHeader} data-testid="trading-panel-header">
			<MarketFallbackBanner symbol={symbol} onOpenSettings={() => setSettingsOpen(true)} />
			<div className={styles.headerLeft}>
				<div className={styles.brandSection}>
					<span className={styles.statusDot} data-testid="paper-status-dot" />
					<span className={styles.brandTitle}>{t("widget.trading.paperTrading", { defaultValue: "Paper Trading" })}</span>
				</div>
				<div className={styles.kpiGrid}>
					{/* Assets block — exactly 3 rows: (equity+power) / (cash+avail labels) / (cash+avail values). */}
					<div className={`${styles.kpiCard} ${styles.kpiCardPrimary} ${styles.kpiWide}`}>
						<div className={styles.kpiPair}>
							<span className={styles.kpiLabel}>{t("widget.trading.equity", { defaultValue: "Equity" })}</span>
							<span className={styles.kpiValue} data-testid="header-equity">
								{money(account.equity)} <span className={styles.kpiCur}>{account.currency}</span>
							</span>
							<span
								className={unrealizedPill}
								data-testid="header-unrealized"
								style={{ fontVariantNumeric: "tabular-nums" }}
								title={t("widget.trading.unrealizedPnl", { defaultValue: "Open PnL" })}
							>
								{unrealized >= 0 ? "+" : ""}{money(unrealized)}
							</span>
						</div>
						<div className={styles.kpiPair}>
							<span className={styles.kpiLabel}>{t("widget.trading.buyingPower", { defaultValue: "Buying power" })}</span>
							<span className={styles.kpiValue} data-testid="header-power">
								{money(account.buyingPower)} <span className={styles.kpiCur}>{account.currency}</span>
							</span>
						</div>
						<span className={styles.kpiSubLabel}>{t("widget.trading.balance", { defaultValue: "Cash" })}</span>
						<span className={styles.kpiSubLabel}>{t("widget.trading.availableFunds", { defaultValue: "Available funds" })}</span>
						<span className={styles.kpiSubVal} data-testid="header-balance">
							{money(account.balance)} {account.currency}
						</span>
						<span className={styles.kpiSubVal} data-testid="header-available">
							{money(account.freeMargin)} {account.currency}
						</span>
					</div>
					{/* Margin block — 3 rows: value / (3 meta labels) / (3 meta values). */}
					<div className={`${styles.kpiCard} ${styles.kpiWide3}`}>
						<div className={styles.kpiPair}>
							<span className={styles.kpiLabel}>{t("widget.trading.marginLevel", { defaultValue: "Margin level" })}</span>
							<span className={styles.kpiValue} data-testid="header-margin">
								{marginLevel == null ? "—" : `${marginLevel.toFixed(1)}%`}
								{marginBadge && <span className={marginBadge.cls}>{marginBadge.label}</span>}
							</span>
						</div>
						<span className={styles.kpiSubLabel}>{t("widget.trading.accountMargin", { defaultValue: "Account margin" })}</span>
						<span className={styles.kpiSubLabel} data-testid="header-orders-margin-label">
							{t("widget.trading.ordersMargin", { defaultValue: "Orders margin" })}
						</span>
						<span className={styles.kpiSubLabel} data-testid="header-realized-label">
							{t("widget.trading.netProfit", { defaultValue: "Net profit" })}
						</span>
						<span className={styles.kpiSubVal} data-testid="header-account-margin">
							{money(account.marginUsed)}
						</span>
						<span className={styles.kpiSubVal} data-testid="header-orders-margin">
							{money(ordersMargin)}
						</span>
						<span className={styles.kpiSubVal} data-testid="header-realized">
							{realizedPnl >= 0 ? "+" : ""}{money(realizedPnl)}
						</span>
					</div>
				</div>
			</div>
			<div className={styles.headerActions}>
				<button
					type="button"
					className={`${styles.btnAction} ${styles.btnIconOnly}`}
					data-testid="panel-export"
					title={t("widget.trading.exportCsv", { defaultValue: "Export CSV" })}
					aria-label={t("widget.trading.exportCsv", { defaultValue: "Export CSV" })}
					onClick={onExportCsv}
				>
					<IconSave size={13} />
				</button>
				<button
					type="button"
					className={`${styles.btnAction} ${styles.btnIconOnly}`}
					data-testid="panel-settings"
					title={t("widget.trading.settingsTitle")}
					aria-label={t("widget.trading.settingsTitle")}
					onClick={() => setSettingsOpen(true)}
				>
					<IconSettings size={13} />
				</button>
				<button
					type="button"
					className={`${styles.btnAction} ${styles.btnReset} ${styles.btnIconOnly}`}
					data-testid="header-reset"
					title={t("widget.trading.reset", { defaultValue: "Reset" })}
					aria-label={t("widget.trading.reset", { defaultValue: "Reset" })}
					onClick={() => setConfirming(true)}
				>
					<IconUndo size={13} />
				</button>
				<PaperCapitalDialog
					open={confirming}
					currency={account.currency}
					defaultAmount={account.currency === "USD" ? DEFAULT_PAPER_BALANCE_USD : DEFAULT_PAPER_BALANCE_VND}
					onConfirm={(amount) => {
						setConfirming(false);
						onResetAccount(amount);
					}}
					onCancel={() => setConfirming(false)}
				/>
				<PaperSettingsModal
					open={settingsOpen}
					initial={paperConfig ?? DEFAULT_PAPER_RUNTIME_CONFIG}
					perChartOverride={perChartOverride}
					hideSettlement={symbol != null && resolveMarketProfile(symbol).profile !== "VN_SPOT"}
					hideVnFees={symbol != null && resolveMarketProfile(symbol).profile !== "VN_SPOT"}
					onToggleOverride={setPerChartOverride}
					onSave={(config) => {
						setSettingsOpen(false);
						onSavePaperConfig?.(config);
					}}
					onCancel={() => setSettingsOpen(false)}
				/>
			</div>
		</div>
	);
}
