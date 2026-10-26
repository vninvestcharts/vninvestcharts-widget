import { useState, useCallback, useRef } from "react";
import type { ChartLayout } from "@vninvestcharts/engine-react";

const MAX_HISTORY = 50;

export function useLayoutHistory(initialLayout: ChartLayout) {
	const [history, setHistory] = useState<ChartLayout[]>([initialLayout]);
	const indexRef = useRef(0);

	const pushLayout = useCallback((layout: ChartLayout) => {
		setHistory(prev => {
			const trimmed = prev.slice(0, indexRef.current + 1);
			const next = [...trimmed, layout];
			if (next.length > MAX_HISTORY) next.shift();
			indexRef.current = Math.min(indexRef.current + 1, MAX_HISTORY - 1);
			return next;
		});
	}, []);

	const undo = useCallback((): ChartLayout | null => {
		if (indexRef.current > 0) {
			indexRef.current -= 1;
			return history[indexRef.current] ?? null;
		}
		return null;
	}, [history]);

	const redo = useCallback((): ChartLayout | null => {
		if (indexRef.current < history.length - 1) {
			indexRef.current += 1;
			return history[indexRef.current] ?? null;
		}
		return null;
	}, [history]);

	return {
		pushLayout,
		undo,
		redo,
		canUndo: indexRef.current > 0,
		canRedo: indexRef.current < history.length - 1,
	};
}
