import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { HealthProbedDataAdapter } from "../adapters/HealthProbedDataAdapter";
import { UnavailableState } from "../../widget/components/CapabilityGate";
import { WidgetI18nProvider } from "../../widget/context/WidgetI18nContext";
import { widgetMessagesVi } from "../../widget/i18n/messages.vi";
import type { StockDataAdapter } from "../../lib/types/adapter";
import type { OHLCVBar } from "../../lib/types/ohlcv";

/**
 * The data-unavailable banner has two halves and both are load-bearing:
 *   1. the TRIGGER  — `HealthProbedDataAdapter` must raise a flag on a real
 *      rejection and clear it on the next success, and must NOT raise it for an
 *      empty result (an empty window is a legitimate answer, not an outage);
 *   2. the SURFACE — the banner is the real `UnavailableState`, so the DOM
 *      contract `data-reason="data_unavailable"` and the shipped
 *      `capability.unavailable.*` copy are the gate layer's, not a look-alike.
 *
 * A trigger that fires on an empty array, or a surface that never renders, are
 * the two ways this regresses back into "no banner" while the copy stays shipped.
 */

const BAR: OHLCVBar = {
	date: new Date("2026-01-01T00:00:00Z"),
	open: 1,
	high: 2,
	low: 0.5,
	close: 1.5,
	volume: 10,
	index: 0,
	dataIndex: 0,
};

/** A default-route adapter whose bar calls are scripted. */
function scripted(result: () => Promise<readonly OHLCVBar[]>): StockDataAdapter {
	return {
		fetchBarsInRange: () => result(),
		fetchBarsBefore: () => result(),
		searchSymbols: async () => [],
		subscribeToBar: () => () => {},
		subscribeToTrades: () => () => {},
		subscribeToOrderbook: () => () => {},
		getSourceSemantics: () => ({}) as never,
	};
}

function probe(result: () => Promise<readonly OHLCVBar[]>) {
	const seen: boolean[] = [];
	const adapter = new HealthProbedDataAdapter(
		{ routes: [], defaultAdapter: scripted(result) },
		(unavailable) => seen.push(unavailable),
	);
	return { adapter, seen };
}

const WINDOW = [new Date("2026-01-01T00:00:00Z"), new Date("2026-02-01T00:00:00Z")] as const;

describe("HealthProbedDataAdapter — the outage trigger", () => {
	it("raises the flag when a real bar fetch rejects", async () => {
		const { adapter, seen } = probe(() => Promise.reject(new Error("network down")));
		await expect(adapter.fetchBarsInRange("BTCUSDT", "1h", WINDOW[0], WINDOW[1])).rejects.toThrow(
			/network down/,
		);
		expect(seen).toEqual([true]);
	});

	it("does not swallow the rejection — the caller still sees the original error", async () => {
		const { adapter } = probe(() => Promise.reject(new Error("boom")));
		await expect(adapter.fetchBarsBefore("BTCUSDT", "1h", WINDOW[1], 10)).rejects.toThrow("boom");
	});

	it("clears the flag on the first successful fetch, so the banner can disappear", async () => {
		let healthy = false;
		const { adapter, seen } = probe(() =>
			healthy ? Promise.resolve([BAR]) : Promise.reject(new Error("network down")),
		);
		await expect(adapter.fetchBarsInRange("BTCUSDT", "1h", WINDOW[0], WINDOW[1])).rejects.toThrow();
		healthy = true;
		await adapter.fetchBarsInRange("BTCUSDT", "1h", WINDOW[0], WINDOW[1]);
		expect(seen).toEqual([true, false]);
	});

	it("does NOT raise the flag for an empty window: that is an answer, not an outage", async () => {
		const { adapter, seen } = probe(() => Promise.resolve([]));
		await adapter.fetchBarsInRange("BTCUSDT", "1h", WINDOW[0], WINDOW[1]);
		expect(seen).toEqual([]);
	});

	it("emits only on transitions, so a render storm cannot loop the parent", async () => {
		let healthy = false;
		const { adapter, seen } = probe(() =>
			healthy ? Promise.resolve([BAR]) : Promise.reject(new Error("network down")),
		);
		await expect(adapter.fetchBarsInRange("BTCUSDT", "1h", WINDOW[0], WINDOW[1])).rejects.toThrow();
		await expect(adapter.fetchBarsBefore("BTCUSDT", "1h", WINDOW[1], 10)).rejects.toThrow();
		healthy = true;
		await adapter.fetchBarsInRange("BTCUSDT", "1h", WINDOW[0], WINDOW[1]);
		await adapter.fetchBarsInRange("BTCUSDT", "1h", WINDOW[0], WINDOW[1]);
		expect(seen).toEqual([true, false]);
	});

	it("probes the BACKFILL path too, not just the visible window", async () => {
		const { adapter, seen } = probe(() => Promise.reject(new Error("network down")));
		await expect(adapter.fetchBarsBefore("BTCUSDT", "1h", WINDOW[1], 10)).rejects.toThrow();
		expect(seen).toEqual([true]);
	});
});

describe("the banner surface", () => {
	it("is the real UnavailableState, carrying the gate layer's reason and copy", () => {
		render(
			<WidgetI18nProvider locale="vi" messages={widgetMessagesVi}>
				<UnavailableState reason="data_unavailable" capability="basic_chart" />
			</WidgetI18nProvider>,
		);
		const el = screen.getByRole("status");
		expect(el.getAttribute("data-reason")).toBe("data_unavailable");
		expect(el.getAttribute("data-capability")).toBe("basic_chart");
		// Both halves come from capability.messages.vi.ts — never a raw i18n key.
		expect(el.textContent).toContain(widgetMessagesVi["capability.unavailable.title"]);
		expect(el.textContent).toContain(widgetMessagesVi["capability.unavailable.data"]);
		expect(el.textContent).not.toContain("capability.");
	});

	it("is wired in the demo behind the observed flag, not hardcoded on", () => {
		const src = readFileSync(resolve(process.cwd(), "src/demo/StandaloneEmbedDemo.tsx"), "utf8");
		expect(src).toMatch(/import \{ UnavailableState \} from "\.\.\/widget\/components\/CapabilityGate"/);
		expect(src).toMatch(/data-testid="data-unavailable-banner"/);
		expect(src).toMatch(/\{dataUnavailable && \(/);
		expect(src).toMatch(/<UnavailableState reason="data_unavailable"/);
		// No "show the banner anyway" escape hatch.
		expect(src).not.toMatch(/dataUnavailable\s*=\s*true/);
	});
});
