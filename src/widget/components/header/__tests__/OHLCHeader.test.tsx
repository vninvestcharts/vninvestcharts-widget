// @vitest-environment jsdom
// CT-P2 regression lock, UPDATED 2026-09-29 (A3/A11 shipped).
//
// LỊCH SỬ: bản đầu khoá "Renko/Kagi disabled + badge Coming soon". Đó là cờ
// KỸ THUẬT đúng lúc đó: `registerSeries` + key map mà không có case riêng thì
// chart hiện lên và vẽ y hệt đường Line dưới nhãn khác. Nay cả ba tầng đã có
// (producer · resolver · render mode của engine) nên `comingSoon` hạ xuống, và
// cờ chuyển thành CỔNG CAPABILITY `chart_exotic` / `chart_baseline`.
// Bản này khoá hành vi MỚI, kể cả việc fail-closed khi tier chưa biết.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
	// Menu được portal ra document.body: dọn để test sau không thấy menu cũ.
	for (const stale of Array.from(document.querySelectorAll('[role="listbox"]'))) {
		stale.remove();
	}
});

function openChartTypeMenu(onChartTypeChange: (ct: string) => void, patTier?: string) {
	act(() => {
		root?.render(createElement(OHLCHeader, {
			symbol: "BTCUSDT",
			timeframe: "1h",
			chartType: "candlestick",
			onChartTypeChange,
			...(patTier === undefined ? {} : { patTier }),
		}));
	});
	const toggle = container?.querySelector('button[aria-haspopup="listbox"]') as HTMLButtonElement | null;
	act(() => {
		toggle?.click();
	});
}

/** Option của một chart type, bất kể đang khoá hay không. */
function optionByValue(value: string) {
	// CLIP-FIX: menu portal ra document.body — phải query document, không container.
	return document.querySelector(`[data-chart-type="${value}"]`) as HTMLElement | null;
}

/** Option tên `label` (dùng cho các loại không gắn capability). */
function optionByLabel(pattern: RegExp) {
	return Array.from(document.querySelectorAll('[role="option"]') ?? []).find((el) =>
		pattern.test(el.textContent || ""),
	) as HTMLElement | undefined;
}

describe("OHLCHeader chart-type gating (CT-P2, A3/A11)", () => {
	it("tier CHƯA biết ⇒ Renko bị khoá, và click không đổi chart type", () => {
		const onChartTypeChange = vi.fn();
		openChartTypeMenu(onChartTypeChange);
		const renko = optionByValue("renko");
		expect(renko).not.toBeNull();
		expect(renko?.getAttribute("aria-disabled")).toBe("true");
		// Cờ `comingSoon` đã bị hạ xuống: đây là khoá theo TIER, không phải "chưa làm".
		expect(renko?.getAttribute("data-coming-soon")).toBeNull();
		expect(renko?.textContent).toMatch(/Renko/);
		act(() => {
			renko?.click();
		});
		expect(onChartTypeChange).not.toHaveBeenCalled();
	});

	it("tier `free` khoá cả NĂM chart type pro; tên vẫn hiện kèm badge Pro (user phải biết là có tính năng)", () => {
		const onChartTypeChange = vi.fn();
		openChartTypeMenu(onChartTypeChange, "free");
		const lockedValues = Array.from(document.querySelectorAll("[data-locked]"))
			.map((el) => el.getAttribute("data-locked") ?? "")
			.filter((value) => value.length > 0)
			.sort();
		// ĐẢO CHIỀU (2026-09-29, f2-pfn-linebreak): latch cũ là `["baseline",
		// "kagi", "renko"]` — "cả ba". Nay `chart_exotic` có đủ BỐN loại
		// (renko, kagi, lineBreak, pointAndFigure) cùng `chart_baseline`, nên
		// danh sách khoá ở tier free phải dài ra. Danh sách viết TAY, không suy
		// ra từ bảng, để một loại chart type mới mà quên gắn capability sẽ lọt qua
		// chỗ này và bị bắt bởi `chartTypeCapability.test.tsx`.
		expect(lockedValues).toEqual(["baseline", "kagi", "lineBreak", "pointAndFigure", "renko"]);
		for (const value of lockedValues) {
			expect(optionByValue(value)?.textContent, value).toMatch(/Pro/);
		}
		for (const value of lockedValues) {
			act(() => { optionByValue(value)?.click(); });
		}
		expect(onChartTypeChange).not.toHaveBeenCalled();
	});

	it("tier `pro` mở cả năm và chọn được — đây là mutation target của `isChartTypeLocked`", () => {
		const onChartTypeChange = vi.fn();
		openChartTypeMenu(onChartTypeChange, "pro");
		for (const value of ["baseline", "renko", "kagi", "pointAndFigure", "lineBreak"]) {
			const element = optionByValue(value);
			expect(element, value).not.toBeNull();
			expect(element?.getAttribute("aria-disabled"), value).toBe("false");
		}
		act(() => { optionByValue("renko")?.click(); });
		expect(onChartTypeChange).toHaveBeenCalledWith("renko");
	});

	it("tier `enterprise` cũng mở — khoá bằng `tier === 'pro'` sẽ chặn cả tier đã trả tiền", () => {
		openChartTypeMenu(vi.fn(), "enterprise");
		for (const value of ["baseline", "renko", "kagi", "pointAndFigure", "lineBreak"]) {
			expect(optionByValue(value)?.getAttribute("aria-disabled"), value).toBe("false");
		}
	});

	it("ở tier pro không còn option `comingSoon` nào, và mọi option đều chọn được", () => {
		openChartTypeMenu(vi.fn(), "pro");
		const options = Array.from(document.querySelectorAll('[role="option"]')) as HTMLElement[];
		expect(options.length).toBeGreaterThan(0);
		expect(document.querySelectorAll("[data-coming-soon]")).toHaveLength(0);
		for (const item of options) {
			expect(item.getAttribute("aria-disabled"), item.textContent).not.toBe("true");
		}
	});

	it("loại miễn phí (Line) chọn được ở mọi tier, kể cả tier chưa biết", () => {
		for (const tier of [undefined, "free", "pro"]) {
			const onChartTypeChange = vi.fn();
			openChartTypeMenu(onChartTypeChange, tier);
			const line = optionByLabel(/line|đường/i);
			expect(line?.getAttribute("aria-disabled"), String(tier)).not.toBe("true");
			act(() => {
				line?.click();
			});
			expect(onChartTypeChange, String(tier)).toHaveBeenCalledWith("line");
		}
	});
});

describe("OHLCHeader chart-type menu portal (CLIP-FIX)", () => {
	it("portals the open menu to document.body (escapes header overflow-x:auto)", () => {
		openChartTypeMenu(vi.fn());
		const menu = document.querySelector('[role="listbox"]') as HTMLElement | null;
		expect(menu).not.toBeNull();
		// Not clipped inside the header container anymore.
		expect(container?.contains(menu)).toBe(false);
		expect(menu?.parentElement).toBe(document.body);
	});

	it("closes the portal menu on option select", () => {
		const onChartTypeChange = vi.fn();
		openChartTypeMenu(onChartTypeChange);
		const line = Array.from(document.querySelectorAll('[role="option"]') ?? []).find((el) =>
			/line|đường/i.test(el.textContent || ""),
		) as HTMLElement | undefined;
		act(() => {
			line?.click();
		});
		expect(onChartTypeChange).toHaveBeenCalledWith("line");
		expect(document.querySelector('[role="listbox"]')).toBeNull();
	});
});

describe("OHLCHeader crosshair mode control (P2)", () => {
	function renderWithCrosshair(onCrosshairModeChange: (mode: string) => void, mode = "cross") {
		act(() => {
			root?.render(createElement(OHLCHeader, {
				symbol: "BTCUSDT",
				timeframe: "1h",
				crosshairMode: mode,
				onCrosshairModeChange,
			} as never));
		});
	}

	it("hides the control without a handler", () => {
		act(() => {
			root?.render(createElement(OHLCHeader, { symbol: "BTCUSDT", timeframe: "1h" }));
		});
		expect(container?.querySelector('[role="group"]')).toBeNull();
	});

	it("marks the active mode and emits selections", () => {
		const onCrosshairModeChange = vi.fn();
		renderWithCrosshair(onCrosshairModeChange, "dot");
		const group = container?.querySelector('[role="group"]');
		expect(group).not.toBeNull();
		const buttons = Array.from(group?.querySelectorAll("button") ?? []);
		expect(buttons).toHaveLength(3);
		expect(buttons.filter((b) => b.getAttribute("aria-pressed") === "true")).toHaveLength(1);
		act(() => {
			buttons[2]?.click();
		});
		expect(onCrosshairModeChange).toHaveBeenCalledWith("magnet");
	});
});

describe("OHLCHeader status line settings controls", () => {
	it("hides ticker when showTicker is false", () => {
		act(() => {
			root?.render(createElement(OHLCHeader, {
				symbol: "ETHUSDT",
				timeframe: "1h",
				showTicker: false,
			}));
		});
		const symbolElem = container?.querySelector('strong');
		expect(symbolElem).toBeNull();
	});

	it("renders OHLC cluster when showOHLCV is true and ohlcData is provided", () => {
		act(() => {
			root?.render(createElement(OHLCHeader, {
				symbol: "ETHUSDT",
				timeframe: "1h",
				showOHLCV: true,
				showBarChange: true,
				ohlcData: {
					open: 100,
					high: 110,
					low: 95,
					close: 105,
					change: 5,
					changePercent: 5,
				},
			}));
		});
		const cluster = container?.querySelector('[data-testid="ohlc-cluster"]');
		expect(cluster).not.toBeNull();
		expect(cluster?.textContent).toContain("O");
		expect(cluster?.textContent).toContain("100.00");
		expect(cluster?.textContent).toContain("C");
		expect(cluster?.textContent).toContain("105.00");
		expect(cluster?.textContent).toContain("+5.00");
	});
});

describe("OHLCHeader upgrade anchor (H0.5)", () => {
	function renderHeader(props: Record<string, unknown>) {
		act(() => {
			root?.render(createElement(OHLCHeader, {
				symbol: "BTCUSDT",
				timeframe: "1h",
				...props,
			}));
		});
	}

	function localhostAnchors() {
		return Array.from(document.querySelectorAll("a")).filter((a) =>
			(a.getAttribute("href") ?? "").includes("localhost"),
		);
	}

	it("renders no upgrade anchor at all when upgradeUrl is omitted", () => {
		renderHeader({});
		// Pre-H0.5 the default was `http://localhost:8080`, so an omitted prop still
		// shipped a local-backend link. Both entry points must stay gone.
		expect(localhostAnchors().map((a) => a.outerHTML)).toEqual([]);
		expect(document.querySelector('[data-testid="header-upgrade-btn"]')).toBeNull();
	});

	it("renders the upgrade anchor at exactly the passed upgradeUrl", () => {
		const url = "https://example.test/upgrade";
		renderHeader({ upgradeUrl: url });
		const link = document.querySelector('[data-testid="header-upgrade-btn"]');
		expect(link).not.toBeNull();
		expect(link?.getAttribute("href")).toBe(url);
		expect(localhostAnchors().map((a) => a.outerHTML)).toEqual([]);
	});
});

