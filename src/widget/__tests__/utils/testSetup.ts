// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, vi } from "vitest";

// Extended timeout for contract tests (5 minutes)
export const CONTRACT_TIMEOUT = 5 * 60 * 1000; // 5 minutes

// React act environment setup
const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

const originalConsoleError = console.error;
console.error = (..._args: unknown[]) => {};

beforeAll(() => {
	// Global setup if needed
});

afterAll(() => {
	console.error = originalConsoleError;
});

beforeEach(() => {
	window.localStorage.clear();
	document.documentElement.lang = "en";
});

afterEach(async () => {
	window.localStorage.clear();
	document.documentElement.lang = "en";
});

// Mock useCanvasResize globally
vi.mock("../../lib/core/hooks/useCanvasResize", () => {
	const ref = { current: null as HTMLDivElement | null };
	return {
		useCanvasResize: () => ({
			ref,
			size: { width: 1200, height: 720 },
		}),
	};
});
