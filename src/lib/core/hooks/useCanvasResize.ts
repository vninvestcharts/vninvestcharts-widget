import { useEffect, useRef, useState } from "react";

export interface CanvasSize {
	width: number;
	height: number;
}

export function useCanvasResize<TElement extends HTMLElement = HTMLDivElement>() {
	const ref = useRef<TElement | null>(null);
	const [size, setSize] = useState<CanvasSize>({ width: 0, height: 0 });

	useEffect(() => {
		const element = ref.current;
		if (!element) {
			return undefined;
		}

		const updateSize = () => {
			setSize({
				width: element.clientWidth,
				height: element.clientHeight,
			});
		};

		updateSize();

		if (typeof ResizeObserver === "undefined") {
			return undefined;
		}

		const observer = new ResizeObserver(() => {
			updateSize();
		});

		observer.observe(element);

		return () => {
			observer.disconnect();
		};
	}, []);

	return { ref, size };
}