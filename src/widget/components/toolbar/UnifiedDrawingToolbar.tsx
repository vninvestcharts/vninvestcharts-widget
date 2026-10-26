import React, { useCallback, useMemo, useRef, useState, useEffect, useSyncExternalStore } from 'react';
import { tOr, useWidgetI18n } from '../../context/WidgetI18nContext';
import { DrawingWorkspaceController, DrawingWorkspaceTool } from "@vninvestcharts/engine-react";
import type { PatTier } from "@vninvestcharts/engine-core";
import type { DrawingToolType } from "@vninvestcharts/engine-drawing";
import { isToolAvailable } from "@vninvestcharts/engine-drawing";
import { TOOL_GROUPS_V2 } from "../../config/toolGroups";
import { TOOL_SHORTCUT_LABELS } from "../../config/toolShortcuts";
import styles from './UnifiedDrawingToolbar.module.css';
import { ToolGlyph, IconLock, IconUnlock, IconChevronLeft, IconChevronRight, IconChevronUp, IconChevronDown, IconTrash, IconUndo, IconRedo } from '../common/Icons';

// P4: groups/tools come from the widget SSOT (TOOL_GROUPS_V2: 14 groups,
// 76 tools + cursor/crosshair UI modes). The legacy hardcoded TOOL_GROUPS
// (8 groups, 27 tools, emoji icons) and ALL_TOOLS exports are removed;
// SystemMenu and MultiChartsDrawingToolbar consume the SSOT directly.
// Flattened id list (placeholder + favorites lookup).
const ALL_TOOL_IDS = TOOL_GROUPS_V2.flatMap((group) => group.tools);

interface UnifiedDrawingToolbarProps {
  /** The active chart ID to control */
  activeChartId: string | null;
  /** Chart refs map to access drawing managers */
  chartRefs: Map<string, React.RefObject<any>>;
  /** Whether the toolbar is locked open */
  locked?: boolean;
  /** Callback when lock state changes */
  onLockChange?: (locked: boolean) => void;
  /** Whether the toolbar is collapsed */
  collapsed?: boolean;
  /** Callback when collapse state changes */
  onCollapseChange?: (collapsed: boolean) => void;
  /** Custom className */
  className?: string;
  /** Current PAT tier for premium tool gating */
  patTier?: PatTier;
  /** Called when a premium tool is clicked but blocked (insufficient tier) */
  onPremiumToolClick?: (tool: string) => void;
  /** Whether the drawing dock is open */
  isDockOpen?: boolean;
  /** Called when user toggles the drawing dock panel */
  onToggleDock?: () => void;
}

export const UnifiedDrawingToolbar: React.FC<UnifiedDrawingToolbarProps> = ({
	activeChartId,
	chartRefs,
	locked = false,
	onLockChange,
	collapsed = false,
	onCollapseChange,
	className = '',
	patTier,
	onPremiumToolClick,
	isDockOpen = false,
	onToggleDock,
}) => {
	const { t } = useWidgetI18n();
	const toolbarRef = useRef<HTMLDivElement>(null);
	const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
	const [favoriteTools, setFavoriteTools] = useState<Set<string>>(new Set());

	// Load favorites from localStorage
	useEffect(() => {
		try {
			const stored = localStorage.getItem('vninvestcharts-widget:favoriteTools');
			if (stored) {
				setFavoriteTools(new Set(JSON.parse(stored)));
			}
		} catch (e) {
			console.warn('Failed to load favorite tools:', e);
		}
	}, []);

	const toggleFavorite = useCallback((toolId: string) => {
		setFavoriteTools(prev => {
			const next = new Set(prev);
			if (next.has(toolId)) {
				next.delete(toolId);
			} else {
				next.add(toolId);
			}
			try {
				localStorage.setItem('vninvestcharts-widget:favoriteTools', JSON.stringify([...next]));
			} catch (e) {
				console.warn('Failed to save favorite tools:', e);
			}
			return next;
		});
	}, []);

	// Get the active chart's drawing workspace controller
	const activeChartRef = useMemo(() => {
		if (!activeChartId) return null;
		return chartRefs.get(activeChartId)?.current;
	}, [activeChartId, chartRefs]);

	// Get the drawing workspace via the public chart-handle getter (P4: the
	// legacy `(ref as string)?._drawingWorkspace` private access is kept only as
	// a fallback for non-conforming handles).
	const drawingWorkspace = useMemo(() => {
		if (!activeChartRef) return null;
		const getter = (activeChartRef as { getDrawingWorkspace?: () => DrawingWorkspaceController | null }).getDrawingWorkspace;
		if (typeof getter === "function") return getter.call(activeChartRef) ?? null;
		return (activeChartRef as { _drawingWorkspace?: DrawingWorkspaceController | null })._drawingWorkspace ?? null;
	}, [activeChartRef]);

	// P4-02: the controller is a stable mutated ref — subscribe so the active
	// tool and undo/redo state never go stale (previously read once per
	// parent render). Workspaces without subscribe (legacy mocks) keep the
	// previous read-once behavior.
	const workspaceSnapshot = useSyncExternalStore(
		useCallback(
			(notify: () => void) => drawingWorkspace?.subscribe?.(notify) ?? (() => undefined),
			[drawingWorkspace],
		),
		() => drawingWorkspace?.state ?? null,
		() => null,
	);

	const activeTool = workspaceSnapshot?.activeTool ?? 'cursor';
	const canUndo = drawingWorkspace?.interaction?.canUndo ?? false;
	const canRedo = drawingWorkspace?.interaction?.canRedo ?? false;

	const handleToolSelect = useCallback((toolId: string) => {
		if (!isToolAvailable(toolId as DrawingToolType, patTier ?? "free")) {
			onPremiumToolClick?.(toolId);
			return;
		}
		if (drawingWorkspace) {
			drawingWorkspace.setActiveTool(toolId as DrawingWorkspaceTool);
		}
	}, [drawingWorkspace, patTier, onPremiumToolClick]);

	const handleUndo = useCallback(() => {
		drawingWorkspace?.interaction?.undo();
	}, [drawingWorkspace]);

	const handleRedo = useCallback(() => {
		drawingWorkspace?.interaction?.redo();
	}, [drawingWorkspace]);

	const handleClearAll = useCallback(() => {
		drawingWorkspace?.interaction?.dispatch({ type: 'CLEAR' });
	}, [drawingWorkspace]);

	const handleLockToggle = useCallback(() => {
		onLockChange?.(!locked);
	}, [locked, onLockChange]);

	const handleCollapseToggle = useCallback(() => {
		onCollapseChange?.(!collapsed);
	}, [collapsed, onCollapseChange]);

	const handleGroupToggle = useCallback((groupId: string) => {
		setExpandedGroup(prev => prev === groupId ? null : groupId);
	}, []);

	// If no active chart, show placeholder with disabled tool buttons
	if (!activeChartId || !drawingWorkspace) {
		return (
			<div
				className={`${styles.unifiedDrawingToolbar} ${styles.noActive} ${collapsed ? styles.collapsed : ''} ${className}`}
				ref={toolbarRef}
				role="complementary"
				aria-label={t("toolbar.drawingTools")}
				data-collapsed-label={t("toolbar.drawingTools")}
			>
				<div className={styles.toolbarPlaceholder}>
					<div className={styles.placeholderToolGrid}>
						{ALL_TOOL_IDS.slice(0, 8).map(toolId => (
							<button
								key={toolId}
								className={`${styles.toolButton} ${styles.disabled}`}
								disabled
								title={t("toolbar.selectChart")}
								aria-disabled="true"
							>
								<span className={styles.toolIcon} aria-hidden="true"><ToolGlyph id={toolId} /></span>
								<span className={styles.toolLabel}>{tOr(t, `tool.${toolId}`, toolId)}</span>
							</button>
						))}
					</div>
					<span className={styles.placeholderText}>
						{t("toolbar.selectChart")}
					</span>
				</div>
			</div>
		);
	}

	return (
		<div
			className={`${styles.unifiedDrawingToolbar} ${locked ? styles.locked : ''} ${collapsed ? styles.collapsed : ''} ${className}`}
			ref={toolbarRef}
			role="complementary"
			aria-label={t("toolbar.drawingTools")}
			data-collapsed={collapsed}
			data-collapsed-label={t("toolbar.drawingTools")}
		>
			<div className={styles.toolbarHeader}>
				<span className={styles.toolbarTitle}>
					{t("toolbar.drawingTools")}
				</span>
				<div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
					<button
						className={`${styles.lockToolbarToggle} ${locked ? styles.locked : ''}`}
						onClick={handleLockToggle}
						title={locked ? t("toolbar.unlock") : t("toolbar.lock")}
						aria-pressed={locked}
						aria-label={locked ? t("toolbar.unlock") : t("toolbar.lock")}
					>
						{locked ? <IconLock size={14} /> : <IconUnlock size={14} />}
					</button>
					<button
						className={styles.lockToolbarToggle}
						onClick={handleCollapseToggle}
						title={collapsed ? t("toolbar.expand") : t("toolbar.collapse")}
						aria-pressed={collapsed}
						aria-label={collapsed ? t("toolbar.expand") : t("toolbar.collapse")}
					>
						{collapsed ? <IconChevronRight size={14} /> : <IconChevronLeft size={14} />}
					</button>
				</div>
			</div>

			<div className={styles.toolbarContent}>
				{/* Favorites Section */}
				{favoriteTools.size > 0 && (
					<div className={styles.toolbarSection}>
						<span className={styles.sectionLabel}>
							{t("toolbar.favorites")}
						</span>
						<div className={styles.toolGrid} role="group" aria-label={t("toolbar.favorites")}>
							{[...favoriteTools].map(toolId => {
								if (!ALL_TOOL_IDS.includes(toolId)) return null;
								const toolLabel = tOr(t, `tool.${toolId}`, toolId);
								const toolShortcut = TOOL_SHORTCUT_LABELS[toolId] ?? '';
								const isActive = activeTool === toolId;
								const available = isToolAvailable(toolId as DrawingToolType, patTier ?? "free");
								return (
									<button
										key={toolId}
										className={`${styles.toolButton} ${isActive ? styles.active : ''} ${!available ? styles.disabled : ''}`}
										onClick={() => handleToolSelect(toolId)}
										title={available ? (toolShortcut ? `${toolLabel} (${toolShortcut})` : toolLabel) : (t("tool.premiumLocked"))}
										aria-pressed={isActive}
										aria-label={`${toolLabel}${isActive ? ', active' : ''}${!available ? ' - Pro' : ''}`}
										role="switch"
										style={{ opacity: available ? undefined : 0.35, cursor: available ? undefined : 'not-allowed' }}
									>
										<span className={styles.toolIcon} aria-hidden="true"><ToolGlyph id={toolId} /></span>
										<span className={styles.toolLabel}>{toolLabel}</span>
										{toolShortcut && <span className={styles.toolShortcut} aria-hidden="true">{toolShortcut}</span>}
										<span
											className={`${styles.favoriteStar} ${styles.active}`}
											aria-hidden="true"
											onClick={(e) => { e.stopPropagation(); toggleFavorite(toolId); }}
										>
                      ★
										</span>
									</button>
								);
							})}
						</div>
					</div>
				)}

				{/* Tool Groups (P4: SSOT TOOL_GROUPS_V2 — 14 groups, 76 tools) */}
				{TOOL_GROUPS_V2.map(group => {
					const groupLabel = tOr(t, group.labelKey, group.id);
					return (
						<div key={group.id} className={styles.toolbarSection}>
							<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px' }}>
								<span className={styles.sectionLabel}>
									{groupLabel}
								</span>
								<button
									className={`${styles.lockToolbarToggle} ${expandedGroup === group.id ? styles.locked : ''}`}
									onClick={() => handleGroupToggle(group.id)}
									aria-expanded={expandedGroup === group.id}
									aria-controls={`${group.id}-tools`}
									aria-label={expandedGroup === group.id
										? tOr(t, "toolbar.collapseGroup", `Collapse ${groupLabel}`)
										: tOr(t, "toolbar.expandGroup", `Expand ${groupLabel}`)}
									style={{ padding: '4px 8px', fontSize: '12px' }}
								>
									{expandedGroup === group.id ? <IconChevronUp size={12} /> : <IconChevronDown size={12} />}
								</button>
							</div>

							{expandedGroup === group.id && (
								<div
									id={`${group.id}-tools`}
									className={styles.toolGrid}
									role="group"
									aria-label={groupLabel}
								>
									{group.tools.map(toolId => {
										const toolLabel = tOr(t, `tool.${toolId}`, toolId);
										const toolShortcut = TOOL_SHORTCUT_LABELS[toolId] ?? '';
										const isActive = activeTool === toolId;
										const isFavorite = favoriteTools.has(toolId);
										const available = isToolAvailable(toolId as DrawingToolType, patTier ?? "free");
										return (
											<button
												key={toolId}
												className={`${styles.toolButton} ${isActive ? styles.active : ''} ${!available ? styles.disabled : ''}`}
												onClick={() => handleToolSelect(toolId)}
												title={available ? (toolShortcut ? `${toolLabel} (${toolShortcut})` : toolLabel) : (t("tool.premiumLocked"))}
												aria-pressed={isActive}
												aria-label={`${toolLabel}${isActive ? ', active' : ''}${!available ? ' - Pro' : ''}`}
												role="switch"
												style={{ opacity: available ? undefined : 0.35, cursor: available ? undefined : 'not-allowed' }}
											>
												<span className={styles.toolIcon} aria-hidden="true"><ToolGlyph id={toolId} /></span>
												<span className={styles.toolLabel}>{toolLabel}</span>
												{toolShortcut && <span className={styles.toolShortcut} aria-hidden="true">{toolShortcut}</span>}
												<button
													type="button"
													className={`${styles.favoriteStar} ${isFavorite ? styles.active : ''}`}
													onClick={(e) => { e.stopPropagation(); toggleFavorite(toolId); }}
													onKeyDown={(e) => {
														if (e.key === "Enter" || e.key === " ") {
															e.preventDefault();
															e.stopPropagation();
															toggleFavorite(toolId);
														}
													}}
													aria-label={isFavorite
														? t("toolbar.unfavorite")
														: t("toolbar.favorite")}
												>
                        ★
												</button>
											</button>
										);
									})}
								</div>
							)}
						</div>
					);
				})}

				{/* Extra Controls */}
				<div className={styles.unifiedToolbarExtras}>
					<div className={styles.extraControls} role="group" aria-label={t("toolbar.actions")}>
						{onToggleDock && (
							<button
								className={`${styles.extraControls} button`}
								onClick={onToggleDock}
								title={`${t("drawing.dock.toggle")} (${t("drawing.dock.toggleShortcut")})`}
								aria-label={t("drawing.dock.toggle")}
								aria-pressed={isDockOpen}
								style={{ background: isDockOpen ? 'var(--vnsc-accent, #2962ff)' : undefined, color: isDockOpen ? '#fff' : undefined }}
							>
								<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
									<rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.4" />
									<line x1="10" y1="2" x2="10" y2="14" stroke="currentColor" strokeWidth="1.2" />
								</svg>
								<span>{t("drawing.dock.toggle")}</span>
							</button>
						)}
						<button
							className={`${styles.extraControls} button`}
							onClick={handleUndo}
							disabled={!canUndo}
							title={t("toolbar.undo")}
							aria-label={t("toolbar.undo")}
							aria-disabled={!canUndo}
						>
							<span aria-hidden="true"><IconUndo /></span>
							<span>{t("toolbar.undo")}</span>
							<kbd style={{ fontSize: '10px', opacity: 0.7, marginLeft: '4px' }}>Ctrl+Z</kbd>
						</button>
						<button
							className={`${styles.extraControls} button`}
							onClick={handleRedo}
							disabled={!canRedo}
							title={t("toolbar.redo")}
							aria-label={t("toolbar.redo")}
							aria-disabled={!canRedo}
						>
							<span aria-hidden="true"><IconRedo /></span>
							<span>{t("toolbar.redo")}</span>
							<kbd style={{ fontSize: '10px', opacity: 0.7, marginLeft: '4px' }}>Ctrl+Y</kbd>
						</button>
					</div>

					<div className={styles.extraControls} role="group" aria-label={t("toolbar.dangerousActions")}>
						<button
							className={`${styles.clearAllBtn}`}
							onClick={handleClearAll}
							title={t("toolbar.clearAll")}
							aria-label={t("toolbar.clearAll")}
						>
							<span aria-hidden="true"><IconTrash size={14} /></span>
							<span>{t("toolbar.clearAll")}</span>
						</button>
					</div>
				</div>
			</div>
		</div>
	);
};

export default UnifiedDrawingToolbar;