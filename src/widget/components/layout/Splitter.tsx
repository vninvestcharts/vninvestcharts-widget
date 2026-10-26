import React, { useRef, useCallback, useEffect, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type KeyboardEvent as ReactKeyboardEvent, type TouchEvent as ReactTouchEvent } from "react";
import styles from "./Splitter.module.css";

export type SplitterDirection = "horizontal" | "vertical";

export interface SplitterProps {
  direction: SplitterDirection;
  minSize: number;      // pixels or percentage
  maxSize: number;
  onResize: (sizes: number[]) => void;
  keyboardStep?: number; // for keyboard navigation
  initialSizes?: number[];
  className?: string;
  style?: CSSProperties;
  "aria-label"?: string;
  "aria-valuemin"?: number;
  "aria-valuemax"?: number;
  "aria-valuenow"?: number;
  children?: React.ReactNode;
}

interface SplitterState {
  sizes: number[];
  isDragging: boolean;
  dragStartPos: { x: number; y: number };
  dragStartSizes: number[];
  focusedIndex: number | null;
}

const DEFAULT_KEYBOARD_STEP = 10; // pixels
const MIN_DRAG_THRESHOLD = 2; // pixels

/**
 * @deprecated Use `useGridSplitterDrag` for multi-chart grid layouts or `ChartSplitter` for pane layouts.
 * Generic percentage-based container splitter. Maintained for backwards compatibility.
 */
export const Splitter: React.FC<SplitterProps> = ({
	direction,
	minSize,
	maxSize,
	onResize,
	keyboardStep = DEFAULT_KEYBOARD_STEP,
	initialSizes = [],
	className = "",
	style,
	"aria-label": ariaLabel = "Splitter",
	"aria-valuemin": ariaValueMin = 0,
	"aria-valuemax": ariaValueMax = 100,
	"aria-valuenow": ariaValueNow = 50,
	children,
}) => {
	const [state, setState] = useState<SplitterState>({
		sizes: initialSizes.length > 0 ? initialSizes : [50, 50],
		isDragging: false,
		dragStartPos: { x: 0, y: 0 },
		dragStartSizes: [],
		focusedIndex: null,
	});

	const containerRef = useRef<HTMLDivElement>(null);
	const handleRefs = useRef<(HTMLDivElement | null)[]>([]);

	// Normalize sizes to ensure they sum to 100%
	const normalizeSizes = useCallback((sizes: number[]): number[] => {
		const total = sizes.reduce((sum, size) => sum + size, 0);
		if (total === 0) return sizes.map(() => 100 / sizes.length);
		return sizes.map(size => (size / total) * 100);
	}, []);

	// Clamp size to min/max bounds
	const clampSize = useCallback((size: number, index: number, allSizes: number[]): number => {
		const otherSizes = allSizes.filter((_, i) => i !== index);
		const otherTotal = otherSizes.reduce((sum, s) => sum + s, 0);
		const available = 100 - otherTotal;
		return Math.max(minSize, Math.min(maxSize, Math.min(size, available)));
	}, [minSize, maxSize]);

	// Update sizes and notify parent
	const updateSizes = useCallback((newSizes: number[]) => {
		const normalized = normalizeSizes(newSizes);
		setState(prev => ({ ...prev, sizes: normalized }));
		onResize(normalized);
	}, [normalizeSizes, onResize]);

	// Mouse drag handlers
	const handleMouseDown = useCallback((index: number, event: ReactMouseEvent<HTMLDivElement>) => {
		event.preventDefault();
		event.stopPropagation();

		const startPos = { x: event.clientX, y: event.clientY };
		const startSizes = [...state.sizes];

		setState(prev => ({
			...prev,
			isDragging: true,
			dragStartPos: startPos,
			dragStartSizes: startSizes,
			focusedIndex: index,
		}));

		const handleMouseMove = (moveEvent: MouseEvent) => {
			const deltaX = moveEvent.clientX - startPos.x;
			const deltaY = moveEvent.clientY - startPos.y;

			const container = containerRef.current;
			if (!container) return;

			const rect = container.getBoundingClientRect();
			const containerSize = direction === "horizontal" ? rect.width : rect.height;

			// Calculate percentage change
			const deltaPercent = direction === "horizontal"
				? (deltaX / containerSize) * 100
				: (deltaY / containerSize) * 100;

			const newSizes = [...startSizes];
			const currentIndex = index;

			// Adjust current pane and next pane
			if (currentIndex < newSizes.length - 1) {
				newSizes[currentIndex] = clampSize(newSizes[currentIndex] + deltaPercent, currentIndex, newSizes);
				newSizes[currentIndex + 1] = clampSize(newSizes[currentIndex + 1] - deltaPercent, currentIndex + 1, newSizes);
			} else if (currentIndex > 0) {
				// If dragging the last handle, adjust previous pane
				newSizes[currentIndex - 1] = clampSize(newSizes[currentIndex - 1] - deltaPercent, currentIndex - 1, newSizes);
				newSizes[currentIndex] = clampSize(newSizes[currentIndex] + deltaPercent, currentIndex, newSizes);
			}

			updateSizes(newSizes);
		};

		const handleMouseUp = () => {
			document.removeEventListener("mousemove", handleMouseMove);
			document.removeEventListener("mouseup", handleMouseUp);
			setState(prev => ({ ...prev, isDragging: false }));
		};

		document.addEventListener("mousemove", handleMouseMove);
		document.addEventListener("mouseup", handleMouseUp);
	}, [direction, state.sizes, clampSize, updateSizes]);

	// Keyboard navigation
	const handleKeyDown = useCallback((index: number, event: ReactKeyboardEvent<HTMLDivElement>) => {
		const { key, shiftKey, ctrlKey, metaKey } = event;
		const step = keyboardStep;
		const fineStep = step / 5; // Shift for fine adjustment
		const jumpStep = 25; // Ctrl for jump

		let delta = 0;
		let shouldHandle = false;

		switch (key) {
			case "ArrowRight":
			case "ArrowDown":
				delta = shiftKey ? fineStep : ctrlKey || metaKey ? jumpStep : step;
				shouldHandle = true;
				break;
			case "ArrowLeft":
			case "ArrowUp":
				delta = -(shiftKey ? fineStep : ctrlKey || metaKey ? jumpStep : step);
				shouldHandle = true;
				break;
			case "Home":
				delta = -state.sizes[index]; // Reset to min
				shouldHandle = true;
				break;
			case "End":
				delta = maxSize - state.sizes[index]; // Jump to max
				shouldHandle = true;
				break;
			default:
				return;
		}

		if (shouldHandle) {
			event.preventDefault();
			event.stopPropagation();

			const newSizes = [...state.sizes];
			const currentIndex = index;

			if (currentIndex < newSizes.length - 1) {
				newSizes[currentIndex] = clampSize(newSizes[currentIndex] + delta, currentIndex, newSizes);
				newSizes[currentIndex + 1] = clampSize(newSizes[currentIndex + 1] - delta, currentIndex + 1, newSizes);
			} else if (currentIndex > 0) {
				newSizes[currentIndex - 1] = clampSize(newSizes[currentIndex - 1] - delta, currentIndex - 1, newSizes);
				newSizes[currentIndex] = clampSize(newSizes[currentIndex] + delta, currentIndex, newSizes);
			}

			updateSizes(newSizes);
			setState(prev => ({ ...prev, focusedIndex: currentIndex }));
		}
	}, [keyboardStep, state.sizes, clampSize, updateSizes, maxSize]);

	// Touch drag handlers
	const handleTouchStart = useCallback((index: number, event: ReactTouchEvent<HTMLDivElement>) => {
		event.preventDefault();
		event.stopPropagation();

		const touch = event.touches[0];
		const startPos = { x: touch.clientX, y: touch.clientY };
		const startSizes = [...state.sizes];

		setState(prev => ({
			...prev,
			isDragging: true,
			dragStartPos: startPos,
			dragStartSizes: startSizes,
			focusedIndex: index,
		}));

		const handleTouchMove = (moveEvent: TouchEvent) => {
			moveEvent.preventDefault();
			const currentTouch = moveEvent.touches[0];
			if (!currentTouch) return;
			const deltaX = currentTouch.clientX - startPos.x;
			const deltaY = currentTouch.clientY - startPos.y;

			const container = containerRef.current;
			if (!container) return;

			const rect = container.getBoundingClientRect();
			const containerSize = direction === "horizontal" ? rect.width : rect.height;

			const deltaPercent = direction === "horizontal"
				? (deltaX / containerSize) * 100
				: (deltaY / containerSize) * 100;

			const newSizes = [...startSizes];
			const currentIndex = index;

			if (currentIndex < newSizes.length - 1) {
				newSizes[currentIndex] = clampSize(newSizes[currentIndex] + deltaPercent, currentIndex, newSizes);
				newSizes[currentIndex + 1] = clampSize(newSizes[currentIndex + 1] - deltaPercent, currentIndex + 1, newSizes);
			} else if (currentIndex > 0) {
				// If dragging the last handle, adjust previous pane
				newSizes[currentIndex - 1] = clampSize(newSizes[currentIndex - 1] - deltaPercent, currentIndex - 1, newSizes);
				newSizes[currentIndex] = clampSize(newSizes[currentIndex] + deltaPercent, currentIndex, newSizes);
			}

			updateSizes(newSizes);
		};

		const handleTouchEnd = () => {
			document.removeEventListener("touchmove", handleTouchMove);
			document.removeEventListener("touchend", handleTouchEnd);
			setState(prev => ({ ...prev, isDragging: false }));
		};

		document.addEventListener("touchmove", handleTouchMove, { passive: false });
		document.addEventListener("touchend", handleTouchEnd);
	}, [direction, state.sizes, clampSize, updateSizes]);

	// Focus management
	const handleFocus = useCallback((index: number) => {
		setState(prev => ({ ...prev, focusedIndex: index }));
	}, []);

	const handleBlur = useCallback(() => {
		setState(prev => ({ ...prev, focusedIndex: null }));
	}, []);

	// Render handles
	const renderHandles = () => {
		const handleCount = state.sizes.length - 1;
		if (handleCount <= 0) return null;

		return Array.from({ length: handleCount }, (_, index) => (
			<div
				key={`handle-${index}`}
				ref={el => { handleRefs.current[index] = el; }}
				className={`${styles.handle} ${styles[direction]} ${state.focusedIndex === index ? styles.focused : ""} ${state.isDragging && state.focusedIndex === index ? styles.dragging : ""}`}
				style={{
					[direction === "horizontal" ? "left" : "top"]: `${state.sizes.slice(0, index + 1).reduce((sum, s) => sum + s, 0)}%`,
					transform: direction === "horizontal" ? "translateX(-50%)" : "translateY(-50%)",
				} as CSSProperties}
				onMouseDown={e => handleMouseDown(index, e)}
				onTouchStart={e => handleTouchStart(index, e)}
				onKeyDown={e => handleKeyDown(index, e)}
				onFocus={e => handleFocus(index)}
				onBlur={handleBlur}
				tabIndex={0}
				role="separator"
				aria-label={`${ariaLabel} ${index + 1} of ${handleCount}`}
				aria-valuemin={ariaValueMin}
				aria-valuemax={ariaValueMax}
				aria-valuenow={Math.round(state.sizes[index])}
				aria-orientation={direction === "horizontal" ? "horizontal" : "vertical"}
				data-index={index}
			>
				<div className={styles.handleGrip} aria-hidden="true" />
			</div>
		));
	};

	// Render panes
	const renderPanes = () => {
		return state.sizes.map((size, index) => (
			<div
				key={`pane-${index}`}
				className={`${styles.pane} ${styles[direction]}`}
				style={{
					[direction === "horizontal" ? "width" : "height"]: `${size}%`,
					flex: `0 0 ${size}%`,
				} as CSSProperties}
				data-index={index}
			>
				{index < state.sizes.length - 1 && (
					<div className={styles.paneContent} data-pane-index={index}>
						{/* Pane content will be rendered by parent */}
					</div>
				)}
			</div>
		));
	};

	const containerStyle: CSSProperties = {
		display: "flex",
		flexDirection: direction === "horizontal" ? "row" : "column",
		width: "100%",
		height: "100%",
		position: "relative",
		...style,
	};

	// If children are provided, use them as panes; otherwise render internal panes
	const panes = children ? React.Children.toArray(children) : renderPanes();

	return (
		<div
			ref={containerRef}
			className={`${styles.container} ${styles[direction]} ${className}`}
			style={containerStyle}
			role="group"
			aria-label={ariaLabel}
		>
			{panes}
			{renderHandles()}
		</div>
	);
};

Splitter.displayName = "Splitter";

export default Splitter;