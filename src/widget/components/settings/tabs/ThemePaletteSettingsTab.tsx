/**
 * Tab 8: Theme & Palette Settings
 */
import React from "react";
import { useSettingsContext } from "../SettingsContext";
import { useWidgetI18n } from "../../../context/WidgetI18nContext";
import styles from "./settingsTabs.module.css";
import type { ThemePresetName } from "../model/chartSettingsSchema";

export interface ThemePaletteSettingsTabProps {
	toggleTheme?: () => void;
	isDark?: boolean;
	onThemePresetChange?: (theme: ThemePresetName) => void;
}

interface ThemePresetCard {
	name: ThemePresetName;
	title: string;
	bg: string;
	accent: string;
	mode: "dark" | "light";
}

const PRESETS: ThemePresetCard[] = [
	{ name: "classic-dark", title: "Classic Dark", bg: "#0F1720", accent: "#4DA6FF", mode: "dark" },
	{ name: "modern-light", title: "Modern Light", bg: "#ffffff", accent: "#2563eb", mode: "light" },
	{ name: "trading-night", title: "Trading Night", bg: "#071226", accent: "#00A3FF", mode: "dark" },
	{ name: "neutral-pro", title: "Neutral Pro", bg: "#FAFBFC", accent: "#3b82f6", mode: "light" },
	{ name: "high-contrast", title: "High Contrast", bg: "#000000", accent: "#FFD700", mode: "dark" },
	{ name: "midnight-blue", title: "Midnight Blue", bg: "#0d1117", accent: "#58a6ff", mode: "dark" },
];

export function ThemePaletteSettingsTab(props: ThemePaletteSettingsTabProps) {
	const { toggleTheme, onThemePresetChange } = props;
	const { settings, updateSection } = useSettingsContext();
	const { t } = useWidgetI18n();
	const theme = settings.theme;
	const symbol = settings.symbol;

	const handleSelectPreset = (preset: ThemePresetCard) => {
		updateSection("theme", {
			presetName: preset.name,
			mode: preset.mode,
		});
		if (onThemePresetChange) {
			onThemePresetChange(preset.name);
		} else if (preset.mode !== theme.mode) {
			toggleTheme?.();
		}
	};

	return (
		<div className={styles.tabContainer}>
			{/* Mode Switcher */}
			<div className={styles.section}>
				<h4 className={styles.sectionTitle}>{t("settings.theme.mode") || "Theme Mode"}</h4>
				<div className={styles.row}>
					<span className={styles.label}>{t("settings.theme.activeMode") || "Active Mode"}</span>
					<div className={styles.segmented}>
						<button
							type="button"
							className={`${styles.segmentedBtn} ${theme.mode === "dark" ? styles.segmentedBtnActive : ""}`}
							onClick={() => {
								if (theme.mode !== "dark") {
									updateSection("theme", { mode: "dark" });
									toggleTheme?.();
								}
							}}
						>
							🌙 {t("settings.theme.dark") || "Dark"}
						</button>
						<button
							type="button"
							className={`${styles.segmentedBtn} ${theme.mode === "light" ? styles.segmentedBtnActive : ""}`}
							onClick={() => {
								if (theme.mode !== "light") {
									updateSection("theme", { mode: "light" });
									toggleTheme?.();
								}
							}}
						>
							☀️ {t("settings.theme.light") || "Light"}
						</button>
					</div>
				</div>
			</div>

			{/* Presets Grid */}
			<div className={styles.section}>
				<h4 className={styles.sectionTitle}>{t("settings.theme.presets") || "Theme Presets"}</h4>
				<div
					style={{
						display: "grid",
						gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
						gap: "10px",
					}}
				>
					{PRESETS.map((p) => {
						const isSelected = theme.presetName === p.name;
						return (
							<div
								key={p.name}
								onClick={() => handleSelectPreset(p)}
								style={{
									border: isSelected ? "2px solid var(--vnsc-accent, #38bdf8)" : "1px solid var(--vnsc-border, #1e293b)",
									borderRadius: "6px",
									padding: "12px",
									background: "var(--vnsc-bg-secondary, #131d2a)",
									cursor: "pointer",
									display: "flex",
									flexDirection: "column",
									gap: "8px",
									transition: "all 0.15s ease",
								}}
							>
								{/* Color Preview Bar */}
								<div
									style={{
										height: "36px",
										borderRadius: "4px",
										background: p.bg,
										border: "1px solid rgba(255,255,255,0.1)",
										display: "flex",
										alignItems: "center",
										justifyContent: "space-between",
										padding: "0 10px",
									}}
								>
									<span
										style={{
											display: "inline-block",
											width: "12px",
											height: "12px",
											borderRadius: "50%",
											background: p.accent,
										}}
									/>
									<span
										style={{
											fontSize: "10px",
											fontWeight: 600,
											color: p.mode === "dark" ? "#ffffff" : "#0f172a",
										}}
									>
										{p.mode.toUpperCase()}
									</span>
								</div>

								<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
									<span style={{ fontSize: "12px", fontWeight: isSelected ? 700 : 500, color: "var(--vnsc-text-primary, #f1f5f9)" }}>
										{p.title}
									</span>
									{isSelected && <span style={{ color: "var(--vnsc-accent, #38bdf8)", fontSize: "14px" }}>✓</span>}
								</div>
							</div>
						);
					})}
				</div>
			</div>

			{/* Quick Palette Customization */}
			<div className={styles.section}>
				<h4 className={styles.sectionTitle}>{t("settings.theme.palette") || "Color Palette"}</h4>
				<div className={styles.row}>
					<span className={styles.label}>{t("settings.symbol.upColor") || "Up Candle Color"}</span>
					<div className={styles.controlGroup}>
						<input
							type="color"
							className={styles.colorPicker}
							value={symbol.upColor}
							onChange={(e) => updateSection("symbol", { upColor: e.target.value })}
						/>
						<span style={{ fontSize: 12, fontFamily: "monospace", color: "var(--vnsc-text-secondary, #94a3b8)" }}>
							{symbol.upColor.toUpperCase()}
						</span>
					</div>
				</div>

				<div className={styles.row}>
					<span className={styles.label}>{t("settings.symbol.downColor") || "Down Candle Color"}</span>
					<div className={styles.controlGroup}>
						<input
							type="color"
							className={styles.colorPicker}
							value={symbol.downColor}
							onChange={(e) => updateSection("symbol", { downColor: e.target.value })}
						/>
						<span style={{ fontSize: 12, fontFamily: "monospace", color: "var(--vnsc-text-secondary, #94a3b8)" }}>
							{symbol.downColor.toUpperCase()}
						</span>
					</div>
				</div>
			</div>
		</div>
	);
}

