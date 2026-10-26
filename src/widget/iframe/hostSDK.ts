/**
 * WP-11: Host SDK - Type-safe API for embedding VNInvestCharts in an iframe
 *
 * Provides a clean Promise-based API for controlling the widget from the parent page.
 * Handles connection lifecycle, origin validation, and automatic reconnection.
 */

import { IframeBridge, createHostBridge, type BridgeConfig, type HostToIframeCommand, type IframeToHostEvent, type WidgetConfig, type AdapterConfig, type ResponsePayload, DEFAULT_ALLOWED_ORIGINS } from "./iframeBridge";

/** Host SDK configuration */
export interface HostSDKConfig {
	/** Iframe element or selector */
	iframe: HTMLIFrameElement | string;
	/** Allowed origins for postMessage security */
	allowedOrigins?: string[];
	/** Connection timeout in ms */
	connectionTimeout?: number;
	/** Request timeout in ms */
	requestTimeout?: number;
	/** Callback when widget is ready */
	onReady?: (info: { version: string; capabilities: string[] }) => void;
	/** Callback on widget events */
	onEvent?: (event: IframeToHostEvent) => void;
	/** Callback on connection error */
	onError?: (error: Error) => void;
	/** Callback when connection is lost */
	onDisconnect?: () => void;
}

/** Widget control API returned by HostSDK */
export interface WidgetController {
	/** Initialize widget with configuration */
	initialize(config: WidgetConfig): Promise<{ widgetId: string }>;
	/** Change symbol */
	setSymbol(symbol: string): Promise<void>;
	/** Change timeframe */
	setTimeframe(timeframe: string): Promise<void>;
	/** Change visible range */
	setRange(range: string): Promise<void>;
	/** Change theme */
	setTheme(theme: "light" | "dark"): Promise<void>;
	/** Replace all drawings */
	setDrawings(drawings: readonly any[]): Promise<void>;
	/** Add a drawing */
	addDrawing(drawing: any): Promise<void>;
	/** Remove a drawing by ID */
	removeDrawing(drawingId: string): Promise<void>;
	/** Update a drawing */
	updateDrawing(drawingId: string, updates: Partial<any>): Promise<void>;
	/** Set active drawing tool */
	setActiveTool(tool: string): Promise<void>;
	/** E3: switch the right-dock tab */
	setDockTab(tab: string): Promise<void>;
	/** E3: replace the dock watchlist (static symbols) */
	setWatchlist(symbols: string[]): Promise<void>;
	/** Export current drawings */
	exportDrawings(): Promise<readonly any[]>;
	/** Get current visible range */
	getVisibleRange(): Promise<{
		startIndex: number;
		endIndex: number;
		startDate: string;
		endDate: string;
		barCount: number;
	} | null>;
	/** Get current pane snapshots */
	getPaneSnapshots(): Promise<readonly any[]>;
	/** Capture snapshot as image */
	captureSnapshot(format?: "png" | "jpeg", quality?: number): Promise<string>;
	/** Toggle fullscreen */
	toggleFullscreen(): Promise<void>;
	/** Set locale */
	setLocale(locale: string): Promise<void>;
	/** Set timezone */
	setTimezone(timezone: string): Promise<void>;
	/** Destroy widget and cleanup */
	destroy(): Promise<void>;
	/** E5: subscribe to live quote fan-out (batch ≥250ms); returns unsubscribe */
	subscribeQuotes(symbols: string[], onQuotes: (updates: Array<{ symbol: string; price?: number; change?: number; changePercent?: number }>) => void): Promise<() => Promise<void>>;
	/** Check if widget is ready */
	isReady(): boolean;
	/** Get widget version */
	getVersion(): string | null;
}

/** E4: typed embed error — `{code, recoverable, detail}` for the host matrix. */
export class EmbedError extends Error {
	readonly code: string;
	readonly recoverable: boolean;
	readonly detail?: string;

	constructor(code: string, message: string, recoverable = true, detail?: string) {
		super(message);
		this.name = "EmbedError";
		this.code = code;
		this.recoverable = recoverable;
		this.detail = detail;
	}
}

/** Default configuration */
const DEFAULT_CONFIG: Partial<HostSDKConfig> = {
	allowedOrigins: DEFAULT_ALLOWED_ORIGINS,
	connectionTimeout: 10000,
	// E4: fail fast by default; slow ops (initialize/captureSnapshot) opt out.
	requestTimeout: 5000,
};

/**
 * Host SDK for controlling VNInvestCharts widget in an iframe
 */
export class VNInvestChartsHostSDK {
	private config: Required<HostSDKConfig>;
	private iframe: HTMLIFrameElement;
	private bridge: IframeBridge | null = null;
	private isReady = false;
	private version: string | null = null;
	private capabilities: string[] = [];
	private readyPromise: Promise<void> | null = null;
	private readyResolve: (() => void) | null = null;
	private eventListeners = new Map<string, Set<(payload: any) => void>>();

	constructor(config: HostSDKConfig) {
		this.config = { ...DEFAULT_CONFIG, ...config } as Required<HostSDKConfig>;

		// Resolve iframe element
		if (typeof config.iframe === "string") {
			const element = document.querySelector<HTMLIFrameElement>(config.iframe);
			if (!element) {
				throw new Error(`Iframe not found: ${config.iframe}`);
			}
			this.iframe = element;
		} else {
			this.iframe = config.iframe;
		}

		// Create ready promise
		this.readyPromise = new Promise((resolve) => {
			this.readyResolve = resolve;
		});
	}

	/**
	 * Connect to the iframe widget
	 */
	async connect(): Promise<void> {
		if (this.bridge) {
			return; // Already connected
		}

		// Wait for iframe to load
		await this.waitForIframeLoad();

		// Create bridge
		this.bridge = createHostBridge(this.iframe, this.config.allowedOrigins, {
			requestTimeout: this.config.requestTimeout,
			onReady: () => this.handleReady(),
			onError: (error) => this.config.onError?.(error),
		});

		// Set up event handler
		this.bridge.setMessageHandler((event) => this.handleEvent(event));

		// Wait for ready signal with timeout
		try {
			await Promise.race([
				this.readyPromise!,
				new Promise<never>((_, reject) =>
					setTimeout(() => reject(new Error("Connection timeout")), this.config.connectionTimeout)
				),
			]);
		} catch (error) {
			this.disconnect();
			throw error;
		}
	}

	/**
	 * Wait for iframe to finish loading
	 */
	private waitForIframeLoad(): Promise<void> {
		return new Promise((resolve, reject) => {
			if (this.iframe.contentDocument?.readyState === "complete") {
				resolve();
				return;
			}

			const onLoad = () => {
				this.iframe.removeEventListener("load", onLoad);
				resolve();
			};

			const onError = () => {
				this.iframe.removeEventListener("load", onLoad);
				reject(new Error("Iframe failed to load"));
			};

			this.iframe.addEventListener("load", onLoad);
			this.iframe.addEventListener("error", onError);
		});
	}

	/**
	 * Handle ready signal from iframe
	 */
	private handleReady(): void {
		this.isReady = true;
		this.readyResolve?.();
		this.readyResolve = null;
	}

	/**
	 * Handle incoming events from iframe
	 */
	private handleEvent(event: IframeToHostEvent): void {
		// Update version/capabilities from ready event
		if (event.type === "event:ready") {
			this.version = event.payload.version;
			this.capabilities = event.payload.capabilities;
			this.config.onReady?.({ version: this.version, capabilities: this.capabilities });
			return;
		}

		// Emit to generic event listeners
		const listeners = this.eventListeners.get(event.type);
		if (listeners) {
			for (const listener of listeners) {
				try {
					listener(event.payload);
				} catch (error) {
					console.error(`[HostSDK] Event listener error for ${event.type}:`, error);
				}
			}
		}

		// Call generic onEvent callback
		this.config.onEvent?.(event);
	}

	/**
	 * Get the widget controller API
	 */
	getController(): WidgetController {
		if (!this.bridge) {
			throw new Error("Not connected. Call connect() first.");
		}

		const bridge = this.bridge;

		// E4: failures surface as typed EmbedErrors ({code, recoverable}).
		const toEmbedError = (command: HostToIframeCommand, message: string): EmbedError => {
			const code = message.startsWith("Request timeout") ? "BRIDGE_TIMEOUT" : "COMMAND_FAILED";
			return new EmbedError(code, message, true, command.type);
		};

		// Helper to send command and discard response (for void-returning methods)
		const sendVoid = async (command: HostToIframeCommand, timeoutMs?: number): Promise<void> => {
			try {
				const response = await bridge.sendCommand(command, timeoutMs);
				if (!response.success) {
					throw new Error((response as { error?: string }).error || "Command failed");
				}
			} catch (error) {
				if (error instanceof EmbedError) throw error;
				throw toEmbedError(command, error instanceof Error ? error.message : String(error));
			}
		};

		// Helper to send command and extract data from response
		const sendWithData = async <T>(command: HostToIframeCommand, extractor: (payload: any) => T, timeoutMs?: number): Promise<T> => {
			try {
				const response = await bridge.sendCommand(command, timeoutMs);
				if (!response.success) {
					throw new Error((response as { error?: string }).error || "Command failed");
				}
				return extractor(response);
			} catch (error) {
				if (error instanceof EmbedError) throw error;
				throw toEmbedError(command, error instanceof Error ? error.message : String(error));
			}
		};

		return {
			initialize: (config: WidgetConfig) =>
				sendWithData(
					{
						type: "request:initialize",
						correlationId: `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
						timestamp: Date.now(),
						origin: window.location.origin,
						payload: config,
					},
					(payload) => ({ widgetId: (payload as { widgetId: string }).widgetId }),
					30000
				),

			setSymbol: (symbol: string) =>
				sendVoid({
					type: "request:setSymbol",
					correlationId: `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
					timestamp: Date.now(),
					origin: window.location.origin,
					payload: { symbol },
				}),

			setTimeframe: (timeframe: string) =>
				sendVoid({
					type: "request:setTimeframe",
					correlationId: `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
					timestamp: Date.now(),
					origin: window.location.origin,
					payload: { timeframe },
				}),

			setRange: (range: string) =>
				sendVoid({
					type: "request:setRange",
					correlationId: `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
					timestamp: Date.now(),
					origin: window.location.origin,
					payload: { range },
				}),

			setTheme: (theme: "light" | "dark") =>
				sendVoid({
					type: "request:setTheme",
					correlationId: `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
					timestamp: Date.now(),
					origin: window.location.origin,
					payload: { theme },
				}),

			setDrawings: (drawings: readonly any[]) =>
				sendVoid({
					type: "request:setDrawings",
					correlationId: `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
					timestamp: Date.now(),
					origin: window.location.origin,
					payload: { drawings },
				}),

			addDrawing: (drawing: any) =>
				sendVoid({
					type: "request:addDrawing",
					correlationId: `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
					timestamp: Date.now(),
					origin: window.location.origin,
					payload: { drawing },
				}),

			removeDrawing: (drawingId: string) =>
				sendVoid({
					type: "request:removeDrawing",
					correlationId: `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
					timestamp: Date.now(),
					origin: window.location.origin,
					payload: { drawingId },
				}),

			updateDrawing: (drawingId: string, updates: Partial<any>) =>
				sendVoid({
					type: "request:updateDrawing",
					correlationId: `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
					timestamp: Date.now(),
					origin: window.location.origin,
					payload: { drawingId, updates },
				}),

			setActiveTool: (tool: string) =>
				sendVoid({
					type: "request:setActiveTool",
					correlationId: `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
					timestamp: Date.now(),
					origin: window.location.origin,
					payload: { tool },
				}),

			setDockTab: (tab: string) =>
				sendVoid({
					type: "request:setDockTab",
					correlationId: `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
					timestamp: Date.now(),
					origin: window.location.origin,
					payload: { tab },
				}),

			setWatchlist: (symbols: string[]) =>
				sendVoid({
					type: "request:setWatchlist",
					correlationId: `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
					timestamp: Date.now(),
					origin: window.location.origin,
					payload: { symbols },
				}),

			exportDrawings: () =>
				sendWithData(
					{
						type: "request:exportDrawings",
						correlationId: `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
						timestamp: Date.now(),
						origin: window.location.origin,
						payload: {},
					},
					(payload) => (payload as { drawings: import("@vninvestcharts/engine-drawing").DrawingObject[] }).drawings
				),

			getVisibleRange: () =>
				sendWithData(
					{
						type: "request:getVisibleRange",
						correlationId: `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
						timestamp: Date.now(),
						origin: window.location.origin,
						payload: {},
					},
					(payload) => (payload as { range: { startIndex: number; endIndex: number; startDate: string; endDate: string; barCount: number } | null }).range
				),

			getPaneSnapshots: () =>
				sendWithData(
					{
						type: "request:getPaneSnapshots",
						correlationId: `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
						timestamp: Date.now(),
						origin: window.location.origin,
						payload: {},
					},
					(payload) => (payload as { snapshots: import("../utils/widgetHelpers").WidgetPaneRuntimeSnapshot[] }).snapshots
				),

			captureSnapshot: (format?: "png" | "jpeg", quality?: number) =>
				sendWithData(
					{
						type: "request:captureSnapshot",
						correlationId: `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
						timestamp: Date.now(),
						origin: window.location.origin,
						payload: { format, quality },
					},
					(payload) => (payload as { dataUrl: string }).dataUrl,
					30000
				),

			toggleFullscreen: () =>
				sendVoid({
					type: "request:toggleFullscreen",
					correlationId: `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
					timestamp: Date.now(),
					origin: window.location.origin,
					payload: {},
				}),

			setLocale: (locale: string) =>
				sendVoid({
					type: "request:setLocale",
					correlationId: `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
					timestamp: Date.now(),
					origin: window.location.origin,
					payload: { locale },
				}),

			setTimezone: (timezone: string) =>
				sendVoid({
					type: "request:setTimezone",
					correlationId: `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
					timestamp: Date.now(),
					origin: window.location.origin,
					payload: { timezone },
				}),

			destroy: () =>
				sendVoid({
					type: "request:destroy",
					correlationId: `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
					timestamp: Date.now(),
					origin: window.location.origin,
					payload: {},
				}),

			subscribeQuotes: async (symbols: string[], onQuotes: (updates: Array<{ symbol: string; price?: number; change?: number; changePercent?: number }>) => void) => {
				await sendVoid({
					type: "request:subscribeQuotes",
					correlationId: `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
					timestamp: Date.now(),
					origin: window.location.origin,
					payload: { symbols },
				});
				const offEvent = this.on("event:quotes", (payload) => {
					onQuotes(payload.updates ?? []);
				});
				let unsubscribed = false;
				return async () => {
					if (unsubscribed) return;
					unsubscribed = true;
					offEvent();
					await sendVoid({
						type: "request:unsubscribeQuotes",
						correlationId: `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
						timestamp: Date.now(),
						origin: window.location.origin,
						payload: { symbols },
					});
				};
			},

			isReady: () => this.isReady,
			getVersion: () => this.version,
		};
	}

	/**
	 * Subscribe to specific event types
	 */
	on<K extends IframeToHostEvent["type"]>(eventType: K, listener: (payload: Extract<IframeToHostEvent, { type: K }>["payload"]) => void): () => void {
		if (!this.eventListeners.has(eventType)) {
			this.eventListeners.set(eventType, new Set());
		}
		this.eventListeners.get(eventType)!.add(listener);

		// Return unsubscribe function
		return () => {
			this.eventListeners.get(eventType)?.delete(listener);
		};
	}

	/**
	 * Disconnect and cleanup
	 */
	disconnect(): void {
		if (this.bridge) {
			this.bridge.destroy();
			this.bridge = null;
		}
		this.isReady = false;
		this.version = null;
		this.capabilities = [];
		this.config.onDisconnect?.();
	}

	/**
	 * Check if connected and ready
	 */
	get connected(): boolean {
		return this.bridge !== null && this.isReady;
	}
}

/**
 * Convenience function to create and connect Host SDK in one call
 */
export async function createVNInvestChartsHost(config: HostSDKConfig): Promise<VNInvestChartsHostSDK> {
	const sdk = new VNInvestChartsHostSDK(config);
	await sdk.connect();
	return sdk;
}

// NOTE: the useVNInvestChartsHost React hook lives in ./useVNInvestChartsHost
// (separate module so non-React hosts never import React). It is re-exported
// from ./index for host apps.