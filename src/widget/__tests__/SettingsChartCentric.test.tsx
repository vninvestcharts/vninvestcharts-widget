// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { screen } from "@testing-library/react";
import {
	LEGACY_COMPOSITE_KEY,
	scopedSingleKey,
	settingsCompositeKey,
	shouldAcceptSettingsEvent,
} from "../components/settings/storageKeys";
import { applyAppearancePayload, APPLY_APPEARANCE_EVENT, extractAppearancePayload } from "../components/settings/model/appearancePayload";
import { createDefaultSettings } from "../components/settings/model/defaultSettings";
import { SettingsProvider, useSettingsContext } from "../components/settings/SettingsContext";
import { WorkspaceSettingsProvider } from "../components/settings/WorkspaceSettingsContext";
import {
	useWorkspacePaperVisibility,
	WorkspacePaperVisibilityProvider,
} from "../context/WorkspacePaperVisibilityContext";
import { SettingsModal } from "../components/settings/SettingsModal";
import { VNInvestChartsStateProvider } from "../context/VNInvestChartsStateContext";

function createMockAdapter() {
	const store = new Map<string, string>();
	return {
		store,
		getItem: vi.fn((key: string) => store.get(key) ?? null),
		setItem: vi.fn((key: string, val: string) => {
			store.set(key, val);
		}),
		removeItem: vi.fn((key: string) => {
			store.delete(key);
		}),
	};
}

describe("settings storageKeys (S1)", () => {
	it("namespaces composite by chartId, legacy when absent", () => {
		expect(settingsCompositeKey("chart-A")).toBe(`${LEGACY_COMPOSITE_KEY}_chart-A`);
		expect(settingsCompositeKey(undefined)).toBe(LEGACY_COMPOSITE_KEY);
		expect(settingsCompositeKey(null)).toBe(LEGACY_COMPOSITE_KEY);
		expect(settingsCompositeKey("")).toBe(LEGACY_COMPOSITE_KEY);
		expect(scopedSingleKey("vnsc_settings_showTimeScrollbar", "chart-A")).toBe(
			"vnsc_settings_showTimeScrollbar_chart-A"
		);
		expect(scopedSingleKey("vnsc_settings_showTimeScrollbar")).toBe("vnsc_settings_showTimeScrollbar");
	});

	it("two-way envelope guard matrix (S2)", () => {
		expect(shouldAcceptSettingsEvent("A", "A")).toBe(true);
		expect(shouldAcceptSettingsEvent("A", "B")).toBe(false);
		expect(shouldAcceptSettingsEvent("A", null)).toBe(false);
		expect(shouldAcceptSettingsEvent("A", undefined)).toBe(false);
		expect(shouldAcceptSettingsEvent(null, null)).toBe(true);
		expect(shouldAcceptSettingsEvent(undefined, undefined)).toBe(true);
		expect(shouldAcceptSettingsEvent(null, "A")).toBe(false);
		expect(shouldAcceptSettingsEvent("", null)).toBe(true);
	});
});

describe("appearancePayload whitelist (S5)", () => {
	it("extracts only copyable fields, never identity/layout/scale/data", () => {
		const state = createDefaultSettings(true, "classic-dark", true);
		state.symbol.timezone = "America/New_York";
		state.scales.priceScaleMode = "logarithmic";
		state.scales.showTimeScrollbar = true;
		state.panesLayout.maxVisiblePanes = 3;
		state.tradingEvents.dataAdapterName = "vnstocks";
		const payload = extractAppearancePayload(state);
		expect(payload.appearance.backgroundColor).toBe(state.appearance.backgroundColor);
		expect(payload.theme.presetName).toBe("classic-dark");
		expect(payload.symbol.upColor).toBe(state.symbol.upColor);
		expect(payload.scales.dateFormat).toBe(state.scales.dateFormat);
		expect((payload.symbol as unknown as Record<string, unknown>).timezone).toBeUndefined();
		expect((payload.scales as unknown as Record<string, unknown>).priceScaleMode).toBeUndefined();
		expect((payload.scales as unknown as Record<string, unknown>).showTimeScrollbar).toBeUndefined();
		expect((payload as unknown as Record<string, unknown>).panesLayout).toBeUndefined();
		expect((payload as unknown as Record<string, unknown>).tradingEvents).toBeUndefined();
	});

	it("apply preserves blacklist on target", () => {
		const source = createDefaultSettings(true, "classic-dark", true);
		source.appearance.backgroundColor = "#111111";
		const target = createDefaultSettings(false, "modern-light", false);
		target.symbol.timezone = "America/New_York";
		target.scales.priceScaleMode = "logarithmic";
		target.scales.showTimeScrollbar = false;
		target.panesLayout.maxVisiblePanes = 2;
		target.tradingEvents.dataAdapterName = "vnstocks";
		const next = applyAppearancePayload(target, extractAppearancePayload(source));
		expect(next.appearance.backgroundColor).toBe("#111111");
		expect(next.theme.presetName).toBe("classic-dark");
		expect(next.symbol.timezone).toBe("America/New_York");
		expect(next.scales.priceScaleMode).toBe("logarithmic");
		expect(next.scales.showTimeScrollbar).toBe(false);
		expect(next.panesLayout.maxVisiblePanes).toBe(2);
		expect(next.tradingEvents.dataAdapterName).toBe("vnstocks");
	});
});

describe("SettingsProvider chart isolation (S0/S1/S2)", () => {
	let container: HTMLDivElement | null = null;
	let root: ReturnType<typeof createRoot> | null = null;

	function Poke(props: {
		chartId?: string | null;
		adapter: ReturnType<typeof createMockAdapter>;
		section: "appearance" | "scales";
		patch: Record<string, unknown>;
	}) {
		const ctx = useSettingsContext();
		useEffect(() => {
			ctx.updateSection(props.section, props.patch as never);
			// eslint-disable-next-line react-hooks/exhaustive-deps
		}, []);
		return null;
	}

	const mountProvider = async (chartId: string | undefined, adapter: ReturnType<typeof createMockAdapter>) => {
		await act(async () => {
			// key forces a fresh provider per chart, mirroring runtime where each
			// chart cell owns its own modal/provider instance.
			root?.render(
				<SettingsProvider key={chartId ?? "single"} chartId={chartId} storageAdapter={adapter as never}>
					<Poke
						chartId={chartId}
						adapter={adapter}
						section="appearance"
						patch={{ backgroundColor: "#abcdef" }}
					/>
				</SettingsProvider>
			);
		});
	};

	beforeEach(() => {
		window.localStorage.clear();
		document.body.innerHTML = "";
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
		window.localStorage.clear();
	});

	it("chart A edit writes scoped key only; chart B unaffected (S0 repro lock)", async () => {
		const adapter = createMockAdapter();
		await mountProvider("chart-A", adapter);

		expect(adapter.store.has(`${LEGACY_COMPOSITE_KEY}_chart-A`)).toBe(true);
		expect(adapter.store.has(LEGACY_COMPOSITE_KEY)).toBe(false);
		expect(adapter.store.has(`${LEGACY_COMPOSITE_KEY}_chart-B`)).toBe(false);
		const parsedA = JSON.parse(adapter.store.get(`${LEGACY_COMPOSITE_KEY}_chart-A`) as string);
		expect(parsedA.appearance.backgroundColor).toBe("#abcdef");

		const snapshotA = adapter.store.get(`${LEGACY_COMPOSITE_KEY}_chart-A`);
		await mountProvider("chart-B", adapter);
		// B wrote its own key; A's bytes are identical (no cross-write).
		expect(adapter.store.get(`${LEGACY_COMPOSITE_KEY}_chart-A`)).toBe(snapshotA);
		const parsedB = JSON.parse(adapter.store.get(`${LEGACY_COMPOSITE_KEY}_chart-B`) as string);
		expect(parsedB.appearance.backgroundColor).toBe("#abcdef");
	});

	it("dispatches enveloped vnsc-settings-sync with chartId + state", async () => {
		const adapter = createMockAdapter();
		const spy = vi.fn();
		window.addEventListener("vnsc-settings-sync", spy);
		try {
			await mountProvider("chart-A", adapter);
		} finally {
			window.removeEventListener("vnsc-settings-sync", spy);
		}
		expect(spy).toHaveBeenCalled();
		const last = spy.mock.calls[spy.mock.calls.length - 1][0] as CustomEvent;
		expect(last.detail?.chartId).toBe("chart-A");
		expect(last.detail?.state?.appearance?.backgroundColor).toBe("#abcdef");
	});

	it("single-chart (no chartId) keeps legacy key (backward compatible)", async () => {
		const adapter = createMockAdapter();
		await mountProvider(undefined, adapter);
		expect(adapter.store.has(LEGACY_COMPOSITE_KEY)).toBe(true);
	});

	it("multi cell migrates legacy once with scrollbar forced OFF (R4)", async () => {
		const adapter = createMockAdapter();
		const legacy = createDefaultSettings(true, "classic-dark", true);
		legacy.scales.showTimeScrollbar = true;
		adapter.store.set(LEGACY_COMPOSITE_KEY, JSON.stringify(legacy));

		let seen: string | null = null;
		function Reader() {
			const ctx = useSettingsContext();
			useEffect(() => {
				seen = String(ctx.settings.scales.showTimeScrollbar);
			}, [ctx]);
			return null;
		}
		await act(async () => {
			root?.render(
				<SettingsProvider chartId="chart-C" storageAdapter={adapter as never}>
					<Reader />
				</SettingsProvider>
			);
		});
		expect(seen).toBe("false");
		const scoped = JSON.parse(adapter.store.get(`${LEGACY_COMPOSITE_KEY}_chart-C`) as string);
		expect(scoped.scales.showTimeScrollbar).toBe(false);
		// Legacy source left intact for single-chart sessions.
		expect(JSON.parse(adapter.store.get(LEGACY_COMPOSITE_KEY) as string).scales.showTimeScrollbar).toBe(true);
	});

	it("scales edit writes scoped single key, legacy untouched", async () => {
		const adapter = createMockAdapter();
		function PokeScales() {
			const ctx = useSettingsContext();
			useEffect(() => {
				ctx.updateSection("scales", { showTimeScrollbar: true } as never);
			}, []);
			return null;
		}
		await act(async () => {
			root?.render(
				<SettingsProvider chartId="chart-D" storageAdapter={adapter as never}>
					<PokeScales />
				</SettingsProvider>
			);
		});
		expect(adapter.store.get("vnsc_settings_showTimeScrollbar_chart-D")).toBe("true");
		expect(adapter.store.has("vnsc_settings_showTimeScrollbar")).toBe(false);
	});
});

describe("Apply to All fan-out (S5)", () => {
	let container: HTMLDivElement | null = null;
	let root: ReturnType<typeof createRoot> | null = null;

	beforeEach(() => {
		window.localStorage.clear();
		document.body.innerHTML = "";
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
		window.localStorage.clear();
	});

	const seedScoped = (adapter: ReturnType<typeof createMockAdapter>, chartId: string, bg: string) => {
		const state = createDefaultSettings(true, "classic-dark", false);
		state.appearance.backgroundColor = bg;
		adapter.store.set(`${LEGACY_COMPOSITE_KEY}_${chartId}`, JSON.stringify(state));
		return state;
	};

	const fireApply = async (sourceChartId: string, bg: string) => {
		const source = createDefaultSettings(true, "classic-dark", false);
		source.appearance.backgroundColor = bg;
		const doneSpy = vi.fn();
		window.addEventListener("vnsc-applied-appearance-to-all", doneSpy);
		try {
			await act(async () => {
				window.dispatchEvent(
					new CustomEvent(APPLY_APPEARANCE_EVENT, {
						detail: { sourceChartId, payload: extractAppearancePayload(source) },
					})
				);
			});
		} finally {
			window.removeEventListener("vnsc-applied-appearance-to-all", doneSpy);
		}
		return doneSpy;
	};

	it("reaches a chart that never opened Settings (no scoped key)", async () => {
		const adapter = createMockAdapter();
		seedScoped(adapter, "chart-A", "#111111");
		await act(async () => {
			root?.render(
				<WorkspaceSettingsProvider chartIds={["chart-A", "chart-B"]} storageAdapter={adapter as never}>
					<div />
				</WorkspaceSettingsProvider>
			);
		});
		const doneSpy = await fireApply("chart-A", "#222222");
		const parsedB = JSON.parse(adapter.store.get(`${LEGACY_COMPOSITE_KEY}_chart-B`) as string);
		expect(parsedB.appearance.backgroundColor).toBe("#222222");
		expect(parsedB.scales.showTimeScrollbar).toBe(false);
		// Source untouched by its own fan-out.
		expect(JSON.parse(adapter.store.get(`${LEGACY_COMPOSITE_KEY}_chart-A`) as string).appearance.backgroundColor).toBe(
			"#111111"
		);
		expect(doneSpy).toHaveBeenCalled();
		const detail = doneSpy.mock.calls[0][0] as CustomEvent;
		expect(detail.detail?.sourceChartId).toBe("chart-A");
		expect(detail.detail?.applied).toBe(1);
	});

	it("fresh target with legacy present seeds from legacy (scrollbar OFF)", async () => {
		const adapter = createMockAdapter();
		seedScoped(adapter, "chart-A", "#111111");
		const legacy = createDefaultSettings(false, "modern-light", true);
		legacy.scales.showTimeScrollbar = true;
		adapter.store.set(LEGACY_COMPOSITE_KEY, JSON.stringify(legacy));
		await act(async () => {
			root?.render(
				<WorkspaceSettingsProvider chartIds={["chart-A", "chart-B"]} storageAdapter={adapter as never}>
					<div />
				</WorkspaceSettingsProvider>
			);
		});
		await fireApply("chart-A", "#333333");
		const parsedB = JSON.parse(adapter.store.get(`${LEGACY_COMPOSITE_KEY}_chart-B`) as string);
		expect(parsedB.appearance.backgroundColor).toBe("#333333");
		expect(parsedB.scales.showTimeScrollbar).toBe(false);
		expect(parsedB.theme.presetName).toBe("classic-dark");
	});

	it("Apply button renders only in multi (provider + chartId)", async () => {
		const adapter = createMockAdapter();
		await act(async () => {
			root?.render(
				<VNInvestChartsStateProvider>
					<WorkspaceSettingsProvider chartIds={["chart-A"]} storageAdapter={adapter as never}>
						<SettingsModal open chartId="chart-A" symbol="FPT" timeframe="1D" />
					</WorkspaceSettingsProvider>
				</VNInvestChartsStateProvider>
			);
		});
		expect(document.querySelector('[data-testid="settings-apply-to-all-btn"]')).toBeTruthy();
		expect(document.querySelector(".vnsc-settings-backdrop")?.textContent).toContain("FPT");

		await act(async () => {
			root?.render(
				<VNInvestChartsStateProvider>
					<SettingsModal open chartId="chart-A" symbol="FPT" timeframe="1D" />
				</VNInvestChartsStateProvider>
			);
		});
		expect(document.querySelector('[data-testid="settings-apply-to-all-btn"]')).toBeNull();
	});

	it("fans out paper visibility to every chart when carried", async () => {
		const adapter = createMockAdapter();
		window.localStorage.removeItem("vnsc_paper_visibility_ws-fanout");
		function PaperHarness() {
			const visibility = useWorkspacePaperVisibility({
				workspaceId: "ws-fanout",
				charts: [
					{ id: "chart-A", symbol: "FPT" },
					{ id: "chart-B", symbol: "VNM" },
				],
			});
			return (
				<WorkspacePaperVisibilityProvider value={visibility}>
					<WorkspaceSettingsProvider chartIds={["chart-A", "chart-B"]} storageAdapter={adapter as never}>
						<div />
					</WorkspaceSettingsProvider>
					<div data-testid="paper-perchart">{JSON.stringify(visibility.perChart)}</div>
				</WorkspacePaperVisibilityProvider>
			);
		}
		await act(async () => {
			root?.render(<PaperHarness />);
		});
		const source = createDefaultSettings(true, "classic-dark", false);
		await act(async () => {
			window.dispatchEvent(
				new CustomEvent(APPLY_APPEARANCE_EVENT, {
					detail: { sourceChartId: "chart-A", payload: extractAppearancePayload(source), paperEnabled: false },
				})
			);
		});
		// Source skipped (keeps master fallback), target pinned off.
		expect(screen.getByTestId("paper-perchart").textContent).toBe('{"chart-B":false}');
		window.localStorage.removeItem("vnsc_paper_visibility_ws-fanout");
	});
});
