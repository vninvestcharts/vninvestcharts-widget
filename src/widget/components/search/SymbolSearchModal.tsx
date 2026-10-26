/**
 * P2-c: SymbolSearchModal — centered TradingView-style symbol search dialog.
 * Wraps VNSymbolSearch (keyboard nav / filters / recents reused as-is).
 * Renders fixed-position so it centers on viewport incl. Shadow DOM hosts.
 */
import { useEffect, type MouseEvent, type ReactNode } from "react";
import { useWidgetI18n } from "../../context/WidgetI18nContext";
import styles from "../../styles/symbol-search.module.css";

export interface SymbolSearchModalProps {
	open: boolean;
	onClose: () => void;
	children?: ReactNode;
}

export function SymbolSearchModal({ open, onClose, children }: SymbolSearchModalProps) {
	const { t } = useWidgetI18n();

	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.stopPropagation();
				onClose();
			}
		};
		window.addEventListener("keydown", onKey, { capture: true });
		return () => window.removeEventListener("keydown", onKey, { capture: true });
	}, [open, onClose]);

	if (!open) return null;

	const onBackdropMouseDown = (e: MouseEvent<HTMLDivElement>) => {
		if (e.target === e.currentTarget) onClose();
	};

	return (
		<div className={styles.modalBackdrop} onMouseDown={onBackdropMouseDown} role="presentation">
			<div
				className={styles.modalPanel}
				role="dialog"
				aria-modal="true"
				aria-label={t("symbolSearch.placeholder", { defaultValue: "Search symbol..." })}
			>
				{children}
			</div>
		</div>
	);
}
