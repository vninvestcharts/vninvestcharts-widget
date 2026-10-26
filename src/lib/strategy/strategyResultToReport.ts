import type { StrategyResult } from "@vninvestcharts/widget-pro";
import type { PineBars } from "@vninvestcharts/widget-pro";
import type { PerformanceReport, TradeRecord } from "./types";

/**
 * Map `StrategyResult` (engine chiến lược Pine) sang `PerformanceReport` (shape mà
 * panel Strategy Tester đã hiển thị).
 *
 * WHY (P1-2, 2026-10-22): capability Pro `strategy_tester` nói "chạy backtest script của
 * bạn" nhưng panel chỉ chạy **4 chiến lược hard-code** (`StrategyTesterPanel.tsx:28`).
 * Engine Pine **đã có** đủ số liệu (`StrategyResult`: netProfit · wins · losses ·
 * closedTrades · maxDrawdown · equity · trades) ⇒ thiếu đúng **một mảnh nối**: hàm map.
 *
 * Hàm này **thuần** (không đọc DOM, không I/O) ⇒ test được không cần browser.
 *
 * Quy ước map (đo từ `StrategyResult`):
 *   - `initialBalance` = `params.initialCapital` (vốn khởi tạo trong `strategy(...)`)
 *   - `finalBalance`   = vốn + netProfit
 *   - `winRate`        = wins / closedTrades (%) — tính trên **trade đã đóng**
 *   - `profitFactor`   = tổng lãi / |tổng lỗ| trên các trade đã đóng
 *   - `totalTrades`    = số trade **đã đóng** (khác `orders` = số lệnh đã gửi)
 *   - `pnlPercent`     = netProfit của trade / (entryPrice × qty) × 100
 *   - `exitTime`       = `bars.time[exitBar]` nếu có, ngược lại **bar index** (đánh dấu
 *     rõ bằng cách bỏ trống phần ngày: panel hiện `toLocaleDateString()` ⇒ bar index sẽ
 *     ra số 0/1/2… ⇒ người dùng thấy "1/1/1970" ⇒ phải đánh dấu).
 */
export function strategyResultToReport(result: StrategyResult, bars?: PineBars): PerformanceReport {
	const closed = result.trades ?? [];
	const initialBalance = result.params?.initialCapital ?? 100000;
	const grossProfit = closed.reduce((sum, t) => sum + Math.max(0, t.netProfit), 0);
	const grossLoss = closed.reduce((sum, t) => sum + Math.abs(Math.min(0, t.netProfit)), 0);
	const wins = closed.filter((t) => t.netProfit > 0).length;

	const trades: TradeRecord[] = closed.map((t, i) => {
		const entryNotional = Math.abs(t.entryPrice * t.qty);
		const pnlPercent = entryNotional > 0 ? (t.netProfit / entryNotional) * 100 : 0;
		const exitTime = bars?.time?.[t.exitBar] ?? Number.NaN;
		return {
			id: `pine-${i}-${t.entryBar}-${t.exitBar}`,
			direction: t.side === 1 ? "long" : "short",
			qty: t.qty,
			entryPrice: t.entryPrice,
			// Không có timestamp thật khi `bars.time` vắng ⇒ NaN để UI hiện "—" thay vì
			// một ngày bịa ra. Xem `formatTradeDate` bên dưới.
			entryTime: Number.isFinite(bars?.time?.[t.entryBar] ?? NaN) ? (bars!.time![t.entryBar] as number) : Number.NaN,
			exitPrice: t.exitPrice,
			exitTime,
			pnl: t.netProfit,
			pnlPercent,
		};
	});

	return {
		initialBalance,
		finalBalance: initialBalance + result.netProfit,
		netProfit: result.netProfit,
		winRate: closed.length > 0 ? (wins / closed.length) * 100 : 0,
		profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Number.POSITIVE_INFINITY : 0,
		totalTrades: closed.length,
		trades,
	};
}

/**
 * Ngày của một trade. Không có timestamp thật thì trả `null` ⇒ UI hiện "—".
 *
 * KHÔNG dùng `new Date(NaN)` ⇒ `toLocaleDateString()` ra "Invalid Date" (xấu) hoặc
 * "1/1/1970" (tệ hơn: trông như dữ liệu thật).
 */
export function formatTradeDate(exitTime: number): string {
	if (!Number.isFinite(exitTime)) return "—";
	return new Date(exitTime).toLocaleDateString();
}
