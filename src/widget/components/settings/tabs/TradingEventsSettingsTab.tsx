/**
 * Tab 7: Trading & Events Settings
 */
import React from "react";
import { useSettingsContext } from "../SettingsContext";
import { useWidgetI18n } from "../../../context/WidgetI18nContext";
import { useOptionalWorkspacePaperVisibility } from "../../../context/WorkspacePaperVisibilityContext";
import styles from "./settingsTabs.module.css";

export function TradingEventsSettingsTab(props: { chartId?: string | null; symbol?: string }) {
	const { chartId, symbol } = props;
	const { settings, updateSection } = useSettingsContext();
	const { t } = useWidgetI18n();
	const tradingEvents = settings.tradingEvents;
	// Task M4 + chart-centric: visibility là state workspace nhưng Settings chỉ
	// điều khiển ĐÚNG 1 ô active (chartId khóa lúc mở). Muốn đồng bộ hết lưới
	// dùng nút "Áp dụng cho tất cả" (fan-out trong WorkspaceSettingsProvider).
	const paperVisibility = useOptionalWorkspacePaperVisibility();
	const activeId = chartId && chartId.length > 0 ? chartId : null;
	const activeOn =
		paperVisibility != null && activeId != null
			? (paperVisibility.perChart[activeId] ?? paperVisibility.master)
			: false;

	return (
		<div className={styles.tabContainer}>
			{/* Corporate Events */}
			<div className={styles.section}>
				<h4 className={styles.sectionTitle}>{t("settings.trading.corporateEvents") || "Corporate Events"}</h4>
				<div className={styles.row}>
					<label className={styles.label}>
						<input
							type="checkbox"
							className={styles.checkbox}
							checked={tradingEvents.showCorporateEvents}
							onChange={(e) => updateSection("tradingEvents", { showCorporateEvents: e.target.checked })}
						/>
						<div>
							<div>{t("settings.trading.showCorporateEvents") || "Show Corporate Events on chart"}</div>
							<div className={styles.subLabel}>
								{t("settings.trading.showCorporateEventsNote") || "Mark dividend (D) and stock split (S) events on candles"}
							</div>
						</div>
					</label>
				</div>
			</div>

			{/* Whale Money Flow */}
			<div className={styles.section}>
				<h4 className={styles.sectionTitle}>{t("settings.trading.whaleFlow") || "Whale Flow"}</h4>
				<div className={styles.row}>
					<label className={styles.label}>
						<input
							type="checkbox"
							className={styles.checkbox}
							checked={tradingEvents.showWhaleFlow}
							onChange={(e) => updateSection("tradingEvents", { showWhaleFlow: e.target.checked })}
						/>
						<div>
							<div>{t("settings.trading.enableWhale") || "Enable whale trade detection"}</div>
							<div className={styles.subLabel}>{t("settings.trading.enableWhaleNote") || "Highlight orders with abnormal volume"}</div>
						</div>
					</label>
				</div>

				{tradingEvents.showWhaleFlow && (
					<div className={styles.row}>
						<span className={styles.label}>{t("settings.trading.whaleThreshold") || "Whale Trade Threshold (VND)"}</span>
						<div className={styles.controlGroup}>
							<input
								type="number"
								className={`${styles.input} ${styles.inputNumber}`}
								style={{ width: 140 }}
								min={10000}
								step={50000}
								value={tradingEvents.whaleThreshold}
								onChange={(e) =>
									updateSection("tradingEvents", {
										whaleThreshold: Math.max(1000, parseInt(e.target.value, 10) || 50000),
									})
								}
							/>
						</div>
					</div>
				)}
			</div>

			{/* Cumulative Volume Delta (CVD) */}
			<div className={styles.section}>
				<h4 className={styles.sectionTitle}>{t("settings.trading.cvd") || "Cumulative Volume Delta (CVD)"}</h4>
				<div className={styles.row}>
					<label className={styles.label}>
						<input
							type="checkbox"
							className={styles.checkbox}
							checked={tradingEvents.showCVD}
							onChange={(e) => updateSection("tradingEvents", { showCVD: e.target.checked })}
						/>
						{t("settings.trading.enableCVD") || "Show CVD Indicator"}
					</label>
				</div>

				{tradingEvents.showCVD && (
					<div className={styles.row}>
						<span className={styles.label}>{t("settings.trading.cvdMode") || "CVD Display Mode"}</span>
						<div className={styles.segmented}>
							<button
								type="button"
								className={`${styles.segmentedBtn} ${tradingEvents.cvdMode === "oscillator" ? styles.segmentedBtnActive : ""}`}
								onClick={() => updateSection("tradingEvents", { cvdMode: "oscillator" })}
							>
								{t("settings.trading.cvdOscillator") || "Oscillator"}
							</button>
							<button
								type="button"
								className={`${styles.segmentedBtn} ${tradingEvents.cvdMode === "histogram" ? styles.segmentedBtnActive : ""}`}
								onClick={() => updateSection("tradingEvents", { cvdMode: "histogram" })}
							>
								{t("settings.trading.cvdHistogram") || "Histogram"}
							</button>
						</div>
					</div>
				)}
			</div>

			{/* Alert Audio & Paper Trading */}
			<div className={styles.section}>
				<h4 className={styles.sectionTitle}>{t("settings.trading.alertsAndPaper") || "Alerts & Paper Trading"}</h4>
				<div className={styles.row}>
					<label className={styles.label}>
						<input
							type="checkbox"
							className={styles.checkbox}
							checked={tradingEvents.alertAudioEnabled}
							onChange={(e) => updateSection("tradingEvents", { alertAudioEnabled: e.target.checked })}
						/>
						{t("settings.trading.alertAudio") || "Play audio alert when price trigger fires"}
					</label>
				</div>

				<div className={styles.row}>
					<label className={styles.label}>
						<input
							type="checkbox"
							className={styles.checkbox}
							checked={tradingEvents.showPaperOrders}
							onChange={(e) => updateSection("tradingEvents", { showPaperOrders: e.target.checked })}
						/>
						{t("settings.trading.showPaperOrders") || "Show pending Paper Trading order lines on chart"}
					</label>
				</div>

				<div className={styles.row}>
					<label className={styles.label}>
						<input
							type="checkbox"
							className={styles.checkbox}
							checked={tradingEvents.showPaperPositions}
							onChange={(e) => updateSection("tradingEvents", { showPaperPositions: e.target.checked })}
						/>
						{t("settings.trading.showPaperPositions") || "Show open positions and Stoploss/Takeprofit lines"}
					</label>
				</div>

				<div className={styles.row}>
					<span className={styles.label}>{t("settings.trading.dataSource") || "Data Source"}</span>
					<select
						className={styles.select}
						value={tradingEvents.dataAdapterName}
						onChange={(e) => updateSection("tradingEvents", { dataAdapterName: e.target.value })}
					>
						<option value="binance">Binance Live API</option>
						<option value="vnstocks">VNStocks Market Data</option>
						<option value="local">Offline Synthetic Data</option>
					</select>
				</div>
			</div>

			{/* Paper Trading visibility — chart-centric: 1 mục cho ô active */}
			{paperVisibility != null && activeId != null && (
				<div className={styles.section}>
					<h4 className={styles.sectionTitle}>{t("widget.trading.paperVisibility") || "Paper Trading visibility"}</h4>
					<div className={styles.row}>
						<label className={styles.label}>
							<input
								type="checkbox"
								className={styles.checkbox}
								checked={activeOn}
								onChange={(e) => paperVisibility.setChart(activeId, e.target.checked)}
								data-testid={`paper-visibility-${activeId}`}
							/>
							<div>
								<div>
									{t("widget.trading.paperVisibilityActive") || "Show Paper Trading on"} {symbol || activeId}
								</div>
								<div className={styles.subLabel}>
									{t("widget.trading.paperVisibilityActiveNote") || "Applies to the selected chart only"}
								</div>
							</div>
						</label>
					</div>
				</div>
			)}
		</div>
	);
}

