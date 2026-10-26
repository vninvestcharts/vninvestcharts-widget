/**
 * Indicator Parameters Form
 * Generates parameter fields, input source selectors, and styling per indicator
 */
import React from "react";
import type { PaneDescriptor, SeriesConfig, SeriesSettingField } from "../../../../lib/core";
import { getSeries, SERIES_SUB_COMPONENTS } from "../../../../lib/core";
import { useVNInvestChartsState } from "../../../context/VNInvestChartsStateContext";
import { useWidgetI18n } from "../../../context/WidgetI18nContext";
import { SettingsRangeSlider } from "../SettingsRangeSlider";
import { supportsSeriesLineWidth, formatSeriesDisplayName, TECHNICAL_INDICATORS } from "../helpers/seriesFormatters";
import { outputKeysFor } from "../../../../lib/indicators/outputKeys";
import styles from "./settingsTabs.module.css";

export interface IndicatorParamsFormProps {
	pane: PaneDescriptor;
	series: SeriesConfig;
	seriesIndex: number;
}

export function IndicatorParamsForm(props: IndicatorParamsFormProps) {
	const { pane, series, seriesIndex } = props;
	const { paneState } = useVNInvestChartsState();
	const { t } = useWidgetI18n();

	let entry: any;
	try {
		entry = getSeries(series.type);
	} catch {
		return null;
	}

	const fields: SeriesSettingField[] = entry.settingsFields ?? [];

	const handleParamChange = (key: string, val: number | string) => {
		paneState.dispatch({
			type: "updateSeriesParams",
			paneId: pane.id,
			seriesType: series.type,
			params: { ...series.params, [key]: val },
			seriesIndex,
		});
	};

	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				gap: "10px",
				marginTop: "8px",
				padding: "10px",
				background: "var(--vnsc-bg-secondary, #131d2a)",
				borderRadius: "4px",
				border: "1px solid var(--vnsc-border, #1e293b)",
			}}
		>
			<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
				{fields.map((field: SeriesSettingField) => {
					const currentVal = series.params?.[field.key] ?? field.defaultValue;
					return (
						<label key={field.key} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
							<span style={{ fontSize: "11px", color: "var(--vnsc-text-secondary, #94a3b8)" }}>{t(field.labelKey)}</span>
							{field.type === "select" ? (
								<select
									className={styles.select}
									value={currentVal as string}
									onChange={(e) => handleParamChange(field.key, e.target.value)}
								>
									{(field.options ?? []).map((opt: { value: string; labelKey: string }) => (
										<option key={opt.value} value={opt.value}>
											{t(opt.labelKey)}
										</option>
									))}
								</select>
							) : field.type === "color" ? (
								<input
									type="color"
									className={styles.colorPicker}
									value={currentVal && String(currentVal) !== "" ? String(currentVal) : "#000000"}
									onChange={(e) => handleParamChange(field.key, e.target.value)}
								/>
							) : (
								<input
									type={field.type}
									className={styles.input}
									value={currentVal as string}
									min={field.min}
									max={field.max}
									step={field.step ?? 1}
									onChange={(e) =>
										handleParamChange(field.key, field.type === "number" ? parseFloat(e.target.value) : e.target.value)
									}
								/>
							)}
						</label>
					);
				})}

				{/* Custom input Source dropdown for Indicators-on-Indicators */}
				{["EMA", "MA", "RSI", "BollingerBand", "WMA", "HMA", "DEMA", "TEMA", "StdDev"].includes(series.type) && (() => {
					const otherIndicators: { id: string; displayName: string; keys: string[] }[] = [];
					paneState.panes.forEach((p) => {
						p.series.forEach((s, sIdx) => {
							if (s.id && s.id !== series.id && s.type !== "Volume") {
								const displayName = formatSeriesDisplayName(s.type, s.params, t, sIdx);
								// SSOT, shared with settings/AlertsModal.tsx. These two used to carry
								// verbatim copies of the same map and both had already drifted
								// (`StrengthElder: ["bull","bear"]` vs a `{bullPower,bearPower}` value).
								const INDICATOR_OUTPUTS = outputKeysFor(s.type);
								otherIndicators.push({ id: s.id, displayName, keys: [...INDICATOR_OUTPUTS] });
							}
						});
					});

					let currentSourceVal = "price:close";
					if (series.sourceType === "indicator" && series.sourceId) {
						currentSourceVal = `indicator:${series.sourceId}:${series.sourceKey || ""}`;
					} else if (series.sourceKey) {
						currentSourceVal = `price:${series.sourceKey}`;
					}

					const handleSourceSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
						const val = e.target.value;
						if (val.startsWith("indicator:")) {
							const [, sId, sKey] = val.split(":");
							paneState.dispatch({
								type: "updateSeriesSource",
								paneId: pane.id,
								seriesType: series.type,
								sourceType: "indicator",
								sourceId: sId,
								sourceKey: sKey || undefined,
								seriesIndex,
							});
						} else {
							const [, sKey] = val.split(":");
							paneState.dispatch({
								type: "updateSeriesSource",
								paneId: pane.id,
								seriesType: series.type,
								sourceType: "price",
								sourceId: undefined,
								sourceKey: sKey || undefined,
								seriesIndex,
							});
						}
					};

					return (
						<label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
							<span style={{ fontSize: "11px", color: "var(--vnsc-text-secondary, #94a3b8)" }}>
								{t("ui.indicator.settings.source") || "Source"}
							</span>
							<select className={styles.select} value={currentSourceVal} onChange={handleSourceSelectChange}>
								<optgroup label={t("ui.indicator.settings.source.price") || "Price"}>
									<option value="price:close">{t("settings.priceClose") || "Close"}</option>
									<option value="price:open">{t("settings.priceOpen") || "Open"}</option>
									<option value="price:high">{t("settings.priceHigh") || "High"}</option>
									<option value="price:low">{t("settings.priceLow") || "Low"}</option>
									<option value="price:volume">{t("settings.priceVolume") || "Volume"}</option>
								</optgroup>
								{otherIndicators.length > 0 && (
									<optgroup label={t("ui.indicator.settings.source.indicators") || "Other Indicators"}>
										{otherIndicators.map((ind) =>
											ind.keys.map((k) => (
												<option key={`${ind.id}:${k}`} value={`indicator:${ind.id}:${k}`}>
													{ind.displayName} {k ? `-> ${k}` : ""}
												</option>
											))
										)}
									</optgroup>
								)}
							</select>
						</label>
					);
				})()}

				{/* Custom timeframe select for MTF */}
				{TECHNICAL_INDICATORS.has(series.type) && (
					<label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
						<span style={{ fontSize: "11px", color: "var(--vnsc-text-secondary, #94a3b8)" }}>
							{t("ui.indicator.settings.timeframe") || "Timeframe (MTF)"}
						</span>
						<select
							className={styles.select}
							value={(series.params?.timeframe as string) || "Same as chart"}
							onChange={(e) =>
								paneState.dispatch({
									type: "updateSeriesParams",
									paneId: pane.id,
									seriesType: series.type,
									params: { ...series.params, timeframe: e.target.value === "Same as chart" ? undefined : e.target.value },
									seriesIndex,
								})
							}
						>
							<option value="Same as chart">{t("ui.indicator.settings.timeframe.sameAsChart") || "Same as chart"}</option>
							<option value="1m">1m</option>
							<option value="5m">5m</option>
							<option value="15m">15m</option>
							<option value="1h">1h</option>
							<option value="4h">4h</option>
							<option value="1d">1d</option>
							<option value="1w">1w</option>
						</select>
					</label>
				)}

				{/* Main Color Picker */}
				<label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
					<span style={{ fontSize: "11px", color: "var(--vnsc-text-secondary, #94a3b8)" }}>
						{t("settings.seriesColor") || "Main Color"}
					</span>
					<div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
						<input
							type="color"
							className={styles.colorPicker}
							value={series.color ?? "#2962ff"}
							onChange={(e) =>
								paneState.dispatch({
									type: "updateSeriesColor",
									paneId: pane.id,
									seriesType: series.type,
									color: e.target.value,
									seriesIndex,
								})
							}
						/>
						<span style={{ fontSize: "11px", color: "var(--vnsc-text-secondary, #94a3b8)", fontFamily: "monospace" }}>
							{(series.color ?? "#2962ff").toUpperCase()}
						</span>
					</div>
				</label>
			</div>

			{/* Line Width Control */}
			{supportsSeriesLineWidth(series.type) && (
				<div style={{ display: "flex", flexDirection: "column", gap: "4px", marginTop: "4px" }}>
					<span style={{ fontSize: "11px", color: "var(--vnsc-text-secondary, #94a3b8)" }}>
						{t("settings.lineWidth") || "Line Width"}
					</span>
					<SettingsRangeSlider
						value={series.lineWidth ?? 2}
						min={0.5}
						max={8}
						step={0.25}
						formatValue={(v) => `${v.toFixed(2)}px`}
						marks={[
							{ value: 0.5, label: "0.5px" },
							{ value: 1, label: "1px" },
							{ value: 2, label: "2px" },
							{ value: 4, label: "4px" },
							{ value: 8, label: "8px" },
						]}
						inputAriaLabel={t("settings.lineWidth") || "Line Width"}
						onChange={(next) =>
							paneState.dispatch({
								type: "updateSeriesLineWidth",
								paneId: pane.id,
								seriesType: series.type,
								lineWidth: next,
								seriesIndex,
							})
						}
					/>
				</div>
			)}

			{/* Subcomponents Colors (e.g. MACD Line, Signal, etc.) */}
			{SERIES_SUB_COMPONENTS[series.type]?.map((comp: { key: string; labelKey: string; defaultColor: string }) => {
				const currentVal = series.subColors?.[comp.key] ?? comp.defaultColor;
				return (
					<label
						key={comp.key}
						style={{
							display: "flex",
							justifyContent: "space-between",
							alignItems: "center",
							fontSize: "12px",
							color: "var(--vnsc-text-primary, #f1f5f9)",
							padding: "4px 0",
						}}
					>
						<span>{t(comp.labelKey)}</span>
						<input
							type="color"
							className={styles.colorPicker}
							value={currentVal}
							onChange={(e) =>
								paneState.dispatch({
									type: "updateSeriesSubColor",
									paneId: pane.id,
									seriesType: series.type,
									subKey: comp.key,
									color: e.target.value,
									seriesIndex,
								})
							}
						/>
					</label>
				);
			})}
		</div>
	);
}

