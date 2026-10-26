// LayoutDesigner - Visual editor for asymmetric grid layouts
// Micro-animations via CSS keyframes (BL-19: framer-motion removed).

import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";

import { GridLayout, SlotConfig, LayoutPreset } from "../grid/types";
import { useWidgetI18n } from "../context/WidgetI18nContext";
import styles from "./LayoutDesigner.module.css";

interface LayoutDesignerProps {
		layout: GridLayout;
		onLayoutChange: (layout: GridLayout) => void;
		/**
		 * P0: trả `false` nếu **chưa lưu được** (storage lỗi/hết quota). `undefined` = không
		 * có handler ⇒ cũng là thất bại. Trước P0 kiểu trả `void` khiến modal đóng dù chưa
		 * lưu gì — dữ liệu người dùng bị nuốt trong im lặng (Rule 15).
		 */
onSaveAsPreset?: (preset: LayoutPreset) => boolean | void;
	/**
	 * P0: danh sách preset đã lưu. Trước đây prop này chỉ tồn tại trong type + default
	 * (`:19`, `:28`) mà **không được render** ⇒ preset lưu được rồi không ai thấy, không
	 * apply, không xoá được. Có `availablePresets` thì phải render.
	 */
	availablePresets?: LayoutPreset[];
	/** Áp dụng preset đã lưu (thay layout hiện tại). */
	onApplyPreset?: (preset: LayoutPreset) => void;
	/** Xoá preset đã lưu. `undefined` ⇒ không hiện nút xoá. */
	onDeletePreset?: (preset: LayoutPreset) => void;
		isOpen: boolean;
		onClose: () => void;
	}

export const LayoutDesigner: React.FC<LayoutDesignerProps> = ({
	layout,
	onLayoutChange,
	onSaveAsPreset,
	availablePresets = [],
	onApplyPreset,
	onDeletePreset,
	isOpen,
	onClose,
}) => {
	const { t } = useWidgetI18n();
	const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
	const [dragState, setDragState] = useState<{
    type: 'resize' | 'move';
    slotId: string;
    startX: number;
    startY: number;
    startRect: DOMRect;
  } | null>(null);
	const [showPresetModal, setShowPresetModal] = useState(false);
	const [presetName, setPresetName] = useState("");
	const containerRef = useRef<HTMLDivElement>(null);

	// Generate grid template areas from layout
	const templateAreas = useMemo(() => {
		if (!layout.templateAreas || layout.templateAreas.length === 0) {
			// Generate default symmetric grid
			return Array(layout.rows).fill(null).map((_, r) =>
				Array(layout.cols).fill(null).map((_, c) => `chart-${r * layout.cols + c + 1}`).join(" ")
			);
		}
		return layout.templateAreas;
	}, [layout.templateAreas, layout.rows, layout.cols]);

	// Get all slots from layout
	const slots = useMemo(() => {
		if (layout.areas) {
			return Object.entries(layout.areas).map(([areaName, slot]) => ({
				...slot,
				areaName,
			}));
		}
		return layout.slots.map((slot, index) => ({
			...slot,
			areaName: `chart-${index + 1}`,
		}));
	}, [layout.areas, layout.slots]);

	// Handle mouse down on slot edge for resizing
	const handleSlotMouseDown = useCallback((e: React.MouseEvent, slot: SlotConfig & { areaName: string }, edge: 'top' | 'right' | 'bottom' | 'left') => {
		e.preventDefault();
		e.stopPropagation();
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		setDragState({
			type: 'resize',
			slotId: slot.id,
			startX: e.clientX,
			startY: e.clientY,
			startRect: rect,
		});
	}, []);

	// Handle mouse down on slot for moving
	const handleSlotMoveMouseDown = useCallback((e: React.MouseEvent, slot: SlotConfig & { areaName: string }) => {
		if (e.target !== e.currentTarget) return;
		e.preventDefault();
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		setDragState({
			type: 'move',
			slotId: slot.id,
			startX: e.clientX,
			startY: e.clientY,
			startRect: rect,
		});
	}, []);

	// Handle global mouse move
	useEffect(() => {
		if (!dragState) return;

		const handleMouseMove = (e: MouseEvent) => {
			const deltaX = e.clientX - dragState.startX;
			const deltaY = e.clientY - dragState.startY;

			// Update layout based on drag
			// This is a simplified version - in practice, you'd calculate new grid positions
		};

		const handleMouseUp = () => {
			setDragState(null);
		};

		window.addEventListener('mousemove', handleMouseMove);
		window.addEventListener('mouseup', handleMouseUp);
		return () => {
			window.removeEventListener('mousemove', handleMouseMove);
			window.removeEventListener('mouseup', handleMouseUp);
		};
	}, [dragState]);

	// Split slot horizontally
	const splitSlotHorizontal = useCallback((slotId: string) => {
		const slot = slots.find(s => s.id === slotId);
		if (!slot) return;

		// Create new layout with split slot
		const newLayout: GridLayout = {
			...layout,
			rows: layout.rows + 1,
			rowSizes: [...layout.rowSizes, '1fr'],
			slots: layout.slots.map(s => {
				if (s.id === slotId) {
					return { ...s, rowEnd: s.rowEnd + 1 };
				}
				if (s.rowStart > slot.rowStart) {
					return { ...s, rowStart: s.rowStart + 1, rowEnd: s.rowEnd + 1 };
				}
				return s;
			}),
		};
		onLayoutChange(newLayout);
	}, [layout, slots, onLayoutChange]);

	// Split slot vertically
	const splitSlotVertical = useCallback((slotId: string) => {
		const slot = slots.find(s => s.id === slotId);
		if (!slot) return;

		const newLayout: GridLayout = {
			...layout,
			cols: layout.cols + 1,
			colSizes: [...layout.colSizes, '1fr'],
			slots: layout.slots.map(s => {
				if (s.id === slotId) {
					return { ...s, colEnd: s.colEnd + 1 };
				}
				if (s.colStart > slot.colStart) {
					return { ...s, colStart: s.colStart + 1, colEnd: s.colEnd + 1 };
				}
				return s;
			}),
		};
		onLayoutChange(newLayout);
	}, [layout, slots, onLayoutChange]);

	// Merge two adjacent slots into one
	const mergeSlots = useCallback((slotId1: string, slotId2: string) => {
		const slot1 = layout.slots.find(s => s.id === slotId1);
		const slot2 = layout.slots.find(s => s.id === slotId2);
		if (!slot1 || !slot2) return;

		// Validate adjacency: same row span OR same col span, borders touching
		const sameRowSpan = slot1.colStart === slot2.colStart && slot1.colEnd === slot2.colEnd;
		const sameColSpan = slot1.rowStart === slot2.rowStart && slot1.rowEnd === slot2.rowEnd;
		const verticallyAdjacent = sameRowSpan && (slot1.rowEnd === slot2.rowStart || slot2.rowEnd === slot1.rowStart);
		const horizontallyAdjacent = sameColSpan && (slot1.colEnd === slot2.colStart || slot2.colEnd === slot1.colStart);
		if (!verticallyAdjacent && !horizontallyAdjacent) return;

		const mergedSlot: SlotConfig = {
			id: slot1.id,
			rowStart: Math.min(slot1.rowStart, slot2.rowStart),
			rowEnd: Math.max(slot1.rowEnd, slot2.rowEnd),
			colStart: Math.min(slot1.colStart, slot2.colStart),
			colEnd: Math.max(slot1.colEnd, slot2.colEnd),
			symbol: slot1.symbol,
			timeframe: slot1.timeframe,
			symbolLinkGroup: slot1.symbolLinkGroup,
			areaName: slot1.areaName,
		};

		const newSlots = layout.slots
			.filter(s => s.id !== slotId2)
			.map(s => s.id === slot1.id ? mergedSlot : s);

		// Rebuild templateAreas from updated slots
		const newTemplateAreas = Array(layout.rows).fill(null).map((_, r) =>
			Array(layout.cols).fill(null).map((_, c) => {
				const match = newSlots.find(s => s.rowStart <= r + 1 && s.rowEnd >= r + 1 && s.colStart <= c + 1 && s.colEnd >= c + 1);
				return match?.areaName ?? '.';
			}).join(' ')
		);

		const newAreas = { ...layout.areas };
		if (slot2.areaName) delete newAreas[slot2.areaName];

		onLayoutChange({
			...layout,
			slots: newSlots,
			templateAreas: newTemplateAreas,
			areas: newAreas,
		});
	}, [layout, onLayoutChange]);

	// Save as preset
	const [presetError, setPresetError] = useState<string | null>(null);
	const handleSavePreset = useCallback(() => {
		if (!presetName.trim()) return;
		const preset: LayoutPreset = {
			id: `preset-${Date.now()}`,
			name: presetName.trim(),
			layout,
			category: 'custom',
		};
		// P0: chỉ đóng modal khi preset **thực sự** được lưu. Không có handler hoặc handler
		// trả false ⇒ giữ modal mở, giữ tên đã gõ, và báo lỗi cho người dùng.
		const saved = onSaveAsPreset?.(preset);
		if (!onSaveAsPreset || saved === false) {
			setPresetError(t('layoutDesigner.savePresetFailed') ?? 'Could not save the preset. Please try again.');
			return;
		}
		setPresetError(null);
		setShowPresetModal(false);
		setPresetName("");
	}, [presetName, layout, onSaveAsPreset, t]);

	// Sync slots/sizes when rows change
	const handleRowsChange = useCallback((newRows: number) => {
		const clamped = Math.max(1, Math.min(10, newRows));
		if (clamped === layout.rows) return;
		const delta = clamped - layout.rows;
		let newSlots = [...layout.slots];
		const newRowSizes = [...layout.rowSizes];

		if (delta > 0) {
			for (let i = 0; i < delta; i++) {
				newRowSizes.push('1fr');
				for (let c = 0; c < layout.cols; c++) {
					const rowIdx = clamped - delta + i;
					const areaName = `chart-${rowIdx * layout.cols + c + 1}`;
					newSlots.push({
						id: areaName,
						rowStart: rowIdx + 1,
						rowEnd: rowIdx + 1,
						colStart: c + 1,
						colEnd: c + 1,
						areaName,
					});
				}
			}
		} else {
			newRowSizes.splice(clamped);
			newSlots = newSlots
				.filter(s => s.rowStart <= clamped)
				.map(s => s.rowEnd > clamped ? { ...s, rowEnd: clamped } : s);
		}

		const newTemplateAreas = Array(clamped).fill(null).map((_, r) =>
			Array(layout.cols).fill(null).map((_, c) => {
				const match = newSlots.find(s => s.rowStart <= r + 1 && s.rowEnd >= r + 1 && s.colStart <= c + 1 && s.colEnd >= c + 1);
				return match?.areaName ?? '.';
			}).join(' ')
		);

		onLayoutChange({ ...layout, rows: clamped, rowSizes: newRowSizes, slots: newSlots, templateAreas: newTemplateAreas });
	}, [layout, onLayoutChange]);

	// Sync slots/sizes when cols change
	const handleColsChange = useCallback((newCols: number) => {
		const clamped = Math.max(1, Math.min(10, newCols));
		if (clamped === layout.cols) return;
		const delta = clamped - layout.cols;
		let newSlots = [...layout.slots];
		const newColSizes = [...layout.colSizes];

		if (delta > 0) {
			for (let i = 0; i < delta; i++) {
				newColSizes.push('1fr');
				for (let r = 0; r < layout.rows; r++) {
					const colIdx = clamped - delta + i;
					const areaName = `chart-${r * clamped + colIdx + 1}`;
					newSlots.push({
						id: areaName,
						rowStart: r + 1,
						rowEnd: r + 1,
						colStart: colIdx + 1,
						colEnd: colIdx + 1,
						areaName,
					});
				}
			}
		} else {
			newColSizes.splice(clamped);
			newSlots = newSlots
				.filter(s => s.colStart <= clamped)
				.map(s => s.colEnd > clamped ? { ...s, colEnd: clamped } : s);
		}

		const newTemplateAreas = Array(layout.rows).fill(null).map((_, r) =>
			Array(clamped).fill(null).map((_, c) => {
				const match = newSlots.find(s => s.rowStart <= r + 1 && s.rowEnd >= r + 1 && s.colStart <= c + 1 && s.colEnd >= c + 1);
				return match?.areaName ?? '.';
			}).join(' ')
		);

		onLayoutChange({ ...layout, cols: clamped, colSizes: newColSizes, slots: newSlots, templateAreas: newTemplateAreas });
	}, [layout, onLayoutChange]);

	if (!isOpen) return null;

	return (
		<div
			className={`${styles.overlay} ${styles.animFadeIn}`}
			onClick={onClose}
			role="dialog"
			aria-modal="true"
			aria-labelledby="layout-designer-title"
		>
			<div
				className={`${styles.modal} ${styles.animPopIn}`}
				onClick={(e) => e.stopPropagation()}
			>
				{/* Header */}
				<div className={styles.header}>
					<h2 id="layout-designer-title" className={styles.title}>
						{t('layoutDesigner.title') ?? 'Layout Designer'}
					</h2>
					<div className={styles.headerActions}>
						<button
							className={styles.presetButton}
							data-testid="layout-designer-save-as-preset"
							onClick={() => setShowPresetModal(true)}
						>
							{t('layoutDesigner.saveAsPreset') ?? 'Save as Preset'}
						</button>
						<button className={styles.closeButton} onClick={onClose}>
                ×
						</button>
					</div>
				</div>

				{/* Toolbar */}
				<div className={styles.toolbar}>
					<div className={styles.toolbarGroup}>
						<label className={styles.toolbarLabel}>
							{t('layoutDesigner.rows') ?? 'Rows'}
						</label>
						<input
							type="number"
							min={1}
							max={10}
							value={layout.rows}
							onChange={(e) => handleRowsChange(parseInt(e.target.value))}
							className={styles.toolbarInput}
						/>
					</div>
					<div className={styles.toolbarGroup}>
						<label className={styles.toolbarLabel}>
							{t('layoutDesigner.cols') ?? 'Cols'}
						</label>
						<input
							type="number"
							min={1}
							max={10}
							value={layout.cols}
							onChange={(e) => handleColsChange(parseInt(e.target.value))}
							className={styles.toolbarInput}
						/>
					</div>
					<div className={styles.toolbarGroup}>
						<button
							className={styles.actionButton}
							onClick={() => handleRowsChange(layout.rows + 1)}
						>
							{t('layoutDesigner.addRow') ?? 'Add Row'}
						</button>
						<button
							className={styles.actionButton}
							onClick={() => handleColsChange(layout.cols + 1)}
						>
							{t('layoutDesigner.addCol') ?? 'Add Col'}
						</button>
					</div>

					{/* P0: preset đã lưu — trước đây lưu được nhưng không hiện ở đâu cả. */}
					{availablePresets.length > 0 && (
						<div className={styles.toolbarGroup} data-testid="layout-designer-saved-presets">
							<span className={styles.savedPresetsLabel}>
								{t('layoutDesigner.savedPresets') ?? 'Saved presets'}
							</span>
							{availablePresets.map(p => (
								<span key={p.id} className={styles.savedPresetChip}>
									<button
										type="button"
										className={styles.actionButton}
										data-testid={`layout-preset-apply-${p.id}`}
										onClick={() => onApplyPreset?.(p)}
										disabled={!onApplyPreset}
										title={p.name}
									>
										{p.name}
									</button>
									{onDeletePreset && (
										<button
											type="button"
											className={styles.actionButton}
											data-testid={`layout-preset-delete-${p.id}`}
											onClick={() => onDeletePreset(p)}
											aria-label={t('layoutDesigner.deletePreset') ?? 'Delete preset'}
											title={t('layoutDesigner.deletePreset') ?? 'Delete preset'}
										>
											×
										</button>
									)}
								</span>
							))}
						</div>
					)}
				</div>

				{/* Grid Preview */}
				<div className={styles.gridPreview} ref={containerRef}>
					<div
						className={styles.gridContainer}
						style={{
							gridTemplateAreas: templateAreas.map(row => `"${row}"`).join(" "),
							gridTemplateRows: layout.rowSizes.join(" "),
							gridTemplateColumns: layout.colSizes.join(" "),
						}}
					>
						{slots.map((slot) => (
							<div
								key={slot.id}
								className={`${styles.slot} ${selectedSlotId === slot.id ? styles.selected : ''}`}
								style={{
									gridArea: slot.areaName,
									zIndex: slot.zIndex ?? 1,
								}}
								onClick={() => setSelectedSlotId(slot.id)}
							>
								{/* Slot content */}
								<div className={styles.slotContent}>
									<span className={styles.slotSymbol}>{slot.symbol ?? '—'}</span>
									<span className={styles.slotTimeframe}>{slot.timeframe ?? '—'}</span>
								</div>

								{/* Resize handles */}
								<div
									className={`${styles.resizeHandle} ${styles.resizeTop}`}
									onMouseDown={(e) => handleSlotMouseDown(e, slot, 'top')}
									aria-label={t('layoutDesigner.resizeTop') ?? 'Resize top'}
								/>
								<div
									className={`${styles.resizeHandle} ${styles.resizeRight}`}
									onMouseDown={(e) => handleSlotMouseDown(e, slot, 'right')}
									aria-label={t('layoutDesigner.resizeRight') ?? 'Resize right'}
								/>
								<div
									className={`${styles.resizeHandle} ${styles.resizeBottom}`}
									onMouseDown={(e) => handleSlotMouseDown(e, slot, 'bottom')}
									aria-label={t('layoutDesigner.resizeBottom') ?? 'Resize bottom'}
								/>
								<div
									className={`${styles.resizeHandle} ${styles.resizeLeft}`}
									onMouseDown={(e) => handleSlotMouseDown(e, slot, 'left')}
									aria-label={t('layoutDesigner.resizeLeft') ?? 'Resize left'}
								/>

								{/* Split & Merge buttons */}
								<div className={styles.splitButtons}>
									<button
										className={styles.splitButton}
										onClick={(e) => {
											e.stopPropagation();
											splitSlotHorizontal(slot.id);
										}}
										aria-label={t('layoutDesigner.splitHorizontal') ?? 'Split horizontally'}
									>
                      ➖
									</button>
									<button
										className={styles.splitButton}
										onClick={(e) => {
											e.stopPropagation();
											splitSlotVertical(slot.id);
										}}
										aria-label={t('layoutDesigner.splitVertical') ?? 'Split vertically'}
									>
                      ➕
									</button>
									{selectedSlotId && selectedSlotId !== slot.id && (
										<button
											className={styles.splitButton}
											onClick={(e) => {
												e.stopPropagation();
												mergeSlots(selectedSlotId, slot.id);
												setSelectedSlotId(null);
											}}
											aria-label={t('layoutDesigner.mergeSlots') ?? 'Merge slots'}
										>
                      🔗
										</button>
									)}
								</div>
							</div>
						))}
					</div>
				</div>

				{/* Preset Modal */}
				{showPresetModal && (
					<div
						className={`${styles.presetModalOverlay} ${styles.animFadeIn}`}
						onClick={() => setShowPresetModal(false)}
					>
						<div
							className={`${styles.presetModal} ${styles.animPopIn}`}
							onClick={(e) => e.stopPropagation()}
						>
							<h3>{t('layoutDesigner.savePresetTitle') ?? 'Save as Preset'}</h3>
							<input
								type="text"
								value={presetName}
								onChange={(e) => setPresetName(e.target.value)}
								placeholder={t('layoutDesigner.presetNamePlaceholder') ?? 'Enter preset name'}
								className={styles.presetInput}
								data-testid="layout-designer-preset-name"
								autoFocus
							/>
							{presetError && (
								<p role="alert" className={styles.presetError}>
									{presetError}
								</p>
							)}
							<div className={styles.presetActions}>
								<button className={styles.cancelButton} onClick={() => setShowPresetModal(false)}>
									{t('common.cancel') ?? 'Cancel'}
								</button>
								<button className={styles.saveButton} data-testid="layout-designer-preset-save" onClick={handleSavePreset}>
									{t('common.save') ?? 'Save'}
								</button>
							</div>
						</div>
					</div>
				)}
			</div>
		</div>
	);
};

export default LayoutDesigner;