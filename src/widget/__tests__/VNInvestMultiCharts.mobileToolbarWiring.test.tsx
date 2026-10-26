// @vitest-environment jsdom
// UX-04 wiring lock: the mobile flyout must receive the same capabilities the
// desktop rail already had.
//
// Baseline: the multi-chart call site passed only 10 of MobileToolbar's 17
// props. The unwired ones gated whole sections inside the flyout, so on a phone
// the workspace silently lost them:
//   - MobileToolbar.tsx:177 `{onTimeframeChange && timeframes && ...}` -> no
//     timeframe section at all (it fell back to rendering nothing, because the
//     multi-chart site passed neither prop).
//   - MobileToolbar.tsx:229 `{onTabChange && ...}` -> no Pine Editor /
//     Strategy Tester section.
//   - onPremiumToolClick -> Pro tools inert; and the desktop rail hardcoded
//     `http://localhost:8080` while the header used the `upgradeUrl` prop.
//
// This mounts the REAL VNInvestMultiCharts at a 390px container (which also
// exercises the UX-04 container breakpoint, since the flyout only renders when
// viewportMode === "mobile") and asserts against the real portalled DOM.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { VNInvestMultiCharts } from "../VNInvestMultiCharts";
import { createAdapter, forkRuntimeData, flushMicrotasks } from "./utils";
import { widgetMessagesEn } from "../i18n/messages.en";
import { widgetMessagesVi } from "../i18n/messages.vi";

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;
let previousLang: string;
let previousInnerWidth: number;
let previousClientWidth: PropertyDescriptor | undefined;

/**
 * jsdom has no layout engine, and tests/vitest.setup.ts defines
 * `HTMLElement.prototype.clientWidth` to return 1200 for any element whose
 * inline width is not expressed in px (the component root uses `width: 100%`).
 * The UX-04 hook measures exactly that element, so it always resolved
 * "desktop" here regardless of the window width.
 *
 * Report a phone-sized box for the workspace root ONLY, and delegate every
 * other element back to the original stub. Overriding the width globally makes
 * every layout hook in the subtree recompute against a 390px grid and crashes
 * the tree — that is a harness artifact, not a product defect.
 */
function stubPhoneWidth(originalGet: () => number) {
	const ROOT_CLASS = "vnsc-multicharts-root";
	Object.defineProperty(HTMLElement.prototype, "clientWidth", {
		configurable: true,
		get(this: HTMLElement) {
			if (this.classList?.contains(ROOT_CLASS)) return 390;
			return originalGet.call(this);
		},
	});
}

const errors: string[] = [];
const realConsoleError = console.error;
const realConsoleWarn = console.warn;

beforeEach(() => {
	errors.length = 0;
	const capture = (sink: (...a: unknown[]) => void) => (...args: unknown[]) => {
		const msg = args
			.map((a) => (a instanceof Error ? `${a.name}: ${a.message}\n${a.stack}` : String(a)))
			.join(" ");
		if (!/getContext|Not implemented/.test(msg)) errors.push(msg);
		sink(...args);
	};
	console.error = capture(realConsoleError);
	console.warn = capture(realConsoleWarn);
	window.localStorage.clear();
	previousLang = document.documentElement.lang;
	previousInnerWidth = window.innerWidth;
	previousClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
	const originalGet =
		previousClientWidth?.get ??
		Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth")?.get;
	if (originalGet) stubPhoneWidth(originalGet as () => number);
	Object.defineProperty(window, "innerWidth", { value: 390, writable: true, configurable: true });
	container = document.createElement("div");
	container.style.width = "390px";
	container.style.height = "740px";
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
	document.documentElement.lang = previousLang;
	Object.defineProperty(window, "innerWidth", { value: previousInnerWidth, writable: true, configurable: true });
	if (previousClientWidth) {
		Object.defineProperty(HTMLElement.prototype, "clientWidth", previousClientWidth);
	}
	console.error = realConsoleError;
	console.warn = realConsoleWarn;
	window.localStorage.clear();
});

const CHARTS = [
	{ id: "c1", symbol: "HPG", timeframe: "1D" },
	{ id: "c2", symbol: "VIC", timeframe: "4h" },
];

const UPGRADE_URL = "https://example.test/upgrade";

/** MobileToolbar is portalled, so read it from the document, not the container. */
function flyout(): HTMLElement | null {
	return document.querySelector<HTMLElement>('[role="dialog"][aria-label]');
}

async function openFlyout(): Promise<HTMLElement> {
	const trigger = container?.querySelector<HTMLElement>("button.vnsc-mobile-fab");
	expect(trigger, "mobile FAB missing — viewportMode did not resolve to mobile at 390px").not.toBeNull();
	await act(async () => {
		trigger!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		await flushMicrotasks();
	});
	const panel = flyout();
	expect(panel, "mobile flyout did not open").not.toBeNull();
	return panel!;
}

function buttonByText(scope: HTMLElement, text: string): HTMLButtonElement | undefined {
	return Array.from(scope.querySelectorAll<HTMLButtonElement>("button")).find(
		(b) => (b.textContent ?? "").trim() === text,
	);
}

/** Locale-independent: timeframe labels are the same in every translation. */
function timeframeButtons(scope: HTMLElement): HTMLButtonElement[] {
	return Array.from(scope.querySelectorAll<HTMLButtonElement>("button")).filter((b) =>
		/^\d+[mhdw]$/i.test((b.textContent ?? "").trim()),
	);
}

/**
 * Labels are localized and the component owns its own i18n provider, so accept
 * the string from either shipped locale. The point of the assertion is that the
 * SECTION EXISTS, not which language renders it.
 */
function expectSomeLocaleLabel(scope: HTMLElement, key: string) {
	const candidates = [widgetMessagesEn[key], widgetMessagesVi[key]].filter(
		(v): v is string => typeof v === "string",
	);
	expect(candidates.length, `no message for ${key}`).toBeGreaterThan(0);
	const hit = candidates.some((label) => (scope.textContent ?? "").includes(label));
	expect(hit, `flyout is missing the "${key}" section (looked for ${JSON.stringify(candidates)})`).toBe(
		true,
	);
}

async function renderMulti(extraProps: Record<string, unknown> = {}) {
	const adapter = createAdapter(Promise.resolve(forkRuntimeData as never[]), "ux04-mobile");
	await act(async () => {
		root?.render(
			createElement(VNInvestMultiCharts as never, {
				charts: CHARTS,
				layout: { rows: 2, cols: 1 },
				dockTierGate: false,
				upgradeUrl: UPGRADE_URL,
				defaultChartProps: { adapter, engineRuntime: "fork" },
				...extraProps,
			} as never),
		);
		await flushMicrotasks();
	});
}

describe("UX-04 mobile flyout wiring", () => {
	it("shows the timeframe section driven by the workspace, not a hardcoded list", async () => {
		await renderMulti();
		const panel = await openFlyout();

		// The section only exists when `onTimeframeChange` was forwarded
		// (MobileToolbar.tsx:177).
		expectSomeLocaleLabel(panel, "mobile.timeframe");

		// "30m" only exists in VNInvestMultiCharts' own `allTimeframes` union
		// (it is absent from MobileToolbar's DEFAULT_TIMEFRAMES), so seeing it
		// proves the prop is forwarded rather than the default being used.
		const labels = timeframeButtons(panel).map((b) => (b.textContent ?? "").trim());
		expect(labels, "no timeframe buttons in the mobile flyout").toContain("30m");

		// Clicking must reach the workspace handler (it closes the flyout).
		const thirty = buttonByText(panel, "30m")!;
		await act(async () => {
			thirty.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			await flushMicrotasks();
		});
		expect(
			flyout(),
			"timeframe tap did not close the flyout, so onTimeframeChange is not wired",
		).toBeNull();
	});

	it("shows the Pine Editor / Strategy Tester section (onTabChange forwarded)", async () => {
		await renderMulti();
		const panel = await openFlyout();

		// The section only exists when `onTabChange` was forwarded
		// (MobileToolbar.tsx:229) — this is the capability the audit found
		// missing on mobile.
		expectSomeLocaleLabel(panel, "mobile.features");
		const pine = [widgetMessagesEn["mobile.pineEditor"], widgetMessagesVi["mobile.pineEditor"]];
		const strategy = [
			widgetMessagesEn["mobile.strategyTester"],
			widgetMessagesVi["mobile.strategyTester"],
		];
		expect(
			pine.some((l) => typeof l === "string" && buttonByText(panel, l)),
			"no Pine Editor button in the mobile flyout",
		).toBe(true);
		expect(
			strategy.some((l) => typeof l === "string" && buttonByText(panel, l)),
			"no Strategy Tester button in the mobile flyout",
		).toBe(true);
	});

	it("opening and closing the flyout logs no React error (hook-order regression)", async () => {
		// Regression lock: `useDialogFocus` used to be called AFTER
		// `if (!isOpen) return null`, so the hook count changed between the
		// closed and the open render. React threw "Rendered more hooks than
		// during the previous render", the boundary caught it, and the whole
		// workspace was replaced by the error card — i.e. the mobile tools
		// flyout crashed on open for every user.
		await renderMulti();
		const panel = await openFlyout();
		const closeBtn = Array.from(panel.querySelectorAll<HTMLButtonElement>("button")).find((b) =>
			(b.getAttribute("aria-label") ?? "").toLowerCase().includes("close"),
		);
		if (closeBtn) {
			await act(async () => {
				closeBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
				await flushMicrotasks();
			});
		}
		// Re-open to prove the closed -> open -> closed cycle is stable.
		await openFlyout();
		expect(
			errors.filter((e) => /Rendered more hooks|Hooks called|ImageBitmap|Minified React error/.test(e)),
			`React logged errors while toggling the flyout:\n${errors.join("\n---\n")}`,
		).toEqual([]);
		// And the error card must not be on screen.
		expect(document.querySelector('[role="alert"]')).toBeNull();
	});

	it("no drawing tool is premium-locked any more (D2, 2026-10-22) — the tool is usable, no CTA", async () => {
		const open = vi.fn();
		const original = window.open;
		window.open = open as unknown as typeof window.open;
		try {
			await renderMulti();
			const panel = await openFlyout();

			// MobileToolbar marks an unavailable tool with `title={t("tool.premiumLocked")}`.
			//
			// Before 2026-10-22 this test asserted the OPPOSITE (at least one locked
			// tool, and that clicking it routed to `upgradeUrl`): the only Pro gate on
			// drawing tools was `smart_drawing_pro`, and it guarded the 16 TIER-16
			// tools. Decision D2 lowered it to Community because those algorithms were
			// already shipped unminified in `engine-drawing@2.2.0` — a Pro gate there
			// withheld nothing and only took 16 working tools away from free users.
			//
			// So the flyout now has NO premium-locked drawing tool, and the "Upgrade to
			// Pro" CTA is unreachable from the drawing section. That is a real product
			// change, and the lock below keeps it honest in both directions: re-promoting
			// `smart_drawing_pro` fails this test instead of silently re-adding a gate
			// that cannot withhold anything.
			const lockedTools = Array.from(panel.querySelectorAll<HTMLButtonElement>("button")).filter((b) =>
				b.hasAttribute("title"),
			);
			expect(
				lockedTools.length,
				`expected NO premium-locked drawing tool after D2, found ${lockedTools.length}`,
			).toBe(0);

			// NON-VACUITY: a TIER-16 tool must be present AND clicking it must SELECT it.
			// A premium-locked tool returns early WITHOUT closing the flyout; an
			// available tool calls `onToolSelect` + `onClose`. So "the flyout closed"
			// proves the button was really exercised and really treated as available.
			const gannLabels = [widgetMessagesEn["drawingTool.gannBox"], widgetMessagesVi["drawingTool.gannBox"]].filter(
				(v): v is string => typeof v === "string" && v.length > 0,
			);
			const gannBox = Array.from(panel.querySelectorAll<HTMLButtonElement>("button")).find((b) =>
				gannLabels.some((label) => (b.textContent ?? "").includes(label)),
			);
			expect(
				gannBox,
				`no TIER-16 drawing tool (gannBox) in the mobile flyout — nothing was exercised. Labels: ${JSON.stringify(gannLabels)}`,
			).not.toBeNull();

			await act(async () => {
				gannBox!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
				await flushMicrotasks();
			});
			expect(
				flyout(),
				"the flyout stayed open — the tool was treated as premium-locked",
			).toBeNull();

			// And the premium CTA never opened anything, let alone a hardcoded host.
			expect(
				open.mock.calls.length,
				`a premium CTA opened a window — the drawing tools are still locked. Calls: ${JSON.stringify(open.mock.calls)}`,
			).toBe(0);
		} finally {
			window.open = original;
		}
	});

	it("H0.5: with no upgradeUrl prop, no upgrade CTA renders at all", async () => {
		await renderMulti({ upgradeUrl: undefined });
		// The pre-H0.5 default was `http://localhost:8080`, so omitting the prop
		// used to render an anchor pointing at a local backend. Zero anchors must
		// carry a localhost target once the fallback is removed.
		const localhostAnchors = Array.from(document.querySelectorAll("a")).filter((a) =>
			(a.getAttribute("href") ?? "").includes("localhost"),
		);
		expect(
			localhostAnchors.map((a) => a.outerHTML),
			"a localhost upgrade anchor rendered even though no upgradeUrl was passed",
		).toEqual([]);
	});
});
