import { useEffect, useRef, useCallback } from "react";
import type { ClockAdapter } from "@vninvestcharts/engine-react";

export interface UseClockAdapterOptions {
  clockAdapter?: ClockAdapter;
}

export function useClockAdapter(options: UseClockAdapterOptions = {}) {
	const { clockAdapter } = options;
	const frameIdRef = useRef<number | null>(null);
	const callbackRef = useRef<((time: number) => void) | null>(null);

	// requestAnimationFrame wrapper
	const requestFrame = useCallback((callback: (time: number) => void): number => {
		callbackRef.current = callback;

		if (clockAdapter) {
			return clockAdapter.requestFrame((time) => {
				callbackRef.current?.(time);
			});
		}

		// Fallback to native requestAnimationFrame
		if (typeof requestAnimationFrame !== "undefined") {
			return requestAnimationFrame((time) => {
				callbackRef.current?.(time);
			});
		}

		// Fallback to setTimeout
		const now = (clockAdapter as ClockAdapter | undefined)?.now() ?? Date.now();
		if (typeof setTimeout !== 'undefined') {
			return setTimeout(() => {
				callbackRef.current?.(now);
			}, 1000 / 60) as unknown as number;
		}
		return 0;
	}, [clockAdapter]);

	// cancelAnimationFrame wrapper
	const cancelFrame = useCallback((id: number): void => {
		if (clockAdapter) {
			clockAdapter.cancelFrame(id);
		} else if (typeof cancelAnimationFrame !== "undefined") {
			cancelAnimationFrame(id);
		} else {
			clearTimeout(id as unknown as ReturnType<typeof setTimeout>);
		}
	}, [clockAdapter]);

	// High-resolution timestamp
	const now = useCallback((): number => {
		if (clockAdapter) {
			return clockAdapter.now();
		}
		if (typeof performance !== "undefined" && performance.now) {
			return performance.now();
		}
		return Date.now();
	}, [clockAdapter]);

	// setTimeout wrapper (for timers that don't need frame alignment)
	const setTimeoutWrapper = useCallback((callback: () => void, delay: number): number => {
		if (clockAdapter) {
			return clockAdapter.setTimeout(callback, delay);
		}
		// Fallback to native setTimeout
		if (typeof setTimeout !== 'undefined') {
			return setTimeout(callback, delay) as unknown as number;
		}
		return 0;
	}, [clockAdapter]);

	const clearTimeoutWrapper = useCallback((id: number): void => {
		if (clockAdapter) {
			clockAdapter.clearTimeout(id);
		} else if (typeof clearTimeout !== 'undefined') {
			clearTimeout(id);
		}
	}, [clockAdapter]);

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			if (frameIdRef.current !== null) {
				cancelFrame(frameIdRef.current);
				frameIdRef.current = null;
			}
		};
	}, [cancelFrame]);

	return { now, requestFrame, cancelFrame, setTimeout: setTimeoutWrapper, clearTimeout: clearTimeoutWrapper };
}