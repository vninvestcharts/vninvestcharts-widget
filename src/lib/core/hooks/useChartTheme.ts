import { useCallback, useState } from "react";

export type ChartTheme =
  | "modern-light"
  | "classic-dark"
  | "trading-night"
  | "neutral-pro"
  | "midnight-blue"
  | "high-contrast";

export type ThemeMode = "light" | "dark";

const STORAGE_KEY = "rsc-chart-theme";

const ALL_THEMES: ChartTheme[] = [
	"modern-light",
	"classic-dark",
	"trading-night",
	"neutral-pro",
	"midnight-blue",
	"high-contrast",
];

const CYCLE_THEMES: ChartTheme[] = ALL_THEMES.filter((t) => t !== "high-contrast") as ChartTheme[];

export function themeToMode(theme: ChartTheme): ThemeMode {
	switch (theme) {
		case "modern-light":
		case "neutral-pro":
			return "light";
		case "classic-dark":
		case "trading-night":
		case "midnight-blue":
		case "high-contrast":
			return "dark";
	}
}

export interface UseChartThemeResult {
  theme: ChartTheme;
  setTheme: (theme: ChartTheme) => void;
  cycleTheme: () => void;
  toggleTheme: () => void;
  isDark: boolean;
  resolvedMode: ThemeMode;
}

export function useChartTheme(defaultTheme: ChartTheme = "classic-dark"): UseChartThemeResult {
	const [theme, setThemeState] = useState<ChartTheme>(() => {
		try {
			const stored = localStorage.getItem(STORAGE_KEY);
			if ((ALL_THEMES as readonly string[]).includes(stored ?? "")) return stored as ChartTheme;
		} catch {
			// ignore (SSR / restricted storage)
		}
		return defaultTheme;
	});

	const setTheme = useCallback((t: ChartTheme) => {
		setThemeState(t);
		try {
			localStorage.setItem(STORAGE_KEY, t);
		} catch {
			// ignore
		}
	}, []);

	const cycleTheme = useCallback(() => {
		const idx = CYCLE_THEMES.indexOf(theme);
		// Nếu đang ở high-contrast (a11y riêng) thì cycle về đầu danh sách thường
		if (idx === -1) {
			setTheme(CYCLE_THEMES[0]);
			return;
		}
		const next = CYCLE_THEMES[(idx + 1) % CYCLE_THEMES.length];
		setTheme(next);
	}, [theme, setTheme]);

	const resolvedMode = themeToMode(theme);
	const isDark = resolvedMode === "dark";
	const toggleTheme = useCallback(() => {
		setTheme(isDark ? "modern-light" : "classic-dark");
	}, [isDark, setTheme]);

	return {
		theme,
		setTheme,
		cycleTheme,
		toggleTheme,
		isDark,
		resolvedMode,
	};
}
