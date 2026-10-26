// @vitest-environment jsdom
// UI-B regression lock: event badges stay inside the plot area (above X axis).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { ChartRenderContext } from "../../../../lib/core";
import type { ChartRenderContextValue } from "../../../../lib/core/canvas/ChartRenderContext";
import { CorporateEventsOverlay, type CorporateEvent } from "../CorporateEventsOverlay";
import { CHART_MARGIN } from "../../../utils/widgetHelpers";

const T0 = Date.UTC(2026, 7, 1);
const DAY = 86_400_000;

function contextValue(): ChartRenderContextValue {
	return {
		xScale: (value: Date) => ((value.getTime() - T0) / (10 * DAY)) * 600,
		yScale: () => 0,
		plotData: [],
		candleWidth: 5,
		devicePixelRatio: 1,
		visibleRange: null,
		width: 600,
		height: 400,
	} as unknown as ChartRenderContextValue;
}

function makeEvent(id: string, type: CorporateEvent["type"], day: number): CorporateEvent {
	return {
		id,
		type,
		timeIndex: day,
		timestamp: T0 + day * DAY,
		date: new Date(T0 + day * DAY).toISOString(),
		label: type,
		title: `${type} event`,
		description: "desc",
		data: {},
	};
}

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

function renderOverlay(props: Record<string, unknown>) {
	act(() => {
		root?.render(
			createElement(
				ChartRenderContext.Provider,
				{ value: contextValue() },
				createElement(CorporateEventsOverlay, {
					events: [makeEvent("e1", "D", 2), makeEvent("e2", "E", 5)],
					showEvents: true,
					...props,
				} as never),
			),
		);
	});
}

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

describe("CorporateEventsOverlay axis clearance (UI-B)", () => {
	it("anchors badges above the X-axis strip by default (axis height + 4px)", () => {
		renderOverlay({});
		const badges = Array.from(container?.querySelectorAll("[data-event-badge]") ?? []);
		expect(badges).toHaveLength(2);
		for (const badge of badges) {
			expect((badge as HTMLElement).style.bottom).toBe(`${CHART_MARGIN.bottom + 4}px`);
		}
	});

	it("respects an explicit axisClearancePx override", () => {
		renderOverlay({ axisClearancePx: 48 });
		const badge = container?.querySelector('[data-event-badge="e1"]') as HTMLElement | null;
		expect(badge?.style.bottom).toBe("48px");
	});

	it("renders nothing when showEvents is false", () => {
		renderOverlay({ showEvents: false });
		expect(container?.querySelectorAll("[data-event-badge]").length).toBe(0);
	});
});
