import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import type { PaneRuntimeSnapshot } from "@vninvestcharts/engine-react";
import { TradingProvider } from "../context/TradingContext";
import { TradingChartSurface } from "../chart/TradingChartSurface";
import { ConnectedTradingPanel } from "../panel/ConnectedTradingPanel";

// Task TVP-A0: tắt/mở paper trading + kéo header + CTA chống dead-end.
const snapshot = {
	plotBounds: { left: 0, top: 0, width: 800, height: 400 },
	scaleSlotStates: { "price-right": { domain: [120000, 140000] } },
} as unknown as PaneRuntimeSnapshot;
const visibleRange = { from: 0, to: 100 };
const bars = [
	{ open: 128000, high: 128400, low: 127800, close: 128200, volume: 0, date: new Date(1000) },
	{ open: 128500, high: 129000, low: 128000, close: 128800, volume: 0, date: new Date(2000) },
];

function tree(props?: object) {
	return (
		<TradingProvider symbol="FPT" bars={bars} {...props}>
			<TradingChartSurface snapshot={snapshot} visibleRange={visibleRange} />
			<ConnectedTradingPanel />
		</TradingProvider>
	);
}

describe("TradingToggle", () => {
	beforeEach(() => {
		window.localStorage.removeItem("vnsc.paper.enabled");
		window.localStorage.removeItem("vnsc.paperHeader.pos");
	});

	it("defaultEnabled=false -> surface null, hotkeys im lặng, panel hiện CTA", () => {
		render(tree({ defaultEnabled: false }));
		expect(screen.queryByTestId("quick-trading-header")).toBeNull();
		expect(screen.queryByTestId("paper-header-grip")).toBeNull();
		fireEvent.keyDown(window, { key: "B", shiftKey: true });
		expect(screen.queryByTestId("order-ticket-overlay")).toBeNull();
		expect(screen.getByTestId("trading-disabled-cta")).toBeDefined();
	});

	it("click CTA bật lại -> tabs + header xuất hiện", () => {
		render(tree({ defaultEnabled: false }));
		fireEvent.click(screen.getByTestId("trading-enable-btn"));
		expect(screen.getByTestId("quick-trading-header")).toBeDefined();
		expect(screen.getByTestId("panel-tab-positions")).toBeDefined();
		expect(window.localStorage.getItem("vnsc.paper.enabled")).toBe("1");
	});

	it("localStorage preset 0 -> tắt từ mount; preset 1 -> bật", () => {
		window.localStorage.setItem("vnsc.paper.enabled", "0");
		const { unmount } = render(tree({}));
		expect(screen.queryByTestId("quick-trading-header")).toBeNull();
		unmount();
		window.localStorage.setItem("vnsc.paper.enabled", "1");
		render(tree({}));
		expect(screen.getByTestId("quick-trading-header")).toBeDefined();
	});

	it("prop defaultEnabled thắng localStorage", () => {
		window.localStorage.setItem("vnsc.paper.enabled", "0");
		render(tree({ defaultEnabled: true }));
		expect(screen.getByTestId("quick-trading-header")).toBeDefined();
	});

	it("kéo bằng bấm-giữ: grip đã bị bỏ, bề mặt kéo còn đó", () => {
		// Grip ⠿ đã bị bỏ (2026-09-30) — kéo bằng bấm-giữ ở bất kỳ đâu trên thanh.
		//
		// GIỚI HẠN TRUNG THỰC: test này KHÔNG chứng minh việc kéo hoạt động. jsdom cho
		// `getBoundingClientRect` trả về 0 nên pipeline kéo không tạo ra tọa độ khác mặc
		// định, và kéo thật chỉ kiểm được ở `scripts/verify-quicktrade-pills.cjs`
		// (Playwright). Ở đây chỉ khẳng định điều jsdom nhìn thấy được: grip biến mất,
		// bề mặt kéo còn đó. Công thức clamp (kể cả quadrant âm) có test riêng
		// (`useHoldDrag.test.tsx` — case A6 quadrant kép).
		render(tree({}));
		expect(screen.getByTestId("paper-header-surface")).toBeDefined();
		expect(screen.queryByTestId("paper-header-grip")).toBeNull();
		expect(screen.queryByText("⠿")).toBeNull();
	});
});
