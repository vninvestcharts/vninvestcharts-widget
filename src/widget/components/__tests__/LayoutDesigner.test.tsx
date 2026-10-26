// @vitest-environment jsdom
// BL-19 regression lock: LayoutDesigner renders + animates with pure CSS
// (framer-motion removed). Enter-animation classes must be present; the
// dialog must open/close and expose slots for selection.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { LayoutDesigner } from "../LayoutDesigner";
import { WidgetI18nProvider } from "../../context/WidgetI18nContext";
import type { GridLayout } from "../../grid/types";

function makeLayout(): GridLayout {
	return {
		rows: 1,
		cols: 2,
		slots: [
			{ id: "s1", symbol: "VIC", timeframe: "1H" },
			{ id: "s2", symbol: "FPT", timeframe: "1D" },
		],
		rowSizes: ["1fr"],
		colSizes: ["1fr", "1fr"],
	} as unknown as GridLayout;
}

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

function renderDesigner(over: Record<string, unknown> = {}) {
	act(() => {
		root?.render(
			/* eslint-disable-next-line react/no-children-prop -- required prop: this provider's props type declares `children` as mandatory, so it must be passed in the config object; createElement's 3rd-argument form fails tsc. */
			createElement(
				WidgetI18nProvider,
				{ locale: "en", children: null },
				createElement(LayoutDesigner, {
					layout: makeLayout(),
					onLayoutChange: vi.fn(),
					isOpen: true,
					onClose: vi.fn(),
					...over,
				} as never),
			),
		);
	});
}

beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(() => {
	act(() => {
		root?.unmount();
	});
	container?.remove();
	container = null;
	root = null;
});

describe("LayoutDesigner (BL-19 CSS animations)", () => {
	it("renders nothing when closed", () => {
		renderDesigner({ isOpen: false });
		expect(container?.querySelector('[role="dialog"]')).toBeNull();
	});

	it("renders dialog with CSS enter-animation classes (no framer-motion)", () => {
		renderDesigner();
		const dialog = container?.querySelector('[role="dialog"]');
		expect(dialog).not.toBeNull();
		// overlay fades in, modal pops in — class names from the CSS module
		expect(dialog?.className).toMatch(/animFadeIn/);
		expect(dialog?.querySelector("div")?.className).toMatch(/animPopIn/);
	});

	it("renders both slots and selects on click", () => {
		renderDesigner();
		const dialog = container?.querySelector('[role="dialog"]');
		expect(dialog?.textContent).toContain("VIC");
		expect(dialog?.textContent).toContain("FPT");
		const firstSlot = dialog?.querySelectorAll("div[class*='slot']")[0] as HTMLElement | undefined;
		act(() => {
			firstSlot?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		expect(firstSlot?.className).toMatch(/selected/);
	});

	it("opens the preset modal with enter-animation classes", () => {
		renderDesigner();
		const buttons = Array.from(container?.querySelectorAll("button") ?? []);
		const presetBtn = buttons.find((b) => b.textContent?.includes("Preset"));
		act(() => {
			presetBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		const dialog = container?.querySelector('[role="dialog"]');
		expect(dialog?.querySelector("input[placeholder]")).not.toBeNull();
	});
});
