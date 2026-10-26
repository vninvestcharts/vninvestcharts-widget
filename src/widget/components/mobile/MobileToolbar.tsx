import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { isClickOutside } from "../../utils/clickOutside";
import { useWidgetI18n } from "../../context/WidgetI18nContext";
import { useDialogFocus } from "../../hooks/useDialogFocus";
import type { PatTier } from "@vninvestcharts/engine-core";
import { isToolAvailable } from "@vninvestcharts/engine-drawing";
import { ToolGlyph, IconCode, IconFlask } from "../common/Icons";
import styles from "../../styles/components/MobileToolbar.module.css";

interface MobileToolbarProps {
	isOpen: boolean;
	onClose: () => void;
	activeTool: string;
	onToolSelect: (tool: string) => void;
	timeframes?: string[];
	activeTimeframe?: string;
	onTimeframeChange?: (tf: string) => void;
	portalRoot?: HTMLElement | null;
	charts?: Array<{ id: string; symbol: string; timeframe: string }>;
	activeChartId?: string | null;
	onChartSelect?: (id: string) => void;
	onSaveWorkspace?: () => void;
	onThemeToggle?: () => void;
	isDark?: boolean;
	activeTab?: "strategy_tester" | "pine_editor" | null;
	onTabChange?: (tab: "strategy_tester" | "pine_editor" | null) => void;
	isChartFocused?: boolean;
	patTier?: PatTier;
	onPremiumToolClick?: (tool: string) => void;
}

// P2-a: icon glyphs come from the central registry via <ToolGlyph/> (no emoji data kept here).
const DRAWING_TOOLS = [
	"cursor", "crosshair", "trendLine", "ray", "extendedLine", "parallelChannel",
	"hLine", "vLine", "priceLabel", "fibonacci", "fibExtension", "fibChannel",
	"fibTimeZone", "pitchfork", "schiffPitchfork", "gannBox", "gannFan", "brush",
	"rectangle", "ellipse", "triangle", "arc", "text", "callout", "arrow",
	"dateAndPriceRange", "dateRange", "priceRange", "eraser",
].map((id) => ({ id }));

const DEFAULT_TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1D", "1W", "1M"];

export function MobileToolbar({
	isOpen,
	onClose,
	activeTool,
	onToolSelect,
	timeframes = DEFAULT_TIMEFRAMES,
	activeTimeframe,
	onTimeframeChange,
	portalRoot,
	activeTab = null,
	onTabChange,
	isChartFocused = false,
	charts = [],
	activeChartId = null,
	onChartSelect,
	patTier,
	onPremiumToolClick,
}: MobileToolbarProps) {
	const { t } = useWidgetI18n();
	const [dragY, setDragY] = useState(0);
	const startYRef = useRef(0);
	const isDraggingRef = useRef(false);
	const sheetRef = useRef<HTMLDivElement>(null);

	// Reset drag position on open
	useEffect(() => {
		if (isOpen) {
			setDragY(0);
		}
	}, [isOpen]);

	// Click outside / click overlay to close
	useEffect(() => {
		if (!isOpen) return;
		const handleClick = (e: MouseEvent) => {
			if (isClickOutside(sheetRef.current, e)) {
				onClose();
			}
		};
		document.addEventListener("mousedown", handleClick);
		return () => document.removeEventListener("mousedown", handleClick);
	}, [isOpen, onClose]);

	// UX-02: the mobile bottom sheet is a dialog — give it the shared focus
	// contract (initial focus, Tab loop, Escape to dismiss, focus restore).
	//
	// MUST be called before the `if (!isOpen) return null` below. It used to sit
	// after that early return, so the hook count differed between the closed and
	// the open render: React threw "Rendered more hooks than during the previous
	// render", the error boundary caught it, and tapping the FAB replaced the
	// whole workspace with the error card. `open: isOpen` (instead of a
	// hardcoded `true`) also keeps the trap inert while the sheet is closed.
	useDialogFocus(sheetRef, { open: isOpen, onEscape: onClose });

	if (!isOpen) return null;

	const handleTouchStart = (e: React.TouchEvent) => {
		const touch = e.touches[0];
		startYRef.current = touch.clientY;
		isDraggingRef.current = true;
	};

	const handleTouchMove = (e: React.TouchEvent) => {
		if (!isDraggingRef.current) return;
		const touch = e.touches[0];
		const deltaY = touch.clientY - startYRef.current;
		// Only allow dragging downwards
		if (deltaY > 0) {
			setDragY(deltaY);
		}
	};

	const handleTouchEnd = () => {
		if (!isDraggingRef.current) return;
		isDraggingRef.current = false;
		if (dragY > 100) {
			onClose();
		} else {
			setDragY(0);
		}
	};

	const content = (
		<div className={styles.overlay}>
			<div
				ref={sheetRef}
				className={styles.bottomSheet}
				style={{ transform: `translateY(${dragY}px)` }}
				role="dialog"
				aria-modal="true"
				aria-label={t("mobile.settings") ?? "Chart tools"}
			>
				{/* Handle bar for dragging */}
				<div
					className={styles.handleBarContainer}
					onTouchStart={handleTouchStart}
					onTouchMove={handleTouchMove}
					onTouchEnd={handleTouchEnd}
				>
					<div className={styles.handleBar} />
				</div>

				<div className={styles.content}>
					{/* Select Chart Section */}
					{charts && charts.length > 1 && onChartSelect && (
						<div className={styles.section}>
							<div className={styles.sectionTitle}>{t("mobile.selectChart")}</div>
							<div className={styles.chartsGridCompact}>
								{charts.map((chart) => {
									const isActive = chart.id === activeChartId;
									return (
										<button
											key={chart.id}
											type="button"
											className={`${styles.chartItemCompact} ${isActive ? styles.active : ""}`}
											onClick={() => {
												onChartSelect(chart.id);
												onClose();
											}}
										>
											<span className={styles.chartIndicator} style={{
												width: "6px",
												height: "6px",
												borderRadius: "50%",
												backgroundColor: isActive ? "var(--vnsc-accent, #22d3ee)" : "rgba(255, 255, 255, 0.4)",
												display: "inline-block",
												marginRight: "6px"
											}} />
											<span className={styles.chartSymbol}>{chart.symbol || "—"}</span>
											<span className={styles.chartTimeframe}>{chart.timeframe}</span>
										</button>
									);
								})}
							</div>
						</div>
					)}

					{/* Timeframes Section */}
					{onTimeframeChange && timeframes && (
						<div className={styles.section}>
							<div className={styles.sectionTitle}>{t("mobile.timeframe")}</div>
							<div className={styles.timeframeGrid}>
								{timeframes.map(tf => (
									<button
										key={tf}
										type="button"
										className={`${styles.timeframeButton} ${tf === activeTimeframe ? styles.active : ""}`}
										onClick={() => {
											onTimeframeChange(tf);
											onClose();
										}}
									>
										{tf}
									</button>
								))}
							</div>
						</div>
					)}

					{/* Drawing Tools Section */}
					<div className={styles.section}>
						<div className={styles.sectionTitle}>{t("mobile.drawingTools")}</div>
						<div className={styles.toolsGrid}>
							{DRAWING_TOOLS.map(tool => {
								const available = isToolAvailable(tool.id as any, patTier ?? "free"); // ARC-1-keep: legacy bridge
								return (
									<button
										key={tool.id}
										type="button"
										className={`${styles.toolButton} ${tool.id === activeTool ? styles.active : ""} ${!available ? styles.disabled : ""}`}
										onClick={() => {
											if (!available) {
												onPremiumToolClick?.(tool.id);
												return;
											}
											onToolSelect(tool.id);
											onClose();
										}}
										title={!available ? t("tool.premiumLocked") : undefined}
										style={{ opacity: available ? undefined : 0.35, cursor: available ? undefined : "not-allowed" }}
									>
										<span className={styles.toolIcon}><ToolGlyph id={tool.id} /></span>
										<span className={styles.toolLabel}>{t(`drawingTool.${tool.id}`)}</span>
									</button>
								);
							})}
						</div>
					</div>

					{/* Workspace Tabs (Pine Editor / Strategy Tester) */}
					{onTabChange && (
						<div className={styles.section}>
							<div className={styles.sectionTitle}>{t("mobile.features")}</div>
							<div className={styles.featuresGrid}>
								<button
									type="button"
									className={`${styles.featureButton} ${activeTab === "pine_editor" ? styles.active : ""}`}
									onClick={() => {
										onTabChange(activeTab === "pine_editor" ? null : "pine_editor");
										onClose();
									}}
								>
									<IconCode size={14} /> {t("mobile.pineEditor")}
								</button>
								<button
									type="button"
									className={`${styles.featureButton} ${activeTab === "strategy_tester" ? styles.active : ""}`}
									onClick={() => {
										onTabChange(activeTab === "strategy_tester" ? null : "strategy_tester");
										onClose();
									}}
								>
									<IconFlask size={14} /> {t("mobile.strategyTester")}
								</button>
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	);

	// Render into the portalRoot if provided, otherwise fallback to document.body
	const mountTarget = portalRoot || (typeof document !== "undefined" ? document.body : null);
	if (!mountTarget) return null;

	return createPortal(content, mountTarget);
}
