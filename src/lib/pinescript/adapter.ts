/**
 * PineScript adapter — public interface for the Pro pinescript module.
 *
 * Stays in public widget. widget-pro implements this interface and registers
 * via setPineScriptAdapter(). Public consumers call getPineScriptAdapter()
 * and skip gracefully when null (Pro module not loaded).
 *
 * Type-only: no imports from modules that will move to widget-pro.
 * This file must never import ./compile, ./pineStrategy, etc.
 */

export interface PineCompileResult {
  ast?: unknown;
  output?: unknown;
  overlay?: boolean;
  errors: Array<{ message: string; line?: number; column?: number }>;
}

export interface PineScriptAdapter {
  compile: (source: string, bars?: unknown) => PineCompileResult;
  runStrategy: (source: string, bars: unknown) => {
    errors: Array<{ message: string }>;
  };
  isStrategySource: (source: string) => boolean;
  registerPineScript: (scriptId: string, source: string, options?: unknown) => unknown;
  getPinePlugin: (name: string) => unknown;
  restorePineScripts: (stored: unknown, types: string[]) => unknown[];
  registerPinePlugin: (plugin: unknown) => void;
  pineMonacoVSPath: () => string;
  installMonacoEnvironment: (vsBase: string) => void;
  VnScriptLanguage: unknown;
  createWorker: () => Worker;
}

let _adapter: PineScriptAdapter | null = null;

export function setPineScriptAdapter(a: PineScriptAdapter): void {
	_adapter = a;
}

export function getPineScriptAdapter(): PineScriptAdapter | null {
	return _adapter;
}

export function hasPineScriptAdapter(): boolean {
	return _adapter !== null;
}
