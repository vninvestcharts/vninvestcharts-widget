/**
 * Batch B / B2 — build the engine theme from the chart settings.
 *
 * The appearance tab writes `appearance.crosshairColor` into the settings
 * composite, but the widget used to hard-code the engine crosshair colour,
 * so the control never reached the engine renderer.
 *
 * The function is pure on purpose: the colour is taken from the reactive
 * settings hook (it follows the `vnsc-settings-sync` event), and the canvas
 * theme colour is only the fallback for the case where the user never picked
 * one.
 */
import type { EngineTheme } from "@vninvestcharts/engine-core";

export interface ResolveForkEngineThemeInput {
	mode: "dark" | "light";
	gridColor: string;
	gridDash: string;
	gridWidth: number;
	bullish: string;
	bearish: string;
	/** Crosshair colour coming from the settings (`appearance.crosshairColor`). */
	crosshairColor?: string | null;
	/** Crosshair colour of the canvas theme (CSS variable or default). */
	fallbackCrosshairColor: string;
	/**
	 * A1: the appearance tab has a visibility switch and a colour per grid
	 * direction. Both used to stop at the tab, so the control never reached
	 * the engine. `undefined` means "no opinion" and the engine keeps its
	 * legacy behaviour (both directions visible, `gridColor` for both).
	 */
	vertGridVisible?: boolean;
	horzGridVisible?: boolean;
	vertGridColor?: string;
	horzGridColor?: string;
}

export function resolveForkEngineTheme(input: ResolveForkEngineThemeInput): EngineTheme {
	const custom = input.crosshairColor?.trim();
	return {
		mode: input.mode,
		gridColor: input.gridColor,
		gridDash: input.gridDash,
		gridWidth: input.gridWidth,
		crosshairColor: custom && custom.length > 0 ? custom : input.fallbackCrosshairColor,
		candleUp: input.bullish,
		candleDown: input.bearish,
		// A1: per-direction grid. `undefined` is left undefined on purpose —
		// the engine reads a missing key as "visible", which is the legacy
		// behaviour, and a missing colour falls back to `gridColor`.
		gridVisible:
			input.vertGridVisible === undefined && input.horzGridVisible === undefined
				? undefined
				: { vertical: input.vertGridVisible, horizontal: input.horzGridVisible },
		gridColorVertical: input.vertGridColor,
		gridColorHorizontal: input.horzGridColor,
	};
}
