/**
 * WE2 P2-02: DrawingToolbar
 *
 * Left-side drawing toolbar with tool groups, recent tools, favorites,
 * magnet snap toggle, and search.
 *
 * Connects to VNInvestChartsStateContext for active tool state.
 * Uses .vnsc- CSS prefix for widget namespace.
 */

import { useState, useCallback, useMemo, useEffect, useRef, Fragment } from "react";
import { tOr, useWidgetI18n } from "../../context/WidgetI18nContext";
import { useVNInvestChartsState } from "../../context/VNInvestChartsStateContext";
import { useShadowRoot } from "../../context/VNInvestChartsContext";
import { TOOL_GROUPS_V2 } from "../../config/toolGroups";
import { TOOL_SHORTCUT_LABELS } from "../../config/toolShortcuts";
import { useFavoriteTools } from "@vninvestcharts/engine-react";
import { useRecentTools } from "@vninvestcharts/engine-react";
import { saveDrawingTemplate, loadDrawingTemplateData } from "@vninvestcharts/engine-drawing";
import { DrawingToolIcon } from "./DrawingToolIcon";
import { FloatingFavoritesBar } from "./FloatingFavoritesBar";

const SUPPORTED_ICONS = [
	"📍", "📌", "⚠️", "✅", "❌",
	"😊", "😎", "🤔", "😱", "😭", "😡",
	"🔥", "🚀", "⭐", "📈", "📉", "💰", "🔔", "🎯", "💡", "✍️", "🔍", "👁️", "👍", "👎",
	"1️⃣", "2️⃣", "3️⃣", "🅰️", "🅱️"
];

import type { PatTier } from "@vninvestcharts/engine-core";
import type { DrawingToolType } from "@vninvestcharts/engine-drawing";
import { isToolAvailable } from "@vninvestcharts/engine-drawing";

export interface DrawingToolbarProps {
	/** Current active tool name (e.g., "trendLine", "fibonacci") */
	activeTool?: string;
	/** Called when user selects a tool */
	onToolSelect?: (tool: string) => void;
	/** Current magnet snap sensitivity: 0=off, 1=weak, 2=normal, 3=strong */
	magnetSensitivity?: number;
	/** Called when user cycles magnet sensitivity (M key equivalent) */
	onMagnetCycle?: () => void;
	/** Current PAT tier for premium tool gating */
	patTier?: PatTier;
	/** Called when a premium tool is clicked but blocked (insufficient tier) */
	onPremiumToolClick?: (tool: string) => void;
	/** Whether the drawing dock is open */
	isDockOpen?: boolean;
	/** Called when user toggles the drawing dock panel */
	onToggleDock?: () => void;
	/** Whether the toolbar is locked (docked) */
	isLocked?: boolean;
	/** Called when user toggles lock/dock state */
	onToggleLock?: () => void;
}

// S2.1: badge reads the canonical SSOT (TOOL_SHORTCUT_LABELS) — the same map
// the single-letter handler (useDrawingToolShortcuts) uses. Badge = handler.
const TOOL_SHORTCUT_BADGE: Record<string, string> = TOOL_SHORTCUT_LABELS;

export function DrawingToolbar({
	activeTool,
	onToolSelect,
	magnetSensitivity = 0,
	onMagnetCycle,
	patTier,
	onPremiumToolClick,
	isDockOpen = false,
	onToggleDock,
	isLocked = false,
	onToggleLock,
}: DrawingToolbarProps) {
	const { t } = useWidgetI18n();
	const { activeTool: ctxActiveTool } = useVNInvestChartsState();
	const resolvedActiveTool = activeTool ?? ctxActiveTool.activeTool ?? "cursor";

	const {
		favoriteTools,
		toggleFavorite,
		isFavorite,
		isFavoritesBarVisible,
		toggleFavoritesBarVisibility,
		setFavoritesBarVisible,
	} = useFavoriteTools();
	const { recentTools, pushRecent } = useRecentTools();
	const shadowRoot = useShadowRoot();

	const [openGroupId, setOpenGroupId] = useState<{ id: string; x: number; y: number } | null>(null);
	const [searchQuery, setSearchQuery] = useState("");
	// P3: last-selected tool per group — the rail button shows it (TradingView parity).
	const [lastUsedByGroup, setLastUsedByGroup] = useState<Record<string, string>>({});

	// Mobile tool long-press tooltip state and refs
	const [mobileToolTooltip, setMobileToolTooltip] = useState<string | null>(null);
	const toolLongPressTimerRef = useRef<NodeJS.Timeout | null>(null);
	const toolTooltipAutoHideTimerRef = useRef<NodeJS.Timeout | null>(null);
	const suppressToolTapRef = useRef(false);

	const TOOL_LONG_PRESS_DELAY_MS = 800;
	const TOOL_TOOLTIP_AUTO_HIDE_MS = 1600;

	const triggerTooltipHapticFeedback = useCallback(() => {
		if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
			navigator.vibrate(10);
		}
	}, []);

	const handleToolbarToolPressStart = useCallback((toolId: string) => {
		suppressToolTapRef.current = false;
		if (toolLongPressTimerRef.current) clearTimeout(toolLongPressTimerRef.current);
		if (toolTooltipAutoHideTimerRef.current) clearTimeout(toolTooltipAutoHideTimerRef.current);

		toolLongPressTimerRef.current = setTimeout(() => {
			suppressToolTapRef.current = true;
			setMobileToolTooltip(tOr(t, `tool.${toolId}`, toolId));
			triggerTooltipHapticFeedback();
			toolTooltipAutoHideTimerRef.current = setTimeout(() => {
				setMobileToolTooltip(null);
			}, TOOL_TOOLTIP_AUTO_HIDE_MS);
		}, TOOL_LONG_PRESS_DELAY_MS);
	}, [t, triggerTooltipHapticFeedback]);

	const handleToolbarToolPressEnd = useCallback(() => {
		if (toolLongPressTimerRef.current) {
			clearTimeout(toolLongPressTimerRef.current);
			toolLongPressTimerRef.current = null;
		}
	}, []);

	const getToolTouchHandlers = useCallback((toolId: string) => ({
		onPointerDown: () => handleToolbarToolPressStart(toolId),
		onPointerUp: handleToolbarToolPressEnd,
		onPointerCancel: handleToolbarToolPressEnd,
		onPointerLeave: handleToolbarToolPressEnd,
		onTouchStart: () => handleToolbarToolPressStart(toolId),
		onTouchEnd: handleToolbarToolPressEnd,
		onTouchCancel: handleToolbarToolPressEnd,
		onContextMenu: (event: { preventDefault: () => void }) => event.preventDefault(),
	}), [handleToolbarToolPressStart, handleToolbarToolPressEnd]);

	useEffect(() => {
		setMobileToolTooltip(null);
		return () => {
			if (toolLongPressTimerRef.current) clearTimeout(toolLongPressTimerRef.current);
			if (toolTooltipAutoHideTimerRef.current) clearTimeout(toolTooltipAutoHideTimerRef.current);
		};
	}, [resolvedActiveTool]);

	const handleToolClick = useCallback(
		(tool: string) => {
			if (!isToolAvailable(tool as DrawingToolType, patTier ?? "free")) {
				return;
			}
			if (resolvedActiveTool === tool) {
				// Deselect if already active
				onToolSelect?.("");
				ctxActiveTool.setActiveTool("");
			} else {
				onToolSelect?.(tool);
				ctxActiveTool.setActiveTool(tool);
				if (tool !== "cursor" && tool !== "crosshair") {
					pushRecent(tool);
				}
				const groupId = TOOL_GROUPS_V2.find((group) => group.tools.includes(tool))?.id;
				if (groupId) {
					setLastUsedByGroup((prev) => (prev[groupId] === tool ? prev : { ...prev, [groupId]: tool }));
				}
			}
			setOpenGroupId(null);
			setSearchQuery("");
		},
		[resolvedActiveTool, onToolSelect, ctxActiveTool, pushRecent, patTier],
	);

	const handleMagnetClick = useCallback(() => {
		onMagnetCycle?.();
	}, [onMagnetCycle]);

	// Close flyout on click outside
	useEffect(() => {
		if (!openGroupId) return;
		const handler = (e: Event) => {
			// Use composedPath for Shadow DOM compatibility
			const me = e as MouseEvent;
			const target = me.composedPath()[0] as HTMLElement;
			if (!target.closest(".vnsc-tools-flyout") && !target.closest(".vnsc-drawing-toolbar__group-container") && !target.closest(".rsc-splitter") && !target.closest(".vnsc-splitter")) {
				setOpenGroupId(null);
				setSearchQuery("");
			}
		};
		// Use shadowRoot for capture-phase listeners in Shadow DOM mode
		const target = shadowRoot ?? document;
		target.addEventListener("mousedown", handler, { capture: true });
		return () => target.removeEventListener("mousedown", handler, { capture: true });
	}, [openGroupId, shadowRoot]);

	const MAGNET_LABELS = ["M", "M₁", "M₂", "M₃"];

	return (
		<>
			<div
				className="vnsc-drawing-toolbar"
				data-testid="drawing-toolbar"
				// P5/D-UI-05: positioning/width/z-index live in toolbar.css (the
				// shell owns the auto-hide layout). Inline keeps only theme styles
				// so no !important war is needed to override them.
				style={{
					height: "100%",
					background: "var(--vnsc-bg-secondary, #111820)",
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
					padding: "4px 0",
					gap: "2px",
					overflowX: "hidden",
					overflowY: "auto",
					scrollbarWidth: "none",
					transition: "width 0.2s ease, padding 0.2s ease, border-right-width 0.2s ease",
				}}
			>
				{/* Dock / Undock (Pin) Button */}
				{onToggleLock && (
					<button
						type="button"
						className={`vnsc-drawing-toolbar__btn ${isLocked ? "vnsc-drawing-toolbar__btn--active" : ""}`}
						title={isLocked ? t("toolbar.undock") : t("toolbar.dock")}
						onClick={onToggleLock}
						style={{
							color: isLocked ? "var(--vnsc-accent, #2962ff)" : "var(--vnsc-text-secondary, #a0a0a0)",
							marginBottom: "2px",
						}}
						data-testid="toolbar-dock-toggle"
					>
						<svg width="14" height="14" viewBox="0 0 24 24" fill={isLocked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
							<path d="M12 17v5M9 2h6l1 7H8l1-7zM5 9h14l-1 8H6L5 9z" />
						</svg>
					</button>
				)}

				{/* Recent Tools Group */}
				{recentTools.length > 0 && (
					<div className="vnsc-tools-group-container" style={{ position: "relative" }}>
						<button
							type="button"
							className={`vnsc-drawing-toolbar__btn vnsc-tool-btn--group`}
							title={t("toolbar.recent")}
							onClick={(e) => {
								if (openGroupId?.id === "recent") {
									setOpenGroupId(null);
									return;
								}
								const rect = e.currentTarget.getBoundingClientRect();
								setOpenGroupId({ id: "recent", x: rect.right + 4, y: rect.top });
							}}
						>
							<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
								<path d="M8 3a5 5 0 1 1-4.24 2.34" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
								<path d="M4 2v4h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
							</svg>
							<span className="vnsc-tools-chevron">▾</span>
						</button>

						{openGroupId?.id === "recent" && (
							<div
								className="vnsc-tools-flyout"
								style={{
									position: "fixed",
									left: openGroupId.x,
									top: Math.max(10, Math.min(openGroupId.y, window.innerHeight - 200)),
									zIndex: "var(--vnsc-z-maximum, 9999)",
									background: "var(--vnsc-bg-primary, #0a0e14)",
									border: "1px solid var(--vnsc-border, #2a2a2a)",
									borderRadius: "6px",
									padding: "8px",
									display: "flex",
									flexDirection: "column",
									gap: "6px",
									boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
									minWidth: "120px",
								}}
							>
								<div style={{ fontSize: "11px", fontWeight: "bold", color: "var(--vnsc-text-secondary, #a0a0a0)", padding: "2px 4px" }}>
									{t("toolbar.recent")}
								</div>
								{mobileToolTooltip && (
									<div style={{ padding: "4px 4px 0", fontSize: "10px", fontWeight: 600, color: "var(--vnsc-text-secondary, #a0a0a0)" }}>
										{mobileToolTooltip}
									</div>
								)}
								<div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "4px" }}>
									{recentTools.map((tool) => {
										const available = isToolAvailable(tool as DrawingToolType, patTier ?? "free");
										return (
											<button
												key={tool}
												type="button"
												className={`vnsc-drawing-toolbar__btn ${resolvedActiveTool === tool ? "vnsc-drawing-toolbar__btn--active" : ""} ${!available ? "vnsc-drawing-toolbar__btn--disabled" : ""}`}
												title={available ? t(`tool.${tool}`) : (t("tool.premiumLocked"))}
												style={{ opacity: available ? undefined : 0.35, cursor: available ? undefined : "not-allowed" }}
												{...getToolTouchHandlers(tool)}
												onClick={() => {
													if (!available) {
														onPremiumToolClick?.(tool);
														return;
													}
													if (suppressToolTapRef.current) {
														suppressToolTapRef.current = false;
														return;
													}
													handleToolClick(tool);
												}}
											>
												<DrawingToolIcon id={tool} />
											</button>
										);
									})}
								</div>
							</div>
						)}
					</div>
				)}

				{/* Main Tool Groups */}
				{TOOL_GROUPS_V2.map((group) => {
					const activeInGroup = group.tools.includes(resolvedActiveTool) ? resolvedActiveTool : null;
					const lastUsed = lastUsedByGroup[group.id];
					const iconId = lastUsed && group.tools.includes(lastUsed) ? lastUsed : group.tools[0];
					const isOpen = openGroupId?.id === group.id;

					return (
						<div key={group.id} className="vnsc-tools-group-container" style={{ position: "relative" }}>
							<button
								type="button"
								className={`vnsc-drawing-toolbar__btn vnsc-tool-btn--group ${activeInGroup ? "vnsc-drawing-toolbar__btn--active" : ""}`}
								title={t(group.labelKey)}
								onClick={(e) => {
									if (isOpen) {
										setOpenGroupId(null);
										return;
									}
									const rect = e.currentTarget.getBoundingClientRect();
									setOpenGroupId({ id: group.id, x: rect.right + 4, y: rect.top });
								}}
							>
								<DrawingToolIcon id={iconId} />
								<span className="vnsc-tools-chevron">▾</span>
							</button>

							{isOpen && (
								<div
									className="vnsc-tools-flyout"
									style={{
										position: "fixed",
										left: openGroupId.x,
										top: Math.max(10, Math.min(openGroupId.y, window.innerHeight - 320)),
										zIndex: "var(--vnsc-z-maximum, 9999)",
										background: "var(--vnsc-bg-primary, #0a0e14)",
										border: "1px solid var(--vnsc-border, #2a2a2a)",
										borderRadius: "6px",
										boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
										display: "flex",
										flexDirection: "column",
										width: group.id === "icons" ? "260px" : "220px",
										overflow: "hidden",
									}}
								>
									{/* Flyout Header & Search */}
									<div style={{ display: "flex", flexDirection: "column", gap: "6px", padding: "8px 10px", borderBottom: "1px solid var(--vnsc-border, #2a2a2a)" }}>
										<div style={{ fontSize: "11px", fontWeight: "bold", color: "var(--vnsc-text-secondary, #a0a0a0)" }}>
											{t(group.labelKey)}
										</div>
										<div style={{ position: "relative", display: "flex", alignItems: "center" }}>
											<input
												type="text"
												placeholder={t("drawing.searchPlaceholder")}
												value={searchQuery}
												onChange={(e) => setSearchQuery(e.target.value)}
												style={{
													width: "100%",
													padding: "4px 8px 4px 24px",
													fontSize: "11px",
													background: "var(--vnsc-bg-secondary, #111820)",
													border: "1px solid var(--vnsc-border, #2a2a2a)",
													borderRadius: "4px",
													color: "var(--vnsc-text-primary, #e0e0e0)",
													outline: "none",
												}}
											/>
											<svg width="10" height="10" viewBox="0 0 16 16" fill="none" style={{ position: "absolute", left: "8px", color: "var(--vnsc-text-secondary, #a0a0a0)" }}>
												<path d="M11.5 11.5L15 15M13 7C13 10.3137 10.3137 13 7 13C3.68629 13 1 10.3137 1 7C1 3.68629 3.68629 1 7 1C10.3137 1 13 3.68629 13 7Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
											</svg>
										</div>
									</div>

									{mobileToolTooltip && (
										<div style={{ padding: "6px 10px 0", fontSize: "10px", fontWeight: 600, color: "var(--vnsc-text-secondary, #a0a0a0)" }}>
											{mobileToolTooltip}
										</div>
									)}

									{/* Flyout Grid */}
									<div style={{ display: "grid", gridTemplateColumns: group.id === "icons" ? "repeat(6, 1fr)" : "repeat(4, 1fr)", gap: "6px", padding: "8px 10px", maxHeight: "200px", overflowY: "auto" }}>
										{group.id === "icons" ? (
											SUPPORTED_ICONS
												.filter((emoji) => emoji.includes(searchQuery))
												.map((emoji) => {
													const currentTemplate = loadDrawingTemplateData("iconMarker") || { style: {} };
													const currentIcon = currentTemplate.style.icon ?? "📍";
													const active = resolvedActiveTool === "iconMarker" && currentIcon === emoji;
													return (
														<button
															key={emoji}
															type="button"
															className={`vnsc-drawing-toolbar__btn ${active ? "vnsc-drawing-toolbar__btn--active" : ""}`}
															title={emoji}
															style={{
																fontSize: "18px",
																height: "32px",
																width: "32px",
																display: "flex",
																alignItems: "center",
																justifyContent: "center",
																background: active ? "var(--vnsc-accent-alpha, rgba(41, 98, 255, 0.2))" : "transparent",
																border: active ? "1px solid var(--vnsc-accent, #2962ff)" : "1px solid transparent",
																borderRadius: "4px",
																cursor: "pointer",
																padding: 0,
															}}
															onClick={() => {
																saveDrawingTemplate("iconMarker", { ...currentTemplate.style, icon: emoji }, { segmentStyles: currentTemplate.segmentStyles, segmentVisible: currentTemplate.segmentVisible });
																handleToolClick("iconMarker");
															}}
														>
															{emoji}
														</button>
													);
												})
										) : (
											group.tools
												.filter((tId) => tId.toLowerCase().includes(searchQuery.toLowerCase()) || (t(`tool.${tId}`)).toLowerCase().includes(searchQuery.toLowerCase()))
												.map((toolId) => {
													const active = resolvedActiveTool === toolId;
													const fav = isFavorite(toolId);
													const available = isToolAvailable(toolId as DrawingToolType, patTier ?? "free");
													return (
														<button
															key={toolId}
															type="button"
															className={`vnsc-drawing-toolbar__btn ${active ? "vnsc-drawing-toolbar__btn--active" : ""} ${!available ? "vnsc-drawing-toolbar__btn--disabled" : ""}`}
															title={available ? t(`tool.${toolId}`) : (t("tool.premiumLocked"))}
															style={{ position: "relative", opacity: available ? undefined : 0.35, cursor: available ? undefined : "not-allowed" }}
															{...getToolTouchHandlers(toolId)}
															onClick={() => {
																if (!available) {
																	onPremiumToolClick?.(toolId);
																	return;
																}
																if (suppressToolTapRef.current) {
																	suppressToolTapRef.current = false;
																	return;
																}
																handleToolClick(toolId);
															}}
														>
															<DrawingToolIcon id={toolId} />
															{TOOL_SHORTCUT_BADGE[toolId] && (
																<span style={{
																	position: "absolute",
																	bottom: 1,
																	right: 2,
																	fontSize: "8px",
																	color: "var(--vnsc-text-secondary, #a0a0a0)",
																	pointerEvents: "none",
																}}>
																	{TOOL_SHORTCUT_BADGE[toolId]}
																</span>
															)}
															{/* P3: span (not nested button) — a button inside the tool
															button is invalid HTML and trips React's nesting warning. */}
															<span
																role="button"
																tabIndex={0}
																className="vnsc-tool-fav-star"
																aria-label={fav ? t("toolbar.unfavorite") : t("toolbar.favorite")}
																aria-pressed={fav}
																title={fav ? t("toolbar.unfavorite") : t("toolbar.favorite")}
																style={{
																	position: "absolute",
																	top: 1,
																	left: 2,
																	fontSize: "8px",
																	lineHeight: 1,
																	color: fav ? "var(--vnsc-accent, #2962ff)" : "var(--vnsc-text-secondary, #a0a0a0)",
																	opacity: fav ? 1 : 0,
																	cursor: "pointer",
																	transition: "opacity 0.15s",
																	background: "transparent",
																	border: "none",
																	padding: 0,
																}}
																onClick={(e) => {
																	e.stopPropagation();
																	toggleFavorite(toolId);
																}}
																onKeyDown={(e) => {
																	if (e.key === "Enter" || e.key === " ") {
																		e.preventDefault();
																		e.stopPropagation();
																		toggleFavorite(toolId);
																	}
																}}
															>
															★
															</span>
														</button>
													);
												})
										)}
									</div>
								</div>
							)}
						</div>
					);
				})}

				<div style={{ flex: 1 }} />

				{/* Pinned Favorites Star Toggle (TradingView Parity) */}
				{favoriteTools.length > 0 && (
					<button
						type="button"
						className={`vnsc-drawing-toolbar__btn ${isFavoritesBarVisible ? "vnsc-drawing-toolbar__btn--star-active" : ""}`}
						title={`${isFavoritesBarVisible ? t("toolbar.hideFavoritesBar") : t("toolbar.showFavoritesBar")} (Alt+S)`}
						aria-label={isFavoritesBarVisible ? t("toolbar.hideFavoritesBar") : t("toolbar.showFavoritesBar")}
						aria-pressed={isFavoritesBarVisible}
						onClick={toggleFavoritesBarVisibility}
						data-testid="drawing-toolbar-favorites-toggle"
						style={{
							fontSize: "15px",
							lineHeight: 1,
						}}
					>
					★
					</button>
				)}

				{/* Magnet snap toggle (S4: Shift+M cycles modes) */}
				<button
					type="button"
					className="vnsc-drawing-toolbar__magnet"
					title={`${t("toolbar.magnet")}: ${MAGNET_LABELS[magnetSensitivity] ?? t("drawing.magnet.off")} (Shift+M)`}
					onClick={handleMagnetClick}
					style={{
						width: "32px",
						height: "32px",
						border: "none",
						borderRadius: "4px",
						background: magnetSensitivity > 0 ? "var(--vnsc-accent, #2962ff)" : "transparent",
						color: magnetSensitivity > 0 ? "#fff" : "var(--vnsc-text-secondary, #a0a0a0)",
						cursor: "pointer",
						fontSize: "12px",
						fontWeight: 700,
					}}
					data-testid="magnet-toggle"
				>
					{MAGNET_LABELS[magnetSensitivity] ?? "M"}
				</button>

				{/* Drawing Dock Toggle */}
				{onToggleDock && (
					<button
						type="button"
						className="vnsc-drawing-toolbar__btn"
						title={`${t("drawing.dock.toggle")} (${t("drawing.dock.toggleShortcut")})`}
						onClick={onToggleDock}
						style={{
							width: "32px",
							height: "32px",
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							border: "none",
							borderRadius: "4px",
							background: isDockOpen ? "var(--vnsc-accent, #2962ff)" : "transparent",
							color: isDockOpen ? "#fff" : "var(--vnsc-text-secondary, #a0a0a0)",
							cursor: "pointer",
							fontSize: "12px",
							fontWeight: 700,
						}}
						data-testid="drawing-dock-toggle"
					>
						<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
							<rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.4" />
							<line x1="10" y1="2" x2="10" y2="14" stroke="currentColor" strokeWidth="1.2" />
						</svg>
					</button>
				)}

			</div>
			{/* P3: floating quick-favorites bar (portal overlay, null while empty or hidden). */}
			<FloatingFavoritesBar
				favoriteTools={favoriteTools}
				activeTool={resolvedActiveTool}
				onToolSelect={handleToolClick}
				onUnpin={toggleFavorite}
				isVisible={isFavoritesBarVisible}
				onClose={() => setFavoritesBarVisible(false)}
			/>
		</>
	);
}
