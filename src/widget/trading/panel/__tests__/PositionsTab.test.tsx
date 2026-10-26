import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PositionsTab } from "../PositionsTab";
import type { TradingPosition } from "../../../../lib/core/trading/types";

const position = {
	id: "pos_1",
	symbol: "FPT",
	side: "long",
	quantity: 10,
	availableQuantity: 10,
	entryPrice: 90,
	currentPrice: 100,
	unrealizedPnl: 100,
	realizedPnl: 0,
	createdAt: 0,
	updatedAt: 0,
} as TradingPosition;

describe("PositionsTab PnL toggle (S6)", () => {
	it("gross shows raw unrealized; net subtracts exit fee+tax", () => {
		const { unmount } = render(
			<PositionsTab positions={[position]} orders={[]} onClosePosition={vi.fn()} onReversePosition={vi.fn()} />,
		);
		expect(screen.getByTestId("position-pnl-pos_1").textContent).toContain("100");
		unmount();
		render(
			<PositionsTab
				positions={[position]}
				orders={[]}
				onClosePosition={vi.fn()}
				onReversePosition={vi.fn()}
				pnlDisplayMode="net"
				exitFeeRate={0.001}
				exitTaxRate={0.001}
			/>,
		);
		// 100 − 100*10*0.002 = 98.
		expect(screen.getByTestId("position-pnl-pos_1").textContent).toContain("98");
	});

	it("header toggle button calls through with pressed state", () => {
		const onToggle = vi.fn();
		render(
			<PositionsTab
				positions={[position]}
				orders={[]}
				onClosePosition={vi.fn()}
				onReversePosition={vi.fn()}
				pnlDisplayMode="net"
				onTogglePnlDisplay={onToggle}
			/>,
		);
		const toggle = screen.getByTestId("positions-pnl-toggle") as HTMLButtonElement;
		expect(toggle.getAttribute("aria-pressed")).toBe("true");
		fireEvent.click(toggle);
		expect(onToggle).toHaveBeenCalledTimes(1);
	});

	it("P1.3: close-all button calls handler (optional, hidden when missing)", () => {
		const { rerender } = render(
			<PositionsTab positions={[position]} orders={[]} onClosePosition={vi.fn()} onReversePosition={vi.fn()} />,
		);
		expect(screen.queryByTestId("positions-close-all")).toBeNull();
		const onCloseAll = vi.fn();
		rerender(
			<PositionsTab
				positions={[position]}
				orders={[]}
				onClosePosition={vi.fn()}
				onReversePosition={vi.fn()}
				onCloseAllPositions={onCloseAll}
			/>,
		);
		fireEvent.click(screen.getByTestId("positions-close-all"));
		expect(onCloseAll).toHaveBeenCalledTimes(1);
	});
});
