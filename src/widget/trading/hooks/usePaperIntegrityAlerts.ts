/**
 * F-TRADE-01 — phần hiển thị: nối lỗi toàn vẹn của broker vào toast, theo lựa chọn của
 * người dùng trong Paper settings.
 *
 * Cố ý TÁI DÙNG `useToasts()` sẵn có (không chế cơ chế cảnh báo mới).
 *
 * ⚠ Cố ý **KHÔNG** dùng `setInterval`/`setTimeout`: phiên bản đầu poll
 * `getBarRejectionCount()` mỗi 5 giây và làm đỏ cổng `audit:dom-access` (budget 436/434,
 * 1 file mới). Đã thay bằng event `barRejected` phát từ tầng lõi — nhanh hơn, chính xác hơn,
 * và không kéo DOM vào tầng widget.
 *
 * Ba chế độ người dùng chọn (`integrityFailureMode`) khác nhau ở chỗ **mức báo**:
 *   - `warn`   — luôn hiện toast.
 *   - `block`  — hiện toast (tông `warn`): việc này cần người dùng xử lý.
 *   - `strict` — người dùng chọn "từ chối im lặng", nên **không** toast. Im lặng là lựa
 *                chọn của họ, không phải sự quên.
 *
 * Chống spam: mỗi loại lỗi chỉ báo **một lần** trong `REPEAT_SUPPRESS_MS`. Không có cơ chế
 * này, một vòng lưu hỏng sẽ đổ toast liên tục.
 */
import { useEffect, useRef } from "react";
import type { VirtualBrokerEngine } from "../../../lib/core/trading/VirtualBrokerEngine";
import type { IntegrityFailureMode } from "../config/paperRuntimeConfig";
import { useToasts } from "../../components/Toast";
import { useWidgetI18n } from "../../context/WidgetI18nContext";

export interface UsePaperIntegrityAlertsOptions {
	broker: VirtualBrokerEngine | null;
	mode: IntegrityFailureMode;
	/** Cho phép tắt hoàn toàn (ví dụ bề mặt không cần cảnh báo). Mặc định bật. */
	enabled?: boolean;
}

/** Cửa sổ tối thiểu giữa hai lần báo cùng loại. Không phải "chống spam" tuyệt đối. */
const REPEAT_SUPPRESS_MS = 60_000;

export function usePaperIntegrityAlerts({
	broker,
	mode,
	enabled = true,
}: UsePaperIntegrityAlertsOptions): void {
	const { pushToast } = useToasts();
	const { t } = useWidgetI18n();
	const lastPersistAt = useRef<number>(Number.NEGATIVE_INFINITY);
	const lastBarAt = useRef<number>(Number.NEGATIVE_INFINITY);
	// Ref chứa mode để effect không phải re-subscribe mỗi lần người dùng đổi lựa chọn.
	const modeRef = useRef(mode);
	modeRef.current = mode;

	useEffect(() => {
		if (!enabled || !broker) return;
		/** `strict` = người dùng chọn im lặng. Không phải mặc định thì đều báo. */
		const shouldAnnounce = (m: IntegrityFailureMode) => m !== "strict";

		const offPersist = broker.on("persistError", () => {
			const now = Date.now();
			if (now - lastPersistAt.current < REPEAT_SUPPRESS_MS) return;
			lastPersistAt.current = now;
			if (!shouldAnnounce(modeRef.current)) return;
			pushToast(t("widget.trading.persistFailedToast"), "error");
		});

		const offBar = broker.on("barRejected", ({ count }) => {
			const now = Date.now();
			if (now - lastBarAt.current < REPEAT_SUPPRESS_MS) return;
			lastBarAt.current = now;
			if (!shouldAnnounce(modeRef.current)) return;
			pushToast(t("widget.trading.barRejectedToast", { count: String(count) }), "warn");
		});

		return () => {
			offPersist();
			offBar();
		};
	}, [broker, enabled, pushToast, t]);
}
