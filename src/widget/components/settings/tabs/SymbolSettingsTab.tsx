/**
 * Tab 1: Symbol & Candle Settings
 */
import React from "react";
import { useSettingsContext } from "../SettingsContext";
import { useWidgetI18n } from "../../../context/WidgetI18nContext";
import styles from "./settingsTabs.module.css";
import type { CandleStyle } from "../model/chartSettingsSchema";

export function SymbolSettingsTab() {
	const { settings, updateSection } = useSettingsContext();
	const { t } = useWidgetI18n();
	const symbol = settings.symbol;

	const handleCandleStyleChange = (style: CandleStyle) => {
		updateSection("symbol", { candleStyle: style });
	};

	return (
		<div className={styles.tabContainer}>
			{/* Chart Style */}
			<div className={styles.section}>
				<h4 className={styles.sectionTitle}>{t("settings.symbol.candleStyle") || "Chart Style"}</h4>
				<div className={styles.row}>
					<span className={styles.label}>{t("settings.symbol.style") || "Display Style"}</span>
					<div className={styles.segmented}>
						{(["candle", "hollow", "bar", "line", "area"] as CandleStyle[]).map((st) => (
							<button
								key={st}
								type="button"
								className={`${styles.segmentedBtn} ${symbol.candleStyle === st ? styles.segmentedBtnActive : ""}`}
								onClick={() => handleCandleStyleChange(st)}
							>
								{st === "candle"
									? t("settings.styleCandle") || "Candle"
									: st === "hollow"
										? t("settings.styleHollowBox") || "Hollow"
										: st === "bar"
											? t("settings.styleBar") || "Bar"
											: st === "line"
												? t("settings.styleLine") || "Line"
												: t("settings.styleArea") || "Area"}
							</button>
						))}
					</div>
				</div>
			</div>

			{/* Candle Colors */}
			<div className={styles.section}>
				<h4 className={styles.sectionTitle}>{t("settings.symbol.colors") || "Candle Colors"}</h4>
				<div className={styles.row}>
					<span className={styles.label}>{t("settings.symbol.body") || "Body (Up / Down)"}</span>
					<div className={styles.controlGroup}>
						<input
							type="color"
							className={styles.colorPicker}
							value={symbol.upColor}
							onChange={(e) => updateSection("symbol", { upColor: e.target.value })}
							title={t("settings.symbol.title.upCandle") || "Up Candle"}
						/>
						<input
							type="color"
							className={styles.colorPicker}
							value={symbol.downColor}
							onChange={(e) => updateSection("symbol", { downColor: e.target.value })}
							title={t("settings.symbol.title.downCandle") || "Down Candle"}
						/>
					</div>
				</div>
				<div className={styles.row}>
					<span className={styles.label}>{t("settings.symbol.borders") || "Borders (Up / Down)"}</span>
					<div className={styles.controlGroup}>
						<input
							type="color"
							className={styles.colorPicker}
							value={symbol.borderUpColor}
							onChange={(e) => updateSection("symbol", { borderUpColor: e.target.value })}
							title={t("settings.symbol.title.upBorder") || "Up Border"}
						/>
						<input
							type="color"
							className={styles.colorPicker}
							value={symbol.borderDownColor}
							onChange={(e) => updateSection("symbol", { borderDownColor: e.target.value })}
							title={t("settings.symbol.title.downBorder") || "Down Border"}
						/>
					</div>
				</div>
				<div className={styles.row}>
					<span className={styles.label}>{t("settings.symbol.wick") || "Wick (Up / Down)"}</span>
					<div className={styles.controlGroup}>
						<input
							type="color"
							className={styles.colorPicker}
							value={symbol.wickUpColor}
							onChange={(e) => updateSection("symbol", { wickUpColor: e.target.value })}
							title={t("settings.symbol.title.upWick") || "Up Wick"}
						/>
						<input
							type="color"
							className={styles.colorPicker}
							value={symbol.wickDownColor}
							onChange={(e) => updateSection("symbol", { wickDownColor: e.target.value })}
							title={t("settings.symbol.title.downWick") || "Down Wick"}
						/>
					</div>
				</div>
			</div>

			{/* Price Reference Lines */}
			<div className={styles.section}>
				<h4 className={styles.sectionTitle}>{t("settings.symbol.priceLines") || "Price Reference Lines"}</h4>
				<div className={styles.row}>
					<label className={styles.label}>
						<input
							type="checkbox"
							className={styles.checkbox}
							checked={symbol.showLastPriceLine}
							onChange={(e) => updateSection("symbol", { showLastPriceLine: e.target.checked })}
						/>
						{t("settings.symbol.lastPriceLine") || "Last Price Line"}
					</label>
					{symbol.showLastPriceLine && (
						<input
							type="color"
							className={styles.colorPicker}
							value={symbol.lastPriceLineColor || symbol.upColor}
							onChange={(e) => updateSection("symbol", { lastPriceLineColor: e.target.value })}
						/>
					)}
				</div>
				<div className={styles.row}>
					<label className={styles.label}>
						<input
							type="checkbox"
							className={styles.checkbox}
							checked={symbol.showPrevClosePriceLine}
							onChange={(e) => updateSection("symbol", { showPrevClosePriceLine: e.target.checked })}
						/>
						{t("settings.symbol.prevClosePriceLine") || "Previous Day Close Price Line"}
					</label>
					{symbol.showPrevClosePriceLine && (
						<input
							type="color"
							className={styles.colorPicker}
							value={symbol.prevClosePriceLineColor || "#64748b"}
							onChange={(e) => updateSection("symbol", { prevClosePriceLineColor: e.target.value })}
						/>
					)}
				</div>
				<div className={styles.row}>
					<label className={styles.label}>
						<input
							type="checkbox"
							className={styles.checkbox}
							checked={symbol.showHighLowPriceLines}
							onChange={(e) => updateSection("symbol", { showHighLowPriceLines: e.target.checked })}
						/>
						{t("settings.symbol.highLowPriceLines") || "High / Low Price Lines"}
					</label>
				</div>
			</div>

			{/* Precision & Timezone */}
			<div className={styles.section}>
				<h4 className={styles.sectionTitle}>{t("settings.symbol.general") || "General"}</h4>
				<div className={styles.row}>
					<span className={styles.label}>{t("settings.symbol.precision") || "Precision"}</span>
					<select
						className={styles.select}
						value={symbol.precision}
						onChange={(e) => updateSection("symbol", { precision: e.target.value as any })}
					>
						<option value="default">{t("settings.symbol.precision.default") || "Default"}</option>
						<option value="0">0 (12,345)</option>
						<option value="1">1 (12,345.6)</option>
						<option value="2">2 (12,345.67)</option>
						<option value="3">3 (12,345.678)</option>
						<option value="4">4 (12,345.6789)</option>
					</select>
				</div>
				<div className={styles.row}>
					<span className={styles.label}>{t("settings.symbol.timezone") || "Timezone"}</span>
					<select
						className={styles.select}
						value={symbol.timezone}
						onChange={(e) => updateSection("symbol", { timezone: e.target.value })}
					>
						<option value="Asia/Ho_Chi_Minh">{t("settings.symbol.timezone.hcm") || "Ho Chi Minh (UTC+7)"}</option>
						<option value="UTC">{t("settings.symbol.timezone.utc") || "UTC (+0)"}</option>
						<option value="America/New_York">{t("settings.symbol.timezone.newYork") || "New York (EST/EDT)"}</option>
						<option value="Europe/London">{t("settings.symbol.timezone.london") || "London (GMT/BST)"}</option>
						<option value="Asia/Tokyo">{t("settings.symbol.timezone.tokyo") || "Tokyo (JST, UTC+9)"}</option>
						<option value="Asia/Singapore">{t("settings.symbol.timezone.singapore") || "Singapore (SGT, UTC+8)"}</option>
					</select>
				</div>
			</div>
		</div>
	);
}

