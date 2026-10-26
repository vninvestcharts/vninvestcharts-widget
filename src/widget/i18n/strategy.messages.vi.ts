import type { WidgetMessages } from "./types";

/** Bản dịch tiếng Việt — phải khớp 100% key với `strategy.messages.en.ts`. */
export const strategyMessagesVi: WidgetMessages = {
	// --- Nhãn báo cáo (chuyển từ messages.vi.ts) ---
	"ui.strategy.report": "Thử nghiệm chiến thuật",
	"ui.strategy.netProfit": "Lãi/lỗ ròng",
	"ui.strategy.winRate": "Tỷ lệ thắng",
	"ui.strategy.profitFactor": "Hệ số lãi/lỗ",
	"ui.strategy.totalTrades": "Tổng số lệnh",

	// --- Chọn chiến lược ---
	"ui.strategy.source.pine": "Chiến lược Pine của tôi",
	"ui.strategy.preset.ema": "Cắt chéo EMA (EMA 20/Giá)",
	"ui.strategy.preset.rsi": "Đảo RSI (30/70)",
	"ui.strategy.preset.sma_cross": "Cắt chéo SMA (10/50)",
	"ui.strategy.preset.bb": "Chạm Bollinger Bands",
	"ui.strategy.run": "Chạy thử",
	"ui.strategy.runPine": "Chạy chiến lược Pine của tôi",
	"ui.strategy.hint": "Chọn chiến lược rồi bấm \"Chạy thử\" để có báo cáo.",
	"ui.strategy.noTrades": "Chiến lược không tạo ra lệnh nào.",
	"ui.strategy.pineNeedsBars": "Chiến lược Pine cần dữ liệu giá. Hãy mở biểu đồ có dữ liệu trước.",
	"ui.strategy.pineError": "Lỗi chiến lược: {{message}}",
	"ui.strategy.pineNotStrategy": "Script Pine đang chọn không phải chiến lược (thiếu khai báo strategy(...)).",
	"ui.pinescript.proModuleNotLoaded": "Module PineScript Pro chưa được nạp. Cài @vninvestcharts/widget-pro để dùng trình soạn Pine và backtest.",
	"ui.strategy.maxDrawdown": "Sụt giảm tối đa",
	"ui.strategy.equity": "Đường cong vốn",

	// --- Bảng giao dịch ---
	"ui.strategy.trade.type": "Loại",
	"ui.strategy.trade.entryPrice": "Giá vào",
	"ui.strategy.trade.exitPrice": "Giá ra",
	"ui.strategy.trade.pnl": "Lãi/lỗ",
	"ui.strategy.trade.pnlPercent": "Lãi/lỗ %",
	"ui.strategy.trade.date": "Ngày",
	"ui.strategy.trade.long": "Mua",
	"ui.strategy.trade.short": "Bán",
};
