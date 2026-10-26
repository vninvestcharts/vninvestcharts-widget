/**
 * Pinescript public entry — type-only shim.
 *
 * Stays in public widget after the Pro move. Re-exports the adapter
 * interface + registry only. Never imports ./compile, ./pineStrategy,
 * or any module that moves to widget-pro.
 */

export type { PineScriptAdapter, PineCompileResult } from "./adapter";
export { setPineScriptAdapter, getPineScriptAdapter, hasPineScriptAdapter } from "./adapter";
