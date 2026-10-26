// @vitest-environment jsdom
/**
 * S-03 wiring: preset cards must notify the owner (themeState.setTheme) so
 * the chart palette actually changes — not just the settings model.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { SettingsProvider } from "../components/settings/SettingsContext";
import { ThemePaletteSettingsTab } from "../components/settings/tabs/ThemePaletteSettingsTab";

const PRESETS = [
	{ title: "Classic Dark", name: "classic-dark" },
	{ title: "Modern Light", name: "modern-light" },
	{ title: "Trading Night", name: "trading-night" },
	{ title: "Neutral Pro", name: "neutral-pro" },
	{ title: "High Contrast", name: "high-contrast" },
	{ title: "Midnight Blue", name: "midnight-blue" },
] as const;

describe("ThemePaletteSettingsTab preset wiring (S-03)", () => {
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
		document.body.innerHTML = "";
		window.localStorage.clear();
	});

	function renderTab(onThemePresetChange?: (theme: string) => void, toggleTheme?: () => void) {
		act(() => {
			root?.render(
				<SettingsProvider isDark themePreset="classic-dark">
					<ThemePaletteSettingsTab
						toggleTheme={toggleTheme}
						isDark
						onThemePresetChange={onThemePresetChange}
					/>
				</SettingsProvider>
			);
		});
	}

	function clickPreset(title: string) {
		const spans = Array.from(container?.querySelectorAll("span") ?? []);
		const target = spans.find((s) => s.textContent === title);
		expect(target).toBeTruthy();
		act(() => {
			target?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
		});
	}

	it("each of the 6 preset cards calls onThemePresetChange with its name", () => {
		const handler = vi.fn();
		const toggleTheme = vi.fn();
		renderTab(handler, toggleTheme);
		for (const preset of PRESETS) {
			handler.mockClear();
			clickPreset(preset.title);
			expect(handler).toHaveBeenLastCalledWith(preset.name);
		}
		expect(toggleTheme).not.toHaveBeenCalled();
	});

	it("without handler, falls back to legacy toggle only when mode differs", () => {
		const toggleTheme = vi.fn();
		renderTab(undefined, toggleTheme);
		clickPreset("Classic Dark");
		expect(toggleTheme).not.toHaveBeenCalled();
		clickPreset("Modern Light");
		expect(toggleTheme).toHaveBeenCalledTimes(1);
	});
});
