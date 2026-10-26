/**
 * Tab 2: Status Line Settings
 */
import React from "react";
import { useSettingsContext } from "../SettingsContext";
import { useWidgetI18n } from "../../../context/WidgetI18nContext";
import styles from "./settingsTabs.module.css";

export function StatusLineSettingsTab() {
	const { settings, updateSection } = useSettingsContext();
	const { t } = useWidgetI18n();
	const statusLine = settings.statusLine;

	return (
		<div className={styles.tabContainer}>
			{/* Symbol & Price Header */}
			<div className={styles.section}>
				<h4 className={styles.sectionTitle}>{t("settings.statusLine.symbol") || "Symbol"}</h4>
				<div className={styles.row}>
					<label className={styles.label}>
						<input
							type="checkbox"
							className={styles.checkbox}
							checked={statusLine.showLogo}
							onChange={(e) => updateSection("statusLine", { showLogo: e.target.checked })}
						/>
						{t("settings.statusLine.showLogo") || "Show Logo"}
					</label>
				</div>
				<div className={styles.row}>
					<label className={styles.label}>
						<input
							type="checkbox"
							className={styles.checkbox}
							checked={statusLine.showTicker}
							onChange={(e) => updateSection("statusLine", { showTicker: e.target.checked })}
						/>
						{t("settings.statusLine.showTicker") || "Show Ticker"}
					</label>
				</div>
				<div className={styles.row}>
					<label className={styles.label}>
						<input
							type="checkbox"
							className={styles.checkbox}
							checked={statusLine.showOhlc}
							onChange={(e) => updateSection("statusLine", { showOhlc: e.target.checked })}
						/>
						{t("settings.statusLine.showOhlc") || "Show OHLC Summary"}
					</label>
				</div>
				<div className={styles.row}>
					<label className={styles.label}>
						<input
							type="checkbox"
							className={styles.checkbox}
							checked={statusLine.showBarChange}
							onChange={(e) => updateSection("statusLine", { showBarChange: e.target.checked })}
						/>
						{t("settings.statusLine.showBarChange") || "Show Bar Change Values"}
					</label>
				</div>
				<div className={styles.row}>
					<label className={styles.label}>
						<input
							type="checkbox"
							className={styles.checkbox}
							checked={statusLine.showVolume}
							onChange={(e) => updateSection("statusLine", { showVolume: e.target.checked })}
						/>
						{t("settings.statusLine.showVolume") || "Show Volume"}
					</label>
				</div>
			</div>

			{/* Indicators on Status Line */}
			<div className={styles.section}>
				<h4 className={styles.sectionTitle}>{t("settings.statusLine.indicators") || "Indicators"}</h4>
				<div className={styles.row}>
					<label className={styles.label}>
						<input
							type="checkbox"
							className={styles.checkbox}
							checked={statusLine.showIndicatorTitles}
							onChange={(e) => updateSection("statusLine", { showIndicatorTitles: e.target.checked })}
						/>
						{t("settings.statusLine.showIndicatorTitles") || "Show Indicator Titles"}
					</label>
				</div>
				<div className={styles.row}>
					<label className={styles.label}>
						<input
							type="checkbox"
							className={styles.checkbox}
							checked={statusLine.showIndicatorArguments}
							onChange={(e) => updateSection("statusLine", { showIndicatorArguments: e.target.checked })}
						/>
						{t("settings.statusLine.showIndicatorArguments") || "Show Indicator Arguments"}
					</label>
				</div>
				<div className={styles.row}>
					<label className={styles.label}>
						<input
							type="checkbox"
							className={styles.checkbox}
							checked={statusLine.showIndicatorValues}
							onChange={(e) => updateSection("statusLine", { showIndicatorValues: e.target.checked })}
						/>
						{t("settings.statusLine.showIndicatorValues") || "Show Indicator Values"}
					</label>
				</div>
			</div>

			{/* Background Opacity */}
			<div className={styles.section}>
				<h4 className={styles.sectionTitle}>{t("settings.statusLine.appearance") || "Appearance"}</h4>
				<div className={styles.row}>
					<span className={styles.label}>{t("settings.statusLine.backgroundOpacity") || "Background Opacity"}</span>
					<div className={styles.controlGroup}>
						<input
							type="range"
							min={0}
							max={100}
							step={5}
							value={statusLine.backgroundOpacity}
							onChange={(e) => updateSection("statusLine", { backgroundOpacity: Number(e.target.value) })}
						/>
						<span style={{ fontSize: 12, width: 36, textAlign: "right" }}>{statusLine.backgroundOpacity}%</span>
					</div>
				</div>
			</div>
		</div>
	);
}

