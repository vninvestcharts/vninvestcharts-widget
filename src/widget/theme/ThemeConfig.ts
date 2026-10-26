export interface ThemeConfig {
  mode: "dark" | "light";
  presetName?: string;
  colors?: Partial<{
    bullish: string;
    bearish: string;
    primary: string;
    accent: string;
    bgPrimary: string;
    bgSecondary: string;
    textPrimary: string;
    textSecondary: string;
    border: string;
    grid: string;
    gridSubtle: string;
    gridDash: string;
    gridWidth: string;
    crosshair: string;
    indicators: string[];
  }>;
}
