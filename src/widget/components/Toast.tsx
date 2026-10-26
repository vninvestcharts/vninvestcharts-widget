import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { useWidgetI18n } from "../context/WidgetI18nContext";
import styles from "./Toast.module.css";

export type ToastTone = "info" | "success" | "warn" | "error";

export interface ToastItem {
	id: number;
	message: string;
	tone: ToastTone;
}

interface ToastContextValue {
	toasts: readonly ToastItem[];
	pushToast: (message: string, tone?: ToastTone, timeoutMs?: number) => number;
	dismissToast: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_TIMEOUT: Record<ToastTone, number> = {
	info: 4000,
	success: 4000,
	warn: 6000,
	error: 8000,
};

/** BL-10: app-level toast provider. Mount once near the widget root. */
export function ToastProvider({ children }: { children: ReactNode }) {
	const [toasts, setToasts] = useState<ToastItem[]>([]);
	const nextIdRef = useRef(1);
	const timersRef = useRef(new Map<number, ReturnType<typeof setTimeout>>());

	const dismissToast = useCallback((id: number) => {
		const timer = timersRef.current.get(id);
		if (timer) {
			clearTimeout(timer);
			timersRef.current.delete(id);
		}
		setToasts((prev) => prev.filter((t) => t.id !== id));
	}, []);

	const pushToast = useCallback((message: string, tone: ToastTone = "info", timeoutMs?: number) => {
		const id = nextIdRef.current++;
		setToasts((prev) => [...prev.slice(-4), { id, message, tone }]);
		const timer = setTimeout(() => dismissToast(id), timeoutMs ?? DEFAULT_TIMEOUT[tone]);
		timersRef.current.set(id, timer);
		return id;
	}, [dismissToast]);

	const value = useMemo(() => ({ toasts, pushToast, dismissToast }), [toasts, pushToast, dismissToast]);
	return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

/**
 * F-TRADE-01: thiếu provider KHÔNG phải lỗi — chỉ là "không có chỗ để hiện".
 *
 * Trước đây hàm này **ném**, và `TradingProvider` dùng nó qua
 * `usePaperIntegrityAlerts`. `TradingProvider` được mount ở nhiều test và vài bề mặt nhúng
 * **không** bọc `ToastProvider` — đo được 28 test đỏ, không phải phỏng đoán. Sửa 28 test kia
 * để phục vụ một cảnh báo phụ là làm sai mục đích của chúng.
 *
 * ⇒ Không có provider thì trả no-op. `pushToast` vẫn trả `number` để call site không đổi.
 */
export function useToasts(): ToastContextValue {
	const ctx = useContext(ToastContext);
	if (!ctx) return NOOP_CONTEXT;
	return ctx;
}

const NOOP_CONTEXT: ToastContextValue = {
	toasts: [],
	pushToast: () => -1,
	dismissToast: () => undefined,
};

/** BL-10: toast stack. Mount once near the widget root, after ToastProvider. */
export function ToastHost() {
	const ctx = useContext(ToastContext);
	const { t } = useWidgetI18n();
	if (!ctx) return null;
	const { toasts, dismissToast } = ctx;
	if (toasts.length === 0) return null;
	return (
		<div className={styles.stack} role="log" aria-live="polite">
			{toasts.map((toast) => (
				<div
					key={toast.id}
					className={`${styles.toast} ${styles[toast.tone] ?? ""}`}
					role={toast.tone === "error" ? "alert" : "status"}
				>
					<span className={styles.message}>{toast.message}</span>
					<button
						type="button"
						className={styles.dismiss}
						aria-label={t("toast.dismiss")}
						onClick={() => dismissToast(toast.id)}
					>
						×
					</button>
				</div>
			))}
		</div>
	);
}
