import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TradingProvider, useTradingContext, type TradingContextValue } from "../../context/TradingContext";
import { ConnectedTradingDockPanel } from "../ConnectedTradingDockPanel";

let latest: TradingContextValue | null = null;

function Probe() {
	latest = useTradingContext();
	return null;
}

// Task TVP-B2: dock nối context — submit qua dock vào đúng broker của provider.
const bars = [
	{ open: 128000, high: 128400, low: 127800, close: 128200, volume: 0, date: new Date(1000) },
	{ open: 128500, high: 129000, low: 128000, close: 128800, volume: 0, date: new Date(2000) },
];

describe("ConnectedTradingDockPanel", () => {
	it("đặt limit qua dock -> lệnh working trong broker", () => {
		render(
			<TradingProvider symbol="FPT" bars={bars}>
				<Probe />
				<ConnectedTradingDockPanel />
			</TradingProvider>,
		);
		fireEvent.click(screen.getByTestId("dock-type-limit"));
		fireEvent.change(screen.getByTestId("dock-price"), { target: { value: "127000" } });
		fireEvent.click(screen.getByTestId("dock-submit"));
		fireEvent.click(screen.getByTestId("order-review-confirm"));
		expect(latest!.broker.getOrders()).toHaveLength(1);
		expect(latest!.broker.getOrders()[0].status).toBe("working");
	});

	it("dock tab orderTicket xuất hiện khi có tradingDockNode", async () => {
		const { RightSidebarDockHost } = await import("../../../components/dock/RightSidebarDockHost");
		render(
			<TradingProvider symbol="FPT" bars={bars}>
				<RightSidebarDockHost
					width={280}
					isResizing={false}
					onSplitterPointerDown={() => {}}
					tradingDockNode={<ConnectedTradingDockPanel />}
					symbol="FPT"
					timeframe="1D"
				/>
			</TradingProvider>,
		);
		fireEvent.click(screen.getByRole("button", { name: "Đặt lệnh" }));
		expect(screen.getByTestId("trading-dock-panel")).toBeDefined();
	});
});
