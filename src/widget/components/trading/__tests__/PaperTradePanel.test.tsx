// @vitest-environment jsdom
/**
 * Phase 5 Slice 5.1: PaperTradePanel unit tests.
 * Pattern: manual createRoot + act (không dùng @testing-library/react).
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PaperTradePanel } from "../PaperTradePanel";

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
});

describe("PaperTradePanel", () => {
	it("renders title + empty states when no data", () => {
		act(() => {
			root.render(<PaperTradePanel positions={[]} journal={[]} />);
		});
		expect(container.querySelector('[data-testid="paper-trade-panel"]')).not.toBeNull();
		expect(container.textContent).toContain("Giao dịch ảo");
		expect(container.textContent).toContain("Nhật ký giao dịch");
	});

	it("renders stats: total, win rate, avgPnl, avgBarsHeld, best/worst", () => {
		const journal = [
			{ id: "t1", side: "long" as const, entryPrice: 100, exitPrice: 110, quantity: 2, pnl: 20, barsHeld: 5 },
			{ id: "t2", side: "short" as const, entryPrice: 200, exitPrice: 180, quantity: 3, pnl: 60, barsHeld: 3 },
		];
		act(() => {
			root.render(<PaperTradePanel positions={[]} journal={journal} />);
		});
		expect(container.textContent).toContain("2"); // total
		expect(container.textContent).toContain("PnL trung bình");
		expect(container.textContent).toContain("Số nến giữ lệnh");
		expect(container.textContent).toContain("Lệnh tốt nhất");
		expect(container.textContent).toContain("Lệnh tệ nhất");
	});

	it("renders current position + journal entries", () => {
		const positions = [
			{ id: "p1", side: "long" as const, entryPrice: 100, currentPrice: 105, quantity: 2, entryBar: 0 },
		];
		const journal = [
			{ id: "t1", side: "long" as const, entryPrice: 100, exitPrice: 110, quantity: 2, pnl: 20, barsHeld: 5 },
		];
		act(() => {
			root.render(
				<PaperTradePanel
					positions={positions}
					journal={journal}
					onReset={() => {}}
					onClose={() => {}}
				/>,
			);
		});
		expect(container.textContent).toContain("LONG");
		expect(container.textContent).toContain("Mở tại");
		expect(container.textContent).toContain("Nhật ký giao dịch");
	});

	it("shows reset + close buttons when handlers provided", () => {
		act(() => {
			root.render(<PaperTradePanel positions={[]} journal={[]} onReset={() => {}} onClose={() => {}} />);
		});
		expect(container.querySelector(".vnsc-paper-trade-panel__reset-btn")).not.toBeNull();
		expect(container.querySelector(".vnsc-paper-trade-panel__close-btn")).not.toBeNull();
	});

	it("renders fee-inclusive unrealizedPnl from position when provided (F-06)", () => {
		const positions = [
			{ id: "p1", side: "long" as const, entryPrice: 100, currentPrice: 110, quantity: 10, entryBar: 0, unrealizedPnl: 95 },
		];
		act(() => {
			root.render(<PaperTradePanel positions={positions} journal={[]} />);
		});
		// Should show 95 (fee-inclusive), not 100 (gross: (110-100)*10)
		expect(container.textContent).toContain("95");
	});

	it("falls back to gross recompute when unrealizedPnl is undefined (F-06)", () => {
		const positions = [
			{ id: "p1", side: "long" as const, entryPrice: 100, currentPrice: 110, quantity: 10, entryBar: 0 },
		];
		act(() => {
			root.render(<PaperTradePanel positions={positions} journal={[]} />);
		});
		// Should show 100 (gross: (110-100)*10)
		expect(container.textContent).toContain("100");
	});
});
