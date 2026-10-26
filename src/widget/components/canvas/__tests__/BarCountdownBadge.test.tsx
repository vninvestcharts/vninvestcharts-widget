import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React, { act } from "react";
import { BarCountdownBadge } from "../BarCountdownBadge";

describe("BarCountdownBadge", () => {
	it("returns null when timeframe is undefined or unsupported", () => {
		const { container } = render(<BarCountdownBadge timeframe={undefined} />);
		expect(container.firstChild).toBeNull();

		const { container: monthContainer } = render(<BarCountdownBadge timeframe="1M" />);
		expect(monthContainer.firstChild).toBeNull();
	});

	it("renders countdown badge for minute timeframe", () => {
		render(<BarCountdownBadge timeframe="5m" isDark={true} />);
		const element = document.querySelector('[data-rsc-bar-countdown="true"]');
		expect(element).not.toBeNull();
		expect(element?.textContent).toMatch(/\d{2}:\d{2}/);
	});

	it("adapts styles for light mode", () => {
		render(<BarCountdownBadge timeframe="1h" isDark={false} />);
		const element = document.querySelector('[data-rsc-bar-countdown="true"]') as HTMLElement;
		expect(element).not.toBeNull();
		expect(element.style.color).toBe("rgb(8, 153, 129)");
	});

	it("hides when Settings scales.showCountdownToBarClose is false (legacy key)", () => {
		window.localStorage.setItem(
			"vnsc_chart_settings_v1",
			JSON.stringify({ scales: { showCountdownToBarClose: false } })
		);
		try {
			const { container } = render(<BarCountdownBadge timeframe="5m" isDark={true} />);
			expect(container.firstChild).toBeNull();
		} finally {
			window.localStorage.removeItem("vnsc_chart_settings_v1");
		}
	});

	it("reacts to enveloped settings-sync for its own chart only", () => {
		window.localStorage.removeItem("vnsc_chart_settings_v1");
		const slot = document.createElement("div");
		slot.setAttribute("data-chart-id", "chart-Z");
		document.body.appendChild(slot);
		try {
			const { container } = render(<BarCountdownBadge timeframe="5m" isDark={true} />, { container: slot });
			expect(container.querySelector('[data-rsc-bar-countdown="true"]')).not.toBeNull();
			act(() => {
				window.dispatchEvent(
					new CustomEvent("vnsc-settings-sync", {
						detail: { chartId: "chart-Z", state: { scales: { showCountdownToBarClose: false } } },
					})
				);
			});
			expect(container.querySelector('[data-rsc-bar-countdown="true"]')).toBeNull();
		} finally {
			slot.remove();
		}
	});
});

