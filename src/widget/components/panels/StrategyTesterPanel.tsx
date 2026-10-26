import { useState, useMemo } from "react";
import { BrokerSimulator } from "../../../lib/strategy/BrokerSimulator";
import { PerformanceReport } from "../../../lib/strategy/types";
import { strategyResultToReport, formatTradeDate } from "../../../lib/strategy/strategyResultToReport";
import { readStoredScripts, type ScriptData } from "../../hooks/useScriptPersistence";
import { getPineScriptAdapter } from "../../../lib/pinescript/adapter";
import type { PineBars, StrategyResult } from "@vninvestcharts/widget-pro";
import { useWidgetI18n } from "../../context/WidgetI18nContext";
import styles from "../../styles/strategy-tester.module.css";

function findIndicatorKey(indicators: any[], type: string, paramOverrides?: Record<string, number>): string {
	const match = indicators.find(ind => ind.type === type);
	const period = paramOverrides?.period ?? match?.params?.period;
	switch (type) {
		case "RSI": return `RSI:period=${period || 14}`;
		case "EMA": return `EMA:period=${period || 20}`;
		case "MA": return `MA:period=${period || 20}`;
		case "BollingerBand": return `BollingerBand:period=${period || 20}:stdDev=${paramOverrides?.stdDev ?? match?.params?.stdDev ?? 2}`;
		default: return `${type}:period=${period || 20}`;
	}
}

/** Nguồn chiến lược có thể chạy: script Pine của user, hoặc 4 preset có sẵn. */
type StrategySource = "pine" | "rsi" | "ema" | "sma_cross" | "bb";

export interface StrategyTesterPanelProps {
	plotData: any[]; // EnrichedDatum[]
	symbol: string;
	timeframe: string;
	activeIndicators: any[]; // active indicator configs to search for keys
	/**
	 * OHLCV để chạy chiến lược Pine (P1-2, 2026-10-22).
	 *
	 * KHÔNG có bars ⇒ panel chỉ chạy được 4 preset có sẵn (hành vi cũ, giữ nguyên).
	 */
	bars?: PineBars;
}

export function StrategyTesterPanel({ plotData, symbol, timeframe, activeIndicators, bars }: StrategyTesterPanelProps) {
	const { t } = useWidgetI18n();
	const [strategyType, setStrategyType] = useState<StrategySource>("ema");
	const [report, setReport] = useState<PerformanceReport | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [pineScriptId, setPineScriptId] = useState<string>("");

	/**
	 * Script Pine đã lưu của user (P1-2).
	 *
	 * Đọc TỪ `localStorage` lúc render, không qua prop: `PineEditorPanel` và
	 * `StrategyTesterPanel` là hai tab anh em, state editor nằm trong panel editor ⇒
	 * nâng state lên `BottomPanelHost` sẽ bẻ nhánh. `readStoredScripts()` được viết
	 * đúng cho việc này ("read-only view for callers outside the editor panel").
	 */
	const pineScripts: ScriptData[] = useMemo(() => {
		try {
			const adapter = getPineScriptAdapter();
			if (!adapter) return [];
			return readStoredScripts().filter((s: ScriptData) => adapter.isStrategySource(s.source));
		} catch {
			return [];
		}
	}, []);

	const selectedPine = pineScripts.find((s) => s.id === pineScriptId) ?? pineScripts[0];

	const handleRunBacktest = () => {
		setError(null);

		// ── Nguồn: script PINE của user ───────────────────────────────────────────
		if (strategyType === "pine") {
			if (!bars) {
				setError(t("ui.strategy.pineNeedsBars"));
				return;
			}
			const script = selectedPine ?? pineScripts[0];
			if (!script) {
				setError(t("ui.strategy.pineNotStrategy"));
				return;
			}
			const adapter = getPineScriptAdapter();
			if (!adapter) {
				setError(t("ui.pinescript.proModuleNotLoaded"));
				return;
			}
			if (!adapter.isStrategySource(script.source)) {
				setError(t("ui.strategy.pineNotStrategy"));
				return;
			}
			// `runStrategy` KHÔNG ném: lỗi parse và lỗi đánh giá đều về `errors` (cùng
			// hợp đồng với `compile()`) ⇒ không cần try/catch ở đây.
			const result = adapter.runStrategy(script.source, bars) as StrategyResult;
			if (result.errors.length > 0) {
				setError(t("ui.strategy.pineError", { message: result.errors[0].message }));
				return;
			}
			setReport(strategyResultToReport(result, bars));
			return;
		}

		// ── Nguồn: 4 preset có sẵn (hành vi cũ, giữ nguyên) ────────────────────
		const simulator = new BrokerSimulator(100000); // 100k initial balance

		const rsiKey = findIndicatorKey(activeIndicators, "RSI", { period: 14 });
		const emaKey = findIndicatorKey(activeIndicators, "EMA", { period: 20 });
		const smaFastKey = findIndicatorKey(activeIndicators, "MA", { period: 10 });
		const smaSlowKey = findIndicatorKey(activeIndicators, "MA", { period: 50 });
		const bbKey = findIndicatorKey(activeIndicators, "BollingerBand", { period: 20, stdDev: 2 });

		const strategyFn = (curr: any, prev: any) => {
			if (strategyType === "rsi") {
				// Buy when RSI crosses above 30, Sell when RSI crosses below 70
				const rsiCurr = curr.indicatorValues?.[rsiKey];
				const rsiPrev = prev.indicatorValues?.[rsiKey];
				if (typeof rsiCurr === "number" && typeof rsiPrev === "number") {
					if (rsiPrev <= 30 && rsiCurr > 30) return "buy";
					if (rsiPrev >= 70 && rsiCurr < 70) return "sell";
				}
			} else if (strategyType === "ema") {
				// Buy when price crosses above EMA, Sell when price crosses below EMA
				const emaCurr = curr.indicatorValues?.[emaKey];
				const emaPrev = prev.indicatorValues?.[emaKey];
				const closeCurr = curr.close;
				const closePrev = prev.close;
				if (typeof emaCurr === "number" && typeof emaPrev === "number") {
					if (closePrev <= emaPrev && closeCurr > emaCurr) return "buy";
					if (closePrev >= emaPrev && closeCurr < emaPrev) return "sell";
				}
			} else if (strategyType === "sma_cross") {
				// Buy when SMA fast crosses above SMA slow, Sell when crosses below
				const fastCurr = curr.indicatorValues?.[smaFastKey];
				const fastPrev = prev.indicatorValues?.[smaFastKey];
				const slowCurr = curr.indicatorValues?.[smaSlowKey];
				const slowPrev = prev.indicatorValues?.[smaSlowKey];
				if (typeof fastCurr === "number" && typeof fastPrev === "number" && typeof slowCurr === "number" && typeof slowPrev === "number") {
					if (fastPrev <= slowPrev && fastCurr > slowCurr) return "buy";
					if (fastPrev >= slowPrev && fastCurr < slowPrev) return "sell";
				}
			} else if (strategyType === "bb") {
				// Buy when price touches lower band, Sell when price touches upper band
				const bbCurr = curr.indicatorValues?.[bbKey];
				const bbPrev = prev.indicatorValues?.[bbKey];
				const closeCurr = curr.close;
				const closePrev = prev.close;
				if (bbCurr && typeof bbCurr === "object" && "lower" in bbCurr && "upper" in bbCurr) {
					const lower = (bbCurr as any).lower; // ARC-1-keep: legacy bridge
					const upper = (bbCurr as any).upper; // ARC-1-keep: legacy bridge
					if (closePrev > lower && closeCurr <= lower) return "buy";
					if (closePrev < upper && closeCurr >= upper) return "sell";
				}
			}
			return null;
		};

		const result = simulator.runBacktest(plotData, strategyFn);
		setReport(result);
	};

	return (
		<div className={styles.panel}>
			{/* Top Controls */}
			<div className={styles.header}>
				<span className={styles.title}>{t("ui.strategy.report")}:</span>
				<select
					value={strategyType}
					onChange={(e) => setStrategyType(e.target.value as StrategySource)}
					className={styles.select}
				>
					{/* Nguồn PINE: chỉ hiện khi user THỰC SỰ có script strategy đã lưu. */}
					{pineScripts.length > 0 && (
						<option value="pine">{t("ui.strategy.source.pine")}</option>
					)}
					<option value="ema">{t("ui.strategy.preset.ema")}</option>
					<option value="rsi">{t("ui.strategy.preset.rsi")}</option>
					<option value="sma_cross">{t("ui.strategy.preset.sma_cross")}</option>
					<option value="bb">{t("ui.strategy.preset.bb")}</option>
				</select>
				{/* Chọn script nào khi có nhiều script strategy. */}
				{strategyType === "pine" && pineScripts.length > 1 && (
					<select
						value={selectedPine?.id ?? ""}
						onChange={(e) => setPineScriptId(e.target.value)}
						className={styles.select}
						aria-label={t("ui.strategy.source.pine")}
					>
						{pineScripts.map((s) => (
							<option key={s.id} value={s.id}>{s.name}</option>
						))}
					</select>
				)}
				<button
					onClick={handleRunBacktest}
					className={styles.runBtn}
				>
					{strategyType === "pine" ? t("ui.strategy.runPine") : t("ui.strategy.run")}
				</button>
			</div>

			{/* LỖI của script (P1-2): trước đây panel không có đường báo lỗi nào. */}
			{error && (
				<div className={styles.emptyState} role="alert">{error}</div>
			)}

			{/* Report Stats */}
			{report && !error ? (
				<div style={{ display: "flex", flexDirection: "column", gap: "12px", flex: 1, minHeight: 0, overflow: "hidden" }}>
					<div className={styles.statsGrid}>
						<div className={styles.statCard}>
							<div className={styles.statLabel}>{t("ui.strategy.netProfit")}</div>
							<div className={`${styles.statValue} ${report.netProfit >= 0 ? styles.statValuePositive : styles.statValueNegative}`}>
								{report.netProfit >= 0 ? "+" : ""}{report.netProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
							</div>
						</div>
						<div className={styles.statCard}>
							<div className={styles.statLabel}>{t("ui.strategy.winRate")}</div>
							<div className={styles.statValue}>{report.winRate.toFixed(1)}%</div>
						</div>
						<div className={styles.statCard}>
							<div className={styles.statLabel}>{t("ui.strategy.profitFactor")}</div>
							<div className={styles.statValue}>
								{Number.isFinite(report.profitFactor) ? report.profitFactor.toFixed(2) : "∞"}
							</div>
						</div>
						<div className={styles.statCard}>
							<div className={styles.statLabel}>{t("ui.strategy.totalTrades")}</div>
							<div className={styles.statValue}>{report.totalTrades}</div>
						</div>
					</div>

					{/* Trade Log list */}
					<div className={styles.tradeLog}>
						<table className={styles.tradeTable}>
							<thead>
								<tr>
									<th className={styles.tradeTableTh}>{t("ui.strategy.trade.type")}</th>
									<th className={styles.tradeTableTh}>{t("ui.strategy.trade.entryPrice")}</th>
									<th className={styles.tradeTableTh}>{t("ui.strategy.trade.exitPrice")}</th>
									<th className={styles.tradeTableTh}>{t("ui.strategy.trade.pnl")}</th>
									<th className={styles.tradeTableTh}>{t("ui.strategy.trade.pnlPercent")}</th>
									<th className={styles.tradeTableTh}>{t("ui.strategy.trade.date")}</th>
								</tr>
							</thead>
							<tbody>
								{report.trades.map((trade) => (
									<tr key={trade.id}>
										<td className={trade.direction === "long" ? styles.tradeTypeLong : styles.tradeTypeShort}>
											{t(trade.direction === "long" ? "ui.strategy.trade.long" : "ui.strategy.trade.short")}
										</td>
										<td>{trade.entryPrice.toFixed(2)}</td>
										<td>{trade.exitPrice.toFixed(2)}</td>
										<td className={trade.pnl >= 0 ? styles.tradePnlPositive : styles.tradePnlNegative}>
											{trade.pnl >= 0 ? "+" : ""}{trade.pnl.toLocaleString(undefined, { maximumFractionDigits: 2 })}
										</td>
										<td className={trade.pnl >= 0 ? styles.tradePnlPositive : styles.tradePnlNegative}>
											{trade.pnl >= 0 ? "+" : ""}{trade.pnlPercent.toFixed(2)}%
										</td>
										<td className={styles.tradeDate}>{formatTradeDate(trade.exitTime)}</td>
									</tr>
								))}
								{report.trades.length === 0 && (
									<tr>
										<td colSpan={6} className={styles.emptyState}>
											{t("ui.strategy.noTrades")}
										</td>
									</tr>
								)}
							</tbody>
						</table>
					</div>
				</div>
			) : (
				!error && (
					<div className={styles.emptyState}>
						{t("ui.strategy.hint")}
					</div>
				)
			)}
		</div>
	);
}
