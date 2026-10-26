/**
 * Tab 6: Indicators Settings & Indicator Sets
 */
import React, { useState } from "react";
import { useVNInvestChartsState } from "../../../context/VNInvestChartsStateContext";
import { useWidgetI18n } from "../../../context/WidgetI18nContext";
import { listRegistered, getSeries, getSeriesTier, isSeriesAvailableForTier, type SeriesTier, type YAxisSide, useIndicatorSets } from "../../../../lib/core";
import { useWorkspaceSettings } from "../WorkspaceSettingsContext";
import { INDICATORS_SHARE_EVENT, extractShareableIndicators } from "../model/indicatorShare";
import { formatSeriesDisplayName } from "../helpers/seriesFormatters";
import { IndicatorParamsForm } from "./IndicatorParamsForm";
import styles from "./settingsTabs.module.css";

export interface IndicatorsSettingsTabProps {
	/** Owning chart id (multi) — share source attribution; absent = single (no share button). */
	chartId?: string;
	selectedPaneId?: string;
	onSelectedPaneIdChange?: (paneId: string) => void;
	comparisonOverlays?: ReadonlyArray<{
		symbolId: string;
		visible: boolean;
		color: string;
		yAxis: "left" | "right";
		lineWidth: number;
		lineStyle: "solid" | "dashed" | "dotted";
		fillArea: boolean;
		normalizeToBaseline: boolean;
	}>;
	onComparisonRemove?: (symbolId: string) => void;
	onComparisonUpdate?: (symbolId: string, updates: Partial<{
		visible: boolean;
		color: string;
		yAxis: "left" | "right";
		lineWidth: number;
		lineStyle: "solid" | "dashed" | "dotted";
		fillArea: boolean;
		normalizeToBaseline: boolean;
	}>) => void;
	/** S3b-2: tier gate cho composer thêm series (undefined = không gate, legacy). */
	seriesTier?: SeriesTier;
}

export function IndicatorsSettingsTab(props: IndicatorsSettingsTabProps) {
	const { chartId, selectedPaneId, onSelectedPaneIdChange, comparisonOverlays, onComparisonRemove, onComparisonUpdate, seriesTier } = props;
	const { paneState } = useVNInvestChartsState();
	const { isMultiChart } = useWorkspaceSettings();
	const { t } = useWidgetI18n();
	const { sets, applySet, saveCurrentAsSet, deleteSet } = useIndicatorSets({
		currentPanes: paneState.panes,
		onApplyPanes: (panes) => paneState.dispatch({ type: "replaceLayout", panes }),
	});

	const [activeSubTab, setActiveSubTab] = useState<"indicators" | "sets">("indicators");
	const [newSetName, setNewSetName] = useState("");
	const [composerType, setComposerType] = useState<string>("EMA");
	const [composerYAxis, setComposerYAxis] = useState<YAxisSide>("right");

	const activePaneId = selectedPaneId || paneState.panes[0]?.id || "price";
	const selectedPane = paneState.panes.find((p) => p.id === activePaneId) || paneState.panes[0];

	// S3b-2: khóa composer với series vượt tier (render-gate S3b-1 vẫn chặn ở tầng vẽ).
	const isComposerTypeLocked = (rawType: string): boolean => {
		if (!seriesTier) return false;
		try {
			const canonical = (rawType === "BollingerBands" ? "BollingerBand" : rawType) as any;
			return !isSeriesAvailableForTier(canonical, seriesTier);
		} catch {
			return true;
		}
	};
	const composerLocked = isComposerTypeLocked(composerType);

	const handleAddSeries = () => {
		if (!selectedPane || !composerType) return;
		// Canonicalize legacy aliases (e.g. BollingerBands → BollingerBand) at the
		// boundary so compute/resolve/render paths only ever see canonical types.
		const canonicalType = (composerType === "BollingerBands" ? "BollingerBand" : composerType) as any;
		if (composerLocked) return;
		let entry: any;
		try {
			entry = getSeries(canonicalType);
		} catch {
			return;
		}
		paneState.addSeries(selectedPane.id, {
			type: canonicalType,
			yAxis: composerYAxis,
			params: { ...entry.defaultParams },
		});
	};

	const handleSaveSet = () => {
		if (!newSetName.trim()) return;
		saveCurrentAsSet(newSetName.trim());
		setNewSetName("");
	};

	return (
		<div className={styles.tabContainer}>
			{/* Sub tabs: Pane Indicators vs Indicator Sets */}
			<div className={styles.row}>
				<div className={styles.segmented}>
					<button
						type="button"
						className={`${styles.segmentedBtn} ${activeSubTab === "indicators" ? styles.segmentedBtnActive : ""}`}
						onClick={() => setActiveSubTab("indicators")}
					>
						{t("settings.indicatorEditor") || "Pane Indicators"}
					</button>
					<button
						type="button"
						className={`${styles.segmentedBtn} ${activeSubTab === "sets" ? styles.segmentedBtnActive : ""}`}
						onClick={() => setActiveSubTab("sets")}
					>
						{t("settings.indicatorSets") || "Indicator Sets"}
					</button>
				</div>

				{activeSubTab === "indicators" && (
					<div className={styles.controlGroup}>
						<span style={{ fontSize: 11, color: "var(--vnsc-text-secondary, #94a3b8)" }}>Pane:</span>
						<select
							className={styles.select}
							value={selectedPane?.id}
							onChange={(e) => onSelectedPaneIdChange?.(e.target.value)}
						>
							{paneState.panes.map((p) => (
								<option key={p.id} value={p.id}>
									{p.label}
								</option>
							))}
						</select>
					</div>
				)}
			</div>

			{activeSubTab === "indicators" ? (
				<>
					{/* Indicators in selected pane */}
					{selectedPane && (
						<div className={styles.section}>
							<h4 className={styles.sectionTitle}>
								{selectedPane.label} ({selectedPane.series.length} {t("settings.indicatorsCount") || "indicators"})
							</h4>

							{selectedPane.series.length === 0 ? (
								<div style={{ textAlign: "center", padding: "20px 0", color: "var(--vnsc-text-secondary, #94a3b8)", fontSize: 12 }}>
									{t("settings.noIndicatorsInPane") || "No indicators in this pane. Add one below."}
								</div>
							) : (
								<div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
									{selectedPane.series.map((series, idx) => (
										<div key={`${series.type}-${idx}`} className={styles.card}>
											<div className={styles.cardHeader}>
												<span className={styles.cardTitle}>
													{formatSeriesDisplayName(series.type, series.params, t, idx)}
												</span>
												<div className={styles.cardActions}>
													<select
														className={styles.select}
														style={{ padding: "2px 6px", fontSize: 11 }}
														value={series.yAxis}
														onChange={(e) =>
															paneState.dispatch({
																type: "updateSeriesYAxis",
																paneId: selectedPane.id,
																seriesType: series.type,
																yAxis: e.target.value as YAxisSide,
																seriesIndex: idx,
															})
														}
													>
														<option value="right">{t("settings.scales.right") || "Right"}</option>
														<option value="left">{t("settings.scales.left") || "Left"}</option>
													</select>
													<button
														type="button"
														className={styles.btnSm}
														onClick={() => paneState.toggleSeriesVisible(selectedPane.id, series.type, idx)}
													>
														{series.visible === false ? t("settings.visible") || "Show" : t("settings.hide") || "Hide"}
													</button>
													<button
														type="button"
														className={styles.btnSm}
														style={{ color: "#ef5350", borderColor: "rgba(239, 83, 80, 0.4)" }}
														onClick={() => paneState.removeSeries(selectedPane.id, series.type, idx)}
													>
														{t("settings.remove") || "Remove"}
													</button>
												</div>
											</div>

											{/* Indicator Parameters Form */}
											<IndicatorParamsForm pane={selectedPane} series={series} seriesIndex={idx} />
										</div>
									))}
								</div>
							)}
						</div>
					)}

					{/* Comparison Overlays on Price Pane */}
					{selectedPane?.id === "price" && comparisonOverlays && comparisonOverlays.length > 0 && (
						<div className={styles.section}>
							<h4 className={styles.sectionTitle}>{t("settings.comparison") || "Compared Symbols"}</h4>
							<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
								{comparisonOverlays.map((ov) => (
									<div key={ov.symbolId} className={styles.card}>
										<div className={styles.cardHeader}>
											<span className={styles.cardTitle}>{ov.symbolId}</span>
											<div className={styles.cardActions}>
												<input
													type="color"
													className={styles.colorPicker}
													value={ov.color}
													onChange={(e) => onComparisonUpdate?.(ov.symbolId, { color: e.target.value })}
												/>
												<button
													type="button"
													className={styles.btnSm}
													onClick={() => onComparisonUpdate?.(ov.symbolId, { visible: !ov.visible })}
												>
													{ov.visible ? t("settings.hide") || "Hide" : t("settings.visible") || "Show"}
												</button>
												<button
													type="button"
													className={styles.btnSm}
													style={{ color: "#ef5350" }}
													onClick={() => onComparisonRemove?.(ov.symbolId)}
												>
													{t("settings.remove") || "Remove"}
												</button>
											</div>
										</div>
									</div>
								))}
							</div>
						</div>
					)}

					{/* Add Series Composer */}
					{selectedPane && (
						<div className={styles.section}>
							<h4 className={styles.sectionTitle}>{t("settings.addSeries") || "+ Add Indicator"}</h4>
							<div className={styles.row}>
								<div className={styles.controlGroup} style={{ flex: 1 }}>
									<select
										className={styles.select}
										style={{ flex: 1 }}
										value={composerType}
										data-testid="composer-type-select"
										onChange={(e) => setComposerType(e.target.value)}
									>
										{/* Hide the legacy "BollingerBands" alias: canonical type is "BollingerBand".
									    Labels go through SERIES_LABEL_KEYS (camelCase i18n keys) instead of
									    `indicator.${type.toLowerCase()}`, which missed every camelCase key. */}
										{listRegistered().filter((type) => type !== "BollingerBands").map((type) => {
											const locked = isComposerTypeLocked(type);
											const tierLabel = locked ? (getSeriesTier(type) === "enterprise" ? "Enterprise" : "Pro") : "";
											return (
												<option key={type} value={type}>
													{formatSeriesDisplayName(type, undefined, t)}{locked ? ` 🔒 ${tierLabel}` : ""}
												</option>
											);
										})}
									</select>
									<select
										className={styles.select}
										value={composerYAxis}
										onChange={(e) => setComposerYAxis(e.target.value as YAxisSide)}
									>
										<option value="right">{t("settings.scales.right") || "Right"}</option>
										<option value="left">{t("settings.scales.left") || "Left"}</option>
									</select>
								</div>
								<button
									type="button"
									className={styles.btnSm}
									data-testid="composer-add-btn"
									disabled={composerLocked}
									title={composerLocked ? (t("premium.upgrade") || "Upgrade Now") : undefined}
									onClick={handleAddSeries}
								>
									{t("settings.addSeries") || "+ Add Indicator"}
								</button>
							</div>
							{isMultiChart && chartId ? (
								<div className={styles.row}>
									<button
										type="button"
										className={styles.btnSm}
										data-testid="indicators-apply-to-all-btn"
										onClick={() => {
											const indicators = extractShareableIndicators(paneState.panes);
											if (indicators.length === 0) return;
											window.dispatchEvent(
												new CustomEvent(INDICATORS_SHARE_EVENT, {
													detail: { sourceChartId: chartId, indicators },
												})
											);
										}}
									>
										{t("settings.applyIndicatorsToAll") || "Apply indicators to all charts"}
									</button>
								</div>
							) : null}
						</div>
					)}
				</>
			) : (
				/* Indicator Sets Sub Tab */
				<div className={styles.section}>
					<h4 className={styles.sectionTitle}>{t("settings.indicatorSets") || "Indicator Sets"}</h4>

					{/* Save current setup as Set */}
					<div className={styles.row}>
						<span className={styles.label}>{t("settings.saveCurrentSet") || "Save Current Set"}</span>
						<div className={styles.controlGroup}>
							<input
								type="text"
								className={styles.input}
								placeholder={t("settings.setNamePlaceholder") || "Set name..."}
								value={newSetName}
								onChange={(e) => setNewSetName(e.target.value)}
							/>
							<button type="button" className={styles.btnSm} onClick={handleSaveSet} disabled={!newSetName.trim()}>
								{t("common.save") || "Save"}
							</button>
						</div>
					</div>

					{/* List of sets */}
					<div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
						{sets.map((s) => (
							<div key={s.id} className={styles.card}>
								<div className={styles.cardHeader}>
									<div>
										<span className={styles.cardTitle}>{s.name}</span>
										<div className={styles.subLabel}>
											{s.isBuiltin ? (t("settings.builtin") || "Builtin") : (t("settings.custom") || "Custom")} • {s.panes?.length || 0} panes
										</div>
									</div>
									<div className={styles.cardActions}>
										<button
											type="button"
											className={styles.btnSm}
											onClick={() => applySet(s.id)}
										>
											{t("settings.applySet") || "Apply"}
										</button>
										{!s.isBuiltin && (
											<button
												type="button"
												className={styles.btnSm}
												style={{ color: "#ef5350" }}
												onClick={() => deleteSet(s.id)}
											>
												{t("settings.remove") || "Remove"}
											</button>
										)}
									</div>
								</div>
							</div>
						))}
					</div>
				</div>
			)}
		</div>
	);
}

