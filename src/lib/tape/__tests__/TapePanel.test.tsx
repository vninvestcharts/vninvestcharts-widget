// @vitest-environment jsdom
/**
 * O-T01 → O-T06: TapePanel unit tests.
 *
 * Pattern: manual createRoot + act (no @testing-library/react).
 */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TapePanel } from "../TapePanel";
import type { TapePanelProps } from "../TapePanel";
import type { TapeEntry } from "../../types/vninvest";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEntry(overrides: Partial<TapeEntry> = {}): TapeEntry {
	return {
		id: `e-${Math.random()}`,
		ts: "2025-01-01T09:30:00Z",
		price: 45_000,
		volume: 1_000,
		value: 45_000_000,
		side: "buy",
		is_whale: false,
		...overrides,
	};
}

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(() => {
	act(() => { root.unmount(); });
	container.remove();
});

function render(props: TapePanelProps) {
	act(() => { root.render(<TapePanel {...props} />); });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("TapePanel", () => {
	it("O-T01: renders the panel when show=true", () => {
		render({ show: true, entries: [], isLoading: false, filterBillions: 0 });
		const panel = container.querySelector("[data-testid='tape-panel']");
		expect(panel).not.toBeNull();
	});

	it("O-T02: whale row has distinct background highlight", () => {
		const whale = makeEntry({ is_whale: true, value: 5_000_000_000 });
		render({ show: true, entries: [whale], isLoading: false, filterBillions: 0 });
		const row = container.querySelector("[data-testid='tape-row']") as HTMLElement | null;
		expect(row).not.toBeNull();
		// In JSDOM, CSS Modules classes are mapped. Check the class name rather than style.background.
		expect(row!.className.includes("rowWhale") || row!.className.includes("Whale")).toBe(true);
	});

	it("O-T03: buy side badge has green background", () => {
		const entry = makeEntry({ side: "buy" });
		render({ show: true, entries: [entry], isLoading: false, filterBillions: 0 });
		const badge = container.querySelector("[data-side='buy']") as HTMLElement | null;
		expect(badge).not.toBeNull();
		// Check the CSS Module class name
		expect(badge!.className.includes("rowSideBuy") || badge!.className.includes("Buy")).toBe(true);
	});

	it("O-T04: sell side badge has red background", () => {
		const entry = makeEntry({ side: "sell" });
		render({ show: true, entries: [entry], isLoading: false, filterBillions: 0 });
		const badge = container.querySelector("[data-side='sell']") as HTMLElement | null;
		expect(badge).not.toBeNull();
		// Check the CSS Module class name
		expect(badge!.className.includes("rowSideSell") || badge!.className.includes("Sell")).toBe(true);
	});

	it("O-T05: shows loading state and no rows when isLoading=true and entries=[]", () => {
		render({ show: true, entries: [], isLoading: true, filterBillions: 0 });
		const loading = container.querySelector("[data-testid='tape-loading']");
		expect(loading).not.toBeNull();
		const rows = container.querySelectorAll("[data-testid='tape-row']");
		expect(rows.length).toBe(0);
	});

	it("O-T06: shows empty state when entries=[] and isLoading=false", () => {
		render({ show: true, entries: [], isLoading: false, filterBillions: 0 });
		const empty = container.querySelector("[data-testid='tape-empty']");
		expect(empty).not.toBeNull();
		const rows = container.querySelectorAll("[data-testid='tape-row']");
		expect(rows.length).toBe(0);
	});
});
