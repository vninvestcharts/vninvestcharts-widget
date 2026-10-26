import { beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { fireEvent } from "@testing-library/react";
import { TradingProvider, useTradingContext, type TradingContextValue } from "../../context/TradingContext";
import { ActiveChartPaperPanel } from "../ActiveChartPaperPanel";
import {
	clearAllPaperPanelBindingsForTesting,
	getPaperPanelBinding,
} from "../../context/PaperPanelRegistry";

function bar(price: number, time: number) {
	return { open: price, high: price + 10, low: price - 10, close: price, volume: 0, date: new Date(time) };
}

describe("ActiveChartPaperPanel (P1-S2)", () => {
	let containers: HTMLDivElement[] = [];
	let roots: ReturnType<typeof createRoot>[] = [];

	const mountProvider = async (
		chartId: string,
		symbol: string,
		bars: ReturnType<typeof bar>[],
		slot?: { current: TradingContextValue | null },
		providerProps?: object,
	) => {
		const el = document.createElement("div");
		document.body.appendChild(el);
		containers.push(el);
		const root = createRoot(el);
		roots.push(root);
		const Probe = slot
			? () => {
				slot.current = useTradingContext();
				return null;
			}
			: () => null;
		await act(async () => {
			root.render(
				<TradingProvider symbol={symbol} bars={bars} chartId={chartId} {...providerProps}>
					<Probe />
				</TradingProvider>,
			);
		});
		return root;
	};

	const mountPanel = async (chartId: string | null, extra?: object) => {
		const el = document.createElement("div");
		document.body.appendChild(el);
		containers.push(el);
		const root = createRoot(el);
		roots.push(root);
		await act(async () => {
			root.render(<ActiveChartPaperPanel chartId={chartId} onClose={() => {}} {...extra} />);
		});
		return { root, el };
	};

	beforeEach(() => {
		clearAllPaperPanelBindingsForTesting();
		window.localStorage.clear();
	});

	afterEach(async () => {
		await act(async () => {
			roots.forEach((r) => r.unmount());
		});
		roots = [];
		containers.forEach((c) => c.remove());
		containers = [];
		clearAllPaperPanelBindingsForTesting();
	});

	it("hiện position của ô active, không lẫn ô khác + badge đúng", async () => {
		const slotA: { current: TradingContextValue | null } = { current: null };
		const barsA = [bar(128200, 1000), bar(128800, 2000)];
		await mountProvider("chart-a", "FPT", barsA, slotA);
		await mountProvider("chart-b", "VNM", barsA);
		await act(async () => {
			slotA.current?.placeOrder({ symbol: "FPT", side: "buy", type: "market", quantity: 100 });
		});
		const { el } = await mountPanel("chart-a");
		// Working order hiện ở tab Lệnh chờ; fill cần bar kế (test dưới khóa positions).
		expect(el.textContent).toContain("FPT");
		expect(el.querySelector('[data-testid="panel-chart-badge"]')).not.toBeNull();
		expect(el.querySelector('[data-testid="panel-tab-orders"]')).not.toBeNull();
	});

	it("đổi chartId A→B: badge + snapshot đổi theo", async () => {
		await mountProvider("chart-a", "FPT", [bar(128200, 1000)]);
		await mountProvider("chart-b", "VNM", [bar(60200, 1000)]);
		const el = document.createElement("div");
		document.body.appendChild(el);
		containers.push(el);
		const root = createRoot(el);
		roots.push(root);
		await act(async () => {
			root.render(<ActiveChartPaperPanel chartId="chart-a" onClose={() => {}} />);
		});
		expect(el.querySelector('[data-testid="panel-chart-badge"]')?.textContent).toContain("FPT");
		await act(async () => {
			root.render(<ActiveChartPaperPanel chartId="chart-b" onClose={() => {}} />);
		});
		expect(el.querySelector('[data-testid="panel-chart-badge"]')?.textContent).toContain("VNM");
	});

	it("fill ở A khi đang xem A → panel tự refresh (bus, không reload)", async () => {
		const slotA: { current: TradingContextValue | null } = { current: null };
		const barsA = [bar(128200, 1000), bar(128800, 2000)];
		const rootA = await mountProvider("chart-a", "FPT", barsA, slotA);
		const { el } = await mountPanel("chart-a");
		await act(async () => {
			slotA.current?.placeOrder({ symbol: "FPT", side: "buy", type: "market", quantity: 100 });
		});
		// Bar kế → fill → bus positionChange → panel re-render, tab Vị thế có dòng.
		await act(async () => {
			rootA.render(
				<TradingProvider symbol="FPT" bars={[...barsA, bar(129000, 3000)]} chartId="chart-a">
					{null}
				</TradingProvider>,
			);
		});
		expect(getPaperPanelBinding("chart-a")?.getSnapshot().positions).toHaveLength(1);
		expect(el.textContent).toContain("FPT");
	});

	it("mount panel trước khi provider register → có dữ liệu khi binding đến (D8)", async () => {
		const { el } = await mountPanel("chart-late");
		expect(el.querySelector('[data-testid="panel-chart-badge"]')).toBeNull();
		await mountProvider("chart-late", "FPT", [bar(128200, 1000)]);
		expect(el.querySelector('[data-testid="panel-chart-badge"]')?.textContent).toContain("FPT");
	});

	it("đóng position từ panel chỉ xóa broker ô đang xem (crypto T+0)", async () => {
		const slotA: { current: TradingContextValue | null } = { current: null };
		const barsA = [bar(80000, 1000), bar(81000, 2000)];
		const rootA = await mountProvider("chart-a", "BTCUSDT", barsA, slotA);
		await act(async () => {
			slotA.current?.placeOrder({ symbol: "BTCUSDT", side: "buy", type: "market", quantity: 1 });
		});
		// Bar kế → fill (market khớp open nến kế).
		await act(async () => {
			rootA.render(
				<TradingProvider symbol="BTCUSDT" bars={[...barsA, bar(82000, 3000)]} chartId="chart-a">
					{null}
				</TradingProvider>,
			);
		});
		expect(getPaperPanelBinding("chart-a")?.getSnapshot().positions).toHaveLength(1);
		const binding = getPaperPanelBinding("chart-a");
		const posId = binding?.getSnapshot().positions[0].id as string;
		await act(async () => {
			binding?.closePosition(posId);
		});
		expect(getPaperPanelBinding("chart-a")?.getSnapshot().positions).toHaveLength(0);
	});

	it("replay prop → đọc sổ replay (D4, không động binding)", async () => {
		const replayBroker = {
			getAccount: () => ({
				accountId: "replay",
				balance: 100000000,
				equity: 100000000,
				marginUsed: 0,
				freeMargin: 100000000,
				buyingPower: 100000000,
				currency: "VND",
				pnl: 0,
				pnlPercent: 0,
			}),
			getPositions: () => [],
			getOrders: () => [],
			getAnalytics: () => ({
				totalTrades: 0,
				winningTrades: 0,
				losingTrades: 0,
				winRate: 0,
				grossProfit: 0,
				grossLoss: 0,
				netProfit: 0,
				profitFactor: 0,
				maxDrawdown: 0,
				maxDrawdownPercent: 0,
				equityCurve: [],
				closedTrades: [],
				sharpeRatio: 0,
			}),
		};
		const { el } = await mountPanel(null, {
			replay: { broker: replayBroker, log: [], closePosition: vi.fn(), reversePosition: vi.fn(), cancelOrder: vi.fn(), reset: vi.fn() },
		});
		expect(el.querySelector('[data-testid="trading-bottom-panel"]')).not.toBeNull();
	});

	it("ô active bị ẩn trading bar → panel hiện CTA bật lại + badge (thống nhất singlechart)", async () => {
		const slotA: { current: TradingContextValue | null } = { current: null };
		await mountProvider("chart-a", "FPT", [bar(128200, 1000)], slotA, { defaultEnabled: false });
		expect(getPaperPanelBinding("chart-a")?.getSnapshot().tradingEnabled).toBe(false);
		expect(typeof getPaperPanelBinding("chart-a")?.getSnapshot().onEnableTrading).toBe("function");
		const { el } = await mountPanel("chart-a");
		// CTA giống singlechart + badge biết đang bật cho ô nào.
		expect(el.querySelector('[data-testid="trading-disabled-cta"]')).not.toBeNull();
		expect(el.querySelector('[data-testid="trading-enable-btn"]')).not.toBeNull();
		expect(el.querySelector('[data-testid="panel-chart-badge"]')?.textContent).toContain("FPT");
		// Bấm bật → CTA biến mất, panel vị thế hiện lại.
		await act(async () => {
			fireEvent.click(el.querySelector('[data-testid="trading-enable-btn"]') as HTMLElement);
		});
		expect(el.querySelector('[data-testid="trading-disabled-cta"]')).toBeNull();
		expect(el.querySelector('[data-testid="trading-bottom-panel"]')).not.toBeNull();
		expect(getPaperPanelBinding("chart-a")?.getSnapshot().tradingEnabled).toBe(true);
	});

	it("toggle mắt runtime → panel đổi CTA/khôi phục ngay (re-register notify)", async () => {
		const slotA: { current: TradingContextValue | null } = { current: null };
		await mountProvider("chart-a", "FPT", [bar(128200, 1000)], slotA);
		const { el } = await mountPanel("chart-a");
		expect(el.querySelector('[data-testid="trading-disabled-cta"]')).toBeNull();
		await act(async () => {
			slotA.current?.setTradingEnabled(false);
		});
		expect(el.querySelector('[data-testid="trading-disabled-cta"]')).not.toBeNull();
		await act(async () => {
			slotA.current?.setTradingEnabled(true);
		});
		expect(el.querySelector('[data-testid="trading-disabled-cta"]')).toBeNull();
	});

	it("reset từ panel truyền đúng số vốn vào broker ô đang xem (repro)", async () => {
		await mountProvider("chart-a", "FPT", [bar(128200, 1000)]);
		await mountProvider("chart-b", "VNM", [bar(60200, 1000)]);
		const { el } = await mountPanel("chart-a");
		// Mở dialog nạp vốn từ header panel của ô A.
		fireEvent.click(el.querySelector('[data-testid="header-reset"]') as HTMLElement);
		const input = el.querySelector('[data-testid="capital-input"]') as HTMLInputElement;
		fireEvent.change(input, { target: { value: "" } });
		fireEvent.change(input, { target: { value: "500000" } });
		fireEvent.click(el.querySelector('[data-testid="capital-confirm"]') as HTMLElement);
		expect(getPaperPanelBinding("chart-a")?.getSnapshot().account.balance).toBe(500000);
		expect(getPaperPanelBinding("chart-a")?.getSnapshot().account.buyingPower).toBe(500000);
		// Ô B nguyên vẹn.
		expect(getPaperPanelBinding("chart-b")?.getSnapshot().account.balance).toBe(1_000_000_000);
	});
});
