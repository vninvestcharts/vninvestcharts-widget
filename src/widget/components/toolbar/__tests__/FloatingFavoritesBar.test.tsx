// @vitest-environment jsdom
import { act, createElement } from "react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { createRoot } from "react-dom/client";

import { FloatingFavoritesBar } from "../FloatingFavoritesBar";
import { WidgetI18nProvider } from "../../../context/WidgetI18nContext";

const mounted: Array<() => void> = [];
afterEach(() => {
	while (mounted.length) mounted.pop()?.();
	document.querySelectorAll('[data-testid="floating-favorites-bar"]').forEach((el) => el.remove());
	localStorage.removeItem("vnsc_favToolsBarPos");
});

function renderBar(props: Record<string, unknown> = {}) {
	const container = document.createElement("div");
	document.body.appendChild(container);
	const root = createRoot(container);
	act(() => {
		root.render(
			createElement(
				WidgetI18nProvider as never,
				{ locale: "en" },
				createElement(FloatingFavoritesBar, {
					favoriteTools: [],
					onToolSelect: () => {},
					onUnpin: () => {},
					...props,
				} as never),
			),
		);
	});
	mounted.push(() => {
		act(() => {
			root.unmount();
		});
		container.remove();
	});
	// Portal target is document.body (no shadow provider in test).
	return document.querySelector<HTMLElement>('[data-testid="floating-favorites-bar"]');
}

describe("FloatingFavoritesBar (P3)", () => {
	it("renders nothing while no tool is pinned", () => {
		expect(renderBar({ favoriteTools: [] })).toBeNull();
	});

	it("renders nothing when isVisible is false", () => {
		expect(renderBar({ favoriteTools: ["fibonacci"], isVisible: false })).toBeNull();
	});

	it("lists pinned tools cleanly and selects on click", () => {
		const onToolSelect = vi.fn();
		const bar = renderBar({ favoriteTools: ["fibonacci", "rectangle"], activeTool: "fibonacci", onToolSelect });
		expect(bar).not.toBeNull();
		// 2 tools + 1 close button = 3 buttons total
		const buttons = bar?.querySelectorAll("button");
		expect(buttons?.length).toBe(3);
		act(() => {
			(buttons?.[0] as HTMLButtonElement).click();
		});
		expect(onToolSelect).toHaveBeenCalledWith("fibonacci");
	});

	it("unpins via right-click (contextmenu) on tool button", () => {
		const onUnpin = vi.fn();
		const bar = renderBar({ favoriteTools: ["fibonacci"], onUnpin });
		const toolBtn = bar?.querySelector<HTMLButtonElement>('button[title*="fibonacci"]') ?? bar?.querySelectorAll("button")[0];
		expect(toolBtn).not.toBeNull();
		act(() => {
			toolBtn?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
		});
		expect(onUnpin).toHaveBeenCalledWith("fibonacci");
	});

	it("triggers onClose when clicking close button", () => {
		const onClose = vi.fn();
		const bar = renderBar({ favoriteTools: ["fibonacci"], onClose });
		const closeBtn = bar?.querySelector<HTMLButtonElement>('[data-testid="floating-favorites-close"]');
		expect(closeBtn).not.toBeNull();
		act(() => {
			closeBtn?.click();
		});
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it("drags by the grip and persists the position", () => {
		const bar = renderBar({ favoriteTools: ["fibonacci"] });
		const grip = document.querySelector<HTMLElement>('[data-testid="floating-favorites-grip"]');
		expect(grip).not.toBeNull();
		const before = (bar as HTMLElement).style.left;
		act(() => {
			grip?.dispatchEvent(new PointerEvent("pointerdown", { clientX: 100, clientY: 100, bubbles: true }));
		});
		act(() => {
			window.dispatchEvent(new PointerEvent("pointermove", { clientX: 150, clientY: 130, bubbles: true }));
		});
		act(() => {
			window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
		});
		const after = document.querySelector<HTMLElement>('[data-testid="floating-favorites-bar"]')?.style.left;
		expect(after).not.toBe(before);
		expect(after).toBe("114px"); // 64 + 50
		expect(JSON.parse(localStorage.getItem("vnsc_favToolsBarPos") ?? "{}").x).toBe(114);
	});
});
