import { memo } from "react";
import { useWidgetI18n } from "./context/WidgetI18nContext";
import { toWidgetError, ERROR_MESSAGE_KEYS } from "./utils/widgetErrors";

export interface WidgetEmptyStateProps {
	loading: boolean;
	error?: Error | null;
	/**
	 * UX-05: recovery action. The error copy tells the user to retry, so the
	 * state must actually offer one — previously the only way out was reloading
	 * the page.
	 */
	onRetry?: () => void;
}

export const WidgetEmptyState = memo(function WidgetEmptyState({ loading, error, onRetry }: WidgetEmptyStateProps) {
	const { t } = useWidgetI18n();

	// UX-05: never render `error.message` to the user. It is a raw JS/network
	// string, so a failed fetch showed an untranslated "Failed to fetch" in the
	// middle of the Vietnamese UI. Map the error onto the existing coded
	// taxonomy instead, and keep the raw text available for support via a
	// data attribute (it is not visible, and `?vnsc_diag=1` is the main channel).
	const code = error ? toWidgetError(error).code : null;
	// ERROR_MESSAGE_KEYS is the existing code -> i18n key map; do not build the
	// key from the code itself (`error.DATA_FETCH` is not a real key).
	const messageKey = code ? ERROR_MESSAGE_KEYS[code] : "widget.error";
	const copy = loading
		? t("widget.loading")
		: error
			? t(messageKey, { defaultValue: t("error.unknown") })
			: t("widget.noData");

	const wrapperRole = error ? "alert" : "status";
	const wrapperLive = error ? "assertive" : "polite";

	return (
		<div
			role={wrapperRole}
			aria-live={wrapperLive}
			data-error-code={code ?? undefined}
			data-error-message={error?.message}
			style={{
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				flexDirection: "column",
				gap: 12,
				minHeight: 320,
				padding: 24,
				borderRadius: 16,
				background: error ? "rgba(239, 68, 68, 0.05)" : "linear-gradient(180deg, rgba(2, 6, 23, 0.03), rgba(2, 6, 23, 0.06))",
				color: error ? "#b91c1c" : "#334155",
				border: error ? "1px solid rgba(239, 68, 68, 0.15)" : "none",
				fontSize: 14,
				fontWeight: 600,
			}}
		>
			{loading ? (
				<span
					aria-hidden="true"
					className="vnsc-spinner"
				/>
			) : null}
			<span>{copy}</span>
			{error && onRetry ? (
				<button
					type="button"
					onClick={onRetry}
					style={{
						padding: "8px 16px",
						borderRadius: 8,
						border: "1px solid currentColor",
						background: "transparent",
						color: "inherit",
						fontSize: 13,
						fontWeight: 600,
						cursor: "pointer",
					}}
				>
					{t("error.retry")}
				</button>
			) : null}
		</div>
	);
});

