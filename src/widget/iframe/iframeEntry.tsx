/**
 * WP-11: Iframe Entry Point - Widget running inside iframe
 *
 * This is the standalone entry point for the iframe-hosted widget.
 * It initializes the bridge, listens for commands from Host, and renders the widget.
 */

import { createRoot, type Root } from "react-dom/client";
import { VNInvestCharts, type VNInvestChartsProps } from "../VNInvestCharts";
import { injectVNInvestChartsCSS } from "../styles/injectStyles";
import { IframeBridge, createIframeBridge, type RequestHandler, type HostToIframeCommand, type ResponsePayload, type IframeToHostEvent, type WidgetConfig, DEFAULT_ALLOWED_ORIGINS } from "./iframeBridge";
import type { Timeframe } from "../../lib/types/adapter";
import type { WidgetLocale } from "../i18n/types";
import type { WidgetTimezone } from "../../lib/utils/timezoneFormatter";
import { generateCorrelationId, createEvent, isHostToIframeCommand, type InitializeResponse, type ExportDrawingsResponse, type GetVisibleRangeResponse, type GetPaneSnapshotsResponse, type CaptureSnapshotResponse, type SuccessResponse } from "./messageProtocol";
import type { ChartTheme } from "../../lib/core";
import { createBuiltInAdapter as createBuiltInAdapterFactory, type BuiltInAdapter } from "./builtInAdapters";
import type { WatchlistAdapter } from "../types/watchlist";
import { createQuoteHub, type QuoteHub } from "./quoteHub";
import { createFrameController } from "./iframeFrame";
import { createQuotesController, type BarStreamSource } from "./iframeQuotes";

// SSR Guard
if (typeof window === "undefined" || typeof document === "undefined") {
	throw new Error("VNInvestCharts iframe entry requires browser environment");
}

// Inject CSS into iframe document
injectVNInvestChartsCSS(document);

// Get container (iframe body)
const container = document.body;
container.style.margin = "0";
container.style.padding = "0";
container.style.width = "100%";
container.style.height = "100%";
container.style.overflow = "hidden";

// E1 frame sizing lives in iframeFrame.ts (budget split).
const frameController = createFrameController(container, () => bridge);
const applyFrameHeight = frameController.applyFrameHeight;
const stopFrameResizeReporter = frameController.stopFrameResizeReporter;

// Widget ref for imperative API
let widgetRef: React.RefObject<any> | null = null;
let currentConfig: WidgetConfig | null = null;
let currentProps: VNInvestChartsProps | null = null;
let root: Root | null = null;
let bridge: IframeBridge | null = null;
let isInitialized = false;

/**
 * Handle incoming commands from Host (exported for tests).
 */
// E2: previous values for change events (initialized from config).
let prevSymbol: string | null = null;
let prevTimeframe: string | null = null;
let prevTool: string | null = null;

// E5 quote wiring lives in iframeQuotes.ts (budget split).
const quotesController = createQuotesController((updates) => {
	emitEvent({
		type: "event:quotes",
		correlationId: generateCorrelationId(),
		timestamp: Date.now(),
		origin: typeof window !== "undefined" ? window.location.origin : "",
		payload: { updates },
	});
});
const getQuoteHub = (): QuoteHub => quotesController.getHub();

export const requestHandler: RequestHandler = async (command: HostToIframeCommand): Promise<ResponsePayload> => {
	// E2: every command failure is forwarded as event:error (bridge still
	// returns success:false — this is the subscription path for hosts).
	try {
		switch (command.type) {
			case "request:initialize": {
				const config = command.payload;
				currentConfig = config;
				await initializeWidget(config);
				const response: InitializeResponse = { success: true, widgetId: `vnsc-${generateCorrelationId()}` };
				return response;
			}

			case "request:setSymbol": {
			// The widget exposes no imperative setSymbol; `symbol` is a
			// controlled prop, so re-render with the requested symbol.
				if (typeof command.payload.symbol !== "string" || command.payload.symbol.trim() === "") {
					throw new Error("setSymbol requires a non-empty symbol");
				}
				rerenderWidget({ symbol: command.payload.symbol });
				emitEvent({
					type: "event:symbolChanged",
					correlationId: generateCorrelationId(),
					timestamp: Date.now(),
					origin: window.location.origin,
					payload: { symbol: command.payload.symbol, previousSymbol: prevSymbol },
				});
				prevSymbol = command.payload.symbol;
				const response: SuccessResponse = { success: true };
				return response;
			}

			case "request:setTimeframe": {
				if (!widgetRef?.current) throw new Error("Widget not initialized");
				widgetRef.current.setTimeframe?.(command.payload.timeframe);
				emitEvent({
					type: "event:timeframeChanged",
					correlationId: generateCorrelationId(),
					timestamp: Date.now(),
					origin: window.location.origin,
					payload: { timeframe: command.payload.timeframe, previousTimeframe: prevTimeframe },
				});
				prevTimeframe = command.payload.timeframe;
				const response: SuccessResponse = { success: true };
				return response;
			}

			case "request:setRange": {
			// The widget has no imperative range setter; `range` is a controlled
			// prop, so re-render with the requested period (e.g. "6M").
				rerenderWidget({ range: command.payload.range });
				emitVisibleRangeChanged();
				const response: SuccessResponse = { success: true };
				return response;
			}

			case "request:setTheme": {
			// Honor the requested theme instead of blindly toggling.
				rerenderWidget({ theme: command.payload.theme as ChartTheme });
				emitEvent({
					type: "event:themeChanged",
					correlationId: generateCorrelationId(),
					timestamp: Date.now(),
					origin: window.location.origin,
					payload: { theme: command.payload.theme },
				});
				const response: SuccessResponse = { success: true };
				return response;
			}

			case "request:setDrawings": {
				if (!widgetRef?.current) throw new Error("Widget not initialized");
				widgetRef.current.importDrawings?.(command.payload.drawings);
				ensureDrawingsForwarding();
				emitEvent({
					type: "event:drawingsChanged",
					correlationId: generateCorrelationId(),
					timestamp: Date.now(),
					origin: window.location.origin,
					payload: { drawings: command.payload.drawings ?? [], action: "replace" },
				});
				const response: SuccessResponse = { success: true };
				return response;
			}

			case "request:addDrawing": {
				if (!widgetRef?.current) throw new Error("Widget not initialized");
				const drawings = widgetRef.current.exportDrawings?.() || [];
				widgetRef.current.importDrawings?.([...drawings, command.payload.drawing]);
				ensureDrawingsForwarding();
				emitEvent({
					type: "event:drawingsChanged",
					correlationId: generateCorrelationId(),
					timestamp: Date.now(),
					origin: window.location.origin,
					payload: { drawings: [...drawings, command.payload.drawing], action: "add" },
				});
				const response: SuccessResponse = { success: true };
				return response;
			}

			case "request:removeDrawing": {
				if (!widgetRef?.current) throw new Error("Widget not initialized");
				const drawings = widgetRef.current.exportDrawings?.() || [];
				const next = drawings.filter((d: any) => d.id !== command.payload.drawingId);
				widgetRef.current.importDrawings?.(next);
				ensureDrawingsForwarding();
				emitEvent({
					type: "event:drawingsChanged",
					correlationId: generateCorrelationId(),
					timestamp: Date.now(),
					origin: window.location.origin,
					payload: { drawings: next, action: "remove" },
				});
				const response: SuccessResponse = { success: true };
				return response;
			}

			case "request:updateDrawing": {
				if (!widgetRef?.current) throw new Error("Widget not initialized");
				const drawings = widgetRef.current.exportDrawings?.() || [];
				const updated = drawings.map((d: any) =>
					d.id === command.payload.drawingId ? { ...d, ...command.payload.updates } : d
				);
				widgetRef.current.importDrawings?.(updated);
				ensureDrawingsForwarding();
				emitEvent({
					type: "event:drawingsChanged",
					correlationId: generateCorrelationId(),
					timestamp: Date.now(),
					origin: window.location.origin,
					payload: { drawings: updated, action: "update" },
				});
				const response: SuccessResponse = { success: true };
				return response;
			}

			case "request:setDockTab": {
			// E3: drive the dock through the same in-memory bus the widget
			// uses for multi-chart sync (D5) + persist for remounts.
				try {
					window.localStorage?.setItem("vnsc_dock_tab", command.payload.tab);
				} catch {
				// ignore storage errors
				}
				try {
					window.dispatchEvent(new CustomEvent("vnsc_dock_tab", {
						detail: { tab: command.payload.tab, open: true },
					}));
				} catch {
				// ignore event errors
				}
				const response: SuccessResponse = { success: true };
				return response;
			}

			case "request:setWatchlist": {
			// E3: rebuild the static adapter and re-render (streaming in E5).
				if (currentConfig) {
					currentConfig = { ...currentConfig, dock: { ...currentConfig.dock, watchlist: command.payload.symbols } };
				}
				const adapter = buildStaticWatchlistAdapter(command.payload.symbols);
				quotesController.setWatchlistAdapter(adapter ?? null);
				rerenderWidget({ watchlistAdapter: adapter });
				const response: SuccessResponse = { success: true };
				return response;
			}

			case "request:subscribeQuotes": {
				getQuoteHub().subscribe(command.payload.symbols ?? []);
				const response: SuccessResponse = { success: true };
				return response;
			}

			case "request:unsubscribeQuotes": {
				getQuoteHub().unsubscribe(command.payload.symbols);
				const response: SuccessResponse = { success: true };
				return response;
			}

			case "request:setActiveTool": {
				if (!widgetRef?.current) throw new Error("Widget not initialized");
				widgetRef.current.getDrawingWorkspace?.().setActiveTool(command.payload.tool as string);
				emitEvent({
					type: "event:activeToolChanged",
					correlationId: generateCorrelationId(),
					timestamp: Date.now(),
					origin: window.location.origin,
					payload: { tool: command.payload.tool as string, previousTool: prevTool },
				});
				prevTool = command.payload.tool as string;
				const response: SuccessResponse = { success: true };
				return response;
			}

			case "request:exportDrawings": {
				if (!widgetRef?.current) throw new Error("Widget not initialized");
				const drawings = widgetRef.current.exportDrawings?.() || [];
				const response: ExportDrawingsResponse = { success: true, drawings };
				return response;
			}

			case "request:getVisibleRange": {
				if (!widgetRef?.current) throw new Error("Widget not initialized");
				const range = widgetRef.current.getVisibleRange?.();
				const response: GetVisibleRangeResponse = { success: true, range };
				return response;
			}

			case "request:getPaneSnapshots": {
				if (!widgetRef?.current) throw new Error("Widget not initialized");
				const snapshots = widgetRef.current.getPaneSnapshots?.() || [];
				const response: GetPaneSnapshotsResponse = { success: true, snapshots };
				return response;
			}

			case "request:captureSnapshot": {
				if (!widgetRef?.current) throw new Error("Widget not initialized");
				const dataUrl = await captureWidgetSnapshot(
					() => widgetRef?.current?.captureSnapshot?.(),
					command.payload.format,
					command.payload.quality,
				);
				if (!dataUrl) {
					throw new Error("Snapshot capture unavailable (fork runtime with a mounted engine is required)");
				}
				emitEvent({
					type: "event:snapshotCaptured",
					correlationId: generateCorrelationId(),
					timestamp: Date.now(),
					origin: window.location.origin,
					payload: { dataUrl, format: command.payload.format ?? "png", width: 0, height: 0 },
				});
				const response: CaptureSnapshotResponse = { success: true, dataUrl };
				return response;
			}

			case "request:toggleFullscreen": {
				if (!widgetRef?.current) throw new Error("Widget not initialized");
				widgetRef.current.toggleFullscreen?.();
				emitEvent({
					type: "event:fullscreenToggled",
					correlationId: generateCorrelationId(),
					timestamp: Date.now(),
					origin: window.location.origin,
					payload: { isFullscreen: true },
				});
				const response: SuccessResponse = { success: true };
				return response;
			}

			case "request:setLocale": {
			// Locale is a controlled prop; re-render so i18n + formatters pick it up.
				rerenderWidget({ locale: command.payload.locale as WidgetLocale });
				const response: SuccessResponse = { success: true };
				return response;
			}

			case "request:setTimezone": {
			// Timezone is a controlled prop; re-render so axis/tooltip formatters update.
				rerenderWidget({ timezone: command.payload.timezone as WidgetTimezone });
				const response: SuccessResponse = { success: true };
				return response;
			}

			case "request:destroy": {
				destroyWidget();
				const response: SuccessResponse = { success: true };
				return response;
			}

			default: {
			// Exhaustiveness check
				const _exhaustive: never = command;
				throw new Error(`Unknown command: ${_exhaustive}`);
			}
		}
	} catch (error) {
		emitEvent({
			type: "event:error",
			correlationId: generateCorrelationId(),
			timestamp: Date.now(),
			origin: typeof window !== "undefined" ? window.location.origin : "",
			payload: {
				code: "COMMAND_FAILED",
				message: error instanceof Error ? error.message : String(error),
				recoverable: true,
			},
		});
		throw error;
	}
};

/**
 * E3: static in-iframe watchlist adapter from plain symbols (JSON-safe).
 * No streaming here — live quotes arrive via E5 subscribeQuotes.
 */
export function buildStaticWatchlistAdapter(symbols: readonly string[] | undefined): WatchlistAdapter | undefined {
	if (!symbols || symbols.length === 0) return undefined;
	const list = symbols.filter((s) => typeof s === "string" && s.trim() !== "").map((s) => ({ symbol: s.trim().toUpperCase() }));
	if (list.length === 0) return undefined;
	return {
		getWatchlist: () => list,
	};
}

/**
 * Build widget props from host config (exported for tests).
 */
export function buildWidgetProps(config: WidgetConfig): VNInvestChartsProps {
	return {
		symbol: config.symbol,
		timeframe: config.timeframe as Timeframe,
		theme: config.theme as ChartTheme,
		range: config.range,
		locale: config.locale as WidgetLocale,
		drawingUiEnabled: config.drawingUiEnabled ?? true,
		drawingActiveTool: config.drawingActiveTool,
		drawings: config.drawings,
		drawingStorageKey: config.drawingStorageKey,
		showHeader: config.showHeader ?? true,
		showFooter: config.showFooter ?? true,
		showToolbar: config.showToolbar ?? true,
		measurementEnabled: config.measurementEnabled,
		showNonTradingDays: config.showNonTradingDays,
		timezone: config.timezone as WidgetTimezone,
		panes: config.panes,
		tenantPat: config.tenantPat,
		licenseKey: config.licenseKey,
		debugFeatures: config.debugFeatures,
		// E3: dock in iframe (showDock gate + static watchlist adapter).
		showDock: config.dock?.show,
		watchlistAdapter: buildStaticWatchlistAdapter(config.dock?.watchlist),
		// E3: internal symbol changes (e.g. watchlist click) emit upstream,
		// closing the loop with request:setSymbol.
		onSymbolChange: (symbol: string) => {
			emitEvent({
				type: "event:symbolChanged",
				correlationId: generateCorrelationId(),
				timestamp: Date.now(),
				origin: typeof window !== "undefined" ? window.location.origin : "",
				payload: { symbol, previousSymbol: prevSymbol },
			});
			prevSymbol = symbol;
		},
		// Adapter handling: Iframe mode only supports built-in adapters via config
		// Custom adapter callbacks cannot be serialized over postMessage
		adapter: config.adapter ? createBuiltInAdapterFromConfig(config.adapter) : undefined,
	};
}

/**
 * Re-render the widget with merged props. This is the single mechanism behind
 * setSymbol/setRange/setTheme/setLocale/setTimezone: the widget owns no
 * imperative setters for these, so prop updates are the correct (and only) path.
 */
function rerenderWidget(patch: Partial<VNInvestChartsProps>): void {
	if (!root || !currentProps || !widgetRef) {
		throw new Error("Widget not initialized");
	}
	currentProps = { ...currentProps, ...patch };
	// Reuse the same ref object so the widget instance stays attached.
	root.render(<VNInvestCharts {...currentProps} ref={widgetRef} />);
}

/**
 * Initialize the widget with configuration
 */
async function initializeWidget(config: WidgetConfig): Promise<void> {
	// E1: frame sizing before first paint.
	applyFrameHeight(config);

	// E3: seed the persisted dock tab so the first mount opens correctly
	// (only when the host asked and nothing was persisted before).
	if (config.dock?.defaultTab) {
		try {
			if (!window.localStorage?.getItem("vnsc_dock_tab")) {
				window.localStorage.setItem("vnsc_dock_tab", config.dock.defaultTab);
			}
		} catch {
			// ignore storage errors
		}
	}

	// Convert WidgetConfig to VNInvestChartsProps
	const props = buildWidgetProps(config);

	// E5: hub sources follow the built adapters (structural check inside).
	quotesController.setWatchlistAdapter(props.watchlistAdapter ?? null);
	const maybeStream = props.adapter as unknown as Partial<BarStreamSource> | null;
	quotesController.setBarAdapter(
		maybeStream && typeof maybeStream.subscribeToBar === "function"
			? (maybeStream as BarStreamSource)
			: null,
		config.timeframe as Timeframe | undefined,
	);

	// Create React root and render
	root = createRoot(container);
	widgetRef = { current: null };
	currentProps = props;

	root.render(<VNInvestCharts {...props} ref={widgetRef} />);

	isInitialized = true;
	prevSymbol = props.symbol ?? null;
	prevTimeframe = (props.timeframe as string) ?? null;
	prevTool = (props.drawingActiveTool as string) ?? null;

	// E2: arm drawings forwarding after mount (async commit) — retried on
	// every drawings command via ensureDrawingsForwarding().
	setTimeout(() => ensureDrawingsForwarding(), 0);

	// Signal ready to Host
	bridge?.signalReady("0.4.0", [
		"symbol",
		"timeframe",
		"range",
		"theme",
		"drawings",
		"tools",
		"snapshots",
		"fullscreen",
		"locale",
		"timezone",
	]);
}

/**
 * Create built-in adapter from config (no custom callbacks)
 */
function createBuiltInAdapterFromConfig(config: WidgetConfig["adapter"]): BuiltInAdapter | undefined {
	if (!config) return undefined;

	// Use the built-in adapter factory
	const adapter = createBuiltInAdapterFactory(config);
	if (!adapter) {
		// E4: requested adapter unavailable — recoverable degradation to the
		// default data path (never a silent null).
		emitEvent({
			type: "event:adapterError",
			correlationId: generateCorrelationId(),
			timestamp: Date.now(),
			origin: typeof window !== "undefined" ? window.location.origin : "",
			payload: {
				code: "ADAPTER_UNAVAILABLE",
				message: `Built-in adapter '${config.type}' is not implemented; using default data path`,
				adapterType: config.type,
			},
		});
		return undefined;
	}
	return adapter;
}

/**
 * Convert an engine snapshot (canvas or bitmap) to a data URL.
 * Returns null when capture is unavailable. Exported for tests.
 */
export async function captureWidgetSnapshot(
	capture: () => Promise<ImageBitmap | HTMLCanvasElement | null | undefined> | ImageBitmap | HTMLCanvasElement | null | undefined,
	format: "png" | "jpeg" = "png",
	quality?: number,
): Promise<string | null> {
	const snapshot = await capture();
	if (!snapshot) return null;
	const mime = format === "jpeg" ? "image/jpeg" : "image/png";
	if (snapshot instanceof HTMLCanvasElement) {
		return snapshot.toDataURL(mime, quality);
	}
	// ImageBitmap → paint onto a canvas first.
	if (typeof document !== "undefined" && typeof document.createElement === "function") {
		const canvas = document.createElement("canvas");
		canvas.width = snapshot.width;
		canvas.height = snapshot.height;
		const context = canvas.getContext("2d");
		if (!context) return null;
		context.drawImage(snapshot, 0, 0);
		return canvas.toDataURL(mime, quality);
	}
	return null;
}

/**
 * Destroy widget and cleanup
 */
function destroyWidget(): void {
	if (root) {
		root.unmount();
		root = null;
	}
	// NOTE: cleanupObjectUrls/cleanupGlobalListeners do not exist on the widget
	// ref — root.unmount() is the complete cleanup (React tears down the tree,
	// effects, and listeners). Do not re-add dead method calls here.
	widgetRef = null;
	currentProps = null;
	isInitialized = false;
	currentConfig = null;
	prevSymbol = null;
	prevTimeframe = null;
	prevTool = null;
	drawingsForwardHooked = false;
	quotesController.reset();
	stopFrameResizeReporter();
}

/**
 * Reset module state for tests only. Not part of the runtime contract.
 */
export function __resetIframeEntryForTests(): void {
	widgetRef = null;
	currentConfig = null;
	currentProps = null;
	root = null;
	isInitialized = false;
	prevSymbol = null;
	prevTimeframe = null;
	prevTool = null;
	drawingsForwardHooked = false;
	quotesController.reset();
}

/**
 * Attach a fake widget handle for tests only (the real handle attaches via
 * React ref when the mocked root renders). Not part of the runtime contract.
 */
export function __setWidgetRefForTests(handle: unknown): void {
	widgetRef = { current: handle };
}

export function __getIframeEntryStateForTests(): {
	isInitialized: boolean;
	hasRoot: boolean;
	props: VNInvestChartsProps | null;
	} {
	return { isInitialized, hasRoot: root !== null, props: currentProps };
}

/**
 * Emit event to Host
 */
function emitEvent(event: IframeToHostEvent): void {
	bridge?.sendEvent(event);
}

/**
 * E2: best-effort visible-range event after setRange. Skipped silently when
 * the widget handle exposes no range (keeps the contract honest — no
 * fabricated indices/dates).
 */
function emitVisibleRangeChanged(): void {
	const range = widgetRef?.current?.getVisibleRange?.() as
		| { startIndex?: number; endIndex?: number; startDate?: string; endDate?: string; barCount?: number }
		| undefined;
	if (!range) return;
	emitEvent({
		type: "event:visibleRangeChanged",
		correlationId: generateCorrelationId(),
		timestamp: Date.now(),
		origin: window.location.origin,
		payload: {
			startIndex: range.startIndex ?? 0,
			endIndex: range.endIndex ?? 0,
			startDate: range.startDate ?? "",
			endDate: range.endDate ?? "",
			barCount: range.barCount ?? 0,
		},
	});
}

let drawingsForwardHooked = false;

/**
 * E2: hook the workspace drawings-changed callback exactly once (idempotent
 * via flag) so `event:drawingsChanged` fires on user edits, not just on
 * host-initiated drawing commands. Called after mount (async) and retried
 * on every drawings command for late mounts.
 */
function ensureDrawingsForwarding(): void {
	if (drawingsForwardHooked || !widgetRef?.current) return;

	const workspace = widgetRef.current.getDrawingWorkspace?.();
	if (!workspace) return;
	const originalOnDrawingsChange = workspace.state.onDrawingsChange;
	workspace.state.onDrawingsChange = (drawings: any[]) => {
		originalOnDrawingsChange?.(drawings);
		emitEvent({
			type: "event:drawingsChanged",
			correlationId: generateCorrelationId(),
			timestamp: Date.now(),
			origin: window.location.origin,
			payload: { drawings, action: "replace" },
		});
	};
	drawingsForwardHooked = true;
}

// Back-compat alias (was dead code pre-E2; now delegates to the hook).
function setupEventForwarding(): void {
	ensureDrawingsForwarding();
}

/**
 * E0: resolve the parent-origin allowlist. Query params (set by whoever
 * serves iframe.html) extend the compiled default whitelist:
 * - `?parentOrigin=https://doi-tac.vn` (repeatable) or
 *   `?allowedOrigins=https://a.vn,https://b.vn`
 * - `?allowAnyOrigin=1` works ONLY with the debug gate (`?vnsc_debug=1` or
 *   localStorage) — never in a plain prod load. `file://` parents (origin
 *   "null") must be listed explicitly to pass.
 */
export function resolveAllowedOrigins(search?: string): { allowedOrigins: string[]; allowAnyOrigin: boolean } {
	const allowed = new Set(DEFAULT_ALLOWED_ORIGINS);
	let allowAnyOrigin = false;
	try {
		const query = search ?? (typeof window.location?.search === "string" ? window.location.search : "");
		const params = new URLSearchParams(query);
		for (const origin of params.getAll("parentOrigin")) {
			if (origin) allowed.add(origin);
		}
		const csv = params.get("allowedOrigins");
		if (csv) {
			for (const origin of csv.split(",")) {
				const trimmed = origin.trim();
				if (trimmed) allowed.add(trimmed);
			}
		}
		if ((params.get("allowAnyOrigin") === "1" || params.get("allowAnyOrigin") === "true") && isIframeDebugEnabled()) {
			allowAnyOrigin = true;
		}
	} catch {
		// ignore malformed query
	}
	return { allowedOrigins: [...allowed], allowAnyOrigin };
}

/**
 * Initialize bridge and start listening
 */
function initBridge(): void {
	const { allowedOrigins, allowAnyOrigin } = resolveAllowedOrigins();
	bridge = createIframeBridge(allowedOrigins, {
		isHost: false,
		allowAnyOrigin,
		onReady: () => {
			console.log("[IframeEntry] Bridge ready");
		},
		onError: (error) => {
			console.error("[IframeEntry] Bridge error:", error);
		},
	});

	bridge.setRequestHandler(requestHandler);

	// Handle widget events and forward to Host
	// This would be expanded with actual event subscriptions
}

// Initialize
initBridge();

// Handle page unload
window.addEventListener("beforeunload", () => {
	destroyWidget();
	bridge?.destroy();
});

// Export for debugging — explicit opt-in ONLY. Deliberately NOT gated on
// NODE_ENV: bundlers do not reliably replace process.env in browser bundles
// (see IS_PRODUCTION lesson), so a runtime flag is the only trustworthy gate.
// Enable with ?vnsc_debug=1 in the iframe URL or localStorage "vnsc_debug"="1".
export function isIframeDebugEnabled(): boolean {
	try {
		if (typeof window === "undefined") return false;
		if (window.localStorage?.getItem("vnsc_debug") === "1") return true;
		const search = typeof window.location?.search === "string" ? window.location.search : "";
		return /(?:^\?|&)vnsc_debug=(1|true)\b/.test(search);
	} catch {
		return false;
	}
}

if (typeof window !== "undefined" && isIframeDebugEnabled()) {
	(window as unknown as { __VNINVESTCHARTS_IFRAME__?: unknown }).__VNINVESTCHARTS_IFRAME__ = {
		getWidgetRef: () => widgetRef,
		getConfig: () => currentConfig,
		getBridge: () => bridge,
	};
}