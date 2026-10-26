/**
 * BottomPanelSplitter — drag handle on the panel top edge (TradingView-style).
 *
 * Grid-splitter parity for drag speed: absolute-from-origin delta against a
 * start-height snapshot (immune to browser pointermove coalescing, which made
 * the old incremental deltas lose distance), direct DOM preview on the panel
 * container during the move (zero React renders, zero storage I/O), and a
 * single `resizeTo` commit on pointer-up (one render + one persist).
 * Pointer capture (grid pattern), double-click reset, ArrowUp/Down nudge.
 * Pure passthrough over BottomPanelHeightApi (hook owns state + persistence).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useWidgetI18n } from "../context/WidgetI18nContext";
import type { BottomPanelHeightApi } from "../hooks/useBottomPanelHeight";
import { BOTTOM_PANEL_MIN_PX, BOTTOM_PANEL_MAX_PX, clampBottomPanelHeight } from "../hooks/useBottomPanelHeight";

interface DragSession {
	pointerId: number;
	target: HTMLElement;
	panel: HTMLElement;
	startY: number;
	startHeight: number;
	preview: number;
}

export function BottomPanelSplitter({ api }: { api: BottomPanelHeightApi }) {
	const { t } = useWidgetI18n();
	const [dragging, setDragging] = useState(false);
	const dragRef = useRef<DragSession | null>(null);
	const apiRef = useRef(api);
	apiRef.current = api;

	const onPointerDown = useCallback((e: React.PointerEvent) => {
		e.stopPropagation();
		e.preventDefault();
		const target = e.currentTarget as HTMLElement;
		try {
			target.setPointerCapture(e.pointerId);
		} catch {
			// Fallback khi test env không hỗ trợ pointer capture.
		}
		// Splitter là con trực tiếp của container giữ height (BottomPanelHost
		// lẫn single-chart forkBottomPanel) → preview ghi thẳng vào đó.
		const panel = target.parentElement;
		if (!panel) return;
		dragRef.current = {
			pointerId: e.pointerId,
			target,
			panel,
			startY: e.clientY,
			startHeight: apiRef.current.heightPx,
			preview: apiRef.current.heightPx,
		};
		setDragging(true);
	}, []);

	const endDrag = useCallback((commit: boolean) => {
		const drag = dragRef.current;
		dragRef.current = null;
		setDragging(false);
		if (!drag) return;
		try {
			if (drag.target.hasPointerCapture(drag.pointerId)) {
				drag.target.releasePointerCapture(drag.pointerId);
			}
		} catch {
			// Bỏ qua khi capture đã release.
		}
		// Ghi DOM dứt điểm trước khi commit state: khi revert/cancel giá trị
		// trùng state cũ → React bailout không render lại, inline preview sẽ kẹt.
		const final = commit ? drag.preview : drag.startHeight;
		drag.panel.style.height = `${final}px`;
		// Commit 1 lần duy nhất (state + persist).
		apiRef.current.resizeTo(final);
	}, []);

	useEffect(() => {
		if (!dragging) return;
		const handleMove = (event: PointerEvent) => {
			const drag = dragRef.current;
			if (!drag || event.pointerId !== drag.pointerId) return;
			// Absolute-from-origin: vị trí cuối luôn chính xác dù browser gộp
			// (coalesce) các pointermove trung gian.
			const next = clampBottomPanelHeight(drag.startHeight + (drag.startY - event.clientY));
			drag.preview = next;
			// Preview trực tiếp lên DOM — không setState, không localStorage.
			drag.panel.style.height = `${next}px`;
		};
		const handleUp = (event: PointerEvent) => {
			if (dragRef.current && event.pointerId !== dragRef.current.pointerId) return;
			endDrag(true);
		};
		const handleCancel = () => {
			endDrag(false);
		};
		window.addEventListener("pointermove", handleMove);
		window.addEventListener("pointerup", handleUp);
		window.addEventListener("pointercancel", handleCancel);
		return () => {
			window.removeEventListener("pointermove", handleMove);
			window.removeEventListener("pointerup", handleUp);
			window.removeEventListener("pointercancel", handleCancel);
		};
	}, [dragging, endDrag]);

	const onKeyDown = useCallback((e: React.KeyboardEvent) => {
		if (e.key === "ArrowUp") {
			e.preventDefault();
			apiRef.current.nudge(1);
		} else if (e.key === "ArrowDown") {
			e.preventDefault();
			apiRef.current.nudge(-1);
		}
	}, []);

	const label = t("ui.bottomTab.resizeHandle");
	return (
		<div
			role="separator"
			aria-orientation="horizontal"
			aria-label={label}
			aria-valuenow={Math.round(api.heightPx)}
			aria-valuemin={BOTTOM_PANEL_MIN_PX}
			aria-valuemax={BOTTOM_PANEL_MAX_PX}
			title={label}
			tabIndex={0}
			data-testid="bottom-panel-splitter"
			onPointerDown={onPointerDown}
			onDoubleClick={(e) => { e.stopPropagation(); api.reset(); }}
			onKeyDown={onKeyDown}
			style={{
				height: 7,
				marginTop: -3,
				flexShrink: 0,
				cursor: "row-resize",
				touchAction: "none",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				background: dragging ? "var(--vnsc-border-hover, rgba(255,255,255,0.18))" : "transparent",
			}}
		>
			<span aria-hidden="true" style={{ display: "flex", gap: 3 }}>
				{[0, 1, 2].map((i) => (
					<span key={i} style={{ width: 3, height: 3, borderRadius: "50%", background: "var(--vnsc-text-secondary, #a0a0a0)" }} />
				))}
			</span>
		</div>
	);
}
