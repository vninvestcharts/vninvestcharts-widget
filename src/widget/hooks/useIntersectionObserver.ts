// useIntersectionObserver - SSR-safe IntersectionObserver hook for WebGL freeze/thaw
// Implements ADR-0011: WebGL Freeze/Thaw Visual Continuity

import { useEffect, useRef, useState, useCallback } from 'react';

// ============================================
// Types
// ============================================

export interface IntersectionObserverOptions {
  /** Root element for intersection calculations (default: viewport) */
  root?: Element | null;
  /** Margin around root (e.g., "100px 0px") */
  rootMargin?: string;
  /** Threshold(s) for triggering callback (0-1) */
  threshold?: number | number[];
  /** Freeze when visibility drops below this threshold (default: 0.5) */
  freezeThreshold?: number;
  /** Thaw when visibility rises above this threshold (default: 0.1) */
  thawThreshold?: number;
  /** Minimum time frozen before allowing thaw (ms) */
  minFreezeDuration?: number;
  /** Debounce time for intersection changes (ms) */
  debounceMs?: number;
}

export interface IntersectionObserverResult {
  /** Current intersection ratio (0-1) */
  ratio: number;
  /** Whether element is currently intersecting */
  isIntersecting: boolean;
  /** Whether WebGL context should be frozen */
  isFrozen: boolean;
  /** Whether WebGL context is thawing */
  isThawing: boolean;
  /** Current visibility state */
  visibilityState: 'visible' | 'partial' | 'hidden';
  /** Ref to attach to target element */
  ref: (element: Element | null) => void;
  /** Manually trigger freeze */
  freeze: () => void;
  /** Manually trigger thaw */
  thaw: () => void;
}

// ============================================
// SSR Guard
// ============================================

/**
 * Runtime SSR/IO-availability check (not a module constant, so tests can mock)
 */
function isSSR(): boolean {
	return typeof window === 'undefined' ||
		typeof IntersectionObserver === 'undefined';
}

/**
 * Safe IntersectionObserver constructor for SSR
 */
function createIntersectionObserver(
	callback: IntersectionObserverCallback,
	options?: IntersectionObserverInit
): IntersectionObserver | null {
	if (isSSR()) return null;
	return new IntersectionObserver(callback, options);
}

// ============================================
// Hook Implementation
// ============================================

export function useIntersectionObserver(
	options: IntersectionObserverOptions = {}
): IntersectionObserverResult {
	const {
		root = null,
		rootMargin = '0px',
		threshold = [0, 0.1, 0.25, 0.5, 0.75, 1],
		freezeThreshold = 0.5,
		thawThreshold = 0.1,
		minFreezeDuration = 1000,
		debounceMs = 100,
	} = options;

	// State
	const [ratio, setRatio] = useState(0);
	const [isIntersecting, setIsIntersecting] = useState(false);
	const [isFrozen, setIsFrozen] = useState(false);
	const [isThawing, setIsThawing] = useState(false);
	const [visibilityState, setVisibilityState] = useState<'visible' | 'partial' | 'hidden'>('hidden');

	// Refs
	const elementRef = useRef<Element | null>(null);
	const observerRef = useRef<IntersectionObserver | null>(null);
	const freezeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const lastFreezeTimeRef = useRef(0);
	const frozenByUserRef = useRef(false);
	const isFrozenRef = useRef(false);

	// ============================================
	// Core Logic
	// ============================================

	const updateVisibilityState = useCallback((ratio: number) => {
		if (ratio >= 1) {
			setVisibilityState('visible');
		} else if (ratio > 0) {
			setVisibilityState('partial');
		} else {
			setVisibilityState('hidden');
		}
	}, []);

	// Keep isFrozenRef in sync with isFrozen for observable state
	useEffect(() => {
		isFrozenRef.current = isFrozen;
	}, [isFrozen]);

	const processIntersection = useCallback(
		(entries: IntersectionObserverEntry[]) => {
			const entry = entries[0];
			if (!entry) return;

			const newRatio = entry.intersectionRatio;
			const newIsIntersecting = entry.isIntersecting;

			setRatio(newRatio);
			setIsIntersecting(newIsIntersecting);
			updateVisibilityState(newRatio);

			// Handle freeze/thaw logic
			const now = Date.now();
			const timeSinceFreeze = now - lastFreezeTimeRef.current;

			if (newRatio <= freezeThreshold && newIsIntersecting) {
				// Should freeze
				if (!isFrozenRef.current && !frozenByUserRef.current) {
					if (timeSinceFreeze >= minFreezeDuration) {
						isFrozenRef.current = true;
						setIsFrozen(true);
						lastFreezeTimeRef.current = now;
					}
				}
			} else if (newRatio >= thawThreshold) {
				// Should thaw
				if (isFrozenRef.current && !frozenByUserRef.current) {
					setIsThawing(true);
					// Allow time for WebGL context restoration
					setTimeout(() => {
						isFrozenRef.current = false;
						setIsFrozen(false);
						setIsThawing(false);
					}, 100);
				}
			}
		}, [freezeThreshold, thawThreshold, minFreezeDuration, updateVisibilityState]);

	const handleIntersection = useCallback(
		(entries: IntersectionObserverEntry[]) => {
			if (debounceMs === 0) {
				processIntersection(entries);
				return;
			}
			if (debounceRef.current) {
				clearTimeout(debounceRef.current);
			}
			debounceRef.current = setTimeout(() => {
				processIntersection(entries);
			}, debounceMs);
		}, [debounceMs, processIntersection]);

	// ============================================
	// Observer Lifecycle
	// ============================================

	useEffect(() => {
		if (isSSR()) return;

		// Create observer
		observerRef.current = createIntersectionObserver(handleIntersection, {
			root,
			rootMargin,
			threshold,
		});

		const currentElement = elementRef.current;
		if (currentElement && observerRef.current) {
			observerRef.current.observe(currentElement);
		}

		return () => {
			if (observerRef.current) {
				observerRef.current.disconnect();
				observerRef.current = null;
			}
			if (freezeTimeoutRef.current) {
				clearTimeout(freezeTimeoutRef.current);
			}
			if (debounceRef.current) {
				clearTimeout(debounceRef.current);
			}
		};
	}, [handleIntersection, root, rootMargin, threshold]);

	// ============================================
	// Public API
	// ============================================

	const setRef = useCallback((element: Element | null) => {
		// Clean up previous observation
		if (elementRef.current && observerRef.current) {
			observerRef.current.unobserve(elementRef.current);
		}

		elementRef.current = element;

		// Observe new element
		if (element && observerRef.current) {
			observerRef.current.observe(element);
		}
	}, []);

	const freeze = useCallback(() => {
		frozenByUserRef.current = true;
		setIsFrozen(true);
		lastFreezeTimeRef.current = Date.now();
	}, []);

	const thaw = useCallback(() => {
		frozenByUserRef.current = false;
		setIsFrozen(false);
		setIsThawing(true);
		setTimeout(() => setIsThawing(false), 100);
	}, []);

	// ============================================
	// Return
	// ============================================

	return {
		ratio,
		isIntersecting,
		isFrozen,
		isThawing,
		visibilityState,
		ref: setRef,
		freeze,
		thaw,
	};
}

// ============================================
// Specialized Hooks
// ============================================

/**
 * Hook for WebGL canvas freeze/thaw with snapshot support
 */
export function useWebGLFreezeThaw(
	options: IntersectionObserverOptions & {
    onFreeze?: () => Promise<void>;
    onThaw?: () => Promise<void>;
  } = {}
) {
	const { onFreeze, onThaw, ...observerOptions } = options;
	const onFreezeRef = useRef(onFreeze);
	onFreezeRef.current = onFreeze;
	const onThawRef = useRef(onThaw);
	onThawRef.current = onThaw;
	const observer = useIntersectionObserver(observerOptions);

	const prevFrozenRef = useRef(observer.isFrozen);

	// Track freeze/thaw state changes
	useEffect(() => {
		if (observer.isFrozen && onFreezeRef.current) {
			onFreezeRef.current();
		}
	}, [observer.isFrozen]);

	// Detect thaw transition: isFrozen went from true -> false
	useEffect(() => {
		if (prevFrozenRef.current && !observer.isFrozen && onThawRef.current) {
			onThawRef.current();
		}
		prevFrozenRef.current = observer.isFrozen;
	}, [observer.isFrozen]);

	return observer;
}

/**
 * Hook for multiple elements with shared freeze budget
 */
export function useIntersectionObserverGroup(
	elements: (Element | null)[],
	options: IntersectionObserverOptions & {
    maxConcurrent?: number; // Max elements to keep unfrozen
  } = {}
) {
	const { maxConcurrent = 4, ...observerOptions } = options;
	const [observers, setObservers] = useState<Map<Element, IntersectionObserverResult>>(new Map());

	// This would be expanded for group management
	// For now, return individual observers
	return elements.map(el => useIntersectionObserver(observerOptions));
}

export default useIntersectionObserver;