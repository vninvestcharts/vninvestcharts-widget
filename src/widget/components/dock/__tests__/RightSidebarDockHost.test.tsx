// @vitest-environment jsdom
// P4a regression lock: dock strip tabs, panel switching, alerts action,
// collapse toggle, watchlist placeholder.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { RightSidebarDockHost } from "../RightSidebarDockHost";

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

beforeEach(() => {
	window.localStorage.removeItem("vnsc_dock_tab");
	window.localStorage.removeItem("vnsc_dock_open");
	window.localStorage.removeItem("vnsc_dock_width");
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

const baseProps = {
	width: 280,
	isResizing: false,
	onSplitterPointerDown: () => {},
	symbol: "HPG",
	timeframe: "1D",
	datum: { date: new Date("2026-01-05"), open: 10, high: 11, low: 9.5, close: 10.5, volume: 1000 },
};

function stripButtons(): HTMLButtonElement[] {
	const strip = container?.querySelector('[role="toolbar"]');
	return Array.from(strip?.querySelectorAll("button") ?? []) as HTMLButtonElement[];
}

describe("RightSidebarDockHost", () => {
	it("shows strip with data window by default", () => {
		act(() => { root?.render(createElement(RightSidebarDockHost, { ...baseProps })); });
		expect(stripButtons().length).toBeGreaterThan(0);
		expect(container?.textContent).toContain("HPG");
	});
	it("switches panel content when clicking strip tabs", () => {
		const onAlertsOpen = vi.fn();
		act(() => { root?.render(createElement(RightSidebarDockHost, { ...baseProps, onAlertsOpen, drawingDockNode: createElement("div", { id: "objects-marker" }) })); });
		const buttons = stripButtons();
		const objectsBtn = buttons[buttons.length - 1];
		act(() => { objectsBtn?.click(); });
		expect(container?.querySelector("#objects-marker")).not.toBeNull();
	});
	it("alerts tab fires callback without switching panel", () => {
		const onAlertsOpen = vi.fn();
		act(() => { root?.render(createElement(RightSidebarDockHost, { ...baseProps, onAlertsOpen })); });
		const before = container?.textContent;
		const buttons = stripButtons();
		const alertsBtn = buttons[1];
		act(() => { alertsBtn?.click(); });
		expect(onAlertsOpen).toHaveBeenCalledTimes(1);
		expect(container?.textContent).toBe(before);
	});

	it("D1: X closes panel but keeps strip (P4a-08 dead-end fix)", () => {
		act(() => { root?.render(createElement(RightSidebarDockHost, { ...baseProps, drawingDockNode: createElement("div", { id: "objects-marker" }) })); });
		expect(container?.querySelector("#objects-marker") ?? container?.textContent).toBeDefined();
		const closeBtn = container?.querySelector('[data-testid="dock-panel-close"]') as HTMLButtonElement;
		expect(closeBtn).not.toBeNull();
		act(() => { closeBtn?.click(); });
		// Panel gone, strip still mounted.
		expect(container?.querySelector('[data-testid="dock-panel-close"]')).toBeNull();
		expect(stripButtons().length).toBeGreaterThan(0);
		expect(window.localStorage.getItem("vnsc_dock_open")).toBe("false");
	});

	it("D1: clicking the open tab toggles closed, clicking again reopens", () => {
		act(() => { root?.render(createElement(RightSidebarDockHost, { ...baseProps })); });
		const watchBtn = container?.querySelector('[data-testid="dock-tab-watchlist"]') as HTMLButtonElement;
		act(() => { watchBtn?.click(); });
		expect(window.localStorage.getItem("vnsc_dock_open")).toBe("true");
		expect(window.localStorage.getItem("vnsc_dock_tab")).toBe("watchlist");
		act(() => { watchBtn?.click(); });
		expect(window.localStorage.getItem("vnsc_dock_open")).toBe("false");
		expect(container?.querySelector('[data-testid="dock-panel-close"]')).toBeNull();
	});

	it("D1: restores persisted tab+open on mount, ignores unknown tab", () => {
		window.localStorage.setItem("vnsc_dock_tab", "watchlist");
		window.localStorage.setItem("vnsc_dock_open", "true");
		act(() => { root?.render(createElement(RightSidebarDockHost, { ...baseProps })); });
		expect((container?.querySelector('[data-testid="dock-tab-watchlist"]') as HTMLButtonElement)?.getAttribute("aria-pressed")).toBe("true");
	});

	it("D1: unknown persisted tab falls back to default, closed stays closed", () => {
		window.localStorage.setItem("vnsc_dock_tab", "nope");
		window.localStorage.setItem("vnsc_dock_open", "false");
		act(() => { root?.render(createElement(RightSidebarDockHost, { ...baseProps })); });
		expect(container?.querySelector('[data-testid="dock-panel-close"]')).toBeNull();
		expect(stripButtons().length).toBeGreaterThan(0);
	});

	it("D5: tab change in one host syncs another host on the same page", () => {
		const containerB = document.createElement("div");
		document.body.appendChild(containerB);
		const rootB = createRoot(containerB);
		try {
			act(() => { root?.render(createElement(RightSidebarDockHost, { ...baseProps })); });
			act(() => { rootB.render(createElement(RightSidebarDockHost, { ...baseProps })); });
			const watchBtnA = container?.querySelector('[data-testid="dock-tab-watchlist"]') as HTMLButtonElement;
			act(() => { watchBtnA?.click(); });
			const watchBtnB = containerB.querySelector('[data-testid="dock-tab-watchlist"]') as HTMLButtonElement;
			expect(watchBtnB?.getAttribute("aria-pressed")).toBe("true");
		} finally {
			act(() => { rootB.unmount(); });
			containerB.remove();
		}
	});

	it("D5: remote unknown tab falls back locally without crashing", () => {
		act(() => { root?.render(createElement(RightSidebarDockHost, { ...baseProps })); });
		act(() => {
			window.dispatchEvent(new CustomEvent("vnsc_dock_tab", { detail: { tab: "tape", open: true } }));
		});
		// No tape tab here → falls back to default, strip intact.
		expect(stripButtons().length).toBeGreaterThan(0);
		expect(container?.querySelector('[data-testid="dock-panel-close"]')).not.toBeNull();
	});

	it("closed dock collapses to 40px strip (no dead void, chart reclaims width)", () => {
		window.localStorage.setItem("vnsc_dock_tab", "watchlist");
		window.localStorage.setItem("vnsc_dock_open", "false");
		act(() => { root?.render(createElement(RightSidebarDockHost, { ...baseProps })); });
		const strip = container?.querySelector('[role="toolbar"]') as HTMLElement;
		const dockRoot = strip?.parentElement?.parentElement as HTMLElement;
		expect(dockRoot?.style.width).toBe("40px");
		// Reopen restores persisted width.
		const watchBtn = container?.querySelector('[data-testid="dock-tab-watchlist"]') as HTMLButtonElement;
		act(() => { watchBtn?.click(); });
		expect(dockRoot?.style.width).toBe("280px");
	});

	it("watchlist rows show company names (VN30 fallback)", () => {
		act(() => { root?.render(createElement(RightSidebarDockHost, { ...baseProps })); });
		const watchBtn = container?.querySelector('[data-testid="dock-tab-watchlist"]') as HTMLButtonElement;
		act(() => { watchBtn?.click(); });
		expect(container?.textContent).toContain("Vingroup");
		expect(container?.textContent).toContain("Vietcombank");
	});

	it("shows disabled tabs with reasons instead of hiding them", () => {
		act(() => { root?.render(createElement(RightSidebarDockHost, { ...baseProps })); });
		// All 7 menu entries render, even without tape/advisory/drawings data.
		for (const id of ["watchlist", "dataWindow", "objects", "tape", "advisory", "orderTicket"]) {
			expect(container?.querySelector(`[data-testid="dock-tab-${id}"]`)).not.toBeNull();
		}
		const tapeBtn = container?.querySelector('[data-testid="dock-tab-tape"]') as HTMLButtonElement;
		expect(tapeBtn?.getAttribute("aria-disabled")).toBe("true");
		expect(tapeBtn?.title).toContain("tape");
		// Clicking a disabled tab is a no-op (panel stays on current tab).
		act(() => { tapeBtn?.click(); });
		expect(container?.querySelector('[data-testid="dock-panel-close"]')).not.toBeNull();
	});

	it("splitter shows only when the panel is open", () => {
		act(() => { root?.render(createElement(RightSidebarDockHost, { ...baseProps })); });
		expect(container?.querySelector('[data-testid="dock-splitter"]')).not.toBeNull();
		const watchBtn = container?.querySelector('[data-testid="dock-tab-watchlist"]') as HTMLButtonElement;
		act(() => { watchBtn?.click(); });
		act(() => { watchBtn?.click(); });
		expect(container?.querySelector('[data-testid="dock-panel-close"]')).toBeNull();
		expect(container?.querySelector('[data-testid="dock-splitter"]')).toBeNull();
	});

	it("D3: strip arrows move focus, Escape closes panel", () => {
		act(() => { root?.render(createElement(RightSidebarDockHost, { ...baseProps })); });
		const strip = container?.querySelector('[role="toolbar"]') as HTMLElement;
		const buttons = stripButtons();
		expect(buttons.length).toBeGreaterThanOrEqual(2);
		buttons[0]?.focus();
		act(() => {
			strip.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
		});
		expect(document.activeElement).toBe(buttons[1]);
		expect(container?.querySelector('[data-testid="dock-panel-close"]')).not.toBeNull();
		act(() => {
			strip.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
		});
		expect(container?.querySelector('[data-testid="dock-panel-close"]')).toBeNull();
	});
});

describe("RightSidebarDockHost controlled mode (E1 workspace hover-pin)", () => {
	function renderControlled(extra: Record<string, unknown> = {}, onOpenTabChange = vi.fn()) {
		act(() => {
			root?.render(createElement(RightSidebarDockHost, { ...baseProps, openTab: null, onOpenTabChange, ...extra }));
		});
		return onOpenTabChange;
	}

	it("openTab=null renders strip-only even with default-open LS", () => {
		renderControlled();
		expect(container?.querySelector('[data-testid="dock-panel-close"]')).toBeNull();
		expect(container?.querySelector('[data-testid="dock-tab-watchlist"]')).not.toBeNull();
	});

	it("openTab opens the requested panel", () => {
		renderControlled({ openTab: "watchlist" });
		expect(container?.querySelector('[data-testid="dock-panel-close"]')).not.toBeNull();
		expect(container?.querySelector('[data-testid="dock-tab-watchlist"]')?.getAttribute("aria-pressed")).toBe("true");
	});

	it("click reports via callback without internal state change", () => {
		const cb = renderControlled({ openTab: "watchlist" });
		const dwBtn = container?.querySelector('[data-testid="dock-tab-dataWindow"]') as HTMLButtonElement;
		act(() => { dwBtn?.click(); });
		expect(cb).toHaveBeenCalledWith("dataWindow", { sticky: true });
		// Không setState nội bộ: panel vẫn watchlist cho tới khi parent đổi prop.
		expect(container?.querySelector('[data-testid="dock-tab-watchlist"]')?.getAttribute("aria-pressed")).toBe("true");
	});

	it("disabled controlled tab falls back to defaultTab", () => {
		renderControlled({ openTab: "tape" });
		// tape không data → fallback dataWindow (datum có sẵn trong baseProps).
		expect(container?.textContent).toContain("HPG");
	});

	it("pin toggle hidden by default, works with showPinToggle", () => {
		renderControlled({ openTab: "watchlist" });
		expect(container?.querySelector('[data-testid="dock-pin-toggle"]')).toBeNull();
		const onPinChange = vi.fn();
		renderControlled({ openTab: "watchlist", showPinToggle: true, pinned: false, onPinChange });
		const pinBtn = container?.querySelector('[data-testid="dock-pin-toggle"]') as HTMLButtonElement;
		expect(pinBtn).not.toBeNull();
		expect(pinBtn?.getAttribute("aria-pressed")).toBe("false");
		act(() => { pinBtn?.click(); });
		expect(onPinChange).toHaveBeenCalledWith(true);
	});

	it("D5 in controlled mode routes via callback (no setState fight)", () => {
		const cb = renderControlled({ openTab: "watchlist" });
		act(() => {
			window.dispatchEvent(new CustomEvent("vnsc_dock_tab", { detail: { tab: "dataWindow", open: true } }));
		});
		expect(cb).toHaveBeenCalledWith("dataWindow", { sticky: false });
		expect(container?.querySelector('[data-testid="dock-tab-watchlist"]')?.getAttribute("aria-pressed")).toBe("true");
	});

	it("F2: pin button sits adjacent to Close (same actions group)", () => {
		renderControlled({ openTab: "watchlist", showPinToggle: true, pinned: false, onPinChange: () => {} });
		const pinBtn = container?.querySelector('[data-testid="dock-pin-toggle"]');
		const closeBtn = container?.querySelector('[data-testid="dock-panel-close"]');
		expect(pinBtn).not.toBeNull();
		expect(pinBtn?.nextElementSibling).toBe(closeBtn);
	});

	it("D-A9: Escape in controlled mode reports close (sticky false)", () => {
		const cb = renderControlled({ openTab: "watchlist" });
		const strip = container?.querySelector('[role="toolbar"]') as HTMLElement;
		act(() => {
			strip.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
		});
		expect(cb).toHaveBeenCalledWith(null, { sticky: false });
		// Không setState nội bộ: panel vẫn mở cho tới khi parent đổi prop.
		expect(container?.querySelector('[data-testid="dock-panel-close"]')).not.toBeNull();
	});

	// RD-10 (DOCK_SSOT_B3): stacked nodes (customPanel/paper) chỉ render khi dock MỞ —
	// trước fix chúng render bất kể `effectiveTab`, bị nhét vào wrapper 40px khi đóng
	// (clip vô hình nhưng vẫn tốn layout/render; đo staging Deploy A 2026-10-19:
	// node hiện diện khi đóng, ép 40px).
	it("RD-10 đóng (openTab=null): customPanelNode KHÔNG có trong DOM (trước fix: luôn render)", () => {
		renderControlled({ customPanelNode: createElement("div", { "data-testid": "stacked-marker" }) });
		expect(container?.querySelector('[data-testid="dock-panel-close"]')).toBeNull();
		expect(container?.querySelector('[data-testid="stacked-marker"]')).toBeNull();
	});

	it("RD-10 mở (openTab=watchlist): paperTradePanelNode vẫn render trong stacked (control chống over-removal)", () => {
		renderControlled({
			openTab: "watchlist",
			paperTradePanelNode: createElement("div", { "data-testid": "stacked-marker" }),
		});
		expect(container?.querySelector('[data-testid="dock-panel-close"]')).not.toBeNull();
		expect(container?.querySelector('[data-testid="stacked-marker"]')).not.toBeNull();
	});
});
