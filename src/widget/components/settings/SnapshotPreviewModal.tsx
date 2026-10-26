/**
 * SnapshotPreviewModal
 *
 * A premium modal for previewing a captured chart snapshot before downloading.
 * Supports dark/light mode context, portal rendering, and i18n localization.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useWidgetI18n } from "../../context/WidgetI18nContext";
import { usePortalRoot, useShadowRoot } from "../../context/VNInvestChartsContext";
import { usePortalAdapter } from "../../hooks/usePortalAdapter";
import type { PortalAdapter } from "@vninvestcharts/engine-react";
import { defaultPortalAdapter } from "@vninvestcharts/engine-react";

export interface SnapshotPreviewModalProps {
	isOpen: boolean;
	imageDataUrl: string;
	isDark: boolean;
	/** P1-5c: portal nằm ngoài `.vnsc-root` ⇒ cần scope theme để token `--vnsc-*` resolve. */
	themePreset?: string;
	onClose: () => void;
	onSave: () => void;
	portalAdapter?: PortalAdapter;
}

export function SnapshotPreviewModal({
	isOpen,
	imageDataUrl,
	isDark,
	themePreset,
	onClose,
	onSave,
	portalAdapter,
}: SnapshotPreviewModalProps) {
	const { t } = useWidgetI18n();
	const portalRoot = usePortalRoot();
	const shadowRoot = useShadowRoot();
	const { portalTarget } = usePortalAdapter({ portalAdapter: portalAdapter ?? defaultPortalAdapter });
	const backdropRef = useRef<HTMLDivElement>(null);

	// Close on Escape
	useEffect(() => {
		if (!isOpen) return;
		const handler = (e: Event) => {
			const ke = e as KeyboardEvent;
			if (ke.key === "Escape") onClose();
		};
		// Use shadowRoot for capture-phase listeners in Shadow DOM mode
		const target = shadowRoot ?? document;
		target.addEventListener("keydown", handler, { capture: true });
		return () => target.removeEventListener("keydown", handler, { capture: true });
	}, [isOpen, onClose, shadowRoot]);

	if (!isOpen || !imageDataUrl) return null;

	const safeT = (key: string, fallback: string) => {
		const val = t(key);
		return val === key ? fallback : val;
	};

	if (!portalTarget) return null;

	return createPortal(
		<div
			ref={backdropRef}
			className="vnsc-root vnsc-settings-backdrop"
			data-chart-mode={isDark ? "dark" : "light"}
			data-chart-theme={themePreset}
			role="dialog"
			aria-modal="true"
			data-testid="snapshot-preview-backdrop"
			onClick={(e) => {
				if (e.target === backdropRef.current) onClose();
			}}
		>
			<div
				className="vnsc-settings-modal"
				data-testid="snapshot-preview-modal"
				style={{
					background: "var(--vnsc-bg-primary, #0a0e14)",
					border: "1px solid var(--vnsc-border, #2a2a2a)",
					borderRadius: "8px",
					width: "800px",
					maxWidth: "90vw",
					maxHeight: "85vh",
					display: "flex",
					flexDirection: "column",
					boxShadow: "0 12px 40px rgba(0, 0, 0, 0.5)",
				}}
			>
				{/* Header */}
				<div className="vnsc-settings-modal__header">
					<h2 className="vnsc-settings-modal__title">
						{safeT("snapshot.preview.title", "Snapshot Preview")}
					</h2>
					<button
						type="button"
						className="vnsc-settings-modal__close"
						onClick={onClose}
						title={safeT("settings.dialogClose", "Close")}
					>
						×
					</button>
				</div>

				{/* Body */}
				<div
					className="vnsc-settings-body"
					style={{
						display: "flex",
						flexDirection: "column",
						alignItems: "center",
						gap: "16px",
						overflowY: "auto",
					}}
				>
					{/* Image Preview Container */}
					<div
						style={{
							width: "100%",
							background: isDark ? "#0f131a" : "#f0f2f5",
							border: "1px solid var(--vnsc-border, #2a2a2a)",
							borderRadius: "6px",
							padding: "12px",
							boxSizing: "border-box",
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							overflow: "hidden",
						}}
					>
						<img
							src={imageDataUrl}
							alt="Chart Snapshot Preview"
							style={{
								maxWidth: "100%",
								maxHeight: "50vh",
								objectFit: "contain",
								borderRadius: "4px",
								boxShadow: isDark
									? "0 8px 32px rgba(0, 0, 0, 0.6)"
									: "0 8px 24px rgba(0, 0, 0, 0.15)",
							}}
						/>
					</div>

					{/* Actions */}
					<div
						style={{
							display: "flex",
							justifyContent: "flex-end",
							gap: "12px",
							width: "100%",
							marginTop: "4px",
						}}
					>
						<button
							type="button"
							className="vnsc-btn"
							data-testid="snapshot-preview-cancel"
							onClick={onClose}
							style={{
								padding: "8px 16px",
								background: "transparent",
								border: "1px solid var(--vnsc-border, #2a2a2a)",
								color: "var(--vnsc-text-secondary, #a0a0a0)",
								borderRadius: "4px",
								cursor: "pointer",
								fontWeight: 600,
								fontSize: "13px",
								transition: "all 0.15s ease",
							}}
						>
							{safeT("snapshot.preview.cancel", "Cancel")}
						</button>
						<button
							type="button"
							className="vnsc-btn vnsc-btn--accent"
							data-testid="snapshot-preview-save"
							onClick={onSave}
							style={{
								padding: "8px 20px",
								background: "var(--vnsc-accent, #2962ff)",
								color: "#fff",
								border: "none",
								borderRadius: "4px",
								cursor: "pointer",
								fontWeight: 600,
								fontSize: "13px",
								boxShadow: "0 4px 12px rgba(41, 98, 255, 0.3)",
								transition: "all 0.15s ease",
							}}
						>
							{safeT("snapshot.preview.save", "Save Image")}
						</button>
					</div>
				</div>
			</div>
		</div>,
		portalTarget,
	);
}
