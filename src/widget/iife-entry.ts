/**
 * WP-10/11: IIFE entry point for <script> tag embedding.
 *
 * This is the standalone bundle that exposes `window.VNInvestCharts`.
 * It bundles React, ReactDOM, d3, and all widget components.
 * CSS is auto-injected into <head> or ShadowRoot on mount.
 *
 * Usage:
 *   <script src="vninvestchart.iife.js"></script>
 *   <script>
 *     const { mount, VNInvestCharts, VNInvestDataAdapter } = window.VNInvestCharts;
 *     const { unmount, widgetRef } = mount({ container: div, props: {...} });
 *   </script>
 */

// Re-export everything from the main widget index
export * from "./index";

// Also re-export adapters for convenience (in IIFE mode, everything is bundled)
export * from "./adapters";

import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { VNInvestMultiCharts, type VNInvestMultiChartsProps, type VNInvestMultiChartsRef } from "./VNInvestMultiCharts";
import { createWidgetInstance, type WidgetInstance } from "./iifeWidgetInstance";
import { injectVNInvestChartsCSS } from "./styles/injectStyles";
import { DataProviderProvider } from "./context/DataProviderContext";
import { type IChartDataProvider } from "./types/dataProvider";

/** Options for mounting the widget */
export interface MountOptions {
	/** Container element to mount into */
	container: HTMLElement;
	/** Widget props */
	props: VNInvestMultiChartsProps;
	/** Whether to use Shadow DOM for CSS isolation (default: true) */
	useShadowDOM?: boolean;
	/** Optional Bearer token for BFF proxy */
	authToken?: string;
	/** Optional custom data provider context */
	dataProvider?: IChartDataProvider;
	/** Optional custom portal container override */
	portalContainer?: HTMLElement;
}

export type { WidgetInstance } from "./iifeWidgetInstance";

/** Return value from mount function */
export interface MountResult {
	/** Unmount function - cleans up React root, styles, and listeners */
	unmount: () => void;
	/** React Root instance */
	root: Root;
	/** Portal root element */
	portalRoot: HTMLElement;
	/** Reference to the mounted widget instance (for bridge communication) */
	widgetRef: React.RefObject<WidgetInstance | null>;
}

/**
 * Mount VNInvestCharts widget into a container with optional Shadow DOM isolation.
 * Returns unmount function and widget ref for external communication.
 */
export function mountVNInvestCharts(options: MountOptions): MountResult {
	// SSR Guard - throw clear error in non-browser environments
	if (typeof window === "undefined" || typeof document === "undefined") {
		throw new Error("VNInvestCharts.mount() requires a browser environment (window/document not available)");
	}

	const { container, props, useShadowDOM = true, dataProvider, portalContainer } = options;

	// Create Shadow Root for CSS isolation, or use container directly
	const rootNode = useShadowDOM !== false
		? container.attachShadow({ mode: "open" })
		: container;

	// Inject CSS into ShadowRoot or Document
	const styleEl = injectVNInvestChartsCSS(rootNode);

	// Create internal portal root for modals/tooltips to render inside Shadow DOM
	// This ensures portals don't escape to document.body and break CSS isolation
	const portalRoot = portalContainer ?? (() => {
		const el = document.createElement("div");
		el.id = "vnsc-portal-root";
		el.style.cssText = "position: fixed; inset: 0; z-index: 9999; pointer-events: none;";
		rootNode.appendChild(el);
		return el;
	})();

	// Set up the React root and render the widget.
	// `multiRef` receives the REAL `VNInvestMultiChartsRef`; the public
	// `widgetRef` is a stable adapter built on top of it (REL-04) so every
	// documented imperative method has a real implementation.
	const root = createRoot(rootNode);
	const multiRef = React.createRef<VNInvestMultiChartsRef>();
	const widgetRef = React.createRef<WidgetInstance>();
	const instance = createWidgetInstance(() => multiRef.current);
	widgetRef.current = instance;

	root.render(
		React.createElement(
			DataProviderProvider,
			{ provider: dataProvider || null } as any, // ARC-1-keep: legacy bridge
			React.createElement(VNInvestMultiCharts, {
				...props,
				// Real multi ref; the public widgetRef is the adapter built on it.
				ref: multiRef,
				// Pass portal root to widget for internal portal rendering (SSOT: portalRoot)
				portalRoot: portalRoot,
				// Keep legacy __portalRoot for backward-compat during transition
				__portalRoot: portalRoot,
				__vnscPortalRoot: portalRoot,
				__vnscShadowRoot: useShadowDOM !== false ? (rootNode as ShadowRoot) : null,
			} as any) // ARC-1-keep: legacy bridge
		)
	);

	// Return unmount function with complete cleanup
	return {
		unmount: () => {
			root.unmount();
			styleEl?.remove();
			portalRoot?.remove();
			// Revoke any Object URLs created by the widget (blob URLs for images, etc.)
			if (widgetRef.current?.cleanupObjectUrls) {
				widgetRef.current.cleanupObjectUrls();
			}
			// Remove any global event listeners the widget may have registered
			if (widgetRef.current?.cleanupGlobalListeners) {
				widgetRef.current.cleanupGlobalListeners();
			}
		},
		root,
		portalRoot,
		widgetRef,
	};
}

// Extend Window interface for global VNInvestCharts
declare global {
	interface Window {
		VNInvestCharts: {
			mount: typeof mountVNInvestCharts;
			[key: string]: any;
		};
	}
}

// Expose globally for script-tag usage
if (typeof window !== "undefined") {
	window.VNInvestCharts = {
		...window.VNInvestCharts,
		mount: mountVNInvestCharts,
	};
}