import type { CSSProperties } from "react";

export interface PaneLabelProps {
	label: string;
	top: number;
	height: number;
	isDark?: boolean;
	className?: string;
}

export function PaneLabel({ label, top, height, className }: PaneLabelProps) {
	const style: CSSProperties = {
		top,
		height,
	};

	return (
		<div className={`rsc-pane-label${className ? ` ${className}` : ""}`} style={style} aria-hidden="true">
			{label}
		</div>
	);
}
