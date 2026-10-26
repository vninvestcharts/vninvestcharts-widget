// @vitest-environment jsdom
import { act } from "react";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

import { PriceScaleMenu } from "../PriceScaleMenu";

const t = (key: string) => key;

function renderMenu(props: Record<string, unknown>) {
	const container = document.createElement("div");
	document.body.appendChild(container);
	const root = createRoot(container);
	act(() => {
		root.render(createElement(PriceScaleMenu, props as never));
	});
	return {
		container,
		cleanup: () => {
			act(() => {
				root.unmount();
			});
			container.remove();
		},
	};
}

const baseMenu = {
	x: 700,
	y: 120,
	paneId: "price",
	scaleSlotId: "price-right",
	mode: "linear" as const,
	logAvailable: true,
};

describe("PriceScaleMenu", () => {
	it("renders nothing without a menu", () => {
		const probe = renderMenu({ menu: null, t, onSelectMode: vi.fn(), onResetZoom: vi.fn(), onClose: vi.fn() });
		try {
			expect(probe.container.querySelector('[role="menu"]')).toBeNull();
		} finally {
			probe.cleanup();
		}
	});

	it("marks the active mode and disables log when unavailable", () => {
		const probe = renderMenu({
			menu: { ...baseMenu, mode: "percent", logAvailable: false },
			t,
			onSelectMode: vi.fn(),
			onResetZoom: vi.fn(),
			onClose: vi.fn(),
		});
		try {
			const items = Array.from(probe.container.querySelectorAll('[role="menuitem"]'));
			// 3 modes + reset zoom (the separator now renders as a real divider).
			expect(items).toHaveLength(4);
			const separators = probe.container.querySelectorAll('[role="separator"]');
			expect(separators).toHaveLength(1);
			const percent = items.find((el) => el.textContent?.includes("priceScale.percent"));
			expect(percent?.getAttribute("aria-current")).toBe("true");
			const log = items.find((el) => el.textContent?.includes("priceScale.log"));
			expect((log as HTMLButtonElement)?.disabled).toBe(true);
		} finally {
			probe.cleanup();
		}
	});

	it("selects a mode and resets zoom", () => {
		const onSelectMode = vi.fn();
		const onResetZoom = vi.fn();
		const probe = renderMenu({ menu: baseMenu, t, onSelectMode, onResetZoom, onClose: vi.fn() });
		try {
			const items = Array.from(probe.container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
			act(() => {
				items.find((el) => el.textContent?.includes("priceScale.log"))?.click();
			});
			expect(onSelectMode).toHaveBeenCalledWith("log");
			act(() => {
				items.find((el) => el.textContent?.includes("priceScale.resetZoom"))?.click();
			});
			expect(onResetZoom).toHaveBeenCalledTimes(1);
		} finally {
			probe.cleanup();
		}
	});

	it("clamps inside the owning chart box instead of bleeding into neighbors", () => {
		// CHART_CLAMP: anchor x=900 with chart right edge 950 → 900+214+8
		// overflows → pulled back to 728, even though the viewport is wider.
		const rect = (width: number, height: number): DOMRect =>
			({ x: 0, y: 0, width, height, top: 0, left: 0, right: width, bottom: height, toJSON: () => ({}) }) as DOMRect;
		const spy = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
			if ((this as HTMLElement).getAttribute?.("role") === "menu") return rect(214, 171);
			return rect(0, 0);
		});
		try {
			const probe = renderMenu({
				menu: { ...baseMenu, x: 900, y: 400, flipRight: 950 },
				t, onSelectMode: vi.fn(), onResetZoom: vi.fn(), onClose: vi.fn(),
			});
			try {
				const panel = probe.container.querySelector<HTMLElement>('[role="menu"]');
				expect(panel?.style.position).toBe("fixed");
				expect(panel?.style.left).toBe("728px");
			} finally {
				probe.cleanup();
			}
		} finally {
			spy.mockRestore();
		}
	});
});
