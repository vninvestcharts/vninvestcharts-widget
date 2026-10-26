// F7: shared PnL helper — dùng chung bởi ReplayPositionManager (paper trade)
// và BrokerSimulator (backtest) để đảm bảo 2 path tính PnL khớp nhau.
// KHÔNG duplicate logic tính PnL ở 2 file (Slice 3.3).
export function computePnl(
	side: "long" | "short",
	entry: number,
	exit: number,
	qty: number,
): number {
	if (side === "long") return (exit - entry) * qty;
	return (entry - exit) * qty;
}

// Tính PnL ròng sau khi trừ fee (entry fee + exit fee) — áp dụng cho cả 2 path.
export function computeNetPnl(
	side: "long" | "short",
	entry: number,
	exit: number,
	qty: number,
	feeRate: number,
): number {
	const gross = computePnl(side, entry, exit, qty);
	const entryFee = entry * qty * feeRate;
	const exitFee = exit * qty * feeRate;
	return gross - entryFee - exitFee;
}
