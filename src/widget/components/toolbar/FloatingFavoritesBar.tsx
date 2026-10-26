/**
 * P3 R-P3-02: floating quick-favorites bar.
 *
 * Draggable (grip handle) overlay listing the user's pinned drawing tools.
 * Renders through the widget portal root (falls back to document.body, the
 * MobileToolbar pattern) so host `overflow:hidden` containers never clip it.
 * Tools persist via useFavoriteTools (`vnsc_favTools`); bar position persists
 * in `vnsc_favToolsBarPos`. Hidden while no tool is pinned.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useWidgetI18n } from "../../context/WidgetI18nContext";
import { usePortalRoot } from "../../context/VNInvestChartsContext";
import { DrawingToolIcon } from "./DrawingToolIcon";

export interface FloatingFavoritesBarProps {
	favoriteTools: readonly string[];
	activeTool?: string;
	onToolSelect: (tool: string) => void;
	onUnpin: (tool: string) => void;
	isVisible?: boolean;
	onClose?: () => void;
}

interface BarPosition {
	x: number;
	y: number;
}

const POSITION_STORAGE_KEY = "vnsc_favToolsBarPos";
const BAR_MARGIN = 8;

function loadPosition(): BarPosition {
	const fallback = { x: 64, y: 120 };
	try {
		const raw = localStorage.getItem(POSITION_STORAGE_KEY);
		if (!raw) return fallback;
		const parsed = JSON.parse(raw) as Partial<BarPosition>;
		if (typeof parsed.x === "number" && typeof parsed.y === "number") {
			return { x: parsed.x, y: parsed.y };
		}
		return fallback;
	} catch {
		return fallback;
	}
}

function clampPosition(pos: BarPosition): BarPosition {
	if (typeof window === "undefined") return pos;
	return {
		x: Math.max(BAR_MARGIN, Math.min(pos.x, Math.max(BAR_MARGIN, window.innerWidth - 100))),
		y: Math.max(BAR_MARGIN, Math.min(pos.y, Math.max(BAR_MARGIN, window.innerHeight - 60))),
	};
}

export function FloatingFavoritesBar({
	favoriteTools,
	activeTool,
	onToolSelect,
	onUnpin,
	isVisible = true,
	onClose,
}: FloatingFavoritesBarProps) {
	const { t } = useWidgetI18n();
	const portalRoot = usePortalRoot();
	const [position, setPosition] = useState<BarPosition>(loadPosition);
	const [dragging, setDragging] = useState(false);
	const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);

	const beginDrag = useCallback((clientX: number, clientY: number) => {
		dragRef.current = { startX: clientX, startY: clientY, originX: position.x, originY: position.y };
		setDragging(true);
	}, [position.x, position.y]);

	useEffect(() => {
		if (!dragging) return;
		const handleMove = (event: PointerEvent) => {
			const drag = dragRef.current;
			if (!drag) return;
			setPosition(clampPosition({
				x: drag.originX + (event.clientX - drag.startX),
				y: drag.originY + (event.clientY - drag.startY),
			}));
		};
		const handleUp = () => {
			dragRef.current = null;
			setDragging(false);
		};
		window.addEventListener("pointermove", handleMove);
		window.addEventListener("pointerup", handleUp);
		window.addEventListener("pointercancel", handleUp);
		return () => {
			window.removeEventListener("pointermove", handleMove);
			window.removeEventListener("pointerup", handleUp);
			window.removeEventListener("pointercancel", handleUp);
		};
	}, [dragging]);

	useEffect(() => {
		try {
			localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(position));
		} catch {
			// Private mode — position stays in memory.
		}
	}, [position]);

	// Hide if list is empty or explicitly closed/toggled hidden
	if (favoriteTools.length === 0 || !isVisible) return null;

	const bar = (
		<div
			data-testid="floating-favorites-bar"
			role="toolbar"
			aria-label={t("toolbar.favoriteTools")}
			className="vnsc-floating-favorites-bar"
			style={{
				left: position.x,
				top: position.y,
			}}
		>
			<span
				data-testid="floating-favorites-grip"
				title={t("toolbar.favoriteTools")}
				aria-hidden="true"
				className="vnsc-floating-favorites-grip"
				onPointerDown={(event) => {
					(event.target as HTMLElement).setPointerCapture?.(event.pointerId);
					beginDrag(event.clientX, event.clientY);
				}}
			>
				⠿
			</span>
			{favoriteTools.map((tool) => (
				<button
					key={tool}
					type="button"
					className={`vnsc-drawing-toolbar__btn ${activeTool === tool ? "vnsc-drawing-toolbar__btn--active" : ""}`}
					title={`${t(`tool.${tool}`)} (${t("toolbar.unpinFromFavorites")}: Right click)`}
					aria-label={t(`tool.${tool}`)}
					onClick={() => onToolSelect(tool)}
					onContextMenu={(e) => {
						e.preventDefault();
						e.stopPropagation();
						onUnpin(tool);
					}}
				>
					<DrawingToolIcon id={tool} />
				</button>
			))}
			<div className="vnsc-floating-favorites-divider" aria-hidden="true" />
			<button
				type="button"
				data-testid="floating-favorites-close"
				className="vnsc-floating-favorites-close"
				aria-label={t("toolbar.hideFavoritesBar")}
				title={`${t("toolbar.hideFavoritesBar")} (Alt+S)`}
				onClick={(e) => {
					e.stopPropagation();
					onClose?.();
				}}
			>
				✕
			</button>
		</div>
	);

	const mountTarget = portalRoot ?? (typeof document !== "undefined" ? document.body : null);
	if (!mountTarget) return bar;
	return createPortal(bar, mountTarget);
}
