import type { ThemeConfig } from "./ThemeConfig";

const CSS_VAR_MAP: Record<string, keyof NonNullable<ThemeConfig["colors"]>> = {
	"--vnsc-color-bullish": "bullish",
	"--vnsc-color-bearish": "bearish",
	"--vnsc-color-primary": "primary",
	"--vnsc-color-accent": "accent",
	"--vnsc-bg-primary": "bgPrimary",
	"--vnsc-bg-secondary": "bgSecondary",
	"--vnsc-text-primary": "textPrimary",
	"--vnsc-text-secondary": "textSecondary",
	"--vnsc-border-primary": "border",
	"--vnsc-color-grid": "grid",
	"--vnsc-color-grid-subtle": "gridSubtle",
	"--vnsc-grid-dash": "gridDash",
	"--vnsc-grid-width": "gridWidth",
	"--vnsc-color-crosshair": "crosshair",
};

export function applyTheme(
	element: HTMLElement,
	config: ThemeConfig,
): void {
	element.setAttribute("data-chart-mode", config.mode);
	if (config.presetName) element.setAttribute("data-chart-theme", config.presetName);

	if (!config.colors) return;

	for (const [cssVar, key] of Object.entries(CSS_VAR_MAP)) {
		const value = config.colors[key];
		if (value === undefined) continue;

		if (key === "indicators" && Array.isArray(value)) {
			value.forEach((indicatorColor, i) => {
				if (i < 10) {
					element.style.setProperty(
						`--vnsc-indicator-${i + 1}`,
						indicatorColor,
					);
				}
			});
			continue;
		}

		element.style.setProperty(cssVar, value as string);
	}

	element.dispatchEvent(new CustomEvent("vnsc-theme-change", { detail: config }));
}

export function readThemeFromElement(element: HTMLElement): ThemeConfig {
	const mode = (element.getAttribute("data-chart-mode") as ThemeConfig["mode"]) || "dark";
	const style = getComputedStyle(element);

	const colors: ThemeConfig["colors"] = {};
	for (const [cssVar, key] of Object.entries(CSS_VAR_MAP)) {
		const value = style.getPropertyValue(cssVar).trim();
		if (value) {
			(colors as Record<string, string>)[key] = value;
		}
	}

	const indicators: string[] = [];
	for (let i = 1; i <= 10; i++) {
		const val = style.getPropertyValue(`--vnsc-indicator-${i}`).trim();
		if (val) indicators.push(val);
	}
	if (indicators.length > 0) colors.indicators = indicators;

	return { mode, colors: Object.keys(colors).length > 0 ? colors : undefined };
}
