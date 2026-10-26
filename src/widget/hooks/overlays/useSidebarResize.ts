import { useCallback, useState } from "react";
import { useShadowRoot } from "../../context/VNInvestChartsContext";

export const SIDEBAR_WIDTH_KEY = "vnsc_dock_width";
export const DOCK_DEFAULT_WIDTH = 300;
const MIN_WIDTH = 150;
const MAX_WIDTH = 600;

function clampWidth(value: number): number {
	return Math.max(MIN_WIDTH, Math.min(maxAllowedWidth(), value));
}

/**
 * Viewport-aware cap: the dock (flex-shrink:0) must never push its own
 * strip off-screen on narrow windows. Falls back to MAX_WIDTH without DOM.
 */
export function maxAllowedWidth(): number {
	try {
		if (typeof window === "undefined" || !window.innerWidth) return MAX_WIDTH;
		return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.floor(window.innerWidth * 0.45)));
	} catch {
		return MAX_WIDTH;
	}
}

function readPersistedWidth(fallback: number): number {
	try {
		if (typeof window === "undefined" || !window.localStorage) return fallback;
		const raw = window.localStorage.getItem(SIDEBAR_WIDTH_KEY);
		if (raw == null) return fallback;
		const parsed = Number(raw);
		if (!Number.isFinite(parsed)) return fallback;
		return clampWidth(parsed);
	} catch {
		return fallback;
	}
}

export function useSidebarResize(initialWidth = DOCK_DEFAULT_WIDTH) {
	const shadowRoot = useShadowRoot();
	const [sidebarWidth, setSidebarWidth] = useState(() => readPersistedWidth(initialWidth));
	const [isResizingSidebar, setIsResizingSidebar] = useState(false);

	const handleSidebarPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
		e.preventDefault();
		setIsResizingSidebar(true);
		const startX = e.clientX;
		const startWidth = sidebarWidth;
		const target = shadowRoot ?? (typeof document !== "undefined" ? document : null);
		if (!target) return;

		const handlePointerMove = (moveEvent: Event) => {
			const pe = moveEvent as PointerEvent;
			const deltaX = pe.clientX - startX;
			const newWidth = clampWidth(startWidth - deltaX);
			setSidebarWidth(newWidth);
			try {
				window.localStorage?.setItem(SIDEBAR_WIDTH_KEY, String(Math.round(newWidth)));
			} catch {
				// ignore storage errors
			}
		};
		const handlePointerUp = () => {
			setIsResizingSidebar(false);
			target.removeEventListener("pointermove", handlePointerMove, { capture: true });
			target.removeEventListener("pointerup", handlePointerUp, { capture: true });
		};

		target.addEventListener("pointermove", handlePointerMove, { capture: true });
		target.addEventListener("pointerup", handlePointerUp, { capture: true });
	}, [sidebarWidth, shadowRoot]);

	return { sidebarWidth, isResizingSidebar, handleSidebarPointerDown, setSidebarWidth };
}
