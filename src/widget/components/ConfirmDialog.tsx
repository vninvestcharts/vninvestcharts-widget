import { useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useDialogFocus } from "../hooks/useDialogFocus";

export interface ConfirmDialogProps {
	open: boolean;
	title?: string;
	message: string;
	confirmLabel?: string;
	cancelLabel?: string;
	variant?: "danger" | "default";
	onConfirm: () => void;
	onCancel: () => void;
	portalRoot?: HTMLElement | null;
}

export function ConfirmDialog({
	open,
	title,
	message,
	confirmLabel = "OK",
	cancelLabel = "Cancel",
	variant = "default",
	onConfirm,
	onCancel,
	portalRoot,
}: ConfirmDialogProps) {
	const confirmRef = useRef<HTMLButtonElement>(null);
	const panelRef = useRef<HTMLDivElement>(null);

	// UX-02: shared dialog focus contract — initial focus, Tab loop, Escape and
	// focus restore to the trigger. Replaces the ad-hoc timers above.
	useDialogFocus(panelRef, { open, onEscape: onCancel, initialFocusRef: confirmRef });

	if (!open) return null;

	const dialog = (
		<div
			style={{
				position: "fixed",
				inset: 0,
				zIndex: 2147483000,
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				background: "rgba(0,0,0,0.35)",
			}}
			onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
			role="dialog"
			aria-modal="true"
			aria-label={title ?? message}
		>
			<div
				ref={panelRef}
				style={{
					// T6: portal lands on document.body (no .vnsc-root) — every
					// var carries a dark fallback (portal law, option B).
					background: "var(--vnsc-bg-modal, #1e222d)",
					color: "var(--vnsc-text-primary, #d1d4dc)",
					borderRadius: "var(--vnsc-radius-modal, 12px)",
					padding: "var(--vnsc-space-modal-padding, 24px)",
					minWidth: 300,
					maxWidth: 420,
					boxShadow: "var(--vnsc-shadow-modal, 0 8px 32px rgba(0,0,0,0.4))",
					display: "flex",
					flexDirection: "column",
					gap: "var(--vnsc-space-4, 16px)",
				}}
			>
				{title && (
					<div style={{ fontSize: "var(--vnsc-font-size-lg, 16px)", fontWeight: 600, lineHeight: 1.4 }}>{title}</div>
				)}
				<div style={{ fontSize: "var(--vnsc-font-size-md, 14px)", lineHeight: 1.5, opacity: 0.9 }}>{message}</div>
				<div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
					<button
						onClick={onCancel}
						style={{
							padding: "var(--vnsc-space-2, 8px) var(--vnsc-space-4, 16px)",
							borderRadius: "var(--vnsc-radius-button, 8px)",
							border: "1px solid var(--vnsc-border, rgba(255,255,255,0.12))",
							background: "transparent",
							color: "var(--vnsc-text-primary, #d1d4dc)",
							fontSize: "var(--vnsc-font-size-base, 13px)",
							cursor: "pointer",
						}}
					>
						{cancelLabel}
					</button>
					<button
						ref={confirmRef}
						onClick={onConfirm}
						style={{
							padding: "var(--vnsc-space-2, 8px) var(--vnsc-space-4, 16px)",
							borderRadius: "var(--vnsc-radius-button, 8px)",
							border: "none",
							background: variant === "danger" ? "var(--vnsc-color-error, #dc2626)" : "var(--vnsc-color-primary, #2563eb)",
							color: "var(--vnsc-text-on-primary, #fff)",
							fontSize: "var(--vnsc-font-size-base, 13px)",
							fontWeight: 600,
							cursor: "pointer",
						}}
					>
						{confirmLabel}
					</button>
				</div>
			</div>
		</div>
	);

	const mountTarget = portalRoot || (typeof document !== "undefined" ? document.body : null);
	return mountTarget ? createPortal(dialog, mountTarget) : null;
}
