/**
 * Simple inline logger — no external debug dependency.
 * Avoids webpack dynamic-require issues with the `debug` npm package.
 *
 * Enabled when:
 *   - localStorage.getItem("DEBUG") or localStorage.getItem("VNINVEST_DEBUG") is set
 *   - process.env.DEBUG is set
 *
 * Usage:
 *   import { createLogger } from '@/lib/utils/logger';
 *   const log = createLogger('vninvestcharts-widget:adapter:binance');
 *   log.info('Fetching data for %s', symbol);
 */

export interface Logger {
  log: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
  trace: (...args: unknown[]) => void;
  extend: (namespace: string) => Logger;
}

const noop = () => {};

const noopLogger: Logger = {
	log: noop,
	info: noop,
	warn: noop,
	error: noop,
	debug: noop,
	trace: noop,
	extend: () => noopLogger,
};

function isDebugEnabled(): boolean {
	if (typeof process !== "undefined" && process.env?.DEBUG) return true;
	try {
		if (typeof localStorage !== "undefined") {
			return !!(localStorage.getItem("DEBUG") || localStorage.getItem("VNINVEST_DEBUG"));
		}
	} catch { /* localStorage may throw in SSR */ }
	return false;
}

const enabled = isDebugEnabled();

function createLogFn(namespace: string, level: keyof Console) {
	if (!enabled) return noop;
	return (...args: unknown[]) => {
		(console[level] as Function)(`[${namespace}]`, ...args);
	};
}

export function createLogger(namespace: string): Logger {
	if (!enabled) return noopLogger;
	return {
		log: createLogFn(namespace, "log"),
		info: createLogFn(namespace, "info"),
		warn: createLogFn(namespace, "warn"),
		error: createLogFn(namespace, "error"),
		debug: createLogFn(namespace, "debug"),
		trace: createLogFn(namespace, "trace"),
		extend: (sub: string) => createLogger(`${namespace}:${sub}`),
	};
}

// Default logger for the package
export const logger = createLogger('vninvestcharts-widget');

// Convenience functions for common patterns
export function createComponentLogger(componentName: string): Logger {
	return createLogger(`vninvestcharts-widget:component:${componentName}`);
}

export function createAdapterLogger(adapterName: string): Logger {
	return createLogger(`vninvestcharts-widget:adapter:${adapterName}`);
}

export function createHookLogger(hookName: string): Logger {
	return createLogger(`vninvestcharts-widget:hook:${hookName}`);
}

export function createEngineLogger(enginePart: string): Logger {
	return createLogger(`vninvestcharts-widget:engine:${enginePart}`);
}