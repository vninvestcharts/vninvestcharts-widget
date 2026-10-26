// Task TVP-A0: useFloatingDrag — kéo thả panel nổi qua grip RIÊNG.
// Grip tách khỏi nút bấm nên drag không bao giờ nuốt click. Vị trí persist
// localStorage (guarded try/catch, theo precedent vnsc_favTools).
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

export interface FloatingPos {
	x: number;
	y: number;
}

export interface FloatingDragOptions {
	storageKey: string;
	defaultPos: FloatingPos;
	getBounds: () => { width: number; height: number };
	/**
	 * Element được định vị, để clamp vị trí đã lưu ngay khi mount.
	 * Bắt buộc: nếu thiếu, một vị trí lưu từ viewport rộng hơn sẽ đặt panel ngoài màn
	 * hình, **grip biến mất**, và vì drag/reset đều cần grip nên người dùng kẹt vĩnh viễn.
	 */
	getElement?: () => HTMLElement | null;
	/** `useHoldDrag`: px phải đi trước khi coi là kéo. Mặc định 5px (bỏ rung chuột). */
	moveThreshold?: number;
}

function readStoredPos(storageKey: string, fallback: FloatingPos): FloatingPos {
	try {
		const raw = window.localStorage.getItem(storageKey);
		if (!raw) return fallback;
		const parsed = JSON.parse(raw) as Partial<FloatingPos>;
		if (Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) {
			return { x: parsed.x as number, y: parsed.y as number };
		}
	} catch {
		// Storage bị chặn/hỏng — dùng default, không crash.
	}
	return fallback;
}

function writeStoredPos(storageKey: string, pos: FloatingPos): void {
	try {
		window.localStorage.setItem(storageKey, JSON.stringify(pos));
	} catch {
		// Bỏ qua khi storage bị chặn (private mode).
	}
}

function clampPos(
	startPos: FloatingPos,
	dx: number,
	dy: number,
	elementWidth: number,
	elementHeight: number,
	boundsWidth: number,
	boundsHeight: number,
): FloatingPos {
	// UI-AUDIT + QUICKTRADE_PILLS R-01: negative x = right-anchored, negative y =
	// bottom-anchored. x và y tính ĐỘC LẬP theo từng dấu rồi ghép một lần — nhánh
	// `y<0` đặt sau early-return của nhánh `x<0` sẽ là dead code đúng cho quadrant
	// kép (x<0 ∧ y<0), chính quadrant của default dock mới.
	const maxW = Math.max(0, boundsWidth - elementWidth);
	const maxH = Math.max(0, boundsHeight - elementHeight);
	const x =
		startPos.x < 0
			? -Math.min(Math.max(0, -startPos.x - dx), maxW)
			: Math.min(Math.max(0, startPos.x + dx), maxW);
	const y =
		startPos.y < 0
			? -Math.min(Math.max(0, -startPos.y - dy), maxH)
			: Math.min(Math.max(0, startPos.y + dy), maxH);
	return { x, y };
}

/**
 * Kéo bằng cách BẤM GIỮ trên bất kỳ vị trí nào của panel — không cần grip riêng.
 *
 * Vì sao không `preventDefault`/`setPointerCapture` ngay ở pointerdown: làm vậy thì
 * pointerdown của nút con bị nuốt và **nút chết** (xem bug 2026-09-30: nút expand không
 * bấm được). Ở đây ta chờ chuột đi quá `MOVE_THRESHOLD` px mới thực sự chiếm pointer.
 * Người dùng chỉ bấm (không di) ⇒ không có capture ⇒ click tới nút con bình thường.
 */
export function useHoldDrag({
	storageKey,
	defaultPos,
	getBounds,
	getElement,
	moveThreshold = 5,
}: FloatingDragOptions): {
	pos: FloatingPos;
	onSurfacePointerDown: (e: React.PointerEvent<HTMLElement>) => void;
	onSurfaceDoubleClick: (e: React.MouseEvent<HTMLElement>) => void;
	reset: () => void;
} {
	const [pos, setPos] = useState<FloatingPos>(() => readStoredPos(storageKey, defaultPos));
	const posRef = useRef<FloatingPos>(pos);
	const pendingRef = useRef<{ startX: number; startY: number; el: HTMLElement } | null>(null);
	const dragRef = useRef<{
		startClientX: number;
		startClientY: number;
		startPos: FloatingPos;
		latest: FloatingPos;
		elementWidth: number;
		elementHeight: number;
		boundsWidth: number;
		boundsHeight: number;
	} | null>(null);

	useEffect(() => {
		posRef.current = pos;
	}, [pos]);

	const reset = useCallback(() => {
		setPos(defaultPos);
		posRef.current = defaultPos;
		writeStoredPos(storageKey, defaultPos);
	}, [storageKey, defaultPos.x, defaultPos.y]);

	const beginDrag = useCallback(
		(e: PointerEvent, el: HTMLElement) => {
			el.setPointerCapture?.(e.pointerId);
			const rect = el.getBoundingClientRect();
			let boundsWidth = Number.POSITIVE_INFINITY;
			let boundsHeight = Number.POSITIVE_INFINITY;
			try {
				const b = getBounds();
				if (b.width > 0) boundsWidth = b.width;
				if (b.height > 0) boundsHeight = b.height;
			} catch {
				/* không đo được bounds thì không clamp */
			}
			const startPos = { ...posRef.current };
			dragRef.current = {
				startClientX: e.clientX,
				startClientY: e.clientY,
				startPos,
				latest: startPos,
				elementWidth: rect.width,
				elementHeight: rect.height,
				boundsWidth,
				boundsHeight,
			};
			setPos(startPos);
		},
		[getBounds],
	);

	const handleMove = useCallback(
		(e: PointerEvent) => {
			const drag = dragRef.current;
			if (drag) {
				drag.latest = clampPos(
					drag.startPos,
					e.clientX - drag.startClientX,
					e.clientY - drag.startClientY,
					drag.elementWidth,
					drag.elementHeight,
					drag.boundsWidth,
					drag.boundsHeight,
				);
				setPos(drag.latest);
				return;
			}
			// Chưa đủ ngưỡng: chỉ "pending", KHÔNG capture, KHÔNG preventDefault.
			const pending = pendingRef.current;
			if (!pending) return;
			const moved = Math.hypot(e.clientX - pending.startX, e.clientY - pending.startY);
			if (moved < moveThreshold) return;
			// Vượt ngưỡng ⇒ đây là ý định KÉO. Chỉ từ đây mới chiếm pointer.
			pendingRef.current = null;
			e.preventDefault();
			beginDrag(e, pending.el);
			// RồI áp dụng ngay delta của chính sự kiện này — nếu không, một cú kéo
			// chỉ có MỘT pointermove sẽ không đổi vị trí (chỉ bắt đầu drag).
			const started = dragRef.current;
			if (started) {
				started.latest = clampPos(
					started.startPos,
					e.clientX - started.startClientX,
					e.clientY - started.startClientY,
					started.elementWidth,
					started.elementHeight,
					started.boundsWidth,
					started.boundsHeight,
				);
				setPos(started.latest);
			}
			return;
		},
		[beginDrag, moveThreshold],
	);

	const handleUp = useCallback(() => {
		pendingRef.current = null;
		const drag = dragRef.current;
		dragRef.current = null;
		window.removeEventListener("pointermove", handleMove);
		window.removeEventListener("pointerup", handleUp);
		window.removeEventListener("pointercancel", handleUp);
		if (drag) {
			posRef.current = drag.latest;
			writeStoredPos(storageKey, drag.latest);
		}
	}, [handleMove, storageKey]);

	const onSurfacePointerDown = useCallback(
		(e: React.PointerEvent<HTMLElement>) => {
			if (e.button !== 0) return;
			// Bấm-giữ được ở BẤT KỲ đâu, kể cả trên nút — ngưỡng cử động đã tự phân biệt
			// "bấm" (không di) với "kéo" (có di). Chỉ loại trừ ô NHẬP LIỆU: kéo chuột trong
			// ô text để chọn là tương tác hợp lệ, không phải kéo panel.
			const target = e.target as HTMLElement | null;
			if (target?.closest("input, textarea, select, [contenteditable='true']")) {
				return;
			}
			pendingRef.current = { startX: e.clientX, startY: e.clientY, el: e.currentTarget };
			window.addEventListener("pointermove", handleMove);
			window.addEventListener("pointerup", handleUp);
			window.addEventListener("pointercancel", handleUp);
		},
		[handleMove, handleUp],
	);

	const onSurfaceDoubleClick = useCallback(() => {
		reset();
	}, [reset]);

	useLayoutEffect(() => {
		if (!getElement) return;
		const el = getElement();
		if (!el) return;
		let bounds: { width: number; height: number };
		try {
			bounds = getBounds();
		} catch {
			return;
		}
		if (!(bounds.width > 0) || !(bounds.height > 0)) return;
		const rect = el.getBoundingClientRect();
		if (!(rect.width > 0) || !(rect.height > 0)) return;
		const clamped = clampPos(posRef.current, 0, 0, rect.width, rect.height, bounds.width, bounds.height);
		if (clamped.x === posRef.current.x && clamped.y === posRef.current.y) return;
		posRef.current = clamped;
		setPos(clamped);
		writeStoredPos(storageKey, clamped);
	}, [getElement, getBounds, storageKey]);

	return { pos, onSurfacePointerDown, onSurfaceDoubleClick, reset };
}

export function useFloatingDrag({ storageKey, defaultPos, getBounds, getElement }: FloatingDragOptions): {
	pos: FloatingPos;
	onGripPointerDown: (e: React.PointerEvent<HTMLElement>) => void;
	onGripDoubleClick: () => void;
	reset: () => void;
} {
	const [pos, setPos] = useState<FloatingPos>(() => readStoredPos(storageKey, defaultPos));
	const dragRef = useRef<{
		startClientX: number;
		startClientY: number;
		startPos: FloatingPos;
		latest: FloatingPos;
		elementWidth: number;
		elementHeight: number;
		boundsWidth: number;
		boundsHeight: number;
	} | null>(null);

	const reset = useCallback(() => {
		setPos(defaultPos);
		writeStoredPos(storageKey, defaultPos);
	}, [storageKey, defaultPos.x, defaultPos.y]);

	useEffect(() => {
		return () => {
			dragRef.current = null;
		};
	}, []);

	/**
	 * Clamp vị trí đã lưu vào bounds HIỆN TẠI ngay khi mount.
	 *
	 * Đo được trên UI thật: seed `{"x":-1500}` (lưu từ viewport rộng hơn) ⇒ `barX=-383`,
	 * grip nằm ngoài màn hình và **không clickable**. Drag cần grip, reset bằng
	 * double-click cũng cần grip ⇒ người dùng không có đường nào kéo về.
	 *
	 * Vì vậy clamp phải chạy lúc mount, không chỉ lúc drag. Bỏ qua khi chưa đo được
	 * bounds (jsdom/SSR/không render) để không ghim sai giá trị mặc định.
	 */
	useLayoutEffect(() => {
		if (!getElement) return;
		const el = getElement();
		if (!el) return;
		let bounds: { width: number; height: number };
		try {
			bounds = getBounds();
		} catch {
			return;
		}
		if (!(bounds.width > 0) || !(bounds.height > 0)) return;
		const rect = el.getBoundingClientRect();
		if (!(rect.width > 0) || !(rect.height > 0)) return;
		const clamped = clampPos(
			posRef.current,
			0,
			0,
			rect.width,
			rect.height,
			bounds.width,
			bounds.height,
		);
		if (clamped.x === posRef.current.x && clamped.y === posRef.current.y) return;
		posRef.current = clamped;
		setPos(clamped);
		writeStoredPos(storageKey, clamped);
		// Chạy lại khi viewport đổi: bản lưu có thể hợp lệ với màn hình cũ.
	}, [getElement, getBounds, storageKey]);

	const handleMove = useCallback((e: PointerEvent) => {
		const drag = dragRef.current;
		if (!drag) return;
		drag.latest = clampPos(
			drag.startPos,
			e.clientX - drag.startClientX,
			e.clientY - drag.startClientY,
			drag.elementWidth,
			drag.elementHeight,
			drag.boundsWidth,
			drag.boundsHeight,
		);
		setPos(drag.latest);
	}, []);

	const handleUp = useCallback(() => {
		const drag = dragRef.current;
		dragRef.current = null;
		window.removeEventListener("pointermove", handleMove);
		window.removeEventListener("pointerup", handleUp);
		window.removeEventListener("pointercancel", handleUp);
		if (drag) writeStoredPos(storageKey, drag.latest);
	}, [handleMove, storageKey]);

	const onGripPointerDown = useCallback(
		(e: React.PointerEvent<HTMLElement>) => {
			if (e.button !== 0) return;
			e.stopPropagation();
			e.preventDefault();
			e.currentTarget.setPointerCapture?.(e.pointerId);
			const rect = e.currentTarget.getBoundingClientRect();
			let boundsWidth = Number.POSITIVE_INFINITY;
			let boundsHeight = Number.POSITIVE_INFINITY;
			try {
				const bounds = getBounds();
				// Bounds 0 (jsdom/SSR/không đo được) = không giới hạn, không phải clamp về 0.
				if (bounds.width > 0) boundsWidth = bounds.width;
				if (bounds.height > 0) boundsHeight = bounds.height;
			} catch {
				// Không đo được bounds — kéo tự do, vẫn clamp ở 0.
			}
			const startPos = { ...posRef.current };
			dragRef.current = {
				startClientX: e.clientX,
				startClientY: e.clientY,
				startPos,
				latest: startPos,
				elementWidth: rect.width,
				elementHeight: rect.height,
				boundsWidth,
				boundsHeight,
			};
			window.addEventListener("pointermove", handleMove);
			window.addEventListener("pointerup", handleUp);
			window.addEventListener("pointercancel", handleUp);
		},
		[getBounds, handleMove, handleUp],
	);

	// Giữ pos mới nhất cho drag bắt đầu giữa chừng (tránh stale closure).
	const posRef = useRef(pos);
	posRef.current = pos;

	const onGripDoubleClick = useCallback(() => {
		reset();
	}, [reset]);

	return { pos, onGripPointerDown, onGripDoubleClick, reset };
}
