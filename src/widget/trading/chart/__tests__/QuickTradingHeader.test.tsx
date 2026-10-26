import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QuickTradingHeader } from "../QuickTradingHeader";
import type { MarketQuote } from "../../../../lib/core/trading/MarketDataPort";

// QUICKTRADE_PILLS (Option A): strip = 2 pill + mắt, pure controlled.
// Render trần không Provider (default context t hoạt động độc lập).
const quote: MarketQuote = {
	symbol: "FPT",
	lastPrice: 128500,
	bidPrice: 128435.75,
	askPrice: 128564.25,
	spread: 128.5,
	spreadBps: 10,
	isSyntheticSpread: true,
	timestamp: 1,
};

describe("QuickTradingHeader (QUICKTRADE_PILLS)", () => {
	it("hiển thị Bid/Ask + tooltip synthetic trên CẢ hai pill (A2)", () => {
		render(<QuickTradingHeader symbol="FPT" quote={quote} />);
		expect(screen.getByTestId("bid-price").textContent).toBe("128,435.8");
		expect(screen.getByTestId("ask-price").textContent).toBe("128,564.3");
		const buyTitle = screen.getByTestId("buy-btn").getAttribute("title") ?? "";
		const sellTitle = screen.getByTestId("sell-btn").getAttribute("title") ?? "";
		expect(buyTitle).toContain("10.0 bps");
		expect(sellTitle).toContain("10.0 bps");
		// Từ điển vi được resolve ngay cả khi render trần (không Provider) — khớp
		// precedent "Chưa có giá" ở case không-quote; "mô phỏng" là mảnh ổn định.
		expect(buyTitle).toContain("mô phỏng");
		expect(sellTitle).toContain("mô phỏng");
	});

	it("spread thật -> tooltip bps nhưng KHÔNG có hint synthetic", () => {
		render(<QuickTradingHeader symbol="FPT" quote={{ ...quote, isSyntheticSpread: false }} />);
		const buyTitle = screen.getByTestId("buy-btn").getAttribute("title") ?? "";
		expect(buyTitle).toContain("bps");
		expect(buyTitle).not.toContain("mô phỏng");
	});

	it("không quote -> nút disabled + báo Chưa có giá", () => {
		render(<QuickTradingHeader symbol="FPT" quote={null} />);
		expect((screen.getByTestId("buy-btn") as HTMLButtonElement).disabled).toBe(true);
		expect((screen.getByTestId("sell-btn") as HTMLButtonElement).disabled).toBe(true);
		// Từ điển vi thật được dùng ngay cả khi render trần (không Provider).
		expect(screen.getAllByText("Chưa có giá")).toHaveLength(2);
	});

	it("oneClick tắt -> mở ticket với lot mặc định; bật -> đặt thẳng onBuy (A3)", () => {
		const onOpenTicket = vi.fn();
		const onBuy = vi.fn();
		const { rerender } = render(
			<QuickTradingHeader symbol="FPT" quote={quote} onOpenTicket={onOpenTicket} onBuy={onBuy} />,
		);
		fireEvent.click(screen.getByTestId("buy-btn"));
		expect(onOpenTicket).toHaveBeenCalledWith("buy", 100);
		expect(onBuy).not.toHaveBeenCalled();
		rerender(
			<QuickTradingHeader symbol="FPT" quote={quote} defaultOneClick onOpenTicket={onOpenTicket} onBuy={onBuy} />,
		);
		fireEvent.click(screen.getByTestId("buy-btn"));
		expect(onBuy).toHaveBeenCalledTimes(1);
		expect(onBuy).toHaveBeenCalledWith(100);
		expect(onOpenTicket).toHaveBeenCalledTimes(1);
	});

	it("pill Bán đi qua onOpenTicket với side sell", () => {
		const onOpenTicket = vi.fn();
		const onSell = vi.fn();
		render(<QuickTradingHeader symbol="FPT" quote={quote} onOpenTicket={onOpenTicket} onSell={onSell} />);
		fireEvent.click(screen.getByTestId("sell-btn"));
		expect(onOpenTicket).toHaveBeenCalledWith("sell", 100);
		expect(onSell).not.toHaveBeenCalled();
	});

	it("defaultQuantity=300 -> ticket kèm đúng 300 (preset thay stepper)", () => {
		const onOpenTicket = vi.fn();
		render(<QuickTradingHeader symbol="FPT" quote={quote} defaultQuantity={300} onOpenTicket={onOpenTicket} />);
		fireEvent.click(screen.getByTestId("buy-btn"));
		expect(onOpenTicket).toHaveBeenCalledWith("buy", 300);
	});

	it("clamp: defaultQuantity 999 với maxQuantity 500 -> 500; lotSize 1 giữ nguyên", () => {
		const onOpenTicket = vi.fn();
		const first = render(
			<QuickTradingHeader symbol="FPT" quote={quote} defaultQuantity={999} maxQuantity={500} onOpenTicket={onOpenTicket} />,
		);
		fireEvent.click(screen.getByTestId("buy-btn"));
		expect(onOpenTicket).toHaveBeenLastCalledWith("buy", 500);
		first.unmount();
		render(<QuickTradingHeader symbol="VN30F1M" quote={quote} lotSize={1} defaultQuantity={3} onOpenTicket={onOpenTicket} />);
		fireEvent.click(screen.getByTestId("sell-btn"));
		expect(onOpenTicket).toHaveBeenLastCalledWith("sell", 3);
	});

	it("nút mắt M4: bật hiện 👁, bấm bắn toggle false", () => {
		const onToggleTradingEnabled = vi.fn();
		const { rerender } = render(
			<QuickTradingHeader symbol="FPT" quote={quote} onToggleTradingEnabled={onToggleTradingEnabled} />,
		);
		const eye = screen.getByTestId("paper-visibility-toggle") as HTMLButtonElement;
		expect(eye.getAttribute("aria-pressed")).toBe("true");
		expect(eye.textContent).toContain("👁");
		fireEvent.click(eye);
		expect(onToggleTradingEnabled).toHaveBeenCalledWith(false);
		rerender(
			<QuickTradingHeader symbol="FPT" quote={quote} tradingEnabled={false} onToggleTradingEnabled={onToggleTradingEnabled} />,
		);
		expect(screen.getByTestId("paper-visibility-toggle").getAttribute("aria-pressed")).toBe("false");
	});

	it("declutter regression: collapse/stepper/⚡/chip/hint cũ KHÔNG còn trong DOM", () => {
		window.localStorage.removeItem("vnsc_quickTrade_collapsed");
		render(<QuickTradingHeader symbol="FPT" quote={quote} />);
		for (const gone of [
			"quicktrade-collapse",
			"quicktrade-expand",
			"collapsed-quote",
			"qty-input",
			"qty-inc",
			"qty-dec",
			"oneclick-toggle",
			"spread-chip",
			"synthetic-hint",
		]) {
			expect(screen.queryByTestId(gone)).toBeNull();
		}
		expect(screen.queryByTestId("quick-trading-header")?.getAttribute("data-collapsed")).toBeNull();
	});
});
