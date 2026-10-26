/**
 * WP-11: Iframe Bridge - Host ↔ Iframe Communication Layer
 *
 * Handles postMessage communication with:
 * - Origin validation against allowlist
 * - Request/response correlation
 * - Event emission
 * - Automatic cleanup
 */

import {
	HostToIframeCommand,
	IframeToHostEvent,
	RequestMessage,
	ResponseMessage,
	EventMessage,
	WidgetConfig,
	AdapterConfig,
	ResponsePayload,
	generateCorrelationId,
	createRequest,
	createResponse,
	createEvent,
	isHostToIframeCommand,
	isIframeToHostEvent,
	isResponseMessage,
} from "./messageProtocol";

// Re-export types for consumers
export type {
	HostToIframeCommand,
	IframeToHostEvent,
	RequestMessage,
	ResponseMessage,
	EventMessage,
	WidgetConfig,
	AdapterConfig,
	ResponsePayload,
} from "./messageProtocol";

export { generateCorrelationId, createRequest, createResponse, createEvent, isHostToIframeCommand, isIframeToHostEvent } from "./messageProtocol";

/** Allowed origins for postMessage security */
export interface AllowedOriginsConfig {
	/** List of allowed origins (exact match or wildcard patterns) */
	allowedOrigins: string[];
	/** Whether to allow any origin (DANGEROUS - only for development) */
	allowAnyOrigin?: boolean;
}

/**
 * Default allowed origins — override per deployment.
 * SECURITY: Remove `http://localhost` entries in production.
 */
export const DEFAULT_ALLOWED_ORIGINS: string[] = [
	"https://vninvestcharts.com",
	"https://app.vninvestcharts.com",
	"https://charts.vninvestcharts.com",
	"http://localhost:3000",
	"http://localhost:5173",
	"http://127.0.0.1:3000",
	"http://127.0.0.1:5173",
];

/**
 * SEC-01: origin allowlist matcher.
 *
 * Deliberately regex-free. A wildcard is only honoured as a leading subdomain
 * marker (`scheme://*.<rest>`), and the remainder is compared with plain string
 * equality. Compiling the pattern into a RegExp (the previous behaviour) let
 * every `.` act as "any character", so an allowlist entry for
 * `https:` + wildcard + `vninvestcharts.com` also accepted unrelated hosts.
 */
export function matchOriginPattern(pattern: string, origin: string): boolean {
	if (pattern === origin) return true;
	if (!pattern.includes("*")) return false;
	if (pattern === "*") return false; // only honoured via allowAnyOrigin
	const parts = pattern.split("*");
	if (parts.length !== 2) return false; // at most one wildcard
	const [prefix, suffix] = parts;
	if (!suffix.startsWith(".")) return false; // must be a subdomain boundary
	if (!prefix.endsWith("//")) return false; // must be a full scheme + host
	// Reject look-alike suffixes: the remainder of the host must be identical.
	if (!origin.startsWith(prefix)) return false;
	const host = origin.slice(prefix.length);
	// `host` may be "a.b.vninvestcharts.com" or exactly "vninvestcharts.com".
	return host === suffix.slice(1) || host.endsWith(suffix);
}

/** Message handler type */
export type MessageHandler = (message: IframeToHostEvent) => void;
/** Request handler type (for Iframe side) */
export type RequestHandler = (command: HostToIframeCommand) => Promise<ResponsePayload>;

/** Bridge configuration */
export interface BridgeConfig {
	/** Target window (iframe.contentWindow or window.parent) */
	targetWindow: Window;
	/** Target origin for sending messages */
	targetOrigin: string;
	/** Allowed origins for receiving messages */
	allowedOrigins: string[];
	/** Whether we are the Host (true) or Iframe (false) */
	isHost: boolean;
	/** Request timeout in ms */
	requestTimeout?: number;
	/** Callback when connection is established */
	onReady?: () => void;
	/** Callback on connection error */
	onError?: (error: Error) => void;
	/** Whether to allow any origin (DANGEROUS - only for development) */
	allowAnyOrigin?: boolean;
	/**
	 * SEC-01: maximum serialized size of an accepted inbound message.
	 * Oversized payloads are rejected before parsing or state mutation.
	 */
	maxPayloadBytes?: number;
	/**
	 * SEC-01: inbound message budget. Once more than `maxMessages` are accepted
	 * within `rateWindowMs`, further traffic is dropped until the window rolls.
	 */
	maxMessages?: number;
	rateWindowMs?: number;
}

/** Pending request entry */
interface PendingRequest {
	resolve: (value: ResponsePayload) => void;
	reject: (reason: Error) => void;
	timeout: ReturnType<typeof setTimeout>;
}

/**
 * Iframe Bridge - bidirectional postMessage communication
 */
export class IframeBridge {
	private config: BridgeConfig;
	private pendingRequests = new Map<string, PendingRequest>();
	private messageHandler: MessageHandler | null = null;
	private requestHandler: RequestHandler | null = null;
	private boundHandleMessage: (event: MessageEvent) => void;
	private isDestroyed = false;
	private readyPromise: Promise<void> | null = null;
	private readyResolve: (() => void) | null = null;
	/**
	 * Origin pinned from the first origin-allowlisted incoming message
	 * (iframe side). All outbound sends use it instead of the "*" fallback,
	 * so widget data is never broadcast to arbitrary windows once the host
	 * is known. Re-pinned on every validated message (allows host moves).
	 */
	private pinnedSendOrigin: string | null = null;
	/** SEC-01: sliding-window counters for the inbound rate limit. */
	private rateWindowStart = 0;
	private rateCount = 0;

	constructor(config: BridgeConfig) {
		if (config.allowAnyOrigin) {
			console.warn("[IframeBridge] allowAnyOrigin is ENABLED — origin validation disabled. This is UNSAFE for production.");
		}
		this.config = {
			requestTimeout: 30000,
			// SEC-01 defaults: 1 MB per message, 600 messages / 10s.
			maxPayloadBytes: 1_000_000,
			maxMessages: 600,
			rateWindowMs: 10_000,
			...config,
		};

		this.boundHandleMessage = this.handleMessage.bind(this);
		window.addEventListener("message", this.boundHandleMessage);

		// Create ready promise
		this.readyPromise = new Promise((resolve) => {
			this.readyResolve = resolve;
		});
	}

	/**
	 * Set handler for incoming events (Host side)
	 */
	setMessageHandler(handler: MessageHandler): void {
		this.messageHandler = handler;
	}

	/**
	 * Set handler for incoming requests (Iframe side)
	 */
	setRequestHandler(handler: RequestHandler): void {
		this.requestHandler = handler;
	}

	/**
	 * Resolve the target origin for outbound sends. Prefers the pinned
	 * validated origin; falls back to the configured targetOrigin ("*" only
	 * until the first allowlisted message arrives on the iframe side).
	 */
	private resolveSendOrigin(): string {
		return this.pinnedSendOrigin ?? this.config.targetOrigin;
	}

	/**
	 * Send a command to the other side
	 */
	async sendCommand<T extends HostToIframeCommand>(command: T, timeoutMs?: number): Promise<ResponsePayload> {
		if (this.isDestroyed) {
			throw new Error("Bridge is destroyed");
		}

		const correlationId = command.correlationId;

		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				this.pendingRequests.delete(correlationId);
				reject(new Error(`Request timeout: ${command.type}`));
			}, timeoutMs ?? this.config.requestTimeout);

			this.pendingRequests.set(correlationId, { resolve, reject, timeout });

			// Send message
			this.config.targetWindow.postMessage(command, this.resolveSendOrigin());
		});
	}

	/**
	 * Send an event (fire-and-forget)
	 */
	sendEvent(event: IframeToHostEvent): void {
		if (this.isDestroyed) return;
		this.config.targetWindow.postMessage(event, this.resolveSendOrigin());
	}

	/**
	 * Send a response to a request
	 */
	sendResponse(request: RequestMessage, payload: ResponsePayload, success = true, error?: string): void {
		if (this.isDestroyed) return;

		const response: ResponseMessage = {
			type: `response:${request.type.replace("request:", "")}` as any, // ARC-1-keep: legacy bridge
			correlationId: request.correlationId,
			timestamp: Date.now(),
			origin: typeof window !== "undefined" ? window.location.origin : "unknown",
			payload,
			success,
			error,
		};

		this.config.targetWindow.postMessage(response, this.resolveSendOrigin());
	}

	/**
	 * Wait for the bridge to be ready (Iframe side)
	 */
	async waitForReady(): Promise<void> {
		return this.readyPromise!;
	}

	/**
	 * Signal that Iframe is ready (Iframe side)
	 */
	signalReady(version: string, capabilities: string[]): void {
		if (this.readyResolve) {
			this.readyResolve();
			this.readyResolve = null;
		}

		this.sendEvent({
			type: "event:ready",
			correlationId: generateCorrelationId(),
			timestamp: Date.now(),
			origin: typeof window !== "undefined" ? window.location.origin : "unknown",
			payload: { version, capabilities },
		});
	}

	/**
	 * Validate message origin against allowlist.
	 *
	 * SEC-01: wildcard patterns are matched as PLAIN STRINGS, never compiled into
	 * a RegExp. The previous implementation replaced every `*` with `.*` and then
	 * ran `new RegExp`, which left every `.` unescaped, so a pattern like
	 * `https:` + wildcard-subdomain + `vninvestcharts.com` also matched origins
	 * such as `https://evilvninvestchartsXcom`. Only a leading subdomain
	 * wildcard is supported and it must sit on a scheme boundary.
	 */
	private isOriginAllowed(origin: string): boolean {
		if (this.config.allowedOrigins.includes("*") || this.config.allowAnyOrigin) {
			return true;
		}
		if (typeof origin !== "string" || origin === "" || origin === "null") {
			// A literal "null" origin (sandboxed/file:// parent) must be listed
			// explicitly as the string "null"; an empty origin never passes.
			return origin === "null" && this.config.allowedOrigins.includes("null");
		}
		return this.config.allowedOrigins.some((allowed) => matchOriginPattern(allowed, origin));
	}

	/** SEC-01: counters for rejected traffic — surfaced for tests/monitoring. */
	readonly stats = { rejectedOrigin: 0, rejectedSize: 0, rejectedRate: 0, accepted: 0 };

	/**
	 * SEC-01: size + rate gate, applied after the origin is trusted so that
	 * hostile origins are not charged against the budget.
	 */
	private passesTrafficBudget(data: unknown): boolean {
		const maxBytes = this.config.maxPayloadBytes ?? 1_000_000;
		if (maxBytes > 0) {
			let size = 0;
			try {
				size = typeof data === "string" ? data.length : JSON.stringify(data)?.length ?? 0;
			} catch {
				// Unserialisable payload (circular / hostile getter) — reject.
				this.stats.rejectedSize++;
				return false;
			}
			if (size > maxBytes) {
				this.stats.rejectedSize++;
				return false;
			}
		}

		const maxMessages = this.config.maxMessages ?? 600;
		const windowMs = this.config.rateWindowMs ?? 10_000;
		if (maxMessages > 0) {
			const now = Date.now();
			if (now - this.rateWindowStart >= windowMs) {
				this.rateWindowStart = now;
				this.rateCount = 0;
			}
			if (this.rateCount >= maxMessages) {
				this.stats.rejectedRate++;
				return false;
			}
			this.rateCount++;
		}
		return true;
	}

	/**
	 * Handle incoming postMessage
	 */
	private handleMessage(event: MessageEvent): void {
		if (this.isDestroyed) return;

		// Validate origin
		if (!this.isOriginAllowed(event.origin)) {
			this.stats.rejectedOrigin++;
			console.warn(`[IframeBridge] Rejected message from unauthorized origin: ${event.origin}`);
			return;
		}

		// SEC-01: Host side must REJECT a mismatch, not merely warn. Previously a
		// frame from an unexpected origin passed through as long as the frame was
		// on the receive allowlist.
		if (this.config.isHost && this.config.targetOrigin !== "*" && event.origin !== this.config.targetOrigin) {
			this.stats.rejectedOrigin++;
			console.warn(`[IframeBridge] Rejected: origin ${event.origin} != expected ${this.config.targetOrigin}`);
			return;
		}

		if (!this.passesTrafficBudget(event.data)) {
			return;
		}
		this.stats.accepted++;

		// Pin the validated origin for outbound sends (iframe side). This
		// closes the "*" broadcast window as soon as the host is known.
		if (!this.config.isHost && event.origin !== "null" && event.origin !== "") {
			this.pinnedSendOrigin = event.origin;
		}

		const message = event.data;

		// Handle response to our request
		if (isResponseMessage(message)) {
			const pending = this.pendingRequests.get(message.correlationId);
			if (pending) {
				clearTimeout(pending.timeout);
				this.pendingRequests.delete(message.correlationId);
				if (message.success) {
					pending.resolve(message.payload);
				} else {
					pending.reject(new Error(message.error || "Unknown error"));
				}
			}
			return;
		}

		// Handle incoming request (Iframe side)
		if (isHostToIframeCommand(message) && this.requestHandler) {
			this.requestHandler(message)
				.then((payload) => this.sendResponse(message, payload, true))
				.catch((error) => this.sendResponse(message, { success: false, error: error.message }, false, error.message));
			return;
		}

		// Handle incoming event (Host side)
		if (isIframeToHostEvent(message) && this.messageHandler) {
			this.messageHandler(message);
			return;
		}

		// Unknown message type
		console.warn("[IframeBridge] Received unknown message type:", message?.type);
	}

	/**
	 * Destroy the bridge and cleanup
	 */
	destroy(): void {
		if (this.isDestroyed) return;
		this.isDestroyed = true;

		// Remove event listener
		window.removeEventListener("message", this.boundHandleMessage);

		// Reject all pending requests
		for (const [, pending] of this.pendingRequests) {
			clearTimeout(pending.timeout);
			pending.reject(new Error("Bridge destroyed"));
		}
		this.pendingRequests.clear();

		// Clear handlers
		this.messageHandler = null;
		this.requestHandler = null;
		this.readyResolve = null;
	}
}

/**
 * Create Host-side bridge (parent page embedding iframe)
 */
export function createHostBridge(
	iframe: HTMLIFrameElement,
	allowedOrigins: string[] = DEFAULT_ALLOWED_ORIGINS,
	options: Partial<BridgeConfig> = {}
): IframeBridge {
	// Fail closed: a missing src means we cannot derive the expected origin,
	// and falling back to "*" would broadcast host commands to any listener.
	const src = iframe.src;
	if (!src || src.trim() === "") {
		throw new Error(
			"[IframeBridge] Cannot create host bridge: iframe has no src. " +
			"Set the iframe src before connecting so the expected origin can be derived."
		);
	}
	return new IframeBridge({
		targetWindow: iframe.contentWindow!,
		targetOrigin: new URL(src).origin,
		allowedOrigins,
		isHost: true,
		...options,
	});
}

/**
 * Create Iframe-side bridge (widget inside iframe)
 */
export function createIframeBridge(
	allowedOrigins: string[] = DEFAULT_ALLOWED_ORIGINS,
	options: Partial<BridgeConfig> = {}
): IframeBridge {
	return new IframeBridge({
		targetWindow: window.parent,
		// "*" only until the first allowlisted message arrives; afterwards all
		// sends use the pinned validated origin (see pinnedSendOrigin).
		targetOrigin: "*",
		allowedOrigins,
		isHost: false,
		...options,
	});
}