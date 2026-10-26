/**
 * ChartSplitter
 * Library-level draggable pane-splitter for use with usePaneSizes.
 *
 * Renders as an absolutely-positioned overlay on top of a ChartCanvas container.
 * During drag: only moves visually via CSS translateY (no React state churn).
 * On release:  commits total delta to the parent via onCommitDelta (triggers
 *              ChartCanvas remount via key when heights change).
 *
 * Styled by chart-splitter.css (.rsc-splitter). Extra classes can be merged
 * via the `className` prop for custom styling.
 *
 * @example
 * import { ChartSplitter, usePaneSizes } from "@vninvestcharts/widget";
 * import "@vninvestcharts/widget/styles/chart-splitter.css";
 *
 * const { heights, applyDelta, reset, available } = usePaneSizes(chartHeight, { ... });
 *
 * // Between pane[0] and pane[1]:
 * <ChartSplitter
 *   splitterIndex={0}
 *   available={available}
 *   onCommitDelta={applyDelta}
 *   onDoubleClick={reset}
 *   style={{ top: marginTop + heights[0] }}
 * />
 */

import type { CSSProperties, PointerEvent as ReactPointerEvent, ForwardedRef } from "react";
import { useEffect, useRef, useState, useImperativeHandle, memo, useLayoutEffect, forwardRef } from "react";

export interface ChartSplitterProps {
	/** Index of this splitter: 0 = between pane[0] and pane[1], 1 = between pane[1] and pane[2], … */
	splitterIndex: number;

	/** Total usable height passed back to onCommitDelta. Use the `available` value from usePaneSizes. */
	available: number;

	/** Called with the full drag delta (px) when the pointer is released. */
	onCommitDelta: (splitterIndex: number, deltaY: number, available: number) => void;

	/** Optional handler for double-click (e.g. reset to default ratios). */
	onDoubleClick?: () => void;

	/**
	 * Additional CSS class names merged after the default `rsc-splitter` class.
	 * Use to apply custom styling or override defaults.
	 */
	className?: string;

	/** Inline styles merged with the translate preview during drag. */
	style?: CSSProperties;

	/** Tooltip/title shown on hover. */
	title?: string;

	minDeltaY?: number;
	maxDeltaY?: number;
	topHeight?: number;
	bottomHeight?: number;
	/** Accessible name for the separator (WCAG). Falls back to title if not provided. */
	ariaLabel?: string;
	/** Localized labels for the drag badge (Rule 1). Default to Top/Bottom for EN fallback. */
	badgeTopLabel?: string;
	badgeBottomLabel?: string;
}

export interface ChartSplitterHandle {
	/** Synchronize geometry after parent layout commit */
	syncGeometry: () => void;
	/** Get current splitter geometry */
	getGeometry: () => { top: number; height: number } | null;
}

const getNumericTop = (val: any): number | null => {
	if (typeof val === "number") return val;
	if (typeof val === "string") {
		const parsed = parseFloat(val);
		return isNaN(parsed) ? null : parsed;
	}
	return null;
};

// Internal component that uses forwardRef for the DOM element
const ChartSplitterInner = memo(
	forwardRef<HTMLDivElement, ChartSplitterProps>(
		function ChartSplitterInner(
			{
				splitterIndex,
				available,
				onCommitDelta,
				onDoubleClick,
				className,
				style,
				title,
				minDeltaY,
				maxDeltaY,
				topHeight,
				bottomHeight,
				ariaLabel,
				badgeTopLabel,
				badgeBottomLabel,
			}: ChartSplitterProps,
			forwardedRef: ForwardedRef<HTMLDivElement>
		) {
			const [isDragging, setIsDragging] = useState(false);
			const [visualOffset, setVisualOffset] = useState(0);
			const [releasedTop, setReleasedTop] = useState<number | null>(null);
			const rootRef = useRef<HTMLDivElement | null>(null);
			const dragRef = useRef<{ pointerId: number; startY: number } | null>(null);
			const commitRef = useRef(onCommitDelta);
			const availableRef = useRef(available);
			const pendingSyncRef = useRef(false);
			const handleRef = useRef<ChartSplitterHandle | null>(null);

			// Keep refs in sync with the latest props so callbacks are always current.
			useEffect(() => { commitRef.current = onCommitDelta; }, [onCommitDelta]);
			useEffect(() => { availableRef.current = available; }, [available]);

			// Create the imperative handle
			const handle: ChartSplitterHandle = {
				syncGeometry: () => {
					// Called by parent after layout commit to ensure visual offset is cleared
					if (releasedTop !== null) {
						setReleasedTop(null);
						setVisualOffset(0);
					}
				},
				getGeometry: () => {
					const node = rootRef.current;
					if (!node) return null;
					const rect = node.getBoundingClientRect();
					const currentTop = style ? getNumericTop(style.top) : null;
					return {
						top: currentTop ?? rect.top,
						height: rect.height,
					};
				},
			};

			// Store handle in ref for external access
			handleRef.current = handle;

			// Forward the DOM ref
			useImperativeHandle(forwardedRef, () => rootRef.current!, []);

			// If style.top has updated since we released, clear the visual offset immediately during render.
			const currentTop = style ? getNumericTop(style.top) : null;
			if (releasedTop !== null && currentTop !== null && currentTop !== releasedTop) {
				setReleasedTop(null);
				setVisualOffset(0);
			}

			// Safety timeout if parent didn't update style.top
			useEffect(() => {
				if (releasedTop !== null) {
					const timer = setTimeout(() => {
						setReleasedTop(null);
						setVisualOffset(0);
					}, 100);
					return () => clearTimeout(timer);
				}
			}, [releasedTop]);

			// Use useLayoutEffect to sync geometry after DOM mutations but before paint
			// This ensures the visual offset is cleared at the right time in the render cycle
			useLayoutEffect(() => {
				if (pendingSyncRef.current && releasedTop !== null) {
					pendingSyncRef.current = false;
					// Defer to next frame to ensure React commit phase is complete
					requestAnimationFrame(() => {
						setReleasedTop(null);
						setVisualOffset(0);
					});
				}
			}, [releasedTop]);

			const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
				event.preventDefault();
				rootRef.current?.focus();
				rootRef.current?.setPointerCapture(event.pointerId);
				dragRef.current = { pointerId: event.pointerId, startY: event.clientY };
				setIsDragging(true);
				setReleasedTop(null);
				setVisualOffset(0);
			};

			const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
				const drag = dragRef.current;
				if (!drag || drag.pointerId !== event.pointerId) return;
				const raw = event.clientY - drag.startY;
				const clamped = Math.max(minDeltaY ?? -Infinity, Math.min(maxDeltaY ?? Infinity, raw));
				setVisualOffset(clamped);
			};

			const stopDragging = (event: ReactPointerEvent<HTMLDivElement>) => {
				const drag = dragRef.current;
				if (!drag || drag.pointerId !== event.pointerId) return;
				const node = rootRef.current;
				if (node?.hasPointerCapture(event.pointerId)) node.releasePointerCapture(event.pointerId);
				const rawDelta = event.clientY - drag.startY;
				const totalDelta = Math.max(minDeltaY ?? -Infinity, Math.min(maxDeltaY ?? Infinity, rawDelta));
				dragRef.current = null;
				setIsDragging(false);

				if (totalDelta !== 0) {
					const currentTop = style ? getNumericTop(style.top) : null;
					if (currentTop !== null) {
						setReleasedTop(currentTop);
						pendingSyncRef.current = true;
					} else {
						setVisualOffset(0);
					}
					commitRef.current(splitterIndex, totalDelta, availableRef.current);
				} else {
					setVisualOffset(0);
				}
			};

			const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
				let delta: number | null = null;
				const step = event.shiftKey ? 16 : 8;
				switch (event.key) {
					case "ArrowUp":
						delta = -step;
						break;
					case "ArrowDown":
						delta = step;
						break;
					case "Home":
						delta = minDeltaY ?? null;
						break;
					case "End":
						delta = maxDeltaY ?? null;
						break;
					default:
						return;
				}
				if (delta === null || delta === 0) return;
				event.preventDefault();
				const clamped = Math.max(minDeltaY ?? -Infinity, Math.min(maxDeltaY ?? Infinity, delta));
				if (clamped !== 0) {
					commitRef.current(splitterIndex, clamped, availableRef.current);
				}
			};

			const cls = [
				"rsc-splitter",
				isDragging ? "rsc-splitter--dragging" : "",
				className ?? "",
			].filter(Boolean).join(" ");

			const previewTop = typeof topHeight === "number" ? topHeight + visualOffset : undefined;
			const previewBottom = typeof bottomHeight === "number" ? bottomHeight - visualOffset : undefined;
			const topLbl = badgeTopLabel ?? "Top";
			const bottomLbl = badgeBottomLabel ?? "Bottom";
			const badgeText = isDragging && typeof previewTop === "number" && typeof previewBottom === "number" && typeof available === "number" && available > 0
				? `${topLbl} ${Math.round(previewTop)}px (${Math.round((previewTop / available) * 100)}%) ↕ ${bottomLbl} ${Math.round(previewBottom)}px (${Math.round((previewBottom / available) * 100)}%)`
				: null;
			const ariaValueNow = typeof topHeight === "number" && typeof bottomHeight === "number" && topHeight + bottomHeight > 0
				? Math.round((topHeight / (topHeight + bottomHeight)) * 100)
				: undefined;

			return (
				<div
					ref={rootRef}
					className={cls}
					role="separator"
					aria-orientation="horizontal"
					tabIndex={0}
					aria-label={ariaLabel ?? title}
					aria-valuenow={ariaValueNow}
					aria-valuemin={0}
					aria-valuemax={100}
					style={{
						...style,
						transform: visualOffset !== 0 ? `translateY(${visualOffset}px)` : undefined,
					}}
					onPointerDown={handlePointerDown}
					onPointerMove={handlePointerMove}
					onPointerUp={stopDragging}
					onPointerCancel={stopDragging}
					onDoubleClick={onDoubleClick}
					onKeyDown={handleKeyDown}
					title={title}
				>
					{badgeText ? <div className="rsc-splitter__badge">{badgeText}</div> : null}
				</div>
			);
		}
	)
);

ChartSplitterInner.displayName = "ChartSplitter";

// Export a wrapper that exposes the imperative handle via a separate prop
export interface ChartSplitterWithHandleProps extends ChartSplitterProps {
	/** Optional ref to access imperative methods */
	handleRef?: ForwardedRef<ChartSplitterHandle>;
}

export const ChartSplitter = memo(
	forwardRef<HTMLDivElement, ChartSplitterWithHandleProps>(
		function ChartSplitter(
			{
				splitterIndex,
				available,
				onCommitDelta,
				onDoubleClick,
				className,
				style,
				title,
				minDeltaY,
				maxDeltaY,
				topHeight,
				bottomHeight,
				ariaLabel,
				badgeTopLabel,
				badgeBottomLabel,
				handleRef,
			}: ChartSplitterWithHandleProps,
			forwardedRef: ForwardedRef<HTMLDivElement>
		) {
			const innerHandleRef = useRef<ChartSplitterHandle | null>(null);

			// Expose the handle to the parent via handleRef
			useImperativeHandle(handleRef, () => innerHandleRef.current!, [innerHandleRef]);

			return (
				<ChartSplitterInner
					ref={forwardedRef}
					splitterIndex={splitterIndex}
					available={available}
					onCommitDelta={onCommitDelta}
					onDoubleClick={onDoubleClick}
					className={className}
					style={style}
					title={title}
					minDeltaY={minDeltaY}
					maxDeltaY={maxDeltaY}
					topHeight={topHeight}
					bottomHeight={bottomHeight}
					ariaLabel={ariaLabel}
					badgeTopLabel={badgeTopLabel}
					badgeBottomLabel={badgeBottomLabel}
				/>
			);
		}
	)
);

ChartSplitter.displayName = "ChartSplitter";