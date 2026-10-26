// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import React from "react";
import { render } from "@testing-library/react";
import { ChartA11ySummary } from "../ChartA11ySummary";
import { WidgetI18nProvider } from "../../../context/WidgetI18nContext";

/**
 * UX-03 — DOM alternative for the engine canvas.
 *
 * The engine draws to a bare <canvas> with no accessible representation, so a
 * screen reader could not learn which symbol/timeframe was shown or what the
 * latest OHLC was. This region exposes those facts as text and is linked from
 * the chart container via aria-describedby.
 */
function renderSummary(props: Partial<React.ComponentProps<typeof ChartA11ySummary>> = {}) {
	return render(
		<WidgetI18nProvider locale="en">
			<ChartA11ySummary
				id="vnsc-a11y-test-1"
				symbol="BTCUSDT"
				timeframe="1h"
				ohlc={{ open: 100, high: 110, low: 90, close: 105 }}
				barCount={250}
				visibleRange={{ from: 10, to: 120 }}
				{...props}
			/>
		</WidgetI18nProvider>
	);
}

const text = (c: HTMLElement) => c.querySelector("[data-testid='chart-a11y-summary']")?.textContent ?? "";

describe("ChartA11ySummary", () => {
	// AC-UX-03-1
	it("exposes symbol, timeframe, OHLC, bar count and visible range as text", () => {
		const { container } = renderSummary();
		const value = text(container);
		expect(value).toContain("BTCUSDT");
		expect(value).toContain("1h");
		expect(value).toContain("100");
		expect(value).toContain("110");
		expect(value).toContain("90");
		expect(value).toContain("105");
		expect(value).toContain("250");
		expect(value).toContain("10");
		expect(value).toContain("120");
	});

	// AC-UX-03-1
	it("is exposed to assistive tech: live region carrying the caller-supplied id", () => {
		const { container } = renderSummary();
		const node = container.querySelector("[data-testid='chart-a11y-summary']")!;
		// `aria-live` must be polite: live price ticks would otherwise flood a
		// screen reader on every websocket update.
		expect(node.getAttribute("aria-live")).toBe("polite");
		expect(node.getAttribute("aria-atomic")).toBe("true");
		// The id is owned by the caller (VNInvestCharts passes a useId value) so
		// that several charts in one workspace never collide.
		expect(node.getAttribute("id")).toBe("vnsc-a11y-test-1");
	});

	// Regression lock for the multi-chart duplicate-id bug: the summary used to
	// hardcode one id, so every chart's aria-describedby resolved to the FIRST
	// summary in document order and announced the wrong symbol/OHLC.
	it("gives each rendered chart a distinct id that its region points at", () => {
		render(
			<WidgetI18nProvider locale="en">
				<div aria-describedby="summary-a">
					<ChartA11ySummary id="summary-a" symbol="BTCUSDT" timeframe="1h" barCount={250} />
				</div>
				<div aria-describedby="summary-b">
					<ChartA11ySummary id="summary-b" symbol="ETHUSDT" timeframe="5m" barCount={60} />
				</div>
			</WidgetI18nProvider>
		);
		const nodes = Array.from(document.querySelectorAll("[data-testid='chart-a11y-summary']"));
		expect(nodes).toHaveLength(2);
		const ids = nodes.map((n) => n.id);
		expect(new Set(ids).size).toBe(2);
		// Each describedby must resolve to its OWN summary, not the first one.
		for (const region of Array.from(document.querySelectorAll("[aria-describedby]"))) {
			const target = region.getAttribute("aria-describedby")!;
			const resolved = document.getElementById(target);
			expect(resolved).not.toBeNull();
			expect(resolved!.getAttribute("data-testid")).toBe("chart-a11y-summary");
			// The target must live inside THIS region (a shared id would resolve
			// to the first summary, i.e. the previous region).
			expect(region.contains(resolved)).toBe(true);
		}
		expect(document.getElementById("summary-b")!.textContent).toContain("ETHUSDT");
	});

	// Hidden visually but still in the accessibility tree.
	it("is visually hidden WITHOUT display:none (stays in the a11y tree)", () => {
		const { container } = renderSummary();
		const node = container.querySelector("[data-testid='chart-a11y-summary']") as HTMLElement;
		expect(node.style.display).not.toBe("none");
		expect(node.style.visibility).not.toBe("hidden");
		expect(node.style.position).toBe("absolute");
		expect(node.style.clipPath).toBe("inset(50%)");
	});

	// AC-UX-03-3
	it("says so explicitly when there is no data", () => {
		const { container } = renderSummary({ ohlc: null, barCount: 0, visibleRange: null, status: "No data" });
		const value = text(container);
		expect(value).toContain("No data");
		expect(value).toContain("Bars: 0");
	});

	it("never renders a non-finite number", () => {
		const { container } = renderSummary({ ohlc: { open: Number.NaN, high: 1, low: 1, close: 1 } });
		const value = text(container);
		expect(value).toContain("—");
		expect(value).not.toContain("NaN");
	});

	it("falls back to a dash for a missing symbol/timeframe", () => {
		const { container } = renderSummary({ symbol: "", timeframe: "" });
		expect(text(container)).toContain("—");
	});

	// S5 2026-10-10 — `verify-p3.cjs` scraped `Số nến: <n>` out of this text to prove
	// the chart has data before it drags. `Số nến` is `a11y.chart.bars`, a TRANSLATED
	// string, so that assertion is `Bars: <n>` under locale `en` — it silently measures
	// nothing on every non-Vietnamese host. `data-bar-count` carries the same number as
	// a plain integer.
	//
	// Both cases below are asserted in BOTH locales on purpose: the invariant being locked
	// is that the hook is locale-independent, so a test written in one locale would pass
	// even if the attribute had been built from `t("a11y.chart.bars")`.
	for (const locale of ["en", "vi"] as const) {
		it(`exposes data-bar-count as a plain integer, locale-independently (${locale})`, () => {
			const { container } = render(
				<WidgetI18nProvider locale={locale}>
					<ChartA11ySummary id="vnsc-a11y-bars" symbol="BTCUSDT" timeframe="1h" barCount={250} />
				</WidgetI18nProvider>,
			);
			const node = container.querySelector("[data-testid='chart-a11y-summary']");
			expect(node?.getAttribute("data-bar-count")).toBe("250");
			// A plain integer: no grouping, no decimal separator, nothing locale-shaped.
			expect(node?.getAttribute("data-bar-count")).toMatch(/^\d+$/);
		});
	}

	it("reports 0 bars as 0 (not an absent attribute), so 'no data' stays distinguishable", () => {
		const { container } = renderSummary({ barCount: 0 });
		const node = container.querySelector("[data-testid='chart-a11y-summary']");
		expect(node?.getAttribute("data-bar-count")).toBe("0");
	});
});
