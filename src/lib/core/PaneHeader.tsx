import type { CSSProperties, ReactNode, RefObject, DragEvent as ReactDragEvent } from "react";
import type { PaneDescriptor } from "./types/pane-descriptor";
import { isDefaultPaneId } from "./types/pane-descriptor";

export interface PaneHeaderProps {
	pane: PaneDescriptor;
	onToggleVisible: () => void;
	onRemove: () => void;
	onAddSeries?: () => void;
	onDragStart?: (event: ReactDragEvent<HTMLButtonElement>) => void;
	addButtonRef?: RefObject<HTMLButtonElement | null>;
	className?: string;
	children?: ReactNode;
	style?: CSSProperties;
	labels?: {
		dragAriaLabel?: (paneLabel: string) => string;
		dragTitle?: (pane: PaneDescriptor) => string;
		addSeriesAriaLabel?: (paneLabel: string) => string;
		addSeriesTitle?: string;
		toggleVisibleAriaLabel?: (paneLabel: string, visible: boolean) => string;
		toggleVisibleTitle?: (pane: PaneDescriptor) => string;
		removeAriaLabel?: (paneLabel: string) => string;
		removeTitle?: string;
	};
}

export function PaneHeader({ pane, onToggleVisible, onRemove, onAddSeries, onDragStart, addButtonRef, className, children, labels, style: externalStyle }: PaneHeaderProps) {
	const style: CSSProperties = externalStyle ?? {};

	return (
		<div className={`rsc-pane-header${className ? ` ${className}` : ""}`} style={style}>
			{/* UI-P2: skip the static label when an embedded legend (children) or
				series chips already identify the pane (e.g. "Vol" chip vs "Khối lượng"). */}
			{children || pane.series.length > 0 ? null : (
				<span className="rsc-pane-header__label">{pane.label}</span>
			)}
			{children ? <div className="rsc-pane-header__content">{children}</div> : null}
			<div className="rsc-pane-header__actions">
				{onDragStart ? (
					<button
						type="button"
						className="rsc-pane-btn rsc-pane-btn--drag"
						draggable={!pane.pinned}
						onDragStart={onDragStart}
						aria-label={labels?.dragAriaLabel?.(pane.label) ?? `Kéo ${pane.label}`}
						title={labels?.dragTitle?.(pane) ?? (pane.pinned ? "Pane chính không thể kéo" : "Kéo để đổi vị trí pane")}
					>
						⠿
					</button>
				) : null}
				{onAddSeries ? (
					<button
						ref={addButtonRef}
						type="button"
						className="rsc-pane-btn"
						onClick={onAddSeries}
						aria-label={labels?.addSeriesAriaLabel?.(pane.label) ?? `Thêm series cho ${pane.label}`}
						title={labels?.addSeriesTitle ?? "Thêm indicator/series"}
					>
						+
					</button>
				) : null}
				<button
					type="button"
					className="rsc-pane-btn"
					onClick={onToggleVisible}
					disabled={pane.pinned}
					aria-label={labels?.toggleVisibleAriaLabel?.(pane.label, pane.visible) ?? (pane.visible ? `Ẩn ${pane.label}` : `Hiện ${pane.label}`)}
					title={labels?.toggleVisibleTitle?.(pane) ?? (pane.pinned ? "Pane chính luôn hiển thị" : pane.visible ? "Ẩn pane" : "Hiện lại pane")}
				>
					{pane.visible ? "👁" : "◌"}
				</button>
				{!pane.pinned && !isDefaultPaneId(pane.id) ? (
					<button
						type="button"
						className="rsc-pane-btn"
						onClick={onRemove}
						aria-label={labels?.removeAriaLabel?.(pane.label) ?? `Ẩn ${pane.label}`}
						title={labels?.removeTitle ?? "Ẩn pane (có thể khôi phục từ menu Panes)"}
					>
						×
					</button>
				) : null}
			</div>
		</div>
	);
}
