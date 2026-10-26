import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { ChartStatusLine, type ChartStatusLineProps } from "../ChartStatusLine";
import { WidgetI18nProvider } from "../../../context/WidgetI18nContext";
import type { EnrichedDatum } from "../../../../lib/core/calculators/types";

function renderWithI18n(props: ChartStatusLineProps, locale: "en" | "vi" = "en") {
	return render(
		<WidgetI18nProvider locale={locale}>
			<ChartStatusLine {...props} />
		</WidgetI18nProvider>
	);
}

describe("ChartStatusLine", () => {
	const mockLastDatum: EnrichedDatum = {
		date: new Date("2026-09-15T00:00:00Z"),
		open: 100,
		high: 110,
		low: 95,
		close: 105,
		volume: 50000,
	};

	it("renders symbol, exchange tag, and timeframe", () => {
		renderWithI18n({
			symbol: "BYBIT:BTCUSD",
			timeframe: "30m",
			lastDatum: mockLastDatum,
			isDark: true,
		});

		expect(screen.getByText("BYBIT")).toBeDefined();
		expect(screen.getByText("BTCUSD")).toBeDefined();
		expect(screen.getByText("· 30m")).toBeDefined();
	});

	it("renders bullish OHLCV values correctly", () => {
		renderWithI18n({
			symbol: "VIC",
			timeframe: "1D",
			lastDatum: mockLastDatum,
			isDark: true,
		});

		expect(screen.getByText("O")).toBeDefined();
		expect(screen.getByText("100.00")).toBeDefined();
		expect(screen.getByText("110.00")).toBeDefined();
		expect(screen.getByText("95.00")).toBeDefined();
		expect(screen.getByText("105.00")).toBeDefined();
		expect(screen.getByText("+5.00 (+5.00%)")).toBeDefined();
	});

	it("renders bearish OHLCV values correctly", () => {
		const bearishDatum: EnrichedDatum = {
			date: new Date("2026-09-15T00:00:00Z"),
			open: 100,
			high: 102,
			low: 90,
			close: 92,
			volume: 30000,
		};

		renderWithI18n({
			symbol: "VIC",
			timeframe: "1D",
			lastDatum: bearishDatum,
			isDark: true,
		});

		expect(screen.getByText("-8.00 (-8.00%)")).toBeDefined();
	});

	it("prioritizes hoveredDatum over lastDatum", () => {
		const hoveredDatum: EnrichedDatum = {
			date: new Date("2026-09-14T00:00:00Z"),
			open: 50,
			high: 55,
			low: 48,
			close: 52,
			volume: 12000,
		};

		renderWithI18n({
			symbol: "VIC",
			timeframe: "1D",
			lastDatum: mockLastDatum,
			hoveredDatum: hoveredDatum,
			isDark: true,
		});

		expect(screen.getByText("52.00")).toBeDefined();
		expect(screen.getByText("+2.00 (+4.00%)")).toBeDefined();
	});

	it("handles collapse / expand toggle click", () => {
		renderWithI18n({
			symbol: "VIC",
			timeframe: "1D",
			lastDatum: mockLastDatum,
			isDark: true,
			pane: {
				id: "price",
				series: [
					{ id: "candlestick-1", type: "candlestick", yAxis: "right" } as any,
					{ id: "ema-20", type: "ema", title: "EMA 20", yAxis: "right" } as any,
				],
			} as any,
		});

		// Indicator "EMA 20" should be visible initially
		expect(screen.getByText("EMA 20")).toBeDefined();

		// Click collapse button
		const collapseBtn = screen.getByTitle("Collapse status line");
		fireEvent.click(collapseBtn);

		// Now indicator row should be hidden
		expect(screen.queryByText("EMA 20")).toBeNull();
	});

	it("triggers onSettingsClick when settings button is clicked", () => {
		const onSettingsClick = vi.fn();
		renderWithI18n({
			symbol: "VIC",
			timeframe: "1D",
			lastDatum: mockLastDatum,
			isDark: true,
			onSettingsClick: onSettingsClick,
		});

		const settingsBtn = screen.getByTitle("Settings");
		fireEvent.click(settingsBtn);
		expect(onSettingsClick).toHaveBeenCalledTimes(1);
	});

	it("triggers onToggleSeriesVisibility when eye button is clicked", () => {
		const onToggle = vi.fn();
		renderWithI18n({
			symbol: "VIC",
			timeframe: "1D",
			lastDatum: mockLastDatum,
			isDark: true,
			onToggleSeriesVisibility: onToggle,
		});

		const eyeBtn = screen.getByTitle("Hide series");
		fireEvent.click(eyeBtn);
		expect(onToggle).toHaveBeenCalledWith("primary-series");
	});

	it("DECLUTTER_V2: raw compare series id never renders (superseded by V3 — no sub-row at all)", () => {
		// An earlier test persists collapsed=true — reset so rows render.
		window.localStorage.removeItem("vnsc_statusline_collapsed");
		renderWithI18n({
			symbol: "BTCUSDT",
			timeframe: "1h",
			lastDatum: mockLastDatum,
			isDark: true,
			pane: {
				id: "price",
				series: [
					{ id: "candlestick-1", type: "candlestick", yAxis: "right" } as any,
					{ id: "compare-SOLUSDT", type: "Comparison", overlaySymbolId: "SOLUSDT", yAxis: "right" } as any,
				],
			} as any,
		});

		expect(screen.queryByText("compare-SOLUSDT")).toBeNull();
	});

	it("DECLUTTER_V3: Comparison has no statusline sub-row (embedded chip owns it)", () => {
		// An earlier test persists collapsed=true — reset so rows render.
		window.localStorage.removeItem("vnsc_statusline_collapsed");
		renderWithI18n({
			symbol: "BTCUSDT",
			timeframe: "1h",
			lastDatum: mockLastDatum,
			isDark: true,
			pane: {
				id: "price",
				series: [
					{ id: "candlestick-1", type: "candlestick", yAxis: "right" } as any,
					{ id: "compare-SOLUSDT", type: "Comparison", overlaySymbolId: "SOLUSDT", yAxis: "right" } as any,
					{ id: "ema-20", type: "ema", title: "EMA 20", yAxis: "right" } as any,
				],
			} as any,
		});

		// EMA keeps its sub-row; Comparison must not duplicate the embedded chip.
		expect(screen.getByText("EMA 20")).toBeDefined();
		expect(screen.queryByText("SOLUSDT")).toBeNull();
		expect(screen.queryByText("compare-SOLUSDT")).toBeNull();
	});

	it("DECLUTTER_V4: compareLegend node renders below the OHLC row", () => {
		window.localStorage.removeItem("vnsc_statusline_collapsed");
		renderWithI18n({
			symbol: "BTCUSDT",
			timeframe: "1h",
			lastDatum: mockLastDatum,
			isDark: true,
			compareLegend: <span data-testid="x-compare">SOLUSDT</span>,
		});

		const compare = screen.getByTestId("x-compare");
		const ohlcRow = document.querySelector('[data-rsc-chart-status-line="true"] > div');
		expect(ohlcRow).not.toBeNull();
		// Compare node sits after the main OHLC row in DOM order.
		expect(ohlcRow!.compareDocumentPosition(compare) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	});

	it("SINGLE-OHLC: hideMainRow drops the duplicate OHLC row, keeps compare chips", () => {
		window.localStorage.removeItem("vnsc_statusline_collapsed");
		renderWithI18n({
			symbol: "BTCUSDT",
			timeframe: "1h",
			lastDatum: mockLastDatum,
			isDark: true,
			hideMainRow: true,
			compareLegend: <span data-testid="x-compare-hide">ETHUSDT</span>,
		});

		// No symbol badge / OHLC values / countdown from the main row.
		expect(screen.queryByText("BTCUSDT")).toBeNull();
		// Compare chips survive and become the first row (just under header).
		const compare = screen.getByTestId("x-compare-hide");
		const firstRow = document.querySelector('[data-rsc-chart-status-line="true"] > div');
		expect(firstRow?.contains(compare)).toBe(true);
	});

	it("V-07 parity: large close renders grouped like grid legend", () => {
		renderWithI18n({
			symbol: "BTCUSDT",
			timeframe: "1h",
			lastDatum: {
				date: new Date("2026-09-15T00:00:00Z"),
				open: 81000,
				high: 81500,
				low: 80900,
				close: 81325.38,
				volume: 42954,
			} as EnrichedDatum,
			isDark: true,
		});
		// Same SSOT strings as PricePaneHeader ("79,529.24" pattern).
		expect(screen.getByText("81,325.38")).toBeDefined();
		expect(screen.getByText("43K")).toBeDefined();
	});

	// UIUX_MULTI_CELL_HEADER: dòng status trong pane có testid ổn để probe assert theo DOM
	// (không match text "O" — false-positive với "Vol").
	it("exposes stable testids for the symbol badge and the OHLC values", () => {
		renderWithI18n({
			symbol: "VIC",
			timeframe: "1D",
			lastDatum: {
				date: new Date("2026-09-15T00:00:00Z"),
				open: 100,
				high: 110,
				low: 95,
				close: 105,
				volume: 50000,
			} as EnrichedDatum,
			isDark: true,
		});
		expect(screen.getByTestId("status-symbol-badge")).toBeDefined();
		expect(screen.getByTestId("status-ohlc-values")).toBeDefined();
	});

	// UIUX_AC_RUNTIME_2026-10-21: cờ `statusLine.showVolume` phải kiểm soát
	// dòng status TRONG PANE (trước đó Vol luôn hiện ở mọi surface).
	it("showVolume=false ⇒ ẩn Vol nhưng GIỮ O/H/L-C", () => {
		renderWithI18n({
			symbol: "VIC",
			timeframe: "1D",
			lastDatum: mockLastDatum,
			isDark: true,
			showVolume: false,
		});
		expect(screen.getByText("O")).toBeDefined();
		expect(screen.getByText("100.00")).toBeDefined();
		expect(screen.queryByText("Vol")).toBeNull();
	});

	it("showVolume=true (mặc định) ⇒ hiện Vol", () => {
		renderWithI18n({
			symbol: "VIC",
			timeframe: "1D",
			lastDatum: mockLastDatum,
			isDark: true,
		});
		expect(screen.getByText("Vol")).toBeDefined();
	});
});


