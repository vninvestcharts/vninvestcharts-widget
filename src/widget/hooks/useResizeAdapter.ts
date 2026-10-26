import { useEffect, useRef, useState, useCallback } from "react";
import type { ResizeAdapter } from "@vninvestcharts/engine-react";

export interface CanvasSize {
  width: number;
  height: number;
}

export interface UseResizeAdapterOptions {
  resizeAdapter?: ResizeAdapter;
  onResize?: (size: CanvasSize) => void;
}

export function useResizeAdapter<TElement extends HTMLElement = HTMLDivElement>(
	options: UseResizeAdapterOptions = {}
) {
	const { resizeAdapter, onResize } = options;
	const ref = useRef<TElement | null>(null);
	const [size, setSize] = useState<CanvasSize>({ width: 0, height: 0 });
	const cleanupRef = useRef<(() => void) | null>(null);

	const updateSize = useCallback(() => {
		const element = ref.current;
		if (!element) return;

		const newSize = {
			width: element.clientWidth,
			height: element.clientHeight,
		};

		setSize((prev) => {
			if (prev.width === newSize.width && prev.height === newSize.height) {
				return prev;
			}
			return newSize;
		});

		onResize?.(newSize);
	}, [onResize]);

	useEffect(() => {
		const element = ref.current;
		if (!element) {
			return undefined;
		}

		// Initial size
		updateSize();

		// Use injected ResizeAdapter if available
		if (resizeAdapter) {
			cleanupRef.current = resizeAdapter.observe(element, () => {
				updateSize();
			});
		} else if (typeof ResizeObserver !== "undefined") {
			// Fallback to direct ResizeObserver for backward compatibility
			const observer = new ResizeObserver(() => {
				updateSize();
			});
			observer.observe(element);
			cleanupRef.current = () => observer.disconnect();
		}

		return () => {
			cleanupRef.current?.();
			cleanupRef.current = null;
		};
	}, [resizeAdapter, updateSize]);

	// Expose ref setter for external control
	const setRef = useCallback((node: TElement | null) => {
		ref.current = node;
		// Trigger size update when ref changes
		if (node) {
			updateSize();
		}
	}, [updateSize]);

	return { ref: setRef, size };
}