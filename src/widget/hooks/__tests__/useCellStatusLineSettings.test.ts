// @vitest-environment jsdom
// UIUX_STATUSLINE_MULTI — lock cho hook đọc 4 cờ `statusLine` theo chartId.
//
// Vì sao: ô multi không có `OHLCHeader` (cell pin `showHeader={false}`) ⇒ hàng toolbar của ô là
// `PricePaneHeader` và nó **không** nằm trong `SettingsContext` của chart ⇒ phải đọc composite
// **scoped theo chartId** + nghe `vnsc-settings-sync` (lọc theo chartId).
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useCellStatusLineSettings, readCellStatusLineFlags } from "../useCellStatusLineSettings";

function memoryAdapter(initial: Record<string, string> = {}) {
	const store: Record<string, string> = { ...initial };
	return {
		store,
		adapter: {
			getItem: (k: string) => store[k] ?? null,
			setItem: (k: string, v: string) => {
				store[k] = v;
			},
			removeItem: (k: string) => {
				delete store[k];
			},
			clear: () => {
				for (const k of Object.keys(store)) delete store[k];
			},
		} as never,
	};
}

beforeEach(() => {
	window.localStorage.clear();
});

describe("useCellStatusLineSettings", () => {
	it("mặc định: cả 4 cờ ON khi composite không có", () => {
		const { adapter } = memoryAdapter();
		const { result } = renderHook(() => useCellStatusLineSettings("cell-1", adapter));
		expect(result.current).toEqual({ showTicker: true, showOHLC: true, showBarChange: true, showVolume: true });
	});

	it("đọc composite scoped theo chartId (khoá `showOhlc`)", () => {
		const { adapter } = memoryAdapter({
			"vnsc_chart_settings_v1_cell-1": JSON.stringify({ statusLine: { showOhlc: false, showTicker: false } }),
			"vnsc_chart_settings_v1_cell-2": JSON.stringify({ statusLine: { showOhlc: true } }),
		});
		const { result } = renderHook(() => useCellStatusLineSettings("cell-1", adapter));
		expect(result.current.showOHLC).toBe(false);
		expect(result.current.showTicker).toBe(false);
		expect(result.current.showBarChange).toBe(true);
	});

	it("hỗ trợ alias legacy `showOHLC`", () => {
		const { adapter } = memoryAdapter({
			"vnsc_chart_settings_v1_cell-1": JSON.stringify({ statusLine: { showOHLC: false } }),
		});
		const { result } = renderHook(() => useCellStatusLineSettings("cell-1", adapter));
		expect(result.current.showOHLC).toBe(false);
	});

	it("áp dụng LIVE khi event mang đúng chartId", () => {
		const { adapter } = memoryAdapter();
		const { result } = renderHook(() => useCellStatusLineSettings("cell-1", adapter));
		act(() => {
			window.dispatchEvent(
				new CustomEvent("vnsc-settings-sync", {
					detail: { chartId: "cell-1", state: { statusLine: { showOhlc: false, showVolume: false } } },
				}),
			);
		});
		expect(result.current.showOHLC).toBe(false);
		expect(result.current.showVolume).toBe(false);
	});

	it("BỎ QUA event của chart khác (envelope theo chartId)", () => {
		const { adapter } = memoryAdapter();
		const { result } = renderHook(() => useCellStatusLineSettings("cell-1", adapter));
		act(() => {
			window.dispatchEvent(
				new CustomEvent("vnsc-settings-sync", {
					detail: { chartId: "cell-2", state: { statusLine: { showOhlc: false } } },
				}),
			);
		});
		expect(result.current.showOHLC).toBe(true);
	});

	it("bỏ qua event global khi ô có chartId (không nhận nhầm của workspace)", () => {
		const { adapter } = memoryAdapter();
		const { result } = renderHook(() => useCellStatusLineSettings("cell-1", adapter));
		act(() => {
			window.dispatchEvent(
				new CustomEvent("vnsc-settings-sync", {
					detail: { chartId: null, state: { statusLine: { showOhlc: false } } },
				}),
			);
		});
		expect(result.current.showOHLC).toBe(true);
	});

	it("readCellStatusLineFlags: đọc trực tiếp 1 section", () => {
		expect(readCellStatusLineFlags({ showOhlc: false, showBarChange: false })).toEqual({
			showTicker: true,
			showOHLC: false,
			showBarChange: false,
			showVolume: true,
		});
		expect(readCellStatusLineFlags(null)).toEqual({
			showTicker: true,
			showOHLC: true,
			showBarChange: true,
			showVolume: true,
		});
	});
});
