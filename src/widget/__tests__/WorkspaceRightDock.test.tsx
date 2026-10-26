// @vitest-environment jsdom
// W1 (P4 Workspace Shared Right Dock, Option A): 1 host toàn workspace,
// cells không dock riêng, nội dung theo active chart, persist tab.
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { VNInvestMultiCharts } from "../VNInvestMultiCharts";
import { createAdapter, forkRuntimeData, flushMicrotasks } from "./utils";
import layoutStyles from "../styles/multicharts-layout.module.css";
// DOCK_SSOT_B3: shell rule (workspaceDock*) đã dời sang right-dock-rail.module.css
// (file mới của RightDockRail). Chỉ `workspaceBody/workspaceMainCol` còn lại file cũ.
import railStyles from "../styles/right-dock-rail.module.css";
import { SaaSFeatureContext } from "../contexts/SaaSFeatureContext";
import type { SaaSFeatureContextValue, SaaSFeatureFlags, TenantMetadata } from "../types/saas";

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

beforeEach(() => {
	window.localStorage.clear();
	container = document.createElement("div");
	container.style.width = "1200px";
	container.style.height = "720px";
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(async () => {
	if (root) {
		await act(async () => {
			await flushMicrotasks();
			root?.unmount();
			await flushMicrotasks();
		});
	}
	root = null;
	container?.remove();
	container = null;
	window.localStorage.clear();
});

const CHARTS = [
	{ id: "c1", symbol: "HPG", timeframe: "1D" },
	{ id: "c2", symbol: "VIC", timeframe: "1D" },
];

async function renderMulti(extraProps: Record<string, unknown> = {}) {
	const adapter = createAdapter(Promise.resolve(forkRuntimeData as never[]), "ws-dock");
	await act(async () => {
		root?.render(createElement(VNInvestMultiCharts as never, {
			charts: CHARTS,
			layout: { rows: 2, cols: 1 },
			// W1: force full dock, deterministic bất kể tier (mirror single D6 opt-out).
			dockTierGate: false,
			defaultChartProps: { adapter, engineRuntime: "fork" },
			...extraProps,
		} as never));
		await flushMicrotasks();
	});
}

async function waitFor(fn: () => boolean, label: string, tries = 400) {
	for (let i = 0; i < tries; i += 1) {
		if (fn()) return;
		await act(async () => {
			await new Promise((r) => setTimeout(r, 100));
			await flushMicrotasks();
		});
	}
	throw new Error(`timeout waiting: ${label}`);
}

// Dock strip = toolbar chứa dock-tab buttons (phân biệt với drawing/topbar toolbars).
function dockStripCount(): number {
	const toolbars = Array.from(container?.querySelectorAll('[role="toolbar"]') ?? []);
	return toolbars.filter((tb) => tb.querySelector('[data-testid^="dock-tab-"]')).length;
}

function cellDockTabCount(): number {
	const cells = Array.from(container?.querySelectorAll("[data-chart-id]") ?? []);
	return cells.reduce((n, c) => n + c.querySelectorAll('[data-testid^="dock-tab-"]').length, 0);
}

function stripEl(): HTMLElement | null {
	return container?.querySelector('[data-testid="dock-tab-watchlist"]')?.closest('[role="toolbar"]') as HTMLElement | null;
}

function hoverIn() {
	stripEl()?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
}

function hoverOut() {
	stripEl()?.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
}

function panelOpen(): boolean {
	return !!container?.querySelector('[data-testid="dock-panel-close"]');
}

describe("W1 workspace shared right dock", () => {
	it("mounts exactly 1 dock strip for 2 charts (cells dock-off)", { timeout: 120000 }, async () => {
		await renderMulti();
		await waitFor(() => dockStripCount() === 1, "1 workspace dock strip");
		expect(dockStripCount()).toBe(1);
		// Cells render nhưng không chứa dock-tab nào (dock duy nhất nằm ngoài cells).
		const cells = container?.querySelectorAll("[data-chart-id]") ?? [];
		expect(cells.length).toBeGreaterThanOrEqual(2);
		expect(cellDockTabCount()).toBe(0);
	});

	// DOCK_SSOT_B3 (S2-fix): single default-on KHÔNG được rò vào pane multi.
	// Đo staging Deploy B (2026-10-19): thiếu khoá ⇒ 5 wrapper rail (4 pane + 1
	// workspace), flyout pane bị pane content phủ. KHÔNG lock được bằng DOM ở
	// đây: jsdom không render dock region của pane (chỉ workspace rail xuất hiện —
	// thử `dockTierGate:false` trong defaultChartProps vẫn vắng) ⇒ lock ở SOURCE,
	// tại điểm render thật: GridContainer liệt kê prop tường minh nên khoá phải ở
	// đó (đặt ở mergedChartProps là khoá chết — Deploy B2 đã đo: vẫn 5 wrapper).
	// runtime proof = `verify-dock-b3` CONTROL trên staging (fail đúng khi rò).
	it("source lock: GridContainer pin showDock=false cho cell", () => {
		const src = readFileSync(path.resolve(__dirname, "../components/layout/GridContainer.tsx"), "utf8");
		expect(src).toMatch(/<VNInvestCharts[\s\S]{0,4000}showDock=\{false\}/);
	});

	it("showRightDock=false mounts no dock", { timeout: 120000 }, async () => {
		await renderMulti({ showRightDock: false });
		await act(async () => {
			await new Promise((r) => setTimeout(r, 2000));
			await flushMicrotasks();
		});
		expect(dockStripCount()).toBe(0);
		expect(cellDockTabCount()).toBe(0);
	});

	it("dock content follows the active chart (HPG -> VIC)", { timeout: 120000 }, async () => {
		await renderMulti();
		// E2: drawer strip-only lúc mount → click mở dataWindow (sticky) rồi theo dõi.
		const dwBtn0 = container?.querySelector('[data-testid="dock-tab-dataWindow"]') as HTMLButtonElement;
		await act(async () => { dwBtn0?.click(); await flushMicrotasks(); });
		// Tab mặc định = dataWindow (objects/tape/advisory disabled khi thiếu data).
		await waitFor(() => container?.textContent?.includes("HPG · 1D") ?? false, "dataWindow HPG");
		const cell2 = container?.querySelector('[data-chart-id="c2"]') as HTMLElement | null;
		expect(cell2).not.toBeNull();
		await act(async () => {
			cell2?.click();
			await flushMicrotasks();
		});
		await waitFor(() => container?.textContent?.includes("VIC · 1D") ?? false, "dataWindow VIC");
	});

	it("watchlist tab persists across remount (shared LS keys)", { timeout: 120000 }, async () => {
		await renderMulti();
		await waitFor(() => dockStripCount() === 1, "1 workspace dock strip");
		const watchBtn = container?.querySelector('[data-testid="dock-tab-watchlist"]') as HTMLButtonElement | null;
		expect(watchBtn).not.toBeNull();
		await act(async () => {
			watchBtn?.click();
			await flushMicrotasks();
		});
		expect(window.localStorage.getItem("vnsc_dock_tab")).toBe("watchlist");
		// Remount (LS giữ) → strip-only (R1), hover mở lại đúng tab đã lưu.
		await act(async () => {
			root?.unmount();
			await flushMicrotasks();
		});
		root = container ? createRoot(container) : null;
		await renderMulti();
		await waitFor(() => dockStripCount() === 1, "dock strip after remount");
		expect(panelOpen()).toBe(false);
		// F1: hover không mở (CSS slide only) → click mở tab đã persist.
		const watchBtn2 = container?.querySelector('[data-testid="dock-tab-watchlist"]') as HTMLButtonElement | null;
		await act(async () => { watchBtn2?.click(); await flushMicrotasks(); });
		await waitFor(() => panelOpen(), "click reopens persisted tab");
		expect(watchBtn2?.getAttribute("aria-pressed")).toBe("true");
	});

	it("W2: objects tab disabled with no drawings (bridge returns null)", { timeout: 120000 }, async () => {
		await renderMulti();
		await waitFor(() => dockStripCount() === 1, "1 workspace dock strip");
		const objectsBtn = container?.querySelector('[data-testid="dock-tab-objects"]') as HTMLButtonElement | null;
		expect(objectsBtn).not.toBeNull();
		expect(objectsBtn?.getAttribute("aria-disabled")).toBe("true");
	});

	it("S2: orderTicket tab opens shared order FORM (SSOT single), no positions duplication", { timeout: 120000 }, async () => {
		await renderMulti();
		await waitFor(() => dockStripCount() === 1, "1 workspace dock strip");
		const ticketBtn = container?.querySelector('[data-testid="dock-tab-orderTicket"]') as HTMLButtonElement | null;
		expect(ticketBtn).not.toBeNull();
		expect(ticketBtn?.getAttribute("aria-disabled")).not.toBe("true");
		await act(async () => {
			ticketBtn?.click();
			await flushMicrotasks();
		});
		expect(ticketBtn?.getAttribute("aria-pressed")).toBe("true");
		expect(container?.querySelector('[data-testid="dock-panel-close"]')).not.toBeNull();
		// FORM chung với single (TradingDockPanel), không phải panel positions.
		await waitFor(() => !!container?.querySelector('[data-testid="trading-dock-panel"]'), "order form");
		expect(container?.querySelector('[data-testid="dock-submit"]')).not.toBeNull();
		expect(container?.querySelector('[data-testid="panel-chart-badge"]')).toBeNull();
	});

	it("W4: tape/advisory tabs disabled without host data", { timeout: 120000 }, async () => {
		await renderMulti();
		await waitFor(() => dockStripCount() === 1, "1 workspace dock strip");
		expect(container?.querySelector('[data-testid="dock-tab-tape"]')?.getAttribute("aria-disabled")).toBe("true");
		expect(container?.querySelector('[data-testid="dock-tab-advisory"]')?.getAttribute("aria-disabled")).toBe("true");
	});

	it("W4: tape tab opens with host data (empty entries safe)", { timeout: 120000 }, async () => {
		await renderMulti({ tape: { show: true, entries: [], isLoading: false, filterBillions: 0 } });
		await waitFor(() => dockStripCount() === 1, "1 workspace dock strip");
		const tapeBtn = container?.querySelector('[data-testid="dock-tab-tape"]') as HTMLButtonElement | null;
		expect(tapeBtn?.getAttribute("aria-disabled")).not.toBe("true");
		await act(async () => {
			tapeBtn?.click();
			await flushMicrotasks();
		});
		expect(tapeBtn?.getAttribute("aria-pressed")).toBe("true");
		expect(container?.querySelector('[data-testid="dock-panel-close"]')).not.toBeNull();
	});

	it("W4: advisory tab opens with host data (null result safe)", { timeout: 120000 }, async () => {
		await renderMulti({ advisory: { show: true, result: null, isLoading: false } });
		await waitFor(() => dockStripCount() === 1, "1 workspace dock strip");
		const advBtn = container?.querySelector('[data-testid="dock-tab-advisory"]') as HTMLButtonElement | null;
		expect(advBtn?.getAttribute("aria-disabled")).not.toBe("true");
		await act(async () => {
			advBtn?.click();
			await flushMicrotasks();
		});
		expect(advBtn?.getAttribute("aria-pressed")).toBe("true");
		expect(container?.querySelector('[data-testid="dock-panel-close"]')).not.toBeNull();
	});
});

describe("S1 body-row layout (F8 full-height, mirror single)", () => {
	it("slot mounts at body level beside mainCol (not inside .charts)", { timeout: 120000 }, async () => {
		await renderMulti();
		await waitFor(() => dockStripCount() === 1, "1 workspace dock strip");
		const strip = stripEl();
		const body = strip?.closest(`.${layoutStyles.workspaceBody}`);
		expect(body).not.toBeNull();
		const mainCol = strip?.closest(`.${layoutStyles.workspaceMainCol}`);
		expect(mainCol).toBeNull();
		const main = body?.querySelector(`.${layoutStyles.workspaceMainCol}`);
		expect(main).not.toBeNull();
		const footerBtn0 = (re: RegExp) => Array.from(container?.querySelectorAll("footer button") ?? []).find((b) => re.test(b.textContent ?? "")) as HTMLButtonElement | undefined;
		await act(async () => { footerBtn0(/Giao dịch mô phỏng/)?.click(); await flushMicrotasks(); });
		await waitFor(() => !!container?.querySelector('[data-vnsc-bottom-panel="host"]'), "paper panel opens");
		const panelHost = container?.querySelector('[data-vnsc-bottom-panel="host"]');
		expect(panelHost).not.toBeNull();
		expect(!!(main && panelHost && main.contains(panelHost))).toBe(true);
	});

	it("fly overlay KHÔNG reflow panel (mirror toolbar flyout); close giữ nguyên", { timeout: 120000 }, async () => {
		await renderMulti();
		await waitFor(() => dockStripCount() === 1, "1 workspace dock strip");
		const footerBtn0 = (re: RegExp) => Array.from(container?.querySelectorAll("footer button") ?? []).find((b) => re.test(b.textContent ?? "")) as HTMLButtonElement | undefined;
		await act(async () => { footerBtn0(/Giao dịch mô phỏng/)?.click(); await flushMicrotasks(); });
		await waitFor(() => !!container?.querySelector('[data-vnsc-bottom-panel="host"]'), "paper panel opens");
		const panelHost = container?.querySelector('[data-vnsc-bottom-panel="host"]') as HTMLElement | null;
		const watchBtn = container?.querySelector('[data-testid="dock-tab-watchlist"]') as HTMLButtonElement;
		await act(async () => { watchBtn?.click(); await flushMicrotasks(); });
		await waitFor(() => panelOpen(), "click opens drawer");
		// Fly = overlay thuần: panel giữ full width, không margin/co.
		expect(panelHost?.style.marginRight).toBe("");
		const closeBtn = container?.querySelector('[data-testid="dock-panel-close"]') as HTMLButtonElement;
		await act(async () => { closeBtn?.click(); await flushMicrotasks(); });
		expect(panelOpen()).toBe(false);
		expect(panelHost?.style.marginRight).toBe("");
	});

	it("dock wrapper is keyboard-focusable with label (flyout a11y)", { timeout: 120000 }, async () => {
		await renderMulti();
		await waitFor(() => dockStripCount() === 1, "1 workspace dock strip");
		const strip = stripEl();
		const wrapper = strip?.closest(`.${railStyles.workspaceDock}`) as HTMLElement | null;
		expect(wrapper?.getAttribute("tabindex")).toBe("0");
		expect(wrapper?.getAttribute("role")).toBe("complementary");
		expect(wrapper?.getAttribute("aria-label")).toBeTruthy();
	});
});

describe("F1 autohide (mirror drawing toolbar: grip -> hover strip, click drawer)", () => {
	it("strip-only at mount; hover never opens drawer (CSS slide only)", { timeout: 120000 }, async () => {
		await renderMulti();
		await waitFor(() => dockStripCount() === 1, "1 workspace dock strip");
		expect(panelOpen()).toBe(false);
		await act(async () => { hoverIn(); await flushMicrotasks(); });
		await act(async () => {
			await new Promise((r) => setTimeout(r, 600));
			await flushMicrotasks();
		});
		// Hover chỉ trượt strip (CSS) — drawer chỉ mở khi click.
		expect(panelOpen()).toBe(false);
		await act(async () => { hoverOut(); await flushMicrotasks(); });
		expect(panelOpen()).toBe(false);
	});

	it("click opens drawer; mouseleave never auto-closes (no timers)", { timeout: 120000 }, async () => {
		await renderMulti();
		await waitFor(() => dockStripCount() === 1, "1 workspace dock strip");
		const watchBtn = container?.querySelector('[data-testid="dock-tab-watchlist"]') as HTMLButtonElement;
		await act(async () => { watchBtn?.click(); await flushMicrotasks(); });
		expect(panelOpen()).toBe(true);
		expect(window.localStorage.getItem("vnsc_dock_tab")).toBe("watchlist");
		await act(async () => { hoverOut(); await flushMicrotasks(); });
		await act(async () => {
			await new Promise((r) => setTimeout(r, 600));
			await flushMicrotasks();
		});
		expect(panelOpen()).toBe(true);
	});

	it("pin docks in-flow with class + persist; X unpins to strip", { timeout: 120000 }, async () => {
		await renderMulti();
		await waitFor(() => dockStripCount() === 1, "1 workspace dock strip");
		const watchBtn = container?.querySelector('[data-testid="dock-tab-watchlist"]') as HTMLButtonElement;
		await act(async () => { watchBtn?.click(); await flushMicrotasks(); });
		await waitFor(() => panelOpen(), "click opens drawer");
		const pinBtn = container?.querySelector('[data-testid="dock-pin-toggle"]') as HTMLButtonElement;
		expect(pinBtn).not.toBeNull();
		await act(async () => { pinBtn?.click(); await flushMicrotasks(); });
		expect(window.localStorage.getItem("vnsc_dock_pinned")).toBe("1");
		expect(pinBtn?.getAttribute("aria-pressed")).toBe("true");
		const strip = stripEl();
		expect(strip?.closest(`.${railStyles.workspaceDockPinned}`)).not.toBeNull();
		// X trong pinned → về overlay-closed + unpin.
		const closeBtn = container?.querySelector('[data-testid="dock-panel-close"]') as HTMLButtonElement;
		await act(async () => { closeBtn?.click(); await flushMicrotasks(); });
		expect(panelOpen()).toBe(false);
		expect(window.localStorage.getItem("vnsc_dock_pinned")).toBe("0");
	});

	it("pinned persists across remount", { timeout: 120000 }, async () => {
		window.localStorage.setItem("vnsc_dock_pinned", "1");
		await renderMulti();
		await waitFor(() => dockStripCount() === 1, "1 workspace dock strip");
		expect(window.localStorage.getItem("vnsc_dock_pinned")).toBe("1");
		const strip = stripEl();
		expect(strip?.closest(`.${railStyles.workspaceDockPinned}`)).not.toBeNull();
	});

	it("fly và pinned đều KHÔNG margin panel (flex chỉ đẩy khi pinned)", { timeout: 120000 }, async () => {
		await renderMulti();
		await waitFor(() => dockStripCount() === 1, "1 workspace dock strip");
		// Không còn wrapper offset: panel là con trực tiếp mainCol.
		expect(container?.querySelector('[data-testid="bottom-panel-dock-offset"]')).toBeNull();
		const footerBtn = (re: RegExp) => Array.from(container?.querySelectorAll("footer button") ?? []).find((b) => re.test(b.textContent ?? "")) as HTMLButtonElement | undefined;
		await act(async () => { footerBtn(/Giao dịch mô phỏng/)?.click(); await flushMicrotasks(); });
		await waitFor(() => !!container?.querySelector('[data-vnsc-bottom-panel="host"]'), "paper panel opens");
		const watchBtn = container?.querySelector('[data-testid="dock-tab-watchlist"]') as HTMLButtonElement;
		await act(async () => { watchBtn?.click(); await flushMicrotasks(); });
		await waitFor(() => panelOpen(), "click opens drawer");
		const host = container?.querySelector('[data-vnsc-bottom-panel="host"]') as HTMLElement | null;
		const pinBtn = container?.querySelector('[data-testid="dock-pin-toggle"]') as HTMLButtonElement;
		await act(async () => { pinBtn?.click(); await flushMicrotasks(); });
		// Pinned: panel co qua flex mainCol, không margin phụ.
		expect(host?.style.marginRight).toBe("");
		const closeBtn = container?.querySelector('[data-testid="dock-panel-close"]') as HTMLButtonElement;
		await act(async () => { closeBtn?.click(); await flushMicrotasks(); });
		expect(host?.style.marginRight).toBe("");
	});

	it("bottom panel auto-follows tab defaults when untouched (paper 240 -> strategy 340)", { timeout: 120000 }, async () => {
		await renderMulti();
		await waitFor(() => dockStripCount() === 1, "1 workspace dock strip");
		expect(container?.querySelector('[data-vnsc-bottom-panel="host"]')).toBeNull();
		const footerBtn = (re: RegExp) => Array.from(container?.querySelectorAll("footer button") ?? []).find((b) => re.test(b.textContent ?? "")) as HTMLButtonElement | undefined;
		await act(async () => { footerBtn(/Giao dịch mô phỏng/)?.click(); await flushMicrotasks(); });
		await waitFor(() => !!container?.querySelector('[data-vnsc-bottom-panel="host"]'), "paper panel opens");
		expect((container?.querySelector('[data-vnsc-bottom-panel="host"]') as HTMLElement)?.style.height).toBe("240px");
		await act(async () => { footerBtn(/Strategy|nghiệm/)?.click(); await flushMicrotasks(); });
		await waitFor(() => {
			const h = container?.querySelector('[data-vnsc-bottom-panel="host"]') as HTMLElement | null;
			return h?.style.height === "340px";
		}, "strategy panel auto-height");
	});

	it("open drawer carries Open class on wrapper (CSS keeps flyout out)", { timeout: 120000 }, async () => {
		await renderMulti();
		await waitFor(() => dockStripCount() === 1, "1 workspace dock strip");
		const watchBtn = container?.querySelector('[data-testid="dock-tab-watchlist"]') as HTMLButtonElement;
		await act(async () => { watchBtn?.click(); await flushMicrotasks(); });
		await waitFor(() => panelOpen(), "click opens drawer");
		const strip = stripEl();
		expect(strip?.closest(`.${railStyles.workspaceDockOpen}`)).not.toBeNull();
	});
});

describe("W3-W4 workspace dock extras", () => {
	it("W3-fix: free tier nudge sits in overlay wrapper (no layout gap)", { timeout: 120000 }, async () => {
		// Không dockTierGate → tier free → nudge thay vì dock.
		const adapter = createAdapter(Promise.resolve(forkRuntimeData as never[]), "ws-dock-nudge");
		await act(async () => {
			root?.render(createElement(VNInvestMultiCharts as never, {
				charts: CHARTS,
				layout: { rows: 2, cols: 1 },
				defaultChartProps: { adapter, engineRuntime: "fork" },
			} as never));
			await flushMicrotasks();
		});
		await waitFor(() => !!container?.querySelector('[data-testid="dock-upgrade-nudge"]'), "upgrade nudge");
		expect(dockStripCount()).toBe(0);
		const nudge = container?.querySelector('[data-testid="dock-upgrade-nudge"]');
		// Nudge nằm trong flyout (trượt CSS) trong overlay wrapper — không phải
		// flex item trần của .charts column (gây gap full-width đáy màn hình).
		expect(nudge?.parentElement?.classList.contains(railStyles.workspaceDockFlyout)).toBe(true);
		expect(nudge?.parentElement?.parentElement?.classList.contains(railStyles.workspaceDock)).toBe(true);
		// Rail đối xứng toolbar: grip "···" + badge khóa, giữ tooltip/label cũ.
		expect(nudge?.querySelectorAll("svg").length).toBe(2);
		expect(nudge?.getAttribute("aria-label")).toBeTruthy();
		expect(nudge?.getAttribute("title")).toBe(nudge?.getAttribute("aria-label"));
	});

	it("W4: alerts action tab fires without switching panel", { timeout: 120000 }, async () => {
		await renderMulti();
		await waitFor(() => dockStripCount() === 1, "1 workspace dock strip");
		const alertsBtn = container?.querySelector('[data-testid="dock-tab-alerts"]') as HTMLButtonElement | null;
		// Tab alerts chỉ xuất hiện khi có onAlertsOpen (W4 delegate vào cell active).
		expect(alertsBtn).not.toBeNull();
		// E2: mở dataWindow trước (strip-only lúc mount), rồi bấm alerts.
		const dwBtn0 = container?.querySelector('[data-testid="dock-tab-dataWindow"]') as HTMLButtonElement | null;
		await act(async () => {
			dwBtn0?.click();
			await flushMicrotasks();
		});
		await act(async () => {
			alertsBtn?.click();
			await flushMicrotasks();
		});
		// Action tab: không chuyển panel (dataWindow vẫn mở).
		const dwBtn = container?.querySelector('[data-testid="dock-tab-dataWindow"]') as HTMLButtonElement | null;
		expect(dwBtn?.getAttribute("aria-pressed")).toBe("true");
	});
});

// RD-01 regression lock (DOCK_SSOT_B1): slot multi phải nằm TRONG
// `CapabilityProvider tier={patTier}`. Thiếu provider → `useHasCapability("paper_advanced")`
// (WorkspaceRightDockSlot.tsx:130) đọc tier=null → locked → trailing_stop khoá vĩnh viễn
// kể cả Pro. Tiền đề tier: bọc SaaSFeatureContext plan=pro (nếu không, patTier=free và
// GREEN bất khả thi — PLAN_AUDIT O-3).
describe("RD-01 workspace dock capability gate (multi)", () => {
	async function renderMultiAsSaas(plan: "pro" | "free", extraProps: Record<string, unknown> = {}) {
		const flags: SaaSFeatureFlags = {
			isWhalePanelEnabled: true,
			isReplayEnabled: true,
			isAdvisoryEnabled: true,
			hideTrademark: true,
			showWidgetAds: false,
		};
		const tenant: TenantMetadata = {
			tenantCode: "T",
			tenantName: "T",
			plan,
			status: "active",
			features: flags,
			domainWhitelist: [],
		};
		const value = {
			isLoading: false,
			isValid: true,
			tenantMetadata: tenant,
			flags,
		} as unknown as SaaSFeatureContextValue;
		const adapter = createAdapter(Promise.resolve(forkRuntimeData as never[]), `ws-dock-saas-${plan}`);
		await act(async () => {
			root?.render(
				createElement(
					SaaSFeatureContext.Provider,
					{ value },
					createElement(VNInvestMultiCharts as never, {
						charts: CHARTS,
						layout: { rows: 2, cols: 1 },
						// Force full dock bất kể tier (mirror renderMulti) — test chỉ đo capability.
						dockTierGate: false,
						defaultChartProps: { adapter, engineRuntime: "fork" },
						...extraProps,
					} as never),
				),
			);
			await flushMicrotasks();
		});
	}

	async function openTicketAndGetTrailingType(): Promise<HTMLButtonElement | null> {
		await waitFor(() => dockStripCount() === 1, "1 workspace dock strip");
		const ticketBtn = container?.querySelector('[data-testid="dock-tab-orderTicket"]') as HTMLButtonElement | null;
		expect(ticketBtn).not.toBeNull();
		await act(async () => {
			ticketBtn?.click();
			await flushMicrotasks();
		});
		await waitFor(() => !!container?.querySelector('[data-testid="trading-dock-panel"]'), "order form");
		return (container?.querySelector('[data-testid="dock-type-trailing_stop"]') as HTMLButtonElement | null) ?? null;
	}

	it("RD-01: SaaS pro → trailing_stop ENABLED (trước fix: disabled vì thiếu provider)", { timeout: 120000 }, async () => {
		await renderMultiAsSaas("pro");
		const trailingBtn = await openTicketAndGetTrailingType();
		expect(trailingBtn).not.toBeNull();
		expect(trailingBtn?.disabled).toBe(false);
	});

	it("RD-01: SaaS free → trailing_stop locked (fail-closed, không mở bừa)", { timeout: 120000 }, async () => {
		await renderMultiAsSaas("free");
		const trailingBtn = await openTicketAndGetTrailingType();
		expect(trailingBtn).not.toBeNull();
		expect(trailingBtn?.disabled).toBe(true);
	});
});

// RD-06 regression lock (DOCK_SSOT_B2): alerts imperative ở multi phải đi qua
// gate cell (`openAlertsModal`), không phải `setAlertsModalOpen` thô — free thì
// redirect upgradeUrl (parity single VNInvestCharts:845-851), pro thì modal.
// Tiền đề O-1: cell chỉ nhận được `upgradeUrl`/`debugTier` sau khi GridContainer
// forward + mergedChartProps trộn top-level (B2 1b-i/1b-ii) — nếu thiếu, free-case
// đỏ vĩnh viễn vì `const upgradeUrl = props.upgradeUrl` luôn undefined trong multi.
describe("RD-06 alerts imperative qua workspace dock (multi)", () => {
	async function renderMultiWithUpgrade(pro: boolean) {
		const adapter = createAdapter(
			Promise.resolve(forkRuntimeData as never[]),
			`ws-dock-rd06-${pro ? "pro" : "free"}`,
		);
		await act(async () => {
			root?.render(createElement(VNInvestMultiCharts as never, {
				charts: CHARTS,
				layout: { rows: 2, cols: 1 },
				dockTierGate: false,
				defaultChartProps: {
					adapter,
					engineRuntime: "fork",
					upgradeUrl: "https://upgrade.test/x",
					...(pro ? { debugTier: "pro" } : {}),
				},
			} as never));
			await flushMicrotasks();
		});
	}

	async function clickAlertsTab() {
		await waitFor(() => dockStripCount() === 1, "1 workspace dock strip");
		const alertsBtn = container?.querySelector('[data-testid="dock-tab-alerts"]') as HTMLButtonElement | null;
		expect(alertsBtn).not.toBeNull();
		// E2: mở dataWindow trước (strip-only lúc mount — mirror W4 flow).
		const dwBtn = container?.querySelector('[data-testid="dock-tab-dataWindow"]') as HTMLButtonElement | null;
		await act(async () => {
			dwBtn?.click();
			await flushMicrotasks();
		});
		await act(async () => {
			alertsBtn?.click();
			await flushMicrotasks();
		});
	}

	it("RD-06 free: alerts tab → window.open(upgradeUrl) qua gate cell (trước fix: silent no-op)", { timeout: 120000 }, async () => {
		const openSpy = vi.spyOn(window, "open").mockReturnValue(null);
		try {
			await renderMultiWithUpgrade(false);
			await clickAlertsTab();
			expect(openSpy).toHaveBeenCalledWith("https://upgrade.test/x", "_blank", "noopener,noreferrer");
		} finally {
			openSpy.mockRestore();
		}
	});

	it("RD-06 pro (debugTier): alerts mở modal cell, KHÔNG redirect (control chống over-redirect)", { timeout: 120000 }, async () => {
		const openSpy = vi.spyOn(window, "open").mockReturnValue(null);
		try {
			await renderMultiWithUpgrade(true);
			await clickAlertsTab();
			expect(openSpy).not.toHaveBeenCalled();
		} finally {
			openSpy.mockRestore();
		}
	});
});
