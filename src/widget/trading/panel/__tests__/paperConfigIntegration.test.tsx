import { beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { fireEvent, screen } from "@testing-library/react";
import { TradingProvider, useTradingContext, type TradingContextValue } from "../../context/TradingContext";
import { ActiveChartPaperPanel } from "../ActiveChartPaperPanel";
import { clearAllPaperPanelBindingsForTesting } from "../../context/PaperPanelRegistry";

function bar(price: number, time: number) {
	return { open: price, high: price + 10, low: price - 10, close: price, volume: 1000, date: new Date(time) };
}

describe("paper config integration (S6 wiring)", () => {
	let containers: HTMLDivElement[] = [];
	let roots: ReturnType<typeof createRoot>[] = [];

	beforeEach(() => {
		clearAllPaperPanelBindingsForTesting();
		for (let i = window.localStorage.length - 1; i >= 0; i--) {
			const key = window.localStorage.key(i);
			if (key?.startsWith("vnsc_paper_cfg_")) window.localStorage.removeItem(key);
		}
	});

	const mountAll = async (chartId: string) => {
		const slot: { current: TradingContextValue | null } = { current: null };
	 const bars = [bar(128000, 1), bar(128200, 2)];
		const providerEl = document.createElement("div");
		document.body.appendChild(providerEl);
		containers.push(providerEl);
		const providerRoot = createRoot(providerEl);
		roots.push(providerRoot);
		const Probe = () => {
			slot.current = useTradingContext();
			return null;
		};
		await act(async () => {
			providerRoot.render(
				<TradingProvider symbol="FPT" bars={bars} chartId={chartId}>
					<Probe />
				</TradingProvider>,
			);
		});
		const panelEl = document.createElement("div");
		document.body.appendChild(panelEl);
		containers.push(panelEl);
		const panelRoot = createRoot(panelEl);
		roots.push(panelRoot);
		await act(async () => {
			panelRoot.render(<ActiveChartPaperPanel chartId={chartId} onClose={() => {}} />);
		});
		return { slot, panelEl };
	};

	it("gear → fee change → save cascades to the live broker", async () => {
		const { slot } = await mountAll("chart-int");
		expect(slot.current).not.toBeNull();

		fireEvent.click(screen.getByTestId("panel-settings"));
		fireEvent.change(screen.getByTestId("paper-settings-fee"), { target: { value: "0" } });
		fireEvent.click(screen.getByTestId("paper-settings-save"));

		const stored = JSON.parse(window.localStorage.getItem("vnsc_paper_cfg_VN_SPOT") ?? "{}");
		expect(stored.brokerFeeRate).toBe(0);

		// New fills use the saved fee on the SAME broker (no recreate).
		const broker = slot.current!.broker;
		broker.onBar("FPT", { open: 128000, high: 128400, low: 127800, close: 128200, date: new Date(3) });
		broker.placeOrder({ symbol: "FPT", side: "buy", type: "market", quantity: 100 });
		broker.onBar("FPT", { open: 128500, high: 129000, low: 128000, close: 128800, date: new Date(4) });
		const history = broker.getHistory();
		expect(history.length).toBeGreaterThan(0);
		expect(history[history.length - 1].commission).toBe(0);
	});

	it("PnL toggle switches gross/net display on live positions", async () => {
		const { slot } = await mountAll("chart-net");
		const broker = slot.current!.broker;
		await act(async () => {
			broker.onBar("FPT", { open: 128000, high: 128400, low: 127800, close: 128200, date: new Date(1) });
			broker.placeOrder({ symbol: "FPT", side: "buy", type: "market", quantity: 100 });
			broker.onBar("FPT", { open: 129000, high: 129500, low: 128800, close: 129200, date: new Date(2) });
		});
		const positions = broker.getPositions();
		expect(positions).toHaveLength(1);
		const numOf = (text: string) => Number((text.match(/-?[\d,]+/)?.[0] ?? "0").replace(/,/g, ""));
		const grossText = screen.getByTestId(`position-pnl-${positions[0].id}`).textContent ?? "";
		fireEvent.click(screen.getByTestId("positions-pnl-toggle"));
		const netText = screen.getByTestId(`position-pnl-${positions[0].id}`).textContent ?? "";
		expect(netText).not.toBe(grossText);
		// Net estimate subtracts a positive exit cost from gross.
		expect(numOf(netText)).toBeLessThan(numOf(grossText));
	});
});
