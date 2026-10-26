import { useMemo } from "react";

export type SizingMode = "fixed" | "percent";

export interface UsePaperTradeConfigOptions {
	/** Fee rate (fraction, ví dụ 0.001 = 0.1%). Default 0 (backward-compat). */
	feeRate?: number;
	/** H2: slippage đơn giản (bps). Default 0. */
	slippageBps?: number;
	/** H4: fixed qty. Default 1. */
	defaultQty?: number;
	/** H4: sizing mode. "fixed" = defaultQty, "percent" = % of equity. Default "fixed". */
	sizingMode?: SizingMode;
	/** H4: risk % of equity per trade (khi sizingMode="percent"). Default 1 = 1%. */
	riskPercent?: number;
	/** H4: vốn ban đầu để tính % equity. Default 10000. */
	initialEquity?: number;
	/** Symbol của active chart (từ context). */
	symbol?: string;
}

export interface PaperTradeConfig {
	feeRate: number;
	slippageBps: number;
	defaultQty: number;
	sizingMode: SizingMode;
	riskPercent: number;
	initialEquity: number;
	symbol?: string;
}

// F3, H4: cấu hình tập trung cho paper trade. Dễ đổi qua prop.
export function usePaperTradeConfig(options: UsePaperTradeConfigOptions = {}): PaperTradeConfig {
	const {
		feeRate = 0,
		slippageBps = 0,
		defaultQty = 1,
		sizingMode = "fixed",
		riskPercent = 1,
		initialEquity = 10000,
		symbol,
	} = options;
	return useMemo<PaperTradeConfig>(
		() => ({
			feeRate: feeRate >= 0 ? feeRate : 0,
			slippageBps: slippageBps >= 0 ? slippageBps : 0,
			defaultQty: defaultQty >= 1 ? defaultQty : 1,
			sizingMode,
			riskPercent: riskPercent > 0 ? riskPercent : 1,
			initialEquity: initialEquity > 0 ? initialEquity : 10000,
			symbol,
		}),
		[feeRate, slippageBps, defaultQty, sizingMode, riskPercent, initialEquity, symbol],
	);
}
