/**
 * Tab 5: Panes & Layout Settings
 */
import React from "react";
import { useSettingsContext } from "../SettingsContext";
import { useWidgetI18n } from "../../../context/WidgetI18nContext";
import { useVNInvestChartsState } from "../../../context/VNInvestChartsStateContext";
import { CapabilityGate } from "../../CapabilityGate";
import styles from "./settingsTabs.module.css";
import { formatSeriesDisplayName } from "../helpers/seriesFormatters";
import type { OverlayStyle } from "../model/chartSettingsSchema";

export interface PanesLayoutSettingsTabProps {
	selectedPaneId?: string;
	onSelectedPaneIdChange?: (paneId: string) => void;
	onExportLayout?: () => void;
	onImportLayout?: (layoutJson: string) => void;
}

export function PanesLayoutSettingsTab(props: PanesLayoutSettingsTabProps) {
	const { selectedPaneId, onSelectedPaneIdChange, onExportLayout, onImportLayout } = props;
	const { settings, updateSection } = useSettingsContext();
	const { t } = useWidgetI18n();
	const { paneState } = useVNInvestChartsState();
	const panesLayout = settings.panesLayout;

	const visibleCount = paneState.panes.filter((p) => p.visible).length;

	const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = (event) => {
			const content = event.target?.result;
			if (typeof content === "string") {
				onImportLayout?.(content);
			}
		};
		reader.readAsText(file);
	};

	return (
		<div className={styles.tabContainer}>
			{/* General Layout Controls */}
			<div className={styles.section}>
				<h4 className={styles.sectionTitle}>{t("settings.layout") || "Panes Layout"}</h4>
				<div className={styles.row}>
					<span className={styles.label}>
						{t("settings.maxVisible") || "Max Visible Panes"} ({visibleCount}/{panesLayout.maxVisiblePanes})
					</span>
					<div className={styles.controlGroup}>
						<input
							type="number"
							className={`${styles.input} ${styles.inputNumber}`}
							min={1}
							max={12}
							value={panesLayout.maxVisiblePanes}
							onChange={(e) =>
								updateSection("panesLayout", {
									maxVisiblePanes: Math.max(1, Math.min(12, parseInt(e.target.value, 10) || 5)),
								})
							}
						/>
						<button
							type="button"
							className={styles.btnSm}
							disabled={visibleCount >= panesLayout.maxVisiblePanes}
							onClick={() =>
								paneState.addPane({
									label: t("library.genericPaneLabel", { index: paneState.panes.length + 1 }) || `Pane ${paneState.panes.length + 1}`,
									pinned: false,
									visible: true,
									heightRatio: 0.2,
									series: [],
									splitScale: false,
									tooltip: "value",
								})
							}
						>
							{t("settings.addPane") || "+ Add Pane"}
						</button>
					</div>
				</div>

				<div className={styles.row}>
					<label className={styles.label}>
						<input
							type="checkbox"
							className={styles.checkbox}
							checked={panesLayout.showNonTradingDays}
							onChange={(e) => updateSection("panesLayout", { showNonTradingDays: e.target.checked })}
						/>
						<div>
							<div>{t("settings.showNonTradingDays") || "Show Non-trading Days"}</div>
							<div className={styles.subLabel}>
								{t("settings.showNonTradingDaysNote") || "Show weekend/holiday gaps on time axis"}
							</div>
						</div>
					</label>
				</div>
			</div>

			{/* Multi-Timeframe Overlay */}
			<div className={styles.section}>
				<h4 className={styles.sectionTitle}>{t("settings.overlay") || "Multi-Timeframe Overlay"}</h4>
				<div className={styles.row}>
					<span className={styles.label}>{t("settings.overlayTimeframe") || "Overlay Timeframe"}</span>
					<select
						className={styles.select}
						value={panesLayout.overlayTimeframe || ""}
						onChange={(e) => updateSection("panesLayout", { overlayTimeframe: e.target.value || undefined })}
					>
						<option value="">{t("settings.overlayNone") || "None"}</option>
						<option value="5m">5m</option>
						<option value="15m">15m</option>
						<option value="30m">30m</option>
						<option value="1h">1h</option>
						<option value="4h">4h</option>
						<option value="1d">1d</option>
						<option value="1w">1w</option>
					</select>
				</div>

				<div className={styles.row}>
					<span className={styles.label}>{t("settings.overlayStyle") || "Overlay Candle Style"}</span>
					<select
						className={styles.select}
						value={panesLayout.overlayStyle}
						onChange={(e) => updateSection("panesLayout", { overlayStyle: e.target.value as OverlayStyle })}
					>
						<option value="candle">{t("settings.styleCandle") || "Candles"}</option>
						<option value="hollow">{t("settings.styleHollowBox") || "Hollow Candles"}</option>
						<option value="step">{t("settings.styleStepLine") || "Step Line"}</option>
						<option value="area">{t("settings.styleArea") || "Area"}</option>
					</select>
				</div>
			</div>

			{/* Panes List */}
			<div className={styles.section}>
				<h4 className={styles.sectionTitle}>{t("settings.managePanes") || "Panes List"}</h4>
				<div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
					{paneState.panes.map((pane) => {
						const isSelected = pane.id === selectedPaneId;
						const visiblePanes = paneState.panes.filter((p) => p.visible);
						const visibleIndex = visiblePanes.findIndex((p) => p.id === pane.id);
						const canMoveUp = pane.visible && visibleIndex > 0;
						const canMoveDown = pane.visible && visibleIndex >= 0 && visibleIndex < visiblePanes.length - 1;

						return (
							<div
								key={pane.id}
								className={styles.card}
								style={{
									borderColor: isSelected ? "var(--vnsc-accent, #38bdf8)" : undefined,
									cursor: "pointer",
								}}
								onClick={() => onSelectedPaneIdChange?.(pane.id)}
							>
								{/* Card Header */}
								<div className={styles.cardHeader}>
									<div>
										<span className={styles.cardTitle}>
											{pane.label}
											{pane.pinned && (
												<span
													style={{
														fontSize: 10,
														background: "var(--vnsc-accent, #2563eb)",
														color: "#fff",
														padding: "1px 5px",
														borderRadius: 3,
														marginLeft: 6,
													}}
												>
													{t("settings.panes.pinned") || "Pinned"}
												</span>
											)}
										</span>
										<div className={styles.subLabel}>
											{pane.series.length} {t("settings.indicatorsCount") || "indicators"}
										</div>
									</div>

									<div className={styles.cardActions} onClick={(e) => e.stopPropagation()}>
										<button
											type="button"
											className={styles.btnSm}
											disabled={pane.pinned}
											onClick={(e) => {
												e.stopPropagation();
												if (pane.visible) {
													paneState.toggleVisible(pane.id);
												} else {
													paneState.restorePane(pane.id);
												}
											}}
										>
											{pane.visible ? t("settings.hide") || "Hide" : t("settings.restore") || "Show"}
										</button>
										{!pane.pinned && !["price", "volume"].includes(pane.id) && (
											<button
												type="button"
												className={styles.btnSm}
												style={{ color: "#ef5350", borderColor: "rgba(239, 83, 80, 0.4)" }}
												onClick={(e) => {
													e.stopPropagation();
													paneState.deletePane(pane.id);
												}}
											>
												{t("settings.deletePane") || "Delete"}
											</button>
										)}
									</div>
								</div>

								{/* Rename input */}
								{!pane.pinned && !["price", "volume"].includes(pane.id) && (
									<div onClick={(e) => e.stopPropagation()}>
										<input
											type="text"
											className={styles.input}
											value={pane.label}
											onChange={(e) => paneState.renamePane(pane.id, e.target.value)}
											placeholder={t("settings.paneNamePlaceholder") || "Pane name..."}
										/>
									</div>
								)}

								{/* Series Tags & Reordering */}
								<div
									style={{
										display: "flex",
										justifyContent: "space-between",
										alignItems: "center",
										borderTop: "1px solid var(--vnsc-border, #1e293b)",
										paddingTop: 8,
									}}
								>
									<div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
										{pane.series.map((s, sIdx) => (
											<span
												key={sIdx}
												style={{
													fontSize: 10,
													background: "var(--vnsc-bg-primary, #0f1720)",
													color: "var(--vnsc-text-secondary, #94a3b8)",
													padding: "2px 6px",
													borderRadius: 3,
													border: "1px solid var(--vnsc-border, #1e293b)",
												}}
											>
												{formatSeriesDisplayName(s.type, s.params, t, sIdx)}
											</span>
										))}
									</div>

									<div style={{ display: "flex", gap: 4 }} onClick={(e) => e.stopPropagation()}>
										<button
											type="button"
											className={styles.btnSm}
											disabled={!canMoveUp}
											onClick={(e) => {
												e.stopPropagation();
												paneState.reorderPanes(visibleIndex, visibleIndex - 1);
											}}
										>
											↑
										</button>
										<button
											type="button"
											className={styles.btnSm}
											disabled={!canMoveDown}
											onClick={(e) => {
												e.stopPropagation();
												paneState.reorderPanes(visibleIndex, visibleIndex + 1);
											}}
										>
											↓
										</button>
									</div>
								</div>
							</div>
						);
					})}
				</div>
			</div>

			{/* Workspace JSON Backup / Restore */}
			{(onExportLayout || onImportLayout) && (
				<div className={styles.section} data-testid="workspace-json-section">
					<h4 className={styles.sectionTitle}>{t("settings.workspaceJson") || "Workspace JSON Backup / Restore"}</h4>
					<div className={styles.row}>
						<div>
							<div style={{ fontSize: 13, fontWeight: 500 }}>{t("settings.workspaceJsonNote") || "Save or restore layout configuration"}</div>
							<div className={styles.subLabel}>{t("settings.workspaceJsonDesc") || "Export or import full configuration of panes and indicators"}</div>
						</div>
						{/* P0: `share_local` là capability **pro** (`engine capabilities.ts:141`) nhưng
						    trước đây KHÔNG có enforcement site nào — nút hiện cho mọi tier và handler
						    được truyền vô điều kiện (`VNInvestCharts.tsx:1646`). Đây là
						    `useHasCapability` đọc từ `CapabilityProvider` đã mount ở S2, nên tôn trọng
						    cả `narrowing` của license ký số. */}
						<CapabilityGate capability="share_local">
							<div className={styles.controlGroup} data-testid="share-local-actions">
								{onExportLayout && (
									<button type="button" className={styles.btnSm} data-testid="settings-export-workspace" onClick={onExportLayout}>
										{t("settings.exportWorkspace") || "Export JSON"}
									</button>
								)}
								{onImportLayout && (
									<label className={styles.btnSm} style={{ cursor: "pointer", display: "inline-flex", alignItems: "center" }}>
										{t("settings.importWorkspace") || "Import JSON"}
										<input type="file" accept=".json" data-testid="settings-import-workspace" style={{ display: "none" }} onChange={handleFileImport} />
									</label>
								)}
							</div>
						</CapabilityGate>
					</div>
				</div>
			)}
		</div>
	);
}

