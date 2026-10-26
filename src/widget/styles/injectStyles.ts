/**
 * Auto-inject VNInvestCharts CSS styling into <head> or ShadowRoot at runtime.
 * This ensures layouts remain intact when importing via React ESM module or IIFE Shadow DOM.
 *
 * Imports combined CSS as raw string for runtime injection.
 * Components use CSS Modules (.module.css) for scoped styles.
 */

// Import combined CSS as raw string for runtime injection
// Using esbuild's ?raw suffix to import file content as string
import VNSC_CSS from "./injected.css?raw";

/** Inject widget CSS into Document, ShadowRoot or HTMLElement if not already present. Safe for SSR. */
export function injectVNInvestChartsCSS(target: Document | ShadowRoot | HTMLElement): HTMLStyleElement | null {
	if (typeof document === "undefined") return null;
	// E0-fix: a bare Document cannot receive <style> children (only <html> is
	// allowed) — inject into <head> instead. ShadowRoot/HTMLElement unchanged.
	const host: ParentNode | null =
		target instanceof Document ? (target.head ?? target.documentElement) : target;
	if (!host) return null;
	if (host.querySelector("[data-vnsc-css-injected]")) return null;

	const style = document.createElement("style");
	style.setAttribute("data-vnsc-css-injected", "true");
	style.textContent = VNSC_CSS;
	host.appendChild(style);
	return style;
}

