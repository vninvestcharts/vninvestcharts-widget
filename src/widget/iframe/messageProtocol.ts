/**
 * WP-11: Iframe PostMessage Protocol Types
 *
 * Defines the typed message protocol for Host ↔ Iframe communication.
 * Custom Data Adapters (callbacks) CANNOT be serialized over postMessage.
 * Iframe mode only supports built-in adapters via JSON-serializable config.
 */

// ============================================================================
// Base Message Structure
// ============================================================================

/** Base message envelope with correlation ID for request/response matching */
export interface BaseMessage {
	/** Unique message type identifier */
	type: string;
	/** Correlation ID for matching requests to responses */
	correlationId: string;
	/** Timestamp when message was sent */
	timestamp: number;
	/** Origin of the message (for security validation) */
	origin: string;
}

/** Request message expecting a response */
export interface RequestMessage<T = unknown> extends BaseMessage {
	type: `request:${string}`;
	payload: T;
}

/** Response message to a request */
export interface ResponseMessage<T = unknown> extends BaseMessage {
	type: `response:${string}`;
	correlationId: string; // Must match request correlationId
	payload: T;
	success: boolean;
	error?: string;
}

/** Event notification (fire-and-forget, no response expected) */
export interface EventMessage<T = unknown> extends BaseMessage {
	type: `event:${string}`;
	payload: T;
}

// ============================================================================
// Adapter Configuration (JSON-serializable only)
// ============================================================================

/** Built-in adapter types supported in Iframe mode */
export type BuiltInAdapterType =
	| "vninvest"
	| "tvfeed"
	| "yahoo"
	| "binance"
	| "coinbase"
	| "twelvedata"
	| "alphavantage"
	| "finnhub"
	| "polygon";

/** Adapter configuration - MUST be JSON-serializable (no functions) */
export interface AdapterConfig {
	/** Built-in adapter type identifier */
	type: BuiltInAdapterType;
	/** Adapter-specific configuration options */
	options?: Record<string, string | number | boolean | null>;
	/** Authentication token (if required) */
	token?: string;
}

/** Widget configuration for Iframe initialization */
export interface WidgetConfig {
	/** Symbol to display (e.g., "VNM", "AAPL") */
	symbol: string;
	/** Timeframe (e.g., "1D", "1H", "5m") */
	timeframe: string;
	/** Chart theme */
	theme?: string;
	/** Adapter configuration (built-in only, no custom callbacks) */
	adapter?: AdapterConfig;
	/** Initial visible range (e.g., "6M", "1Y", "ALL") */
	range?: string;
	/** Locale */
	locale?: string;
	/** Enable drawing tools UI */
	drawingUiEnabled?: boolean;
	/** Initial drawing tool */
	drawingActiveTool?: string;
	/** Pre-loaded drawings */
	drawings?: readonly any[];
	/** Drawing storage key for persistence */
	drawingStorageKey?: string;
	/** Show header with symbol search, fullscreen, etc. */
	showHeader?: boolean;
	/** Show footer with timeframe selector */
	showFooter?: boolean;
	/** Show drawing toolbar */
	showToolbar?: boolean;
	/** Measurement tool enabled */
	measurementEnabled?: boolean;
	/** Non-trading days visibility */
	showNonTradingDays?: boolean;
	/** Timezone */
	timezone?: string;
	/**
	 * E1: frame height. `"fill"` (default) = iframe fills the host container
	 * 100%/100% (host owns the frame — TradingView standard, zero resize
	 * messages). A number sets a fixed card height in px and enables the
	 * guarded `event:resized` reporter for bottom-panel expansion.
	 */
	height?: number | "fill";
	/** Custom panes configuration */
	panes?: readonly any[];
	/** Tenant PAT for SaaS features */
	tenantPat?: string;
	/** CS-3: host-pinned offline license key (`vni1.*`) */
	licenseKey?: string;
	/** Debug features override */
	debugFeatures?: Record<string, boolean>;
	/**
	 * E3: right dock in iframe. `show` maps to the widget `showDock` gate;
	 * `defaultTab` seeds the persisted dock tab; `watchlist` builds a static
	 * in-iframe adapter (JSON-only — custom adapters cannot cross postMessage).
	 */
	dock?: {
		show?: boolean;
		defaultTab?: string;
		watchlist?: string[];
	};
}

// ============================================================================
// Host → Iframe Commands
// ============================================================================

/** Initialize widget with configuration */
export interface InitializeCommand {
	type: "request:initialize";
	correlationId: string;
	timestamp: number;
	origin: string;
	payload: WidgetConfig;
}

/** Update widget symbol */
export interface SetSymbolCommand {
	type: "request:setSymbol";
	correlationId: string;
	timestamp: number;
	origin: string;
	payload: { symbol: string };
}

/** Update timeframe */
export interface SetTimeframeCommand {
	type: "request:setTimeframe";
	correlationId: string;
	timestamp: number;
	origin: string;
	payload: { timeframe: string };
}

/** Update visible range */
export interface SetRangeCommand {
	type: "request:setRange";
	correlationId: string;
	timestamp: number;
	origin: string;
	payload: { range: string };
}

/** Update theme */
export interface SetThemeCommand {
	type: "request:setTheme";
	correlationId: string;
	timestamp: number;
	origin: string;
	payload: { theme: "light" | "dark" };
}

/** Update drawings (full replacement) */
export interface SetDrawingsCommand {
	type: "request:setDrawings";
	correlationId: string;
	timestamp: number;
	origin: string;
	payload: { drawings: readonly any[] };
}

/** Add a single drawing */
export interface AddDrawingCommand {
	type: "request:addDrawing";
	correlationId: string;
	timestamp: number;
	origin: string;
	payload: { drawing: any };
}

/** Remove a drawing by ID */
export interface RemoveDrawingCommand {
	type: "request:removeDrawing";
	correlationId: string;
	timestamp: number;
	origin: string;
	payload: { drawingId: string };
}

/** Update drawing properties */
export interface UpdateDrawingCommand {
	type: "request:updateDrawing";
	correlationId: string;
	timestamp: number;
	origin: string;
	payload: { drawingId: string; updates: Partial<any> };
}

/** Set active drawing tool */
export interface SetActiveToolCommand {
	type: "request:setActiveTool";
	correlationId: string;
	timestamp: number;
	origin: string;
	payload: { tool: string };
}

/** E3: switch the right-dock tab (no-op when the dock is closed or missing the tab) */
export interface SetDockTabCommand {
	type: "request:setDockTab";
	correlationId: string;
	timestamp: number;
	origin: string;
	payload: { tab: string };
}

/** E3: replace the dock watchlist (static symbols; streaming arrives in E5) */
export interface SetWatchlistCommand {
	type: "request:setWatchlist";
	correlationId: string;
	timestamp: number;
	origin: string;
	payload: { symbols: string[] };
}

/** E5: host subscribes to live quotes fan-out */
export interface SubscribeQuotesCommand {
	type: "request:subscribeQuotes";
	correlationId: string;
	timestamp: number;
	origin: string;
	payload: { symbols: string[] };
}

/** E5: host unsubscribes (omitted symbols = all) */
export interface UnsubscribeQuotesCommand {
	type: "request:unsubscribeQuotes";
	correlationId: string;
	timestamp: number;
	origin: string;
	payload: { symbols?: string[] };
}

/** Export current drawings */
export interface ExportDrawingsCommand {
	type: "request:exportDrawings";
	correlationId: string;
	timestamp: number;
	origin: string;
	payload: Record<string, never>;
}

/** Get current visible range */
export interface GetVisibleRangeCommand {
	type: "request:getVisibleRange";
	correlationId: string;
	timestamp: number;
	origin: string;
	payload: Record<string, never>;
}

/** Get current pane snapshots */
export interface GetPaneSnapshotsCommand {
	type: "request:getPaneSnapshots";
	correlationId: string;
	timestamp: number;
	origin: string;
	payload: Record<string, never>;
}

/** Capture snapshot as image */
export interface CaptureSnapshotCommand {
	type: "request:captureSnapshot";
	correlationId: string;
	timestamp: number;
	origin: string;
	payload: { format?: "png" | "jpeg"; quality?: number };
}

/** Toggle fullscreen */
export interface ToggleFullscreenCommand {
	type: "request:toggleFullscreen";
	correlationId: string;
	timestamp: number;
	origin: string;
	payload: Record<string, never>;
}

/** Set locale */
export interface SetLocaleCommand {
	type: "request:setLocale";
	correlationId: string;
	timestamp: number;
	origin: string;
	payload: { locale: string };
}

/** Set timezone */
export interface SetTimezoneCommand {
	type: "request:setTimezone";
	correlationId: string;
	timestamp: number;
	origin: string;
	payload: { timezone: string };
}

/** Destroy widget and cleanup */
export interface DestroyCommand {
	type: "request:destroy";
	correlationId: string;
	timestamp: number;
	origin: string;
	payload: Record<string, never>;
}

/** Union of all Host → Iframe commands */
export type HostToIframeCommand =
	| InitializeCommand
	| SetSymbolCommand
	| SetTimeframeCommand
	| SetRangeCommand
	| SetThemeCommand
	| SetDrawingsCommand
	| AddDrawingCommand
	| RemoveDrawingCommand
	| UpdateDrawingCommand
	| SetActiveToolCommand
	| SetDockTabCommand
	| SetWatchlistCommand
	| SubscribeQuotesCommand
	| UnsubscribeQuotesCommand
	| ExportDrawingsCommand
	| GetVisibleRangeCommand
	| GetPaneSnapshotsCommand
	| CaptureSnapshotCommand
	| ToggleFullscreenCommand
	| SetLocaleCommand
	| SetTimezoneCommand
	| DestroyCommand;

// ============================================================================
// Iframe → Host Events
// ============================================================================

/** Widget initialized and ready */
export interface ReadyEvent {
	type: "event:ready";
	correlationId: string;
	timestamp: number;
	origin: string;
	payload: { version: string; capabilities: string[] };
}

/** Symbol changed */
export interface SymbolChangedEvent {
	type: "event:symbolChanged";
	correlationId: string;
	timestamp: number;
	origin: string;
	payload: { symbol: string; previousSymbol: string | null };
}

/** Timeframe changed */
export interface TimeframeChangedEvent {
	type: "event:timeframeChanged";
	correlationId: string;
	timestamp: number;
	origin: string;
	payload: { timeframe: string; previousTimeframe: string | null };
}

/** Visible range changed (pan/zoom) */
export interface VisibleRangeChangedEvent {
	type: "event:visibleRangeChanged";
	correlationId: string;
	timestamp: number;
	origin: string;
	payload: {
		startIndex: number;
		endIndex: number;
		startDate: string;
		endDate: string;
		barCount: number;
	};
}

/** Drawings changed */
export interface DrawingsChangedEvent {
	type: "event:drawingsChanged";
	correlationId: string;
	timestamp: number;
	origin: string;
	payload: { drawings: readonly any[]; action: "add" | "remove" | "update" | "replace" };
}

/** Drawing tool changed */
export interface ActiveToolChangedEvent {
	type: "event:activeToolChanged";
	correlationId: string;
	timestamp: number;
	origin: string;
	payload: { tool: string; previousTool: string | null };
}

/** Theme changed */
export interface ThemeChangedEvent {
	type: "event:themeChanged";
	correlationId: string;
	timestamp: number;
	origin: string;
	payload: { theme: "light" | "dark" };
}

/** Error occurred */
export interface ErrorEvent {
	type: "event:error";
	correlationId: string;
	timestamp: number;
	origin: string;
	payload: { code: string; message: string; recoverable: boolean };
}

/** Snapshot captured */
export interface SnapshotCapturedEvent {
	type: "event:snapshotCaptured";
	correlationId: string;
	timestamp: number;
	origin: string;
	payload: { dataUrl: string; format: string; width: number; height: number };
}

/** Fullscreen toggled */
export interface FullscreenToggledEvent {
	type: "event:fullscreenToggled";
	correlationId: string;
	timestamp: number;
	origin: string;
	payload: { isFullscreen: boolean };
}

/** SaaS feature gate error (premium feature blocked) */
export interface SaaSErrorEvent {
	type: "event:saasError";
	correlationId: string;
	timestamp: number;
	origin: string;
	payload: { feature: string; message: string; requiresUpgrade: boolean };
}

/** Adapter error (data fetch failed) */
export interface AdapterErrorEvent {
	type: "event:adapterError";
	correlationId: string;
	timestamp: number;
	origin: string;
	payload: { code: string; message: string; adapterType: string };
}

/** Frame resized (E1: card mode only — fill mode never emits this) */
export interface ResizedEvent {
	type: "event:resized";
	correlationId: string;
	timestamp: number;
	origin: string;
	payload: { height: number };
}

/** E5: batched live quotes (latest-wins per symbol, ≥250ms cadence) */
export interface QuotesEvent {
	type: "event:quotes";
	correlationId: string;
	timestamp: number;
	origin: string;
	payload: {
		updates: Array<{
			symbol: string;
			price?: number;
			change?: number;
			changePercent?: number;
			sparkline?: number[];
		}>;
	};
}

/** Union of all Iframe → Host events */
export type IframeToHostEvent =
	| ReadyEvent
	| SymbolChangedEvent
	| TimeframeChangedEvent
	| VisibleRangeChangedEvent
	| DrawingsChangedEvent
	| ActiveToolChangedEvent
	| ThemeChangedEvent
	| ErrorEvent
	| SnapshotCapturedEvent
	| FullscreenToggledEvent
	| SaaSErrorEvent
	| AdapterErrorEvent
	| ResizedEvent
	| QuotesEvent;

// ============================================================================
// Response Payloads
// ============================================================================

/** Initialize response */
export interface InitializeResponse {
	success: true;
	widgetId: string;
}

/** Export drawings response */
export interface ExportDrawingsResponse {
	success: true;
	drawings: readonly any[];
}

/** Get visible range response */
export interface GetVisibleRangeResponse {
	success: true;
	range: {
		startIndex: number;
		endIndex: number;
		startDate: string;
		endDate: string;
		barCount: number;
	} | null;
}

/** Get pane snapshots response */
export interface GetPaneSnapshotsResponse {
	success: true;
	snapshots: readonly any[];
}

/** Capture snapshot response */
export interface CaptureSnapshotResponse {
	success: true;
	dataUrl: string;
}

/** Generic error response */
export interface ErrorResponse {
	success: false;
	error: string;
}

/** Generic success response (for commands that don't return data) */
export interface SuccessResponse {
	success: true;
}

/** Union of all response payloads */
export type ResponsePayload =
	| InitializeResponse
	| ExportDrawingsResponse
	| GetVisibleRangeResponse
	| GetPaneSnapshotsResponse
	| CaptureSnapshotResponse
	| SuccessResponse
	| ErrorResponse;

// ============================================================================
// Type Guards
// ============================================================================

/** Check if message is a request */
export function isRequestMessage(msg: unknown): msg is RequestMessage {
	return (
		typeof msg === "object" &&
		msg !== null &&
		"type" in msg &&
		typeof (msg as { type: string }).type === "string" &&
		(msg as { type: string }).type.startsWith("request:")
	);
}

/** Check if message is a response */
export function isResponseMessage(msg: unknown): msg is ResponseMessage<ResponsePayload> {
	return (
		typeof msg === "object" &&
		msg !== null &&
		"type" in msg &&
		typeof (msg as { type: string }).type === "string" &&
		(msg as { type: string }).type.startsWith("response:")
	);
}

/** Check if message is an event */
export function isEventMessage(msg: unknown): msg is EventMessage {
	return (
		typeof msg === "object" &&
		msg !== null &&
		"type" in msg &&
		typeof (msg as { type: string }).type === "string" &&
		(msg as { type: string }).type.startsWith("event:")
	);
}

/** Check if message is Host → Iframe command */
export function isHostToIframeCommand(msg: unknown): msg is HostToIframeCommand {
	return isRequestMessage(msg);
}

/** Check if message is Iframe → Host event */
export function isIframeToHostEvent(msg: unknown): msg is IframeToHostEvent {
	return isEventMessage(msg);
}

// ============================================================================
// Utility Functions
// ============================================================================

/** Generate a unique correlation ID */
export function generateCorrelationId(): string {
	return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/** Create a request message */
export function createRequest<T>(type: `request:${string}`, payload: T, origin: string): RequestMessage<T> {
	return {
		type,
		correlationId: generateCorrelationId(),
		timestamp: Date.now(),
		origin,
		payload,
	};
}

/** Create a response message */
export function createResponse<T>(request: RequestMessage, payload: T, success = true, error?: string): ResponseMessage<T> {
	return {
		type: `response:${request.type.replace("request:", "")}` as `response:${string}`,
		correlationId: request.correlationId,
		timestamp: Date.now(),
		origin: typeof window !== "undefined" ? window.location.origin : "unknown",
		payload,
		success,
		error,
	};
}

/** Create an event message */
export function createEvent<T>(type: `event:${string}`, payload: T, origin: string): EventMessage<T> {
	return {
		type,
		correlationId: generateCorrelationId(),
		timestamp: Date.now(),
		origin,
		payload,
	};
}