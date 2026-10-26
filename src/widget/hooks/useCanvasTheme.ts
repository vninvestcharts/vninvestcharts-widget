import { useCallback, useEffect, useRef, useState } from "react";
import { LEGACY_COMPOSITE_KEY, normalizeChartId, shouldAcceptSettingsEvent } from "../components/settings/storageKeys";

export interface CanvasThemeConfig {
  mode: "dark" | "light";
  colors: {
    bullish: string;
    bearish: string;
    volume: string;
    grid: string;
    gridSubtle: string;
    gridDash: string;
    gridWidth: string;
    crosshair: string;
    selection: string;
    background: string;
    text: string;
    textSecondary: string;
    tooltipBg: string;
    tooltipText: string;
  };
  isHighContrast: boolean;
  presetName: string;
}

function readCanvasTheme(root: HTMLElement | null): CanvasThemeConfig {
	if (!root) {
		return {
			mode: "dark",
			colors: {
				bullish: "rgb(38, 166, 154)",
				bearish: "rgb(239, 83, 80)",
				volume: "rgba(59, 130, 246, 0.3)",
				grid: "rgba(255, 255, 255, 0.05)",
				gridSubtle: "rgba(255, 255, 255, 0.025)",
				gridDash: "",
				gridWidth: "1",
				crosshair: "#2962ff",
				selection: "rgba(41, 98, 255, 0.2)",
				background: "#131722",
				text: "#d1d4dc",
				textSecondary: "#787b86",
				tooltipBg: "#1f2937",
				tooltipText: "#ffffff",
			},
			isHighContrast: false,
			presetName: "dark",
		};
	}

	const style = getComputedStyle(root);
	const read = (name: string) => style.getPropertyValue(name).trim();

	const modeAttr = root.closest("[data-chart-mode]")?.getAttribute?.("data-chart-mode");
	const mode: "dark" | "light" = modeAttr === "light" || read("--vnsc-mode") === "light" ? "light" : "dark";

	const themeAttr = root.closest("[data-chart-theme]")?.getAttribute?.("data-chart-theme") || "dark";
	const isHC = themeAttr === "high-contrast" || read("--vnsc-bg-primary").toLowerCase() === "#000000";

	let customUp: string | undefined;
	let customDown: string | undefined;
	let customGrid: string | undefined;
	let customGridDash: string | undefined;
	let customGridWidth: string | undefined;
	let customCrosshair: string | undefined;
	try {
		// Chart-centric read (S1): own cell key first, legacy global as fallback.
		// The container sits inside the grid slot carrying data-chart-id.
		const domChartId = normalizeChartId(
			root?.closest?.("[data-chart-id]")?.getAttribute?.("data-chart-id") ?? null
		);
		const scopedKey = domChartId ? `${LEGACY_COMPOSITE_KEY}_${domChartId}` : null;
		const raw =
			typeof localStorage !== "undefined"
				? (scopedKey ? localStorage.getItem(scopedKey) : null) ?? localStorage.getItem(LEGACY_COMPOSITE_KEY)
				: null;
		if (raw) {
			const parsed = JSON.parse(raw);
			if (parsed.symbol?.upColor) customUp = parsed.symbol.upColor;
			if (parsed.symbol?.downColor) customDown = parsed.symbol.downColor;
			if (parsed.appearance?.vertGridColor) customGrid = parsed.appearance.vertGridColor;
			if (parsed.appearance?.vertGridStyle) {
				customGridDash = parsed.appearance.vertGridStyle === "dashed" ? "4,4" : parsed.appearance.vertGridStyle === "dotted" ? "2,2" : "";
			}
			if (parsed.appearance?.vertGridWidth) customGridWidth = String(parsed.appearance.vertGridWidth);
			if (parsed.appearance?.crosshairColor) customCrosshair = parsed.appearance.crosshairColor;
		}
	} catch {}

	return {
		mode,
		colors: {
			bullish: customUp || read("--vnsc-color-bullish") || "rgb(38, 166, 154)",
			bearish: customDown || read("--vnsc-color-bearish") || "rgb(239, 83, 80)",
			volume: read("--vnsc-color-volume") || "rgba(59, 130, 246, 0.3)",
			grid: customGrid || read("--vnsc-color-grid") || "rgba(255, 255, 255, 0.05)",
			gridSubtle: read("--vnsc-color-grid-subtle") || "rgba(255, 255, 255, 0.025)",
			gridDash: customGridDash !== undefined ? customGridDash : (read("--vnsc-grid-dash") || ""),
			gridWidth: customGridWidth || read("--vnsc-grid-width") || "1",
			crosshair: customCrosshair || read("--vnsc-color-crosshair") || "#2962ff",
			selection: read("--vnsc-color-selection") || "rgba(41, 98, 255, 0.2)",
			background: read("--vnsc-bg-primary") || "#131722",
			text: read("--vnsc-text-primary") || "#d1d4dc",
			textSecondary: read("--vnsc-text-secondary") || "#787b86",
			tooltipBg: read("--vnsc-bg-tooltip") || "#1f2937",
			tooltipText: read("--vnsc-text-on-primary") || "#ffffff",
		},
		isHighContrast: isHC,
		presetName: themeAttr,
	};
}

export function useCanvasTheme(rootRef: { current: HTMLElement | null }): CanvasThemeConfig {
	const [config, setConfig] = useState<CanvasThemeConfig>(() => readCanvasTheme(rootRef.current));
	const observerRef = useRef<MutationObserver | null>(null);

	const refresh = useCallback(() => {
		setConfig(readCanvasTheme(rootRef.current));
	}, [rootRef]);

	useEffect(() => {
		const el = rootRef.current;
		if (!el) return;

		setConfig(readCanvasTheme(el));

		observerRef.current?.disconnect();
		const observer = new MutationObserver((mutations) => {
			for (const m of mutations) {
				if (m.type === "attributes" && (m.attributeName === "data-chart-theme" || m.attributeName === "data-chart-mode")) {
					refresh();
					return;
				}
			}
		});
		observer.observe(el, { attributes: true, attributeFilter: ["data-chart-theme", "data-chart-mode"] });
		observerRef.current = observer;

		const handler = (e: Event) => {
			// Two-way guard (S2): same rule as useWidgetSettings.
			const incomingChartId = (e as CustomEvent<any>).detail?.chartId ?? null;
			const myId = normalizeChartId(el?.closest?.("[data-chart-id]")?.getAttribute?.("data-chart-id") ?? null);
			if (!shouldAcceptSettingsEvent(myId, incomingChartId)) return;
			refresh();
		};
		document.addEventListener("vnsc-theme-change", handler);
		if (typeof window !== "undefined") {
			window.addEventListener("vnsc-settings-sync", handler);
		}

		return () => {
			observer.disconnect();
			document.removeEventListener("vnsc-theme-change", handler);
			if (typeof window !== "undefined") {
				window.removeEventListener("vnsc-settings-sync", handler);
			}
		};
	}, [rootRef, refresh]);

	return config;
}
