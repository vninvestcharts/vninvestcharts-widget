import { useRef } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";

export interface PaneSplitterProps {
	onResize: (topPaneNewHeightPx: number) => void;
	minTopHeight?: number;
	minBottomHeight?: number;
	className?: string;
	style?: CSSProperties;
}

interface DragState {
	startY: number;
	startTopHeight: number;
	maxTopHeight: number;
}

function clamp(value: number, minValue: number, maxValue: number) {
	return Math.min(Math.max(value, minValue), maxValue);
}

export function PaneSplitter({ onResize, minTopHeight = 40, minBottomHeight = 40, className, style }: PaneSplitterProps) {
	const dragStateRef = useRef<DragState | null>(null);

	const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
		const splitterElement = event.currentTarget;
		const topPaneElement = splitterElement.previousElementSibling as HTMLElement | null;
		const bottomPaneElement = splitterElement.nextElementSibling as HTMLElement | null;
		if (!topPaneElement) {
			return;
		}

		const startTopHeight = topPaneElement.getBoundingClientRect().height;
		const availableHeight = startTopHeight + (bottomPaneElement?.getBoundingClientRect().height ?? 0);
		dragStateRef.current = {
			startY: event.clientY,
			startTopHeight,
			maxTopHeight: Math.max(minTopHeight, availableHeight - minBottomHeight),
		};

		const handleMove = (moveEvent: PointerEvent) => {
			const dragState = dragStateRef.current;
			if (!dragState) {
				return;
			}

			const deltaY = moveEvent.clientY - dragState.startY;
			const nextHeight = clamp(dragState.startTopHeight + deltaY, minTopHeight, dragState.maxTopHeight);
			onResize(nextHeight);
		};

		const handleUp = () => {
			dragStateRef.current = null;
			window.removeEventListener("pointermove", handleMove);
			window.removeEventListener("pointerup", handleUp);
		};

		window.addEventListener("pointermove", handleMove);
		window.addEventListener("pointerup", handleUp, { once: true });
		(splitterElement as HTMLDivElement).setPointerCapture(event.pointerId);
	};

	const mergedStyle: CSSProperties = {
		cursor: "row-resize",
		height: 8,
		flex: "0 0 auto",
		touchAction: "none",
		background: "linear-gradient(90deg, transparent, rgba(120, 130, 150, 0.6), transparent)",
		...style,
	};

	return (
		<div
			role="separator"
			aria-orientation="horizontal"
			tabIndex={0}
			className={className}
			style={mergedStyle}
			onPointerDown={handlePointerDown}
		/>
	);
}