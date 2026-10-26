// @vitest-environment jsdom
// UIUX_AC_RUNTIME_2026-10-21 — regression lock cho `statusLine.showVolume` ở surface SINGLE.
//
// VÌ SAO: cờ `settings.statusLine.showVolume` chỉ được nối ở ô MULTI
// (`CellPricePaneHeader` → `PricePaneHeader`). Ở SINGLE, dòng status trong pane bị ẩn
// (chế độ SINGLE-OHLC) ⇒ `OHLCHeader` là nơi DUY NHẤT có thể hiện Vol, nhưng nó khai
// `ohlcData.volume?` mà không render ⇒ cờ CHẾT ở single (pre-existing).
//
// Khoá hành vi: bật ⇒ có "Vol"; tắt/mặc định ⇒ không có. Assert phải ĐỎ nếu fix bị revert.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { OHLCHeader } from "../OHLCHeader";

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

beforeEach(() => {
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

function renderHeader(props: Record<string, unknown>) {
	act(() => {
		root?.render(createElement(OHLCHeader, {
			symbol: "BTCUSDT",
			timeframe: "1h",
			showOHLCV: true,
			ohlcData: { open: 100, high: 110, low: 95, close: 105 },
			...props,
		}));
	});
	return container?.querySelector('[data-testid="ohlc-cluster"]');
}

describe("OHLCHeader showVolume (statusLine.showVolume ở single)", () => {
	it("showVolume=true + có volume ⇒ hiện nhãn Vol trong cụm O/H/L/C", () => {
		const cluster = renderHeader({
			showVolume: true,
			ohlcData: { open: 100, high: 110, low: 95, close: 105, volume: 204222 },
		});
		expect(cluster).not.toBeNull();
		expect(cluster?.textContent).toContain("Vol");
		expect(cluster?.textContent).toContain("204K");
	});

	it("showVolume=false ⇒ KHÔNG có nhãn Vol (fail-closed: revert fix ⇒ test đỏ)", () => {
		const cluster = renderHeader({
			showVolume: false,
			ohlcData: { open: 100, high: 110, low: 95, close: 105, volume: 204222 },
		});
		expect(cluster).not.toBeNull();
		expect(cluster?.textContent).not.toContain("Vol");
	});

	it("mặc định (prop không truyền) ⇒ KHÔNG có Vol ⇒ không đổi hành vi call site cũ", () => {
		const cluster = renderHeader({
			ohlcData: { open: 100, high: 110, low: 95, close: 105, volume: 204222 },
		});
		expect(cluster?.textContent).not.toContain("Vol");
	});

	it("showVolume=true nhưng dữ liệu không có volume ⇒ KHÔNG render Vol rỗng", () => {
		const cluster = renderHeader({
			showVolume: true,
			ohlcData: { open: 100, high: 110, low: 95, close: 105 },
		});
		expect(cluster?.textContent).not.toContain("Vol");
	});

	it("showVolume chỉ ẩn Vol, KHÔNG ẩn O/H/L/C", () => {
		const cluster = renderHeader({
			showVolume: false,
			ohlcData: { open: 100, high: 110, low: 95, close: 105, volume: 204222 },
		});
		expect(cluster?.textContent).toContain("O");
		expect(cluster?.textContent).toContain("100.00");
		expect(cluster?.textContent).toContain("C");
		expect(cluster?.textContent).toContain("105.00");
	});
});
