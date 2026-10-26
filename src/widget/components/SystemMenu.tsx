import React, { useRef, useEffect, useCallback, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useWidgetI18n } from "../context/WidgetI18nContext";
import type { ChartTheme } from "../../lib/core";
import { TOOL_GROUPS_V2 } from "../config/toolGroups";
import { TOOL_SHORTCUT_LABELS } from "../config/toolShortcuts";
import { ConfirmDialog } from "./ConfirmDialog";
import { ToolGlyph, IconTrash, IconUndo, IconRedo, IconDownload, IconLayoutGrid, IconSettings, IconSave, IconStar } from "./common/Icons";
import styles from "./SystemMenu.module.css";
import { isClickOutside } from "../utils/clickOutside";

const THEME_OPTIONS: Array<{ id: ChartTheme; swatch: string }> = [
	{ id: "modern-light", swatch: "#ffffff" }, { id: "neutral-pro", swatch: "#e2e8f0" },
	{ id: "classic-dark", swatch: "#1a1f2e" }, { id: "trading-night", swatch: "#0d1117" },
	{ id: "high-contrast", swatch: "#000000" },
	// D5 (P1-4 audit item 13): `midnight-blue` là preset CÓ thật (`tokens/presets/midnight-blue.css`,
	// `useChartTheme.ts:20` ALL_THEMES, `ThemePaletteSettingsTab.tsx:30`) nhưng SystemMenu không
	// liệt kê ⇒ người dùng không đổi được sang preset đã có.
	{ id: "midnight-blue", swatch: "#0d1117" },
];

/**
 * Nhãn theme: 5 preset cũ có key i18n sẵn; `midnight-blue` **chưa** có key ⇒ dùng
 * `defaultValue` (pattern được repo chấp nhận — `messages.*.ts` bị freeze) thay vì
 * sửa file i18n (headroom chỉ 1 dòng).
 */
function themeLabel(t: (key: string, params?: { defaultValue?: string }) => string, locale: string, id: ChartTheme): string {
	if (id !== "midnight-blue") return t(`systemMenu.theme.${id}`);
	return t(`systemMenu.theme.${id}`, { defaultValue: locale === "vi" ? "Xanh Midnight" : "Midnight Blue" });
}

function getAllFocusableElements(container: HTMLElement): HTMLElement[] {
	return Array.from(container.querySelectorAll<HTMLElement>(
		'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
	)).filter((el) => el.offsetParent !== null);
}

export interface SystemMenuProps {
  activeTarget?: "workspace" | "chart";
  currentWorkspaceId: string | null;
  currentWorkspaceName: string;
  workspaces: Array<{ id: string; name: string; updatedAt: number }>;
  onSaveWorkspace: (workspaceId: string, name: string) => Promise<void>;
  onLoadWorkspace: (workspaceId: string) => Promise<void>;
  onDeleteWorkspace: (workspaceId: string) => Promise<void>;
  onImportWorkspace: (file: File) => Promise<void>;
  onExportWorkspace: (workspaceId: string) => Promise<void>;
  onNewWorkspace: () => void;
  layoutPresets: Array<{ id: string; name: string; layout: any }>;
  currentLayoutId: string | null;
  onLayoutPresetSelect: (presetId: string) => void;
  onOpenLayoutDesigner?: () => void;
  layout?: { rows: number; cols: number };
  onLayoutChange?: (layout: { rows: number; cols: number }) => void;
  syncSettings: {
    visibleRange: boolean; crosshair: boolean; drawings: boolean;
    symbolLinks: boolean; timeframe: boolean; chartType: boolean; replay: boolean;
    time: boolean;
  };
  onSyncToggle: (type: keyof SystemMenuProps["syncSettings"]) => void;
  onExportSnapshot: () => void;
  onExportData: () => void;
  onOpenSettings: () => void;
  currentTheme?: ChartTheme;
  onThemeChange?: (theme: ChartTheme) => void;
  onUpgradeClick?: () => void;
  activeTool?: string | null;
  onToolSelect?: (toolId: string) => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  onClearAll?: () => void;
  variant?: "dropdown" | "bottomsheet";
  onClose?: () => void;
  portalRoot?: HTMLElement | null;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

// ─── JSX helpers ──────────────────────────────────────────────────────────────
const SH = (title: string, trigger?: ReactNode) => (
	<div className={styles.sectionHeader}><span className={styles.sectionTitle}>{title}</span>{trigger}</div>
);
const S = (title: string, children: ReactNode) => (
	<div className={styles.section}>{SH(title)}{children}</div>
);
const SD = (title: string, trigger: ReactNode, open: boolean, closable: ReactNode) => (
	<div className={styles.section}>
		{SH(title, trigger)}
		{open && <div className={styles.dropdown}>{closable}</div>}
	</div>
);
const DI = (label: ReactNode, onClick: () => void, active?: boolean) => (
	<button role="menuitem" className={`${styles.dropdownItem}${active ? " " + styles.active : ""}`} onClick={onClick}>{label}</button>
);
const A = (icon: ReactNode, label: string, onClick: () => void) => (
	<button role="menuitem" className={styles.actionItem} onClick={onClick}>
		<span className={styles.actionIcon}>{icon}</span><span>{label}</span>
	</button>
);

export const SystemMenu: React.FC<SystemMenuProps> = ({
	activeTarget = "chart", currentWorkspaceId, currentWorkspaceName, workspaces,
	onSaveWorkspace, onLoadWorkspace, onDeleteWorkspace, onImportWorkspace, onExportWorkspace, onNewWorkspace,
	layoutPresets, currentLayoutId, onLayoutPresetSelect, onOpenLayoutDesigner,
	layout, onLayoutChange,
	syncSettings, onSyncToggle, onExportSnapshot, onExportData, onOpenSettings,
	onThemeChange, currentTheme = "modern-light", onUpgradeClick,
	activeTool = "cursor", onToolSelect, canUndo = false, canRedo = false, onUndo, onRedo, onClearAll,
	variant = "dropdown", onClose, portalRoot, className = "", style, children,
}) => {
	const { t, locale } = useWidgetI18n();
	const isMobile = variant === "bottomsheet";
	const menuRef = useRef<HTMLDivElement>(null);
	const triggerRefs = {
		workspace: useRef<HTMLButtonElement>(null),
		layout: useRef<HTMLButtonElement>(null),
		sync: useRef<HTMLButtonElement>(null),
		drawingTools: useRef<HTMLButtonElement>(null),
	};
	const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
	const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
	const [favoriteTools, setFavoriteTools] = useState<Set<string>>(new Set());
	const [newWorkspaceName, setNewWorkspaceName] = React.useState("");
	const [showNewWorkspaceInput, setShowNewWorkspaceInput] = React.useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [pendingDelete, setPendingDelete] = useState<string | null>(null);
	const [dragY, setDragY] = useState(0);
	const startYRef = useRef(0);
	const isDraggingRef = useRef(false);
	const sheetRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		try {
			const stored = localStorage.getItem("vninvestcharts-widget:favoriteTools");
			if (stored) setFavoriteTools(new Set(JSON.parse(stored)));
		} catch (e) { /* ignore */ }
	}, []);

	const toggleFavorite = useCallback((toolId: string) => {
		setFavoriteTools(prev => {
			const next = new Set(prev);
			next.has(toolId) ? next.delete(toolId) : next.add(toolId);
			try { localStorage.setItem("vninvestcharts-widget:favoriteTools", JSON.stringify([...next])); } catch (e) { /* ignore */ }
			return next;
		});
	}, []);

	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (isClickOutside(menuRef.current, event)) {
				setActiveDropdown(null);
				setShowNewWorkspaceInput(false);
			}
		};
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	useEffect(() => {
		if (!activeDropdown) return;
		const dropdown = menuRef.current?.querySelector(`.${styles.dropdown}`);
		if (dropdown) {
			const focusable = getAllFocusableElements(dropdown as HTMLElement);
			focusable[0]?.focus();
		}
	}, [activeDropdown]);

	const toggleDropdown = (name: string) => {
		if (name === "drawingTools") {
			setActiveDropdown(activeDropdown === "drawingTools" ? null : "drawingTools");
			setShowNewWorkspaceInput(false);
		} else {
			setActiveDropdown(activeDropdown === name ? null : name);
		}
	};
	const closeDropdowns = useCallback(() => {
		setActiveDropdown(null);
		setShowNewWorkspaceInput(false);
	}, []);

	const getTriggerRef = () => {
		if (activeDropdown === "workspace") return triggerRefs.workspace;
		if (activeDropdown === "layout") return triggerRefs.layout;
		if (activeDropdown === "sync") return triggerRefs.sync;
		if (activeDropdown === "drawingTools") return triggerRefs.drawingTools;
		return null;
	};

	const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
		if (e.key === "Escape") { closeDropdowns(); getTriggerRef()?.current?.focus(); return; }
		if (activeDropdown) return;
		const focusable = menuRef.current ? getAllFocusableElements(menuRef.current) : [];
		if (focusable.length === 0) return;
		const currentIndex = focusable.indexOf(document.activeElement as HTMLElement);
		if (e.key === "ArrowDown") { e.preventDefault(); focusable[(currentIndex + 1) % focusable.length]?.focus(); } else if (e.key === "ArrowUp") { e.preventDefault(); focusable[(currentIndex - 1 + focusable.length) % focusable.length]?.focus(); }
	}, [closeDropdowns, activeDropdown]);

	useEffect(() => {
		if (!activeDropdown) return;
		const handleTabTrap = (e: KeyboardEvent) => {
			if (e.key !== "Tab") return;
			const dropdown = menuRef.current?.querySelector(`.${styles.dropdown}`);
			if (!dropdown) return;
			const focusable = getAllFocusableElements(dropdown as HTMLElement);
			if (focusable.length === 0) { e.preventDefault(); return; }
			const currentIndex = focusable.indexOf(document.activeElement as HTMLElement);
			if (e.shiftKey) {
				if (currentIndex <= 0) { e.preventDefault(); focusable[focusable.length - 1]?.focus(); }
			} else {
				if (currentIndex === focusable.length - 1 || currentIndex === -1) { e.preventDefault(); focusable[0]?.focus(); }
			}
		};
		document.addEventListener("keydown", handleTabTrap);
		return () => document.removeEventListener("keydown", handleTabTrap);
	}, [activeDropdown]);

	const handleSaveWorkspace = async () => {
		if (newWorkspaceName.trim()) {
			await onSaveWorkspace(`workspace-${Date.now()}`, newWorkspaceName.trim());
			setNewWorkspaceName(""); setShowNewWorkspaceInput(false); setActiveDropdown(null);
		}
	};
	const handleImportWorkspace = () => { fileInputRef.current?.click(); };
	const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (file) { await onImportWorkspace(file); setActiveDropdown(null); e.target.value = ""; }
	};
	const handleExportWorkspace = async (wid: string) => { await onExportWorkspace(wid); setActiveDropdown(null); };
	const handleDeleteWorkspace = async (wid: string) => {
		setPendingDelete(wid);
	};
	const handleConfirmDelete = async () => {
		if (pendingDelete) { await onDeleteWorkspace(pendingDelete); setPendingDelete(null); setActiveDropdown(null); }
	};
	const handleCancelDelete = () => { setPendingDelete(null); };
	const handleTouchStart = useCallback((e: React.TouchEvent) => { startYRef.current = e.touches[0].clientY; isDraggingRef.current = true; }, []);
	const handleTouchMove = useCallback((e: React.TouchEvent) => {
		if (!isDraggingRef.current) return;
		const d = e.touches[0].clientY - startYRef.current;
		if (d > 0) setDragY(d);
	}, []);
	const handleTouchEnd = useCallback(() => {
		isDraggingRef.current = false;
		if (dragY > 100) onClose?.(); else setDragY(0);
	}, [dragY, onClose]);

	// ─── Desktop sections (no isMobile checks) ─────────────────────────────
	const renderDesktopContent = () => (
		<div ref={menuRef} className={`${styles.menu} ${className}`} style={style} onKeyDown={handleKeyDown} role="menu"
			aria-label={t("header.systemMenu.label") ?? "System menu"}>

			{/* Context indicator */}
			<div className={styles.contextIndicator} data-context={activeTarget}>
				<span className={styles.contextDot} />
				<span>{activeTarget === "workspace" ? t("systemMenu.context.workspace") : t("systemMenu.context.chart")}</span>
			</div>

			{/* Workspace */}
			{SD(t("systemMenu.workspace.title") ?? "Workspace",
				<button ref={triggerRefs.workspace} className={`${styles.dropdownTrigger}${activeDropdown === "workspace" ? " " + styles.open : ""}`}
					onClick={() => toggleDropdown("workspace")} aria-expanded={activeDropdown === "workspace"} aria-haspopup="listbox"
					aria-label={t("systemMenu.workspace.dropdownLabel") ?? "Workspace options"}>
					<span className={styles.currentWorkspace}>{currentWorkspaceName || (t("systemMenu.workspace.untitled") ?? "Untitled")}</span>
					<span className={styles.dropdownArrow}>▼</span>
				</button>,
				activeDropdown === "workspace",
				<div role="listbox" aria-label={t("systemMenu.workspace.dropdownLabel") ?? "Workspace options"}>
					<div className={styles.workspaceInfo}>
						<span className={styles.workspaceLabel}>{t("systemMenu.workspace.current") ?? "Current:"}</span>
						<span className={styles.workspaceName}>{currentWorkspaceName || (t("systemMenu.workspace.untitled") ?? "Untitled")}</span>
					</div>
					<div className={styles.dropdownDivider} />
					{showNewWorkspaceInput ? (
						<div className={styles.newWorkspaceInput}>
							<input type="text" value={newWorkspaceName} onChange={e => setNewWorkspaceName(e.target.value)}
								onKeyDown={e => { if (e.key === "Enter") handleSaveWorkspace(); else if (e.key === "Escape") setShowNewWorkspaceInput(false); }}
								placeholder={t("systemMenu.workspace.newPlaceholder") ?? "Enter workspace name..."} autoFocus className={styles.input} />
							<div className={styles.inputActions}>
								<button className={styles.buttonPrimary} onClick={handleSaveWorkspace}>{t("systemMenu.workspace.save") ?? "Save"}</button>
								<button className={styles.buttonSecondary} onClick={() => setShowNewWorkspaceInput(false)}>{t("systemMenu.workspace.cancel") ?? "Cancel"}</button>
							</div>
						</div>
					) : (
						DI(<><span className={styles.dropdownItemIcon}>+</span><span>{t("systemMenu.workspace.new") ?? "New Workspace"}</span></>, () => setShowNewWorkspaceInput(true))
					)}
					<div className={styles.dropdownDivider} />
					{workspaces.map(ws => (
						<div key={ws.id} className={styles.workspaceItem}>
							{DI(<><span className={styles.workspaceItemName}>{ws.name}</span>{ws.id === currentWorkspaceId && <span className={styles.activeIndicator}>✓</span>}</>, () => onLoadWorkspace(ws.id), ws.id === currentWorkspaceId)}
							<div className={styles.workspaceActions}>
								<button className={styles.actionButton} onClick={() => handleExportWorkspace(ws.id)} aria-label={t("systemMenu.workspace.export") ?? "Export"} title={t("systemMenu.workspace.export") ?? "Export"}>↓</button>
								<button className={styles.actionButton} onClick={() => handleDeleteWorkspace(ws.id)} aria-label={t("systemMenu.workspace.delete") ?? "Delete"} title={t("systemMenu.workspace.delete") ?? "Delete"}><IconTrash size={13} /></button>
							</div>
						</div>
					))}
					{workspaces.length === 0 && <div className={styles.emptyState}>{t("systemMenu.workspace.empty") ?? "No workspaces saved"}</div>}
					<div className={styles.dropdownDivider} />
					<input ref={fileInputRef} type="file" accept=".json" onChange={handleFileSelect} className={styles.fileInput} style={{ display: "none" }} />
					{DI(<><span className={styles.dropdownItemIcon}>↑</span><span>{t("systemMenu.workspace.import") ?? "Import Workspace"}</span></>, handleImportWorkspace)}
				</div>
			)}

			{/* Layout */}
			{SD(t("systemMenu.layout.title") ?? "Layout",
				<button ref={triggerRefs.layout} className={`${styles.dropdownTrigger}${activeDropdown === "layout" ? " " + styles.open : ""}`}
					onClick={() => toggleDropdown("layout")} aria-expanded={activeDropdown === "layout"} aria-haspopup="listbox"
					aria-label={t("systemMenu.layout.dropdownLabel") ?? "Layout presets"}>
					<span className={styles.currentLayout}>{layoutPresets.find(p => p.id === currentLayoutId)?.name || (t("systemMenu.layout.custom") ?? "Custom")}</span>
					<span className={styles.dropdownArrow}>▼</span>
				</button>,
				activeDropdown === "layout",
				<div role="listbox" aria-label={t("systemMenu.layout.dropdownLabel") ?? "Layout presets"}>
					{layoutPresets.map(preset => (
						DI(<><span>{preset.name}</span>{preset.id === currentLayoutId && <span className={styles.activeIndicator}>✓</span>}</>, () => { onLayoutPresetSelect(preset.id); onClose?.(); }, preset.id === currentLayoutId)
					))}
					<div className={styles.dropdownDivider} />
					{onOpenLayoutDesigner && DI(<><span className={styles.dropdownItemIcon}>✎</span><span>{t("systemMenu.layout.designer") ?? "Layout Designer"}</span></>, () => { onOpenLayoutDesigner(); onClose?.(); })}
				</div>
			)}

			{/* Sync */}
			{SD(t("systemMenu.sync.title") ?? "Synchronization",
				<button ref={triggerRefs.sync} className={`${styles.dropdownTrigger}${activeDropdown === "sync" ? " " + styles.open : ""}`}
					onClick={() => toggleDropdown("sync")} aria-expanded={activeDropdown === "sync"} aria-haspopup="listbox"
					aria-label={t("systemMenu.sync.dropdownLabel") ?? "Sync settings"}>
					<span className={styles.syncStatus}>{Object.values(syncSettings).filter(Boolean).length} / {Object.keys(syncSettings).length}</span>
					<span className={styles.dropdownArrow}>▼</span>
				</button>,
				activeDropdown === "sync",
				<div role="listbox" aria-label={t("systemMenu.sync.dropdownLabel") ?? "Sync settings"}>
					{[
						{ key: "visibleRange", label: t("mobile.syncVisibleRange") },
						{ key: "crosshair", label: t("mobile.crosshair") || t("mobile.syncCrosshair") },
						{ key: "timeframe", label: t("mobile.timeframe") || t("mobile.syncTimeframe") },
						{ key: "chartType", label: t("mobile.chartType") || t("mobile.syncChartType") },
						{ key: "symbolLinks", label: t("mobile.syncSymbolLinks") },
						{ key: "drawings", label: t("mobile.syncDrawings") },
						{ key: "replay", label: t("mobile.syncReplay") },
						{ key: "time", label: t("mobile.syncTime") },
					].map(({ key, label }) => (
						<label key={key} className={styles.syncToggleLabel}>
							<input type="checkbox" checked={syncSettings[key as keyof typeof syncSettings]}
								onChange={() => onSyncToggle(key as keyof typeof syncSettings)} className={styles.syncToggleInput} />
							<span className={styles.syncToggleLabelText}>{label}</span>
						</label>
					))}
				</div>
			)}

			{/* Drawing Tools */}
			{SD(t("systemMenu.drawingTools.title") ?? "Drawing Tools",
				<button ref={triggerRefs.drawingTools} className={`${styles.dropdownTrigger}${activeDropdown === "drawingTools" ? " " + styles.open : ""}`}
					onClick={() => toggleDropdown("drawingTools")} aria-expanded={activeDropdown === "drawingTools"} aria-haspopup="listbox"
					aria-label={t("systemMenu.drawingTools.dropdownLabel") ?? "Drawing tools options"}>
					<span className={styles.syncStatus}>{activeTool ? (t(`tool.${activeTool}`) || activeTool) : (t("systemMenu.drawingTools.none") ?? "None")}</span>
					<span className={styles.dropdownArrow}>▼</span>
				</button>,
				activeDropdown === "drawingTools",
				<div className={`${styles.dropdown} ${styles.drawingToolsSection}`} role="listbox" aria-label={t("systemMenu.drawingTools.dropdownLabel") ?? "Drawing tools options"}>
					{favoriteTools.size > 0 && (
						<div className={styles.drawingToolsSection}>
							<span className={styles.sectionLabel}>{t("toolbar.favorites") ?? "Favorites"}</span>
							<div className={styles.toolGrid} role="group">
								{[...favoriteTools].map(toolId => {
									const toolLabel = t(`tool.${toolId}`) || toolId;
									const toolShortcut = TOOL_SHORTCUT_LABELS[toolId] ?? "";
									return (
										<button key={toolId} className={`${styles.drawingToolButton}${activeTool === toolId ? " " + styles.active : ""}`}
											onClick={() => onToolSelect?.(toolId)} title={toolShortcut ? `${toolLabel} (${toolShortcut})` : toolLabel} aria-pressed={activeTool === toolId}>
											<span className={styles.toolIcon}><ToolGlyph id={toolId} /></span>
											<span className={styles.toolLabel}>{toolLabel}</span>
											{toolShortcut && <span className={styles.toolShortcut}>{toolShortcut}</span>}
											<span className={`${styles.favoriteStar} ${styles.active}`} onClick={e => { e.stopPropagation(); toggleFavorite(toolId); }}>★</span>
										</button>
									);
								})}
							</div>
						</div>
					)}
					{TOOL_GROUPS_V2.map(group => {
						const groupLabel = t(group.labelKey) || group.id;
						return (
							<div key={group.id} className={styles.drawingToolsSection}>
								<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 10px 4px 0' }}>
									<span className={styles.sectionLabel}>{groupLabel}</span>
									<button className={`${styles.dropdownTrigger}${expandedGroup === group.id ? " " + styles.open : ""}`}
										onClick={() => setExpandedGroup(expandedGroup === group.id ? null : group.id)} style={{ padding: '2px 6px', fontSize: '10px' }}>
										{expandedGroup === group.id ? "▲" : "▼"}
									</button>
								</div>
								{expandedGroup === group.id && (
									<div className={styles.toolGrid} role="group">
										{group.tools.map(toolId => {
											const toolLabel = t(`tool.${toolId}`) || toolId;
											const toolShortcut = TOOL_SHORTCUT_LABELS[toolId] ?? "";
											return (
												<button key={toolId} className={`${styles.drawingToolButton}${activeTool === toolId ? " " + styles.active : ""}`}
													onClick={() => onToolSelect?.(toolId)} title={toolShortcut ? `${toolLabel} (${toolShortcut})` : toolLabel} aria-pressed={activeTool === toolId}>
													<span className={styles.toolIcon}><ToolGlyph id={toolId} /></span>
													<span className={styles.toolLabel}>{toolLabel}</span>
													{toolShortcut && <span className={styles.toolShortcut}>{toolShortcut}</span>}
													<span className={`${styles.favoriteStar}${favoriteTools.has(toolId) ? " " + styles.active : ""}`}
														onClick={e => { e.stopPropagation(); toggleFavorite(toolId); }}>★</span>
												</button>
											);
										})}
									</div>
								)}
							</div>
						);
					})}
					<div className={styles.drawingToolsExtras}>
						<div className={styles.extraControls}>
							<button onClick={() => { onUndo?.(); onClose?.(); }} disabled={!canUndo} title={t("toolbar.undo") ?? "Undo (Ctrl+Z)"}><span><IconUndo size={12} /></span><span>{t("toolbar.undo") ?? "Undo"}</span></button>
							<button onClick={() => { onRedo?.(); onClose?.(); }} disabled={!canRedo} title={t("toolbar.redo") ?? "Redo (Ctrl+Y)"}><span><IconRedo size={12} /></span><span>{t("toolbar.redo") ?? "Redo"}</span></button>
						</div>
						<div className={styles.extraControls}>
							<button className={styles.clearAllBtn} onClick={() => { onClearAll?.(); onClose?.(); }} title={t("toolbar.clearAll") ?? "Clear All Drawings"}><span><IconTrash size={13} /></span><span>{t("toolbar.clearAll") ?? "Clear All"}</span></button>
						</div>
					</div>
				</div>
			)}

			{/* Export */}
			<div className={styles.section}>
				{A(<IconDownload size={14} />, t("systemMenu.export.snapshot") ?? "Export Snapshot", () => { onExportSnapshot(); onClose?.(); })}
				{A(<IconLayoutGrid size={14} />, t("systemMenu.export.data") ?? "Export Data", () => { onExportData(); onClose?.(); })}
			</div>

			{/* Theme */}
			{S(t("systemMenu.theme.title") ?? "Theme",
				<div className={styles.themeGrid}>
					{THEME_OPTIONS.map(opt => (
						<button key={opt.id} className={`${styles.themeGridItem}${currentTheme === opt.id ? " " + styles.themeGridItemActive : ""}`}
							onClick={() => { onThemeChange?.(opt.id); onClose?.(); }} aria-pressed={currentTheme === opt.id}>
							<span className={styles.themeSwatch} style={{ background: opt.swatch }} />
							<span>{themeLabel(t, locale, opt.id)}</span>
						</button>
					))}
				</div>
			)}

			{/* Settings */}
			<div className={styles.section}>
				{A(<IconSettings size={14} />, t("systemMenu.settings.title") ?? "Settings", () => { onOpenSettings(); onClose?.(); })}
			</div>

			{/* Upgrade */}
			{onUpgradeClick && (
				<div className={styles.section}>
					<button role="menuitem" className={styles.upgradeItem} onClick={() => { onUpgradeClick(); onClose?.(); }}>
						<span className={styles.upgradeIcon}><IconStar size={13} /></span>
						<div className={styles.upgradeContent}>
							<span className={styles.upgradeLabel}>{t("systemMenu.upgrade.title")}</span>
							<span className={styles.upgradeDesc}>{t("systemMenu.upgrade.desc")}</span>
						</div>
					</button>
				</div>
			)}

			{children}
			<ConfirmDialog
				open={!!pendingDelete}
				message={t("systemMenu.workspace.deleteConfirm") ?? "Delete this workspace?"}
				confirmLabel={t("systemMenu.workspace.delete") ?? "Delete"}
				cancelLabel={t("systemMenu.workspace.cancel") ?? "Cancel"}
				variant="danger"
				onConfirm={handleConfirmDelete}
				onCancel={handleCancelDelete}
				portalRoot={portalRoot}
			/>
		</div>
	);

	// ─── Mobile sections (no dropdowns, always expanded) ───────────────────
	const renderMobileContent = () => (
		<div className={styles.mobileContent}>
			{/* Context indicator */}
			<div className={styles.contextIndicator} data-context={activeTarget}>
				<span className={styles.contextDot} />
				<span>{activeTarget === "workspace" ? t("systemMenu.context.workspace") : t("systemMenu.context.chart")}</span>
			</div>

			{/* Workspace */}
			<div className={styles.section}>
				<div className={styles.sectionHeader}><span className={styles.sectionTitle}>{t("systemMenu.workspace.title") ?? "Workspace"}</span></div>
				<button className={styles.mobileActionRow} onClick={handleSaveWorkspace} style={{ color: "var(--vnsc-accent, #22d3ee)" }}>
					<span><IconSave size={13} /></span><span>{t("systemMenu.workspace.save")}</span>
				</button>
				{showNewWorkspaceInput ? (
					<div className={styles.newWorkspaceInput}>
						<input type="text" value={newWorkspaceName} onChange={e => setNewWorkspaceName(e.target.value)}
							onKeyDown={e => { if (e.key === "Enter") handleSaveWorkspace(); else if (e.key === "Escape") setShowNewWorkspaceInput(false); }}
							placeholder={t("systemMenu.workspace.newPlaceholder") ?? "Enter workspace name..."} autoFocus className={styles.input} />
						<div className={styles.inputActions}>
							<button className={styles.buttonPrimary} onClick={handleSaveWorkspace}>{t("systemMenu.workspace.save") ?? "Save"}</button>
							<button className={styles.buttonSecondary} onClick={() => setShowNewWorkspaceInput(false)}>{t("systemMenu.workspace.cancel") ?? "Cancel"}</button>
						</div>
					</div>
				) : (
					<button className={styles.mobileActionRow} onClick={() => setShowNewWorkspaceInput(true)}>
						<span>+</span><span>{t("systemMenu.workspace.new") ?? "New Workspace"}</span>
					</button>
				)}
				{workspaces.map(ws => (
					<div key={ws.id} className={styles.mobileActionRow}>
						<button className={styles.mobileActionRowMain} onClick={() => { onLoadWorkspace(ws.id); onClose?.(); }}>
							<span>{ws.name}{ws.id === currentWorkspaceId ? ` ✓` : ""}</span>
						</button>
						<button className={styles.actionButton} onClick={() => handleExportWorkspace(ws.id)} aria-label={t("systemMenu.workspace.export") ?? "Export"} title={t("systemMenu.workspace.export") ?? "Export"}>↓</button>
						<button className={styles.actionButton} onClick={() => handleDeleteWorkspace(ws.id)} aria-label={t("systemMenu.workspace.delete") ?? "Delete"} title={t("systemMenu.workspace.delete") ?? "Delete"}><IconTrash size={13} /></button>
					</div>
				))}
				{workspaces.length === 0 && <div className={styles.emptyState}>{t("systemMenu.workspace.empty") ?? "No workspaces saved"}</div>}
				<input ref={fileInputRef} type="file" accept=".json" onChange={handleFileSelect} className={styles.fileInput} style={{ display: "none" }} />
				<button className={styles.mobileActionRow} onClick={handleImportWorkspace}>
					<span>↑</span><span>{t("systemMenu.workspace.import") ?? "Import Workspace"}</span>
				</button>
			</div>

			{/* Layout Presets & Grid Selector */}
			<div className={styles.section}>
				<div className={styles.sectionHeader}><span className={styles.sectionTitle}>{t("mobile.layout")}</span></div>
				{layout && onLayoutChange && (
					<div className={styles.layoutGridCompact} style={{ marginBottom: "12px" }}>
						{[
							{ rows: 1, cols: 1, label: "1x1" },
							{ rows: 1, cols: 2, label: "1x2" },
							{ rows: 2, cols: 1, label: "2x1" },
							{ rows: 2, cols: 2, label: "2x2" },
							{ rows: 1, cols: 3, label: "1x3" },
							{ rows: 3, cols: 1, label: "3x1" },
						].map((tmpl) => {
							const isActive = layout.rows === tmpl.rows && layout.cols === tmpl.cols;
							return (
								<button
									key={tmpl.label}
									type="button"
									className={`${styles.gridItemCompact} ${isActive ? styles.active : ""}`}
									onClick={() => {
										onLayoutChange({ rows: tmpl.rows, cols: tmpl.cols });
										onClose?.();
									}}
								>
									{tmpl.label}
								</button>
							);
						})}
					</div>
				)}
				{layoutPresets.map(preset => (
					<button key={preset.id} className={`${styles.mobileActionRow}${preset.id === currentLayoutId ? " " + styles.active : ""}`}
						onClick={() => { onLayoutPresetSelect(preset.id); onClose?.(); }}>
						<span>{preset.name}</span>{preset.id === currentLayoutId && <span className={styles.activeIndicator}>✓</span>}
					</button>
				))}
				{onOpenLayoutDesigner && (
					<button className={styles.mobileActionRow} onClick={() => { onOpenLayoutDesigner(); onClose?.(); }}>
						<span>✎</span><span>{t("systemMenu.layout.designer") ?? "Layout Designer"}</span>
					</button>
				)}
			</div>

			{/* Sync Settings */}
			<div className={styles.section}>
				<div className={styles.sectionHeader}><span className={styles.sectionTitle}>{t("mobile.sync")}</span></div>
				<div className={styles.syncOptionsCompactMobile}>
					{[
						{ key: "visibleRange", label: t("mobile.syncVisibleRange") },
						{ key: "crosshair", label: t("mobile.crosshair") || t("mobile.syncCrosshair") },
						{ key: "timeframe", label: t("mobile.timeframe") || t("mobile.syncTimeframe") },
						{ key: "chartType", label: t("mobile.chartType") || t("mobile.syncChartType") },
						{ key: "symbolLinks", label: t("mobile.syncSymbolLinks") },
						{ key: "drawings", label: t("mobile.syncDrawings") },
						{ key: "replay", label: t("mobile.syncReplay") },
						{ key: "time", label: t("mobile.syncTime") },
					].map(({ key, label }) => (
						<label key={key} className={styles.syncOptionMobile}>
							<input
								type="checkbox"
								checked={syncSettings[key as keyof typeof syncSettings]}
								onChange={() => onSyncToggle(key as keyof typeof syncSettings)}
								className={styles.syncCheckboxMobile}
							/>
							<span className={styles.syncLabelTextMobile}>{label}</span>
						</label>
					))}
				</div>
			</div>

			{/* Chart Actions (Tác vụ biểu đồ) */}
			<div className={styles.section}>
				<div className={styles.sectionHeader}><span className={styles.sectionTitle}>{t("mobile.chartActions")}</span></div>
				<div className={styles.drawingToolsExtras} style={{ marginTop: 0 }}>
					<div className={styles.extraControls}>
						<button onClick={() => { onUndo?.(); onClose?.(); }} disabled={!canUndo} title={t("toolbar.undo") ?? "Undo"}><span><IconUndo size={12} /></span><span>{t("toolbar.undo") ?? "Undo"}</span></button>
						<button onClick={() => { onRedo?.(); onClose?.(); }} disabled={!canRedo} title={t("toolbar.redo") ?? "Redo"}><span><IconRedo size={12} /></span><span>{t("toolbar.redo") ?? "Redo"}</span></button>
					</div>
					<div className={styles.extraControls}>
						<button className={styles.clearAllBtn} onClick={() => { onClearAll?.(); onClose?.(); }} title={t("toolbar.clearAll") ?? "Clear All"}><span><IconTrash size={13} /></span><span>{t("toolbar.clearAll") ?? "Clear All"}</span></button>
					</div>
				</div>
			</div>

			{/* Export */}
			<div className={styles.section}>
				<div className={styles.sectionHeader}><span className={styles.sectionTitle}>{t("systemMenu.export.title") ?? "Export"}</span></div>
				{A(<IconDownload size={14} />, t("systemMenu.export.snapshot") ?? "Export Snapshot", () => { onExportSnapshot(); onClose?.(); })}
				{A(<IconLayoutGrid size={14} />, t("systemMenu.export.data") ?? "Export Data", () => { onExportData(); onClose?.(); })}
			</div>

			{/* Theme */}
			<div className={styles.section}>
				<div className={styles.sectionHeader}><span className={styles.sectionTitle}>{t("systemMenu.theme.title") ?? "Theme"}</span></div>
				<div className={styles.themeGrid}>
					{THEME_OPTIONS.map(opt => (
						<button key={opt.id} className={`${styles.themeGridItem}${currentTheme === opt.id ? " " + styles.themeGridItemActive : ""}`}
							onClick={() => { onThemeChange?.(opt.id); onClose?.(); }} aria-pressed={currentTheme === opt.id}>
							<span className={styles.themeSwatch} style={{ background: opt.swatch }} />
							<span>{themeLabel(t, locale, opt.id)}</span>
						</button>
					))}
				</div>
			</div>

			{/* Settings */}
			<div className={styles.section}>
				<button className={styles.mobileActionRow} onClick={() => { onOpenSettings(); onClose?.(); }}>
					<span><IconSettings size={13} /></span><span>{t("systemMenu.settings.title") ?? "Settings"}</span>
				</button>
			</div>

			{/* Upgrade */}
			{onUpgradeClick && (
				<div className={styles.section}>
					<button className={styles.upgradeItem} onClick={() => { onUpgradeClick(); onClose?.(); }}>
						<span className={styles.upgradeIcon}><IconStar size={13} /></span>
						<div className={styles.upgradeContent}>
							<span className={styles.upgradeLabel}>{t("systemMenu.upgrade.title")}</span>
							<span className={styles.upgradeDesc}>{t("systemMenu.upgrade.desc")}</span>
						</div>
					</button>
				</div>
			)}

			{children}
		</div>
	);

	// ─── Bottomsheet (mobile) ──────────────────────────────────────────
	if (isMobile) {
		const mountTarget = portalRoot || (typeof document !== "undefined" ? document.body : null);
		if (!mountTarget) return null;
		return createPortal(
			<div className={styles.mobileOverlay} onClick={() => onClose?.()}>
				<div ref={sheetRef} className={styles.mobileBottomSheet} style={{ transform: `translateY(${dragY}px)` }}
					onClick={e => e.stopPropagation()}>
					<div className={styles.mobileHandleBarContainer} onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
						<div className={styles.mobileHandleBar} />
					</div>
					{renderMobileContent()}
					<ConfirmDialog
						open={!!pendingDelete}
						message={t("systemMenu.workspace.deleteConfirm") ?? "Delete this workspace?"}
						confirmLabel={t("systemMenu.workspace.delete") ?? "Delete"}
						cancelLabel={t("systemMenu.workspace.cancel") ?? "Cancel"}
						variant="danger"
						onConfirm={handleConfirmDelete}
						onCancel={handleCancelDelete}
						portalRoot={portalRoot}
					/>
				</div>
			</div>,
			mountTarget
		);
	}

	// ─── Dropdown (desktop) ───────────────────────────────────────────
	return renderDesktopContent();
};

SystemMenu.displayName = "SystemMenu";
export default SystemMenu;
