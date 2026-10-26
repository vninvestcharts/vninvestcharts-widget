import { useState, useRef, useEffect, useCallback, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { GridLayout } from '../../grid/types';
import {
	MIN_TRACK_PX,
	resolveTrackPx,
	applyNeighborDeltaPx,
	convertPxToFr,
} from './gridSplitterMath';
import styles from './GridContainer.module.css';

export interface UseGridSplitterDragOptions {
	containerRef: React.RefObject<HTMLDivElement | null>;
	layout: GridLayout;
	onLayoutChange?: (layout: GridLayout) => void;
	minTrackPx?: number;
}

interface DragSession {
	type: 'row' | 'col';
	index: number;
	pointerId: number;
	target: HTMLElement;
	startX: number;
	startY: number;
	baseTracksPx: number[];
}

export function useGridSplitterDrag({
	containerRef,
	layout,
	onLayoutChange,
	minTrackPx = MIN_TRACK_PX,
}: UseGridSplitterDragOptions) {
	const [trackSizes, setTrackSizes] = useState<{ rows: string[]; cols: string[] }>({
		rows: layout.rowSizes,
		cols: layout.colSizes,
	});

	// Synchronize trackSizes when layout externally changes
	useEffect(() => {
		setTrackSizes(prev => {
			const rowsMatch =
				prev.rows.length === layout.rowSizes.length &&
				prev.rows.every((val, i) => val === layout.rowSizes[i]);
			const colsMatch =
				prev.cols.length === layout.colSizes.length &&
				prev.cols.every((val, i) => val === layout.colSizes[i]);
			if (rowsMatch && colsMatch) return prev;
			return {
				rows: layout.rowSizes,
				cols: layout.colSizes,
			};
		});
	}, [layout.rowSizes, layout.colSizes]);

	const dragRef = useRef<DragSession | null>(null);
	const [isDragging, setIsDragging] = useState(false);
	const rafIdRef = useRef<number | null>(null);
	const latestDeltaRef = useRef(0);

	const cleanupDrag = useCallback(() => {
		if (rafIdRef.current !== null) {
			cancelAnimationFrame(rafIdRef.current);
			rafIdRef.current = null;
		}
		const session = dragRef.current;
		if (session) {
			try {
				if (session.target.hasPointerCapture(session.pointerId)) {
					session.target.releasePointerCapture(session.pointerId);
				}
			} catch {
				// Ignore if pointer capture already released
			}
			session.target.classList.remove(styles.dragging);
		}
		dragRef.current = null;
		setIsDragging(false);
		latestDeltaRef.current = 0;
		// Pre-P2 embed-safe: clear container cursor, only touch body if container was absent (fallback path)
		if (containerRef.current) {
			containerRef.current.style.cursor = '';
			(containerRef.current.style as any).userSelect = '';
			containerRef.current.style.transition = '';
		} else if (typeof document !== 'undefined') {
			document.body.style.cursor = '';
			document.body.style.userSelect = '';
		}
	}, [containerRef]);

	const getBaseTracksPx = useCallback(
		(type: 'row' | 'col') => {
			const numTracks = type === 'row' ? layout.rows : layout.cols;
			const isRow = type === 'row';
			const currentSizes = isRow ? trackSizes.rows : trackSizes.cols;

			if (containerRef.current) {
				const rect = containerRef.current.getBoundingClientRect();
				const cs = window.getComputedStyle(containerRef.current);
				const containerSize = (isRow ? rect.height : rect.width) || (numTracks * 300);
				const rawTokens = (isRow ? cs.gridTemplateRows : cs.gridTemplateColumns)
					.split(' ')
					.map(s => s.trim())
					.filter(Boolean);

				const tokensToUse = rawTokens.length === numTracks ? rawTokens : currentSizes;
				if (tokensToUse.length === numTracks) {
					return tokensToUse.map(t => resolveTrackPx(t, containerSize, tokensToUse, 4));
				}
				return Array(numTracks).fill(containerSize / numTracks);
			}

			const containerSize = numTracks * 300;
			if (currentSizes.length === numTracks) {
				return currentSizes.map(t => resolveTrackPx(t, containerSize, currentSizes, 4));
			}
			return Array(numTracks).fill(300);
		},
		[containerRef, layout.cols, layout.rows, trackSizes.cols, trackSizes.rows]
	);

	const handlePointerDown = useCallback(
		(e: ReactPointerEvent<HTMLDivElement>, type: 'row' | 'col', index: number) => {
			e.preventDefault();
			e.stopPropagation();

			const target = e.currentTarget as HTMLElement;
			try {
				target.setPointerCapture(e.pointerId);
			} catch {
				// Fallback if setPointerCapture not supported in test env
			}
			target.classList.add(styles.dragging);

			if (containerRef.current) {
				containerRef.current.style.transition = 'none';
			}

			const baseTracksPx = getBaseTracksPx(type);

			// Pre-P2 embed-safe: prefer container cursor, fallback to body only if container unavailable
			if (containerRef.current) {
				containerRef.current.style.cursor = type === 'row' ? 'row-resize' : 'col-resize';
				(containerRef.current.style as any).userSelect = 'none';
			} else if (typeof document !== 'undefined') {
				document.body.style.cursor = type === 'row' ? 'row-resize' : 'col-resize';
				document.body.style.userSelect = 'none';
			}

			dragRef.current = {
				type,
				index,
				pointerId: e.pointerId,
				target,
				startX: e.clientX,
				startY: e.clientY,
				baseTracksPx,
			};
			setIsDragging(true);
			latestDeltaRef.current = 0;
		},
		[containerRef, getBaseTracksPx]
	);

	// Global pointer listeners for active drag
	useEffect(() => {
		if (!isDragging) return;

		const onPointerMove = (e: PointerEvent) => {
			const session = dragRef.current;
			if (!session || (session.pointerId !== undefined && e.pointerId !== session.pointerId)) return;

			const delta = session.type === 'row' ? e.clientY - session.startY : e.clientX - session.startX;
			latestDeltaRef.current = delta;

			if (rafIdRef.current === null) {
				rafIdRef.current = requestAnimationFrame(() => {
					rafIdRef.current = null;
					const s = dragRef.current;
					if (!s || !containerRef.current) return;

					const updatedPx = applyNeighborDeltaPx({
						baseTracksPx: s.baseTracksPx,
						index: s.index,
						deltaPx: latestDeltaRef.current,
						minPx: minTrackPx,
					});

					const styleString = updatedPx.map(px => `${px}px`).join(' ');
					if (s.type === 'row') {
						containerRef.current.style.gridTemplateRows = styleString;
					} else {
						containerRef.current.style.gridTemplateColumns = styleString;
					}
				});
			}
		};

		const onPointerUp = (e: PointerEvent) => {
			const session = dragRef.current;
			if (!session || (session.pointerId !== undefined && e.pointerId !== session.pointerId)) return;

			const delta = latestDeltaRef.current;
			const { type, index, baseTracksPx } = session;

			// Click without drag: release cleanly without spurious persist.
			if (delta === 0) {
				cleanupDrag();
				return;
			}

			const totalTracks = type === 'row' ? layout.rows : layout.cols;

			const finalTracksPx = applyNeighborDeltaPx({
				baseTracksPx,
				index,
				deltaPx: delta,
				minPx: minTrackPx,
			});

			const newFrs = convertPxToFr(finalTracksPx, totalTracks);

			const newLayout: GridLayout = {
				...layout,
				rowSizes: type === 'row' ? newFrs : layout.rowSizes,
				colSizes: type === 'col' ? newFrs : layout.colSizes,
			};

			cleanupDrag();
			setTrackSizes({
				rows: newLayout.rowSizes,
				cols: newLayout.colSizes,
			});
			onLayoutChange?.(newLayout);
		};

		const onPointerCancel = () => {
			// Restore styles without committing
			if (containerRef.current) {
				containerRef.current.style.gridTemplateRows = '';
				containerRef.current.style.gridTemplateColumns = '';
			}
			cleanupDrag();
		};

		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.preventDefault();
				onPointerCancel();
			}
		};

		window.addEventListener('pointermove', onPointerMove);
		window.addEventListener('pointerup', onPointerUp);
		window.addEventListener('pointercancel', onPointerCancel);
		window.addEventListener('keydown', onKeyDown);

		return () => {
			window.removeEventListener('pointermove', onPointerMove);
			window.removeEventListener('pointerup', onPointerUp);
			window.removeEventListener('pointercancel', onPointerCancel);
			window.removeEventListener('keydown', onKeyDown);
			if (rafIdRef.current !== null) {
				cancelAnimationFrame(rafIdRef.current);
				rafIdRef.current = null;
			}
		};
	}, [isDragging, containerRef, layout, minTrackPx, onLayoutChange, cleanupDrag]);

	const handleKeyDown = useCallback(
		(e: ReactKeyboardEvent<HTMLDivElement>, type: 'row' | 'col', index: number) => {
			let delta = 0;
			const step = e.shiftKey ? 5 : e.ctrlKey || e.metaKey ? 50 : 25;

			if (type === 'row') {
				if (e.key === 'ArrowUp') {
					delta = -step;
				} else if (e.key === 'ArrowDown') {
					delta = step;
				} else if (e.key === 'Home') {
					delta = -9999;
				} else if (e.key === 'End') {
					delta = 9999;
				} else {
					return;
				}
			} else {
				if (e.key === 'ArrowLeft') {
					delta = -step;
				} else if (e.key === 'ArrowRight') {
					delta = step;
				} else if (e.key === 'Home') {
					delta = -9999;
				} else if (e.key === 'End') {
					delta = 9999;
				} else {
					return;
				}
			}

			e.preventDefault();

			const numTracks = type === 'row' ? layout.rows : layout.cols;
			const baseTracksPx = getBaseTracksPx(type);

			const finalTracksPx = applyNeighborDeltaPx({
				baseTracksPx,
				index,
				deltaPx: delta,
				minPx: minTrackPx,
			});

			const newFrs = convertPxToFr(finalTracksPx, numTracks);
			const newLayout: GridLayout = {
				...layout,
				rowSizes: type === 'row' ? newFrs : layout.rowSizes,
				colSizes: type === 'col' ? newFrs : layout.colSizes,
			};

			setTrackSizes({
				rows: newLayout.rowSizes,
				cols: newLayout.colSizes,
			});
			onLayoutChange?.(newLayout);
		},
		[getBaseTracksPx, layout, minTrackPx, onLayoutChange]
	);

	const handleDoubleClick = useCallback(
		(type: 'row' | 'col') => {
			const numTracks = type === 'row' ? layout.rows : layout.cols;
			const equalFrs = Array(numTracks).fill('1fr');
			const newLayout: GridLayout = {
				...layout,
				rowSizes: type === 'row' ? equalFrs : layout.rowSizes,
				colSizes: type === 'col' ? equalFrs : layout.colSizes,
			};
			setTrackSizes({
				rows: newLayout.rowSizes,
				cols: newLayout.colSizes,
			});
			onLayoutChange?.(newLayout);
		},
		[layout, onLayoutChange]
	);

	return {
		trackSizes,
		handlePointerDown,
		handleKeyDown,
		handleDoubleClick,
		isDragging,
	};
}
