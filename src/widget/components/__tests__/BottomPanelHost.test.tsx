// @vitest-environment jsdom
// UI-D2 regression lock: flexible bottom-panel height (no hardcoded 300px).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";

// The two panels are now `lazy(() => import("./panels/<file>"))` (BL-15), so the mock must name
// the DIRECT module specifiers. Mocking the old `../panels` barrel no longer intercepts anything —
// the barrel was deleted with the duplicate panel copies it re-exported.
vi.mock("../panels/StrategyTesterPanel", () => ({
	StrategyTesterPanel: () => createElement("div", { "data-testid": "panel-strategy" }),
}));
vi.mock("../panels/PineEditorPanel", () => ({
	PineEditorPanel: () => createElement("div", { "data-testid": "panel-pine" }),
}));

import { BottomPanelHost } from "../BottomPanelHost";
import { useBottomPanelHeight } from "../../hooks/useBottomPanelHeight";

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(() => {
	if (root) act(() => { root?.unmount(); });
	root = null;
	container?.remove();
	container = null;
});

function renderHost() {
	act(() => {
		root?.render(
			createElement(BottomPanelHost, {
				activeTab: "pine_editor",
				onTabChange: () => {},
				plotData: [],
				symbol: "BTCUSDT",
				timeframe: "1h",
				activeIndicators: [],
				isDark: true,
			}),
		);
	});
}

describe("BottomPanelHost flexible height (UI-D2)", () => {
	it("uses min-height + CSS var height instead of a fixed 300px", () => {
		renderHost();
		const host = container?.querySelector('[data-vnsc-bottom-panel="host"]') as HTMLElement | null;
		expect(host).not.toBeNull();
		expect(host?.style.minHeight).toBe("200px");
		expect(host?.style.height).toBe("var(--vnsc-bottom-panel-height, 260px)");
		expect(host?.style.height).not.toBe("300px");
	});

	it("renders splitter handle when panelHeight api provided (and not otherwise)", () => {
		renderHost();
		expect(container?.querySelector('[data-testid="bottom-panel-splitter"]')).toBeNull();
		act(() => {
			root?.render(
				createElement(BottomPanelHost, {
					activeTab: "pine_editor",
					onTabChange: () => {},
					plotData: [],
					symbol: "BTCUSDT",
					timeframe: "1h",
					activeIndicators: [],
					isDark: true,
					panelHeight: {
						heightPx: 260,
						resizeBy: () => {},
						resizeTo: () => {},
						nudge: () => {},
						reset: () => {},
					},
				}),
			);
		});
		const splitter = container?.querySelector('[data-testid="bottom-panel-splitter"]') as HTMLElement | null;
		expect(splitter).not.toBeNull();
		expect(splitter?.getAttribute("role")).toBe("separator");
		expect((splitter?.getAttribute("aria-label") ?? "").length).toBeGreaterThan(0);
	});

	it("dragging splitter resizes host; double-click resets", () => {
		function HostWithHeight() {
			const api = useBottomPanelHeight();
			return createElement(BottomPanelHost, {
				activeTab: "pine_editor",
				onTabChange: () => {},
				plotData: [],
				symbol: "BTCUSDT",
				timeframe: "1h",
				activeIndicators: [],
				isDark: true,
				panelHeight: api,
			});
		}
		act(() => {
			root?.render(createElement(HostWithHeight));
		});
		const host = () => container?.querySelector('[data-vnsc-bottom-panel="host"]') as HTMLElement | null;
		const splitter = () => container?.querySelector('[data-testid="bottom-panel-splitter"]') as HTMLElement | null;
		expect(host()?.style.height).toBe("260px");
		act(() => {
			splitter()?.dispatchEvent(new window.MouseEvent("pointerdown", { bubbles: true, clientY: 300 }));
		});
		act(() => {
			window.dispatchEvent(new window.MouseEvent("pointermove", { bubbles: true, clientY: 250 }));
		});
		act(() => {
			window.dispatchEvent(new window.MouseEvent("pointermove", { bubbles: true, clientY: 200 }));
		});
		act(() => {
			window.dispatchEvent(new window.MouseEvent("pointerup", { bubbles: true }));
		});
		// Absolute-from-origin: 300 -> 200 = +100 -> 360px, commit 1 lần lúc thả.
		// Preview giữa chừng đã ghi thẳng DOM (310px sau move đầu).
		expect(host()?.style.height).toBe("360px");
		act(() => {
			splitter()?.dispatchEvent(new window.MouseEvent("dblclick", { bubbles: true }));
		});
		expect(host()?.style.height).toBe("260px");
	});

	it("drag mượt kiểu grid: preview trực tiếp DOM, persist đúng 1 lần lúc thả", () => {
		window.localStorage.clear();
		const setSpy = vi.spyOn(Storage.prototype, "setItem");
		function HostWithHeight() {
			const api = useBottomPanelHeight();
			return createElement(BottomPanelHost, {
				activeTab: "pine_editor",
				onTabChange: () => {},
				plotData: [],
				symbol: "BTCUSDT",
				timeframe: "1h",
				activeIndicators: [],
				isDark: true,
				panelHeight: api,
			});
		}
		act(() => {
			root?.render(createElement(HostWithHeight));
		});
		try {
			const host = () => container?.querySelector('[data-vnsc-bottom-panel="host"]') as HTMLElement | null;
			const splitter = () => container?.querySelector('[data-testid="bottom-panel-splitter"]') as HTMLElement | null;
			setSpy.mockClear();
			act(() => {
				splitter()?.dispatchEvent(new window.MouseEvent("pointerdown", { bubbles: true, clientY: 400 }));
			});
			// 3 moves: preview phải nhảy theo chuột ngay (không chờ commit)...
			act(() => {
				window.dispatchEvent(new window.MouseEvent("pointermove", { bubbles: true, clientY: 350 }));
			});
			expect(host()?.style.height).toBe("310px");
			act(() => {
				window.dispatchEvent(new window.MouseEvent("pointermove", { bubbles: true, clientY: 300 }));
				window.dispatchEvent(new window.MouseEvent("pointermove", { bubbles: true, clientY: 250 }));
			});
			expect(host()?.style.height).toBe("410px");
			// ...nhưng chưa persist lần nào giữa chừng (0 render/commit giữa drag).
			expect(setSpy).not.toHaveBeenCalled();
			act(() => {
				window.dispatchEvent(new window.MouseEvent("pointerup", { bubbles: true }));
			});
			expect(host()?.style.height).toBe("410px");
			expect(setSpy).toHaveBeenCalledTimes(1);
			expect(setSpy).toHaveBeenCalledWith("vnsc_bottomPanelHeight", "410");
		} finally {
			setSpy.mockRestore();
		}
	});

	it("pointercancel revert về chiều cao lúc bắt đầu kéo", () => {
		window.localStorage.clear();
		function HostWithHeight() {
			const api = useBottomPanelHeight();
			return createElement(BottomPanelHost, {
				activeTab: "pine_editor",
				onTabChange: () => {},
				plotData: [],
				symbol: "BTCUSDT",
				timeframe: "1h",
				activeIndicators: [],
				isDark: true,
				panelHeight: api,
			});
		}
		act(() => {
			root?.render(createElement(HostWithHeight));
		});
		const host = () => container?.querySelector('[data-vnsc-bottom-panel="host"]') as HTMLElement | null;
		const splitter = () => container?.querySelector('[data-testid="bottom-panel-splitter"]') as HTMLElement | null;
		act(() => {
			splitter()?.dispatchEvent(new window.MouseEvent("pointerdown", { bubbles: true, clientY: 400 }));
		});
		act(() => {
			window.dispatchEvent(new window.MouseEvent("pointermove", { bubbles: true, clientY: 300 }));
		});
		expect(host()?.style.height).toBe("360px");
		act(() => {
			window.dispatchEvent(new window.MouseEvent("pointercancel", { bubbles: true }));
		});
		expect(host()?.style.height).toBe("260px");
	});

	it("renders nothing when no tab or panel is active", () => {
		act(() => {
			root?.render(
				createElement(BottomPanelHost, {
					activeTab: null,
					onTabChange: () => {},
					plotData: [],
					symbol: "BTCUSDT",
					timeframe: "1h",
					activeIndicators: [],
					isDark: true,
				}),
			);
		});
		expect(container?.querySelector('[data-vnsc-bottom-panel="host"]')).toBeNull();
	});
});

// P1 (2026-10-12): multi-chart renders these panels through BottomPanelHost, which had
// NO tier gate — while single-chart gates the same two surfaces in VNInvestCharts.tsx
// (:2677 strategy_tester, :2694 pine_editor). A free user could open both by clicking
// the multi-chart footer tab. The grant now arrives as a prop from the host's own
// `patTier`, and the DEFAULT is fail-closed (locked), so a future call site that
// forgets to pass it cannot leak the feature again.
describe("BottomPanelHost tier gate (fail-closed)", () => {
	/**
	 * Renders a tab. The two Pro panels are `lazy()`, so a granted tab resolves its chunk on a
	 * microtask/macrotask boundary — callers that assert on the panel must `await`. The locked
	 * cases render `<LockedFeature>` synchronously and never suspend, so they stay sync.
	 */
	async function renderTab(tab: "pine_editor" | "strategy_tester", grants: Record<string, boolean> = {}) {
		await act(async () => {
			root?.render(
				createElement(BottomPanelHost, {
					activeTab: tab,
					onTabChange: () => {},
					plotData: [],
					symbol: "BTCUSDT",
					timeframe: "1h",
					activeIndicators: [],
					isDark: true,
					...grants,
				} as never),
			);
		});
	}
	const panel = () => container?.querySelector('[data-testid^="panel-"]');
	const lock = () => container?.querySelector(".vnsc-locked-feature");

	it("pine_editor: no grant => locked badge, no panel", () => {
		act(() => {
			root?.render(
				createElement(BottomPanelHost, {
					activeTab: "pine_editor",
					onTabChange: () => {},
					plotData: [],
					symbol: "BTCUSDT",
					timeframe: "1h",
					activeIndicators: [],
					isDark: true,
				} as never),
			);
		});
		expect(panel()).toBeNull();
		expect(lock()?.getAttribute("data-capability")).toBe("pine_editor");
	});

	it("pine_editor: granted => real panel", async () => {
		await renderTab("pine_editor", { canUsePineEditor: true });
		expect(panel()?.getAttribute("data-testid")).toBe("panel-pine");
		expect(lock()).toBeNull();
	});

	it("strategy_tester: no grant => locked badge, no panel", () => {
		act(() => {
			root?.render(
				createElement(BottomPanelHost, {
					activeTab: "strategy_tester",
					onTabChange: () => {},
					plotData: [],
					symbol: "BTCUSDT",
					timeframe: "1h",
					activeIndicators: [],
					isDark: true,
				} as never),
			);
		});
		expect(panel()).toBeNull();
		expect(lock()?.getAttribute("data-capability")).toBe("strategy_tester");
	});

	it("strategy_tester: granted => real panel", async () => {
		await renderTab("strategy_tester", { canUseStrategyTester: true });
		expect(panel()?.getAttribute("data-testid")).toBe("panel-strategy");
		expect(lock()).toBeNull();
	});
});
