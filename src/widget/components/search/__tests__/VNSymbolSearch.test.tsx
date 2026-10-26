// @vitest-environment jsdom
// SYMBOL_SEARCH P1 baseline: locks VNSymbolSearch render, keyboard nav,
// exchange filter, recent, timeframe alias and onFocusGuard behavior.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { fireEvent } from "@testing-library/react";

import { VNSymbolSearch, type VNSymbolSearchProps } from "../VNSymbolSearch";
import { SymbolSearchModal } from "../SymbolSearchModal";
import type { StockDataAdapter } from "../../../../lib/types/adapter";

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

function makeAdapter(items: Array<{ symbol: string; name: string; exchange: string }>) {
	return {
		searchSymbols: vi.fn(async (_q: string) => items),
	} as unknown as StockDataAdapter;
}

describe("VNSymbolSearch (widget baseline)", () => {
	let container: HTMLDivElement | null = null;
	let root: ReturnType<typeof createRoot> | null = null;

	beforeEach(() => {
		vi.useFakeTimers();
		localStorage.clear();
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(async () => {
		await act(async () => {
			root?.unmount();
		});
		root = null;
		container?.remove();
		container = null;
		localStorage.clear();
		vi.useRealTimers();
	});

	function input(): HTMLInputElement | null {
		return container?.querySelector("input[role='combobox']") as HTMLInputElement | null;
	}

	async function renderSearch(props: VNSymbolSearchProps): Promise<HTMLInputElement | null> {
		await act(async () => {
			root?.render(<VNSymbolSearch {...props} />);
		});
		return input();
	}

	async function typeAndFlush(el: HTMLInputElement, value: string) {
		await act(async () => {
			fireEvent.input(el, { target: { value } });
		});
		await act(async () => {
			vi.advanceTimersByTime(400);
		});
		await act(async () => {});
	}

	it("renders a combobox input with a placeholder", async () => {
		const el = await renderSearch({ adapter: makeAdapter([]) });
		expect(el).not.toBeNull();
		expect(el?.placeholder.length).toBeGreaterThan(0);
	});

	it("opens on focus and shows recent symbols from storage", async () => {
		localStorage.setItem(
			"vni_recent_symbols",
			JSON.stringify([{ symbol: "VIC", company_name: "Vingroup", exchange: "HOSE" }]),
		);
		const el = await renderSearch({ adapter: makeAdapter([]) });
		await act(async () => {
			fireEvent.focus(el!);
		});
		expect(container?.textContent).toContain("VIC");
	});

	it("calls onFocusGuard instead of opening when provided", async () => {
		localStorage.setItem(
			"vni_recent_symbols",
			JSON.stringify([{ symbol: "VIC", company_name: "Vingroup", exchange: "HOSE" }]),
		);
		const onFocusGuard = vi.fn();
		const el = await renderSearch({ adapter: makeAdapter([]), onFocusGuard });
		await act(async () => {
			fireEvent.focus(el!);
		});
		expect(onFocusGuard).toHaveBeenCalled();
		expect(container?.textContent).not.toContain("VIC");
	});

	it("searches via adapter and renders result options", async () => {
		const el = await renderSearch({
			adapter: makeAdapter([
				{ symbol: "VIC", name: "Vingroup", exchange: "HOSE" },
				{ symbol: "VHM", name: "Vinhomes", exchange: "HOSE" },
			]),
		});
		await typeAndFlush(el!, "VI");
		const options = container?.querySelectorAll("li[role='option']");
		expect(options?.length).toBe(2);
	});

	it("filters results by exchange", async () => {
		const el = await renderSearch({
			adapter: makeAdapter([
				{ symbol: "VIC", name: "Vingroup", exchange: "HOSE" },
				{ symbol: "SHB", name: "SHB Bank", exchange: "HNX" },
			]),
		});
		await typeAndFlush(el!, "SHB");
		const hnxBtn = [...container!.querySelectorAll("button")].find((b) => b.textContent === "HNX");
		expect(hnxBtn).not.toBeUndefined();
		await act(async () => {
			fireEvent.mouseDown(hnxBtn!);
		});
		await act(async () => {
			vi.advanceTimersByTime(400);
		});
		await act(async () => {});
		const options = [...(container?.querySelectorAll("li[role='option']") ?? [])];
		expect(options.length).toBe(1);
		expect(options[0]?.textContent).toContain("SHB");
	});

	it("moves highlight with arrows and selects with Enter", async () => {
		const onChange = vi.fn();
		const el = await renderSearch({
			adapter: makeAdapter([
				{ symbol: "VIC", name: "Vingroup", exchange: "HOSE" },
				{ symbol: "VHM", name: "Vinhomes", exchange: "HOSE" },
			]),
			onChange,
		});
		await typeAndFlush(el!, "VI");
		await act(async () => {
			fireEvent.keyDown(el!, { key: "ArrowDown" });
		});
		const options = container?.querySelectorAll("li[role='option']");
		expect(options?.[1]?.getAttribute("aria-selected")).toBe("true");
		await act(async () => {
			fireEvent.keyDown(el!, { key: "Enter" });
		});
		expect(onChange).toHaveBeenCalledWith("VHM");
	});

	it("commits a timeframe suffix on Enter when there are no results", async () => {
		const onChange = vi.fn();
		const onTimeframeChange = vi.fn();
		const el = await renderSearch({ adapter: makeAdapter([]), onChange, onTimeframeChange });
		await typeAndFlush(el!, "VIC 1D");
		expect(container?.querySelectorAll("li[role='option']").length).toBe(0);
		await act(async () => {
			fireEvent.keyDown(el!, { key: "Enter" });
		});
		expect(onChange).toHaveBeenCalledWith("VIC");
		expect(onTimeframeChange).toHaveBeenCalledWith("1D");
	});

	it("keeps the panel open when an exchange filter yields no results", async () => {
		const el = await renderSearch({
			adapter: makeAdapter([{ symbol: "VIC", name: "Vingroup", exchange: "HOSE" }]),
		});
		await typeAndFlush(el!, "VIC");
		expect(container?.querySelectorAll("li[role='option']").length).toBe(1);
		const hnxBtn = [...container!.querySelectorAll("button")].find((b) => b.textContent === "HNX");
		await act(async () => {
			fireEvent.mouseDown(hnxBtn!);
		});
		await act(async () => {
			vi.advanceTimersByTime(400);
		});
		await act(async () => {});
		// Panel stays open showing the empty state — it must not auto-hide.
		expect(container?.querySelector("[class*='emptyText']")).not.toBeNull();
		expect(input()).not.toBeNull();
	});

	it("keeps the panel open when exchange filter is clicked with empty query (quick-search)", async () => {
		const el = await renderSearch({ adapter: makeAdapter([]), flat: true });
		await act(async () => {
			fireEvent.focus(el!);
		});
		expect(container?.querySelector("[class*='dropdown']")).not.toBeNull();
		const hoseBtn = [...container!.querySelectorAll("button")].find((b) => b.textContent === "HOSE")!;
		await act(async () => {
			fireEvent.mouseDown(hoseBtn);
		});
		await act(async () => {
			vi.advanceTimersByTime(200);
		});
		await act(async () => {});
		expect(container?.querySelector("[class*='dropdown']")).not.toBeNull();
		expect(container?.querySelector("[class*='dropdownFlat']")).not.toBeNull();
	});

	it("renders flat in-flow results when flat is set (no stacked absolute dropdown)", async () => {
		const el = await renderSearch({ adapter: makeAdapter([]), flat: true });
		await act(async () => {
			fireEvent.focus(el!);
		});
		const flatPanel = container?.querySelector("[class*='dropdownFlat']");
		expect(flatPanel).not.toBeNull();
	});

	it("modal composition hosts a single flat panel", async () => {
		await act(async () => {
			root?.render(
				<SymbolSearchModal open onClose={() => {}}>
					<VNSymbolSearch adapter={makeAdapter([])} flat />
				</SymbolSearchModal>,
			);
		});
		expect(container?.querySelector('[role="dialog"]')).not.toBeNull();
		expect(input()).not.toBeNull();
		await act(async () => {
			fireEvent.focus(input()!);
		});
		expect(container?.querySelector("[class*='dropdownFlat']")).not.toBeNull();
	});

	function unifiedProps(overrides: Partial<VNSymbolSearchProps> = {}): VNSymbolSearchProps {
		return {
			adapter: makeAdapter([
				{ symbol: "VIC", name: "Vingroup", exchange: "HOSE" },
				{ symbol: "VHM", name: "Vinhomes", exchange: "HOSE" },
			]),
			mode: "unified",
			flat: true,
			compare: {
				existing: [],
				onAdd: vi.fn(),
				onRemove: vi.fn(),
			},
			...overrides,
		};
	}

	function rowButtons(): { switchBtn: HTMLElement | null; compareBtn: HTMLElement | null } {
		const firstOption = container?.querySelector("li[role='option']");
		const btns = [...(firstOption?.querySelectorAll("button") ?? [])] as HTMLElement[];
		return {
			switchBtn: btns.find((b) => b.className.includes("switchBtn")) ?? null,
			compareBtn: btns.find((b) => !b.className.includes("switchBtn")) ?? null,
		};
	}

	it("unified: Enter switches symbol and closes the dropdown", async () => {
		const onChange = vi.fn();
		const el = await renderSearch(unifiedProps({ onChange }));
		await typeAndFlush(el!, "VI");
		expect(container?.querySelectorAll("li[role='option']").length).toBe(2);
		await act(async () => {
			fireEvent.keyDown(el!, { key: "Enter" });
		});
		expect(onChange).toHaveBeenCalledWith("VIC");
		expect(container?.querySelectorAll("li[role='option']").length).toBe(0);
	});

	it("unified: Shift+Enter adds compare and keeps the panel open", async () => {
		const onAdd = vi.fn();
		const onChange = vi.fn();
		const el = await renderSearch(unifiedProps({ onChange, compare: { existing: [], onAdd, onRemove: vi.fn() } }));
		await typeAndFlush(el!, "VI");
		await act(async () => {
			fireEvent.keyDown(el!, { key: "Enter", shiftKey: true });
		});
		expect(onAdd).toHaveBeenCalledWith("VIC");
		expect(onChange).not.toHaveBeenCalled();
		// Panel stays open: input cleared, shortcuts panel visible again.
		expect((input()?.value ?? "")).toBe("");
		expect(container?.textContent).toContain("VN30F1M");
	});

	it("unified: Switch button switches and closes", async () => {
		const onChange = vi.fn();
		const el = await renderSearch(unifiedProps({ onChange }));
		await typeAndFlush(el!, "VI");
		const { switchBtn } = rowButtons();
		expect(switchBtn).not.toBeNull();
		await act(async () => {
			fireEvent.click(switchBtn!);
		});
		expect(onChange).toHaveBeenCalledWith("VIC");
		expect(container?.querySelectorAll("li[role='option']").length).toBe(0);
	});

	it("unified: +Compare button adds and keeps the panel open", async () => {
		const onAdd = vi.fn();
		const el = await renderSearch(unifiedProps({ compare: { existing: [], onAdd, onRemove: vi.fn() } }));
		await typeAndFlush(el!, "VI");
		const { compareBtn } = rowButtons();
		expect(compareBtn).not.toBeNull();
		await act(async () => {
			fireEvent.click(compareBtn!);
		});
		expect(onAdd).toHaveBeenCalledWith("VIC");
		expect((input()?.value ?? "")).toBe("");
		expect(container?.textContent).toContain("VN30F1M");
	});

	function compareDialogProps(overrides: Partial<VNSymbolSearchProps> = {}): VNSymbolSearchProps {
		return unifiedProps({
			defaultAction: "compare",
			allowSwitch: false,
			mainSymbol: "VIC",
			...overrides,
		});
	}

	it("compare-default: row click adds overlay, never switches main symbol", async () => {
		const onAdd = vi.fn();
		const onChange = vi.fn();
		const el = await renderSearch(compareDialogProps({
			onChange,
			compare: { existing: [], onAdd, onRemove: vi.fn() },
		}));
		await typeAndFlush(el!, "VHM");
		const option = [...(container?.querySelectorAll("li[role='option']") ?? [])]
			.find((li) => li.textContent?.includes("VHM")) as HTMLElement;
		expect(option).not.toBeUndefined();
		await act(async () => {
			fireEvent.mouseDown(option!);
		});
		expect(onAdd).toHaveBeenCalledWith("VHM");
		expect(onChange).not.toHaveBeenCalled();
	});

	it("compare-default: plain Enter adds overlay, never switches", async () => {
		const onAdd = vi.fn();
		const onChange = vi.fn();
		const el = await renderSearch(compareDialogProps({
			onChange,
			compare: { existing: [], onAdd, onRemove: vi.fn() },
		}));
		await typeAndFlush(el!, "VHM");
		// First option is the disabled main symbol (VIC) — move highlight to VHM.
		await act(async () => {
			fireEvent.keyDown(el!, { key: "ArrowDown" });
		});
		await act(async () => {
			fireEvent.keyDown(el!, { key: "Enter" });
		});
		expect(onAdd).toHaveBeenCalledWith("VHM");
		expect(onChange).not.toHaveBeenCalled();
	});

	it("compare-default: no Switch button rendered when allowSwitch is false", async () => {
		const el = await renderSearch(compareDialogProps());
		await typeAndFlush(el!, "VI");
		// First option is the disabled main symbol — inspect the VHM row.
		const vhmOption = [...(container?.querySelectorAll("li[role='option']") ?? [])]
			.find((li) => li.textContent?.includes("VHM")) as HTMLElement;
		expect(vhmOption).not.toBeUndefined();
		expect(container?.querySelector("[class*='switchBtn']")).toBeNull();
		const btns = [...(vhmOption?.querySelectorAll("button") ?? [])] as HTMLElement[];
		expect(btns.length).toBe(1);
		expect(["Compare", "So sánh"].some((s) => btns[0].textContent?.includes(s))).toBe(true);
	});

	it("compare-default: main-symbol row is disabled and not selectable", async () => {
		const onAdd = vi.fn();
		const onChange = vi.fn();
		const el = await renderSearch(compareDialogProps({
			onChange,
			compare: { existing: [], onAdd, onRemove: vi.fn() },
		}));
		await typeAndFlush(el!, "VI");
		const vicOption = [...(container?.querySelectorAll("li[role='option']") ?? [])]
			.find((li) => li.textContent?.includes("VIC")) as HTMLElement;
		expect(vicOption).not.toBeUndefined();
		expect(vicOption.getAttribute("aria-disabled")).toBe("true");
		await act(async () => {
			fireEvent.mouseDown(vicOption!);
		});
		expect(onAdd).not.toHaveBeenCalled();
		expect(onChange).not.toHaveBeenCalled();
		// Enter on highlighted main symbol is also ignored.
		await act(async () => {
			fireEvent.keyDown(el!, { key: "Enter" });
		});
		expect(onAdd).not.toHaveBeenCalled();
		expect(onChange).not.toHaveBeenCalled();
	});

	it("compare-default: already-compared symbols are filtered from results", async () => {
		const el = await renderSearch(compareDialogProps({
			compare: { existing: ["VIC"], onAdd: vi.fn(), onRemove: vi.fn() },
		}));
		await typeAndFlush(el!, "VI");
		const options = container?.querySelectorAll("li[role='option']");
		expect(options?.length).toBe(1);
		expect(options?.[0].textContent).toContain("VHM");
	});

	it("compare-default: shortcut chip click adds overlay, never switches", async () => {
		localStorage.setItem(
			"vni_recent_symbols",
			JSON.stringify([{ symbol: "HPG", company_name: "Hoa Phat", exchange: "HOSE" }]),
		);
		const onAdd = vi.fn();
		const onChange = vi.fn();
		const el = await renderSearch(compareDialogProps({
			onChange,
			compare: { existing: [], onAdd, onRemove: vi.fn() },
		}));
		await act(async () => {
			fireEvent.focus(el!);
		});
		const chip = [...(container?.querySelectorAll("button") ?? [])]
			.find((b) => b.textContent === "HPG") as HTMLElement;
		expect(chip).not.toBeUndefined();
		await act(async () => {
			fireEvent.mouseDown(chip!);
		});
		expect(onAdd).toHaveBeenCalledWith("HPG");
		expect(onChange).not.toHaveBeenCalled();
	});
});
