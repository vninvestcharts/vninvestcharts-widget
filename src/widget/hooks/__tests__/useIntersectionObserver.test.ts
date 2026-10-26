/**
 * Unit tests for useIntersectionObserver hook
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useIntersectionObserver, useWebGLFreezeThaw } from '../useIntersectionObserver';

// Mock IntersectionObserver with fresh spies per instance
type MockCallback = (entries: IntersectionObserverEntry[]) => void;

class MockIntersectionObserver {
	static instances: MockIntersectionObserver[] = [];
	callback: MockCallback;
	options?: IntersectionObserverInit;
	observe: ReturnType<typeof vi.fn>;
	unobserve: ReturnType<typeof vi.fn>;
	disconnect: ReturnType<typeof vi.fn>;
	takeRecords: ReturnType<typeof vi.fn>;
	thresholds: number[];
	root: Element | Document | null = null;
	rootMargin: string;
	constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
		this.callback = callback as MockCallback;
		this.options = options;
		this.observe = vi.fn();
		this.unobserve = vi.fn();
		this.disconnect = vi.fn();
		this.takeRecords = vi.fn();
		const thr = options?.threshold;
		this.thresholds = thr === undefined ? [0] : Array.isArray(thr) ? thr : [thr];
		this.rootMargin = options?.rootMargin || '0px';
		MockIntersectionObserver.instances.push(this);
	}
}

beforeEach(() => {
	MockIntersectionObserver.instances = [];
	(global as any).IntersectionObserver = MockIntersectionObserver;
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('useIntersectionObserver', () => {
	test('should return initial state on SSR', () => {
		// Simulate SSR by removing IntersectionObserver
		const originalIO = global.IntersectionObserver;
		(global as any).IntersectionObserver = undefined;

		const { result } = renderHook(() => useIntersectionObserver());

		expect(result.current.ratio).toBe(0);
		expect(result.current.isIntersecting).toBe(false);
		expect(result.current.isFrozen).toBe(false);
		expect(result.current.isThawing).toBe(false);
		expect(result.current.visibilityState).toBe('hidden');

		global.IntersectionObserver = originalIO;
	});

	test('should create observer on mount', () => {
		const { result } = renderHook(() => useIntersectionObserver({
			freezeThreshold: 0.5,
			thawThreshold: 0.1,
		}));

		expect(MockIntersectionObserver.instances[0]?.observe).not.toHaveBeenCalled();

		// Attach ref
		const element = document.createElement('div');
		act(() => {
			result.current.ref(element);
		});

		expect(MockIntersectionObserver.instances[0]?.observe).toHaveBeenCalledWith(element);
	});

	test('should update state on intersection', async () => {
		const { result } = renderHook(() => useIntersectionObserver({
			freezeThreshold: 0.5,
			thawThreshold: 0.1,
			debounceMs: 0, // No debounce for testing
		}));

		const element = document.createElement('div');
		act(() => {
			result.current.ref(element);
		});

		// Simulate intersection entry
		const callback = MockIntersectionObserver.instances[0]?.callback;
		if (callback) {
			act(() => {
				callback([{
					intersectionRatio: 0.8,
					isIntersecting: true,
					target: element,
					boundingClientRect: { top: 0, left: 0, width: 100, height: 100, bottom: 100, right: 100 },
					intersectionRect: { top: 0, left: 0, width: 100, height: 80, bottom: 80, right: 100 },
					rootBounds: { top: 0, left: 0, width: 800, height: 600, bottom: 600, right: 800 },
					time: Date.now(),
				} as unknown as IntersectionObserverEntry]);
			});
		}

		expect(result.current.ratio).toBe(0.8);
		expect(result.current.isIntersecting).toBe(true);
		expect(result.current.visibilityState).toBe('partial');
	});

	test('should freeze when visibility drops below threshold', async () => {
		const { result } = renderHook(() => useIntersectionObserver({
			freezeThreshold: 0.5,
			thawThreshold: 0.1,
			debounceMs: 0,
			minFreezeDuration: 0,
		}));

		const element = document.createElement('div');
		act(() => {
			result.current.ref(element);
		});

		const callback = MockIntersectionObserver.instances[0]?.callback;

		// Start visible
		act(() => {
			callback?.([{
				intersectionRatio: 1,
				isIntersecting: true,
				target: element,
				boundingClientRect: { top: 0, left: 0, width: 100, height: 100, bottom: 100, right: 100 },
				intersectionRect: { top: 0, left: 0, width: 100, height: 100, bottom: 100, right: 100 },
				rootBounds: { top: 0, left: 0, width: 800, height: 600, bottom: 600, right: 800 },
				time: Date.now(),
			} as unknown as IntersectionObserverEntry]);
		});

		expect(result.current.isFrozen).toBe(false);

		// Drop below freeze threshold
		act(() => {
			callback?.([{
				intersectionRatio: 0.3,
				isIntersecting: true,
				target: element,
				boundingClientRect: { top: 0, left: 0, width: 100, height: 100, bottom: 100, right: 100 },
				intersectionRect: { top: 0, left: 0, width: 100, height: 30, bottom: 30, right: 100 },
				rootBounds: { top: 0, left: 0, width: 800, height: 600, bottom: 600, right: 800 },
				time: Date.now(),
			} as unknown as IntersectionObserverEntry]);
		});

		expect(result.current.isFrozen).toBe(true);
		expect(result.current.visibilityState).toBe('partial');
	});

	test('should thaw when visibility rises above thaw threshold', async () => {
		const { result } = renderHook(() => useIntersectionObserver({
			freezeThreshold: 0.5,
			thawThreshold: 0.1,
			debounceMs: 0,
			minFreezeDuration: 0,
		}));

		const element = document.createElement('div');
		act(() => {
			result.current.ref(element);
		});

		const callback = MockIntersectionObserver.instances[0]?.callback;

		// Freeze first
		act(() => {
			callback?.([{
				intersectionRatio: 0.3,
				isIntersecting: true,
				target: element,
				boundingClientRect: { top: 0, left: 0, width: 100, height: 100, bottom: 100, right: 100 },
				intersectionRect: { top: 0, left: 0, width: 100, height: 30, bottom: 30, right: 100 },
				rootBounds: { top: 0, left: 0, width: 800, height: 600, bottom: 600, right: 800 },
				time: Date.now(),
			} as unknown as IntersectionObserverEntry]);
		});

		expect(result.current.isFrozen).toBe(true);

		// Rise above freeze threshold (must be > freezeThreshold to avoid freeze path)
		act(() => {
			callback?.([{
				intersectionRatio: 0.9,
				isIntersecting: true,
				target: element,
				boundingClientRect: { top: 0, left: 0, width: 100, height: 100, bottom: 100, right: 100 },
				intersectionRect: { top: 0, left: 0, width: 100, height: 90, bottom: 90, right: 100 },
				rootBounds: { top: 0, left: 0, width: 800, height: 600, bottom: 600, right: 800 },
				time: Date.now(),
			} as unknown as IntersectionObserverEntry]);
		});

		expect(result.current.isThawing).toBe(true);

		// Wait for thaw to complete
		await act(async () => {
			await new Promise(resolve => setTimeout(resolve, 150));
		});

		expect(result.current.isFrozen).toBe(false);
		expect(result.current.isThawing).toBe(false);
	});

	test('should respect minFreezeDuration', async () => {
		const { result } = renderHook(() => useIntersectionObserver({
			freezeThreshold: 0.5,
			thawThreshold: 0.1,
			debounceMs: 0,
			minFreezeDuration: 1000, // 1 second minimum
		}));

		const element = document.createElement('div');
		act(() => {
			result.current.ref(element);
		});

		const callback = MockIntersectionObserver.instances[0]?.callback;

		// Freeze
		act(() => {
			callback?.([{
				intersectionRatio: 0.3,
				isIntersecting: true,
				target: element,
				boundingClientRect: { top: 0, left: 0, width: 100, height: 100, bottom: 100, right: 100 },
				intersectionRect: { top: 0, left: 0, width: 100, height: 30, bottom: 30, right: 100 },
				rootBounds: { top: 0, left: 0, width: 800, height: 600, bottom: 600, right: 800 },
				time: Date.now(),
			} as unknown as IntersectionObserverEntry]);
		});

		expect(result.current.isFrozen).toBe(true);

		// Immediately try to thaw (should not work due to minFreezeDuration)
		act(() => {
			callback?.([{
				intersectionRatio: 0.5,
				isIntersecting: true,
				target: element,
				boundingClientRect: { top: 0, left: 0, width: 100, height: 100, bottom: 100, right: 100 },
				intersectionRect: { top: 0, left: 0, width: 100, height: 50, bottom: 50, right: 100 },
				rootBounds: { top: 0, left: 0, width: 800, height: 600, bottom: 600, right: 800 },
				time: Date.now(),
			} as unknown as IntersectionObserverEntry]);
		});

		// Should still be frozen
		expect(result.current.isFrozen).toBe(true);
	});

	test('should cleanup observer on unmount', () => {
		const { result, unmount } = renderHook(() => useIntersectionObserver());

		const element = document.createElement('div');
		act(() => {
			result.current.ref(element);
		});

		unmount();

		const instance = MockIntersectionObserver.instances[0];
		expect(instance?.disconnect).toHaveBeenCalled();
	});

	test('should provide manual freeze/thaw methods', () => {
		const { result } = renderHook(() => useIntersectionObserver());

		act(() => {
			result.current.freeze();
		});

		expect(result.current.isFrozen).toBe(true);

		act(() => {
			result.current.thaw();
		});

		expect(result.current.isFrozen).toBe(false);
		expect(result.current.isThawing).toBe(true);
	});
});

describe('useWebGLFreezeThaw', () => {
	test('should call onFreeze callback when frozen', async () => {
		const onFreeze = vi.fn();
		const onThaw = vi.fn();

		const { result } = renderHook(() => useWebGLFreezeThaw({
			freezeThreshold: 0.5,
			thawThreshold: 0.1,
			debounceMs: 0,
			minFreezeDuration: 0,
			onFreeze,
			onThaw,
		}));

		const element = document.createElement('div');
		act(() => {
			result.current.ref(element);
		});

		const callback = MockIntersectionObserver.instances[0]?.callback;

		// Trigger freeze
		act(() => {
			callback?.([{
				intersectionRatio: 0.3,
				isIntersecting: true,
				target: element,
				boundingClientRect: { top: 0, left: 0, width: 100, height: 100, bottom: 100, right: 100 },
				intersectionRect: { top: 0, left: 0, width: 100, height: 30, bottom: 30, right: 100 },
				rootBounds: { top: 0, left: 0, width: 800, height: 600, bottom: 600, right: 800 },
				time: Date.now(),
			} as unknown as IntersectionObserverEntry]);
		});

		expect(onFreeze).toHaveBeenCalled();

		// Trigger thaw (must be > freezeThreshold)
		act(() => {
			callback?.([{
				intersectionRatio: 0.9,
				isIntersecting: true,
				target: element,
				boundingClientRect: { top: 0, left: 0, width: 100, height: 100, bottom: 100, right: 100 },
				intersectionRect: { top: 0, left: 0, width: 100, height: 90, bottom: 90, right: 100 },
				rootBounds: { top: 0, left: 0, width: 800, height: 600, bottom: 600, right: 800 },
				time: Date.now(),
			} as unknown as IntersectionObserverEntry]);
		});

		await act(async () => {
			await new Promise(resolve => setTimeout(resolve, 150));
		});

		expect(onThaw).toHaveBeenCalled();
	});
});