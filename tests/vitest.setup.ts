// Ensure React testing utilities run in act-aware mode.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { resetFallbackRequestCoordinatorForTests } from "../src/widget/history/RequestCoordinator";

// Per-test isolation for the module-level fallback RequestCoordinator.
// Renders without a provider (single-chart path) share one instance per
// test file — reset tokens/cache so earlier tests can't starve later ones.
if (typeof beforeEach === "function") {
	beforeEach(() => {
		try {
			resetFallbackRequestCoordinatorForTests();
		} catch {
			// Module may not resolve in engine-only runs — non-fatal.
		}
	});
}

// Mock ResizeObserver for JSDOM
class MockResizeObserver {
  private element?: HTMLElement;
  private callback: (entries: any[]) => void;
  private resizeListener = () => {
    this.callback([{ target: this.element, contentRect: { width: 800, height: 600 } }]);
  };

  constructor(callback: (entries: any[]) => void) {
    this.callback = callback;
  }

  observe(element: HTMLElement) {
    this.element = element;
    element.addEventListener('resize', this.resizeListener);
  }

  unobserve(element: HTMLElement) {
    element.removeEventListener('resize', this.resizeListener);
  }

  disconnect() {
    if (this.element) {
      this.element.removeEventListener('resize', this.resizeListener);
    }
  }
}
globalThis.ResizeObserver = MockResizeObserver as any;

// Define default layout dimensions for HTMLElement prototype in JSDOM
if (typeof HTMLElement !== 'undefined') {
  const isEngineCoreTest = () => {
    try {
      // @ts-ignore
      const testPath = typeof expect !== 'undefined' && expect.getState ? expect.getState().testPath : '';
      if (testPath && testPath.replace(/\\/g, '/').includes('vn-kline-engine-core')) {
        return true;
      }
      const stack = new Error().stack || '';
      return stack.replace(/\\/g, '/').includes('vn-kline-engine-core');
    } catch (e) {
      return false;
    }
  };

  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get() {
      if (isEngineCoreTest()) {
        return 0;
      }
      const styleWidth = this.style.width;
      if (styleWidth && styleWidth.endsWith('px')) {
        return parseInt(styleWidth, 10);
      }
      return 1200;
    }
  });

  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get() {
      if (isEngineCoreTest()) {
        return 0;
      }
      const styleHeight = this.style.height;
      if (styleHeight && styleHeight.endsWith('px')) {
        return parseInt(styleHeight, 10);
      }
      return 720;
    }
  });
}



// Global test timeout protection - ensures tests don't hang indefinitely
// This is a safety net in addition to vitest.config.ts testTimeout
const ORIGINAL_SET_TIMEOUT = globalThis.setTimeout;
const ORIGINAL_CLEAR_TIMEOUT = globalThis.clearTimeout;

// Track active timeouts for cleanup
const activeTimeouts = new Set<ReturnType<typeof setTimeout>>();

// Override setTimeout to track timeouts
globalThis.setTimeout = ((callback: TimerHandler, timeout?: number, ...args: unknown[]) => {
  const handle = ORIGINAL_SET_TIMEOUT(callback, timeout, ...args);
  activeTimeouts.add(handle);
  return handle;
}) as typeof setTimeout;

// Override clearTimeout to clean up tracking
globalThis.clearTimeout = ((handle?: ReturnType<typeof setTimeout>) => {
  if (handle) {
    activeTimeouts.delete(handle);
  }
  ORIGINAL_CLEAR_TIMEOUT(handle);
}) as typeof clearTimeout;

// Cleanup function to clear all pending timeouts after each test
// This prevents timer leaks between tests
if (typeof afterEach === 'function') {
  afterEach(() => {
    // Clear all tracked timeouts
    activeTimeouts.forEach((handle) => {
      ORIGINAL_CLEAR_TIMEOUT(handle);
    });
    activeTimeouts.clear();
  });
}

// Export for manual cleanup if needed
export const clearAllTestTimeouts = () => {
  activeTimeouts.forEach((handle) => {
    ORIGINAL_CLEAR_TIMEOUT(handle);
  });
  activeTimeouts.clear();
};
