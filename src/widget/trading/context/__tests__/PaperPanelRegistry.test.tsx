import { beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { TradingProvider, useTradingContext, type TradingContextValue } from "../TradingContext";
import {
	clearAllPaperPanelBindingsForTesting,
	getPaperPanelBinding,
	registerPaperPanelBinding,
} from "../PaperPanelRegistry";

function bars() {
	return [
		{ open: 128200, high: 128600, low: 127800, close: 128200, volume: 0, date: new Date(1000) },
		{ open: 128200, high: 128700, low: 127900, close: 128800, volume: 0, date: new Date(2000) },
	];
}

describe("PaperPanelRegistry (P1-S1)", () => {
	let containers: HTMLDivElement[] = [];
	let roots: ReturnType<typeof createRoot>[] = [];

	const mount = async (chartId: string, symbol = "FPT", slot?: { current: TradingContextValue | null }) => {
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
				<TradingProvider symbol={symbol} bars={bars()} chartId={chartId}>
					<Probe />
				</TradingProvider>,
			);
		});
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

	it("2 cells đăng ký 2 bindings độc lập", async () => {
		await mount("chart-a", "FPT");
		await mount("chart-b", "VNM");
		expect(getPaperPanelBinding("chart-a")?.symbol).toBe("FPT");
		expect(getPaperPanelBinding("chart-b")?.symbol).toBe("VNM");
		expect(getPaperPanelBinding("chart-a")).not.toBe(getPaperPanelBinding("chart-b"));
	});

	it("S2: placeOrder qua binding vào đúng broker của chart", async () => {
		await mount("chart-a", "FPT");
		const binding = getPaperPanelBinding("chart-a");
		expect(binding).toBeDefined();
		let placed: unknown = null;
		await act(async () => {
			placed = binding?.placeOrder({ symbol: "FPT", side: "buy", type: "limit", quantity: 100, price: 127000 });
		});
		expect((placed as { status?: string })?.status).toBe("working");
		expect(binding?.getSnapshot().orders.map((o) => o.symbol)).toContain("FPT");
	});

	it("place ở A chỉ hiện snapshot A, B rỗng", async () => {
		const slotA: { current: TradingContextValue | null } = { current: null };
		await mount("chart-a", "FPT", slotA);
		await mount("chart-b", "VNM");
		await act(async () => {
			slotA.current?.placeOrder({ symbol: "FPT", side: "buy", type: "market", quantity: 100 });
		});
		// Market khớp ở bar kế (fill-on-next-bar): working trước đã đủ cô lập.
		const snapA = getPaperPanelBinding("chart-a")?.getSnapshot();
		const snapB = getPaperPanelBinding("chart-b")?.getSnapshot();
		expect((snapA?.orderHistory.length ?? 0) + snapA!.positions.length).toBeGreaterThan(0);
		expect(snapB?.orderHistory).toHaveLength(0);
		expect(snapB?.positions).toHaveLength(0);
	});

	it("unmount gỡ binding; clear chặn rò rỉ giữa tests", async () => {
		await mount("chart-a", "FPT");
		expect(getPaperPanelBinding("chart-a")).toBeDefined();
		await act(async () => {
			roots.forEach((r) => r.unmount());
		});
		roots = [];
		expect(getPaperPanelBinding("chart-a")).toBeUndefined();
		registerPaperPanelBinding({
			chartId: "chart-z",
			symbol: "FPT",
			shared: false,
			getSnapshot: () => {
				throw new Error("unused");
			},
			closePosition: () => false,
			closeAllPositions: () => 0,
			reversePosition: () => {},
			cancelOrder: () => false,
			getOrders: () => [],
			resetAccount: () => {},
			placeOrder: () => {
				throw new Error("unused");
			},
			subscribe: () => () => {},
		});
		expect(getPaperPanelBinding("chart-z")).toBeDefined();
		clearAllPaperPanelBindingsForTesting();
		expect(getPaperPanelBinding("chart-z")).toBeUndefined();
	});

	it("late subscriber được notify khi binding đến (D8)", async () => {
		const spy = vi.fn();
		const { subscribePaperPanelRegistry } = await import("../PaperPanelRegistry");
		const off = subscribePaperPanelRegistry("chart-late", spy);
		try {
			expect(spy).not.toHaveBeenCalled();
			await mount("chart-late", "FPT");
			expect(spy).toHaveBeenCalled();
			expect(getPaperPanelBinding("chart-late")).toBeDefined();
		} finally {
			off();
		}
	});

	it("Q1a: 2 ô VN-Spot không provider ngoài → sổ độc lập (hết share M3)", async () => {
		const slotA: { current: TradingContextValue | null } = { current: null };
		const slotB: { current: TradingContextValue | null } = { current: null };
		await mount("chart-a", "FPT", slotA);
		await mount("chart-b", "VNM", slotB);
		await act(async () => {
			slotA.current?.placeOrder({ symbol: "FPT", side: "buy", type: "market", quantity: 100 });
		});
		// Không externalBroker: mỗi provider giữ broker cục bộ riêng.
		expect(slotA.current?.broker).not.toBe(slotB.current?.broker);
		const snapA = getPaperPanelBinding("chart-a")?.getSnapshot();
		const snapB = getPaperPanelBinding("chart-b")?.getSnapshot();
		expect(snapA?.orderHistory.length ?? 0).toBeGreaterThan(0);
		expect(snapB?.orderHistory).toHaveLength(0);
		expect(snapA?.account).not.toBe(snapB?.account);
	});
});
