import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	useDrawingAlertEvaluator,
	type DrawingAlertToastItem,
} from "@vninvestcharts/engine-react";
import type { DrawingAlertCondition, DrawingObject } from "@vninvestcharts/engine-drawing";

/**
 * W1.1 — nối alert engine (đã có sẵn trong engine, trước đây không ai render).
 *
 * Vì sao đây là việc quan trọng nhất của Wave 1: alert là tính năng người dùng
 * retail đánh giá cao nhất, engine đã có **đủ** logic (`evaluateDrawingAlerts`,
 * `useDrawingAlertEvaluator`, `AlertNotificationToast`) nhưng chưa module nào
 * gọi tới. Ở đây chỉ là nối dây.
 *
 * Ràng buộc đã xử lý trước khi nối:
 *  - `resolveReferencePriceForAlert` từng nội suy bằng `nowMs` (epoch ms) trên
 *    trục `point.x` là PIXEL ⇒ ra giá vô nghĩa cho đường chéo. Đã sửa ở engine
 *    (dùng `yPrice` + `timeMsHint`; thiếu mốc thời gian th�� trả null = không
 *    bắn) và khoá bằng test. Không sửa thì nối vào sẽ bắn sai giá.
 *  - Alert chỉ chạy trong tab ⇒ badge "chỉ hoạt động khi tab mở" (EP-2 chưa có).
 *
 * Gate: capability `alert_drawing` (pro). Community không được bắn alert.
 */

export interface UseDrawingAlertsOptions {
	enabled: boolean;
	drawings: readonly DrawingObject[];
	plotData: readonly { close?: number | null }[];
	updateDrawing: (id: string, patch: Partial<DrawingObject>) => void;
	/** Người dùng bật/tắt nhóm alert (UI). Mặc định bật. */
	muted?: boolean;
}

export interface UseDrawingAlertsResult {
	items: DrawingAlertToastItem[];
	dismiss: (id: string) => void;
	clear: () => void;
	/** Có đang hiện cảnh báo "local only" không. */
	isLocalOnly: boolean;
}

let seq = 0;

export function useDrawingAlerts({
	enabled,
	drawings,
	plotData,
	updateDrawing,
	muted = false,
}: UseDrawingAlertsOptions): UseDrawingAlertsResult {
	const [items, setItems] = useState<DrawingAlertToastItem[]>([]);
	// Callback phải ổn định: hook evaluator đặt nó trong deps của useEffect,
	// nếu tạo mới mỗi render thì effect chạy lại liên tục.
	type AlertCallback = (
		drawing: DrawingObject,
		condition: DrawingAlertCondition,
		currentPrice: number,
	) => void;
	const onAlert = useRef<AlertCallback | undefined>(undefined);

	const handleAlert = useCallback<AlertCallback>((drawing, condition, currentPrice) => {
		seq += 1;
		const item: DrawingAlertToastItem = {
			id: `alert-${drawing.id}-${seq}`,
			drawingType: drawing.type,
			direction: condition.direction === "crossBelow" ? "crossBelow" : "crossAbove",
			price: currentPrice,
			timestamp: Date.now(),
		};
		// Giữ tối đa 3 toast: nhiều hơn thì chắn màn hình.
		setItems((prev) => [item, ...prev].slice(0, 3));
	}, []);

	// Chỉ truyền callback khi thật sự bật — evaluator sớm return nếu undefined.
	onAlert.current = enabled && !muted ? handleAlert : undefined;

	useDrawingAlertEvaluator({
		drawings: drawings as DrawingObject[],
		plotData,
		updateDrawing,
		onDrawingAlert: onAlert.current,
	});

	const dismiss = useCallback((id: string) => {
		setItems((prev) => prev.filter((i) => i.id !== id));
	}, []);
	const clear = useCallback(() => setItems([]), []);

	// Tắt cảnh báo thì dọn toast đang treo, không để lại thông báo cũ.
	useEffect(() => {
		if (!enabled || muted) setItems([]);
	}, [enabled, muted]);

	return useMemo(
		() => ({ items, dismiss, clear, isLocalOnly: enabled }),
		[items, dismiss, clear, enabled],
	);
}
