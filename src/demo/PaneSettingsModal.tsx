import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { getSeries, listRegistered, SERIES_SUB_COMPONENTS, type IndicatorSet, type PaneDescriptor, type SeriesConfig, type SeriesSettingField, type SeriesTypeId, type YAxisSide } from "../lib/core";
import type { UseDynamicPanesResult } from "../lib/core/hooks/useDynamicPanes";
import { useIndicatorSets } from "../lib/core/hooks/useIndicatorSets";
import { isDefaultPaneId } from "../lib/core/types/pane-descriptor";
import { formatSeriesDisplayName, useDemoI18n } from "./i18n";
import { MaxVisibleBarsSlider } from "./MaxVisibleBarsSlider";
import { SettingsRangeSlider } from "./SettingsRangeSlider";
import type { WidgetTimezone } from "../lib/utils/timezoneFormatter";

export type SettingsSection = "layout" | "indicators" | "indicatorSets" | "theme" | "reset" | "drawings";

export interface PaneSettingsModalProps {
	open: boolean;
	section: SettingsSection;
	onSectionChange: (section: SettingsSection) => void;
	selectedPaneId: string;
	onSelectedPaneIdChange: (paneId: string) => void;
	paneState: UseDynamicPanesResult;
	maxVisiblePanes: number;
	onMaxVisiblePanesChange: (next: number) => void;
	maxVisibleBars: number;
	onMaxVisibleBarsChange: (next: number) => void;
	showNonTradingDays: boolean;
	onShowNonTradingDaysChange: (next: boolean) => void;
	showDrawingPriceMarkers: boolean;
	onShowDrawingPriceMarkersChange: (next: boolean) => void;
	enableWhale: boolean;
	onEnableWhaleChange: (next: boolean) => void;
	whaleThreshold: number;
	onWhaleThresholdChange: (next: number) => void;
	enableCVD: boolean;
	onEnableCVDChange: (next: boolean) => void;
	cvdMode: "oscillator" | "histogram";
	onCVDModeChange: (next: "oscillator" | "histogram") => void;
	onAddPane: () => void;
	onReset: () => void;
	isDark: boolean;
	toggleTheme: () => void;
	onClose: () => void;
	/** CE20: optional — when provided, shows adapter selector dropdown */
	dataAdapterName?: string;
	onDataAdapterChange?: (name: string) => void;
	timezone: WidgetTimezone;
	onTimezoneChange: (timezone: WidgetTimezone) => void;
	alertAudioEnabled: boolean;
	onAlertAudioEnabledChange: (next: boolean) => void;
	/** CE25: Multi-timeframe persistence */
	syncTimeframesEnabled?: boolean;
	onSyncTimeframesChange?: (enabled: boolean) => void;
	/** CE25: Visibility controls */
	visibilityControlsEnabled?: boolean;
	onVisibilityControlsChange?: (enabled: boolean) => void;
}

function describeSeries(series: SeriesConfig, index: number, t: (key: string, params?: Record<string, string | number | undefined>) => string): string {
	return formatSeriesDisplayName(series.type, series.params, t, index);
}

function parseNumber(value: string, fallback: number): number {
	const next = Number.parseFloat(value);
	return Number.isFinite(next) ? next : fallback;
}
const LINE_WIDTH_SERIES_TYPES = new Set<SeriesTypeId>([
	"Line",
	"Area",
	"EMA",
	"BollingerBand",
	"RSI",
	"MACD",
	"CVDApprox",
	"CVDRealtime",
	"StrengthElder",
	"StrengthRelative",
	"MA",
	"BBI",
	"SAR",
	"OBV",
	"WR",
	"VR",
	"KDJ",
	"CCI",
	"DMI",
	"BIAS",
	"BRAR",
	"MTM",
	"EMV",
	"ROC",
	"TRIX",
	"DMA",
	"PVT",
	"PSY",
	"CR",
]);

function supportsSeriesLineWidth(seriesType: SeriesTypeId): boolean {
	return LINE_WIDTH_SERIES_TYPES.has(seriesType);
}

const TECHNICAL_INDICATORS = new Set<SeriesTypeId>([
	"EMA",
	"BollingerBand",
	"RSI",
	"MACD",
	"CVDApprox",
	"CVDRealtime",
	"StrengthElder",
	"StrengthRelative",
	"Whale",
	"MA",
	"BBI",
	"SAR",
	"OBV",
	"WR",
	"VR",
	"KDJ",
	"CCI",
	"DMI",
	"BIAS",
	"BRAR",
	"MTM",
	"EMV",
	"AO",
	"ROC",
	"TRIX",
	"DMA",
	"PVT",
	"PSY",
	"CR",
]);

export function PaneSettingsModal({
	open,
	section,
	onSectionChange,
	selectedPaneId,
	onSelectedPaneIdChange,
	paneState,
	maxVisiblePanes,
	onMaxVisiblePanesChange,
	maxVisibleBars,
	onMaxVisibleBarsChange,
	showNonTradingDays,
	onShowNonTradingDaysChange,
	showDrawingPriceMarkers,
	onShowDrawingPriceMarkersChange,
	enableWhale,
	onEnableWhaleChange,
	whaleThreshold,
	onWhaleThresholdChange,
	enableCVD,
	onEnableCVDChange,
	cvdMode,
	onCVDModeChange,
	onAddPane,
	onReset,
	isDark,
	toggleTheme,
	onClose,
	dataAdapterName,
	onDataAdapterChange,
	timezone,
	onTimezoneChange,
	alertAudioEnabled,
	onAlertAudioEnabledChange,
	syncTimeframesEnabled,
	onSyncTimeframesChange,
	visibilityControlsEnabled,
	onVisibilityControlsChange,
}: PaneSettingsModalProps) {
	const { t, getPaneLabel } = useDemoI18n();
	const dialogRef = useRef<HTMLDivElement | null>(null);
	const importInputRef = useRef<HTMLInputElement | null>(null);
	const [indicatorSetName, setIndicatorSetName] = useState("");
	const [indicatorSetMessage, setIndicatorSetMessage] = useState("");
	const availableSeriesTypes = useMemo(() => {
		return listRegistered().filter((type) => TECHNICAL_INDICATORS.has(type));
	}, []);
	const [composerType, setComposerType] = useState<SeriesTypeId>("EMA");
	const [composerYAxis, setComposerYAxis] = useState<YAxisSide>("right");

	const selectedPane = useMemo(
		() => paneState.panes.find((pane) => pane.id === selectedPaneId) ?? paneState.visiblePanes[0] ?? paneState.panes[0],
		[paneState.panes, paneState.visiblePanes, selectedPaneId],
	);

	const indicatorSets = useIndicatorSets({
		currentPanes: paneState.panes,
		onApplyPanes: (nextPanes) => {
			paneState.replaceLayout(nextPanes);
			const nextSelectedPaneId = nextPanes.find((pane) => pane.visible)?.id ?? nextPanes[0]?.id ?? "";
			if (nextSelectedPaneId) {
				onSelectedPaneIdChange(nextSelectedPaneId);
			}
		},
	});

	useEffect(() => {
		if (!open) {
			return;
		}
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				onClose();
			}
		};
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [open, onClose]);

	useEffect(() => {
		if (!open || availableSeriesTypes.length === 0) {
			return;
		}
		if (!availableSeriesTypes.includes(composerType)) {
			setComposerType(availableSeriesTypes[0]);
		}
	}, [availableSeriesTypes, composerType, open]);

	const resolvedComposerType = availableSeriesTypes.includes(composerType)
		? composerType
		: availableSeriesTypes[0] ?? "EMA";

	const composerEntry = useMemo(() => {
		if (availableSeriesTypes.length === 0) {
			return null;
		}
		try {
			return getSeries(resolvedComposerType);
		} catch {
			return null;
		}
	}, [availableSeriesTypes.length, resolvedComposerType]);

	useEffect(() => {
		if (composerEntry) {
			setComposerYAxis(composerEntry.defaultYAxis);
		}
	}, [composerEntry, resolvedComposerType]);

	const getIndicatorSetLabel = (set: IndicatorSet) => {
		if (!set.isBuiltin) {
			return set.name;
		}
		switch (set.id) {
			case "builtin-vn-swing-setup":
				return t("indicatorSet.vnSwingSetup");
			case "builtin-ema-multi":
				return t("indicatorSet.emaMulti");
			case "builtin-orderflow-suite":
				return t("indicatorSet.orderflowSuite");
			case "builtin-crypto-standard":
				return t("indicatorSet.cryptoStandard");
			default:
				return set.name;
		}
	};

	const handleApplyIndicatorSet = (setId: string) => {
		const set = indicatorSets.getSetById(setId);
		if (!set) {
			return;
		}
		if (indicatorSets.applySet(setId)) {
			setIndicatorSetMessage(t("settings.setApplied", { name: getIndicatorSetLabel(set) }));
		}
	};

	const handleDeleteIndicatorSet = (setId: string) => {
		const set = indicatorSets.getSetById(setId);
		if (!set || set.isBuiltin) {
			return;
		}
		if (indicatorSets.deleteSet(setId)) {
			setIndicatorSetMessage(t("settings.setDeleted", { name: getIndicatorSetLabel(set) }));
		}
	};

	const handleSaveCurrentIndicatorSet = () => {
		const saved = indicatorSets.saveCurrentAsSet(indicatorSetName.trim() || t("settings.defaultSetName"));
		if (!saved) {
			setIndicatorSetMessage(t("settings.importError"));
			return;
		}
		setIndicatorSetName("");
		setIndicatorSetMessage(t("settings.setSaved", { name: saved.name }));
	};

	const handleImportIndicatorSetClick = () => {
		importInputRef.current?.click();
	};

	const handleImportIndicatorSetChange = async (event: ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		if (!file) {
			return;
		}
		const imported = await indicatorSets.importSet(file);
		event.target.value = "";
		if (!imported) {
			setIndicatorSetMessage(t("settings.importError"));
			return;
		}
		setIndicatorSetMessage(t("settings.setImported", { name: getIndicatorSetLabel(imported) }));
	};

	if (!open) {
		return null;
	}

	const visibleCount = paneState.visiblePanes.length;
	const overLimit = visibleCount > maxVisiblePanes;
	const canAddPane = paneState.canAddPane;
	const paneLabel = (pane: PaneDescriptor) => getPaneLabel(pane.id, pane.label);
	const sectionLabels = useMemo<Record<SettingsSection, string>>(() => ({
		layout: t("settings.layout"),
		indicators: t("settings.indicators"),
		indicatorSets: t("settings.indicatorSets"),
		theme: t("settings.theme"),
		reset: t("settings.reset"),
		drawings: t("settings.drawingsKicker"),
	}), [t]);

	const handleBackdropMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
		if (event.target === event.currentTarget) {
			onClose();
		}
	};

	const handleAddSeries = () => {
		if (!selectedPane || !composerEntry) {
			return;
		}
		paneState.addSeries(selectedPane.id, {
			type: resolvedComposerType,
			yAxis: composerYAxis,
			params: { ...composerEntry.defaultParams },
		});
	};

	const handleSeriesParamChange = (pane: PaneDescriptor, series: SeriesConfig, seriesIndex: number, patch: Record<string, unknown>) => {
		paneState.updateSeriesParams(pane.id, series.type, patch, seriesIndex);
	};

	const handleDeletePane = (pane: PaneDescriptor) => {
		paneState.deletePane(pane.id);
		if (pane.id === selectedPaneId) {
			const nextSelectedPaneId = paneState.visiblePanes.find((visiblePane) => visiblePane.id !== pane.id)?.id
				?? paneState.panes.find((nextPane) => nextPane.id !== pane.id)?.id
				?? "";
			if (nextSelectedPaneId) {
				onSelectedPaneIdChange(nextSelectedPaneId);
			}
		}
	};

	const renderSeriesParams = (pane: PaneDescriptor, series: SeriesConfig, seriesIndex: number) => {
		let entry: ReturnType<typeof getSeries> | undefined;
		try {
			entry = getSeries(series.type);
		} catch {
			return null;
		}

		const fields = entry.settingsFields ?? [];

		const renderField = (field: SeriesSettingField, className = "gc-settings-field") => {
			const rawValue = series.params?.[field.key];
			if (field.type === "number") {
				const fallback = typeof field.defaultValue === "number" ? field.defaultValue : 0;
				const currentValue = typeof rawValue === "number" && Number.isFinite(rawValue) ? rawValue : fallback;
				return (
					<label key={field.key} className={className}>
						<span>{t(field.labelKey)}</span>
						<input
							type="number"
							className="gc-settings-input"
							min={field.min}
							max={field.max}
							step={field.step ?? 1}
							value={currentValue}
							onChange={(event) => handleSeriesParamChange(pane, series, seriesIndex, { [field.key]: parseNumber(event.target.value, currentValue) })}
						/>
					</label>
				);
			} else {
				const currentValue = typeof rawValue === "string" ? rawValue : String(field.defaultValue ?? "");
				return (
					<label key={field.key} className={className}>
						<span>{t(field.labelKey)}</span>
						<input
							type="text"
							className="gc-settings-input"
							value={currentValue}
							onChange={(event) => handleSeriesParamChange(pane, series, seriesIndex, { [field.key]: event.target.value })}
						/>
					</label>
				);
			}
		};

		const colorPicker = (
			<label key="__color__" className="gc-settings-field gc-settings-field--color">
				<span>{t("settings.seriesColor")}</span>
				<input
					type="color"
					className="gc-settings-color-input"
					value={series.color ?? "#2962ff"}
					onChange={(event) => paneState.updateSeriesColor(pane.id, series.type, event.target.value, seriesIndex)}
				/>
			</label>
		);

		const lineWidthControl = supportsSeriesLineWidth(series.type) ? (
			<label key="__line_width__" className="gc-settings-field">
				<span>{t("settings.lineWidth")}</span>
				<SettingsRangeSlider
					value={series.lineWidth ?? 2}
					min={0.5}
					max={8}
					step={0.25}
					formatValue={(value) => `${value.toFixed(2)}px`}
					marks={[
						{ value: 0.5, label: "0.50px" },
						{ value: 1, label: "1.00px" },
						{ value: 2, label: "2.00px" },
						{ value: 4, label: "4.00px" },
						{ value: 8, label: "8.00px" },
					]}
					inputAriaLabel={t("settings.lineWidth")}
					onChange={(next) => {
						paneState.updateSeriesLineWidth(
							pane.id,
							series.type,
							Math.max(0.5, next),
							seriesIndex,
						);
					}}
				/>
			</label>
		) : null;

		const subComponents = SERIES_SUB_COMPONENTS[series.type];
		const subColorSection = subComponents && subComponents.length > 0 ? (
			<div className="gc-settings-sub-colors">
				<span className="gc-settings-sub-colors__label">{t("settings.subColors")}</span>
				{subComponents.map((comp) => (
					<label key={comp.key} className="gc-settings-field gc-settings-field--color">
						<span>{t(comp.labelKey)}</span>
						<input
							type="color"
							value={series.subColors?.[comp.key] ?? comp.defaultColor}
							onChange={(event) => paneState.updateSeriesSubColor(pane.id, series.type, comp.key, event.target.value, seriesIndex)}
						/>
					</label>
				))}
			</div>
		) : null;

		if (series.type === "BollingerBand") {
			return (
				<div className="gc-settings-bollinger-stack">
					<div className="gc-settings-param-grid gc-settings-bollinger-grid">
						{fields.map((field) => renderField(field, "gc-settings-field gc-settings-field--compact gc-settings-bollinger-grid__short-field"))}
						{colorPicker}
						{lineWidthControl}
					</div>
					{subColorSection}
					<div className="gc-settings-param-grid gc-settings-bollinger-grid gc-settings-bollinger-grid--fill">
						<label className="gc-settings-field gc-settings-field--compact">
							<span>{t("settings.fillMode")}</span>
							<select
								className="gc-settings-select"
								value={typeof series.params?.fillMode === "string" ? series.params.fillMode : "none"}
								onChange={(event) => handleSeriesParamChange(pane, series, seriesIndex, { fillMode: event.target.value })}
							>
								<option value="none">{t("settings.fillModeNone")}</option>
								<option value="solid">{t("settings.fillModeSolid")}</option>
								<option value="fade">{t("settings.fillModeFade")}</option>
							</select>
						</label>
						<div>
							<label className="gc-settings-field">
								<span>{t("settings.fillOpacity")}</span>
								<SettingsRangeSlider
									value={typeof series.params?.fillOpacity === "number" ? series.params.fillOpacity : 0.15}
									min={0}
									max={0.8}
									step={0.01}
									formatValue={(value) => value.toFixed(2)}
									marks={[
										{ value: 0, label: "0.00" },
										{ value: 0.2, label: "0.20" },
										{ value: 0.4, label: "0.40" },
										{ value: 0.6, label: "0.60" },
										{ value: 0.8, label: "0.80" },
									]}
									inputAriaLabel={t("settings.fillOpacity")}
									onChange={(next) => {
										handleSeriesParamChange(pane, series, seriesIndex, {
											fillOpacity: Math.max(0, Math.min(0.8, next)),
										});
									}}
								/>
							</label>
						</div>
						<label className="gc-settings-field gc-settings-field--color">
							<span>{t("settings.fillColor")}</span>
							<input
								type="color"
								className="gc-settings-color-input"
								value={typeof series.params?.fillColor === "string" ? series.params.fillColor : (series.color ?? "#2962ff")}
								onChange={(event) => handleSeriesParamChange(pane, series, seriesIndex, { fillColor: event.target.value })}
							/>
						</label>
					</div>
				</div>
			);
		}

		if (fields.length === 0) {
			return (
				<>
					{colorPicker}
					{lineWidthControl}
					{subColorSection}
				</>
			);
		}

		const gridClassName = fields.length >= 3
			? "gc-settings-param-grid gc-settings-param-grid--three"
			: "gc-settings-param-grid";

		return (
			<div className={gridClassName}>
				{fields.map((field) => renderField(field))}
				{colorPicker}
				{lineWidthControl}
				{subColorSection}
			</div>
		);
	};

	const renderLayoutSection = () => (
		<div className="gc-settings-panel">
			<div className="gc-settings-panel__header">
				<div>
					<div className="gc-settings-kicker">{t("settings.layoutKicker")}</div>
					<h3>{t("settings.managePanes")}</h3>
				</div>
				<div className="gc-settings-stat">{visibleCount}/{maxVisiblePanes}</div>
			</div>

			<div className="gc-settings-row gc-settings-row--split">
				<label className="gc-settings-field">
					<span>{t("settings.maxVisible")}</span>
					<input
						type="number"
						className="gc-settings-input"
						min={1}
						max={12}
						step={1}
						value={maxVisiblePanes}
						onChange={(event) => onMaxVisiblePanesChange(Math.max(1, parseNumber(event.target.value, maxVisiblePanes)))}
					/>
				</label>
				<button type="button" className="gc-btn gc-btn--accent" onClick={onAddPane} disabled={!canAddPane}>
					{t("settings.addPane")}
				</button>
			</div>

			<div className="gc-settings-row gc-settings-row--split">
				<label className="gc-settings-field gc-settings-field--toggle">
					<input
						type="checkbox"
						checked={showNonTradingDays}
						onChange={(event) => onShowNonTradingDaysChange(event.target.checked)}
					/>
					<div>
						<span>{t("settings.showNonTradingDays")}</span>
						<div className="gc-settings-note gc-settings-note--tight">{t("settings.showNonTradingDaysNote")}</div>
					</div>
				</label>
			</div>

			<div className="gc-settings-pane-list">
				{paneState.panes.map((pane) => {
					const visibleIndex = paneState.visiblePanes.findIndex((visiblePane) => visiblePane.id === pane.id);
					const hidden = !pane.visible;
					const isDefaultPane = isDefaultPaneId(pane.id);
					const isSelected = pane.id === (selectedPane?.id ?? selectedPaneId);
					const canMoveUp = pane.visible && visibleIndex > 0;
					const canMoveDown = pane.visible && visibleIndex >= 0 && visibleIndex < paneState.visiblePanes.length - 1;
					return (
						<div
							key={pane.id}
							className={`gc-settings-pane${hidden ? " gc-settings-pane--hidden" : ""}${isSelected ? " gc-settings-pane--selected" : ""}`}
							onClick={() => onSelectedPaneIdChange(pane.id)}
							role="button"
							tabIndex={0}
						>
							<div className="gc-settings-pane__head">
								<div>
									<div className="gc-settings-pane__label">
										{paneLabel(pane)}
										{pane.pinned ? <span className="gc-settings-pill">{t("settings.pinned")}</span> : null}
										{isDefaultPane ? <span className="gc-settings-pill">{t("settings.defaultPane")}</span> : <span className="gc-settings-pill gc-settings-pill--muted">{t("settings.customPane")}</span>}
									</div>
									<div className="gc-settings-pane__meta">{t("settings.seriesMeta", { count: pane.series.length, ratio: Math.round(pane.heightRatio * 100) })}</div>
								</div>
								<div className="gc-settings-pane__actions">
									<button type="button" className="gc-btn" onClick={(event) => { event.stopPropagation(); pane.visible ? paneState.toggleVisible(pane.id) : paneState.restorePane(pane.id); }} disabled={hidden && !paneState.canAddPane}>
										{pane.visible ? t("settings.hide") : t("settings.restore")}
									</button>
									<button type="button" className="gc-btn" onClick={(event) => { event.stopPropagation(); if (pane.visible) paneState.toggleVisible(pane.id); }} disabled={pane.pinned || hidden}>
										{pane.pinned ? t("settings.locked") : t("settings.visible")}
									</button>
									{!isDefaultPane ? (
										<button
											type="button"
											className="gc-btn gc-btn--danger"
											onClick={(event) => { event.stopPropagation(); handleDeletePane(pane); }}
										>
											{t("settings.deletePane")}
										</button>
									) : null}
								</div>
							</div>
							{!isDefaultPane ? (
								<label className="gc-settings-field">
									<span>{t("settings.paneName")}</span>
									<input
										type="text"
										className="gc-settings-input"
										value={pane.label}
										onChange={(event) => paneState.renamePane(pane.id, event.target.value)}
									/>
								</label>
							) : null}
							<div className="gc-settings-pane__footer">
								<div className="gc-settings-pane__tags">
									{pane.series.map((series, index) => (
										<span key={`${pane.id}-${series.type}-${index}`} className="gc-tag">{describeSeries(series, index, t)}</span>
									))}
								</div>
								<div className="gc-settings-pane__arrows">
									<button type="button" className="gc-btn" onClick={(event) => { event.stopPropagation(); paneState.reorderPanes(visibleIndex, visibleIndex - 1); }} disabled={!canMoveUp}>↑</button>
									<button type="button" className="gc-btn" onClick={(event) => { event.stopPropagation(); paneState.reorderPanes(visibleIndex, visibleIndex + 1); }} disabled={!canMoveDown}>↓</button>
								</div>
							</div>
						</div>
					);
				})}
			</div>

			{overLimit ? <div className="gc-settings-note gc-settings-note--warn">{t("settings.overLimit")}</div> : null}
		</div>
	);

	const renderIndicatorsSection = () => (
		<div className="gc-settings-panel">
			<div className="gc-settings-panel__header">
				<div>
					<div className="gc-settings-kicker">{t("settings.indicatorKicker")}</div>
					<h3>{t("settings.indicatorEditor")}</h3>
				</div>
				<label className="gc-settings-field gc-settings-field--compact">
					<span>{t("settings.pane")}</span>
					<select
						className="gc-settings-select"
						value={selectedPane?.id ?? selectedPaneId}
						onChange={(event) => onSelectedPaneIdChange(event.target.value)}
					>
						{paneState.panes.map((pane) => (
							<option key={pane.id} value={pane.id}>{paneLabel(pane)}</option>
						))}
					</select>
				</label>
			</div>

			{selectedPane ? (
				<>
					<div className="gc-settings-pane-summary">
						<div className="gc-settings-pane-summary__title">
							{paneLabel(selectedPane)}
							{selectedPane.pinned ? <span className="gc-settings-pill">{t("settings.pinned")}</span> : null}
							{selectedPane.visible ? <span className="gc-settings-pill gc-settings-pill--ok">{t("settings.visible")}</span> : <span className="gc-settings-pill gc-settings-pill--muted">{t("settings.hidden")}</span>}
						</div>
						<div className="gc-settings-note">{t("settings.paneSummary")}</div>
					</div>

					<div className="gc-settings-series-list">
						{selectedPane.series.map((series, seriesIndex) => {
							const revealEnabled = selectedPane.visible || paneState.canAddPane;
							return (
								<div key={`${selectedPane.id}-${series.type}-${seriesIndex}`} className="gc-settings-series">
									<div className="gc-settings-series__head">
										<div>
											<div className="gc-settings-series__title">{describeSeries(series, seriesIndex, t)}</div>
											<div className="gc-settings-series__meta">{series.visible === false ? t("settings.hidden") : t("settings.visible")}</div>
										</div>
										<label className="gc-settings-field gc-settings-field--compact">
											<span>{t("settings.yAxis")}</span>
											<select
												className="gc-settings-select"
												value={series.yAxis}
												onChange={(event) => paneState.updateSeriesYAxis(selectedPane.id, series.type, event.target.value as YAxisSide, seriesIndex)}
											>
												<option value="left">{t("settings.yAxisLeft")}</option>
												<option value="right">{t("settings.yAxisRight")}</option>
											</select>
										</label>
										<div className="gc-settings-series__actions">
											<button type="button" className="gc-btn" onClick={() => paneState.toggleSeriesVisible(selectedPane.id, series.type, seriesIndex)} disabled={!revealEnabled && series.visible === false}>
												{series.visible === false ? t("settings.visible") : t("settings.hide")}
											</button>
											<button type="button" className="gc-btn gc-btn--danger" onClick={() => paneState.removeSeries(selectedPane.id, series.type, seriesIndex)}>
												{t("settings.remove")}
											</button>
										</div>
									</div>
									<div className="gc-settings-series__params">
										{renderSeriesParams(selectedPane, series, seriesIndex)}
									</div>
								</div>
							);
						})}
					</div>

					<div className="gc-settings-composer">
						<div className="gc-settings-composer__head">
							<div>
								<div className="gc-settings-kicker">{t("settings.addIndicator")}</div>
								<h4>{t("settings.createIndicator")}</h4>
							</div>
							<button type="button" className="gc-btn gc-btn--accent" onClick={handleAddSeries} disabled={!composerEntry || (!selectedPane.visible && !paneState.canAddPane)}>
								{t("settings.addIndicator")}
							</button>
						</div>
						<div className="gc-settings-param-grid gc-settings-param-grid--three">
							<label className="gc-settings-field">
								<span>{t("settings.indicatorType")}</span>
								<select className="gc-settings-select" value={resolvedComposerType} onChange={(event) => setComposerType(event.target.value as SeriesTypeId)}>
									{availableSeriesTypes.map((type) => (
										<option key={type} value={type}>{formatSeriesDisplayName(type, undefined, t)}</option>
									))}
								</select>
							</label>
							<label className="gc-settings-field">
								<span>{t("settings.yAxis")}</span>
								<select className="gc-settings-select" value={composerYAxis} onChange={(event) => setComposerYAxis(event.target.value as YAxisSide)}>
									<option value="left">{t("settings.yAxisLeft")}</option>
									<option value="right">{t("settings.yAxisRight")}</option>
								</select>
							</label>
							<div className="gc-settings-note gc-settings-note--tight">
								{t("settings.composerNote")}
							</div>
						</div>
					</div>
				</>
			) : (
				<div className="gc-settings-empty">{t("settings.noPane")}</div>
			)}
		</div>
	);

	const renderIndicatorSetsSection = () => {
		const builtinSets = indicatorSets.builtinSets;
		const userSets = indicatorSets.userSets;

		const renderSetCard = (set: IndicatorSet, isBuiltin: boolean) => (
			<div key={set.id} className="gc-settings-series">
				<div className="gc-settings-series__head">
					<div>
						<div className="gc-settings-series__title">{getIndicatorSetLabel(set)}</div>
						<div className="gc-settings-series__meta">
							{t("settings.setPaneCount", { count: set.panes.filter((pane) => pane.visible).length })}
						</div>
					</div>
					<div className="gc-settings-series__actions">
						<button type="button" className="gc-btn gc-btn--accent" onClick={() => handleApplyIndicatorSet(set.id)}>
							{t("settings.applySet")}
						</button>
						{!isBuiltin ? (
							<>
								<button type="button" className="gc-btn" onClick={() => indicatorSets.exportSet(set.id)}>
									{t("settings.exportSet")}
								</button>
								<button type="button" className="gc-btn gc-btn--danger" onClick={() => handleDeleteIndicatorSet(set.id)}>
									{t("settings.deleteSet")}
								</button>
							</>
						) : null}
					</div>
				</div>
				<div className="gc-settings-pane__tags">
					{set.panes.filter((pane) => pane.visible).map((pane) => (
						<span key={`${set.id}-${pane.id}`} className="gc-tag">
							{getPaneLabel(pane.id, pane.label)}
						</span>
					))}
				</div>
			</div>
		);

		return (
			<div className="gc-settings-panel">
				<div className="gc-settings-panel__header">
					<div>
						<div className="gc-settings-kicker">{t("settings.indicatorSetsKicker")}</div>
						<h3>{t("settings.indicatorSetsTitle")}</h3>
					</div>
					<button type="button" className="gc-btn gc-btn--accent" onClick={handleSaveCurrentIndicatorSet}>
						{t("settings.saveCurrentSet")}
					</button>
				</div>

				<div className="gc-settings-row gc-settings-row--split">
					<label className="gc-settings-field">
						<span>{t("settings.setName")}</span>
						<input
							type="text"
							className="gc-settings-input"
							value={indicatorSetName}
							placeholder={t("settings.setNamePlaceholder")}
							onChange={(event) => setIndicatorSetName(event.target.value)}
						/>
					</label>
					<div className="gc-settings-field gc-settings-field--compact">
						<span>{t("settings.importSet")}</span>
						<button type="button" className="gc-btn" onClick={handleImportIndicatorSetClick}>
							{t("settings.importSet")}
						</button>
						<input ref={importInputRef} type="file" accept=".vnsc-set,application/json" style={{ display: "none" }} onChange={handleImportIndicatorSetChange} />
					</div>
				</div>

				{indicatorSetMessage ? <div className="gc-settings-note">{indicatorSetMessage}</div> : null}

				<div className="gc-settings-panel__header gc-settings-panel__header--subtle">
					<div>
						<div className="gc-settings-kicker">{t("settings.builtinSets")}</div>
						<h4>{t("settings.builtinSetsTitle")}</h4>
					</div>
				</div>
				<div className="gc-settings-series-list">
					{builtinSets.map((set) => renderSetCard(set, true))}
				</div>

				<div className="gc-settings-panel__header gc-settings-panel__header--subtle">
					<div>
						<div className="gc-settings-kicker">{t("settings.mySets")}</div>
						<h4>{t("settings.mySetsTitle")}</h4>
					</div>
				</div>
				<div className="gc-settings-series-list">
					{userSets.length > 0
						? userSets.map((set) => renderSetCard(set, false))
						: <div className="gc-settings-empty">{t("settings.noUserSets")}</div>}
				</div>
			</div>
		);
	};

	const renderThemeSection = () => (
		<div className="gc-settings-panel">
			<div className="gc-settings-panel__header">
				<div>
					<div className="gc-settings-kicker">{t("settings.themeKicker")}</div>
					<h3>{t("settings.appearanceShell")}</h3>
				</div>
				<button type="button" className="gc-btn gc-btn--accent" onClick={toggleTheme}>
					{isDark ? t("theme.switchToLight") : t("theme.switchToDark")}
				</button>
			</div>
			<div className="gc-settings-note">
				{t("theme.shellMode", { mode: isDark ? t("theme.mode.dark") : t("theme.mode.light") })}
			</div>
			<div className="gc-settings-row gc-settings-row--split" style={{ marginTop: 16 }}>
				<div>
					<div className="gc-settings-kicker">{t("settings.priceMarkersKicker")}</div>
					<div className="gc-settings-field" style={{ marginTop: 6 }}>
						<span>{t("settings.priceMarkers")}</span>
						<div className="gc-settings-note gc-settings-note--tight">{t("settings.priceMarkersNote")}</div>
					</div>
				</div>
				<button
					type="button"
					className={`gc-btn${showDrawingPriceMarkers ? " gc-btn--accent" : ""}`}
					aria-pressed={showDrawingPriceMarkers}
					onClick={() => onShowDrawingPriceMarkersChange(!showDrawingPriceMarkers)}
				>
					{showDrawingPriceMarkers ? t("settings.visible") : t("settings.hidden")}
				</button>
			</div>
			<div className="gc-settings-row gc-settings-row--split" style={{ marginTop: 12 }}>
				<div>
					<div className="gc-settings-kicker">{t("common.alert")}</div>
					<div className="gc-settings-field" style={{ marginTop: 6 }}>
						<span>{t("settings.alertAudioEnabled")}</span>
						<div className="gc-settings-note gc-settings-note--tight">{t("settings.alertAudioEnabledNote")}</div>
					</div>
				</div>
				<button
					type="button"
					className={`gc-btn${alertAudioEnabled ? " gc-btn--accent" : ""}`}
					aria-pressed={alertAudioEnabled}
					onClick={() => onAlertAudioEnabledChange(!alertAudioEnabled)}
				>
					{alertAudioEnabled ? t("settings.visible") : t("settings.hidden")}
				</button>
			</div>
			<div className="gc-settings-row gc-settings-row--split" style={{ marginTop: 12 }}>
				<div>
					<div className="gc-settings-kicker">{t("settings.timezone")}</div>
					<div className="gc-settings-field" style={{ marginTop: 6 }}>
						<span>{t("settings.timezone")}</span>
					</div>
				</div>
				<select
					className="gc-settings-select"
					value={timezone}
					onChange={(e) => onTimezoneChange(e.target.value as WidgetTimezone)}
					style={{ width: "auto", minWidth: "160px" }}
				>
					<option value="Asia/Ho_Chi_Minh">{t("timezone.hcm")}</option>
					<option value="UTC">{t("timezone.utc")}</option>
					<option value="America/New_York">{t("timezone.ny")}</option>
					<option value="Europe/London">{t("timezone.london")}</option>
				</select>
			</div>
			<div className="gc-settings-row gc-settings-row--split" style={{ marginTop: 12 }}>
				<div>
					<div className="gc-settings-kicker">{t("settings.whale")}</div>
					<div className="gc-settings-field" style={{ marginTop: 6 }}>
						<span>{t("settings.whale")}</span>
						<div className="gc-settings-note gc-settings-note--tight">{t("settings.whaleNote")}</div>
					</div>
				</div>
				<button
					type="button"
					className={`gc-btn${enableWhale ? " gc-btn--accent" : ""}`}
					aria-pressed={enableWhale}
					onClick={() => onEnableWhaleChange(!enableWhale)}
				>
					{enableWhale ? t("settings.visible") : t("settings.hidden")}
				</button>
			</div>
			{enableWhale && (
				<div className="gc-settings-row" style={{ marginTop: 12 }}>
					<div className="gc-settings-field">
						<label htmlFor="whale-threshold" style={{ display: "block", marginBottom: 6 }}>
							{t("settings.whaleThreshold")}
						</label>
						<input
							id="whale-threshold"
							type="text"
							value={whaleThreshold.toLocaleString()}
							onChange={(e) => {
								const numeric = parseInt(e.target.value.replace(/[^\d]/g, ""), 10);
								onWhaleThresholdChange(Number.isFinite(numeric) && numeric > 0 ? numeric : 1_000_000);
							}}
							style={{
								width: "100%",
								padding: "6px 8px",
								border: "1px solid var(--gc-border-color)",
								borderRadius: "4px",
								backgroundColor: isDark ? "#1a1a1a" : "#f9f9f9",
								color: isDark ? "#fff" : "#000",
								fontFamily: "monospace",
								fontSize: "12px",
							}}
						/>
					</div>
				</div>
			)}
			<div className="gc-settings-row gc-settings-row--split" style={{ marginTop: 16 }}>
				<div>
					<div className="gc-settings-kicker">{t("settings.cvd")}</div>
					<div className="gc-settings-field" style={{ marginTop: 6 }}>
						<span style={{ fontSize: "12px", color: isDark ? "#aaa" : "#666" }}>{t("settings.cvdNote")}</span>
					</div>
				</div>
				<button
					type="button"
					className={`gc-btn${enableCVD ? " gc-btn--accent" : ""}`}
					aria-pressed={enableCVD}
					onClick={() => onEnableCVDChange(!enableCVD)}
				>
					{enableCVD ? t("settings.visible") : t("settings.hidden")}
				</button>
			</div>
			{enableCVD && (
				<div className="gc-settings-row" style={{ marginTop: 12 }}>
					<div className="gc-settings-field">
						<label htmlFor="cvd-mode" style={{ display: "block", marginBottom: 6 }}>
							{t("settings.cvdMode")}
						</label>
						<select
							id="cvd-mode"
							value={cvdMode}
							onChange={(e) => onCVDModeChange(e.target.value as "oscillator" | "histogram")}
							style={{
								width: "100%",
								padding: "6px 8px",
								border: "1px solid var(--gc-border-color)",
								borderRadius: "4px",
								backgroundColor: isDark ? "#1a1a1a" : "#f9f9f9",
								color: isDark ? "#fff" : "#000",
								fontFamily: "inherit",
								fontSize: "12px",
							}}
						>
							<option value="oscillator">{t("settings.cvdOscillator")}</option>
							<option value="histogram">{t("settings.cvdHistogram")}</option>
						</select>
					</div>
				</div>
			)}
			{dataAdapterName !== undefined && onDataAdapterChange !== undefined && (
				<div className="gc-settings-row gc-settings-row--split" style={{ marginTop: 16 }}>
					<div>
						<div className="gc-settings-kicker">{t("settings.dataAdapterKicker")}</div>
						<div className="gc-settings-field" style={{ marginTop: 6 }}>
							<span>{t("settings.dataAdapter")}</span>
						</div>
					</div>
					<select
						className="vnsc-candle-type-select"
						value={dataAdapterName}
						onChange={(e) => onDataAdapterChange(e.target.value)}
						aria-label={t("settings.dataAdapter")}
					>
						<option value="binance">{t("settings.dataAdapter.binance")}</option>
						<option value="local">{t("settings.dataAdapter.local")}</option>
						<option value="vnstocks">{t("settings.dataAdapter.vnstocks")}</option>
						<option value="vninvest">{t("settings.dataAdapter.vninvest")}</option>
					</select>
				</div>
			)}
		</div>
	);

	const renderResetSection = () => (
		<div className="gc-settings-panel">
			<div className="gc-settings-panel__header">
				<div>
					<div className="gc-settings-kicker">{t("settings.resetKicker")}</div>
					<h3>{t("settings.resetDefaults")}</h3>
				</div>
				<button type="button" className="gc-btn gc-btn--danger" onClick={onReset}>
					{t("settings.resetLayout")}
				</button>
			</div>
			<div className="gc-settings-note">
				{t("settings.resetNote")}
			</div>
		</div>
	);

	const renderDrawingsSection = () => (
		<div className="gc-settings-panel">
			<div className="gc-settings-panel__header">
				<div>
					<div className="gc-settings-kicker">{t("settings.drawingsKicker")}</div>
					<h3>{t("settings.manageDrawings")}</h3>
				</div>
			</div>
			<div className="gc-settings-row gc-settings-row--split" style={{ marginTop: 16 }}>
				<div>
					<div className="gc-settings-kicker">{t("settings.syncTimeframes")}</div>
					<div className="gc-settings-field" style={{ marginTop: 6 }}>
						<span>{t("settings.syncTimeframes")}</span>
						<div className="gc-settings-note gc-settings-note--tight">{t("settings.syncTimeframesNote")}</div>
					</div>
				</div>
				<button
					type="button"
					className={`gc-btn${syncTimeframesEnabled ? " gc-btn--accent" : ""}`}
					aria-pressed={syncTimeframesEnabled}
					onClick={() => onSyncTimeframesChange?.(!syncTimeframesEnabled)}
				>
					{syncTimeframesEnabled ? t("settings.enabled") : t("settings.disabled")}
				</button>
			</div>
			<div className="gc-settings-row gc-settings-row--split" style={{ marginTop: 12 }}>
				<div>
					<div className="gc-settings-kicker">{t("settings.visibilityControls")}</div>
					<div className="gc-settings-field" style={{ marginTop: 6 }}>
						<span>{t("settings.visibilityControls")}</span>
						<div className="gc-settings-note gc-settings-note--tight">{t("settings.visibilityControlsNote")}</div>
					</div>
				</div>
				<button
					type="button"
					className={`gc-btn${visibilityControlsEnabled ? " gc-btn--accent" : ""}`}
					aria-pressed={visibilityControlsEnabled}
					onClick={() => onVisibilityControlsChange?.(!visibilityControlsEnabled)}
				>
					{visibilityControlsEnabled ? t("settings.enabled") : t("settings.disabled")}
				</button>
			</div>
			<div className="gc-settings-note" style={{ marginTop: 16 }}>
				{t("settings.drawingsSectionNote")}
			</div>
		</div>
	);

	return (
		<div className="gc-settings-backdrop" onMouseDown={handleBackdropMouseDown}>
			<div ref={dialogRef} className="gc-settings-modal" role="dialog" aria-modal="true" aria-label={t("settings.dialogKicker")}>
				<header className="gc-settings-modal__header">
					<div className="gc-settings-modal__hero">
						<div className="gc-settings-modal__meta">
							<span className="gc-settings-badge gc-settings-badge--accent">{sectionLabels[section]}</span>
							<span className="gc-settings-badge">{`${t("common.panes")} ${visibleCount}/${maxVisiblePanes}`}</span>
							{selectedPane ? <span className="gc-settings-badge">{paneLabel(selectedPane)}</span> : null}
						</div>
					</div>
					<button type="button" className="gc-settings-modal__close" onClick={onClose} aria-label={t("settings.dialogClose")}>
						×
					</button>
				</header>
				<div className="gc-settings-modal__body">
					<nav className="gc-settings-modal__nav" aria-label={t("settings.manageSections")}>
						<div className="gc-settings-modal__nav-head">
							<div className="gc-settings-kicker">{t("settings.manageSections")}</div>
						</div>
						{([
							["layout", t("settings.layout")],
							["indicators", t("settings.indicators")],
							["indicatorSets", t("settings.indicatorSets")],
							["theme", t("settings.theme")],
							["reset", t("settings.reset")],
							["drawings", t("settings.drawingsKicker")],
						] as const).map(([nextSection, label]) => (
							<button
								key={nextSection}
								type="button"
								className={`gc-settings-modal__nav-item${section === nextSection ? " gc-settings-modal__nav-item--active" : ""}`}
								onClick={() => onSectionChange(nextSection)}
							>
								{label}
							</button>
						))}
					</nav>
					<div className="gc-settings-modal__content">
						<div className="gc-settings-modal__surface">
							{section === "layout" ? renderLayoutSection() : null}
							{section === "indicators" ? renderIndicatorsSection() : null}
							{section === "indicatorSets" ? renderIndicatorSetsSection() : null}
							{section === "theme" ? renderThemeSection() : null}
							{section === "reset" ? renderResetSection() : null}
							{section === "drawings" ? renderDrawingsSection() : null}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}