import { useCallback, useMemo, useState } from "react";
import { formatWithTimezone } from "../../../lib/utils/timezoneFormatter";
import type { DrawingObject, DrawingToolType } from "@vninvestcharts/engine-drawing";
import { LIST_COLLAPSED_KEY } from "@vninvestcharts/engine-drawing";

const STORAGE_KEY = LIST_COLLAPSED_KEY;

export interface DrawingListPanelLabels {
	title: string;
	empty: string;
	visible: string;
	hidden: string;
	locked: string;
	unlocked: string;
	selected: string;
	delete: string;
	/** Optional search input placeholder; renders a search box when provided. */
	search?: string;
	/** CE25: Bulk operations */
	bulkDelete?: string;
	bulkGroup?: string;
	bulkLock?: string;
	bulkUnlock?: string;
	bulkHide?: string;
	bulkShow?: string;
	groupBy?: string;
	groupByType?: string;
	groupByGroupId?: string;
	selectAll?: string;
	deselectAll?: string;
}

export interface DrawingListPanelProps {
	drawings: DrawingObject[];
	selectedId: string | null;
	labels: DrawingListPanelLabels;
	embedded?: boolean;
	position?: { x: number; y: number };
	onSelect: (id: string) => void;
	onToggleVisible: (id: string) => void;
	onToggleLocked: (id: string) => void;
	onDelete: (id: string) => void;
	/** GAP-10: Optional callback to reorder drawings (enables drag-and-drop). */
	onReorderDrawings?: (reorderedDrawings: DrawingObject[]) => void;
	/** CE25: Bulk operations */
	selectedIds?: Set<string>;
	onSelectMultiple?: (ids: Set<string>) => void;
	onBulkDelete?: (ids: string[]) => void;
	onBulkGroup?: (ids: string[], groupId: string) => void;
	onBulkLock?: (ids: string[], locked: boolean) => void;
	onBulkHide?: (ids: string[], hidden: boolean) => void;
	/** P1.3: Inline rename callback */
	onRename?: (id: string, label: string) => void;
	/** P1.4: Z-order callbacks */
	onBringToFront?: (id: string) => void;
	onSendToBack?: (id: string) => void;
	/** P1.4: Z-order labels */
	bringToFrontLabel?: string;
	sendToBackLabel?: string;
}

export function generateDrawingLabel(drawing: DrawingObject, t?: (key: string) => string): string {
	if (drawing.label?.trim()) {
		return drawing.label.trim();
	}
	const key = `tool.${drawing.type}`;
	const v = t?.(key);
	if (v && v !== key) return v;
	return drawing.type;
}

const LINE_TOOLS = new Set(["trendLine", "ray", "extendedLine", "hLine", "vLine", "arrow", "crossLine", "infoLine", "trendAngle", "anchoredVwap"]);
const FIB_TOOLS = new Set(["fibonacci", "fibExtension", "fibArc", "fibTimeZone", "fibChannel", "fibSpeedResistanceFan", "trendBasedFibTime", "fibCircles", "fibSpiral", "fibSpeedResistanceArcs", "fibWedge"]);
const CHANNEL_TOOLS = new Set(["channel", "parallelChannel", "regressionChannel", "disjointChannel", "flatTopBottom", "pitchfork", "schiffPitchfork", "modifiedSchiff", "insidePitchfork", "pitchfan"]);
const PATTERN_TOOLS = new Set(["elliottImpulse", "elliottCorrection", "elliottTriangle", "elliottDoubleCombo", "elliottTripleCombo", "xabcdPattern", "cypherPattern", "headAndShoulders", "trianglePattern", "threeDrivesPattern", "abcdPattern"]);
const GANN_TOOLS = new Set(["gannFan", "gannBox", "gannSquareFixed", "gannSquare", "gannFixed"]);
const SHAPE_TOOLS = new Set(["rectangle", "polyline", "polygon", "rotatedRectangle", "circle", "ellipse", "triangle"]);
const TEXT_TOOLS = new Set(["text", "callout", "priceLabel"]);
const POSITION_TOOLS = new Set(["longPosition", "shortPosition"]);
const MEASURE_TOOLS = new Set(["dateAndPriceRange", "priceRange", "dateRange", "barsCount", "datePriceRange"]);
const BRUSH_TOOLS = new Set(["brush", "highlighter", "eraser", "curve", "arc", "path"]);
const CYCLE_TOOLS = new Set(["cyclicLines", "timeCycles", "sineLine"]);
const PATTERN_DRAW_TOOLS = new Set(["ghostFeed", "barsPattern", "iconMarker"]);

function getDrawingCategoryIcon(type: DrawingToolType): string {
	if (LINE_TOOLS.has(type)) return "╱";
	if (FIB_TOOLS.has(type)) return "≡";
	if (CHANNEL_TOOLS.has(type)) return "⫽";
	if (PATTERN_TOOLS.has(type)) return "∿";
	if (GANN_TOOLS.has(type)) return "⊞";
	if (SHAPE_TOOLS.has(type)) return "▭";
	if (TEXT_TOOLS.has(type)) return "T";
	if (POSITION_TOOLS.has(type)) return "⇄";
	if (MEASURE_TOOLS.has(type)) return "↔";
	if (BRUSH_TOOLS.has(type)) return "✐";
	if (CYCLE_TOOLS.has(type)) return "◎";
	if (PATTERN_DRAW_TOOLS.has(type)) return "▦";
	return "·";
}

/** GAP-10: Filter drawings by case-insensitive match on tool label or custom label. */
export function filterDrawings(drawings: DrawingObject[], query: string, t?: (key: string) => string): DrawingObject[] {
	const q = query.trim().toLowerCase();
	if (!q) return drawings;
	return drawings.filter((d) => {
		const toolLabel = generateDrawingLabel(d, t).toLowerCase();
		const rawType = d.type.toLowerCase();
		const customLabel = (d.label ?? "").toLowerCase();
		return toolLabel.includes(q) || rawType.includes(q) || customLabel.includes(q);
	});
}

/** GAP-10: Immutably reorder drawings by moving fromId to the position of toId. */
export function reorderDrawings(drawings: DrawingObject[], fromId: string, toId: string): DrawingObject[] {
	const fromIdx = drawings.findIndex((d) => d.id === fromId);
	const toIdx = drawings.findIndex((d) => d.id === toId);
	if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return drawings;
	const result = [...drawings];
	const [item] = result.splice(fromIdx, 1);
	result.splice(toIdx, 0, item);
	return result;
}

function formatTimestamp(timestamp: number) {
	try {
		return formatWithTimezone(timestamp, {
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
		});
	} catch {
		return new Date(timestamp).toISOString();
	}
}

function loadCollapsedGroups(): Set<string> {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) {
			return new Set();
		}
		const parsed: unknown = JSON.parse(raw);
		if (Array.isArray(parsed)) {
			return new Set(parsed.filter((v): v is string => typeof v === "string"));
		}
	} catch {
		// ignore
	}
	return new Set();
}

function saveCollapsedGroups(groups: Set<string>) {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify([...groups]));
	} catch {
		// ignore
	}
}

export default function DrawingListPanel({
	drawings,
	selectedId,
	labels,
	embedded = false,
	position,
	onSelect,
	onToggleVisible,
	onToggleLocked,
	onDelete,
	onReorderDrawings,
	selectedIds: propSelectedIds,
	onSelectMultiple,
	onBulkDelete,
	onBulkGroup,
	onBulkLock,
	onBulkHide,
	onRename,
	onBringToFront,
	onSendToBack,
	bringToFrontLabel = "Bring to Front",
	sendToBackLabel = "Send to Back",
}: DrawingListPanelProps) {
	const left = position?.x ?? 16;
	const top = position?.y ?? 120;

	const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(loadCollapsedGroups);
	const [searchQuery, setSearchQuery] = useState("");
	const [dragFromId, setDragFromId] = useState<string | null>(null);
	const [dragOverId, setDragOverId] = useState<string | null>(null);
	const [groupBy, setGroupBy] = useState<"type" | "groupId">("type");
	const [renamingId, setRenamingId] = useState<string | null>(null);
	const [renameValue, setRenameValue] = useState("");
	const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number } | null>(null);

	const toggleGroup = useCallback((groupType: string) => {
		setCollapsedGroups((prev) => {
			const next = new Set(prev);
			if (next.has(groupType)) {
				next.delete(groupType);
			} else {
				next.add(groupType);
			}
			saveCollapsedGroups(next);
			return next;
		});
	}, []);

	const grouped = useMemo<Map<string, DrawingObject[]>>(() => {
		const map = new Map<string, DrawingObject[]>();
		for (const drawing of drawings) {
			const key = groupBy === "groupId" ? (drawing.groupId ?? "ungrouped") : drawing.type;
			const existing = map.get(key);
			if (existing) {
				existing.push(drawing);
			} else {
				map.set(key, [drawing]);
			}
		}
		return map;
	}, [drawings, groupBy]);

	const isSearching = searchQuery.trim().length > 0;
	const filteredDrawings = useMemo(() => filterDrawings(drawings, searchQuery), [drawings, searchQuery]);
	const displayedCount = isSearching ? filteredDrawings.length : drawings.length;

	const selectedIds = propSelectedIds ?? new Set();
	const isMultiSelect = selectedIds.size > 1;

	const handleSelectAll = () => {
		const allIds = new Set(filteredDrawings.map(d => d.id));
		onSelectMultiple?.(allIds);
	};

	const handleDeselectAll = () => {
		onSelectMultiple?.(new Set());
	};

	const handleBulkDelete = () => {
		const ids = Array.from(selectedIds);
		if (ids.length > 0) {
			onBulkDelete?.(ids);
			onSelectMultiple?.(new Set());
		}
	};

	const handleBulkGroup = () => {
		const ids = Array.from(selectedIds);
		if (ids.length > 0) {
			const groupId = `group_${Date.now()}`;
			onBulkGroup?.(ids, groupId);
			onSelectMultiple?.(new Set());
		}
	};

	const handleBulkLock = (locked: boolean) => {
		const ids = Array.from(selectedIds);
		if (ids.length > 0) {
			onBulkLock?.(ids, locked);
			onSelectMultiple?.(new Set());
		}
	};

	const handleBulkHide = (hidden: boolean) => {
		const ids = Array.from(selectedIds);
		if (ids.length > 0) {
			onBulkHide?.(ids, hidden);
			onSelectMultiple?.(new Set());
		}
	};

	const renderDrawingItem = (drawing: DrawingObject) => {
		const isSelected = drawing.id === selectedId;
		const isMultiSelected = selectedIds.has(drawing.id);
		const isHidden = drawing.visible === false;
		const isLocked = drawing.locked === true;
		const isDragOver = dragOverId === drawing.id && dragFromId !== drawing.id;
		return (
			<div
				key={drawing.id}
				className={`vnsc-drawing-list-panel__item${isSelected ? " vnsc-drawing-list-panel__item--selected" : ""}${isMultiSelected ? " vnsc-drawing-list-panel__item--multi-selected" : ""}${isHidden ? " vnsc-drawing-list-panel__item--hidden" : ""}${isDragOver ? " vnsc-drawing-list-panel__item--drag-over" : ""}`}
				draggable={!!onReorderDrawings}
				onDragStart={onReorderDrawings ? (e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", drawing.id); setDragFromId(drawing.id); } : undefined}
				onDragOver={onReorderDrawings ? (e) => { e.preventDefault(); setDragOverId(drawing.id); } : undefined}
				onDrop={onReorderDrawings ? (e) => { e.preventDefault(); const fromId = e.dataTransfer.getData("text/plain"); if (fromId && fromId !== drawing.id) { onReorderDrawings(reorderDrawings(drawings, fromId, drawing.id)); } setDragFromId(null); setDragOverId(null); } : undefined}
				onDragEnd={onReorderDrawings ? () => { setDragFromId(null); setDragOverId(null); } : undefined}
				onContextMenu={(onBringToFront || onSendToBack) ? (e) => { e.preventDefault(); setContextMenu({ id: drawing.id, x: e.clientX, y: e.clientY }); } : undefined}
			>
				<div style={{ display: "flex", alignItems: "center", width: "100%" }}>
					{isMultiSelect && (
						<input
							type="checkbox"
							checked={isMultiSelected}
							onChange={(e) => {
								const next = new Set(selectedIds);
								if (e.target.checked) {
									next.add(drawing.id);
								} else {
									next.delete(drawing.id);
								}
								onSelectMultiple?.(next);
							}}
							onClick={(e) => e.stopPropagation()}
							style={{ marginRight: 8 }}
						/>
					)}
					<button type="button" className="vnsc-drawing-list-panel__select" onClick={() => onSelect(drawing.id)} style={{ flex: 1, textAlign: "left", display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
						<span style={{ display: "inline-flex", alignItems: "center", gap: 4, minWidth: 0, flex: 1 }}>
							<span title={getDrawingCategoryIcon(drawing.type)} style={{ fontSize: 11, color: "var(--vnsc-text-secondary, #a0a0a0)", flexShrink: 0, width: 14, textAlign: "center" }}>{getDrawingCategoryIcon(drawing.type)}</span>
							<span style={{ width: 10, height: 10, borderRadius: "50%", background: drawing.style?.stroke, flexShrink: 0, border: "1px solid rgba(255,255,255,0.15)" }} />
							{renamingId === drawing.id ? (
								<input
									type="text"
									value={renameValue}
									autoFocus
									style={{ flex: 1, minWidth: 0, fontSize: 12, padding: "1px 4px", background: "var(--vnsc-bg-primary, #0a0e14)", border: "1px solid var(--vnsc-accent, #2962ff)", borderRadius: 3, color: "var(--vnsc-text-primary, #e0e0e0)", outline: "none" }}
									onChange={(e) => setRenameValue(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === "Enter") {
											onRename?.(drawing.id, renameValue.trim() || generateDrawingLabel(drawing));
											setRenamingId(null);
										} else if (e.key === "Escape") {
											setRenamingId(null);
										}
									}}
									onBlur={() => {
										onRename?.(drawing.id, renameValue.trim() || generateDrawingLabel(drawing));
										setRenamingId(null);
									}}
									onClick={(e) => e.stopPropagation()}
								/>
							) : (
								<span
									className="vnsc-drawing-list-panel__label"
									style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: onRename ? "text" : undefined }}
									onDoubleClick={(e) => {
										e.stopPropagation();
										if (onRename) {
											setRenamingId(drawing.id);
											setRenameValue(drawing.label?.trim() || generateDrawingLabel(drawing));
										}
									}}
								>{generateDrawingLabel(drawing)}</span>
							)}
						</span>
						<span className="vnsc-drawing-list-panel__meta">{formatTimestamp(drawing.createdAt)}</span>
					</button>
					<div className="vnsc-drawing-list-panel__actions">
						{isSelected && <span className="vnsc-drawing-list-panel__badge vnsc-drawing-list-panel__badge--selected">{labels.selected}</span>}
						<button
							type="button"
							className={`vnsc-drawing-list-panel__icon${isHidden ? " vnsc-drawing-list-panel__icon--active" : ""}`}
							title={isHidden ? labels.visible : labels.hidden}
							onClick={() => onToggleVisible(drawing.id)}
						>
							{isHidden ? "👁️" : "◉"}
						</button>
						<button
							type="button"
							className={`vnsc-drawing-list-panel__icon${isLocked ? " vnsc-drawing-list-panel__icon--active" : ""}`}
							title={isLocked ? labels.unlocked : labels.locked}
							onClick={() => onToggleLocked(drawing.id)}
						>
							{isLocked ? "🔒" : "🔓"}
						</button>
						<button
							type="button"
							className="vnsc-drawing-list-panel__icon vnsc-drawing-list-panel__icon--delete"
							title={labels.delete}
							onClick={() => onDelete(drawing.id)}
							disabled={isLocked}
						>
							×
						</button>
					</div>
				</div>
			</div>
		);
	};

	return (<>
		<div className={`vnsc-drawing-list-panel${embedded ? " vnsc-drawing-list-panel--embedded" : ""}`} style={embedded ? undefined : { left, top }} onClick={() => setContextMenu(null)}>
			<div className="vnsc-drawing-list-panel__header">
				<strong>{labels.title}</strong>
				<span className="vnsc-drawing-list-panel__count">{displayedCount}</span>
			</div>
			{labels.search !== undefined && (
				<div className="vnsc-drawing-list-panel__search">
					<input
						type="search"
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						placeholder={labels.search}
						className="vnsc-drawing-list-panel__search-input"
					/>
				</div>
			)}
			{isMultiSelect && (
				<div className="vnsc-drawing-list-panel__bulk-toolbar" style={{ display: "flex", gap: 8, padding: "8px 0", borderBottom: "1px solid var(--gc-border)", flexWrap: "wrap" }}>
					<span style={{ fontSize: 12, color: "var(--gc-text-muted)", alignSelf: "center" }}>
						{selectedIds.size} {labels.selected}
					</span>
					<button type="button" className="vnsc-btn vnsc-btn--ghost" onClick={handleSelectAll} style={{ fontSize: 11 }}>
						{labels.selectAll}
					</button>
					<button type="button" className="vnsc-btn vnsc-btn--ghost" onClick={handleDeselectAll} style={{ fontSize: 11 }}>
						{labels.deselectAll}
					</button>
					<button type="button" className="vnsc-btn vnsc-btn--danger" onClick={handleBulkDelete} style={{ fontSize: 11 }}>
						{labels.bulkDelete}
					</button>
					<button type="button" className="vnsc-btn vnsc-btn--ghost" onClick={handleBulkGroup} style={{ fontSize: 11 }}>
						{labels.bulkGroup}
					</button>
					<button type="button" className="vnsc-btn vnsc-btn--ghost" onClick={() => handleBulkLock(true)} style={{ fontSize: 11 }}>
						{labels.bulkLock}
					</button>
					<button type="button" className="vnsc-btn vnsc-btn--ghost" onClick={() => handleBulkLock(false)} style={{ fontSize: 11 }}>
						{labels.bulkUnlock}
					</button>
					<button type="button" className="vnsc-btn vnsc-btn--ghost" onClick={() => handleBulkHide(true)} style={{ fontSize: 11 }}>
						{labels.bulkHide}
					</button>
					<button type="button" className="vnsc-btn vnsc-btn--ghost" onClick={() => handleBulkHide(false)} style={{ fontSize: 11 }}>
						{labels.bulkShow}
					</button>
				</div>
			)}
			<div className="vnsc-drawing-list-panel__group-by" style={{ display: "flex", gap: 8, padding: "8px 0", borderBottom: "1px solid var(--gc-border)", flexWrap: "wrap", alignItems: "center" }}>
				<label style={{ fontSize: 12, color: "var(--gc-text-muted)" }}>
					{labels.groupBy}
					<select
						value={groupBy}
						onChange={(e) => setGroupBy(e.target.value as "type" | "groupId")}
						style={{ marginLeft: 8, fontSize: 11, padding: "2px 6px", borderRadius: 4, border: "1px solid var(--gc-border)", background: "var(--gc-surface)" }}
					>
						<option value="type">{labels.groupByType}</option>
						<option value="groupId">{labels.groupByGroupId}</option>
					</select>
				</label>
			</div>
			{displayedCount === 0 ? (
				<div className="vnsc-drawing-list-panel__empty">{labels.empty}</div>
			) : isSearching ? (
				<div className="vnsc-drawing-list-panel__items">
					{filteredDrawings.map(renderDrawingItem)}
				</div>
			) : (
				<div className="vnsc-drawing-list-panel__items">
					{[...grouped.entries()].map(([groupKey, groupDrawings]) => {
						const isCollapsed = collapsedGroups.has(groupKey);
						const groupLabel = groupBy === "groupId" && groupKey !== "ungrouped"
							? `Group: ${groupKey}`
							: groupKey;
						return (
							<div key={groupKey} className="vnsc-drawing-list-panel__group">
								<button
									type="button"
									className="vnsc-drawing-list-panel__group-header"
									onClick={() => toggleGroup(groupKey)}
									aria-expanded={!isCollapsed}
								>
									<span className="vnsc-drawing-list-panel__group-caret">{isCollapsed ? "▶" : "▼"}</span>
									<span className="vnsc-drawing-list-panel__group-name">{groupLabel}</span>
									<span className="vnsc-drawing-list-panel__group-count">{groupDrawings.length}</span>
								</button>
								{!isCollapsed && groupDrawings.map(renderDrawingItem)}
							</div>
						);
					})}
				</div>
			)}
		</div>
		{/* P5: scrim renders BEFORE the menu so the shared maximum token keeps
		the menu clickable by paint order (previously 10000 vs 10001). */}
		{contextMenu && (
			<div style={{ position: "fixed", inset: 0, zIndex: "var(--vnsc-z-maximum, 9999)" }} onClick={() => setContextMenu(null)} />
		)}
		{contextMenu && (onBringToFront || onSendToBack) && (
			<div
				style={{ position: "fixed", left: contextMenu.x, top: contextMenu.y, zIndex: "var(--vnsc-z-maximum, 9999)", background: "var(--vnsc-bg-primary, #0a0e14)", border: "1px solid var(--vnsc-border, #2a2a2a)", borderRadius: 6, boxShadow: "0 8px 32px rgba(0,0,0,0.4)", padding: "4px 0", minWidth: 140 }}
				onContextMenu={(e) => e.preventDefault()}
			>
				<button type="button" style={{ display: "block", width: "100%", padding: "6px 12px", fontSize: 12, background: "none", border: "none", color: "var(--vnsc-text-primary, #e0e0e0)", cursor: "pointer", textAlign: "left" }}
					onClick={() => { onBringToFront?.(contextMenu.id); setContextMenu(null); }}
				>{bringToFrontLabel}</button>
				<button type="button" style={{ display: "block", width: "100%", padding: "6px 12px", fontSize: 12, background: "none", border: "none", color: "var(--vnsc-text-primary, #e0e0e0)", cursor: "pointer", textAlign: "left" }}
					onClick={() => { onSendToBack?.(contextMenu.id); setContextMenu(null); }}
				>{sendToBackLabel}</button>
			</div>
		)}
	</>);
}
