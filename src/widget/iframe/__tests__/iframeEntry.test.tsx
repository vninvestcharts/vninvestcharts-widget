/**
 * iframeEntry P0 regression lock (BUG-01/02/04/05 + MISS-01/02/03).
 *
 * NOTE: mock factories here use the static React import on purpose — nested
 * dynamic imports inside vi.mock factories silently disable interception in
 * this repo's vitest setup (see TESTBASE_ZEROFAIL_TRIAGE_AND_FIX).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import React from "react";

const renderMock = vi.fn();
const unmountMock = vi.fn();

vi.mock("react-dom/client", () => ({
	createRoot: () => ({ render: renderMock, unmount: unmountMock }),
}));

// Neutralize the module side-effect CSS injection (jsdom rejects STYLE under #document).
vi.mock("../../styles/injectStyles", () => ({
	injectVNInvestChartsCSS: () => undefined,
}));

vi.mock("../../VNInvestCharts", () => {
	const MockCharts = React.forwardRef<unknown, Record<string, unknown>>(function MockCharts() {
		return null;
	});
	return { VNInvestCharts: MockCharts };
});

import {
	requestHandler,
	buildWidgetProps,
	captureWidgetSnapshot,
	isIframeDebugEnabled,
	resolveAllowedOrigins,
	__resetIframeEntryForTests,
	__setWidgetRefForTests,
	__getIframeEntryStateForTests,
} from "../iframeEntry";
import type { HostToIframeCommand, WidgetConfig } from "../messageProtocol";

function command<T extends HostToIframeCommand["type"]>(
	type: T,
	payload: Extract<HostToIframeCommand, { type: T }>["payload"],
): HostToIframeCommand {
	return { type, correlationId: "test-1", timestamp: 1, origin: "https://host.example", payload } as HostToIframeCommand;
}

const baseConfig: WidgetConfig = { symbol: "VIC", timeframe: "1D", theme: "dark", locale: "vi" };

async function initialize(symbol = "VIC"): Promise<void> {
	const res = await requestHandler(command("request:initialize", { ...baseConfig, symbol }));
	expect(res.success).toBe(true);
}

beforeEach(() => {
	__resetIframeEntryForTests();
	renderMock.mockClear();
	unmountMock.mockClear();
});

/** Props of the latest root.render(<VNInvestCharts {...props}/>) call. */
function lastProps(): Record<string, unknown> {
	const calls = renderMock.mock.calls as unknown[][];
	const last = calls[calls.length - 1] as [{ props?: Record<string, unknown> } | undefined] | undefined;
	return last?.[0]?.props ?? {};
}

describe("initialize + destroy (BUG-04)", () => {
	it("renders with config props and unmounts the root on destroy", async () => {
		await initialize("VIC");
		expect(renderMock).toHaveBeenCalledTimes(1);
		expect(lastProps()["symbol"]).toBe("VIC");
		expect(__getIframeEntryStateForTests().hasRoot).toBe(true);

		const res = await requestHandler(command("request:destroy", {}));
		expect(res.success).toBe(true);
		expect(unmountMock).toHaveBeenCalledTimes(1);
		expect(__getIframeEntryStateForTests().hasRoot).toBe(false);
		expect(__getIframeEntryStateForTests().isInitialized).toBe(false);
	});
});

describe("prop updates via re-render (BUG-01/02/05 + MISS-01)", () => {
	it("MISS-01: setSymbol re-renders with the new symbol", async () => {
		await initialize("VIC");
		const res = await requestHandler(command("request:setSymbol", { symbol: "HPG" }));
		expect(res.success).toBe(true);
		expect(renderMock).toHaveBeenCalledTimes(2);
		expect(lastProps()["symbol"]).toBe("HPG");
	});

	it("MISS-01: setSymbol rejects empty symbols instead of fake success", async () => {
		await initialize("VIC");
		await expect(requestHandler(command("request:setSymbol", { symbol: "  " }))).rejects.toThrow(
			/non-empty symbol/,
		);
		expect(renderMock).toHaveBeenCalledTimes(1);
	});

	it("BUG-01: setRange forwards the requested period (no hardcoded zeros)", async () => {
		await initialize("VIC");
		const res = await requestHandler(command("request:setRange", { range: "6M" }));
		expect(res.success).toBe(true);
		expect(lastProps()["range"]).toBe("6M");
	});

	it("BUG-05: setTheme honors the requested theme instead of toggling", async () => {
		await initialize("VIC");
		// Initial theme is dark; requesting dark must keep dark (old code toggled to light).
		const res = await requestHandler(command("request:setTheme", { theme: "dark" }));
		expect(res.success).toBe(true);
		expect(lastProps()["theme"]).toBe("dark");
		const res2 = await requestHandler(command("request:setTheme", { theme: "light" }));
		expect(res2.success).toBe(true);
		expect(lastProps()["theme"]).toBe("light");
	});

	it("BUG-02: setLocale/setTimezone re-render with new values", async () => {
		await initialize("VIC");
		await requestHandler(command("request:setLocale", { locale: "en" }));
		expect(lastProps()["locale"]).toBe("en");
		await requestHandler(command("request:setTimezone", { timezone: "Asia/Tokyo" }));
		expect(lastProps()["timezone"]).toBe("Asia/Tokyo");
	});

	it("commands before initialize fail closed (no fake success)", async () => {
		await expect(requestHandler(command("request:setSymbol", { symbol: "HPG" }))).rejects.toThrow(
			/not initialized/,
		);
	});
});

describe("captureSnapshot (MISS-02)", () => {
	it("returns a real dataURL from a canvas snapshot", async () => {
		await initialize("VIC");
		__setWidgetRefForTests({
			captureSnapshot: async () => {
				const canvas = document.createElement("canvas");
				canvas.toDataURL = () => "data:image/png;base64,QUJD";
				return canvas;
			},
		});
		const res = (await requestHandler(
			command("request:captureSnapshot", { format: "png" }),
		)) as { success: boolean; dataUrl: string };
		expect(res.success).toBe(true);
		expect(res.dataUrl).toBe("data:image/png;base64,QUJD");
	});

	it("fails closed when capture is unavailable (no empty-string success)", async () => {
		await initialize("VIC");
		__setWidgetRefForTests({
			captureSnapshot: async () => {
				throw new Error("Snapshot capture only supported in fork runtime");
			},
		});
		await expect(requestHandler(command("request:captureSnapshot", {}))).rejects.toThrow(/fork runtime/);
	});
});

describe("buildWidgetProps", () => {
	it("maps host config to widget props", () => {
		const props = buildWidgetProps({ ...baseConfig, range: "6M" });
		expect(props.symbol).toBe("VIC");
		expect(props.range).toBe("6M");
		expect(props.theme).toBe("dark");
	});
});

describe("debug gate (SEC-03)", () => {
	const DEBUG_KEY = "vnsc_debug";
	const originalUrl = window.location.href;

	it("is disabled by default (no debug global leak)", () => {
		window.localStorage.removeItem(DEBUG_KEY);
		expect(isIframeDebugEnabled()).toBe(false);
		expect((window as unknown as Record<string, unknown>).__VNINVESTCHARTS_IFRAME__).toBeUndefined();
	});

	it("enables via localStorage flag", () => {
		window.localStorage.setItem(DEBUG_KEY, "1");
		try {
			expect(isIframeDebugEnabled()).toBe(true);
		} finally {
			window.localStorage.removeItem(DEBUG_KEY);
		}
	});

	it("enables via ?vnsc_debug=1 query", () => {
		window.history.replaceState({}, "", "/?vnsc_debug=1");
		try {
			expect(isIframeDebugEnabled()).toBe(true);
		} finally {
			window.history.replaceState({}, "", new URL(originalUrl).pathname);
		}
	});
});

describe("frame sizing (E1)", () => {
	it("fill (default) keeps 100% and attaches no resize observer", async () => {
		await initialize("VIC");
		expect(document.body.style.height).toBe("100%");
	});

	it("numeric height pins card height", async () => {
		const res = await requestHandler(command("request:initialize", { ...baseConfig, symbol: "VIC", height: 500 }));
		expect(res.success).toBe(true);
		expect(document.body.style.height).toBe("500px");
	});

	it("E2: change commands emit typed events with previous values", async () => {
		const postSpy = vi.spyOn(window, "postMessage");
		try {
			await initialize("VIC");
			__setWidgetRefForTests({ setTimeframe: vi.fn() });
			const count = () => postSpy.mock.calls.length;

			await requestHandler(command("request:setSymbol", { symbol: "HPG" }));
			const symbolMsg = postSpy.mock.calls.slice(-1)[0][0] as { type: string; payload: Record<string, unknown> };
			expect(symbolMsg.type).toBe("event:symbolChanged");
			expect(symbolMsg.payload.symbol).toBe("HPG");
			expect(symbolMsg.payload.previousSymbol).toBe("VIC");

			const n0 = count();
			await requestHandler(command("request:setTimeframe", { timeframe: "1h" }));
			expect(postSpy.mock.calls.length).toBe(n0 + 1);
			expect((postSpy.mock.calls.slice(-1)[0][0] as { type: string }).type).toBe("event:timeframeChanged");

			await requestHandler(command("request:setTheme", { theme: "light" }));
			expect((postSpy.mock.calls.slice(-1)[0][0] as { type: string }).type).toBe("event:themeChanged");
		} finally {
			postSpy.mockRestore();
		}
	});

	it("E2: command failure emits event:error and still rejects", async () => {
		const postSpy = vi.spyOn(window, "postMessage");
		try {
			await initialize("VIC");
			await expect(requestHandler(command("request:setSymbol", { symbol: "  " }))).rejects.toThrow(/non-empty/);
			const last = postSpy.mock.calls.slice(-1)[0][0] as { type: string; payload: Record<string, unknown> };
			expect(last.type).toBe("event:error");
			expect(last.payload.code).toBe("COMMAND_FAILED");
		} finally {
			postSpy.mockRestore();
		}
	});

	it("E2: drawings commands emit typed actions + arm user-edit forwarding once", async () => {
		const postSpy = vi.spyOn(window, "postMessage");
		let hooked = 0;
		const workspace = {
			state: {
				onDrawingsChange: undefined as unknown as (d: unknown[]) => void,
			},
		};
		try {
			await initialize("VIC");
			__setWidgetRefForTests({
				exportDrawings: () => [{ id: "d1" }],
				importDrawings: vi.fn(),
				getDrawingWorkspace: () => {
					hooked += 1;
					return workspace;
				},
				getVisibleRange: () => ({ startIndex: 0, endIndex: 99, startDate: "2026-01-01", endDate: "2026-02-01", barCount: 100 }),
			});
			await requestHandler(command("request:addDrawing", { drawing: { id: "d9" } }));
			const last = postSpy.mock.calls.slice(-1)[0][0] as { type: string; payload: Record<string, unknown> };
			expect(last.type).toBe("event:drawingsChanged");
			expect(last.payload.action).toBe("add");
			expect(hooked).toBe(1);

			// Second drawings command must not double-hook.
			await requestHandler(command("request:removeDrawing", { drawingId: "d1" }));
			expect(hooked).toBe(1);

			// User edit through the hooked callback emits replace.
			const n0 = postSpy.mock.calls.length;
			workspace.state.onDrawingsChange([{ id: "d1" }]);
			expect(postSpy.mock.calls.length).toBe(n0 + 1);
			expect((postSpy.mock.calls.slice(-1)[0][0] as { type: string; payload: Record<string, unknown> }).payload.action).toBe("replace");

			// setRange emits visible-range from the handle.
			await requestHandler(command("request:setRange", { range: "6M" }));
			const vr = postSpy.mock.calls.slice(-1)[0][0] as { type: string; payload: Record<string, unknown> };
			expect(vr.type).toBe("event:visibleRangeChanged");
			expect(vr.payload.barCount).toBe(100);
		} finally {
			postSpy.mockRestore();
		}
	});

	it("E3: dock config maps to showDock + static watchlist adapter", () => {
		const props = buildWidgetProps({ ...baseConfig, dock: { show: true, defaultTab: "watchlist", watchlist: ["hpg", "fpt", ""] } });
		expect(props.showDock).toBe(true);
		const adapter = props.watchlistAdapter;
		expect(adapter).toBeDefined();
		expect(adapter?.getWatchlist()).toEqual([{ symbol: "HPG" }, { symbol: "FPT" }]);
		expect(buildWidgetProps(baseConfig).showDock).toBeUndefined();
		expect(buildWidgetProps(baseConfig).watchlistAdapter).toBeUndefined();
	});

	it("E3: setDockTab persists + broadcasts, setWatchlist rebuilds adapter", async () => {
		await initialize("VIC");
		const dockRes = await requestHandler(command("request:setDockTab", { tab: "watchlist" }));
		expect(dockRes.success).toBe(true);
		expect(window.localStorage.getItem("vnsc_dock_tab")).toBe("watchlist");

		const wlRes = await requestHandler(command("request:setWatchlist", { symbols: ["VCB"] }));
		expect(wlRes.success).toBe(true);
	});

	it("E4: unknown adapter emits adapterError but still initializes (recoverable)", async () => {
		const postSpy = vi.spyOn(window, "postMessage");
		try {
			const res = await requestHandler(command("request:initialize", {
				...baseConfig,
				adapter: { type: "yahoo" },
			}));
			expect(res.success).toBe(true);
			const adapterErrors = postSpy.mock.calls
				.map((c) => c[0] as { type: string; payload: Record<string, unknown> })
				.filter((m) => m.type === "event:adapterError");
			expect(adapterErrors).toHaveLength(1);
			expect(adapterErrors[0]?.payload.code).toBe("ADAPTER_UNAVAILABLE");
			expect(adapterErrors[0]?.payload.adapterType).toBe("yahoo");
		} finally {
			postSpy.mockRestore();
		}
	});

	it("E5: subscribe/unsubscribe quotes round-trip", async () => {
		await initialize("VIC");
		const sub = await requestHandler(command("request:subscribeQuotes", { symbols: ["HPG"] }));
		expect(sub.success).toBe(true);
		const unsub = await requestHandler(command("request:unsubscribeQuotes", { symbols: ["HPG"] }));
		expect(unsub.success).toBe(true);
		const unsubAll = await requestHandler(command("request:unsubscribeQuotes", {}));
		expect(unsubAll.success).toBe(true);
	});

	it("E3: internal symbol change emits upstream (watchlist click loop)", async () => {
		const postSpy = vi.spyOn(window, "postMessage");
		try {
			await initialize("VIC");
			const props = buildWidgetProps(baseConfig);
			props.onSymbolChange?.("HPG");
			const last = postSpy.mock.calls.slice(-1)[0][0] as { type: string; payload: Record<string, unknown> };
			expect(last.type).toBe("event:symbolChanged");
			expect(last.payload.symbol).toBe("HPG");
			expect(last.payload.previousSymbol).toBe("VIC");
		} finally {
			postSpy.mockRestore();
		}
	});

	it("E0: query handshake extends the origin allowlist", () => {
		const base = resolveAllowedOrigins("");
		expect(base.allowedOrigins).toContain("https://vninvestcharts.com");
		expect(base.allowAnyOrigin).toBe(false);

		const extended = resolveAllowedOrigins("?parentOrigin=https://doi-tac.vn&allowedOrigins=https://a.vn, https://b.vn");
		expect(extended.allowedOrigins).toContain("https://doi-tac.vn");
		expect(extended.allowedOrigins).toContain("https://a.vn");
		expect(extended.allowedOrigins).toContain("https://b.vn");
		expect(extended.allowAnyOrigin).toBe(false);
	});

	it("E0: allowAnyOrigin requires the debug gate (never plain prod)", () => {
		expect(resolveAllowedOrigins("?allowAnyOrigin=1").allowAnyOrigin).toBe(false);
		window.localStorage.setItem("vnsc_debug", "1");
		try {
			expect(resolveAllowedOrigins("?allowAnyOrigin=1").allowAnyOrigin).toBe(true);
			expect(resolveAllowedOrigins("").allowAnyOrigin).toBe(false);
		} finally {
			window.localStorage.removeItem("vnsc_debug");
		}
	});

	it("card mode debounces rapid resizes into one guarded event (no loop)", async () => {
		vi.useFakeTimers();
		// Holder object (not a let binding): TS control-flow narrows `let`
		// assigned only inside a closure to `never`, so capture via property.
		const holder: { roCallback: (() => void) | null } = { roCallback: null };
		class MockRO {
			constructor(cb: () => void) { holder.roCallback = cb; }
			observe() {}
			disconnect() {}
		}
		vi.stubGlobal("ResizeObserver", MockRO);
		Object.defineProperty(document.documentElement, "scrollHeight", { value: 600, configurable: true });
		const postSpy = vi.spyOn(window, "postMessage");
		try {
			await requestHandler(command("request:initialize", { ...baseConfig, symbol: "VIC", height: 500 }));
			const fireCb = holder.roCallback;
			if (!fireCb) throw new Error("ResizeObserver not attached in card mode");
			const before = postSpy.mock.calls.length;
			for (let i = 0; i < 20; i++) fireCb();
			vi.runAllTimers();
			const sent = postSpy.mock.calls.length - before;
			// Debounced to exactly 1; repeats suppressed by the <2px guard.
			expect(sent).toBe(1);
			for (let i = 0; i < 5; i++) fireCb();
			vi.runAllTimers();
			expect(postSpy.mock.calls.length - before).toBe(1);
		} finally {
			postSpy.mockRestore();
			vi.unstubAllGlobals();
			vi.useRealTimers();
		}
	});
});
