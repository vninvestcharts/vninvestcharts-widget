// @vitest-environment jsdom
// BL-03B regression lock: ChartFooter extracted verbatim from VNInvestCharts.
import { describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { ChartFooter } from "../ChartFooter";
import type { Timeframe } from "../../../../lib/types/adapter";

function renderFooter(over: Record<string, unknown> = {}) {
	const container = document.createElement("div");
	document.body.appendChild(container);
	const root = createRoot(container);
	act(() => {
		root.render(
			createElement(ChartFooter, {
				showFooter: true,
				timeframe: "1H" as Timeframe,
				localRange: "3M",
				onTimeframeChange: vi.fn(),
				onRangeChange: vi.fn(),
				scaleMode: "auto",
				onScaleModeChange: vi.fn(),
				timezone: "Asia/Ho_Chi_Minh",
				t: () => undefined,
				activeBottomTab: null,
				onBottomTabChange: vi.fn(),
				...over,
			}),
		);
	});
	return { container, root };
}

function teardown(container: HTMLDivElement, root: ReturnType<typeof createRoot>) {
	act(() => {
		root.unmount();
	});
	container.remove();
}

describe("ChartFooter (BL-03B extraction parity)", () => {
	it("renders no timeframe chips when showFooter is false (shortcut modal stays mounted)", () => {
		const { container, root } = renderFooter({ showFooter: false });
		try {
			expect(container.querySelector('[data-testid="timeframe-footer"]')).toBeNull();
		} finally {
			teardown(container, root);
		}
	});

	it("delegates to renderFooter when provided", () => {
		const { container, root } = renderFooter({
			renderFooter: () => createElement("div", null, "custom-foot"),
		});
		try {
			expect(container.textContent).toContain("custom-foot");
		} finally {
			teardown(container, root);
		}
	});

	it("renders tab toggles and fires onBottomTabChange", () => {
		const onBottomTabChange = vi.fn();
		const { container, root } = renderFooter({ onBottomTabChange });
		try {
			expect(container.textContent).toContain("Pine Editor");
			expect(container.textContent).toContain("Strategy Tester");
			expect(container.textContent).toContain("Paper Trading");
			const buttons = Array.from(container.querySelectorAll("button"));
			const pine = buttons.find((b) => b.textContent === "Pine Editor");
			act(() => {
				pine?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			});
			expect(onBottomTabChange).toHaveBeenCalledWith("pine_editor");
		} finally {
			teardown(container, root);
		}
	});
});
