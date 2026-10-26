// @vitest-environment jsdom
// UI-A regression lock: density-aware OHLC legend never truncates figures.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement, type RefObject } from "react";
import { createRoot } from "react-dom/client";
import { PricePaneHeader } from "../PricePaneHeader";
import { SaaSFeatureProvider } from "../../../contexts/SaaSFeatureContext";
import { createHoverEmitter, emitHover, type HoverEmitter } from "../../../context/HoverEmitter";
import type { EnrichedDatum } from "../../../../lib/core/calculators/types";
import type { PaneDescriptor } from "../../../../lib/core/types/pane-descriptor";

type ROCallback = (entries: Array<{ contentRect: { width: number } }>) => void;
let roCallback: ROCallback | null = null;

class MockResizeObserver {
	constructor(cb: ROCallback) {
		roCallback = cb;
	}
	observe() {}
	unobserve() {}
	disconnect() {}
}

vi.stubGlobal("ResizeObserver", MockResizeObserver);

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

const datum = {
	date: new Date("2026-09-01T00:00:00Z"),
	open: 79420.16,
	high: 79535.73,
	low: 79400.48,
	close: 79529.24,
	volume: 204222.46,
} as unknown as EnrichedDatum;

function renderHeader(extra?: Record<string, unknown>) {
	const emitter = createHoverEmitter();
	const hoverEmitterRef = { current: emitter } as RefObject<HoverEmitter | null>;
	act(() => {
		root?.render(
			createElement(
				SaaSFeatureProvider,
				null,
				createElement(PricePaneHeader, {
					pane: { id: "price" } as PaneDescriptor,
					symbol: "BTCUSDT",
					timeframe: "1h",
					chartId: "c1",
					hoverEmitterRef,
					actions: {
						toggleVisibility() {},
						removePane() {},
						addSeries() {},
						toggleSeries() {},
						removeSeries() {},
					},
					...extra,
				}),
			),
		);
	});
	act(() => {
		emitHover(emitter, { datum, pixelX: 10, pixelY: 10, paneId: "price" });
	});
}

function setHeaderWidth(w: number) {
	act(() => {
		roCallback?.([{ contentRect: { width: w } }]);
	});
}

beforeEach(() => {
	roCallback = null;
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(() => {
	if (root) act(() => { root?.unmount(); });
	root = null;
	container?.remove();
	container = null;
});

describe("PricePaneHeader density legend (UI-A)", () => {
	it("renders full prefixed OHLC + Vol at wide width", () => {
		renderHeader();
		setHeaderWidth(800);
		const text = container?.textContent ?? "";
		expect(container?.querySelector("[data-density]")?.getAttribute("data-density")).toBe("full");
		expect(text).toContain("O:");
		expect(text).toContain("H:");
		expect(text).toContain("C:");
		expect(text).toContain("Vol:");
		// Full close figure present (international grouping), never ellipsis-cut.
		expect(text).toContain("79,529.24");
		expect(text).not.toMatch(/C:7\.\.\.|C:63\.0\.\.\./);
	});

	it("renders subtle 1-letter O/H/L/C labels without colon at compact width", () => {
		renderHeader();
		setHeaderWidth(400);
		const text = container?.textContent ?? "";
		expect(container?.querySelector("[data-density]")?.getAttribute("data-density")).toBe("compact");
		expect(text).toContain("O");
		expect(text).toContain("H");
		expect(text).toContain("L");
		expect(text).toContain("C");
		expect(text).not.toContain("O:");
		expect(text).not.toContain("H:");
		expect(text).toContain("79,529.24");
		expect(text).toContain("Vol:");
	});

	it("keeps full O/H/L/C figures at compact width (never close-only)", () => {
		// OHLC-COMPLETE lock: compact must degrade type size, not drop
		// figures — the O/H/L bare values stay in the DOM (a past CSS rule
		// hid .ohlcItem at compact, showing close-only on narrow cells).
		renderHeader();
		setHeaderWidth(400);
		const text = container?.textContent ?? "";
		expect(text).toContain("79,420.16");
		expect(text).toContain("79,535.73");
		expect(text).toContain("79,400.48");
		expect(text).toContain("79,529.24");
	});

	it("renders close-only legend without Vol at minimal width", () => {
		renderHeader();
		setHeaderWidth(200);
		const text = container?.textContent ?? "";
		expect(container?.querySelector("[data-density]")?.getAttribute("data-density")).toBe("minimal");
		expect(text).toContain("C:79,529.24");
		expect(text).not.toContain("Vol:");
	});

	it("never renders inline ellipsis truncation on the legend", () => {
		renderHeader();
		setHeaderWidth(200);
		expect(container?.innerHTML ?? "").not.toContain("text-overflow");
		expect(container?.innerHTML ?? "").not.toContain("…");
	});

	it("keeps the OHLC readout mounted while hovered (HOVER_FIX)", () => {
		// Hover used to swap the readout for hover-only toolbar `children`
		// (display:none) — but no production consumer passes children, so
		// every figure vanished leaving a bare symbol row. textContent alone
		// cannot catch this (it ignores display), so assert the markup.
		renderHeader();
		setHeaderWidth(800);
		const headerEl = container?.firstElementChild as HTMLElement | null;
		expect(headerEl).not.toBeNull();
		act(() => {
			headerEl!.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
		});
		expect(container?.innerHTML ?? "").not.toContain("display: none");
		expect(container?.textContent ?? "").toContain("79,529.24");
		expect(container?.textContent ?? "").toContain("O:");
	});

	it("V-03: colors all OHLC by direction (single up/down pair)", () => {
		renderHeader();
		setHeaderWidth(800);
		const html = container?.innerHTML ?? "";
		// Bullish datum (close 79529 > open 79420): bull class present, bear absent.
		expect(html).toContain("ohlcBull");
		expect(html).not.toContain("ohlcBear");
		expect(html).not.toContain("ohlcOpen");
		expect(html).not.toContain("ohlcClose");
	});
});

// UIUX_STATUSLINE_MULTI: 4 cờ `statusLine` phải điều khiển hàng toolbar của ô multi
// (sau khi bỏ dải header trùng, đây là nơi DUY NHẤT hiện mã + O/H/L/C + Vol của ô).
describe("PricePaneHeader statusLine flags", () => {
	it("mặc định: hiện mã + O/H/L/C + % + Vol", () => {
		renderHeader();
		setHeaderWidth(800);
		const text = container?.textContent ?? "";
		expect(text).toContain("BTCUSDT");
		expect(text).toContain("O:");
		expect(text).toContain("Vol:");
	});

	it("showTicker=false ⇒ ẩn mã + exchange tag", () => {
		renderHeader({ showTicker: false });
		setHeaderWidth(800);
		const text = container?.textContent ?? "";
		expect(text).not.toContain("BTCUSDT");
		expect(text).not.toContain("BYBIT");
		// OHLC vẫn còn (chỉ ẩn mã).
		expect(text).toContain("O:");
	});

	it("showOHLC=false ⇒ ẩn O/H/L/C (kèm %) nhưng GIỮ Vol", () => {
		renderHeader({ showOHLC: false });
		setHeaderWidth(800);
		const text = container?.textContent ?? "";
		expect(text).not.toContain("O:");
		expect(text).not.toContain("H:");
		expect(text).not.toContain("L:");
		expect(text).not.toContain("C:");
		expect(text).toContain("Vol:");
	});

	it("showBarChange=false ⇒ ẩn % nhưng GIỮ O/H/L/C", () => {
		renderHeader({ showBarChange: false });
		setHeaderWidth(800);
		const text = container?.textContent ?? "";
		expect(text).toContain("O:");
		expect(text).not.toContain("+");
	});

	it("showVolume=false ⇒ ẩn Vol nhưng GIỮ O/H/L/C", () => {
		renderHeader({ showVolume: false });
		setHeaderWidth(800);
		const text = container?.textContent ?? "";
		expect(text).toContain("O:");
		expect(text).not.toContain("Vol:");
	});
});
