/**
 * FloatingChartBar unit tests (S4: TC-1..TC-8 + TC-13 + TC-14).
 * Rendered inside WidgetI18nProvider (real dictionaries, no t() mock).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { FloatingChartBar, type FloatingChartBarProps } from "../FloatingChartBar";
import { WidgetI18nProvider } from "../../../context/WidgetI18nContext";

function makeProps(overrides: Partial<FloatingChartBarProps> = {}): FloatingChartBarProps {
	return {
		onZoomIn: vi.fn(),
		onZoomOut: vi.fn(),
		onPanLeft: vi.fn(),
		onPanRight: vi.fn(),
		onFitToData: vi.fn(),
		...overrides,
	};
}

function renderBar(props: FloatingChartBarProps) {
	return render(
		<WidgetI18nProvider locale="en">
			<FloatingChartBar {...props} />
		</WidgetI18nProvider>
	);
}

describe("FloatingChartBar", () => {
	it("TC-1: renders 5 buttons in single-chart mode (no toggle)", () => {
		renderBar(makeProps());
		expect(screen.getAllByRole("button")).toHaveLength(5);
	});

	it("TC-2: toggle button absent when onToggleLayout undefined", () => {
		renderBar(makeProps({ onToggleLayout: undefined }));
		expect(screen.queryByTestId("floating-bar-toggle-layout")).toBeNull();
	});

	it("TC-3: toggle button present when onToggleLayout provided", () => {
		renderBar(makeProps({ onToggleLayout: vi.fn() }));
		expect(screen.getByTestId("floating-bar-toggle-layout")).toBeDefined();
		expect(screen.getAllByRole("button")).toHaveLength(6);
	});

	it("TC-4: aria-pressed + label follow isSoloMode", () => {
		const { rerender } = render(
			<WidgetI18nProvider locale="en">
				<FloatingChartBar {...makeProps({ onToggleLayout: vi.fn(), isSoloMode: false })} />
			</WidgetI18nProvider>
		);
		const toggle = screen.getByTestId("floating-bar-toggle-layout");
		expect(toggle.getAttribute("aria-pressed")).toBe("false");
		expect(toggle.getAttribute("aria-label")).toBe("Focus Chart");
		rerender(
			<WidgetI18nProvider locale="en">
				<FloatingChartBar {...makeProps({ onToggleLayout: vi.fn(), isSoloMode: true })} />
			</WidgetI18nProvider>
		);
		const toggleSolo = screen.getByTestId("floating-bar-toggle-layout");
		expect(toggleSolo.getAttribute("aria-pressed")).toBe("true");
		expect(toggleSolo.getAttribute("aria-label")).toBe("Restore Grid");
	});

	it("TC-5: click zoom in calls onZoomIn exactly once (no double-fire)", () => {
		const props = makeProps();
		renderBar(props);
		fireEvent.click(screen.getByTestId("floating-bar-zoom-in"));
		expect(props.onZoomIn).toHaveBeenCalledTimes(1);
	});

	it("TC-6: click pan left calls onPanLeft exactly once", () => {
		const props = makeProps();
		renderBar(props);
		fireEvent.click(screen.getByTestId("floating-bar-pan-left"));
		expect(props.onPanLeft).toHaveBeenCalledTimes(1);
	});

	it("TC-7: pan buttons disabled iff panDisabled", () => {
		const { rerender } = render(
			<WidgetI18nProvider locale="en">
				<FloatingChartBar {...makeProps({ panDisabled: true })} />
			</WidgetI18nProvider>
		);
		expect((screen.getByTestId("floating-bar-pan-left") as HTMLButtonElement).disabled).toBe(true);
		expect((screen.getByTestId("floating-bar-pan-right") as HTMLButtonElement).disabled).toBe(true);
		rerender(
			<WidgetI18nProvider locale="en">
				<FloatingChartBar {...makeProps({ panDisabled: false })} />
			</WidgetI18nProvider>
		);
		expect((screen.getByTestId("floating-bar-pan-left") as HTMLButtonElement).disabled).toBe(false);
		expect((screen.getByTestId("floating-bar-pan-right") as HTMLButtonElement).disabled).toBe(false);
	});

	it("TC-8: every button has a resolved aria-label (never a raw i18n key)", () => {
		renderBar(makeProps({ onToggleLayout: vi.fn() }));
		for (const btn of screen.getAllByRole("button")) {
			const label = btn.getAttribute("aria-label") ?? "";
			expect(label.length).toBeGreaterThan(0);
			expect(label.startsWith("chart.nav.")).toBe(false);
			expect(label.startsWith("toolbar.utility.")).toBe(false);
		}
		const toolbar = screen.getByRole("toolbar");
		const toolbarLabel = toolbar.getAttribute("aria-label") ?? "";
		expect(toolbarLabel.length).toBeGreaterThan(0);
		expect(toolbarLabel.startsWith("chart.nav.")).toBe(false);
	});

	it("TC-13: fit + toggle callbacks pass through exactly once", () => {
		const props = makeProps({ onToggleLayout: vi.fn() });
		renderBar(props);
		fireEvent.click(screen.getByTestId("floating-bar-fit"));
		expect(props.onFitToData).toHaveBeenCalledTimes(1);
		fireEvent.click(screen.getByTestId("floating-bar-toggle-layout"));
		expect(props.onToggleLayout).toHaveBeenCalledTimes(1);
	});

	it("TC-15: grip affordance renders (decorative, hidden from AT)", () => {
		renderBar(makeProps({ onToggleLayout: vi.fn() }));
		const grip = screen.getByTestId("floating-bar-grip");
		expect(grip.getAttribute("aria-hidden")).toBe("true");
		expect(grip.tagName).not.toBe("BUTTON");
		expect(screen.getAllByRole("button")).toHaveLength(6);
	});

	it("TC-16: idle collapse keeps buttons focusable (opacity, not display:none)", () => {
		renderBar(makeProps());
		for (const btn of screen.getAllByRole("button")) {
			const style = getComputedStyle(btn);
			expect(style.display).not.toBe("none");
			expect(style.visibility).not.toBe("hidden");
		}
	});

	it("TC-14: contextmenu + doubleclick never reach the surface", () => {
		const onContextMenu = vi.fn();
		const onDoubleClick = vi.fn();
		render(
			<WidgetI18nProvider locale="en">
				<div onContextMenu={onContextMenu} onDoubleClick={onDoubleClick}>
					<FloatingChartBar {...makeProps()} />
				</div>
			</WidgetI18nProvider>
		);
		fireEvent.contextMenu(screen.getByRole("toolbar"));
		fireEvent.doubleClick(screen.getByRole("toolbar"));
		expect(onContextMenu).not.toHaveBeenCalled();
		expect(onDoubleClick).not.toHaveBeenCalled();
	});
});
