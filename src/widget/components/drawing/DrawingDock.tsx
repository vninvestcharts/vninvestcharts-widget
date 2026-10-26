import { type ReactNode, useEffect, useRef, useState } from "react";
import { useShadowRoot } from "../../context/VNInvestChartsContext";

import type { DrawingDockTab } from "@vninvestcharts/engine-react";
import styles from "../../styles/drawing-dock.module.css";

export interface DrawingDockLabels {
	title: string;
	close: string;
	properties: string;
	objects: string;
	templates: string;
	emptyProperties: string;
	emptyObjects: string;
	emptyTemplates: string;
	resize: string;
}
export interface DrawingDockProps {
	isOpen: boolean;
	activeTab: DrawingDockTab;
	labels: DrawingDockLabels;
	position?: { x: number; y: number };
	initialDragDelta?: { x: number; y: number } | null;
	initialSizeDelta?: { w: number; h: number } | null;
	onLayoutChange?: (layout: { dragDelta: { x: number; y: number }; sizeDelta: { w: number; h: number } }) => void;
	onClose: () => void;
	onTabChange: (tab: DrawingDockTab) => void;
	headerActions?: ReactNode;
	propertiesContent?: ReactNode;
	objectsContent?: ReactNode;
	templatesContent?: ReactNode;
}
export default function DrawingDock({
	isOpen,
	activeTab,
	labels,
	position,
	initialDragDelta,
	initialSizeDelta,
	onLayoutChange,
	onClose,
	onTabChange,
	headerActions,
	propertiesContent,
	objectsContent,
	templatesContent,
}: DrawingDockProps) {
	const shadowRoot = useShadowRoot();
	const [dragDelta, setDragDelta] = useState(() => initialDragDelta ?? { x: 0, y: 0 });
	const [isDragging, setIsDragging] = useState(false);
	const [sizeDelta, setSizeDelta] = useState(() => initialSizeDelta ?? { w: 0, h: 0 });
	const [isResizing, setIsResizing] = useState(false);
	const rootRef = useRef<HTMLElement | null>(null);
	const dragStartRef = useRef<{ pointerId: number; startX: number; startY: number; baseX: number; baseY: number } | null>(null);
	const resizeStartRef = useRef<{ pointerId: number; startX: number; startY: number; baseW: number; baseH: number } | null>(null);
	const dragDeltaRef = useRef(dragDelta);
	dragDeltaRef.current = dragDelta;
	const sizeDeltaRef = useRef(sizeDelta);
	sizeDeltaRef.current = sizeDelta;
	const onLayoutChangeRef = useRef(onLayoutChange);
	onLayoutChangeRef.current = onLayoutChange;

	useEffect(() => {
		if (!isDragging) return;
		const handlePointerMove = (e: Event) => {
			const pe = e as PointerEvent;
			if (!dragStartRef.current) return;
			if (pe.pointerId !== dragStartRef.current.pointerId) return;
			const nextX = dragStartRef.current.baseX + (pe.clientX - dragStartRef.current.startX);
			const nextY = dragStartRef.current.baseY + (pe.clientY - dragStartRef.current.startY);

			const baseLeft = position?.x ?? 16;
			const baseTop = position?.y ?? 16;
			const node = rootRef.current;
			const width = node?.offsetWidth ?? 360;
			const height = node?.offsetHeight ?? 420;
			const maxOffsetX = Math.max(0, window.innerWidth - width - 8) - baseLeft;
			const maxOffsetY = Math.max(0, window.innerHeight - height - 8) - baseTop;
			const minOffsetX = 8 - baseLeft;
			const minOffsetY = 8 - baseTop;

			setDragDelta({
				x: Math.min(maxOffsetX, Math.max(minOffsetX, nextX)),
				y: Math.min(maxOffsetY, Math.max(minOffsetY, nextY)),
			});
		};
		const handlePointerUp = (e: Event) => {
			const pe = e as PointerEvent;
			if (!dragStartRef.current) return;
			if (pe.pointerId !== dragStartRef.current.pointerId) return;
			dragStartRef.current = null;
			setIsDragging(false);
			onLayoutChangeRef.current?.({ dragDelta: dragDeltaRef.current, sizeDelta: sizeDeltaRef.current });
		};
		// Use shadowRoot for capture-phase listeners in Shadow DOM mode
		const target = shadowRoot ?? document;
		target.addEventListener("pointermove", handlePointerMove, { capture: true });
		target.addEventListener("pointerup", handlePointerUp, { capture: true });
		target.addEventListener("pointercancel", handlePointerUp, { capture: true });
		return () => {
			target.removeEventListener("pointermove", handlePointerMove, { capture: true });
			target.removeEventListener("pointerup", handlePointerUp, { capture: true });
			target.removeEventListener("pointercancel", handlePointerUp, { capture: true });
		};
	}, [isDragging, position?.x, position?.y, shadowRoot]);

	useEffect(() => {
		if (!isResizing) return;
		const handlePointerMove = (e: Event) => {
			const pe = e as PointerEvent;
			if (!resizeStartRef.current) return;
			if (pe.pointerId !== resizeStartRef.current.pointerId) return;
			const dw = pe.clientX - resizeStartRef.current.startX;
			const dh = pe.clientY - resizeStartRef.current.startY;
			setSizeDelta({
				w: Math.min(Math.max(resizeStartRef.current.baseW + dw, 280 - 360), 600 - 360),
				h: Math.min(Math.max(resizeStartRef.current.baseH + dh, 200 - 200), 800 - 200),
			});
		};
		const handlePointerUp = (e: Event) => {
			const pe = e as PointerEvent;
			if (!resizeStartRef.current) return;
			if (pe.pointerId !== resizeStartRef.current.pointerId) return;
			resizeStartRef.current = null;
			setIsResizing(false);
			onLayoutChangeRef.current?.({ dragDelta: dragDeltaRef.current, sizeDelta: sizeDeltaRef.current });
		};
		const target = shadowRoot ?? document;
		target.addEventListener("pointermove", handlePointerMove, { capture: true });
		target.addEventListener("pointerup", handlePointerUp, { capture: true });
		target.addEventListener("pointercancel", handlePointerUp, { capture: true });
		return () => {
			target.removeEventListener("pointermove", handlePointerMove, { capture: true });
			target.removeEventListener("pointerup", handlePointerUp, { capture: true });
			target.removeEventListener("pointercancel", handlePointerUp, { capture: true });
		};
	}, [isResizing, shadowRoot]);

	// R3: clamp a restored drag offset back into the viewport on open, so a dock
	// persisted on a wide screen is not stranded off-screen on a narrow one.
	useEffect(() => {
		if (!isOpen) return;
		const node = rootRef.current;
		if (!node) return;
		const baseLeft = position?.x ?? 16;
		const baseTop = position?.y ?? 16;
		const width = node.offsetWidth || 360;
		const height = node.offsetHeight || 420;
		const maxOffsetX = Math.max(0, window.innerWidth - width - 8) - baseLeft;
		const maxOffsetY = Math.max(0, window.innerHeight - height - 8) - baseTop;
		const minOffsetX = 8 - baseLeft;
		const minOffsetY = 8 - baseTop;
		setDragDelta((current) => {
			const clampedX = Math.min(maxOffsetX, Math.max(minOffsetX, current.x));
			const clampedY = Math.min(maxOffsetY, Math.max(minOffsetY, current.y));
			if (clampedX === current.x && clampedY === current.y) return current;
			const next = { x: clampedX, y: clampedY };
			onLayoutChangeRef.current?.({ dragDelta: next, sizeDelta: sizeDeltaRef.current });
			return next;
		});
		// Run once per open; position base changes are the only relevant re-trigger.
	}, [isOpen, position?.x, position?.y]);

	if (!isOpen) {
		return null;
	}

	const left = (position?.x ?? 16) + dragDelta.x;
	const top = (position?.y ?? 16) + dragDelta.y;
	const width = 360 + sizeDelta.w;
	const height = 200 + sizeDelta.h;

	const handleHeaderPointerDown = (e: React.PointerEvent) => {
		// Ignore clicks on buttons inside the header
		if ((e.target as HTMLElement).closest("button")) return;
		if (e.button !== 0) return;
		e.preventDefault();
		dragStartRef.current = {
			pointerId: e.pointerId,
			startX: e.clientX,
			startY: e.clientY,
			baseX: dragDelta.x,
			baseY: dragDelta.y,
		};
		setIsDragging(true);
	};
	const resolvedContent = activeTab === "properties"
		? (propertiesContent ?? <div className={styles.empty}>{labels.emptyProperties}</div>)
		: activeTab === "objects"
			? (objectsContent ?? <div className={styles.empty}>{labels.emptyObjects}</div>)
			: (templatesContent ?? <div className={styles.empty}>{labels.emptyTemplates}</div>);

	return (
		<section ref={rootRef} className={styles.dock} style={{ left, top, width, minHeight: height, maxHeight: height }} aria-label={labels.title}>
			<header
				className={styles.header}
				style={{ cursor: isDragging ? "grabbing" : "grab" }}
				onPointerDown={handleHeaderPointerDown}
			>
				<div className={styles.titleBlock}>
					<strong>{labels.title}</strong>
					<span>{activeTab === "properties" ? labels.properties : activeTab === "objects" ? labels.objects : labels.templates}</span>
				</div>
				<div className={styles.headerActions}>
					{headerActions}
					<button type="button" className={styles.icon} onClick={onClose} aria-label={labels.close}>
						×
					</button>
				</div>
			</header>
			<nav className={styles.tabs} aria-label={labels.title} role="tablist">
				{([
					["properties", labels.properties],
					["objects", labels.objects],
					["templates", labels.templates],
				] as const).map(([tab, label]) => (
					<button
						key={tab}
						type="button"
						role="tab"
						aria-selected={activeTab === tab}
						className={`${styles.tab} ${activeTab === tab ? styles.tabActive : ""}`}
						onClick={() => onTabChange(tab)}
					>
						{label}
					</button>
				))}
			</nav>
			<div className={styles.body}>
				{resolvedContent}
			</div>
			<div
				className={styles.resizeHandle}
				onPointerDown={(e) => {
					if (e.button !== 0) return;
					e.preventDefault();
					e.stopPropagation();
					resizeStartRef.current = {
						pointerId: e.pointerId,
						startX: e.clientX,
						startY: e.clientY,
						baseW: sizeDelta.w,
						baseH: sizeDelta.h,
					};
					setIsResizing(true);
				}}
				aria-label={labels.resize}
			/>
		</section>
	);
}