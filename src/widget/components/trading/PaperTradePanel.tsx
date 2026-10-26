/**
 * WE2 P2-07: PaperTradePanel
 *
 * @deprecated Task 11 — chỉ giữ làm compatibility shim cho public API.
 * Dùng TradingBottomPanel (5 tabs) cho mọi bề mặt mới. Khối sizing trùng lặp
 * đã gỡ (chỉ giữ 1 khối local-state). Panel showing paper trading positions,
 * journal, and performance stats. Uses .vnsc- CSS classes for theme
 * inheritance from .vnsc-root.
 */

import { useState, useEffect } from "react";
import { useWidgetI18n } from "../../context/WidgetI18nContext";

export interface PaperTradePosition {
	id: string;
	side: "long" | "short";
	entryPrice: number;
	currentPrice: number;
	quantity: number;
	entryBar: number;
	unrealizedPnl?: number;
}

export interface PaperTradeJournalEntry {
	id: string;
	side: "long" | "short";
	entryPrice: number;
	exitPrice: number;
	quantity: number;
	pnl: number;
	barsHeld: number;
}

export interface PaperTradeSizingConfig {
	mode: "fixed" | "percent";
	riskPercent: number;
	initialEquity: number;
}

export interface PaperTradePanelProps {
	positions: readonly PaperTradePosition[];
	journal: readonly PaperTradeJournalEntry[];
	sizing?: PaperTradeSizingConfig;
	onSizingChange?: (cfg: PaperTradeSizingConfig) => void;
	onReset?: () => void;
	onClose?: () => void;
}

export function PaperTradePanel({
	positions,
	journal,
	sizing,
	onSizingChange,
	onReset,
	onClose,
}: PaperTradePanelProps) {
	const { t } = useWidgetI18n();

	const [localSizing, setLocalSizing] = useState<PaperTradeSizingConfig>(() =>
		sizing ?? { mode: "fixed", riskPercent: 1, initialEquity: 10000 },
	);

	useEffect(() => {
		if (sizing) setLocalSizing(sizing);
	}, [sizing]);

	const handleSizingChange = (updates: Partial<PaperTradeSizingConfig>) => {
		const next = { ...localSizing, ...updates };
		setLocalSizing(next);
		onSizingChange?.(next);
	};

	const totalTrades = journal.length;
	const wins = journal.filter((e) => e.pnl > 0).length;
	const losses = journal.filter((e) => e.pnl <= 0).length;
	const winRate = totalTrades > 0 ? ((wins / totalTrades) * 100).toFixed(1) : "0.0";
	const totalPnl = journal.reduce((sum, e) => sum + e.pnl, 0);
	const avgPnl = totalTrades > 0 ? totalPnl / totalTrades : 0;
	const avgBarsHeld = totalTrades > 0
		? journal.reduce((sum, e) => sum + (e.barsHeld ?? 0), 0) / totalTrades
		: 0;
	const bestTrade = totalTrades > 0 ? Math.max(...journal.map((e) => e.pnl)) : 0;
	const worstTrade = totalTrades > 0 ? Math.min(...journal.map((e) => e.pnl)) : 0;

	const currentPosition = positions.find((p) => p);
	const unrealizedPnl = currentPosition
		? (currentPosition.unrealizedPnl ?? (currentPosition.side === "long"
			? currentPosition.currentPrice - currentPosition.entryPrice
			: currentPosition.entryPrice - currentPosition.currentPrice) * currentPosition.quantity)
		: 0;

	return (
		<div
			className="vnsc-paper-trade-panel"
			data-testid="paper-trade-panel"
		>
			{/* Header */}
			<div className="vnsc-paper-trade-panel__header">
				<strong className="vnsc-paper-trade-panel__title">
					{t("paperTrading.title", { defaultValue: "Paper Trading" })}
				</strong>
				<div className="vnsc-paper-trade-panel__header-actions" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
					{onReset && (
						<button
							type="button"
							className="vnsc-paper-trade-panel__reset-btn"
							onClick={onReset}
							title={t("paperTrading.reset", { defaultValue: "Reset" })}
						>
							{t("paperTrading.reset", { defaultValue: "Reset" })}
						</button>
					)}
					{onClose && (
						<button
							type="button"
							className="vnsc-paper-trade-panel__close-btn"
							onClick={onClose}
							aria-label="Close"
						>
							x
						</button>
					)}
				</div>
			</div>

			{/* Sizing Config */}
			<div className="vnsc-paper-trade-panel__sizing">
				<div className="vnsc-paper-trade-panel__sizing-title">
					{t("paperTrading.sizingMode", { defaultValue: "Position Sizing" })}
				</div>
				<div className="vnsc-paper-trade-panel__sizing-controls" style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
					<label style={{ display: "flex", alignItems: "center", gap: "4px" }}>
						<input
							type="radio"
							name="sizing-mode"
							checked={localSizing.mode === "fixed"}
							onChange={() => handleSizingChange({ mode: "fixed" })}
						/>
						{t("paperTrading.sizingFixed", { defaultValue: "Fixed Qty" })}
					</label>
					<label style={{ display: "flex", alignItems: "center", gap: "4px" }}>
						<input
							type="radio"
							name="sizing-mode"
							checked={localSizing.mode === "percent"}
							onChange={() => handleSizingChange({ mode: "percent" })}
						/>
						{t("paperTrading.sizingPercent", { defaultValue: "% Equity" })}
					</label>
					{localSizing.mode === "percent" && (
						<>
							<label style={{ display: "flex", alignItems: "center", gap: "4px" }}>
								{t("paperTrading.riskPercent", { defaultValue: "Risk %" })}
								<input
									type="number"
									min="0.1"
									max="100"
									step="0.1"
									value={localSizing.riskPercent}
									onChange={(e) => handleSizingChange({ riskPercent: parseFloat(e.target.value) || 1 })}
									style={{ width: "60px", padding: "2px 4px" }}
								/>
							</label>
							<label style={{ display: "flex", alignItems: "center", gap: "4px" }}>
								{t("paperTrading.initialEquity", { defaultValue: "Initial Equity" })}
								<input
									type="number"
									min="100"
									step="100"
									value={localSizing.initialEquity}
									onChange={(e) => handleSizingChange({ initialEquity: parseInt(e.target.value, 10) || 10000 })}
									style={{ width: "90px", padding: "2px 4px" }}
								/>
							</label>
						</>
					)}
				</div>
			</div>

			{/* Stats */}
			<div className="vnsc-paper-trade-panel__stats">
				<div className="vnsc-paper-trade-panel__stats-grid">
					<Stat label={t("paperTrading.total", { defaultValue: "Total" }) ?? "Total"} value={totalTrades.toString()} />
					<Stat label={t("paperTrading.winRate", { defaultValue: "Win %" }) ?? "Win %"} value={`${winRate}%`} />
					<Stat label={t("paperTrading.realized", { defaultValue: "Realized PnL" }) ?? "Realized PNL"} value={formatPnl(totalPnl)} />
					<Stat label={t("paperTrading.unrealized", { defaultValue: "Unrealized" }) ?? "Unrealized"} value={formatPnl(unrealizedPnl)} />
					<Stat label={t("paperTrading.avgPnl", { defaultValue: "Avg PnL" }) ?? "Avg PnL"} value={formatPnl(avgPnl)} />
					<Stat label={t("paperTrading.avgBarsHeld", { defaultValue: "Avg hold" }) ?? "Avg hold"} value={avgBarsHeld.toFixed(1)} />
					<Stat label={t("paperTrading.bestTrade", { defaultValue: "Best" }) ?? "Best"} value={formatPnl(bestTrade)} />
					<Stat label={t("paperTrading.worstTrade", { defaultValue: "Worst" }) ?? "Worst"} value={formatPnl(worstTrade)} />
				</div>
			</div>

			{/* Current Position */}
			<div className="vnsc-paper-trade-panel__position">
				<div className="vnsc-paper-trade-panel__position-title">
					{t("paperTrading.position", { defaultValue: "Position" })}
				</div>
				{currentPosition ? (
					<div>
						<span className={`vnsc-paper-trade-panel__position-side vnsc-paper-trade-panel__position-side--${currentPosition.side}`}>
							{currentPosition.side.toUpperCase()}
						</span>
						<div className="vnsc-paper-trade-panel__position-entry">
							{t("paperTrading.entry", { defaultValue: "Entry" })}: {currentPosition.entryPrice.toLocaleString()}
						</div>
					</div>
				) : (
					<div className="vnsc-paper-trade-panel__position-empty">
						{t("paperTrading.empty", { defaultValue: "No open positions" })}
					</div>
				)}
			</div>

			{/* Journal */}
			<div className="vnsc-paper-trade-panel__journal">
				<div className="vnsc-paper-trade-panel__journal-title">
					{t("paperTrading.journal", { defaultValue: "Journal" })}
				</div>
				{journal.length === 0 ? (
					<div className="vnsc-paper-trade-panel__journal-empty">
						{t("paperTrading.empty", { defaultValue: "No trades yet" })}
					</div>
				) : (
					[...journal].reverse().slice(0, 50).map((entry) => (
						<div
							key={entry.id}
							className={`vnsc-paper-trade-panel__journal-item vnsc-paper-trade-panel__journal-item--${entry.pnl >= 0 ? "positive" : "negative"}`}
						>
							<span className="vnsc-paper-trade-panel__journal-side">
								{entry.side.toUpperCase()}
							</span>
							<span className="vnsc-paper-trade-panel__journal-pnl">
								{formatPnl(entry.pnl)}
							</span>
						</div>
					))
				)}
			</div>
		</div>
	);
}

function Stat({ label, value }: { label: string; value: string }) {
	return (
		<div>
			<div className="vnsc-paper-trade-panel__stat-label">{label}</div>
			<div className="vnsc-paper-trade-panel__stat-value">{value}</div>
		</div>
	);
}

function formatPnl(value: number): string {
	const sign = value >= 0 ? "+" : "";
	return `${sign}${value.toFixed(2)}`;
}

