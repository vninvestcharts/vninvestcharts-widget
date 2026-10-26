// Dismissible notice for drawing sync conflicts (Slice E2 — SY-06 UX).
// Shown when a concurrently-edited drawing resolves in favor of the REMOTE op
// (the local drawing visibly changed). Winner-picking is P2 (the engine
// auto-applies last-writer-wins today, so there is nothing to revert yet).
// Text via widget i18n keys (Rule 1); safe default when no provider is mounted.

import { useWidgetI18n } from "../../context/WidgetI18nContext";

export interface DrawingConflictNoticeProps {
	onDismiss: () => void;
}

export function DrawingConflictNotice({ onDismiss }: DrawingConflictNoticeProps) {
	const { t } = useWidgetI18n();
	return (
		<div
			role="status"
			data-testid="drawing-conflict-notice"
			style={{
				position: "absolute",
				top: 8,
				right: 8,
				zIndex: 20,
				display: "flex",
				alignItems: "center",
				gap: 8,
				maxWidth: 320,
				padding: "6px 10px",
				borderRadius: 6,
				background: "rgba(20, 22, 28, 0.92)",
				color: "#f5f5f5",
				fontSize: 12,
				lineHeight: 1.4,
				boxShadow: "0 2px 8px rgba(0, 0, 0, 0.35)",
			}}
		>
			<span>
				<strong>{t("drawing.syncConflictTitle")}</strong>
				{": "}
				{t("drawing.syncConflictRemoteWon")}
			</span>
			<button
				type="button"
				aria-label={t("drawing.syncConflictDismiss")}
				onClick={onDismiss}
				style={{
					flexShrink: 0,
					border: "none",
					background: "transparent",
					color: "inherit",
					fontSize: 14,
					cursor: "pointer",
					padding: "0 2px",
				}}
			>
				×
			</button>
		</div>
	);
}
