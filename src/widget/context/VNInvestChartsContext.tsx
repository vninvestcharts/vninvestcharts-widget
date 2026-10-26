/**
 * WE2 P1-02: VNInvestChartsContext (main provider)
 *
 * Composes ConfigContext, StateContext, WidgetI18nContext, and HoverEmitter
 * into a single provider tree. This is the root context for the compound
 * component architecture.
 *
 * The provider wraps around the existing VNInvestCharts implementation — it does
 * NOT replace the prop-driven API. Instead, it provides an internal coordination
 * layer that compound sub-components (Toolbar, Header, Footer, etc.) can consume.
 *
 * Architecture:
 *   VNInvestChartsProvider
 *     ├── WidgetI18nProvider (already exists)
 *     ├── VNInvestChartsConfigProvider (theme, locale, symbol, timeframe, adapter)
 *     ├── VNInvestChartsStateProvider (panes, drawings, activeTool)
 *     └── HoverEmitter ref (high-frequency hover events via EventTarget)
 */

import { createContext, useContext, useRef, type ReactNode } from "react";
import type { ChartTheme } from "../../lib/core";
import type { PaneDescriptor } from "../../lib/core/types/pane-descriptor";
import type { DrawingObject } from "@vninvestcharts/engine-drawing";
import type { StockDataAdapter, Timeframe } from "../../lib/types/adapter";
import type { WidgetLocale, WidgetMessages } from "../i18n/types";
import { WidgetI18nProvider } from "./WidgetI18nContext";
import { VNInvestChartsConfigContext, VNInvestChartsConfigProvider } from "./VNInvestChartsConfigContext";
import { VNInvestChartsStateProvider } from "./VNInvestChartsStateContext";
import { createHoverEmitter, type HoverEmitter } from "./HoverEmitter";

export interface VNInvestChartsProviderProps {
	// Config props (low-frequency)
	adapter: StockDataAdapter;
	symbol?: string;
	timeframe?: Timeframe;
	locale?: WidgetLocale;
	messages?: Partial<WidgetMessages>;
	theme?: ChartTheme;

	// State props (medium-frequency)
	panes?: readonly PaneDescriptor[];
	drawings?: readonly DrawingObject[];
	activeTool?: string;
	/** Per-chart pane-layout storage namespace (multi-chart cell id). */
	storageScopeId?: string | null;

	// Portal root for Shadow DOM isolation (modals, tooltips)
	portalRoot?: HTMLElement | null;

	// Shadow root for event listener registration (Shadow DOM isolation)
	shadowRoot?: ShadowRoot | null;

	// Callbacks
	onLocaleChange?: (locale: WidgetLocale) => void;

	children: ReactNode;
}

/** Context for accessing the internal portal root (for Shadow DOM isolation) */
const PortalRootContext = createContext<HTMLElement | null>(null);

/**
 * Hook to access the internal portal root for rendering modals/tooltips inside Shadow DOM.
 * Returns the portal root element, or null if not in Shadow DOM mode.
 */
export function usePortalRoot(): HTMLElement | null {
	return useContext(PortalRootContext);
}

/** Context for accessing the shadow root (for event listener registration in Shadow DOM) */
const ShadowRootContext = createContext<ShadowRoot | null>(null);

/** Context for accessing the hover emitter ref (high-frequency hover events via EventTarget) */
const HoverEmitterContext = createContext<React.RefObject<HoverEmitter | null>>({ current: null });

/**
 * Hook to access the shadow root for registering capture-phase event listeners.
 * Returns the shadow root element, or null if not in Shadow DOM mode.
 */
export function useShadowRoot(): ShadowRoot | null {
	return useContext(ShadowRootContext);
}

/**
 * Hook to access the hover emitter ref from any descendant component.
 *
 * Usage:
 *   const emitterRef = useHoverEmitterRef();
 *   emitHover(emitterRef.current, { datum, pixelX, pixelY, paneId });
 */
export function useHoverEmitterRef(): React.RefObject<HoverEmitter | null> {
	return useContext(HoverEmitterContext);
}

/**
 * Root provider for the compound component architecture.
 *
 * Wraps the existing VNInvestCharts prop-driven implementation — does NOT replace it.
 * Compound sub-components (Toolbar, Header, Footer, etc.) consume this context.
 */
export function VNInvestChartsProvider({
	adapter,
	symbol,
	timeframe,
	locale,
	messages,
	theme,
	panes,
	drawings,
	activeTool,
	storageScopeId,
	portalRoot,
	shadowRoot,
	onLocaleChange,
	children,
}: VNInvestChartsProviderProps) {
	const hoverEmitterRef = useRef<HoverEmitter>(createHoverEmitter());

	const resolvedTheme: ChartTheme = theme ?? "modern-light";
	const resolvedLocale: WidgetLocale = locale ?? "vi";

	return (
		<WidgetI18nProvider locale={resolvedLocale} messages={messages} onLocaleChange={onLocaleChange}>
			<VNInvestChartsConfigProvider
				value={{
					theme: resolvedTheme,
					locale: resolvedLocale,
					symbol,
					timeframe,
					adapter,
				}}
			>
				<VNInvestChartsStateProvider
					initialPanes={panes}
					initialDrawings={drawings}
					initialActiveTool={activeTool}
					storageScopeId={storageScopeId}
				>
					<PortalRootContext.Provider value={portalRoot ?? null}>
						<ShadowRootContext.Provider value={shadowRoot ?? null}>
							<HoverEmitterContext.Provider value={hoverEmitterRef}>
								{children}
							</HoverEmitterContext.Provider>
						</ShadowRootContext.Provider>
					</PortalRootContext.Provider>
				</VNInvestChartsStateProvider>
			</VNInvestChartsConfigProvider>
		</WidgetI18nProvider>
	);
}

export { VNInvestChartsConfigContext, VNInvestChartsConfigProvider, type VNInvestChartsConfigContextValue } from "./VNInvestChartsConfigContext";
export { VNInvestChartsStateContext, VNInvestChartsStateProvider, useVNInvestChartsState, type VNInvestChartsStateContextValue, type PaneState, type DrawingInteraction, type ActiveToolState } from "./VNInvestChartsStateContext";
export {
	createHoverEmitter,
	emitHover,
	clearHover,
	useHoverSubscription,
	useHoverState,
	type HoverEventPayload,
	type HoverEmitter,
} from "./HoverEmitter";
