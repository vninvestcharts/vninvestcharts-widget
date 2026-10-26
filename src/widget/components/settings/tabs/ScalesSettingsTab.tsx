/**
 * Tab 3: Scales & Coordinates Settings
 */
import React from "react";
import { useSettingsContext } from "../SettingsContext";
import { useWidgetI18n } from "../../../context/WidgetI18nContext";
import styles from "./settingsTabs.module.css";
import type { PriceScaleMode } from "../model/chartSettingsSchema";

export function ScalesSettingsTab() {
	const { settings, updateSection } = useSettingsContext();
	const { t } = useWidgetI18n();
	const scales = settings.scales;

	return (
		<div className={styles.tabContainer}>
			{/* Price Scale Mode & Alignment */}
			<div className={styles.section}>
				<h4 className={styles.sectionTitle}>{t("settings.scales.priceScale") || "Price Scale (Y-Axis)"}</h4>
				<div className={styles.row}>
					<span className={styles.label}>{t("settings.scales.mode") || "Scale Mode"}</span>
					<div className={styles.segmented}>
						{(["normal", "logarithmic", "percentage"] as PriceScaleMode[]).map((mode) => (
							<button
								key={mode}
								type="button"
								className={`${styles.segmentedBtn} ${scales.priceScaleMode === mode ? styles.segmentedBtnActive : ""}`}
								onClick={() => updateSection("scales", { priceScaleMode: mode })}
							>
								{mode === "normal"
									? t("settings.scales.mode.normal") || "Normal"
									: mode === "logarithmic"
										? t("settings.scales.mode.log") || "Logarithmic"
										: t("settings.scales.mode.percentage") || "Percentage"}
							</button>
						))}
					</div>
				</div>

				<div className={styles.row}>
					<label className={styles.label}>
						<input
							type="checkbox"
							className={styles.checkbox}
							checked={scales.invertScale}
							onChange={(e) => updateSection("scales", { invertScale: e.target.checked })}
						/>
						{t("settings.scales.invertScale") || "Invert Scale"}
					</label>
				</div>

				<div className={styles.row}>
					<span className={styles.label}>{t("settings.scales.axisPosition") || "Price Axis Position"}</span>
					<div className={styles.segmented}>
						<button
							type="button"
							className={`${styles.segmentedBtn} ${scales.priceAxisPosition === "right" ? styles.segmentedBtnActive : ""}`}
							onClick={() => updateSection("scales", { priceAxisPosition: "right" })}
						>
							{t("settings.scales.right") || "Right"}
						</button>
						<button
							type="button"
							className={`${styles.segmentedBtn} ${scales.priceAxisPosition === "left" ? styles.segmentedBtnActive : ""}`}
							onClick={() => updateSection("scales", { priceAxisPosition: "left" })}
						>
							{t("settings.scales.left") || "Left"}
						</button>
					</div>
				</div>
			</div>

			{/* Scale Labels */}
			<div className={styles.section}>
				<h4 className={styles.sectionTitle}>{t("settings.scales.labels") || "Scale Labels"}</h4>
				<div className={styles.row}>
					<label className={styles.label}>
						<input
							type="checkbox"
							className={styles.checkbox}
							checked={scales.showSymbolLastValue}
							onChange={(e) => updateSection("scales", { showSymbolLastValue: e.target.checked })}
						/>
						{t("settings.scales.showSymbolLastValue") || "Symbol Last Value Label"}
					</label>
				</div>
				<div className={styles.row}>
					<label className={styles.label}>
						<input
							type="checkbox"
							className={styles.checkbox}
							checked={scales.showPrevCloseValue}
							onChange={(e) => updateSection("scales", { showPrevCloseValue: e.target.checked })}
						/>
						{t("settings.scales.showPrevCloseValue") || "Previous Day Close Value Label"}
					</label>
				</div>
				<div className={styles.row}>
					<label className={styles.label}>
						<input
							type="checkbox"
							className={styles.checkbox}
							checked={scales.showIndicatorValues}
							onChange={(e) => updateSection("scales", { showIndicatorValues: e.target.checked })}
						/>
						{t("settings.scales.showIndicatorValues") || "Indicator Value Labels"}
					</label>
				</div>
				<div className={styles.row}>
					<label className={styles.label}>
						<input
							type="checkbox"
							className={styles.checkbox}
							checked={scales.showCountdownToBarClose}
							onChange={(e) => updateSection("scales", { showCountdownToBarClose: e.target.checked })}
						/>
						{t("settings.scales.showCountdown") || "Countdown to Bar Close"}
					</label>
				</div>
			</div>

			{/* Time Axis & Format */}
			<div className={styles.section}>
				<h4 className={styles.sectionTitle}>{t("settings.scales.timeAxis") || "Time Axis (X-Axis)"}</h4>
				<div className={styles.row}>
					<label className={styles.label}>
						<input
							type="checkbox"
							className={styles.checkbox}
							checked={scales.showTimeScrollbar}
							onChange={(e) => updateSection("scales", { showTimeScrollbar: e.target.checked })}
						/>
						<div>
							<div>{t("settings.scales.showScrollbar") || "Time Navigation Scrollbar"}</div>
							<div className={styles.subLabel}>
								{t("settings.scales.showScrollbarNote") || "Navigate visible range and zoom window below X-axis"}
							</div>
						</div>
					</label>
				</div>
				<div className={styles.row}>
					<span className={styles.label}>{t("settings.scales.dateFormat") || "Date Format"}</span>
					<select
						className={styles.select}
						value={scales.dateFormat}
						onChange={(e) => updateSection("scales", { dateFormat: e.target.value as any })}
					>
						<option value="yyyy-mm-dd">yyyy-mm-dd (2026-09-16)</option>
						<option value="dd/mm/yyyy">dd/mm/yyyy (16/09/2026)</option>
						<option value="mm/dd/yyyy">mm/dd/yyyy (09/16/2026)</option>
					</select>
				</div>
				<div className={styles.row}>
					<span className={styles.label}>{t("settings.scales.timeFormat") || "Time Format"}</span>
					<div className={styles.segmented}>
						<button
							type="button"
							className={`${styles.segmentedBtn} ${scales.timeFormat === "24h" ? styles.segmentedBtnActive : ""}`}
							onClick={() => updateSection("scales", { timeFormat: "24h" })}
						>
							24h
						</button>
						<button
							type="button"
							className={`${styles.segmentedBtn} ${scales.timeFormat === "12h" ? styles.segmentedBtnActive : ""}`}
							onClick={() => updateSection("scales", { timeFormat: "12h" })}
						>
							12h (AM/PM)
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}

