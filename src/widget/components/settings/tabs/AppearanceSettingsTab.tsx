/**
 * Tab 4: Appearance & Canvas Theme Settings
 */
import React from "react";
import { useSettingsContext } from "../SettingsContext";
import { useWidgetI18n } from "../../../context/WidgetI18nContext";
import styles from "./settingsTabs.module.css";
import type { CrosshairMode, GridLineStyle } from "../model/chartSettingsSchema";
import { toHexInputValue, withPreservedAlpha } from "../model/colorAlpha";

export function AppearanceSettingsTab() {
	const { settings, updateSection } = useSettingsContext();
	const { t } = useWidgetI18n();
	const appearance = settings.appearance;

	return (
		<div className={styles.tabContainer}>
			{/* Background */}
			<div className={styles.section}>
				<h4 className={styles.sectionTitle}>{t("settings.appearance.background") || "Background"}</h4>
				<div className={styles.row}>
					<span className={styles.label}>{t("settings.appearance.bgType") || "Background Type"}</span>
					<div className={styles.segmented}>
						<button
							type="button"
							className={`${styles.segmentedBtn} ${appearance.backgroundType === "solid" ? styles.segmentedBtnActive : ""}`}
							onClick={() => updateSection("appearance", { backgroundType: "solid" })}
						>
							{t("settings.appearance.solid") || "Solid"}
						</button>
						<button
							type="button"
							className={`${styles.segmentedBtn} ${appearance.backgroundType === "gradient" ? styles.segmentedBtnActive : ""}`}
							onClick={() => updateSection("appearance", { backgroundType: "gradient" })}
						>
							{t("settings.appearance.gradient") || "Gradient"}
						</button>
					</div>
				</div>

				{appearance.backgroundType === "solid" ? (
					<div className={styles.row}>
						<span className={styles.label}>{t("settings.appearance.bgColor") || "Background Color"}</span>
						<input
							type="color"
							className={styles.colorPicker}
							value={appearance.backgroundColor.startsWith("#") ? appearance.backgroundColor : "#0f1720"}
							onChange={(e) => updateSection("appearance", { backgroundColor: e.target.value })}
						/>
					</div>
				) : (
					<div className={styles.row}>
						<span className={styles.label}>{t("settings.appearance.gradientColors") || "Gradient Colors"}</span>
						<div className={styles.controlGroup}>
							<input
								type="color"
								className={styles.colorPicker}
								value={appearance.backgroundGradientTop || "#0f1720"}
								onChange={(e) => updateSection("appearance", { backgroundGradientTop: e.target.value })}
								title={t("settings.appearance.gradientTop") || "Top color"}
							/>
							<input
								type="color"
								className={styles.colorPicker}
								value={appearance.backgroundGradientBottom || "#1e293b"}
								onChange={(e) => updateSection("appearance", { backgroundGradientBottom: e.target.value })}
								title={t("settings.appearance.gradientBottom") || "Bottom color"}
							/>
						</div>
					</div>
				)}
			</div>

			{/* Grid Lines */}
			<div className={styles.section}>
				<h4 className={styles.sectionTitle}>{t("settings.appearance.grid") || "Grid Lines"}</h4>
				{/* Vertical Grid */}
				<div className={styles.row}>
					<label className={styles.label}>
						<input
							type="checkbox"
							className={styles.checkbox}
							checked={appearance.vertGridVisible}
							onChange={(e) => updateSection("appearance", { vertGridVisible: e.target.checked })}
						/>
						{t("settings.appearance.vertGrid") || "Vertical Grid"}
					</label>
					{appearance.vertGridVisible && (
						<div className={styles.controlGroup}>
							<select
								className={styles.select}
								value={appearance.vertGridStyle}
								onChange={(e) => updateSection("appearance", { vertGridStyle: e.target.value as GridLineStyle })}
							>
								<option value="solid">{t("settings.appearance.gridStyle.solid") || "Solid"}</option>
								<option value="dashed">{t("settings.appearance.gridStyle.dashed") || "Dashed"}</option>
								<option value="dotted">{t("settings.appearance.gridStyle.dotted") || "Dotted"}</option>
							</select>
							<input
								type="color"
								className={styles.colorPicker}
								value={toHexInputValue(appearance.vertGridColor)}
								onChange={(e) =>
									updateSection("appearance", {
										vertGridColor: withPreservedAlpha(appearance.vertGridColor, e.target.value),
									})
								}
							/>
						</div>
					)}
				</div>

				{/* Horizontal Grid */}
				<div className={styles.row}>
					<label className={styles.label}>
						<input
							type="checkbox"
							className={styles.checkbox}
							checked={appearance.horzGridVisible}
							onChange={(e) => updateSection("appearance", { horzGridVisible: e.target.checked })}
						/>
						{t("settings.appearance.horzGrid") || "Horizontal Grid"}
					</label>
					{appearance.horzGridVisible && (
						<div className={styles.controlGroup}>
							<select
								className={styles.select}
								value={appearance.horzGridStyle}
								onChange={(e) => updateSection("appearance", { horzGridStyle: e.target.value as GridLineStyle })}
							>
								<option value="solid">{t("settings.appearance.gridStyle.solid") || "Solid"}</option>
								<option value="dashed">{t("settings.appearance.gridStyle.dashed") || "Dashed"}</option>
								<option value="dotted">{t("settings.appearance.gridStyle.dotted") || "Dotted"}</option>
							</select>
							<input
								type="color"
								className={styles.colorPicker}
								value={toHexInputValue(appearance.horzGridColor)}
								onChange={(e) =>
									updateSection("appearance", {
										horzGridColor: withPreservedAlpha(appearance.horzGridColor, e.target.value),
									})
								}
							/>
						</div>
					)}
				</div>
			</div>

			{/* Crosshair */}
			<div className={styles.section}>
				<h4 className={styles.sectionTitle}>{t("settings.appearance.crosshair") || "Crosshair"}</h4>
				<div className={styles.row}>
					<span className={styles.label}>{t("settings.appearance.crosshairMode") || "Crosshair Mode"}</span>
					<div className={styles.segmented}>
						{(["cross", "dot", "magnet"] as CrosshairMode[]).map((mode) => (
							<button
								key={mode}
								type="button"
								className={`${styles.segmentedBtn} ${appearance.crosshairMode === mode ? styles.segmentedBtnActive : ""}`}
								onClick={() => updateSection("appearance", { crosshairMode: mode })}
							>
								{mode === "cross"
									? t("settings.appearance.crosshair.cross") || "Cross (+)"
									: mode === "dot"
										? t("settings.appearance.crosshair.dot") || "Dot (•)"
										: t("settings.appearance.crosshair.magnet") || "Magnet (🧲)"}
							</button>
						))}
					</div>
				</div>

				<div className={styles.row}>
					<span className={styles.label}>{t("settings.appearance.crosshairColor") || "Crosshair Color"}</span>
					<input
						type="color"
						className={styles.colorPicker}
						value={appearance.crosshairColor.startsWith("#") ? appearance.crosshairColor : "#94a3b8"}
						onChange={(e) => updateSection("appearance", { crosshairColor: e.target.value })}
					/>
				</div>
			</div>

			{/* Watermark & Scales Font */}
			<div className={styles.section}>
				<h4 className={styles.sectionTitle}>{t("settings.appearance.watermarkAndFont") || "Watermark & Scales"}</h4>
				<div className={styles.row}>
					<label className={styles.label}>
						<input
							type="checkbox"
							className={styles.checkbox}
							checked={appearance.showWatermark}
							onChange={(e) => updateSection("appearance", { showWatermark: e.target.checked })}
						/>
						{t("settings.appearance.showWatermark") || "Watermark"}
					</label>
					{appearance.showWatermark && (
						<div className={styles.controlGroup}>
							<input
								type="range"
								min={5}
								max={50}
								step={5}
								value={appearance.watermarkOpacity}
								onChange={(e) => updateSection("appearance", { watermarkOpacity: Number(e.target.value) })}
							/>
							<span style={{ fontSize: 12, width: 32 }}>{appearance.watermarkOpacity}%</span>
						</div>
					)}
				</div>

				<div className={styles.row}>
					<span className={styles.label}>{t("settings.appearance.scalesFontSize") || "Scales Font Size"}</span>
					<select
						className={styles.select}
						value={appearance.scalesFontSize}
						onChange={(e) => updateSection("appearance", { scalesFontSize: Number(e.target.value) as any })}
					>
						<option value={10}>10px</option>
						<option value={11}>{t("settings.appearance.fontSizeDefault") || "11px (Default)"}</option>
						<option value={12}>12px</option>
						<option value={14}>14px</option>
					</select>
				</div>
			</div>
		</div>
	);
}

