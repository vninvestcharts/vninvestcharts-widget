// @vitest-environment jsdom
// DOCK_SSOT_B3 (S2) — AC1: mount mặc định single (`showDock !== false`, RD-02) +
// AC3: single adopt shell + policy D1 (desktop strip-only / restore / close-persist /
// mobile strip-only / pin persist).
// Harness: mount VNInvestCharts thật (pattern VNInvestCharts.csvExport.test.tsx);
// host nằm trong lazy + Suspense của RightDockRail -> chờ node bằng vòng act+flushMicrotasks.
// RED trước S2: cổng mount cũ `overlays.hasRightSidebar || renderRightPanel` = false khi
// không có panel nào -> dock vắng hoàn toàn (các test AC1-1/AC3 đỏ).
import { beforeAll, beforeEach, afterEach, describe, expect, it } from "vitest";
import { createElement } from "react";

import {
	CONTRACT_TIMEOUT,
	createAdapter,
	initializeTestImports,
	renderVNInvestCharts,
	clearEngineHostPropsHistory,
	flushMicrotasks,
	act,
} from "./utils";
import railStyles from "../styles/right-dock-rail.module.css";

// Persistence contract (RightSidebarDockHost:23-25) — literal là chủ ý: keys là
// hợp đồng quan sát được giữa các session (đổi key = phá dữ liệu người dùng).
const DOCK_TAB_KEY = "vnsc_dock_tab";
const DOCK_OPEN_KEY = "vnsc_dock_open";
const DOCK_PIN_KEY = "vnsc_dock_pinned";

/** Real-timer tick trong act — dynamic import của lazy host cần macrotask, không chỉ microtask. */
async function settle(rounds = 4) {
	await act(async () => {
		for (let i = 0; i < rounds; i += 1) {
			await flushMicrotasks();
			await new Promise((resolve) => setTimeout(resolve, 15));
		}
	});
}

/** Chờ node lazy resolve; trả null nếu sau ~2s vẫn vắng (đủ để kết luận absent). */
async function findNode(
	container: HTMLDivElement,
	testId: string,
	rounds = 60,
): Promise<HTMLElement | null> {
	for (let i = 0; i < rounds; i += 1) {
		const found = container.querySelector(`[data-testid="${testId}"]`) as HTMLElement | null;
		if (found) return found;
		await settle(2);
	}
	return null;
}

/**
 * Mount full VNInvestCharts, defaults cô lập QUYẾT ĐỊNH MOUNT:
 * - `showDrawingDock: false` — tắt tín hiệu drawing-dock cũ khỏi memo `hasRightSidebar`.
 * - `dockTierGate: false` — mở gate full-rank (bypass hợp lệ, cùng kênh `renderRightPanel`);
 *   `effectiveToolbarTier` thật trong harness là fail-closed "none" và `debugTier` CỐ TÌNH
 *   không đụng nó (H0.9) — tier test riêng, không phải việc của file này.
 */
async function mount(extra: Record<string, unknown> = {}) {
	const adapter = createAdapter(Promise.resolve([]), "dock-default");
	return renderVNInvestCharts({
		adapter: adapter as never,
		symbol: "DOCKTEST",
		timeframe: "1D" as never,
		locale: "en",
		showHeader: true,
		showDrawingDock: false,
		dockTierGate: false,
		debugTier: "pro",
		...extra,
	});
}

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof import("react-dom/client").createRoot> | null = null;

beforeAll(async () => {
	await initializeTestImports();
}, 30_000);

beforeEach(() => {
	window.localStorage.clear();
	document.documentElement.lang = "en";
	clearEngineHostPropsHistory();
});

afterEach(async () => {
	if (root) {
		await act(async () => {
			await flushMicrotasks();
			root!.unmount();
			await flushMicrotasks();
		});
	}
	root = null;
	container?.remove();
	container = null;
	window.localStorage.clear();
});

async function mountTracked(extra: Record<string, unknown> = {}) {
	const result = await mount(extra);
	container = result.container;
	root = result.root;
	return result;
}

describe("AC1 — mount mặc định single (RD-02: showDock !== false)", () => {
	it("showDock undefined -> dock hiện (strip)", { timeout: CONTRACT_TIMEOUT }, async () => {
		const result = await mountTracked();
		const tab = await findNode(result.container, "dock-tab-watchlist");
		expect(tab, "strip phải hiện khi showDock undefined (mount mặc định)").not.toBeNull();
	});

	it("showDock=false -> không mount (fail-closed tường minh)", { timeout: CONTRACT_TIMEOUT }, async () => {
		const result = await mountTracked({ showDock: false });
		await settle(8);
		expect(result.container.querySelector('[data-testid="dock-tab-watchlist"]')).toBeNull();
		expect(result.container.querySelector('[role="complementary"]')).toBeNull();
	});

	it("showDock=true -> hiện (control cùng kênh, không vacuous)", { timeout: CONTRACT_TIMEOUT }, async () => {
		const result = await mountTracked({ showDock: true });
		const tab = await findNode(result.container, "dock-tab-watchlist");
		expect(tab).not.toBeNull();
	});

	it("legacy signal: chỉ showTapePanel, showDock undefined -> hiện (case cũ được giữ)", { timeout: CONTRACT_TIMEOUT }, async () => {
		const result = await mountTracked({ showTapePanel: true, tapeEntries: [] });
		const tab = await findNode(result.container, "dock-tab-watchlist");
		expect(tab).not.toBeNull();
	});

	it("renderRightPanel (object-form) + tier free -> full dock (custom panel mở gate)", { timeout: CONTRACT_TIMEOUT }, async () => {
		const result = await mountTracked({
			debugTier: "free",
			renderRightPanel: () => createElement("div", { "data-testid": "rp-marker" }),
		});
		const tab = await findNode(result.container, "dock-tab-watchlist");
		expect(tab, "customPanelNode != null -> gate tắt -> full bất kể tier").not.toBeNull();
	});
});

describe("AC3 — single adopt shell + policy D1", () => {
	it("D1-restore: persist tab+open -> panel mở đúng waitlist khi mount", { timeout: CONTRACT_TIMEOUT }, async () => {
		window.localStorage.setItem(DOCK_TAB_KEY, "watchlist");
		window.localStorage.setItem(DOCK_OPEN_KEY, "true");
		const result = await mountTracked();
		const close = await findNode(result.container, "dock-panel-close");
		expect(close, "persisted open=true -> panel mở").not.toBeNull();
		const tab = result.container.querySelector('[data-testid="dock-tab-watchlist"]');
		expect(tab?.getAttribute("aria-pressed")).toBe("true");
	});

	it("D1-close-persist: click X -> open=false; remount vẫn đóng", { timeout: CONTRACT_TIMEOUT }, async () => {
		const result = await mountTracked();
		const tab = await findNode(result.container, "dock-tab-watchlist");
		await act(async () => {
			tab!.click();
			await flushMicrotasks();
		});
		const close = await findNode(result.container, "dock-panel-close");
		expect(close, "click tab -> panel mở (controlled qua rail)").not.toBeNull();
		await act(async () => {
			close!.click();
			await flushMicrotasks();
		});
		expect(window.localStorage.getItem(DOCK_OPEN_KEY)).toBe("false");
		await settle(4);
		expect(result.container.querySelector('[data-testid="dock-panel-close"]')).toBeNull();

		await act(async () => {
			await result.unmount();
		});
		result.container.remove();
		container = null;
		root = null;

		const again = await mountTracked();
		const tab2 = await findNode(again.container, "dock-tab-watchlist");
		expect(tab2, "remount -> strip vẫn hiện").not.toBeNull();
		expect(again.container.querySelector('[data-testid="dock-panel-close"]')).toBeNull();
	});

	it("D1-mobile: strip-only kể cả khi persist open; không pin toggle", { timeout: CONTRACT_TIMEOUT }, async () => {
		window.localStorage.setItem(DOCK_TAB_KEY, "watchlist");
		window.localStorage.setItem(DOCK_OPEN_KEY, "true");
		const result = await mountTracked({ isMobile: true });
		const tab = await findNode(result.container, "dock-tab-watchlist");
		expect(tab, "mobile: strip hiện").not.toBeNull();
		expect(result.container.querySelector('[data-testid="dock-panel-close"]')).toBeNull();
		expect(result.container.querySelector('[data-testid="dock-pin-toggle"]')).toBeNull();
	});

	it("Pin: click pin -> wrapper pinned + persist; remount giữ pinned", { timeout: CONTRACT_TIMEOUT }, async () => {
		const result = await mountTracked();
		const tab = await findNode(result.container, "dock-tab-watchlist");
		await act(async () => {
			tab!.click();
			await flushMicrotasks();
		});
		const pin = await findNode(result.container, "dock-pin-toggle");
		expect(pin, "desktop open -> pin toggle hiện").not.toBeNull();
		await act(async () => {
			pin!.click();
			await flushMicrotasks();
		});
		const wrapper = result.container.querySelector('[role="complementary"]') as HTMLElement | null;
		expect(wrapper?.classList.contains(railStyles.workspaceDockPinned)).toBe(true);
		expect(window.localStorage.getItem(DOCK_PIN_KEY)).toBe("1");

		await act(async () => {
			await result.unmount();
		});
		result.container.remove();
		container = null;
		root = null;

		const again = await mountTracked();
		await findNode(again.container, "dock-tab-watchlist");
		await settle(2);
		const wrapper2 = again.container.querySelector('[role="complementary"]') as HTMLElement | null;
		expect(wrapper2?.classList.contains(railStyles.workspaceDockPinned)).toBe(true);
	});
});
