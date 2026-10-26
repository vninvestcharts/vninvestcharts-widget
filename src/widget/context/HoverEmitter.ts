/**
 * WE2 P1-05: HoverEmitter
 *
 * Ref-based EventTarget emitter for high-frequency hover/mouse coordinate events.
 *
 * Why not React state?
 *   Hover events fire on every pixel the mouse moves. Pushing these through
 *   React state would trigger a re-render on every pixel — causing jank.
 *
 * Why not mitt?
 *   EventTarget is a native browser API — zero bundle size impact.
 *   CustomEvent supports structured data via the `detail` property.
 *
 * Usage:
 *   // In provider:
 *   const hoverEmitterRef = useRef<EventTarget>(createHoverEmitter());
 *
 *   // Emit from canvas surface:
 *   emitHover(hoverEmitterRef, { datum, pixelX, pixelY, paneId });
 *
 *   // Subscribe in OHLCHeader, tooltip, etc:
 *   useHoverSubscription(hoverEmitterRef, (payload) => { ... });
 */

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { EnrichedDatum } from "../../lib/core/calculators/types";

export interface HoverEventPayload {
	datum: EnrichedDatum | undefined;
	pixelX: number;
	pixelY: number;
	paneId: string | undefined;
}

export type HoverEmitter = EventTarget;

export function createHoverEmitter(): HoverEmitter {
	return new EventTarget();
}

/** Emit a hover event — safe to call on every mouse move. */
export function emitHover(emitter: HoverEmitter, payload: HoverEventPayload) {
	emitter.dispatchEvent(new CustomEvent("hover", { detail: payload }));
}

/** Clear hover state (e.g., when mouse leaves chart). */
export function clearHover(emitter: HoverEmitter) {
	emitter.dispatchEvent(new CustomEvent("hover-clear"));
}

/**
 * Subscribe to hover events without causing React re-renders on every pixel.
 * The callback receives the payload and can update local DOM refs directly.
 *
 * If you DO want React state updates, pass a setState function as the callback,
 * but be aware this will trigger re-renders on every hover event.
 */
export function useHoverSubscription(
	emitterRef: RefObject<HoverEmitter | null>,
	callback: (payload: HoverEventPayload) => void,
) {
	const callbackRef = useRef(callback);
	callbackRef.current = callback;

	useEffect(() => {
		const emitter = emitterRef.current;
		if (!emitter) return;

		const handler = (e: Event) => {
			const payload = (e as CustomEvent<HoverEventPayload>).detail;
			callbackRef.current(payload);
		};

		emitter.addEventListener("hover", handler);
		return () => {
			emitter.removeEventListener("hover", handler);
		};
	}, [emitterRef.current, callback]);
}

/**
 * React hook that bridges hover events into React state.
 * Use sparingly — only when a component truly needs hover data in its render output.
 */
export function useHoverState(emitterRef: RefObject<HoverEmitter | null>): HoverEventPayload | null {
	const [state, setState] = useState<HoverEventPayload | null>(null);

	useHoverSubscription(emitterRef, useCallback((payload: HoverEventPayload) => {
		setState(payload);
	}, []));

	// Clear on hover-clear
	useEffect(() => {
		const emitter = emitterRef.current;
		if (!emitter) return;

		const handler = () => setState(null);
		emitter.addEventListener("hover-clear", handler);
		return () => {
			emitter.removeEventListener("hover-clear", handler);
		};
	}, [emitterRef]);

	return state;
}
