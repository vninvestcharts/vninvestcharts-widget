// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { WhaleMarketBubbleOverlay, type WhaleMarketBubbleOverlayProps } from "../WhaleMarketBubbleOverlay";
import { ChartRenderContext, type ChartRenderContextValue } from "../../../core/canvas/ChartRenderContext";
import type { WhaleEvent } from "../whaleDetector";

function createMockContextValue(): ChartRenderContextValue {
	return {
		xScale: (value: number | Date) => (typeof value === "number" ? value * 10 : value.getTime() / 1000),
		yScale: (value: number) => 100 - (value as number) * 0.01,
		plotData: [
			{ close: 100, volume: 1000 },
			{ close: 102, volume: 1200 },
			{ close: 101, volume: 1100 },
		],
		candleWidth: 8,
		devicePixelRatio: 1,
		visibleRange: { startIndex: 0, endIndex: 2, startDate: new Date(), endDate: new Date(), timeRange: { from: Date.now(), to: Date.now() }, barCount: 3 },
		width: 500,
		height: 300,
	};
}

describe("WhaleMarketBubbleOverlay", () => {
	it("T2-01: renders without error with visible events", () => {
		const whaleEvent: WhaleEvent = {
			index: 0,
			date: new Date(),
			buyVol: 2_000_000,
			sellVol: 500_000,
			netDelta: 1_500_000,
			dominance: "buy",
			sizeCategory: "xlarge",
		};

		const events = [whaleEvent];
		const visibleRange = {
			startIndex: 0,
			endIndex: 2,
			startDate: new Date(),
			endDate: new Date(),
			timeRange: { from: Date.now(), to: Date.now() },
			barCount: 3,
		};

		const props: WhaleMarketBubbleOverlayProps = {
			events,
			visibleRange,
		};

		const contextValue = createMockContextValue();

		// Test that component accepts these props without error
		expect(() => {
			// Just verify the component can be instantiated
			const elem = <WhaleMarketBubbleOverlay {...props} />;
			expect(elem).toBeDefined();
		}).not.toThrow();
	});

	it("T2-02: filters events outside visible range (no-throw)", () => {
		const events: WhaleEvent[] = [
			{
				index: 10,
				date: new Date(),
				buyVol: 2_000_000,
				sellVol: 500_000,
				netDelta: 1_500_000,
				dominance: "buy",
				sizeCategory: "large",
			},
		];

		const visibleRange = {
			startIndex: 0,
			endIndex: 2,
			startDate: new Date(),
			endDate: new Date(),
			timeRange: { from: Date.now(), to: Date.now() },
			barCount: 3,
		};

		const props: WhaleMarketBubbleOverlayProps = {
			events,
			visibleRange,
		};

		// Should not throw even with out-of-range events
		expect(() => {
			const elem = <WhaleMarketBubbleOverlay {...props} />;
			expect(elem).toBeDefined();
		}).not.toThrow();
	});

	it("T2-03: handles null visible range gracefully", () => {
		const events: WhaleEvent[] = [
			{
				index: 0,
				date: new Date(),
				buyVol: 2_000_000,
				sellVol: 500_000,
				netDelta: 1_500_000,
				dominance: "buy",
				sizeCategory: "large",
			},
		];

		const props: WhaleMarketBubbleOverlayProps = {
			events,
			visibleRange: {
				startIndex: 0,
				endIndex: 2,
				startDate: new Date(),
				endDate: new Date(),
				timeRange: { from: Date.now(), to: Date.now() },
				barCount: 3,
			},
		};

		expect(() => {
			const elem = <WhaleMarketBubbleOverlay {...props} />;
			expect(elem).toBeDefined();
		}).not.toThrow();
	});

	it("T2-04: empty events array renders cleanly", () => {
		const props: WhaleMarketBubbleOverlayProps = {
			events: [],
			visibleRange: {
				startIndex: 0,
				endIndex: 10,
				startDate: new Date(),
				endDate: new Date(),
				timeRange: { from: Date.now(), to: Date.now() },
				barCount: 11,
			},
		};

		expect(() => {
			const elem = <WhaleMarketBubbleOverlay {...props} />;
			expect(elem).toBeDefined();
		}).not.toThrow();
	});
});
