// @vitest-environment jsdom
// BLACKSCREEN-DIAG regression lock: overlay gated by flag, shows snapshot.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { ChartDiagOverlay, isDiagEnabled, type ChartDiagSnapshot } from "../ChartDiagOverlay";

const SNAP: ChartDiagSnapshot = {
	enginePresent: true,
	forkEngineSet: true,
	isForkRuntime: true,
	bars: 1720,
	enriched: 1720,
	plot: 1720,
	panes: "price(v):Candlestick+Comparison",
	chartType: "candlestick",
	tier: "pro",
	dataError: "none",
	engineRange: "from=1620 to=1720",
	canvases: "3:1295x747",
	domains: "price:price-right=[80000.0,85000.0]",
	specs: "price(1) | volume(1)",
	nanScan: "clean/1720",
	lastBar: "c=84560 t=2026-09-25T07:00:00.000Z",
};

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

function renderOverlay() {
	act(() => {
		root?.render(createElement(ChartDiagOverlay, { getSnapshot: () => SNAP }));
	});
}

beforeEach(() => {
	window.localStorage.clear();
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(() => {
	act(() => {
		root?.unmount();
	});
	container?.remove();
	container = null;
	root = null;
	window.localStorage.clear();
});

describe("ChartDiagOverlay (BLACKSCREEN-DIAG)", () => {
	it("renders nothing without the flag", () => {
		renderOverlay();
		expect(container?.querySelector('[data-testid="chart-diag-overlay"]')).toBeNull();
		expect(isDiagEnabled()).toBe(false);
	});

	it("renders snapshot rows with localStorage flag", () => {
		window.localStorage.setItem("vnsc_diag", "1");
		expect(isDiagEnabled()).toBe(true);
		renderOverlay();
		const text = container?.querySelector('[data-testid="chart-diag-overlay"]')?.textContent ?? "";
		expect(text).toContain("1720/1720/1720");
		expect(text).toContain("price(v):Candlestick+Comparison");
		expect(text).toContain("from=1620 to=1720");
		expect(text).toContain("clean/1720");
		expect(text).toContain("80000.0,85000.0");
	});

	it("tolerates a throwing snapshot", () => {
		window.localStorage.setItem("vnsc_diag", "1");
		act(() => {
			root?.render(createElement(ChartDiagOverlay, {
				getSnapshot: () => { throw new Error("boom"); },
			}));
		});
		expect(container?.querySelector('[data-testid="chart-diag-overlay"]')?.textContent).toContain("snapshot-threw");
	});
});
