// @vitest-environment jsdom
import { act, createElement } from "react";
import { describe, expect, it, afterEach } from "vitest";
import { createRoot } from "react-dom/client";

import { DrawingToolbar } from "../DrawingToolbar";
import { DrawingToolIcon } from "../DrawingToolIcon";
import { WidgetI18nProvider } from "../../../context/WidgetI18nContext";
import { VNInvestChartsStateProvider } from "../../../context/VNInvestChartsStateContext";

const mounted: Array<() => void> = [];
afterEach(() => {
	while (mounted.length) mounted.pop()?.();
});

function renderToolbar(props: Record<string, unknown> = {}) {
	const container = document.createElement("div");
	document.body.appendChild(container);
	const root = createRoot(container);
	act(() => {
		root.render(
			createElement(
				WidgetI18nProvider as never,
				{ locale: "en" },
				createElement(
					VNInvestChartsStateProvider as never,
					{ initialActiveTool: "cursor" },
					createElement(DrawingToolbar, { patTier: "free", ...props } as never),
				),
			),
		);
	});
	mounted.push(() => {
		act(() => {
			root.unmount();
		});
		container.remove();
	});
	return container;
}

describe("DrawingToolbar (P3 split)", () => {
	it("renders the rail with one button per tool group", () => {
		const container = renderToolbar();
		const rail = container.querySelector('[data-testid="drawing-toolbar"]');
		expect(rail).not.toBeNull();
		// 14 groups in TOOL_GROUPS_V2 (recent/favorites hidden when empty).
		expect(rail?.querySelectorAll(".vnsc-tool-btn--group").length).toBe(14);
	});

	it("renders an svg glyph for every group main icon", () => {
		const container = renderToolbar();
		const mains = container.querySelectorAll(".vnsc-tool-btn--group");
		mains.forEach((btn) => {
			expect(btn.querySelector("svg"), btn.getAttribute("title") ?? undefined).not.toBeNull();
		});
	});

	it("shows the last-used tool as the group main icon (P3)", () => {
		const container = renderToolbar();
		const groupButtons = Array.from(container.querySelectorAll(".vnsc-tool-btn--group"));
		const linesButton = groupButtons.find((btn) => btn.getAttribute("title") === "Lines") as HTMLButtonElement;
		expect(linesButton).not.toBeUndefined();
		const before = linesButton.innerHTML;
		act(() => {
			linesButton.click();
		});
		const flyout = document.querySelector(".vnsc-tools-flyout");
		expect(flyout).not.toBeNull();
		const rayButton = Array.from(flyout?.querySelectorAll("button") ?? []).find(
			(btn) => btn.getAttribute("title") === "Ray",
		) as HTMLButtonElement;
		expect(rayButton).not.toBeUndefined();
		act(() => {
			rayButton.click();
		});
		expect(document.querySelector(".vnsc-tools-flyout")).toBeNull();
		expect(linesButton.innerHTML).not.toBe(before);
	});

	it("DrawingToolIcon falls back to '?' for unknown ids", () => {
		const container = document.createElement("div");
		document.body.appendChild(container);
		const root = createRoot(container);
		act(() => {
			root.render(createElement(DrawingToolIcon, { id: "no-such-tool" }));
		});
		expect(container.textContent).toBe("?");
		act(() => {
			root.unmount();
		});
		container.remove();
	});

	it("renders favorites toggle button when tools pinned and toggles bar", () => {
		localStorage.setItem("vnsc_favTools", JSON.stringify(["fibonacci"]));
		try {
			const container = renderToolbar();
			const toggleBtn = container.querySelector<HTMLButtonElement>('[data-testid="drawing-toolbar-favorites-toggle"]');
			expect(toggleBtn).not.toBeNull();
			expect(toggleBtn?.getAttribute("aria-pressed")).toBe("true");

			act(() => {
				toggleBtn?.click();
			});
			expect(toggleBtn?.getAttribute("aria-pressed")).toBe("false");
			expect(localStorage.getItem("vnsc_favToolsBarVisible")).toBe("false");

			act(() => {
				toggleBtn?.click();
			});
			expect(toggleBtn?.getAttribute("aria-pressed")).toBe("true");
			expect(localStorage.getItem("vnsc_favToolsBarVisible")).toBe("true");
		} finally {
			localStorage.removeItem("vnsc_favTools");
			localStorage.removeItem("vnsc_favToolsBarVisible");
		}
	});

	it("S5.1 fav star keyboard-operable (Enter/Space toggle + aria-pressed)", () => {
		localStorage.removeItem("vnsc_favTools");
		try {
			const container = renderToolbar();
			const groupButtons = Array.from(container.querySelectorAll(".vnsc-tool-btn--group"));
			const linesButton = groupButtons.find((btn) => btn.getAttribute("title") === "Lines") as HTMLButtonElement;
			act(() => { linesButton.click(); });
			const star = document.querySelector(".vnsc-tools-flyout .vnsc-tool-fav-star") as HTMLElement;
			expect(star).not.toBeNull();
			expect(star.getAttribute("aria-pressed")).toBe("false");
			act(() => { star.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
			expect(star.getAttribute("aria-pressed")).toBe("true");
			expect(localStorage.getItem("vnsc_favTools")).toContain("trendLine");
			act(() => { star.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true })); });
			expect(star.getAttribute("aria-pressed")).toBe("false");
		} finally {
			localStorage.removeItem("vnsc_favTools");
		}
	});
});
