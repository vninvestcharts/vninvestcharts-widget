/**
 * ContextRail - Collapsible context rail for chart-first layout
 * Replaces traditional sidebar with progressive disclosure
 */
import { useState, useCallback, type ReactNode } from "react";
import { useDemoI18n } from "../i18n";
import { VNSymbolSearch } from "../../widget/components/search/VNSymbolSearch";
import { VNInvestClient } from "../../widget/adapters/VNInvestClient";
import type { ActiveSource } from "./DataSourceSwitcher";
import { TOOL_GROUPS_V2 } from "../config/toolGroups";
import type { Timeframe, ChartTypeId } from "../libraryShowcaseDomain";
import type { SettingsSection } from "../PaneSettingsModal";

export interface ContextRailProps {
  /** Current active data source */
  activeSource: ActiveSource;
  /** VNInvest client for symbol search */
  vniClient: VNInvestClient | null;
  /** Current VNInvest symbol */
  vniSymbol: string;
  /** Callback when VNInvest symbol changes */
  onVniSymbolChange: (symbol: string) => void;
  /** Current timeframe */
  timeframe: Timeframe;
  /** Callback when timeframe changes */
  onTimeframeChange: (timeframe: Timeframe) => void;
  /** Current chart type */
  chartType: ChartTypeId;
  /** Callback when chart type changes */
  onChartTypeChange: (chartType: ChartTypeId) => void;
  /** Available timeframes for current source */
  availableTimeframes: Timeframe[];
  /** Available chart types */
  availableChartTypes: { id: ChartTypeId; label: string }[];
  /** Whether VNInvest has PAT token */
  vniHasPAT: boolean;
  /** Callback to open PAT modal */
  onOpenPATModal: (tab: "paste" | "login") => void;
  /** Drawing tools summary: { total, favorites, recent } */
  drawingToolsSummary?: { total: number; favorites: number; recent: number };
  /** Callback to open settings */
  onOpenSettings?: (section: SettingsSection, paneId?: string) => void;
  /** Custom content to render at bottom */
  children?: ReactNode;
}

export function ContextRail({
	activeSource,
	vniClient,
	vniSymbol,
	onVniSymbolChange,
	timeframe,
	onTimeframeChange,
	chartType,
	onChartTypeChange,
	availableTimeframes,
	availableChartTypes,
	vniHasPAT,
	onOpenPATModal,
	drawingToolsSummary,
	onOpenSettings,
	children,
}: ContextRailProps) {
	const { t } = useDemoI18n();
	const [collapsed, setCollapsed] = useState(false);
	const [openAccordion, setOpenAccordion] = useState<string | null>("symbol");

	const toggleCollapsed = useCallback(() => {
		setCollapsed((prev) => !prev);
	}, []);

	const toggleAccordion = useCallback((id: string) => {
		setOpenAccordion((prev) => (prev === id ? null : id));
	}, []);

	const isAccordionOpen = (id: string) => openAccordion === id;

	const renderAccordion = (
		id: string,
		title: string,
		children: ReactNode,
		icon?: ReactNode
	) => (
		<div className={`gc-context-rail__accordion${!isAccordionOpen(id) ? " gc-context-rail__accordion--collapsed" : ""}`}>
			<button
				type="button"
				className="gc-context-rail__accordion-header"
				onClick={() => toggleAccordion(id)}
				aria-expanded={isAccordionOpen(id)}
				aria-controls={`${id}-content`}
			>
				<span className="gc-context-rail__accordion-title">{icon}{title}</span>
				<span className="gc-context-rail__accordion-chevron" aria-hidden="true">▾</span>
			</button>
			<div id={`${id}-content`} className="gc-context-rail__accordion-content" role="region" aria-labelledby={`${id}-header`}>
				{children}
			</div>
		</div>
	);

	if (collapsed) {
		return (
			<aside
				className="gc-context-rail gc-context-rail--collapsed"
				role="complementary"
				aria-label={t("contextRail.label")}
			>
				<button
					type="button"
					className="gc-context-rail__toggle"
					onClick={toggleCollapsed}
					aria-expanded="false"
					aria-label={t("contextRail.expand")}
					title={t("contextRail.expand")}
				>
					<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
						<path d="M5 4L11 8L5 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
					</svg>
				</button>
				<div className="gc-context-rail__summary" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "12px 4px" }}>
					<span
						className="gc-context-rail__collapsed-indicator"
						title={`${t("contextRail.summaryTitle")}: ${activeSource.toUpperCase()}`}
						style={{ fontSize: "10px", fontWeight: 700, color: "var(--gc-accent)", background: "var(--gc-accent-bg)", padding: "4px 6px", borderRadius: "4px", cursor: "default" }}
					>
						{activeSource === "vninvest" ? "VNI" : activeSource === "binance" ? "BNC" : "OFF"}
					</span>
					{drawingToolsSummary && drawingToolsSummary.favorites > 0 && (
						<span
							className="gc-context-rail__collapsed-indicator"
							title={t("toolbar.favoriteTools")}
							style={{ fontSize: "10px", fontWeight: 700, color: "#eab308", background: "rgba(234, 179, 8, 0.1)", padding: "4px 6px", borderRadius: "4px", cursor: "default" }}
						>
							★{drawingToolsSummary.favorites}
						</span>
					)}
				</div>
			</aside>
		);
	}

	return (
		<aside
			className="gc-context-rail"
			role="complementary"
			aria-label={t("contextRail.label")}
		>
			<button
				type="button"
				className="gc-context-rail__toggle"
				onClick={toggleCollapsed}
				aria-expanded="true"
				aria-label={t("contextRail.collapse")}
				title={t("contextRail.collapse")}
			>
				<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
					<path d="M11 4L5 8L11 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
				</svg>
			</button>

			{/* Symbol & Source Accordion */}
			{renderAccordion(
				"symbol",
				t("contextRail.accordion.symbol"),
				(
					<div style={{ display: "grid", gap: 12 }}>
						{activeSource === "vninvest" && vniClient && (
							<>
								<VNSymbolSearch
									client={vniClient}
									value={vniSymbol}
									onChange={(sym: string) => onVniSymbolChange(sym)}
									onFocusGuard={!vniHasPAT ? () => onOpenPATModal("login") : undefined}
								/>
								{!vniHasPAT && (
									<button
										type="button"
										className="gc-btn gc-btn--primary"
										style={{ width: "100%", justifyContent: "center" }}
										onClick={() => onOpenPATModal("login")}
									>
										{t("vninvest.patModal.btn.login")}
									</button>
								)}
							</>
						)}

						{activeSource === "binance" && (
							<div style={{ display: "grid", gap: 8 }}>
								<label className="gc-form-label">{t("contextRail.symbol")}</label>
								<select
									className="gc-form-input"
									value={vniSymbol}
									onChange={(e) => onVniSymbolChange(e.target.value)}
									style={{ width: "100%" }}
								>
									<option value="BTCUSDT">BTCUSDT</option>
									<option value="ETHUSDT">ETHUSDT</option>
									<option value="BNBUSDT">BNBUSDT</option>
									<option value="SOLUSDT">SOLUSDT</option>
								</select>
							</div>
						)}

						{activeSource === "offline" && (
							<div style={{ display: "grid", gap: 8 }}>
								<label className="gc-form-label">{t("dataSource.offline.selectFile")}</label>
								<p className="gc-pat-offline__hint" style={{ fontSize: "11px", color: "var(--gc-text-muted)" }}>
									{t("dataSource.offline.hint")}
								</p>
							</div>
						)}
					</div>
				),
				<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ marginRight: 6 }}>
					<path d="M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2zm0 1a5 5 0 1 1 0 10A5 5 0 0 1 8 3z" stroke="currentColor" strokeWidth="1.3" />
					<path d="M8 6v4l2.5 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
				</svg>
			)}

			{/* Timeframe Accordion */}
			{renderAccordion(
				"timeframe",
				t("contextRail.accordion.timeframe"),
				(
					<div style={{ display: "grid", gap: 8 }}>
						<label className="gc-form-label">{t("library.timeframes")}</label>
						<select
							className="gc-form-input"
							value={timeframe}
							onChange={(e) => onTimeframeChange(e.target.value as Timeframe)}
							style={{ width: "100%" }}
						>
							{availableTimeframes.map((tf) => (
								<option key={tf} value={tf}>{tf}</option>
							))}
						</select>
					</div>
				),
				<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ marginRight: 6 }}>
					<circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3" />
					<path d="M8 4v4l3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
				</svg>
			)}

			{/* Chart Type Accordion */}
			{renderAccordion(
				"chartType",
				t("contextRail.accordion.chartType"),
				(
					<div style={{ display: "grid", gap: 8 }}>
						<label className="gc-form-label">{t("toolbar.candleType")}</label>
						<select
							className="gc-form-input"
							value={chartType}
							onChange={(e) => onChartTypeChange(e.target.value as ChartTypeId)}
							style={{ width: "100%" }}
						>
							{availableChartTypes.map((ct) => (
								<option key={ct.id} value={ct.id}>{ct.label}</option>
							))}
						</select>
					</div>
				),
				<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ marginRight: 6 }}>
					<rect x="2" y="3" width="3" height="10" rx="0.5" fill="currentColor" opacity="0.6" />
					<rect x="6.5" y="6" width="3" height="7" rx="0.5" fill="currentColor" />
					<rect x="11" y="2" width="3" height="11" rx="0.5" fill="currentColor" opacity="0.6" />
				</svg>
			)}

			{/* Drawing Tools Summary Accordion */}
			{drawingToolsSummary && renderAccordion(
				"drawings",
				t("contextRail.accordion.drawings"),
				(
					<div style={{ display: "grid", gap: 12 }}>
						<div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
							<div className="gc-card" style={{ padding: "8px", textAlign: "center" }}>
								<div style={{ fontSize: "18px", fontWeight: 700, color: "var(--gc-accent)" }}>{drawingToolsSummary.total}</div>
								<div style={{ fontSize: "10px", color: "var(--gc-text-muted)", textTransform: "uppercase" }}>{t("contextRail.totalTools")}</div>
							</div>
							<div className="gc-card" style={{ padding: "8px", textAlign: "center" }}>
								<div style={{ fontSize: "18px", fontWeight: 700, color: "var(--gc-accent)" }}>{drawingToolsSummary.favorites}</div>
								<div style={{ fontSize: "10px", color: "var(--gc-text-muted)", textTransform: "uppercase" }}>{t("toolbar.favoriteTools")}</div>
							</div>
							<div className="gc-card" style={{ padding: "8px", textAlign: "center" }}>
								<div style={{ fontSize: "18px", fontWeight: 700, color: "var(--gc-accent)" }}>{drawingToolsSummary.recent}</div>
								<div style={{ fontSize: "10px", color: "var(--gc-text-muted)", textTransform: "uppercase" }}>{t("toolbar.recent")}</div>
							</div>
						</div>
						<button
							type="button"
							className="gc-btn gc-btn--ghost"
							style={{ width: "100%", justifyContent: "center" }}
							onClick={() => onOpenSettings?.("drawings")}
						>
							{t("contextRail.manageDrawings")}
						</button>
					</div>
				),
				<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ marginRight: 6 }}>
					<path d="M2 13.5V4.5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
					<path d="M6 13.5V7.5M10 13.5V7.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
				</svg>
			)}

			{/* Tool Groups Quick Access */}
			{renderAccordion(
				"toolGroups",
				t("contextRail.accordion.toolGroups"),
				(
					<div style={{ display: "grid", gap: 8 }}>
						{TOOL_GROUPS_V2.map((group) => (
							<button
								key={group.id}
								type="button"
								className="gc-context-rail__chip"
								style={{ justifyContent: "flex-start", width: "100%", textAlign: "left" }}
								onClick={() => onOpenSettings?.("drawings", group.id)}
								title={t(group.labelKey)}
							>
								{t(group.labelKey)} <span style={{ marginLeft: "auto", opacity: 0.5 }}>{group.tools.length}</span>
							</button>
						))}
					</div>
				),
				<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ marginRight: 6 }}>
					<rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
					<rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
					<rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
					<rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
				</svg>
			)}

			{/* Shortcuts Accordion */}
			{renderAccordion(
				"shortcuts",
				t("contextRail.shortcuts.title"),
				(
					<ul style={{ margin: "0", paddingLeft: "16px", fontSize: "11px", color: "var(--gc-text-muted)", lineHeight: "1.6" }}>
						{t("contextRail.shortcuts.content").split("|").map((item, i) => (
							<li key={i} style={{ marginBottom: 4 }}>{item.trim()}</li>
						))}
					</ul>
				),
				<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ marginRight: 6 }}>
					<rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
					<path d="M5 6h2M9 6h2M4 9.5h8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
				</svg>
			)}

			{/* Custom children at bottom */}
			{children && (
				<div style={{ padding: "12px", borderTop: "1px solid var(--gc-border)" }}>
					{children}
				</div>
			)}
		</aside>
	);
}