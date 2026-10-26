// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PaneDescriptor } from "../types/pane-descriptor";

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

const originalConsoleError = console.error;
console.error = (..._args: unknown[]) => {};

let act: typeof import("react").act;
let createRoot: typeof import("react-dom/client").createRoot;
let IndicatorLegend: typeof import("../IndicatorLegend").IndicatorLegend;

beforeAll(async () => {
	({ act } = await import("react"));
	({ createRoot } = await import("react-dom/client"));
	({ IndicatorLegend } = await import("../IndicatorLegend"));
});

function createPane(overrides: Partial<PaneDescriptor> = {}): PaneDescriptor {
	return {
		id: "momentum",
		label: "Momentum",
		pinned: false,
		visible: true,
		heightRatio: 0.25,
		series: [
			{ type: "EMA", yAxis: "right", params: { period: 20 } },
			{ type: "EMA", yAxis: "right", params: { period: 50 }, visible: false },
			{ type: "RSI", yAxis: "left", params: { period: 14 } },
		],
		splitScale: false,
		tooltip: "value",
		...overrides,
	};
}

describe("IndicatorLegend", () => {
	let container: HTMLDivElement | null = null;
	let root: ReturnType<typeof createRoot> | null = null;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		root?.unmount();
		root = null;
		container?.remove();
		container = null;
	});

	afterAll(() => {
		console.error = originalConsoleError;
	});

	it("renders hidden state and calls handlers with the correct series index", async () => {
		const onToggleSeries = vi.fn();
		const onRemoveSeries = vi.fn();

		await act(async () => {
			root?.render(
				<IndicatorLegend
					pane={createPane()}
					onToggleSeries={onToggleSeries}
					onRemoveSeries={onRemoveSeries}
				/>,
			);
		});

		const chips = container?.querySelectorAll(".rsc-indicator-chip");
		expect(chips).toHaveLength(3);
		expect(chips?.[1]?.className).toContain("rsc-indicator-chip--hidden");

		const eyeButtons = container?.querySelectorAll<HTMLButtonElement>(".rsc-indicator-chip__btn--eye");
		const removeButtons = container?.querySelectorAll<HTMLButtonElement>(".rsc-indicator-chip__btn--remove");

		await act(async () => {
			eyeButtons?.[1]?.click();
			removeButtons?.[1]?.click();
		});

		expect(onToggleSeries).toHaveBeenCalledTimes(1);
		expect(onToggleSeries).toHaveBeenCalledWith("EMA", 1);
		expect(onRemoveSeries).toHaveBeenCalledTimes(1);
		expect(onRemoveSeries).toHaveBeenCalledWith("EMA", 1);
	});

	it("hides primary chart-type chips on the pinned price pane", async () => {
		await act(async () => {
			root?.render(
				<IndicatorLegend
					pane={createPane({
						id: "price",
						pinned: true,
						series: [
							{ type: "Candlestick", yAxis: "right" },
							{ type: "EMA", yAxis: "right", params: { period: 20 } },
						],
					})}
					onToggleSeries={vi.fn()}
					onRemoveSeries={vi.fn()}
				/>,
			);
		});

		const chips = container?.querySelectorAll(".rsc-indicator-chip");
		expect(chips).toHaveLength(1);
		expect(chips?.[0]?.textContent ?? "").toContain("EMA (20)");
	});

	it("renders gear button only when onEditSeries is provided", async () => {
		const onEditSeries = vi.fn();

		await act(async () => {
			root?.render(
				<IndicatorLegend
					pane={createPane()}
					onToggleSeries={vi.fn()}
					onRemoveSeries={vi.fn()}
					onEditSeries={onEditSeries}
					icons={{ edit: <span data-testid="gear-icon" /> }}
				/>,
			);
		});

		const gearButtons = container?.querySelectorAll<HTMLButtonElement>(".rsc-indicator-chip__btn--edit");
		expect(gearButtons).toHaveLength(3);
		expect(container?.querySelector('[data-testid="gear-icon"]')).not.toBeNull();

		await act(async () => {
			gearButtons?.[2]?.click();
		});
		expect(onEditSeries).toHaveBeenCalledTimes(1);
		expect(onEditSeries).toHaveBeenCalledWith("RSI", 2);
	});

	it("renders live series values with per-value color (UI-P3)", async () => {
		await act(async () => {
			root?.render(
				<IndicatorLegend
					pane={createPane()}
					onToggleSeries={vi.fn()}
					onRemoveSeries={vi.fn()}
					seriesValue={(seriesType, seriesIndex) =>
						seriesIndex === 0 ? { text: "204.2K", color: "rgb(14, 203, 129)" } : undefined
					}
				/>,
			);
		});

		const values = container?.querySelectorAll(".rsc-indicator-chip__value");
		expect(values).toHaveLength(1);
		expect(values?.[0]?.textContent).toBe("204.2K");
		expect((values?.[0] as HTMLElement)?.style.color).toBe("rgb(14, 203, 129)");
	});

	it("DECLUTTER_V4: visibleTypes/hiddenTypes filter render but keep original suffix indices", async () => {
		const pane = createPane({
			id: "price",
			pinned: true,
			series: [
				{ type: "Candlestick", yAxis: "right" },
				{ id: "compare-SOLUSDT", type: "Comparison", yAxis: "right", overlaySymbolId: "SOLUSDT" } as never,
				{ type: "EMA", yAxis: "right", params: { period: 20 } },
			],
		});
		const seen: number[] = [];

		await act(async () => {
			root?.render(
				<IndicatorLegend
					pane={pane}
					onToggleSeries={vi.fn()}
					onRemoveSeries={vi.fn()}
					seriesSuffix={(idx) => { seen.push(idx); return `s${idx}`; }}
					visibleTypes={["Comparison"]}
				/>,
			);
		});

		const chips = container?.querySelectorAll(".rsc-indicator-chip");
		expect(chips).toHaveLength(1);
		expect(chips?.[0]?.textContent ?? "").toContain("SOLUSDT");
		// Original pane.series index (1), not the filtered position (0).
		expect(seen).toEqual([1]);
	});

	it("renders no gear button without onEditSeries (backward compatible)", async () => {
		await act(async () => {
			root?.render(
				<IndicatorLegend
					pane={createPane()}
					onToggleSeries={vi.fn()}
					onRemoveSeries={vi.fn()}
				/>,
			);
		});

		expect(container?.querySelector(".rsc-indicator-chip__btn--edit")).toBeNull();
	});
});
